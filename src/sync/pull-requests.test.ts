/* eslint-disable @typescript-eslint/no-var-requires,@typescript-eslint/no-explicit-any */
import { processInstallation } from "./installation";
import { removeInterceptor } from "nock";
import { getLogger } from "config/logger";
import { Hub } from "@sentry/types/dist/hub";
import pullRequestList from "fixtures/api/pull-request-list.json";
import pullRequest from "fixtures/api/pull-request.json";
import { GitHubServerApp } from "models/github-server-app";
import { when } from "jest-when";
import { booleanFlag, BooleanFlags } from "config/feature-flags";
import { BackfillMessagePayload } from "~/src/sqs/sqs.types";
import { DatabaseStateCreator } from "test/utils/database-state-creator";

jest.mock("config/feature-flags");

describe("sync/pull-request", () => {
	const sentry: Hub = { setUser: jest.fn() } as any as Hub;

	beforeEach(() => {
		mockSystemTime(12345678);
	});


	const reviewsPayload = [
		{
			id: 80,
			node_id: "MDE3OlB1bGxSZXF1ZXN0UmV2aWV3ODA=",
			user: {
				login: "test-pull-request-reviewer-login",
				id: 1,
				node_id: "MDQ6VXNlcjE=",
				avatar_url: "test-pull-request-reviewer-avatar",
				gravatar_id: "",
				url: "https://api.github.com/users/reviewer",
				html_url: "https://github.com/reviewer",
				followers_url: "https://api.github.com/users/reviewer/followers",
				following_url: "https://api.github.com/users/reviewer/following{/other_user}",
				gists_url: "https://api.github.com/users/reviewer/gists{/gist_id}",
				starred_url: "https://api.github.com/users/reviewer/starred{/owner}{/repo}",
				subscriptions_url: "https://api.github.com/users/reviewer/subscriptions",
				organizations_url: "https://api.github.com/users/reviewer/orgs",
				repos_url: "https://api.github.com/users/reviewer/repos",
				events_url: "https://api.github.com/users/reviewer/events{/privacy}",
				received_events_url: "https://api.github.com/users/reviewer/received_events",
				type: "User",
				site_admin: false
			},
			body: "Here is the body for the review.",
			state: "APPROVED",
			html_url: "https://github.com/integrations/test-repo-name/pull/1#pullrequestreview-80",
			pull_request_url: "https://api.github.com/repos/integrations/test-repo-name/pulls/1",
			_links: {
				html: {
					href: "https://github.com/integrations/test-repo-name/pull/1#pullrequestreview-80"
				},
				pull_request: {
					href: "https://api.github.com/repos/integrations/test-repo-name/pulls/1"
				}
			},
			submitted_at: "2019-11-17T17:43:43Z",
			commit_id: "ecdd80bb57125d7ba9641ffaa4d7d2c19d3f3091",
			author_association: "COLLABORATOR"
		}
	];

	const buildJiraPayload = (repoId: string) => {
		return {
			"preventTransitions": true,
			operationType: "BACKFILL",
			"repositories":
				[
					{
						"id": repoId,
						"name": "test-repo-name",
						"pullRequests":
							[
								{
									"author": {
										"avatar": "test-pull-request-author-avatar",
										"name": "test-pull-request-author-login",
										"email": "test-pull-request-author-login@noreply.user.github.com",
										"url": "test-pull-request-author-url"
									},
									"commentCount": 10,
									"destinationBranch": "devel",
									"destinationBranchUrl": "https://github.com/integrations/test/tree/devel",
									"displayId": "#51",
									"id": 51,
									"issueKeys": [
										"KEY-15"
									],
									"lastUpdate": "2018-05-04T14:06:56Z",
									"reviewers": [
										{
											"avatar": "test-pull-request-reviewer-avatar",
											"name": "test-pull-request-reviewer-login",
											"email": "test-pull-request-reviewer-login@email.test",
											"url": "https://github.com/reviewer",
											"approvalStatus": "APPROVED"
										}
									],
									"sourceBranch": "use-the-force",
									"sourceBranchUrl": "https://github.com/integrations/test/tree/use-the-force",
									"status": "DECLINED",
									"timestamp": "2018-05-04T14:06:56Z",
									"title": "[KEY-15] Testing force pushes",
									"url": "https://github.com/integrations/test/pull/51",
									"updateSequenceId": 12345678
								}
							],
						"url": "test-repo-url",
						"updateSequenceId": 12345678
					}
				],
			"properties":
				{
					"installationId": DatabaseStateCreator.GITHUB_INSTALLATION_ID
				}
		};
	};

	// Function can be removed with use-shared-pr-transform feature flag
	const buildJiraPayloadOldCloud = (repoId: string) => {
		return {
			"preventTransitions": true,
			operationType: "BACKFILL",
			"repositories":
				[
					{
						"id": repoId,
						"name": "test-repo-name",
						"pullRequests":
							[
								{
									"author":
										{
											"avatar": "test-pull-request-author-avatar",
											"name": "test-pull-request-author-login",
											"email": "test-pull-request-author-login@noreply.user.github.com",
											"url": "test-pull-request-author-url"
										},
									"commentCount": 10,
									"destinationBranch": "devel",
									"destinationBranchUrl": "test-repo-url/tree/devel",
									"displayId": "#51",
									"id": 51,
									"issueKeys":
										[
											"TES-15"
										],
									"lastUpdate": "2018-05-04T14:06:56Z",
									"sourceBranch": "use-the-force",
									"sourceBranchUrl": "test-repo-url/tree/use-the-force",
									"status": "DECLINED",
									"timestamp": "2018-05-04T14:06:56Z",
									"title": "[KEY-15] Testing force pushes",
									"url": "https://github.com/integrations/test/pull/51",
									"updateSequenceId": 12345678
								}
							],
						"url": "test-repo-url",
						"updateSequenceId": 12345678
					}
				],
			"properties":
				{
					"installationId": DatabaseStateCreator.GITHUB_INSTALLATION_ID
				}
		};
	};

	// Function can be removed with use-shared-pr-transform feature flag
	const buildJiraPayloadOld = (repoId: string) => {
		return {
			"preventTransitions": true,
			operationType: "BACKFILL",
			"repositories":
				[
					{
						"id": repoId,
						"name": "test-repo-name",
						"pullRequests":
							[
								{
									"author":
										{
											"avatar":"https://avatars0.githubusercontent.com/u/173?v=4",
											"name": "test-pull-request-author-login",
											"email": "test-pull-request-author-login@noreply.user.github.com",
											"url":"https://github.com/test-pull-request-author-login"
										},
									"commentCount": 10,
									"destinationBranch": "devel",
									"destinationBranchUrl": "test-repo-url/tree/devel",
									"displayId": "#51",
									"id": 51,
									"issueKeys":
										[
											"TES-15"
										],
									"lastUpdate": "2018-05-04T14:06:56Z",
									"sourceBranch": "use-the-force",
									"sourceBranchUrl":"test-repo-url/tree/use-the-force",
									"status": "DECLINED",
									"timestamp": "2018-05-04T14:06:56Z",
									"title": "[KEY-15] Testing force pushes",
									"url": "https://github.com/integrations/test/pull/51",
									"updateSequenceId": 12345678
								}
							],
						"url": "test-repo-url",
						"updateSequenceId": 12345678
					}
				],
			"properties":
				{
					"installationId": DatabaseStateCreator.GITHUB_INSTALLATION_ID
				}
		};
	};

	describe("cloud", () => {

		beforeEach(async () => {
			await new DatabaseStateCreator()
				.withActiveRepoSyncState()
				.repoSyncStatePendingForPrs()
				.create();

			when(jest.mocked(booleanFlag))
				.calledWith(BooleanFlags.USE_SHARED_PR_TRANSFORM)
				.mockResolvedValue(true);
		});

		describe.each([
			["[TES-15] Evernote Test", "use-the-force"],
			["Evernote Test", "TES-15"]
		])("PR Title: %p, PR Head Ref: %p", (title, head) => {
			it("should sync to Jira when Pull Request Nodes have jira references", async () => {
				pullRequestList[0].title = title;
				pullRequestList[0].head.ref = head;
				githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
				githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
				githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
				githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
				githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
				githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
				githubNock
					.get("/repos/integrations/test-repo-name/pulls")
					.query(true)
					.reply(200, pullRequestList)
					.get("/repos/integrations/test-repo-name/pulls/51")
					.reply(200, pullRequest)
					.get("/repos/integrations/test-repo-name/pulls/51/reviews")
					.reply(200, reviewsPayload)
					.get("/users/test-pull-request-reviewer-login")
					.reply(200, {
						login: "test-pull-request-reviewer-login",
						avatar_url: "test-pull-request-reviewer-avatar",
						html_url: "test-pull-request-reviewer-url",
						email: "test-pull-request-reviewer-login@email.test"
					})
					.get("/users/test-pull-request-author-login")
					.reply(200, {
						login: "test-pull-request-author-login",
						avatar_url: "test-pull-request-author-avatar",
						html_url: "test-pull-request-author-url"
					})
					.get("/users/integrations")
					.reply(200, {
						login: "integrations",
						avatar_url: "integrations-avatar",
						html_url: "integrations-url"
					});

				jiraNock.post("/rest/devinfo/0.10/bulk", buildJiraPayload("1")).reply(200);


				await expect(processInstallation()({
					installationId: DatabaseStateCreator.GITHUB_INSTALLATION_ID,
					jiraHost
				}, sentry, getLogger("test"))).toResolve();
			});
		});

		it("should not sync if nodes are empty", async () => {
			githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			githubNock
				.get("/repos/integrations/test-repo-name/pulls")
				.query(true)
				.reply(200, []);

			const interceptor = jiraNock.post(/.*/);
			const scope = interceptor.reply(200);

			await expect(processInstallation()({
				installationId: DatabaseStateCreator.GITHUB_INSTALLATION_ID,
				jiraHost
			}, sentry, getLogger("test"))).toResolve();
			expect(scope).not.toBeDone();
			removeInterceptor(interceptor);
		});

		it("should not sync if nodes do not contain issue keys", async () => {
			githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			githubNock.get("/repos/integrations/test-repo-name/pulls")
				.query(true)
				.reply(200, pullRequestList);

			const interceptor = jiraNock.post(/.*/);
			const scope = interceptor.reply(200);

			await expect(processInstallation()({
				installationId: DatabaseStateCreator.GITHUB_INSTALLATION_ID,
				jiraHost
			}, sentry, getLogger("test"))).toResolve();
			expect(scope).not.toBeDone();
			removeInterceptor(interceptor);
		});

	});

	describe("server", () => {
		let gitHubServerApp: GitHubServerApp;

		beforeEach(async () => {

			when(jest.mocked(booleanFlag))
				.calledWith(BooleanFlags.USE_SHARED_PR_TRANSFORM, expect.anything())
				.mockResolvedValue(true);

			const buildResult = await new DatabaseStateCreator()
				.forServer()
				.withActiveRepoSyncState()
				.repoSyncStatePendingForPrs()
				.create();
			gitHubServerApp = buildResult.gitHubServerApp!;
		});

		it("should sync to Jira when Pull Request Nodes have jira references", async () => {
			pullRequestList[0].title = "[TES-15] Evernote Test";
			pullRequestList[0].head.ref = "Evernote Test";
			gheUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			gheUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			gheUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			gheUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			gheUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			gheUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			gheApiNock
				.get("/repos/integrations/test-repo-name/pulls")
				.query(true)
				.reply(200, pullRequestList)
				.get("/repos/integrations/test-repo-name/pulls/51")
				.reply(200, pullRequest)
				.get("/repos/integrations/test-repo-name/pulls/51/reviews")
				.reply(200, reviewsPayload)
				.get("/users/test-pull-request-reviewer-login")
				.reply(200, {
					login: "test-pull-request-reviewer-login",
					avatar_url: "test-pull-request-reviewer-avatar",
					html_url: "test-pull-request-reviewer-url",
					email: "test-pull-request-reviewer-login@email.test"
				})
				.get("/users/test-pull-request-author-login")
				.reply(200, {
					login: "test-pull-request-author-login",
					avatar_url: "test-pull-request-author-avatar",
					html_url: "test-pull-request-author-url"
				})
				.get("/users/integrations")
				.reply(200, {
					login: "integrations",
					avatar_url: "integrations-avatar",
					html_url: "integrations-url"
				});

			jiraNock.post("/rest/devinfo/0.10/bulk", buildJiraPayload("6769746875626d79646f6d61696e636f6d-1")).reply(200);

			const data: BackfillMessagePayload = {
				installationId: DatabaseStateCreator.GITHUB_INSTALLATION_ID,
				jiraHost,
				gitHubAppConfig: {
					uuid: gitHubServerApp.uuid,
					gitHubAppId: gitHubServerApp.id,
					appId: gitHubServerApp.appId,
					clientId: gitHubServerApp.gitHubClientId,
					gitHubBaseUrl: gitHubServerApp.gitHubBaseUrl,
					gitHubApiUrl: gitHubServerApp.gitHubBaseUrl + "/v3/api"
				}
			};

			await expect(processInstallation()(data, sentry, getLogger("test"))).toResolve();
		});
	});

	// These tests can be removed with use-shared-pr-transform feature flag clean up
	describe("cloud - false ff use-shared-pr-transform", () => {

		beforeEach(async () => {
			await new DatabaseStateCreator()
				.withActiveRepoSyncState()
				.repoSyncStatePendingForPrs()
				.create();
		});

		describe.each([
			["[TES-15] Evernote Test", "use-the-force"],
			["Evernote Test", "TES-15"]
		])("PR Title: %p, PR Head Ref: %p", (title, head) => {
			it("should sync to Jira when Pull Request Nodes have jira references", async () => {
				pullRequestList[0].title = title;
				pullRequestList[0].head.ref = head;
				githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
				githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
				githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
				githubNock
					.get("/repos/integrations/test-repo-name/pulls")
					.query(true)
					.reply(200, pullRequestList)
					.get("/repos/integrations/test-repo-name/pulls/51")
					.reply(200, pullRequest)
					.get("/users/test-pull-request-author-login")
					.reply(200, {
						login: "test-pull-request-author-login",
						avatar_url: "test-pull-request-author-avatar",
						html_url: "test-pull-request-author-url"
					});

				jiraNock.post("/rest/devinfo/0.10/bulk", buildJiraPayloadOldCloud("1")).reply(200);


				await expect(processInstallation()({
					installationId: DatabaseStateCreator.GITHUB_INSTALLATION_ID,
					jiraHost
				}, sentry, getLogger("test"))).toResolve();
			});
		});

		it("should not sync if nodes are empty", async () => {
			githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			githubNock
				.get("/repos/integrations/test-repo-name/pulls")
				.query(true)
				.reply(200, []);

			const interceptor = jiraNock.post(/.*/);
			const scope = interceptor.reply(200);

			await expect(processInstallation()({
				installationId: DatabaseStateCreator.GITHUB_INSTALLATION_ID,
				jiraHost
			}, sentry, getLogger("test"))).toResolve();
			expect(scope).not.toBeDone();
			removeInterceptor(interceptor);
		});

		it("should not sync if nodes do not contain issue keys", async () => {
			githubUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			githubNock.get("/repos/integrations/test-repo-name/pulls")
				.query(true)
				.reply(200, pullRequestList);

			const interceptor = jiraNock.post(/.*/);
			const scope = interceptor.reply(200);

			await expect(processInstallation()({
				installationId: DatabaseStateCreator.GITHUB_INSTALLATION_ID,
				jiraHost
			}, sentry, getLogger("test"))).toResolve();
			expect(scope).not.toBeDone();
			removeInterceptor(interceptor);
		});

	});

	// These tests can be removed with use-shared-pr-transform feature flag clean up
	describe("server - false ff use-shared-pr-transform", () => {

		let gitHubServerApp: GitHubServerApp;

		beforeEach(async () => {

			const buildResult = await new DatabaseStateCreator()
				.forServer()
				.withActiveRepoSyncState()
				.repoSyncStatePendingForPrs()
				.create();
			gitHubServerApp = buildResult.gitHubServerApp!;
		});

		it("should sync to Jira when Pull Request Nodes have jira references", async () => {
			pullRequestList[0].title = "[TES-15] Evernote Test";
			pullRequestList[0].head.ref = "Evernote Test";
			gheUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			gheUserTokenNock(DatabaseStateCreator.GITHUB_INSTALLATION_ID);
			gheApiNock
				.get("/repos/integrations/test-repo-name/pulls")
				.query(true)
				.reply(200, pullRequestList)
				.get("/repos/integrations/test-repo-name/pulls/51")
				.reply(200, pullRequest);

			jiraNock.post("/rest/devinfo/0.10/bulk", buildJiraPayloadOld("6769746875626d79646f6d61696e636f6d-1")).reply(200);

			const data: BackfillMessagePayload = {
				installationId: DatabaseStateCreator.GITHUB_INSTALLATION_ID,
				jiraHost,
				gitHubAppConfig: {
					uuid: gitHubServerApp.uuid,
					gitHubAppId: gitHubServerApp.id,
					appId: gitHubServerApp.appId,
					clientId: gitHubServerApp.gitHubClientId,
					gitHubBaseUrl: gitHubServerApp.gitHubBaseUrl,
					gitHubApiUrl: gitHubServerApp.gitHubBaseUrl + "/v3/api"
				}
			};

			await expect(processInstallation()(data, sentry, getLogger("test"))).toResolve();
		});
	});
});
