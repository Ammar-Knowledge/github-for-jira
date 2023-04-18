import AWS from "aws-sdk";
import Logger from "bunyan";
import { defaultLogLevel, getLogger } from "config/logger";
import SQS, { ChangeMessageVisibilityRequest, DeleteMessageRequest, Message, ReceiveMessageResult, SendMessageRequest } from "aws-sdk/clients/sqs";
import { v4 as uuidv4 } from "uuid";
import { statsd } from "config/statsd";
import { Tags } from "hot-shots";
import { sqsQueueMetrics } from "config/metric-names";
import { ErrorHandler, ErrorHandlingResult, MessageHandler, QueueSettings, SQSContext, SQSMessageContext, BaseMessagePayload, SqsTimeoutError } from "~/src/sqs/sqs.types";
import { booleanFlag, BooleanFlags, stringFlag, StringFlags } from "config/feature-flags";
import { preemptiveRateLimitCheck } from "utils/preemptive-rate-limit";

//Maximum SQS Delay according to SQS docs https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-delay-queues.html
const MAX_MESSAGE_DELAY_SEC: number = 15 * 60;

//Maximum SQS Visibility Timeout according to docs https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html
const MAX_MESSAGE_VISIBILITY_TIMEOUT_SEC: number = 12 * 60 * 60 - 1;
const DEFAULT_LONG_POLLING_INTERVAL = 4;
const PROCESSING_DURATION_HISTOGRAM_BUCKETS = "10_100_500_1000_2000_3000_5000_10000_30000_60000";
const EXTRA_VISIBILITY_TIMEOUT_DELAY = 2;
const ONE_DAY_MILLI = 24 * 60 * 60 * 1000;

const isNotAFailure = (errorHandlingResult: ErrorHandlingResult) => {
	return !errorHandlingResult.isFailure;
};

const isNotRetryable = (errorHandlingResult: ErrorHandlingResult) => {
	return !errorHandlingResult.retryable;
};

/**
 * Class which represents an SQS client for a single SQS queue.
 *
 * Allows sending SQS messages, as well as listening to the queue messages.
 */
export class SqsQueue<MessagePayload extends BaseMessagePayload> {
	readonly queueUrl: string;
	readonly queueName: string;
	readonly queueRegion: string;
	readonly longPollingIntervalSec: number;
	readonly timeoutSec: number;
	readonly maxAttempts: number;
	readonly errorHandler: ErrorHandler<MessagePayload>;
	readonly messageHandler: MessageHandler<MessagePayload>;
	readonly sqs: SQS;
	readonly log: Logger;
	readonly metricsTags: Tags;

	/**
	 * Context of the currently active listener, or the last active if the queue stopped
	 */
	listenerContext: SQSContext;

	public constructor(settings: QueueSettings, messageHandler: MessageHandler<MessagePayload>, errorHandler: ErrorHandler<MessagePayload>) {
		this.queueUrl = settings.queueUrl;
		this.queueName = settings.queueName;
		this.queueRegion = settings.queueRegion;
		this.longPollingIntervalSec = settings.longPollingIntervalSec !== undefined ? settings.longPollingIntervalSec : DEFAULT_LONG_POLLING_INTERVAL;
		this.sqs = new AWS.SQS({ apiVersion: "2012-11-05", region: settings.queueRegion });
		this.timeoutSec = settings.timeoutSec;
		this.maxAttempts = settings.maxAttempts;
		this.messageHandler = messageHandler;
		this.errorHandler = errorHandler;
		this.log = getLogger("sqs", {
			fields: { queue: this.queueName }
		});
		this.metricsTags = { queue: this.queueName };
	}

	/**
	 * Send message to the queue
	 */
	public async sendMessage(payload: MessagePayload, delaySec = 0, logger: Logger = this.log) {
		if (delaySec >= MAX_MESSAGE_DELAY_SEC) {
			delaySec = MAX_MESSAGE_DELAY_SEC - 1;
		}

		const params: SendMessageRequest = {
			MessageBody: JSON.stringify(payload),
			QueueUrl: this.queueUrl,
			DelaySeconds: delaySec
		};

		const sendMessageResult = await this.sqs.sendMessage(params)
			.promise();
		logger.info({ delaySeconds: delaySec, newMessageId: sendMessageResult.MessageId }, `Successfully added message to sqs queue messageId: ${sendMessageResult.MessageId}`);
		statsd.increment(sqsQueueMetrics.sent, this.metricsTags);
		return sendMessageResult;
	}

