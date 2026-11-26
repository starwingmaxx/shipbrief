import api from "@forge/api";

export const OP_PREFIX = 'shipbrief_';
const TRANSIENT = /RATE_LIMIT|THROTTL|429|502|503|504/i;

export async function twg(opName, query, variables) {
  const started = Date.now();
  const fullOperationName = OP_PREFIX + opName;
  const text = query.replace('query OP', 'query ' + fullOperationName);
  let error;

  for (let attempt = 0; attempt < 3; attempt++) {
    let status;
    try {
      const response = await api.asUser().requestTeamworkGraph(text, variables, fullOperationName);
      status = response.status;
      const body = await response.json();
      if (response.ok && body?.data && !body.errors?.length) {
        return { ok: true, data: body.data, error: null, ms: Date.now() - started };
      }
      error = body?.errors?.length
        ? JSON.stringify(body.errors)
        : `Teamwork Graph request failed or returned no data (${status})`;
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    }
    if (attempt === 2 || !TRANSIENT.test(`${status} ${error}`)) break;
    const delay = Math.min(1200, 200 * 2 ** attempt) + Math.random() * 250;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return { ok: false, data: null, error, ms: Date.now() - started };
}

export async function twgAll(opName, query, variables, field, maxPages = 4) {
  const nodes = [];
  const seenCursors = new Set();
  let after = null;

  for (let page = 0; page < maxPages; page++) {
    const result = await twg(opName, query, { ...variables, first: 25, after });
    if (!result.ok) return { ok: false, nodes, complete: false, error: result.error };
    const connection = result.data[field];
    if (!Array.isArray(connection?.edges) || typeof connection.pageInfo?.hasNextPage !== 'boolean') {
      return { ok: false, nodes, complete: false, error: `Missing connection data for ${field}` };
    }
    for (const edge of connection.edges) {
      if (edge?.node) nodes.push(edge.node);
    }
    const { hasNextPage, endCursor } = connection.pageInfo;
    if (!hasNextPage) return { ok: true, nodes, complete: true, error: null };
    if (!endCursor || seenCursors.has(endCursor)) {
      return { ok: false, nodes, complete: false, error: `Invalid page cursor for ${field}` };
    }
    seenCursors.add(endCursor);
    after = endCursor;
  }
  return { ok: true, nodes, complete: false, error: null };
}

export const Q = {
  workItemComments: `
    query OP($id: ID!, $since: String!, $first: Int, $after: String) {
      jiraWorkItemComments(id: $id, since: $since, first: $first, after: $after) {
        edges {
          node {
            ... on JiraWorkItemComment {
              createdAt
              author { name ... on AtlassianUser { accountId } }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,
  workItemGoals: `
    query OP($id: ID!, $first: Int, $after: String) {
      jiraWorkItemGoals(id: $id, first: $first, after: $after) {
        edges { node { ... on AtlassianGoal { name url } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,
  userTeams: `
    query OP($userId: ID!, $first: Int, $after: String) {
      atlassianUserInTeams(userId: $userId, first: $first, after: $after) {
        edges { node { ... on AtlassianTeam { id displayName } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,
};

export function userAri(accountId) {
  return `ari:cloud:identity::user/${accountId}`;
}

export function workItemAri(cloudId, issueId) {
  return `ari:cloud:jira:${cloudId}:issue/${issueId}`;
}
