import api, { route } from "@forge/api";

export async function searchJql(jql, fields, maxTotal = 100) {
  const issues = [];
  let nextPageToken;
  while (issues.length < maxTotal) {
    const response = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql, fields, maxResults: Math.min(100, maxTotal), nextPageToken }),
    });
    if (!response.ok) throw new Error(`Jira search failed (${response.status})`);
    const page = await response.json();
    issues.push(...page.issues.slice(0, maxTotal - issues.length));
    if (page.isLast || !page.nextPageToken || page.nextPageToken === nextPageToken) break;
    nextPageToken = page.nextPageToken;
  }
  return issues;
}

export async function getIssue(issueKey, fields) {
  const response = await api.asUser().requestJira(
    route`/rest/api/3/issue/${issueKey}?fields=${fields.join(',')}`,
  );
  if (!response.ok) throw new Error(`Jira issue lookup failed (${response.status})`);
  return response.json();
}

export async function getRecentComments(issueKey, maxResults = 3, onFailure = () => {}) {
  try {
    const response = await api.asUser().requestJira(
      route`/rest/api/3/issue/${issueKey}/comment?orderBy=-created&maxResults=${maxResults}`,
    );
    if (!response.ok) throw new Error(`Jira comments request failed (${response.status})`);
    const { comments } = await response.json();
    if (!Array.isArray(comments)) throw new Error('Jira response is missing comments');
    return comments;
  } catch (error) {
    onFailure(error);
    return [];
  }
}

const baseUrls = new Map();

export async function getBaseUrl(cloudId) {
  if (cloudId && baseUrls.has(cloudId)) return baseUrls.get(cloudId);
  const response = await api.asUser().requestJira(route`/rest/api/3/serverInfo`);
  if (!response.ok) throw new Error(`Jira server info request failed (${response.status})`);
  const { baseUrl } = await response.json();
  if (!baseUrl) throw new Error('Jira server info is missing its base URL');
  if (cloudId) baseUrls.set(cloudId, baseUrl);
  return baseUrl;
}

export function browseUrl(baseUrl, key) {
  return `${baseUrl}/browse/${key}`;
}
