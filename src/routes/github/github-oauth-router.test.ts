import { getLogger } from "config/logger";
import { GithubAuthMiddleware } from "routes/github/github-oauth-router";
import supertest from "supertest";
import nock from "nock";
import { envVars } from "config/env";
import { DatabaseStateCreator } from "test/utils/database-state-creator";
import { GitHubServerApp } from "models/github-server-app";
import { getFrontendApp } from "~/src/app";
import { generateSignedSessionCookieHeader, parseCookiesAndSession } from "test/utils/cookies";
import { booleanFlag, BooleanFlags, stringFlag, StringFlags } from "config/feature-flags";
import { when } from "jest-when";
import { Installation } from "models/installation";

jest.mock("config/feature-flags");

describe("github-oauth-router", () => {
	let installation: Installation;
	beforeEach(async () => {
		installation = (await new DatabaseStateCreator().create()).installation;

		when(stringFlag).calledWith(StringFlags.GITHUB_SCOPES, expect.anything(), expect.anything()).mockResolvedValue("user,repo");
	});

	describe("GithubOAuthCallbackGet", () => {

		it("must return 401 if no session", async () => {
			const res = await supertest(getFrontendApp())
				.get("/github/callback?blah=true");
			expect(res.status).toEqual(401);
		});

		it("must return 401 if not Jira admin", async () => {
			when(booleanFlag).calledWith(BooleanFlags.JIRA_ADMIN_CHECK).mockResolvedValue(true);

			const res = await supertest(getFrontendApp())
				.get("/github/callback?blah=true")
				.set(
					"Cookie",
					generateSignedSessionCookieHeader({
						jiraHost,
						isJiraAdmin: false
					})
				);
			expect(res.status).toEqual(403);
		});

		describe("cloud", () => {
			it("populates session with github token", async () => {
				nock("https://github.com")
					.get(`/login/oauth/access_token?client_id=${envVars.GITHUB_CLIENT_ID}&client_secret=${envVars.GITHUB_CLIENT_SECRET}&code=barCode&state=fooState`)
					.matchHeader("accept", "application/json")
					.matchHeader("content-type", "application/json")
					.reply(200, {
						access_token: "behold!"
					});

				const app = await getFrontendApp();
				const response = await supertest(app)
					.get("/github/callback?state=fooState&code=barCode")
					.set("x-forwarded-proto", "https") // otherwise cookies won't be returned cause they are "secure"
					.set(
						"Cookie",
						generateSignedSessionCookieHeader({
							jiraHost,
							fooState: "/my-redirect",
							isJiraAdmin: true
						})
					)
				;
				const { session } = parseCookiesAndSession(response);
				expect(response.status).toEqual(302);
				expect(session["githubToken"]).toStrictEqual("behold!");
				expect(response.headers.location).toEqual("/my-redirect");
			});
		});

		describe("server", () => {
			let gitHubServerApp: GitHubServerApp;
			beforeEach(async () => {
				gitHubServerApp = await DatabaseStateCreator.createServerApp(installation.id);
			});

			it("populates session with github token", async () => {
				const nockUrl = `/login/oauth/access_token?client_id=${gitHubServerApp.gitHubClientId}&client_secret=${await gitHubServerApp.getDecryptedGitHubClientSecret(jiraHost)}&code=barCode&state=fooState`;
				nock(gitHubServerApp.gitHubBaseUrl)
					.get(nockUrl)
					.matchHeader("accept", "application/json")
					.matchHeader("content-type", "application/json")
					.reply(200, {
						access_token: "behold!"
					});

				const app = await getFrontendApp();
				const response = await supertest(app)
					.get(`/github/${gitHubServerApp.uuid}/callback?state=fooState&code=barCode`)
					.set("x-forwarded-proto", "https") // otherwise cookies won't be returned cause they are "secure"
					.set(
						"Cookie",
						generateSignedSessionCookieHeader({
							jiraHost,
							fooState: "/my-redirect",
							isJiraAdmin: true
						})
					)
				;
				const { session } = parseCookiesAndSession(response);
				expect(response.status).toEqual(302);
				expect(session["githubToken"]).toStrictEqual("behold!");
				expect(response.headers.location).toEqual("/my-redirect");
			});
		});
	});

	describe("GithubOAuthLoginGet", () => {
		it("must work only when session is initialized", async () => {
			const res = await supertest(getFrontendApp())
				.get("/github/login?blah=true");
			expect(res.status).toEqual(401);
		});

		it("must work only for Jira admins", async () => {
			when(booleanFlag).calledWith(BooleanFlags.JIRA_ADMIN_CHECK).mockResolvedValue(true);

			const res = await supertest(getFrontendApp())
				.get("/github/login?blah=true")
				.set(
					"Cookie",
					generateSignedSessionCookieHeader({
						jiraHost,
						isJiraAdmin: false
					})
				);
			expect(res.status).toEqual(403);
		});

		describe("cloud", () => {
			it("must populate session and redirect to GitHub cloud OAuth", async () => {
				const response = await supertest(getFrontendApp())
					.get("/github/login?")
					.set("x-forwarded-proto", "https") // otherwise cookies won't be returned cause they are "secure"
					.set(
						"Cookie",
						generateSignedSessionCookieHeader({
							jiraHost,
							isJiraAdmin: true
						})
					);
				const session = parseCookiesAndSession(response).session!;
				const state = Object.entries(session).find((keyValue) =>
					keyValue[1] === "/github/configuration?"
				)![0];
				expect(state).toBeDefined();
				expect(response.status).toEqual(302);
				expect(response.headers.location).toStrictEqual(
					`https://github.com/login/oauth/authorize?client_id=${
						envVars.GITHUB_CLIENT_ID
					}&scope=user%20repo&redirect_uri=${
						encodeURIComponent("https://test-github-app-instance.com/github/callback")
					}&state=${state}`);
			});
		});

		describe("server", () => {
			let gitHubServerApp: GitHubServerApp;
			beforeEach(async () => {
				gitHubServerApp = await DatabaseStateCreator.createServerApp(installation.id);
			});

			it("must populate session and redirect to GitHub server OAuth", async () => {
				const response = await supertest(getFrontendApp())
					.get(`/github/${gitHubServerApp.uuid}/login?`)
					.set("x-forwarded-proto", "https") // otherwise cookies won't be returned cause they are "secure"
					.set(
						"Cookie",
						generateSignedSessionCookieHeader({
							jiraHost,
							isJiraAdmin: true
						})
					);
				const session = parseCookiesAndSession(response).session!;
				const state = Object.entries(session).find((keyValue) =>
					keyValue[1] === "/github/configuration?"
				)![0];
				expect(state).toBeDefined();
				expect(response.status).toEqual(302);
				expect(response.headers.location).toStrictEqual(
					`${gitHubServerApp.gitHubBaseUrl}/login/oauth/authorize?client_id=${
						gitHubServerApp.gitHubClientId
					}&scope=user%20repo&redirect_uri=${
						encodeURIComponent(`https://test-github-app-instance.com/github/${gitHubServerApp.uuid}/callback`)
					}&state=${state}`);
			});
		});
	});

	describe("GithubAuthMiddleware", () => {
		describe("cloud", () => {
			it("must allow call with valid token", async () => {
				githubNock.get("/")
					.matchHeader("Authorization", "Bearer the-token")
					.reply(200, {});

				const next = jest.fn();

				const req = {
					log: getLogger("test"),
					session: {
						githubToken: "the-token"
					}
				};

				const res = {
					locals: {
						gitHubAppConfig: {}
					}
				};

				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				await GithubAuthMiddleware(req, res, next);
				expect(next.mock.calls).toHaveLength(1);
			});

			it("must renew access token if expired", async () => {
				githubNock.get("/")
					.matchHeader("Authorization", "Bearer the-token")
					.reply(401);

				nock("https://github.com")
					.post("/login/oauth/access_token")
					.matchHeader("accept", "application/json")
					.matchHeader("content-type", "application/json")
					.reply(200, {
						"access_token": "new_access_token",
						"refresh_token": "new_refresh_token"
					});

				const next = jest.fn();

				const req = {
					log: getLogger("test"),
					session: {
						githubToken: "the-token",
						githubRefreshToken: "refresh-token"
					}
				};

				const res = {
					locals: {
						gitHubAppConfig: {},
						jiraHost,
						githubToken: ""
					}
				};

				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				await GithubAuthMiddleware(req, res, next);
				expect(next.mock.calls).toHaveLength(1);
				expect(req.session.githubToken).toBe("new_access_token");
				expect(req.session.githubRefreshToken).toBe("new_refresh_token");
				expect(res.locals.githubToken).toBe("new_access_token");
			});

			it("must redirect to GitHub OAuth if invalid token and cannot be refreshed", async () => {
				githubNock.get("/")
					.matchHeader("Authorization", "Bearer the-token")
					.reply(401);

				nock("https://github.com")
					.post("/login/oauth/access_token")
					.matchHeader("accept", "application/json")
					.matchHeader("content-type", "application/json")
					.reply(401);

				const response = await supertest(getFrontendApp())
					.get(`/github/configuration`)
					.set("x-forwarded-proto", "https") // otherwise cookies won't be returned cause they are "secure"
					.set(
						"Cookie",
						generateSignedSessionCookieHeader({
							jiraHost,
							githubToken: "the-token",
							githubRefreshToken: "blah",
							isJiraAdmin: true
						})
					);
				expect(response.status).toEqual(302);
				expect(response.headers.location).toContain("https://github.com/login/oauth/authorize");
			});
		});

		describe("server", () => {
			let gitHubServerApp: GitHubServerApp;
			beforeEach(async () => {
				gitHubServerApp = await DatabaseStateCreator.createServerApp(installation.id);
			});

			it("must allow call with valid token", async () => {
				gheApiNock.get("")
					.matchHeader("Authorization", "Bearer the-token")
					.reply(200, {});

				const next = jest.fn();

				const req = {
					log: getLogger("test"),
					session: {
						githubToken: "the-token"
					}
				};

				const res = {
					locals: {
						jiraHost,
						gitHubAppConfig: {
							gitHubAppId: gitHubServerApp.id
						}
					}
				};

				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				await GithubAuthMiddleware(req, res, next);
				expect(next.mock.calls).toHaveLength(1);
			});

			it("must renew access token if expired", async () => {
				gheNock.post("/login/oauth/access_token")
					.matchHeader("accept", "application/json")
					.matchHeader("content-type", "application/json")
					.reply(200, {
						"access_token": "new_access_token",
						"refresh_token": "new_refresh_token"
					});

				const next = jest.fn();

				const req = {
					log: getLogger("test"),
					session: {
						githubToken: "the-token",
						githubRefreshToken: "refresh-token"
					}
				};

				const res = {
					locals: {
						gitHubAppConfig: {
							gitHubAppId: gitHubServerApp.id,
							uuid: gitHubServerApp.uuid
						},
						jiraHost,
						githubToken: ""
					}
				};

				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				await GithubAuthMiddleware(req, res, next);
				expect(next.mock.calls).toHaveLength(1);
				expect(req.session.githubToken).toBe("new_access_token");
				expect(req.session.githubRefreshToken).toBe("new_refresh_token");
				expect(res.locals.githubToken).toBe("new_access_token");
			});

			it("must redirect to GitHub OAuth if invalid token and cannot be refreshed", async () => {
				gheNock
					.post("/login/oauth/access_token")
					.matchHeader("accept", "application/json")
					.matchHeader("content-type", "application/json")
					.reply(401);

				const response = await supertest(getFrontendApp())
					.get(`/github/${gitHubServerApp.uuid}/configuration`)
					.set("x-forwarded-proto", "https") // otherwise cookies won't be returned cause they are "secure"
					.set(
						"Cookie",
						generateSignedSessionCookieHeader({
							jiraHost,
							githubToken: "the-token",
							githubRefreshToken: "blah",
							isJiraAdmin: true
						})
					);
				expect(response.status).toEqual(302);
				expect(response.headers.location).toContain("https://github.mydomain.com/login/oauth/authorize?");
			});
		});

		it("resetGithubToken should clear the session when resetGithubToken is set", async () => {
			const req = {
				log: getLogger("test"),
				query: { resetGithubToken: true, secondParams: true },
				originalUrl: "https://randomsite.com",
				session: { githubToken: "abc123", githubRefreshToken: "refresh-token" }
			};
			const res = {
				locals: {
					gitHubAppConfig: {},
					jiraHost,
					githubToken: ""
				},
				redirect: jest.fn(),
				status:() => ({ json: jest.fn() })
			};
			const next = jest.fn();

			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			await GithubAuthMiddleware(req, res, next);

			expect(req.session.githubToken).toBeUndefined();
			expect(req.session.githubRefreshToken).toBeUndefined();
			expect(res.redirect).toBeCalledWith("https://randomsite.com?secondParams=true");
		});
	});
});

