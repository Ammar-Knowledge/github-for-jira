/* eslint-disable @typescript-eslint/no-explicit-any */
import { getLogger } from "config/logger";
import { JiraClient } from "./jira-client";
import { DatabaseStateCreator } from "test/utils/database-state-creator";

describe("JiraClient", () => {
	let jiraClient: JiraClient;
	beforeEach(async () => {
		const { installation } = await new DatabaseStateCreator().create();
		jiraClient = await JiraClient.getNewClient(installation, getLogger("test"));
	});

	describe("isAuthorized()", () => {

		it("is true when response is 200", async () => {
			jiraNock
				.get("/rest/devinfo/0.10/existsByProperties?fakeProperty=1")
				.reply(200);

			const isAuthorized = await jiraClient.isAuthorized();
			expect(isAuthorized).toBe(true);
		});

		it("is false when response is 302", async () => {
			jiraNock
				.get("/rest/devinfo/0.10/existsByProperties?fakeProperty=1")
				.reply(302);

			const isAuthorized = await jiraClient.isAuthorized();
			expect(isAuthorized).toBe(false);
		});

		it("is false when response is 403", async () => {
			jiraNock
				.get("/rest/devinfo/0.10/existsByProperties?fakeProperty=1")
				.reply(403);

			const isAuthorized = await jiraClient.isAuthorized();
			expect(isAuthorized).toBe(false);
		});

		it("rethrows non-response errors", async () => {
			jest.spyOn(jiraClient.axios, "get").mockImplementation(() => {
				throw new Error("boom");
			});

			await expect(jiraClient.isAuthorized()).rejects.toThrow("boom");
		});
	});

	describe("appPropertiesCreate()", () => {
		test.each([true, false])("sets up %s",  async (value) => {
			jiraNock
				.put("/rest/atlassian-connect/latest/addons/com.github.integration.test-atlassian-instance/properties/is-configured", {
					isConfigured: value
				})
				.reply(200);

			expect(await jiraClient.appPropertiesCreate(value)).toBeDefined();
		});
	});

	describe("appPropertiesGet()", () => {
		it("returns data",  async () => {
			jiraNock
				.get("/rest/atlassian-connect/latest/addons/com.github.integration.test-atlassian-instance/properties/is-configured")
				.reply(200,{
					isConfigured: true
				});

			expect((await jiraClient.appPropertiesGet()).data.isConfigured).toBeTruthy();
		});
	});

	describe("appPropertiesDelete()", () => {
		it("deletes data",  async () => {
			jiraNock
				.delete("/rest/atlassian-connect/latest/addons/com.github.integration.test-atlassian-instance/properties/is-configured")
				.reply(200);

			expect(await jiraClient.appPropertiesDelete()).toBeDefined();
		});
	});
});
