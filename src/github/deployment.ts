import { transformDeployment } from "../transforms/transform-deployment";
import { emitWebhookProcessedMetrics } from "utils/webhook-utils";
import { getJiraClient, DeploymentsResult } from "../jira/client/jira-client";
import { sqsQueues } from "../sqs/queues";
import { WebhookPayloadDeploymentStatus } from "@octokit/webhooks";
import Logger from "bunyan";
import { isBlocked } from "config/feature-flags";
import { GitHubInstallationClient } from "./client/github-installation-client";
import { JiraDeploymentBulkSubmitData } from "interfaces/jira";
import { WebhookContext } from "routes/github/webhook/webhook-context";
import { Config } from "interfaces/common";
import { Subscription } from "models/subscription";
import { getRepoConfig } from "services/user-config-service";

export const deploymentWebhookHandler = async (context: WebhookContext, jiraClient, _util, gitHubInstallationId: number): Promise<void> => {
	await sqsQueues.deployment.sendMessage({
		jiraHost: jiraClient.baseURL,
		installationId: gitHubInstallationId,
		webhookPayload: context.payload,
		webhookReceived: Date.now(),
		webhookId: context.id,
		gitHubAppConfig: context.gitHubAppConfig
	});
};

export const processDeployment = async (
	newGitHubClient: GitHubInstallationClient,
	webhookId: string,
	webhookPayload: WebhookPayloadDeploymentStatus,
	webhookReceivedDate: Date,
	jiraHost: string,
	gitHubInstallationId: number,
	rootLogger: Logger,
	gitHubAppId: number | undefined
) => {

	const logger = rootLogger.child({
		webhookId: webhookId,
		gitHubInstallationId,
		jiraHost,
		webhookReceived: webhookReceivedDate
	});

	if (await isBlocked(gitHubInstallationId, logger)) {
		logger.warn("blocking processing of push message because installationId is on the blocklist");
		return;
	}

	let config: Config | undefined;

	const subscription = await Subscription.getSingleInstallation(jiraHost, newGitHubClient.githubInstallationId.installationId, gitHubAppId);
	if (subscription) {
		config = await getRepoConfig(
			subscription,
			newGitHubClient.githubInstallationId,
			webhookPayload.repository.id,
			webhookPayload.repository.owner.login,
			webhookPayload.repository.name);
	} else {
		logger.warn({
			jiraHost,
			githubInstallationId: newGitHubClient.githubInstallationId.installationId
		}, "could not find subscription - not using user config to map environments!");
	}

	logger.info("processing deployment message!");

	logger.error(config);
	const jiraPayload: JiraDeploymentBulkSubmitData | undefined = await transformDeployment(newGitHubClient, webhookPayload, jiraHost, logger, gitHubAppId, config);
	logger.error(jiraPayload);

	if (!jiraPayload) {
		logger.info(
			{ noop: "no_jira_payload_deployment" },
			"Halting further execution for deployment since jiraPayload is empty"
		);
		return;
	}

	const jiraClient = await getJiraClient(
		jiraHost,
		gitHubInstallationId,
		gitHubAppId,
		logger
	);

	const result: DeploymentsResult = await jiraClient.deployment.submit(jiraPayload);
	if (result.rejectedDeployments?.length) {
		logger.warn({
			jiraPayload,
			rejectedDeployments: result.rejectedDeployments
		}, "Jira API rejected deployment!");
	}

	const checkGatingStatus = config?.deployments?.services?.checkGatingStatus;
	if (jiraPayload.deployments[0].state === "in_progress" && checkGatingStatus?.environmentId === jiraPayload.deployments[0].environment.id)  {
		await sqsQueues.deploymentGatingPoller.sendMessage({
			jiraHost: jiraClient.baseURL,
			installationId: gitHubInstallationId,
			webhookPayload: {
				githubDeployment: webhookPayload.deployment,
				repository: webhookPayload.repository,
				jiraEnvironmentId: jiraPayload.deployments[0].environment.id,
				deploymentGatingConfig: {
					totalRetryCount : checkGatingStatus.retry,
					sleep : checkGatingStatus.sleep
				},
				currentRetry: 0
			},
			webhookReceived: Date.now(),
			webhookId: webhookId,
			gitHubAppConfig: gitHubAppConfig
		}, checkGatingStatus.sleep);
	}

	emitWebhookProcessedMetrics(
		webhookReceivedDate.getTime(),
		"deployment_status",
		logger,
		result?.status,
		gitHubAppId
	);
};