	/**
	 * Starts listening to the queue, times out in 1 minute
	 */
	public start() {

		//This checks if the previous listener was stopped or never created. However it could be that the
		//previous listener is stopped, but still processing its last message
		if (this.listenerContext && !this.listenerContext.stopped) {
			this.log.warn("Queue is already running");
			return;
		}

		//Every time we start a listener we create a separate ListenerContext object. There can be more than 1 listeners
		//running at the same time, if the previous listener still processing its last message
		this.listenerContext = { stopped: false, log: this.log.child({ sqsListenerId: uuidv4() }), listenerRunning: true };
		this.listenerContext.log.info({
			queueUrl: this.queueUrl,
			queueRegion: this.queueRegion,
			longPollingInterval: this.longPollingIntervalSec
		}, "Starting the queue");
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		this.listen(this.listenerContext);
	}


	/**
	 * Stops reading messages from the queue. When stopped it can't be resumed.
	 */
	public async stop() {
		if (!this.listenerContext || this.listenerContext.stopped) {
			this.log.warn("Queue is already stopped");
			return;
		}
		this.listenerContext.log.info("Stopping the queue");
		this.listenerContext.stopped = true;

		return this.waitUntilListenerStopped();
	}

	/**
	 * Remove all messages from queue
	 */
	public async purgeQueue() {
		return this.sqs.purgeQueue({ QueueUrl: this.queueUrl }).promise();
	}

	public async getMessageCount(): Promise<number> {
		const response = await this.sqs.getQueueAttributes({ QueueUrl: this.queueUrl, AttributeNames: ["ApproximateNumberOfMessages"] }).promise();
		return Number(response.Attributes?.ApproximateNumberOfMessages || 0);
	}

	async handleSqsResponse(data: ReceiveMessageResult, listenerContext: SQSContext) {
		if (!data.Messages) {
			listenerContext.log.trace("Nothing to process");
			return;
		}

		statsd.increment(sqsQueueMetrics.received, data.Messages.length, this.metricsTags);

		listenerContext.log.trace("Processing messages batch");
		await Promise.all(data.Messages.map(message => this.executeMessage(message, listenerContext)));
		listenerContext.log.trace("Messages batch processed");
	}

	/**
	 * Function which is used to wait for the message handler to stop before continuing
	 */
	private async waitUntilListenerStopped() {
		const listenerContext = this.listenerContext;

		if (!listenerContext.stopped) {
			throw new Error("Listener is not stopped, nothing to await");
		}

		return new Promise<void>((resolve, reject) => {
			const startTime = Date.now();

			const checkFlag = () => {
				if (!listenerContext.listenerRunning) {
					listenerContext.log.info("Awaited listener stop");
					resolve();
				} else if (Date.now() - startTime > 60000) {
					reject("Listener didn't stop in 1 minute");
				} else {
					setTimeout(checkFlag, 10);
				}
			};

			checkFlag();
		});
	}

	/**
	 * Starts listening to the queue asynchronously
	 *
	 * @param listenerContext The object holding a status of this listener. This object keeps parameters specific to the
	 * particular queue listener. These parameters are not kept on SqsQueue level, hence there might be more than 1 listener
	 * running at the same time
	 *
	 */
	private async listen(listenerContext: SQSContext) {
		if (listenerContext.stopped) {
			listenerContext.listenerRunning = false;
			listenerContext.log.info("Queue has been stopped. Not processing further messages.");
			return;
		}

		// Setup the receiveMessage parameters
		const params = {
			QueueUrl: this.queueUrl,
			MaxNumberOfMessages: 1,
			WaitTimeSeconds: this.longPollingIntervalSec,
			AttributeNames: ["ApproximateReceiveCount"]
		};

		try {
			// Get messages from the queue with long polling enabled
			const result = await this.sqs.receiveMessage(params)
				.promise();

			await this.handleSqsResponse(result, listenerContext);
		} catch (err) {
			listenerContext.log.error({ err }, `Error receiving message from SQS queue`);
			//In case of aws client error we wait for the long polling interval to prevent bombarding the queue with failing requests
			await new Promise(resolve => setTimeout(resolve, this.longPollingIntervalSec * 1000));
		} finally {
			// Don't add `await` here, we need to ignore this promise
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			this.listen(listenerContext);
		}
	}

