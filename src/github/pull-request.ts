import { transformPullRequest } from "../transforms/transform-pull-request";
import { emitWebhookProcessedMetrics } from "utils/webhook-utils";
import { isEmpty } from "lodash";
import { GitHubInstallationClient } from "./client/github-installation-client";
import { Octokit } from "@octokit/rest";
import { JiraPullRequestBulkSubmitData } from "interfaces/jira";
import { jiraIssueKeyParser } from "utils/jira-utils";
import { GitHubIssueData } from "interfaces/github";
import { createInstallationClient } from "utils/get-github-client-config";
import { WebhookContext } from "../routes/github/webhook/webhook-context";
import { transformRepositoryId } from "~/src/transforms/transform-repository-id";
import { getPullRequestReviews } from "~/src/transforms/util/github-get-pull-request-reviews";
import { booleanFlag, BooleanFlags } from "config/feature-flags";

export const pullRequestWebhookHandler = async (context: WebhookContext, jiraClient, util, gitHubInstallationId: number): Promise<void> => {
	const {
		pull_request,
		repository: {
			id: repositoryId,
			name: repoName,
			owner: { login: owner }
		},
		changes
	} = context.payload;

	const { number: pullRequestNumber, id: pullRequestId } = pull_request;
	const baseUrl = jiraClient.baseUrl || "none";
	context.log = context.log.child({
		jiraHost: jiraClient.baseURL,
		gitHubInstallationId,
		orgName: owner,
		pullRequestNumber,
		pullRequestId
	});

	const gitHubAppId = context.gitHubAppConfig?.gitHubAppId;
	const metrics = {
		trigger: "webhook",
		subTrigger: "pullRequest"
	};
	const gitHubInstallationClient = await createInstallationClient(gitHubInstallationId, jiraClient.baseURL, metrics, context.log, gitHubAppId);
	let reviews: Octokit.PullsListReviewsResponse = [];

	if (await booleanFlag(BooleanFlags.USE_SHARED_PR_TRANSFORM)) {
		reviews = await getPullRequestReviews(gitHubInstallationClient, context.payload.repository, pull_request, context.log);
	} else {
		try {
			reviews = await getReviews(gitHubInstallationClient, owner, repoName, pull_request.number);
		} catch (err) {
			context.log.warn(
				{
					pullRequestNumber,
					pullRequestId,
					repositoryId,
					repoName,
					err
				},
				"Missing Github Permissions: Can't retrieve reviewers"
			);
		}
	}

	const jiraPayload: JiraPullRequestBulkSubmitData | undefined = await transformPullRequest(gitHubInstallationClient, pull_request, reviews, context.log);
	context.log.info("Pullrequest mapped to Jira Payload");

	// Deletes PR link to jira if ticket id is removed from PR title
	if (!jiraPayload && changes?.title) {
		const issueKeys = jiraIssueKeyParser(changes?.title?.from);

		if (!isEmpty(issueKeys)) {
			context.log.info(
				{ issueKeys },
				"Sending pullrequest delete event for issue keys"
			);

			await jiraClient.devinfo.pullRequest.delete(
				transformRepositoryId(repositoryId, context.gitHubAppConfig?.gitHubBaseUrl),
				pullRequestNumber
			);

			return;
		}
	}

	try {
		await updateGithubIssues(gitHubInstallationClient, context, util, repoName, owner, pull_request);
	} catch (err) {
		context.log.warn(
			{ err },
			"Error while trying to update PR body with links to Jira ticket"
		);
	}

	if (!jiraPayload) {
		context.log.info("Halting futher execution for pull request since jiraPayload is empty");
		return;
	}

	context.log.info({ jiraHost : baseUrl }, `Sending pull request update to Jira`);

	const jiraResponse = await jiraClient.devinfo.repository.update(jiraPayload);
	const { webhookReceived, name, log } = context;

	webhookReceived && emitWebhookProcessedMetrics(
		webhookReceived,
		name,
		log,
		jiraResponse?.status,
		gitHubAppId
	);
};

const updateGithubIssues = async (github: GitHubInstallationClient, context: WebhookContext, util, repoName, owner, pullRequest) => {
	const linkifiedBody = await util.unfurl(pullRequest.body);

	if (!linkifiedBody) {
		return;
	}

	context.log.info("Updating pull request");

	const updatedPullRequest: GitHubIssueData = {
		body: linkifiedBody,
		owner,
		repo: repoName,
		issue_number: pullRequest.number
	};

	await github.updateIssue(updatedPullRequest);
};

const getReviews = async (githubCient: GitHubInstallationClient, owner: string, repo: string, pull_number: number): Promise<Octokit.PullsListReviewsResponse> => {
	const response = await githubCient.getPullRequestReviews(owner, repo, pull_number);
	return response.data;
};
