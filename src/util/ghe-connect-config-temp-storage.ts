import IORedis  from "ioredis";
import { v4 as newUUID } from "uuid";
import { getRedisInfo } from "config/redis-info";
import { GitHubServerApp } from "models/github-server-app";

/**
 * Contains minimum set of parameters that are needed to reach a GHE server. It might return 401, we don't care,
 * important bit is that there's a connectivity between the app and the GHE.
 */
export interface GheConnectConfig {
	serverUrl: string;

	// TODO: API key config will come here
	// apiKeyHeaderName: string | undefined;
	// encryptedApiKeyValue: string | undefined;
}

const REDIS_CLEANUP_TIMEOUT = 7 * 24 * 3600 * 1000;

const redis = new IORedis(getRedisInfo("GheConnectConfigTempStorage"));

export class GheConnectConfigTempStorage {

	async store(config: GheConnectConfig, installationId: number): Promise<string> {
		const key = newUUID();
		// We don't want to pollute redis, autoexpire after the flag is not being updated
		await redis.set(this.toRedisKey(key, installationId), JSON.stringify(config), "px", REDIS_CLEANUP_TIMEOUT);
		return key;
	}

	async get(uuid: string, installationId: number): Promise<GheConnectConfig | null> {
		const config = await redis.get(this.toRedisKey(uuid, installationId));
		if (!config) {
			return null;
		}
		return JSON.parse(config) as GheConnectConfig;
	}

	async delete(uuid: string, installationId: number) {
		await redis.unlink(this.toRedisKey(uuid, installationId));
	}

	// installationId is additional layer of security, to make sure only no other tenants can access it by UUID
	private toRedisKey(uuid: string, installationId: number): string {
		return `ghe_config_${installationId}_${uuid}`;
	}
}

/**
 * This first looks up the temp storage and then if not found checks the database (if there's already such
 * server with this UUID)
 */
export const resolveIntoConnectConfig = async (tempConnectConfigUuidOrServerUuid: string, installationId: number): Promise<GheConnectConfig | undefined> => {
	const connectConfig = await new GheConnectConfigTempStorage().get(tempConnectConfigUuidOrServerUuid, installationId);
	if (connectConfig) {
		return connectConfig;
	}
	const existingServer = await GitHubServerApp.findForUuid(tempConnectConfigUuidOrServerUuid);
	if (existingServer && existingServer.installationId === installationId) {
		return {
			serverUrl: existingServer.gitHubBaseUrl
			// TODO: add API key data
		};
	}
	return undefined;
};

