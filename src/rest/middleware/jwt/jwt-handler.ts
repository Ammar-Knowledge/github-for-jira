import { Request, Response, NextFunction } from "express";
import Logger from "bunyan";
import { decodeSymmetric, getAlgorithm, AsymmetricAlgorithm, SymmetricAlgorithm } from "atlassian-jwt";
import { Installation } from "models/installation";
import { errorWrapper } from "../../helper";
import { InvalidTokenError } from "config/errors";
import { BaseLocals } from "../../routes";

const INVALID_SECRET = "some-invalid-secret";

export const JwtHandler = errorWrapper("JwtHandler", async (req: Request, res: Response<any, BaseLocals>, next: NextFunction) => {

	const token = req.headers["authorization"];

	if (!token) {
		throw new InvalidTokenError("Unauthorised");
	}

	try {
		const { installation, accountId } = await verifySymmetricJwt(token, req.log);
		res.locals.installation = installation;
		res.locals.jiraHost = installation.jiraHost;
		res.locals.accountId = accountId;
		next();

	} catch (e: unknown) {
		req.log.warn({ err: e }, "Failed to verify JWT token");
		throw new InvalidTokenError("Unauthorised");
	}

});

const verifySymmetricJwt = async (token: string, logger: Logger) => {
	const algorithm = getAlgorithm(token) as AsymmetricAlgorithm | SymmetricAlgorithm;

	// Decode without verification;
	const unverifiedClaims = decodeSymmetric(token, INVALID_SECRET, algorithm, true) as { iss?: string };
	if (!unverifiedClaims.iss) {
		throw new Error("JWT claim did not contain the issuer (iss) claim");
	}

	const issuer = unverifiedClaims.iss;
	const installation = await Installation.getForClientKey(issuer);
	if (!installation) {
		throw new Error("No Installation found");
	}

	const secret = await installation.decrypt("encryptedSharedSecret", logger);

	//decode and verify
	const claims = decodeSymmetric(token, secret, algorithm, false) as { sub?: string, exp?: number, qsh?: string };

	const expiry = claims.exp;

	if (expiry && (Date.now() / 1000 >= expiry)) {
		throw new Error("JWT Verification Failed, token is expired");
	}

	if (claims.qsh !== "context-qsh") {
		throw new Error("JWT Verification Failed, wrong qsh");
	}

	return { installation, accountId: claims.sub };
};
