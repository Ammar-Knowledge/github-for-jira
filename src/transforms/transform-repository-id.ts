
declare const transformedRepositoryId: unique symbol;

export type TransformedRepositoryId = string & { [transformedRepositoryId]: never };

export function transformRepositoryId(repositoryId: number, gitHubBaseUrl?: string): TransformedRepositoryId {
	if (!gitHubBaseUrl) {
		return ("" + repositoryId) as TransformedRepositoryId;
	}

	const parsedUrl = new URL(gitHubBaseUrl);

	// - "1024" is the limit for repo id in Jira API, see
	// https://developer.atlassian.com/cloud/jira/software/rest/api-group-development-information/#api-group-development-information ,
	// therefore limiting to 512 (half of the limit).
	// - Not base64 to avoid handling of special symbols (+/=) that are not allowed in Jira API.
	// - Not hostname in case different ports serving different GHES
	// - Including pathname in case there's a reverse-proxy that does routing based on path
	// - Removing special characters to smooth quirks like "myserver.com/blah/" and "myserver.com/blah"
	// - Using parsed url to remove protocol (in case the server available via both HTTP and HTTPS) and query params
	const prefix = Buffer.from(
		(parsedUrl.host + parsedUrl.pathname).toLowerCase().replace(/[\W_]/g, '')
	).toString('hex').substring(0, 512);

	return `${prefix}-${repositoryId}` as TransformedRepositoryId;
}
