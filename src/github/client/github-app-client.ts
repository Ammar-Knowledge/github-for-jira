import Logger from "bunyan";
import { Octokit } from "@octokit/rest";
import { AxiosRequestConfig, AxiosRequestHeaders, AxiosResponse } from "axios";
import { AppTokenHolder } from "./app-token-holder";
import { AuthToken } from "~/src/github/client/auth-token";
import { GITHUB_ACCEPT_HEADER } from "./github-client-constants";
import { GitHubClient, GitHubConfig, Metrics } from "./github-client";

/**
 * A GitHub client that supports authentication as a GitHub app.
 * This is the top level app API: get all installations of this app, or get more info on this app
 *
 * @see https://docs.github.com/en/developers/apps/building-github-apps/authenticating-with-github-apps
 */
export class GitHubAppClient extends GitHubClient {
	private readonly appToken: AuthToken;

	constructor(
		gitHubConfig: GitHubConfig,
		metrics: Metrics,
		logger: Logger,
		appId: string,
		privateKey: string
	) {
		super(gitHubConfig, metrics, logger);
		this.appToken = AppTokenHolder.createAppJwt(privateKey, appId);

		this.axios.interceptors.request.use((config: AxiosRequestConfig) => {
			return {
				...config,
				headers: {
					...config.headers,
					...this.appAuthenticationHeaders()
				}
			};
		});
	}

	public getUserMembershipForOrg = async (username: string, org: string): Promise<AxiosResponse<Octokit.OrgsGetMembershipResponse>> => {
		return await this.axios.get<Octokit.OrgsGetMembershipResponse>(`/orgs/{org}/memberships/{username}`, {
			urlParams: {
				username,
				org
			}
		});
	};

	public getApp = async (): Promise<AxiosResponse<Octokit.AppsGetAuthenticatedResponse>> => {
		return await this.axios.get<Octokit.AppsGetAuthenticatedResponse>(`/app`, {});
	};

	/**
	 * Use this config in a request to authenticate with the app token.
	 */
	private appAuthenticationHeaders(): Partial<AxiosRequestHeaders> {
		return {
			Accept: GITHUB_ACCEPT_HEADER,
			Authorization: `Bearer ${this.appToken.token}`
		};
	}

	public getInstallation = async (installationId: number): Promise<AxiosResponse<Octokit.AppsGetInstallationResponse>> => {
		return await this.axios.get<Octokit.AppsGetInstallationResponse>(`/app/installations/{installationId}`, {
			urlParams: {
				installationId
			}
		});
	};

	public getInstallations = async (): Promise<AxiosResponse<Octokit.AppsGetInstallationResponse[]>> => {
		return await this.axios.get<Octokit.AppsGetInstallationResponse[]>(`/app/installations`, {});
	};
}
