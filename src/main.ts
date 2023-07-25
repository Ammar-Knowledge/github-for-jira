import { Express } from "express";
import "config/env"; // Important to be before other dependencies
import { getLogger } from "config/logger";
import throng from "throng";
import { initializeSentry } from "config/sentry";
import { isNodeProd } from "utils/is-node-env";
import { getFrontendApp } from "./app";

const start = async () => {
	initializeSentry();
	const app: Express = getFrontendApp();
	const port = Number(process.env.TUNNEL_PORT) || Number(process.env.PORT) || 8080;
	app.listen(port, () => {
		getLogger("frontend-app").info(`started at port ${port}`);
	});
};

if (isNodeProd()) {
	// Production clustering (one process per core)
	throng({
		worker: start,
		lifetime: Infinity
	});
} else {
	// Dev/test single process, don't need clustering
	// eslint-disable-next-line @typescript-eslint/no-floating-promises
	start();
}