	private async deleteMessage(context: SQSMessageContext<MessagePayload>) {
		context.log.debug({ context }, "deleting the message");

		if (!context.message.ReceiptHandle) {
			context.log.error({ context }, "Unable to delete message, ReceiptHandle parameter is missing");
			return;
		}

		const deleteParams: DeleteMessageRequest = {
			QueueUrl: this.queueUrl,
			ReceiptHandle: context.message.ReceiptHandle || ""
		};

		try {
			await this.sqs.deleteMessage(deleteParams)
				.promise();
			statsd.increment(sqsQueueMetrics.deleted, this.metricsTags);
			context.log.debug("Successfully deleted message from queue");
		} catch (err) {
			context.log.warn({ err }, "Error deleting message from the queue");
		}
	}

	public async deleteStaleMessages(message: Message, context: SQSMessageContext<MessagePayload>, jiraHost?: string): Promise<boolean> {
		if (!await booleanFlag(BooleanFlags.REMOVE_STALE_MESSAGES, jiraHost)) {
			return false;
		}
		const TARGETED_QUEUES = ["deployment"];
		if (!message?.Body || !TARGETED_QUEUES.includes(this.queueName)) {
			return false;
		}

		const messageBody = JSON.parse(message.Body);
		const { webhookReceived } = messageBody;

		if (Date.now() - webhookReceived > ONE_DAY_MILLI) {
			try {
				await this.deleteMessage(context);
				context.log.warn(
					{ deletedMessageId: message.MessageId },
					`Deleted stale message from ${this.queueName} queue`
				);
				return true;
			} catch (error) {
				context.log.error(
					{ error, deletedMessageId: message.MessageId },
					`Failed to delete stale message from ${this.queueName} queue`
				);
				return false;
			}
		}

		return false;
	}

	private async executeMessage(message: Message, listenerContext: SQSContext): Promise<void> {
		const payload: MessagePayload = message.Body ? JSON.parse(message.Body) : {};

		// Sets the log level depending on FF for the specific jira host
		listenerContext.log.level(await stringFlag(StringFlags.LOG_LEVEL, defaultLogLevel, payload?.jiraHost));

		const receiveCount = Number(message.Attributes?.ApproximateReceiveCount || "1");

		const context: SQSMessageContext<MessagePayload> = {
			message,
			payload,
			log: listenerContext.log.child({
				messageId: message.MessageId,
				executionId: uuidv4(),
				queue: this.queueName,
				jiraHost: payload?.jiraHost,
				installationId: payload?.installationId,
				gitHubAppId: payload?.gitHubAppConfig?.gitHubAppId,
				webhookId: payload?.webhookId
			}),
			receiveCount,
			lastAttempt: receiveCount >= this.maxAttempts
		};

		context.log.info(`SQS message received. Receive count: ${receiveCount}`);

		try {
			const messageProcessingStartTime = Date.now();
			if (await this.deleteStaleMessages(message, context, payload?.jiraHost)) return;

			const rateLimitCheckResult = await preemptiveRateLimitCheck(context, this);
			if (rateLimitCheckResult.isExceedThreshold) {

				// We have found out that the rate limit quota has been used and exceed the configured threshold.
				// Next step is to postpone the processing.
				// For rate limiting, we don't want to use the changeVisibilityTimeout as that will make msg lands in the DLQ and lost.
				// Therefore, sending a new msg instead of keep polling GitHub until rate limit is raised.
				const { MessageId } = await this.sendMessage({ ...payload, rateLimited: true }, rateLimitCheckResult.resetTimeInSeconds, context.log);
				await this.deleteMessage(context);
				context.log.warn({ newMessageId: MessageId, deletedMessageId: message.MessageId }, "Preemptive rate limit threshold exceeded, rescheduled new one and deleted the origin msg");
				return;
			}

			// Change message visibility timeout to the max processing time
			// plus EXTRA_VISIBILITY_TIMEOUT_DELAY to have some room for error handling in case of a timeout
			await this.changeVisibilityTimeout(message, this.timeoutSec + EXTRA_VISIBILITY_TIMEOUT_DELAY, context.log);

			const timeoutPromise = new Promise((_, reject) =>
				setTimeout(() => reject(new SqsTimeoutError()), this.timeoutSec * 1000)
			);

			await Promise.race([this.messageHandler(context), timeoutPromise]);

			const messageProcessingDuration = Date.now() - messageProcessingStartTime;
			this.sendProcessedMetrics(messageProcessingDuration);
			await this.deleteMessage(context);
		} catch (err) {
			await this.handleSqsMessageExecutionError(err, context);
		}
	}

