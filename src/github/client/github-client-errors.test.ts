import { GithubClientBlockedIpError } from "./github-client-errors";

describe("GitHubClientError", () => {

	it("propagates the stacktrace", async () => {
		const error = new GithubClientBlockedIpError({
			name: "BlockedIpError",
			message: "ignored",
			stack: "existing stack trace line 1\nexisting stack trace line 2\nexisting stack trace line 3",
			config: {},
			isAxiosError: true,
			toJSON: () => {
				return {};
			}
		});

		expect(error.stack).toContain("Blocked by GitHub allowlist");
		expect(error.stack).toContain("existing stack trace line 1");
		expect(error.stack).toContain("existing stack trace line 2");
		expect(error.stack).toContain("existing stack trace line 3");
	});
});
