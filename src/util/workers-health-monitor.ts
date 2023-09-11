import { stopHealthcheck } from "utils/healthcheck-stopper";
import Logger from "bunyan";
import cluster from "cluster";
const CONF_SHUTDOWN_MSG = "shutdown";

export const startMonitorOnWorker = (parentLogger: Logger, iAmAliveInervalMsec: number) => {
	const logger = parentLogger.child({ isWorker: true });
	logger.info({ iAmAliveInervalMsec }, "worker config");

	process.on("message", (msg) => {
		logger.info(`worker received a message: ${msg}`);
		if (msg === CONF_SHUTDOWN_MSG) {
			logger.warn("shutdown received, stop healthcheck");
			stopHealthcheck();
		}
	});

	const workerPingingServerInterval = setInterval(() => {
		if (typeof process.send === "function") {
			logger.info("sending I'm alive");
			process.send(`${process.pid}`);
		} else {
			logger.error("process.send is undefined in worker, shouldn't happen");
			clearInterval(workerPingingServerInterval);
		}
	}, iAmAliveInervalMsec);
	return workerPingingServerInterval;
};


export const startMonitorOnMaster = (parentLogger: Logger, config: {
	pollIntervalMsecs: number,
	workerStartupTimeMsecs: number,
	workerUnresponsiveThresholdMsecs: number,
	numberOfWorkersThreshold: number,
}) => {
	const logger = parentLogger.child({ isWorker: false });
	logger.info(config, "master config");

	const registeredWorkers: Record<string, boolean> = { }; // pid => true
	const liveWorkers: Record<string, number> = { }; // pid => timestamp

	const registerNewWorkers = () => {
		logger.info(`registering workers`);
		for (const worker of Object.values(cluster.workers)) {
			if (worker) {
				const workerPid = worker.process.pid;
				if (!registeredWorkers[workerPid]) {
					logger.info(`registering a new worker with pid=${workerPid}`);
					registeredWorkers[workerPid] = true;
					worker.on("message", () => {
						logger.info(`received message from worker ${workerPid}, marking as live`);
						liveWorkers[workerPid] = Date.now();
					});
				}
			}
		}
	};

	let workersReadyAt: undefined | Date;
	const areWorkersReady = () => workersReadyAt && workersReadyAt.getTime() < Date.now();
	const maybeSetupWorkersReadyAt = () => {
		if (!workersReadyAt) {
			if (Object.keys(registeredWorkers).length > config.numberOfWorkersThreshold) {
				workersReadyAt = new Date(Date.now() + config.workerStartupTimeMsecs);
				logger.info(`consider workers as ready after ${workersReadyAt}`);
			} else {
				logger.info("no enough workers");
			}
		} else {
			logger.info({
				workersReadyAt
			}, "workersReadyAt is defined");
		}
	};

	const maybeRemoveDeadWorkers = () => {
		if (areWorkersReady()) {
			logger.info(`removing dead workers`);
			const keysToKill: Array<string> = [];
			const now = Date.now();
			Object.keys(liveWorkers).forEach((key) => {
				if (now - liveWorkers[key] > config.workerUnresponsiveThresholdMsecs) {
					keysToKill.push(key);
				}
			});
			keysToKill.forEach((key) => {
				logger.info(`remove worker with pid=${key} from live workers`);
				delete liveWorkers[key];
			});
		} else {
			logger.warn("workers are not ready yet, skip removing logic");
		}
	};

	const maybeSendShutdownToAllWorkers = () => {
		const nLiveWorkers = Object.keys(liveWorkers).length;
		if (areWorkersReady() && (nLiveWorkers < config.numberOfWorkersThreshold)) {
			logger.info({
				nLiveWorkers
			}, `send shutdown signal to all workers`);
			for (const worker of Object.values(cluster.workers)) {
				worker?.send(CONF_SHUTDOWN_MSG);
			}
		} else {
			logger.info({
				areWorkersReady: areWorkersReady(),
				nLiveWorkers
			}, "not sending shutdown signal");
		}
	};

	return setInterval(() => {
		registerNewWorkers(); // must be called periodically to make sure we pick up new/respawned workers
		maybeSetupWorkersReadyAt();
		maybeRemoveDeadWorkers();
		maybeSendShutdownToAllWorkers();
	}, config.pollIntervalMsecs);
};
