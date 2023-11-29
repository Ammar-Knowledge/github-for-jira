import { transformWorkflow } from "../transforms/transform-workflow";
import { emitWebhookProcessedMetrics } from "utils/webhook-utils";
import { createInstallationClient } from "utils/get-github-client-config";
import { WebhookContext } from "../routes/github/webhook/webhook-context";
import { shouldSendAll } from "config/feature-flags";
import { Subscription } from "../models/subscription";

export const workflowWebhookHandler = async (context: WebhookContext, jiraClient, _util, gitHubInstallationId: number, subscription: Subscription): Promise<void> => {
	const { payload, log: logger } = context;
	const jiraHost = jiraClient.baseURL;
	context.log = context.log.child({
		jiraHost,
		gitHubInstallationId
	});

	const gitHubAppId = context.gitHubAppConfig?.gitHubAppId;
	const metrics = {
		trigger: "webhook",
		subTrigger: "workflow"
	};
	const gitHubInstallationClient = await createInstallationClient(gitHubInstallationId, jiraClient.baseURL, metrics, context.log, gitHubAppId);
	const alwaysSend = await shouldSendAll("builds", jiraHost, logger);
	const jiraPayload = await transformWorkflow(gitHubInstallationClient, payload, alwaysSend, logger);

	if (!jiraPayload) {
		logger.info(
			{ noop: "no_jira_payload_workflow_run" },
			"Halting further execution for workflow since jiraPayload is empty"
		);
		return;
	}

	logger.info({ jiraHost: jiraClient.baseURL }, `Sending workflow event to Jira`);

	const jiraResponse = await jiraClient.workflow.submit(
		jiraPayload,
		payload.repository.id,
		payload.repository.full_name,
		{
			preventTransitions: false,
			operationType: "NORMAL",
			auditLogsource: "WEBHOOK",
			entityAction: `WORKFLOW_RUN_${context.action}`.toUpperCase(),
			subscriptionId: subscription.id
		}
	);
	const { webhookReceived, name, log } = context;

	webhookReceived && emitWebhookProcessedMetrics(
		webhookReceived,
		name,
		jiraClient.baseURL,
		log,
		jiraResponse?.status,
		gitHubAppId
	);
};
