import { Request, Response } from "express";
import { GitHubServerApp } from "models/github-server-app";
import { validateUrl } from "utils/validate-url";
import { statsd } from "config/statsd";
import { metricError } from "config/metric-names";
import { sendAnalytics } from "utils/analytics-client";
import { AnalyticsEventTypes, AnalyticsTrackEventsEnum, AnalyticsTrackSource } from "interfaces/common";
import { createAnonymousClient } from "utils/get-github-client-config";
import { booleanFlag, BooleanFlags } from "config/feature-flags";

const GITHUB_CLOUD_HOSTS = ["github.com", "www.github.com"];

enum ErrorResponseCode {
	INVALID_URL = "GHE_ERROR_INVALID_URL",
	CLOUD_HOST = "GHE_ERROR_GITHUB_CLOUD_HOST",
	CANNOT_CONNECT = "GHE_ERROR_CANNOT_CONNECT"
}

const isInteger = (n: string) => {
	return !isNaN(Number(n));
};

const sendErrorMetricAndAnalytics = (jiraHost: string, errorCode: ErrorResponseCode, maybeStatus: string | undefined = undefined) => {
	const errorCodeAndStatusObj: { errorCode: string, status?: string } = { errorCode };
	if (maybeStatus) {
		errorCodeAndStatusObj.status = maybeStatus;
	}
	statsd.increment(metricError.gheServerUrlError, errorCodeAndStatusObj);

	sendAnalytics(AnalyticsEventTypes.TrackEvent, {
		name: AnalyticsTrackEventsEnum.GitHubServerUrlErrorTrackEventName,
		source: AnalyticsTrackSource.CreateBranch,
		jiraHost,
		...errorCodeAndStatusObj
	});
};

export const JiraConnectEnterprisePost = async (
	req: Request,
	res: Response
): Promise<void> => {

	// Must be configurable and re-evaluated on each execution for testing, therefore
	// inside the handler
	const TIMEOUT_PERIOD_MS = parseInt(process.env.JIRA_CONNECT_ENTERPRISE_POST_TIMEOUT_MSEC || "30000");

	const { gheServerURL } = req.body;
	const { id: installationId } = res.locals.installation;

	const jiraHost = res.locals.jiraHost;

	req.log.debug(`Verifying provided GHE server url ${gheServerURL} is a valid URL`);
	const urlValidationResult = validateUrl(gheServerURL);

	if (!urlValidationResult.isValidUrl) {
		res.status(200).send({
			success: false,
			errors: [{ code: ErrorResponseCode.INVALID_URL, reason: urlValidationResult.reason }]
		});
		req.log.info(`The entered URL is not valid. ${gheServerURL} is not a valid url`);
		sendErrorMetricAndAnalytics(jiraHost, ErrorResponseCode.INVALID_URL);
		return;
	}

	if (GITHUB_CLOUD_HOSTS.includes(new URL(gheServerURL).hostname)) {
		res.status(200).send({ success: false, errors: [ { code: ErrorResponseCode.CLOUD_HOST } ] });
		req.log.info("The entered URL is GitHub cloud site, return error");
		sendErrorMetricAndAnalytics(jiraHost, ErrorResponseCode.CLOUD_HOST);
		return;
	}

	try {
		const gitHubServerApps = await GitHubServerApp.getAllForGitHubBaseUrlAndInstallationId(gheServerURL, installationId);

		if (gitHubServerApps?.length) {
			req.log.debug(`GitHub apps found for url: ${gheServerURL}. Redirecting to Jira list apps page.`);
			res.status(200).send({ success: true, appExists: true });
			return;
		}

		req.log.debug(`No existing GitHub apps found for url: ${gheServerURL}. Making request to provided url.`);

		const client = await createAnonymousClient(gheServerURL, jiraHost, req.log);
		await client.getMainPage(TIMEOUT_PERIOD_MS);
		res.status(200).send({ success: true, appExists: false });

		sendAnalytics(AnalyticsEventTypes.TrackEvent, {
			name: AnalyticsTrackEventsEnum.GitHubServerUrlTrackEventName,
			source: AnalyticsTrackSource.GitHubEnterprise,
			jiraHost: jiraHost
		});
	} catch (err) {
		req.log.warn({ err, gheServerURL }, `Couldn't access GHE host`);
		const codeOrStatus = "" + (err.code || err.response.status);

		if (await booleanFlag(BooleanFlags.RELAX_GHE_URLS_CHECK, jiraHost)) {
			req.log.info({ err, gheServerURL }, `Couldn't access GHE host, result of whether skip the check is ${!err.code && err.response?.status}`);
			if (!err.code && err.response?.status) {
				//err.code means there's error on the tcp/https connection,
				//err.status means traffic reach signals, but server reject it.
				//as long as there's no code and a status, means server returns something
				//so the domain name is reachable, it is just it required some api tokens to be accessible
				res.status(200).send({ success: true, appExists: false });
				return;
			}
		}

		res.status(200).send({
			success: false, errors: [{
				code: ErrorResponseCode.CANNOT_CONNECT,
				reason:
					isInteger(codeOrStatus)
						? `received ${codeOrStatus} response`
						: codeOrStatus
			}]
		});
		sendErrorMetricAndAnalytics(jiraHost, ErrorResponseCode.CANNOT_CONNECT, codeOrStatus);
	}
};
