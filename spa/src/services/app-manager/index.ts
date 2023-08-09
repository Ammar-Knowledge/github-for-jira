import Api from "../../api";
import { OrganizationsResponse } from "rest-interfaces";
import { AxiosError } from "axios";
import { popup, reportError } from "../../utils";

async function fetchOrgs(): Promise<OrganizationsResponse | AxiosError> {
	if (!Api.token.hasGitHubToken()) return { orgs: [] };

	try {
		const response = await Api.orgs.getOrganizations();
		return response.data;
	} catch (e) {
		reportError(e);
		return e as AxiosError;
	}
}

async function connectOrg(orgId: number): Promise<boolean | AxiosError> {
	if (!Api.token.hasGitHubToken()) return false;

	try {
		const response = await Api.orgs.connectOrganization(orgId);
		return response.status === 200;
	} catch (e) {
		reportError(e);
		return e as AxiosError;
	}
}

let lastOpenWin: WindowProxy | null = null;
async function installNewApp(callbacks: {
	onFinish: (gitHubInstallationId: number | undefined) => void,
	onRequested: (setupAction: string) => void
}): Promise<void> {

	const app = await Api.app.getAppNewInstallationUrl();

	if(lastOpenWin) {
		//do nothing, as there's already an win opened.
		return;
	}

	const winInstall = lastOpenWin = popup(app.data.appInstallationUrl);

	const handler = async (event: MessageEvent) => {
		lastOpenWin = null;
		if (event.data?.type === "install-callback" && event.data?.gitHubInstallationId) {
			const id = parseInt(event.data?.gitHubInstallationId);
			callbacks.onFinish(isNaN(id) ? undefined : id);
		}
		if (event.data?.type === "install-requested" && event.data?.setupAction) {
			const setupAction = event.data?.setupAction;
			callbacks.onRequested(setupAction);
		}
	};
	window.addEventListener("message", handler);

	// Still need below interval for window close
	// As user might not finish the app install flow, there's no guarantee that above message
	// event will happen.
	const hdlWinInstall = setInterval(() => {
		if (winInstall?.closed) {
			try {
				lastOpenWin = null;
				setTimeout(() => window.removeEventListener("message", handler), 1000); //give time for above message handler to kick off
			} catch (e) {
				reportError(e);
			} finally {
				clearInterval(hdlWinInstall);
			}
		}
	}, 1000);
}

export default {
	fetchOrgs,
	connectOrg,
	installNewApp
};
