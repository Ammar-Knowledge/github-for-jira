import { AuditInfo, saveAuditLog } from "../../services/audit-log-service";
import { isArray, isObject } from "lodash";

const getAuditInfo = ({
	acceptedGithubEntities,
	repoEntities,
	githubEntityType,
	options
}) => {
	const auditInfo: Array<AuditInfo> = [];
	const createdAt = new Date();
	acceptedGithubEntities.map((githubEntityId) => {
		const repoEntity = repoEntities.find(({ id }) => id.toString() === githubEntityId);
		const issueKeys = repoEntity?.issueKeys;
		issueKeys.map((issueKey) => {
			const obj: AuditInfo = {
				createdAt,
				entityId: githubEntityId,
				entityType: githubEntityType,
				issueKey,
				subscriptionId: options?.subscriptionId,
				source: options?.auditLogsource || "WEBHOOK",
				entityAction: options?.entityAction || "null"
			};
			if (obj.subscriptionId && obj.entityId) {
				auditInfo.push(obj);
			}
		});
	});
	return auditInfo;
};

export const processBatchedBulkUpdateResp = ({
	reqRepoData,
	response,
	options,
	logger
}): {
	isSuccess: boolean;
	auditInfo?: Array<AuditInfo>;
} => {
	try {
		const isSuccess = response?.status === 202;
		const acceptedDevinfoEntities =
			response?.data && response?.data?.acceptedDevinfoEntities;
		const hasAcceptedDevinfoEntities =
			isObject(acceptedDevinfoEntities) &&
			Object.keys(acceptedDevinfoEntities).length > 0;
		let auditInfo: Array<AuditInfo> = [];
		if (isSuccess && hasAcceptedDevinfoEntities) {
			const repoData = reqRepoData;
			const acceptedDevinfoRepoID = repoData.id;
			const { commits, branches, pullRequests } =
				acceptedDevinfoEntities[acceptedDevinfoRepoID];
			const hasBranches = isArray(branches) && branches.length > 0;
			const hasCommits = isArray(commits) && commits.length > 0;
			const hasPRs = isArray(pullRequests) && pullRequests.length > 0;
			if (hasCommits) {
				const commitAuditInfo = getAuditInfo({
					acceptedGithubEntities: commits,
					githubEntityType: "commits",
					repoEntities: repoData["commits"],
					options
				});
				auditInfo = [...auditInfo, ...commitAuditInfo];
			}
			if (hasBranches) {
				const branchAuditInfo = getAuditInfo({
					acceptedGithubEntities: branches,
					githubEntityType: "branches",
					repoEntities: repoData["branches"],
					options
				});
				auditInfo = [...auditInfo, ...branchAuditInfo];
			}
			if (hasPRs) {
				const PRAuditInfo = getAuditInfo({
					acceptedGithubEntities: pullRequests,
					githubEntityType: "pullRequests",
					repoEntities: repoData["pullRequests"],
					options
				});
				auditInfo = [...auditInfo, ...PRAuditInfo];
			}
			return { isSuccess: true, auditInfo };
		}
		return { isSuccess: false };
	} catch (error) {
		logger.error(
			{ error },
			"Failed to process batched bulk update api response for audit log"
		);
		return { isSuccess: false };
	}
};
export const processAuditLogsForDevInfoBulkUpdate = ({ reqRepoData, response, options, logger }) => {
	try {
		const { isSuccess, auditInfo } = processBatchedBulkUpdateResp({
			reqRepoData,
			response,
			options,
			logger
		});
		if (isSuccess) {
			auditInfo?.map(async (auditInf) => {
				await saveAuditLog(auditInf, logger);
			});
		} else {
			logger.error("the DD api call failed for all github entities!");
		}
	} catch (error) {
		logger.error({ error }, "Failed to log DD api call success");
	}
};