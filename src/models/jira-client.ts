import { getAxiosInstance, JiraClientError } from "../jira/client/axios";
import { AxiosInstance } from "axios";
import { Installation } from "./installation";
import Logger from "bunyan";
import { envVars } from "config/env";

// TODO: why are there 2 jira clients?
// Probably because this one has types :mindpop:
export class JiraClient {
	axios: AxiosInstance;

	static async getNewClient(installation: Installation, log: Logger) {
		const jiraClient = new JiraClient();
		jiraClient.axios = getAxiosInstance(
			installation.jiraHost,
			await installation.decrypt("encryptedSharedSecret", log),
			log
		);
		return jiraClient;
	}

	// Prevent constructing from outside
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	private constructor() { }

	/*
	 * Tests credentials by making a request to the Jira API
	 *
	 * @return {boolean} Returns true if client has access to Jira API
	 */
	async isAuthorized(): Promise<boolean> {
		try {
			return (await this.axios.get("/rest/devinfo/0.10/existsByProperties?fakeProperty=1")).status === 200;
		} catch (error) {
			if (!(error instanceof JiraClientError)) {
				throw error;
			}
			return false;
		}
	}

	async appPropertiesCreate(isConfiguredState: boolean) {
		return await this.axios.put(`/rest/atlassian-connect/latest/addons/${envVars.APP_KEY}/properties/is-configured`, {
			"isConfigured": isConfiguredState
		});
	}

	async appPropertiesGet() {
		return await this.axios.get(`/rest/atlassian-connect/latest/addons/${envVars.APP_KEY}/properties/is-configured`);
	}

	async appPropertiesDelete() {
		return await this.axios.delete(`/rest/atlassian-connect/latest/addons/${envVars.APP_KEY}/properties/is-configured`);
	}

	async linkedWorkspace(orgId: number) {
		const payload = {
			"workspaceIds": [orgId]
		};
		return await this.axios.post("/rest/security/1.0/linkedWorkspaces/bulk", payload);
	}

	async deleteWorkspace(orgId: number) {
		return await this.axios.delete(`/rest/security/1.0/linkedWorkspaces/bulk?workspaceIds=${orgId}`);
	}

	async checkAdminPermissions(accountId: string) {
		const payload = {
			accountId,
			globalPermissions: [
				"ADMINISTER"
			]
		};
		return await this.axios.post("/rest/api/latest/permissions/check", payload);
	}

}
