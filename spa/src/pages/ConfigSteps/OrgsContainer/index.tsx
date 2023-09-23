/** @jsxImportSource @emotion/react */
import Button, { LoadingButton } from "@atlaskit/button";
import { GitHubInstallationType } from "../../../../../src/rest-interfaces";
import { css } from "@emotion/react";
import { token } from "@atlaskit/tokens";
import { useState } from "react";
import WarningIcon from "@atlaskit/icon/glyph/warning";
import OauthManager from "../../../services/oauth-manager";
import { ErrorForIPBlocked, ErrorForNonAdmins, ErrorForSSO } from "../../../components/Error/KnownErrors";

const orgsWrapperStyle = css`
	max-height: 250px;
	overflow-y: auto;
	padding-right: 80px;
	margin-right: -80px;
`;
const orgDivStyle = css`
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: ${token("space.150")} 0;
	margin-bottom: ${token("space.100")};
`;

const orgDivWithErrorStyle = css`
	align-items: start;
`;

const orgNameStyle = css`
	color: ${token("color.text")};
	font-weight: 590;
`;
const iconWrapperStyle = css`
	padding-top: ${token("space.150")};
`;


const OrganizationsList = ({
	organizations,
	loaderForOrgClicked,
	setLoaderForOrgClicked,
	resetCallback,
	connectingOrg,
}: {
	organizations: Array<GitHubInstallationType>;
	// Passing down the states and methods from the parent component
	loaderForOrgClicked: boolean;
	setLoaderForOrgClicked: (args: boolean) => void;
	resetCallback: (args: boolean) => void;
	connectingOrg: (org: GitHubInstallationType) => void;
}) => {
	const [clickedOrg, setClickedOrg] = useState<GitHubInstallationType | undefined>(undefined);
	const canConnect = (org: GitHubInstallationType) => !org.requiresSsoLogin && !org.isIPBlocked && org.isAdmin;

	// This method clears the tokens and then re-authenticates
	const resetToken = async () => {
		await OauthManager.clear();
		// This resets the token validity check in the parent component and resets the UI
		resetCallback(false);
		// Restart the whole auth flow
		await OauthManager.authenticateInGitHub(() => {});
	};

	const errorMessage = (org: GitHubInstallationType) => {
		if (org.requiresSsoLogin) {
			// TODO: Update this to support GHE
			const accessUrl = `https://github.com/organizations/${org.account.login}/settings/profile`;

			return <ErrorForSSO resetCallback={resetToken} accessUrl={accessUrl} />;
		}

		if (org.isIPBlocked) {
			return <ErrorForIPBlocked resetCallback={resetToken} />;
		}

		if (!org.isAdmin) {
			// TODO: Update this to support GHE
			const adminOrgsUrl = `https://github.com/orgs/${org.account.login}/people?query=role%3Aowner`;

			return <ErrorForNonAdmins adminOrgsUrl={adminOrgsUrl} />;
		}
	};
	return (
		<div css={orgsWrapperStyle}>
			{organizations.map((org) => {
				const hasError = !canConnect(org);
				const orgDivStyles = hasError
					? [orgDivStyle, orgDivWithErrorStyle]
					: [orgDivStyle];
				return (
					<div key={org.id} css={orgDivStyles}>
						{canConnect(org) ? (
							<>
								<span css={orgNameStyle}>{org.account.login}</span>
								{loaderForOrgClicked && clickedOrg?.id === org.id ? (
									<LoadingButton style={{ width: 80 }} isLoading>
										Loading button
									</LoadingButton>
								) : (
									<Button
										isDisabled={
											loaderForOrgClicked && clickedOrg?.id !== org.id
										}
										onClick={async () => {
											setLoaderForOrgClicked(true);
											setClickedOrg(org);
											try {
												// Calling the create connection function that is passed from the parent
												await connectingOrg(org);
											} finally {
												setLoaderForOrgClicked(false);
											}
										}}
									>
										Connect
									</Button>
								)}
							</>
						) : (
							<>
								<div>
									<span css={orgNameStyle}>{org.account.login}</span>
									<div>{errorMessage(org)}</div>
								</div>
								<div css={iconWrapperStyle}>
									<WarningIcon
										label="warning"
										primaryColor={token("color.background.warning.bold")}
										size="medium"
									/>
								</div>
							</>
						)}
					</div>
				);
			})}
		</div>
	);
};

export default OrganizationsList;
