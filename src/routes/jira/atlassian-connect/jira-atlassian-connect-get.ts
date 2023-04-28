import { Request, Response } from "express";
import { envVars } from "config/env";
import { EnvironmentEnum } from "interfaces/common";
import { compact, map } from "lodash";

const instance = envVars.INSTANCE_NAME;

const isProd = (instance === EnvironmentEnum.production);
// TODO: implement named routes (https://www.npmjs.com/package/named-routes) to facilitate rerouting between files
export const postInstallUrl = "/jira";
const devSuffix = `${isProd ? "" : (instance ? (` (${instance})`) : "")}`;
export const APP_NAME = `GitHub for Jira${devSuffix}`;
export const APP_KEY = `com.github.integration${instance ? `.${instance}` : ""}`;

const adminCondition = [
	{
		condition: "user_is_admin"
	}
];
const modules = {
	jiraDevelopmentTool: {
		application: {
			value: "GitHub"
		},
		capabilities: [
			"branch",
			"commit",
			"pull_request"
		],
		actions: {
			createBranch: {
				templateUrl: `${envVars.APP_URL}/create-branch-options?issueKey={issue.key}&issueSummary={issue.summary}&tenantUrl={tenant.url}&jwt={jwt}&addonkey=${APP_KEY}`
			}
		},
		key: "github-development-tool",
		logoUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
		name: {
			value: "GitHub"
		},
		url: "https://github.com"
	},
	jiraDeploymentInfoProvider: {
		key: "github-deployments",
		name: {
			value: "GitHub Actions"
		},
		logoUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
		homeUrl: "https://github.com/features/actions"
	},
	jiraBuildInfoProvider: {
		key: "github-actions",
		logoUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
		name: {
			value: "GitHub Actions"
		},
		homeUrl: "https://github.com/features/actions"
	},
	jiraRemoteLinkInfoProvider: {
		key: "github-remotelinks-integration",
		name: {
			value: "GitHub"
		},
		logoUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
		homeUrl: "https://github.com"
	},
	postInstallPage: {
		key: "github-post-install-page",
		name: {
			value: "GitHub Configuration"
		},
		url: postInstallUrl,
		conditions: adminCondition
	},
	generalPages: [
		{
			key: "github-select-product-page",
			name: {
				value: "GitHub Select Product"
			},
			url: "/jira/connect",
			location: "none",
			conditions: adminCondition
		},
		{
			key: "github-server-url-page",
			name: {
				value: "GitHub Server Url"
			},
			url: "/jira/connect/enterprise?new={ac.new}",
			location: "none",
			conditions: adminCondition
		},
		{
			key: "github-list-servers-page",
			name: {
				value: "GitHub Enterprise Servers"
			},
			url: "/jira/connect/enterprise",
			location: "none",
			conditions: adminCondition
		},
		{
			key: "github-app-creation-page",
			name: {
				value: "GitHub App Creation"
			},
			// connectConfigUuid might be either an existing app uuid or a key of one stored in Redis (see GheConnectConfigTempStorage)
			// Let's keep it vague and not differentiate to avoid brain melting
			url: "/jira/connect/enterprise/{ac.connectConfigUuid}/app?new={ac.new}",
			location: "none",
			conditions: adminCondition
		},
		{
			key: "github-list-server-apps-page",
			name: {
				value: "GitHub Server Apps"
			},
			// connectConfigUuid might be either an existing app uuid or a key of one stored in Redis (see GheConnectConfigTempStorage)
			// Let's keep it vague and not differentiate to avoid brain melting
			url: "/jira/connect/enterprise/{ac.connectConfigUuid}/app",
			location: "none",
			conditions: adminCondition
		},
		{
			key: "github-manual-app-page",
			name: {
				value: "GitHub Manual App"
			},
			// connectConfigUuid might be either an existing app uuid or a key of one stored in Redis (see GheConnectConfigTempStorage)
			// Let's keep it vague and not differentiate to avoid brain melting
			url: "/jira/connect/enterprise/{ac.connectConfigUuid}/app/new",
			location: "none",
			conditions: adminCondition
		},
		{
			key: "github-edit-app-page",
			name: {
				value: "GitHub Edit App"
			},
			url: "/jira/connect/enterprise/app/{ac.uuid}",
			location: "none",
			conditions: adminCondition
		}
	],
	webSections: [
		{
			key: "gh-addon-admin-section",
			location: "admin_plugins_menu",
			name: {
				value: "GitHub"
			}
		}
	],
	adminPages: [
		{
			url: postInstallUrl,
			conditions: adminCondition,
			name: {
				value: `GitHub for Jira${devSuffix}`
			},
			key: "gh-addon-admin",
			location: "admin_plugins_menu/gh-addon-admin-section"
		}, {
			url: "/jira/configuration",
			conditions: adminCondition,
			name: {
				value: `GitHub for Jira${devSuffix}`
			},
			key: "gh-addon-admin-old",
			location: "none"
		}
	]
};

export const moduleUrls = compact(map([...modules.adminPages, ...modules.generalPages], "url"));

export const JiraAtlassianConnectGet = async (_: Request, res: Response): Promise<void> => {
	res.status(200).json({
		// Will need to be set to `true` once we verify the app will work with
		// GDPR compliant APIs. Ref: https://github.com/github/ce-extensibility/issues/220
		apiMigrations: {
			gdpr: false,
			"signed-install": true
		},
		name: APP_NAME,
		description: "Connect your code and your project with ease.",
		key: APP_KEY,
		baseUrl: envVars.APP_URL,
		lifecycle: {
			installed: "/jira/events/installed",
			enabled: "/jira/events/enabled",
			disabled: "/jira/events/disabled",
			uninstalled: "/jira/events/uninstalled"
		},
		vendor: {
			name: "Atlassian",
			url: "https://atlassian.com"
		},
		authentication: {
			type: "jwt"
		},
		scopes: [
			"READ",
			"WRITE",
			"DELETE"
		],
		apiVersion: 1,
		modules
	});
};
