import { expect, Page, test } from "@playwright/test";
import { jiraAddProject, jiraCreateIssue, jiraLogin, jiraRemoveProject } from "test/e2e/utils/jira";
import { testData } from "test/e2e/constants";

test.describe("Create branch", () => {
	let page: Page;
	const data = testData.jira;

	test.beforeEach(async ({ page: newPage }) => {
		page = newPage;
		await jiraLogin(page, "admin");
		await jiraAddProject(page);
	});

	test.use({
		storageState: testData.jira.roles.admin.state
	});

	test.describe("cloud", () => {
		// Create a fresh issue per test
		test.beforeEach(async() => {
			await jiraCreateIssue(page);
		});

		test("When there are no GitHub connections", async () => {
			await page.goto(data.urls.testProjectIssue);
			await (page.locator("a[data-testid='development-summary-common.ui.summary-item.link-formatted-button']")).click();
			const poppedUpPage = await page.waitForEvent("popup");
			await poppedUpPage.waitForLoadState();
			expect(poppedUpPage.getByText("Almost there!")).toBeTruthy();
			await poppedUpPage.close();
		});
	});

	// Clean up projects to avoid conflicts in future
	test.afterEach(async() => {
		await jiraRemoveProject(page);
	});

});