	private async handleSqsMessageExecutionError(err, context: SQSMessageContext<MessagePayload>) {
		const unsafeLogger = getLogger("message-error-handler-unsafe", { level: "warn", unsafe: true });
		try {
			unsafeLogger.warn({ err, context }, "Failed message");
			const errorHandlingResult = await this.errorHandler(err, context);

			if (errorHandlingResult.isFailure) {
				context.log.error({ err }, "Error while executing SQS message");
				statsd.increment(sqsQueueMetrics.failed, this.metricsTags);
			} else {
				context.log.warn({ err }, "Expected exception while executing SQS message. Not an error, deleting the message.");
			}

			if (isNotAFailure(errorHandlingResult)) {
				context.log.info("Deleting the message because the error is not a failure");
				await this.deleteMessage(context);
			} else if (isNotRetryable(errorHandlingResult)) {
				context.log.warn("Deleting the message because the error is not retryable");
				await this.deleteMessage(context);
			} else if (errorHandlingResult.skipDlq && this.isMessageReachedRetryLimit(context)) {
				context.log.warn("Deleting the message because it has reached the maximum amount of retries");
				await this.deleteMessage(context);
			} else {
				unsafeLogger.error({ errorHandlingResult, err, context }, "SQS message visibility timeout changed");
				await this.changeVisibilityTimeoutIfNeeded(errorHandlingResult, context.message, context.log);
			}
		} catch (errorHandlingException) {
			unsafeLogger.error({ err: errorHandlingException, originalError: err , context }, "Error while performing error handling on SQS message");
			context.log.error({ err: errorHandlingException, originalError: err }, "Error while performing error handling on SQS message");
		}
	}

	private async changeVisibilityTimeoutIfNeeded(errorHandlingResult: ErrorHandlingResult, message: Message, log: Logger) {
		const retryDelaySec = errorHandlingResult.retryDelaySec;
		if (retryDelaySec !== undefined /*zero seconds delay is also supported*/) {
			log.info(`Delaying the retry for ${retryDelaySec} seconds`);
			await this.changeVisibilityTimeout(message, retryDelaySec, log);
		}
	}

	private isMessageReachedRetryLimit(context: SQSMessageContext<MessagePayload>) {
		return context.receiveCount >= this.maxAttempts;
	}

	public async changeVisibilityTimeout(message: Message, timeoutSec: number, logger: Logger): Promise<void> {
		if (!message.ReceiptHandle) {
			logger.error(`No ReceiptHandle in message with ID = ${message.MessageId}`);
			return;
		}

		if (timeoutSec < 0) {
			logger.error(`Timeout needs to be a positive number.`);
			return;
		}

		if (timeoutSec >= MAX_MESSAGE_VISIBILITY_TIMEOUT_SEC) {
			logger.warn(`Attempt to set visibility timeout greater than allowed. Timeout value: ${timeoutSec} sec. Will be reset to max value of ${MAX_MESSAGE_VISIBILITY_TIMEOUT_SEC} sec`);
			timeoutSec = MAX_MESSAGE_VISIBILITY_TIMEOUT_SEC;
		}

		const params: ChangeMessageVisibilityRequest = {
			QueueUrl: this.queueUrl,
			ReceiptHandle: message.ReceiptHandle,
			VisibilityTimeout: Math.round(timeoutSec)
		};
		try {
			await this.sqs.changeMessageVisibility(params).promise();
		} catch (err) {
			logger.error("Message visibility timeout change failed");
		}
	}

	private sendProcessedMetrics(messageProcessingDuration: number) {
		statsd.increment(sqsQueueMetrics.completed, this.metricsTags);
		//Sending histogram metric twice hence it will produce different metrics, first call produces mean, min, max and precentiles metrics
		statsd.histogram(sqsQueueMetrics.duration, messageProcessingDuration, this.metricsTags);
		//the second call produces only histogram buckets metrics
		statsd.histogram(sqsQueueMetrics.duration, messageProcessingDuration, {
			...this.metricsTags,
			gsd_histogram: PROCESSING_DURATION_HISTOGRAM_BUCKETS
		});
	}
}
