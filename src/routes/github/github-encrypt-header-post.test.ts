import supertest from "supertest";
import { getSignedCookieHeader } from "test/utils/cookies";
import { getFrontendApp } from "~/src/app";
import { when } from "jest-when";
import { stringFlag, StringFlags } from "config/feature-flags";
import { Installation } from "~/src/models/installation";

jest.mock("config/feature-flags");

describe("Github Encrypt Header post endpoint", () => {
	const frontendApp = getFrontendApp();

	beforeEach(async() => {
		await Installation.create({
			jiraHost,
			clientKey: "abc123",
			encryptedSharedSecret: "ghi345"
		});
	});

	it("should return 400 when header is not provided", async () => {
		when(stringFlag)
			.calledWith(StringFlags.HEADERS_TO_ENCRYPT, expect.anything(), jiraHost)
			.mockResolvedValue(undefined);

		await supertest(frontendApp)
			.post("/github/encrypt/header")
			.set(
				"Cookie",
				getSignedCookieHeader({
					jiraHost
				})
			)
			.set(
				"tEst-heAder",
				"blah"
			)
			.expect(res => {
				expect(res.status).toBe(401);
			});
	});

	it("should return encrypted header", async () => {
		when(stringFlag)
			.calledWith(StringFlags.HEADERS_TO_ENCRYPT, expect.anything(), jiraHost)
			.mockResolvedValue(" test-HEADER  ");

		await supertest(frontendApp)
			.post("/github/encrypt/header")
			.set(
				"Cookie",
				getSignedCookieHeader({
					jiraHost
				})
			)
			.set(
				"tEst-heAder",
				"blah"
			)
			.expect(res => {
				expect(res.status).toBe(200);
				expect(res.body).toMatchObject({
					encryptedValue: "encrypted:blah",
					plainValueSha256: "8b7df143d91c716ecfa5fc1730022f6b421b05cedee8fd52b1fc65a96030ad52",
					jiraHost
				});
			});
	});
});
