import { envVars } from "config/env";
import axios, { AxiosInstance } from "axios";
import { getLogger } from "config/logger";

export enum EncryptionSecretKeyEnum {
	GITHUB_SERVER_APP = "github-server-app-secrets",
	JIRA_INSTANCE_SECRETS = "jira-instance-secrets",
}

export type EncryptionContext = Record<string, string | number>;
const logger = getLogger("encryption-client");

interface EncryptResponse {
	cipherText: string;
}

interface DecryptResponse {
	plainText: string;
}

/**
 * This client calling using Cryptor side-car to encrypt/decrypt data.
 *
 * How to use:
 *
 * - Without encryption context: Same, but just don't pass the context
 *   const encrypted = await EncryptionClient.encrypt(EncryptionSecretKeyEnum.GITHUB_SERVER_APP, "super-secret-secret");
 *
 */
export class EncryptionClient {

	protected static readonly axios: AxiosInstance = axios.create({
		baseURL: envVars.CRYPTOR_URL,
		headers: {
			"X-Cryptor-Client": envVars.CRYPTOR_SIDECAR_CLIENT_IDENTIFICATION_CHALLENGE,
			"Content-Type": "application/json; charset=utf-8"
		}
	});

	static async encrypt(secretKey: EncryptionSecretKeyEnum, plainText: string, encryptionContext: EncryptionContext = {}): Promise<string> {
		try {
			const response = await this.axios.post<EncryptResponse>(`/cryptor/encrypt/micros/github-for-jira/${secretKey}`, {
				plainText,
				encryptionContext
			});
			return response.data.cipherText;
		} catch (e) {
			logger.error("Cryptor encrypt request failed");
			throw e;
		}
	}

	static async decrypt(cipherText: string, encryptionContext: EncryptionContext = {}): Promise<string> {
		try {
			const response = await this.axios.post<DecryptResponse>(`/cryptor/decrypt`, {
				cipherText,
				encryptionContext
			});
			return response.data.plainText;
		} catch (e) {
			logger.error("Cryptor decrypt request failed");
			throw e;
		}
	}

	static async encryptAndDecryptCheck() {
		try {
			const plainText = `plain-text-${Date.now()}`;
			const cipherText = await EncryptionClient.encrypt(EncryptionSecretKeyEnum.GITHUB_SERVER_APP, plainText);
			const decryptedText = await EncryptionClient.decrypt(cipherText);
			if (plainText !== decryptedText) throw new Error(`Decrypted text ${decryptedText} is not the same as orign dummy plain text ${plainText}`);
		} catch (e) {
			throw new Error(`Cryptor is not ready. detail: ${e}`);
		}
	}
}
