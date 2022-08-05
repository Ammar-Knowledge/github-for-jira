import supertest from "supertest";
import express, { Express } from "express";
import { getFrontendApp } from "../../app";
import { getLogger } from "config/logger";

describe("Session GET", () => {
	let app: Express;

	beforeEach(() => {
		app = express();
		app.use((request, _, next) => {
			request.log = getLogger("test");
			next();
		});
	});

	describe("Frontend", () => {
		beforeEach(() => {
			app.use(getFrontendApp({
				getSignedJsonWebToken: () => "",
				getInstallationAccessToken: async () => ""
			}));
		});

		it("Testing loading when redirecting to GitHub", () =>
			supertest(app)
				.get("/session/jira/atlassian-connect.json?ghRedirect=to&foo=bar&ice=berg")
				.expect(200)
				.then(response => {
					expect(response.text.includes("Redirecting to your GitHub Enterprise Server instance")).toBeTruthy();
					expect(response.text.includes("Receiving data from your GitHub Enterprise Server")).toBeFalsy();
					expect(response.text.includes("Loading...")).toBeFalsy();
				})
		);

		it("Testing loading when redirecting from GitHub", () =>
			supertest(app)
				.get("/session/jira/atlassian-connect.json?ghRedirect=from&foo=bar&ice=berg")
				.expect(200)
				.then(response => {
					expect(response.text.includes("Retrieving data from your GitHub Enterprise Server")).toBeTruthy();
					expect(response.text.includes("Redirecting to your GitHub Enterprise Server instance")).toBeFalsy();
					expect(response.text.includes("Loading...")).toBeFalsy();
				})
		);

		it("Testing loading when no query params", () =>
			supertest(app)
				.get("/session/jira/atlassian-connect.json")
				.expect(200)
				.then(response => {
					expect(response.text.includes("Loading...")).toBeTruthy();
					expect(response.text.includes("Retrieving data from your GitHub Enterprise Server")).toBeFalsy();
					expect(response.text.includes("Redirecting to your GitHub Enterprise Server instance")).toBeFalsy();
				}));
	});
});