/* eslint-disable jest/expect-expect */
import supertest from "supertest";
import { getFrontendApp } from "~/src/app";
import { Application } from "express";

describe("Github Setup 5ku redirector", () => {
	let frontendApp: Application;

	beforeEach(async () => {
		frontendApp = getFrontendApp();
	});

	describe("#GET", () => {

		it("should notify page on success org installation", async () => {
			await supertest(frontendApp).get("/github/setup?installation_id=12345&state=spa")
				.expect(302)
				.expect("location", "/rest/app/cloud/github-installed?installation_id=12345");
		});

		it("should notify page on requested org installation", async () => {
			await supertest(frontendApp).get("/github/setup?setup_action=request&state=spa")
				.expect(302)
				.expect("location", "/rest/app/cloud/github-requested?setup_action=request");
		});

		it("should continue to next route if no spa exp set", async () => {
			await supertest(frontendApp).get("/github/setup?setup_action=request")
				.expect(401); // coz it goes to next route, which expect an jira jwt token in session cookie
		});

	});

});
