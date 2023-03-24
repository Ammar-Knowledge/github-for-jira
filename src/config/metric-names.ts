const frontend = "app.frontend";
const server = "app.server";

export const metricError = {
	expressRateLimited: `${server}.error.express-rate-limited`,
	githubErrorRendered: `${frontend}.error.github-error-rendered`,
	failedConnection: `${server}.error.failed-connection`,
	blockedByGitHubAllowlist: `${server}.error.blocked-by-github-allowlist`,
	gheServerUrlError: `${server}.error.ghe.server.url.request.failed`
};

/**
 * SQS queue metrics
 */
export const sqsQueueMetrics = {
	received: `${server}.sqs.queue.received`,
	completed: `${server}.sqs.queue.success`,
	failed: `${server}.sqs.queue.failed`,
	sent: `${server}.sqs.queue.sent`,
	deleted: `${server}.sqs.queue.deleted`,
	duration: `${server}.sqs.queue.duration`
};

export const metricHttpRequest = {
	duration: `${server}.http.server.requests.duration`, //Duration of incoming HTTP requests
	executed: `${server}.http.server.requests`, //Count of executed incoming HTTP requests
	github: `${server}.http.request.github`, //Octokit requests execution time histogram
	jira: `${server}.http.request.jira`, //Jira requests execution time histogram
	install: `${server}.http.request.install`, //Count how many installation requests we received
	uninstall: `${server}.http.request.uninstall`, //Count how many uninstallation requests we received
	syncPullRequest: `${server}.http.request.sync-pull-request` //Measures retrieval time from GitHub API
};

export const metricSyncStatus = {
	complete: `${server}.sync-status.complete`,
	failed: `${server}.sync-status.failed`,
	fullSyncDuration: `${server}.sync.full-sync.duration` //Measures total time of full sync
};

export const metricTaskStatus = {
	complete: `${server}.task-status.complete`,
	pending: `${server}.task-status.pending`,
	failed: `${server}.task-status.failed`
};

export const metricWebhooks = {
	webhookEvent: `${server}.webhooks.webhook-events`,
	webhookProcessingTimes: `${server}.webhooks.processing-time.duration-ms`,
	webhookPayloadSize: `${server}.webhooks.payload-size.bytes`,
	webhookProcessed: `${server}.webhooks.processed`,
	webhookFailure: `${server}.webhooks.failed`,
	webhookLatency: `${server}.webhooks.processing-time.latency`
};

export const metricCreateBranch = {
	created: `${server}.create-branch.created`,
	failed: `${server}.create-branch.failed`
};

