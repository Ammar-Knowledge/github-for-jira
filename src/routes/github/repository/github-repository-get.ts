import Logger from "bunyan";
import { Request, Response } from "express";
import { createAppClient, createInstallationClient, createUserClient } from "utils/get-github-client-config";
import { RepositoryNode } from "~/src/github/client/github-queries";
import { Subscription } from "~/src/models/subscription";
import { sendError } from "~/src/jira/util/jwt";
const MAX_REPOS_RETURNED = 20;

export const GitHubRepositoryGet = async (req: Request, res: Response): Promise<void> => {
	const { githubToken, jiraHost: jiraHostLocals, gitHubAppConfig } = res.locals;
	const { jiraHost: jiraHostParam } = req.query;
	const repoName = req.query?.repoName as string;
	const jiraHost = jiraHostLocals || jiraHostParam;

	if (!jiraHost) {
		sendError(res, 401, "Unauthorised");
		return;
	}

	if (!githubToken) {
		res.sendStatus(401);
		return;
	}

	if (!repoName) {
		res.send(400);
		return;
	}

	try {
		const repositories = await searchInstallationAndUserRepos(repoName, jiraHost, gitHubAppConfig.gitHubAppId || null, githubToken, req.log);
		res.send({
			repositories
		});
	} catch (err) {
		req.log.error({ err }, "Error fetching repositories");
		res.status(500).send({
			repositories: []
		});
	}
};

export const searchInstallationAndUserRepos = async (repoName, jiraHost, gitHubAppId, githubToken, logger) => {
	try {
		const subscriptions = await Subscription.getAllForHost(jiraHost, gitHubAppId);
		const repos = await getReposBySubscriptions(repoName, subscriptions, jiraHost, githubToken, logger);
		return repos || [];
	} catch (err) {
		logger.log.error({ err }, "Failed to get repos for subscription");
		return [];
	}
};

const getReposBySubscriptions = async (repoName: string, subscriptions: Subscription[], jiraHost: string, githubToken:string, logger: Logger): Promise<RepositoryNode[]> => {
	const repoTasks = subscriptions.map(async (subscription) => {
		try {
			const [orgName, gitHubInstallationClient, gitHubUserClient] = await Promise.all([
				getOrgName(subscription, jiraHost, logger),
				createInstallationClient(subscription.gitHubInstallationId, jiraHost, logger, subscription.gitHubAppId),
				createUserClient(githubToken, jiraHost, logger, subscription.gitHubAppId)
			]);
			const gitHubUser = (await gitHubUserClient.getUser()).data.login;
			const searchQueryInstallationString = `${repoName} org:${orgName} in:name`;
			const searchQueryUserString = `${repoName} org:${orgName} org:${gitHubUser} in:name`;
			const [responseInstallationSearch, responseUserSearch] = await Promise.all([
				gitHubInstallationClient.searchRepositories(searchQueryInstallationString, "updated"),
				gitHubUserClient.searchRepositories(searchQueryUserString, "updated")
			]);

			const userInstallationSearch = responseInstallationSearch.data?.items || [];
			const userClientSearch = responseUserSearch.data?.items || [];

			const repos = getIntersectingRepos(userInstallationSearch, userClientSearch);

			return repos;
		} catch (err) {
			logger.error({ err }, "Create branch - Failed to search repos for installation");
			throw err;
		}
	});
	const repos = (await Promise.all(repoTasks))
		.flat()
		.sort(sortByScoreAndUpdatedAt);
	return repos.slice(0, MAX_REPOS_RETURNED);
};

// We want repos that exist in installation client and user client.
const getIntersectingRepos = (installationRepos, userRepos) => {
	const intersection: RepositoryNode[] = [];
	installationRepos.forEach((installationRepo) => {
		userRepos.forEach((userRepo) => {
			if (installationRepo.id === userRepo.id) {
				intersection.push(installationRepo);
			}
		});
	});
	return intersection;
};

const sortByScoreAndUpdatedAt = (a, b) => {
	if (a.score != b.score) {
		return a.score - b.score;
	}
	return new Date(b.updated_at).valueOf() - new Date(a.updated_at).valueOf();
};

const getOrgName = async (subscription: Subscription, jiraHost: string, logger: Logger) => {
	const gitHubAppClient = await createAppClient(logger, jiraHost, subscription.gitHubAppId);
	const response = await gitHubAppClient.getInstallation(subscription.gitHubInstallationId);
	return response.data?.account?.login;
};
