import { JiraClientError } from "../jira/client/axios";
import { emitWebhookFailedMetrics } from "utils/webhook-utils";
import { ErrorHandler, ErrorHandlingResult, SQSMessageContext, BaseMessagePayload } from "./sqs.types";
import { GithubClientRateLimitingError } from "../github/client/github-client-errors";

/**
 * Sometimes we can get errors from Jira and GitHub which does not indicate a failured webhook. For example:
 *  Jira site is gone, we'll get 404
 *  GitHub App is not installed anymore we'll get 401
 *  etc.
 *
 *  In such cases webhook processing doesn't make sense anymore and we need to silently discard these errors
 */
const UNRETRYABLE_STATUS_CODES = [401, 404, 403];

const BASE_RATE_LIMITING_DELAY_BUFFER_SEC = 60;
const RATE_LIMITING_BUFFER_STEP = 10;
const EXPONENTIAL_BACKOFF_BASE_SEC = 60;
const EXPONENTIAL_BACKOFF_MULTIPLIER = 3;
const ONE_HOUR_IN_SECONDS = 3600;

export const handleUnknownError: ErrorHandler<BaseMessagePayload> = <MessagePayload extends BaseMessagePayload>(
	err: Error,
	context: SQSMessageContext<MessagePayload>
): Promise<ErrorHandlingResult> => {
	const delaySec = EXPONENTIAL_BACKOFF_BASE_SEC * Math.pow(EXPONENTIAL_BACKOFF_MULTIPLIER, context.receiveCount);
	context.log.warn({ err, delaySec }, "Unknown error: retrying with exponential backoff");
	return Promise.resolve({ retryable: true, retryDelaySec: delaySec, isFailure: true });
};

export const jiraAndGitHubErrorsHandler: ErrorHandler<BaseMessagePayload> = async <MessagePayload extends BaseMessagePayload> (error: Error,
	context: SQSMessageContext<MessagePayload>): Promise<ErrorHandlingResult> => {

	context.log.warn({ err: error }, "Handling Jira or GitHub error");

	const maybeResult = maybeHandleNonFailureCase(error, context)
		|| maybeHandleRateLimitingError(error, context)
		|| maybeHandleNonRetryableResponseCode(error, context);

	if (maybeResult) {
		return maybeResult;
	}

	return handleUnknownError(error, context);
};


/**
 * Error handler which sents failed webhook metric if the retry limit is reached
 */
export const webhookMetricWrapper = <MessagePayload extends BaseMessagePayload>(delegate: ErrorHandler<MessagePayload>, webhookName: string) => {
	return async (error: Error, context: SQSMessageContext<MessagePayload>) => {
		const errorHandlingResult = await delegate(error, context);

		if (errorHandlingResult.isFailure && (!errorHandlingResult.retryable || context.lastAttempt)) {
			context.log.error({ error }, `${webhookName} webhook processing failed and won't be retried anymore`);
			emitWebhookFailedMetrics(webhookName, context.payload?.jiraHost);
		}

		return errorHandlingResult;
	};
};

const maybeHandleNonFailureCase = <MessagePayload extends BaseMessagePayload>(error: Error, context: SQSMessageContext<MessagePayload>): ErrorHandlingResult | undefined => {
	if (error instanceof JiraClientError &&
		error.status &&
		UNRETRYABLE_STATUS_CODES.includes(error.status)) {
		context.log.warn(`Received ${error.status} from Jira. Unretryable. Discarding the message`);
		return { retryable: false, isFailure: false };
	}

	return undefined;
};

const maybeHandleNonRetryableResponseCode = <MessagePayload extends BaseMessagePayload>(error: Error, context: SQSMessageContext<MessagePayload>): ErrorHandlingResult | undefined => {
	//If error is Octokit.HookError or GithubClientError, then we need to check the response status
	//Unfortunately we can't check if error is instance of Octokit.HookError because it is not a class, so we'll just rely on status
	//New GitHub Client error (GithubClientError) also has status parameter, so it will be covered by the following check too
	//TODO When we get rid of Octokit completely add check if (error instanceof GithubClientError) before the following code
	const status: number | undefined = error["status"] as number | undefined;
	if (status && UNRETRYABLE_STATUS_CODES.includes(status)) {
		context.log.warn({ err: error }, `Received error with ${status} status. Unretryable. Discarding the message`);
		return { retryable: false, isFailure: false };
	}
	return undefined;
};

const maybeHandleRateLimitingError = <MessagePayload extends BaseMessagePayload>(error: Error, context: SQSMessageContext<MessagePayload>): ErrorHandlingResult | undefined => {
	if (error instanceof GithubClientRateLimitingError) {
		context.log.warn({ error }, `Rate limiting error, retrying`);
		// A stepped buffer to prioritize messages with a higher received count to get replayed slightly sooner than newer messages
		// e.g. a receiveCount 5 message will be visible 50 seconds sooner than a receiveCount 1 message
		const buffer = Math.max(RATE_LIMITING_BUFFER_STEP, BASE_RATE_LIMITING_DELAY_BUFFER_SEC - context.receiveCount * RATE_LIMITING_BUFFER_STEP);
		// Takes the reset datetime of the ratelimit from GitHub and returns how many seconds away + buffer
		const rateLimitReset = error.rateLimitReset + buffer - Date.now() / 1000;
		// GitHub Rate limit resets hourly, in the scenario of burst traffic it continues to overwhelm the rate limit
		// this attempts to ease the load across multiple refreshes
		const retryDelaySec = rateLimitReset + ONE_HOUR_IN_SECONDS * (context.receiveCount - 1);
		return { retryable: true, retryDelaySec, isFailure: true };
	}

	return undefined;
};

