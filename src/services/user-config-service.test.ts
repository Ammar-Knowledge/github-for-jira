/* eslint-disable @typescript-eslint/no-explicit-any */
import { RepoSyncState } from "models/reposyncstate";
import { Subscription } from "models/subscription";
import { getRepoConfig, updateRepoConfig } from "services/user-config-service";
import { createInstallationClient } from "utils/get-github-client-config";
import { getLogger } from "config/logger";

describe("User Config Service", () => {
	const gitHubInstallationId = 1234;
	let repoSyncState: RepoSyncState;
	let subscription: Subscription;

	const configFileContent = "deployments:\n" +
		"  environmentMapping:\n" +
		"    development:\n" +
		"      - \"dev*\"\n" +
		"      - \"Entwicklung\"\n" +
		"      - \"desenvolvimento\"\n" +
		"      - \"дев\"\n" +
		"    staging:\n" +
		"      - \"Pre-Prod\"\n" +
		"      - \"STG-*\"\n" +
		"      - \"staging\"\n" +
		"    production:\n" +
		"      - \"Produktion\"\n" +
		"      - \"produção\"\n" +
		"      - \"продакшн\"\n" +
		"      - \"PROD-*\"\n" +
		"  services:\n" +
		"    ids:\n" +
		"      - \"test-id-1\"\n" +
		"      - \"test-id-2\"\n" +
		"      - \"test-id-3\"\n" +
		"      - \"test-id-4\"";

	const configFileContentBase64 = Buffer.from(configFileContent).toString("base64");

	let gitHubClient;


	beforeEach(async () => {
		subscription = await Subscription.create({
			gitHubInstallationId,
			jiraHost,
			jiraClientKey: "client-key"
		});

		process.env.PROXY = undefined;

		repoSyncState = await RepoSyncState.create({
			subscriptionId: subscription.id,
			repoId: 1,
			repoName: "github-for-jira",
			repoOwner: "atlassian",
			repoFullName: "atlassian/github-for-jira",
			repoUrl: "github.com/atlassian/github-for-jira",
			branchStatus: "complete",
			branchCursor: "foo",
			commitStatus: "complete",
			commitCursor: "bar",
			pullStatus: "complete",
			pullCursor: "12",
			buildStatus: "complete",
			buildCursor: "bang",
			deploymentStatus: "complete",
			deploymentCursor: "buzz",
			repoUpdatedAt: new Date(0)
		});

		gitHubClient = await createInstallationClient(gitHubInstallationId, jiraHost, { trigger: "test", subTrigger: "test" }, getLogger("test"), undefined);

	});

	const givenGitHubReturnsConfigFile = (repoOwner: string = repoSyncState.repoOwner, repoName = repoSyncState.repoName) => {
		// see https://docs.github.com/en/rest/repos/contents#get-repository-content
		githubNock.get(`/repos/${repoOwner}/${repoName}/contents/.jira/config.yml`)
			.reply(200, {
				content: configFileContentBase64
			});
	};

	const givenGitHubReturnsAccessNotAllowed = (repoOwner: string = repoSyncState.repoOwner, repoName = repoSyncState.repoName) => {
		// see https://docs.github.com/en/rest/repos/contents#get-repository-content
		githubNock.get(`/repos/${repoOwner}/${repoName}/contents/.jira/config.yml`)
			.reply(401, {
				content: "not allowed"
			});
	};

	it("should not update config in database when config file hasn't been touched", async () => {
		await updateRepoConfig(subscription, repoSyncState.repoId, gitHubClient, ["random.yml", "ignored.yml"]);
		const config = await getRepoConfig(subscription, gitHubClient, repoSyncState.repoId, repoSyncState.repoOwner, repoSyncState.repoName);
		expect(config).toBeFalsy();
	});

	it("should update config in database when config file has been touched", async () => {
		githubUserTokenNock(gitHubInstallationId);
		givenGitHubReturnsConfigFile();
		await updateRepoConfig(subscription, repoSyncState.repoId, gitHubClient, ["random.yml", "ignored.yml", ".jira/config.yml"]);
		const config = await getRepoConfig(subscription, gitHubClient, repoSyncState.repoId, repoSyncState.repoOwner, repoSyncState.repoName);
		expect(config).toBeTruthy();
		expect(config?.deployments?.environmentMapping?.development).toHaveLength(4);
	});

	it("no Write perms case should be tolerated", async () => {
		githubUserTokenNock(gitHubInstallationId);
		givenGitHubReturnsAccessNotAllowed();
		await updateRepoConfig(subscription, repoSyncState.repoId, gitHubClient, ["random.yml", "ignored.yml", ".jira/config.yml"]);
		const config = await getRepoConfig(subscription, gitHubClient, repoSyncState.repoId, repoSyncState.repoOwner, repoSyncState.repoName);
		expect(config).toBeFalsy();
	});

	it("should get service ids", async () => {
		githubUserTokenNock(gitHubInstallationId);
		givenGitHubReturnsConfigFile();
		await updateRepoConfig(subscription, repoSyncState.repoId, gitHubClient, ["random.yml", "ignored.yml", ".jira/config.yml"]);
		const config = await getRepoConfig(subscription, gitHubClient, repoSyncState.repoId, repoSyncState.repoOwner, repoSyncState.repoName);
		expect(config).toBeTruthy();
		expect(config?.deployments?.services?.ids).toHaveLength(4);
	});

	it("should get config directly from GitHub when we don't have a record of the repo", async () => {
		// coordinates of a repo that we don't have in the database
		const unknownRepoName = "unknownRepo";
		const unknownRepoOwner = "unknownOwner";
		const unknownRepoId = 42;

		githubUserTokenNock(gitHubInstallationId);
		givenGitHubReturnsConfigFile(unknownRepoOwner, unknownRepoName);
		const config = await getRepoConfig(subscription, gitHubClient, unknownRepoId, unknownRepoOwner, unknownRepoName);
		expect(config).toBeTruthy();
		expect(config?.deployments?.environmentMapping?.development).toHaveLength(4);
	});

});
