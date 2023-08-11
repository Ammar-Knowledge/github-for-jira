import { NextFunction, Request, Response } from "express";
import { JiraClient } from "models/jira-client";
import { booleanFlag, BooleanFlags } from "config/feature-flags";
import { InsufficientPermissionError, InvalidTokenError } from "config/errors";
import { errorWrapper } from "../../helper";

const ADMIN_PERMISSION = "ADMINISTER";
export const JiraAdminEnforceMiddleware = errorWrapper("jiraAdminEnforceMiddleware", async (req: Request, res: Response, next: NextFunction): Promise<void | Response>  => {

	const { accountId, installation, jiraHost } = res.locals;

	if (!(await booleanFlag(BooleanFlags.JIRA_ADMIN_CHECK, jiraHost))) {
		return next();
	}

	if (!accountId) {
		throw new InvalidTokenError("Missing userAccountId");
	}

	const jiraClient = await JiraClient.getNewClient(installation, req.log);

	const permissions = await jiraClient.checkAdminPermissions(accountId);

	const isAdmin = permissions.data.globalPermissions.includes(ADMIN_PERMISSION);
	if (!isAdmin) {
		throw new InsufficientPermissionError("Forbidden - User does not have Jira administer permissions.");
	}

	req.log.debug({ isAdmin }, "Admin permissions checked");
	next();

});
