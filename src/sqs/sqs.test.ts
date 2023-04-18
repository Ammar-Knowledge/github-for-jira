/* eslint-disable jest/no-done-callback,@typescript-eslint/no-explicit-any */
import { SqsQueue } from "./sqs";
import { v4 as uuidv4 } from "uuid";
import { waitUntil } from "test/utils/wait-until";
import { statsd }  from "config/statsd";
import { sqsQueueMetrics } from "config/metric-names";
import { Request as AwsRequest } from "aws-sdk";
import { BaseMessagePayload, SQSMessageContext } from "~/src/sqs/sqs.types";
import { preemptiveRateLimitCheck } from "utils/preemptive-rate-limit";
import { when } from "jest-when";
import { booleanFlag, BooleanFlags } from "config/feature-flags";

jest.mock("config/feature-flags");
jest.mock("utils/preemptive-rate-limit");

const delay = (time: number) => new Promise(resolve => setTimeout(resolve, time));

describe("SQS", () => {
	let mockRequestHandler: jest.Mock;
	let mockErrorHandler: jest.Mock;
	let testMaxQueueAttempts = 3;
	let queue: SqsQueue<BaseMessagePayload>;
	let payload;

	let TEST_QUEUE_URL:string;
	let TEST_QUEUE_REGION:string;
	const TEST_QUEUE_NAME = "test";

	let createSqsQueue: (timeout: number, maxAttempts?: number) => SqsQueue<BaseMessagePayload>;

	beforeEach(() => {
		TEST_QUEUE_URL = testEnvVars.SQS_TEST_QUEUE_URL;
		TEST_QUEUE_REGION = testEnvVars.SQS_TEST_QUEUE_REGION;
		mockRequestHandler = jest.fn();
		mockErrorHandler = jest.fn();
		testMaxQueueAttempts = 3;
		payload = { msg: uuidv4() };
		createSqsQueue = (timeout: number, maxAttempts: number = testMaxQueueAttempts) =>
			new SqsQueue({
				queueName: TEST_QUEUE_NAME,
				queueUrl: TEST_QUEUE_URL,
				queueRegion: TEST_QUEUE_REGION,
				longPollingIntervalSec: 0,
				timeoutSec: timeout,
				maxAttempts: maxAttempts
			},
			mockRequestHandler,
			mockErrorHandler);
		when(jest.mocked(preemptiveRateLimitCheck))
			.calledWith(expect.anything(), expect.anything()) .mockResolvedValue({ isExceedThreshold: false });

		when(booleanFlag).calledWith(
			BooleanFlags.REMOVE_STALE_MESSAGES,
			expect.anything()
		).mockResolvedValue(true);
	});

	afterEach(async () => {
		if (queue) {
			await queue.stop();
			await queue.purgeQueue();
		}
		queue = undefined as any;
	});

	describe("Normal execution tests", () => {
		let statsdIncrementSpy;

		beforeEach(async () => {
			statsdIncrementSpy = jest.spyOn(statsd, "increment");
			queue = createSqsQueue(10);
			queue.start();
			await queue.purgeQueue();
			mockErrorHandler.mockReturnValue({ retryable: false, isFailure: true });
		});

		it("Message gets received", async () => {
			await queue.sendMessage(payload);
			await waitUntil(async () => expect(mockRequestHandler).toBeCalledTimes(1));
			expect(mockRequestHandler).toBeCalledWith(expect.objectContaining({ payload }));
		});

		it("Queue is restartable", async () => {
			await queue.stop();
			queue.start();
			await queue.sendMessage(payload);
			await waitUntil(async () => expect(mockRequestHandler).toBeCalledTimes(1));
			expect(mockRequestHandler).toBeCalledWith(expect.objectContaining({ payload }));
		});

		it("Message received with delay", async () => {
			const startTime = Date.now();
			await queue.sendMessage(payload, 1);
			await waitUntil(async () => expect(mockRequestHandler).toHaveBeenCalledTimes(1));
			expect(Date.now() - startTime).toBeGreaterThanOrEqual(1000);
		});

		it("Message send with the maximum delay if bigger delay specified", async () => {

			const sendMessageSpy = jest.spyOn(queue.sqs, "sendMessage");
			const request: AwsRequest<any, any> = { promise: () => Promise.resolve({ MessageId: "123" }) } as any;
			sendMessageSpy.mockReturnValue(request);
			await queue.sendMessage(payload, 123423453);

			await expect(sendMessageSpy).toBeCalledWithDelaySec(899);
		});

		it("Message send with the specified delay", async () => {

			const sendMessageSpy = jest.spyOn(queue.sqs, "sendMessage");
			const request: AwsRequest<any, any> = { promise: () => Promise.resolve({ MessageId: "123" }) } as any;
			sendMessageSpy.mockReturnValue(request);
			await queue.sendMessage(payload, 64);

			await expect(sendMessageSpy).toBeCalledWithDelaySec(64);
		});

		it("Message gets executed exactly once", async () => {
			await queue.sendMessage(payload);
			const time = Date.now();
			await delay(1000);
			await waitUntil(async () => expect(mockRequestHandler).toHaveBeenCalledTimes(1));
			expect(mockRequestHandler).toBeCalledWith(expect.objectContaining({ payload }));
			expect(Date.now() - time).toBeGreaterThanOrEqual(1000); // wait 1 second to make sure everything's processed
		});

		it("Messages are not processed in parallel", async () => {
			// call takes 1 second to finish
			mockRequestHandler.mockImplementation(() => delay(1000));
			const time = Date.now();
			// Sending 2 messages in parallel
			await Promise.all([
				queue.sendMessage(payload),
				queue.sendMessage(payload)
			]);
			await waitUntil(async () => expect(mockRequestHandler).toHaveBeenCalledTimes(2));
			await expect(mockRequestHandler).toHaveResolved();
			expect(Date.now() - time).toBeGreaterThanOrEqual(2000);
		});

		describe.each([1, 1.8])("Timeout tests", (timeout) => {
			it(`Retries with the correct delay for timeout ${timeout}s`, async () => {
				mockRequestHandler.mockRejectedValueOnce("Something bad happened");
				mockErrorHandler.mockReturnValue({ retryable: true, retryDelaySec: timeout, isFailure: true });
				const time = Date.now();
				await queue.sendMessage(payload);
				await waitUntil(async () => expect(mockRequestHandler).toHaveBeenCalledTimes(2));
				await expect(mockRequestHandler).toHaveResolvedTimes(1);
				expect(Date.now() - time).toBeGreaterThanOrEqual(timeout * 1000);
			});
		});

		it("Message deleted from the queue when unretryable", async () => {
			const queueDeletionSpy = jest.spyOn(queue.sqs, "deleteMessage");
			mockRequestHandler.mockRejectedValue("Something bad happened");
			mockErrorHandler.mockReturnValue({ retryable: false, isFailure: true });
			await queue.sendMessage(payload);
			await waitUntil(async () => {
				expect(mockErrorHandler).toHaveBeenCalledTimes(1);
				expect(queueDeletionSpy).toBeCalledTimes(1);
			});
			expect(statsdIncrementSpy).toBeCalledWith(sqsQueueMetrics.failed, expect.anything());
		});

		it("Message deleted from the queue when error is not a failure and failure metric not sent", async () => {
			const queueDeletionSpy = jest.spyOn(queue.sqs, "deleteMessage");
			mockRequestHandler.mockRejectedValue("Something bad happened");
			mockErrorHandler.mockReturnValue({ isFailure: false });
			await queue.sendMessage(payload);
			await waitUntil(async () => expect(queueDeletionSpy).toBeCalledTimes(1));
			expect(statsdIncrementSpy).not.toBeCalledWith(sqsQueueMetrics.failed, expect.anything());
		});
	});

	describe("Rate limiting checks", () => {
		beforeEach(async () => {
			queue = createSqsQueue(10);
			queue.start();
			await queue.purgeQueue();
			mockErrorHandler.mockReturnValue({ retryable: false, isFailure: true });
		});
		it("Message gets executed when limit not exceeded", async () => {
			when(jest.mocked(preemptiveRateLimitCheck))
				.calledWith(expect.anything(), expect.anything()).mockResolvedValue({ isExceedThreshold: false });
			await queue.sendMessage(payload);
			const time = Date.now();
			await delay(2000);
			await waitUntil(async () => expect(mockRequestHandler).toHaveBeenCalled());
			expect(mockRequestHandler).toBeCalledWith(expect.objectContaining({ payload }));
			expect(Date.now() - time).toBeGreaterThanOrEqual(1000); // wait 1 second to make sure everything's processed
		});
		it("Message NOT executed when limit exceeded", async () => {
			when(jest.mocked(preemptiveRateLimitCheck))
				.calledWith(expect.anything(), expect.anything()).mockResolvedValue({ isExceedThreshold: true, resetTimeInSeconds: 123 });
			const queueSendSpy = jest.spyOn(queue.sqs, "sendMessage");
			const queueDeletionSpy = jest.spyOn(queue.sqs, "deleteMessage");
			await queue.sendMessage(payload);
			const time = Date.now();
			await delay(2000);
			await waitUntil(async () => expect(mockRequestHandler).toHaveBeenCalledTimes(0));
			await waitUntil(async () => expect(queueDeletionSpy).toBeCalledTimes(1));
			await waitUntil(async () => expect(queueSendSpy).toBeCalledWith(expect.objectContaining({
				DelaySeconds: 123,
				MessageBody: JSON.stringify({ ...payload, rateLimited: true })
			})));
			expect(Date.now() - time).toBeGreaterThanOrEqual(1000); // wait 1 second to make sure everything's processed
		});
	});

	describe("Timeouts tests", () => {
		beforeEach(() => {
			queue = createSqsQueue(1);
			queue.start();
		});

		it("Receive Count and Max Attempts are populated correctly", async () => {
			mockRequestHandler.mockRejectedValue("Something bad happened");
			mockErrorHandler
				.mockReturnValueOnce({
					retryable: true,
					retryDelaySec: 0,
					isFailure: true
				})
				.mockReturnValueOnce({
					retryable: true,
					retryDelaySec: 0,
					isFailure: true
				})
				.mockReturnValueOnce({
					retryable: false,
					retryDelaySec: 0,
					isFailure: true
				});

			await queue.sendMessage(payload);
			await waitUntil(async () => expect(mockRequestHandler).toHaveBeenCalledTimes(3));
			expect(mockRequestHandler).lastCalledWith(expect.objectContaining({
				receiveCount: 3,
				lastAttempt: true
			}));
		});
	});

	describe("deleteStaleMessages", () => {

		// Mock the SQSMessageContext object
		const context = {
			log: {
				warn: jest.fn(),
				error: jest.fn()
			}
		} as unknown as SQSMessageContext<BaseMessagePayload>;

		beforeEach(() => {
			queue = createSqsQueue(1);
			queue.start();
			when(booleanFlag).calledWith(
				BooleanFlags.REMOVE_STALE_MESSAGES,
				expect.anything()
			).mockResolvedValue(true);
		});

		// Test case for when feature flag is turned off
		it("should return false when feature flag is false", async () => {
			when(booleanFlag).calledWith(
				BooleanFlags.REMOVE_STALE_MESSAGES,
				expect.anything()
			).mockResolvedValue(false);
			const message = {
				Body: JSON.stringify({
					webhookReceived: Date.now() - 2 * 24 * 60 * 60 * 1000 // Two days ago
				}),
				MessageId: "12345"
			};

			const result = await queue.deleteStaleMessages(message, context, jiraHost);
			expect(result).toBe(false);
		});

		// Test case for when the message is not from the targeted queue
		it("should return false when message is not from targeted queue", async () => {
			const message = {
				Body: JSON.stringify({}),
				MessageId: "12345"
			};
			const result = await queue.deleteStaleMessages(message, context, jiraHost);
			expect(result).toBe(false);
		});

		// Test case for when the message does not have a body
		it("should return false when message has no body", async () => {
			const message = {
				MessageId: "12345"
			};
			const result = await queue.deleteStaleMessages(message, context, jiraHost);
			expect(result).toBe(false);
		});

		// Test case for when the message is from the targeted queue and is stale
		it("should delete stale message and return true", async () => {
			const message = {
				Body: JSON.stringify({
					webhookReceived: Date.now() - 2 * 24 * 60 * 60 * 1000 // Two days ago
				}),
				MessageId: "12345"
			};
			const deleteMessage = jest.fn();
			const mockThis = {
				queueName: "deployment",
				deleteMessage
			};
			const result = await queue.deleteStaleMessages.call(mockThis, message, context, jiraHost);
			expect(result).toBe(true);
			expect(deleteMessage).toHaveBeenCalledWith(context);
			expect(context.log.warn).toHaveBeenCalledWith(
				{ deletedMessageId: "12345" },
				"Deleted stale message from deployment queue"
			);
		});

		// Test case for when the message is from the targeted queue and is not stale
		it("should return false when message is not stale", async () => {
			const message = {
				Body: JSON.stringify({
					webhookReceived: Date.now() - 12 * 60 * 60 * 1000 // 12 hours ago
				}),
				MessageId: "12345"
			};
			const result = await queue.deleteStaleMessages(message, context, jiraHost);
			expect(result).toBe(false);
		});

		// Test case for when deleting the message fails
		it("should return false and log an error when deleting the message fails", async () => {
			const message = {
				Body: JSON.stringify({
					webhookReceived: Date.now() - 2 * 24 * 60 * 60 * 1000 // Two days ago
				}),
				MessageId: "12345"
			};
			const deleteMessage = jest.fn().mockRejectedValue(new Error("Failed to delete message"));
			const mockThis = {
				queueName: "deployment",
				deleteMessage
			};
			const result = await queue.deleteStaleMessages.call(mockThis, message, context, jiraHost);
			expect(result).toBe(false);
			expect(deleteMessage).toHaveBeenCalledWith(context);
			expect(context.log.error).toHaveBeenCalledWith(
				{ error: expect.any(Error), deletedMessageId: "12345" },
				"Failed to delete stale message from deployment queue"
			);
		});
	});
});
