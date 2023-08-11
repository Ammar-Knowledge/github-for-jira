import { Request, Response, NextFunction } from "express";
import { GitHubServerApp } from "~/src/models/github-server-app";
import { sendAnalytics } from "utils/analytics-client";
import { AnalyticsEventTypes, AnalyticsTrackEventsEnum, AnalyticsTrackSource } from "interfaces/common";
import { validateApiKeyInputsAndReturnErrorIfAny } from "utils/api-key-validator";

export const JiraConnectEnterpriseAppPut = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	req.log.debug("Received Jira Connect Enterprise App PUT request to update app.");
	try {
		const { gitHubAppConfig: verifiedApp, jiraHost } = res.locals;

		if (!verifiedApp.gitHubAppId || verifiedApp.uuid !== req.body.uuid) {
			res.status(404).send({ message: "No GitHub App found. Cannot update." });
			return next(new Error("No GitHub App found for provided UUID and installationId."));
		}

		const updatedAppPayload = { ...req.body };
		if (!updatedAppPayload.privateKey) {
			updatedAppPayload.privateKey = undefined;
		}

		const maybeApiKeyInputsError = validateApiKeyInputsAndReturnErrorIfAny(req.body.apiKeyHeaderName, req.body.apiKeyValue);
		if (maybeApiKeyInputsError) {
			req.log.warn({ apiKeyHeaderName: req.body.apiKeyHeaderName, apiKeyValue: req.body.apiKeyValue }, maybeApiKeyInputsError);
			res.sendStatus(400); // Let's not bother too much: the same validation happened in frontend
			return;
		}

		await GitHubServerApp.updateGitHubAppByUUID({
			... req.body,
			encryptedApiKeyValue: req.body.apiKeyValue
				? await GitHubServerApp.encrypt(res.locals.installation.jiraHost, req.body.apiKeyValue)
				: null
		}, jiraHost);

		sendAnalytics(res.locals.jiraHost, AnalyticsEventTypes.TrackEvent, {
			action: AnalyticsTrackEventsEnum.UpdateGitHubServerAppTrackEventName,
			actionSubject: AnalyticsTrackEventsEnum.UpdateGitHubServerAppTrackEventName,
			source: AnalyticsTrackSource.GitHubEnterprise
		}, {
			success: true
		});

		res.status(202).send();
		req.log.debug("Jira Connect Enterprise App updated successfully.");
	} catch (error) {

		sendAnalytics(res.locals.jiraHost, AnalyticsEventTypes.TrackEvent, {
			action: AnalyticsTrackEventsEnum.UpdateGitHubServerAppTrackEventName,
			actionSubject: AnalyticsTrackEventsEnum.UpdateGitHubServerAppTrackEventName,
			source: AnalyticsTrackSource.GitHubEnterprise
		}, {
			success: false
		});

		res.status(404).send({ message: "Failed to update GitHub App." });
		return next(new Error(`Failed to update GitHub app: ${error}`));
	}
};
