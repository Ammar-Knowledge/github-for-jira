import { Subscription } from "models/subscription";
import { Request, Response } from "express";
import { statsd }  from "config/statsd";
import { metricHttpRequest } from "config/metric-names";
import { getJiraClient } from "~/src/jira/client/jira-client";

/**
 * Handle the uninstall webhook from Jira
 */
export const JiraEventsUninstallPost = async (req: Request, res: Response): Promise<void> => {
	const { installation } = res.locals;
	const subscriptions = await Subscription.getAllForHost(installation.jiraHost);

	if (subscriptions) {
		await Promise.all(subscriptions.map((sub) => sub.uninstall()));
	}

	statsd.increment(metricHttpRequest.uninstall);

	const jiraClient = await getJiraClient(installation.jiraHost, undefined, undefined, req.log);

	// Don't wait for promise as it might fail if the property is not set
	jiraClient.appProperties.delete();
	await installation.uninstall();

	req.log.info("App uninstalled on Jira.");
	res.sendStatus(204);
};
