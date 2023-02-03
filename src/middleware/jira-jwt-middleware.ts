import { Installation } from "models/installation";
import { NextFunction, Request, Response } from "express";
import { sendError, TokenType, verifySymmetricJwtTokenMiddleware } from "../jira/util/jwt";
import { booleanFlag, BooleanFlags } from "~/src/config/feature-flags";

export const verifyJiraJwtMiddleware = (tokenType: TokenType) => async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {

	if (await booleanFlag(BooleanFlags.NEW_JWT_VALIDATION)) {
		req.log.info("Skipping verifyJiraJwtMiddleware...");
		return next();
	}
	req.log.info("Executing verifyJiraJwtMiddleware...");

	const { jiraHost } = res.locals;

	if (!jiraHost) {
		sendError(res, 401, "Unauthorised");
		return;
	}

	const installation = await Installation.getForHost(jiraHost);

	if (!installation) {
		return next(new Error("Not Found"));
	}
	// TODO: Probably not the best place to set things globally
	res.locals.installation = installation;

	req.addLogFields({
		jiraHost: installation.jiraHost,
		jiraClientKey:
			installation.clientKey && `${installation.clientKey.substr(0, 5)}***`
	});

	verifySymmetricJwtTokenMiddleware(
		await installation.decrypt("encryptedSharedSecret", req.log),
		tokenType,
		req,
		res,
		next);
};

export const JiraJwtTokenMiddleware = verifyJiraJwtMiddleware(TokenType.normal);
export const JiraContextJwtTokenMiddleware = verifyJiraJwtMiddleware(TokenType.context);
