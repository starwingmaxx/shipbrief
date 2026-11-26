import { browseUrl, getBaseUrl, getIssue, getRecentComments, searchJql } from './jira.js';
import { Q, twgAll, userAri, workItemAri } from './twg.js';
import {
  ageDays, countByAssignee, escapeJqlString, extractBlockedIssues, extractBlockers,
  rankBlockers, sanitizeProjectKey, staleRows, subtaskProgress, summarizeComments,
} from './logic.js';

function action(name, handler) {
  return async (payload = {}) => {
    const start = Date.now();
    try {
      return await handler(payload ?? {});
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      console.log(JSON.stringify({ action: name, ms: Date.now() - start }));
    }
  };
}

function normalizeIssueKey(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function withBrowseUrl(baseUrl, row) {
  return { ...row, browseUrl: browseUrl(baseUrl, row.key) };
}

const COMMON_FIELDS = ['summary', 'status', 'priority', 'assignee'];
const INVALID_PROJECT = 'Provide a valid Jira project key, such as ABC or ABC_1.';

export const releaseBlockers = action('releaseBlockers', async payload => {
  const project = sanitizeProjectKey(payload.projectKey);
  if (!project) return { error: INVALID_PROJECT };

  const fixVersion = typeof payload.fixVersion === 'string' && payload.fixVersion.trim()
    ? payload.fixVersion : null;
  let jql = `project = "${project}" AND resolution = Unresolved`;
  if (fixVersion) jql += ` AND fixVersion = "${escapeJqlString(fixVersion)}"`;
  jql += ' ORDER BY priority DESC, created ASC';

  const issues = await searchJql(jql, [...COMMON_FIELDS, 'created', 'issuelinks'], 100);
  const rows = rankBlockers(issues, new Date()).filter(row =>
    row.blockedBy.length > 0 || row.priority === 'Highest' || row.priority === 'Blocker');
  const baseUrl = await getBaseUrl(payload.context?.cloudId);
  const blockers = rows.slice(0, 15).map(row => withBrowseUrl(baseUrl, {
    ...row,
    blockedBy: row.blockedBy.map(linked => withBrowseUrl(baseUrl, linked)),
  }));
  return { project, fixVersion, totalOpen: issues.length, blockerCount: rows.length, blockers, notes: [] };
});

export const issueBrief = action('issueBrief', async payload => {
  const issueKey = normalizeIssueKey(payload.issueKey);
  if (!issueKey) return { error: 'Provide a Jira work item key.' };
  const issue = await getIssue(issueKey, [
    ...COMMON_FIELDS, 'reporter', 'created', 'updated', 'duedate', 'fixVersions', 'labels', 'issuelinks', 'subtasks',
  ]);
  const notes = [];
  const [comments, baseUrl] = await Promise.all([
    getRecentComments(issueKey, 3, () => notes.push('Recent Jira comments could not be read.')),
    getBaseUrl(payload.context?.cloudId),
  ]);
  const fields = issue.fields;
  const now = new Date();
  return {
    issue: withBrowseUrl(baseUrl, {
      key: issue.key,
      summary: fields.summary,
      status: fields.status?.name ?? null,
      priority: fields.priority?.name ?? null,
    }),
    assignee: fields.assignee?.displayName ?? 'Unassigned',
    reporter: fields.reporter?.displayName ?? null,
    created: fields.created,
    updated: fields.updated,
    dueDate: fields.duedate ?? null,
    fixVersions: (fields.fixVersions ?? []).map(version => version.name),
    labels: fields.labels ?? [],
    ageDays: ageDays(fields.created, now),
    daysSinceUpdate: ageDays(fields.updated, now),
    blockers: extractBlockers(issue).map(row => withBrowseUrl(baseUrl, row)),
    blocking: extractBlockedIssues(issue).map(row => withBrowseUrl(baseUrl, row)),
    subtasks: subtaskProgress(issue),
    recentComments: summarizeComments(comments),
    notes,
  };
});

export const staleWork = action('staleWork', async payload => {
  const project = sanitizeProjectKey(payload.projectKey);
  if (!project) return { error: INVALID_PROJECT };
  const input = payload.staleDays;
  const days = typeof input === 'number' || (typeof input === 'string' && input.trim())
    ? Number(input) : NaN;
  const staleDays = Number.isInteger(days) ? Math.max(1, Math.min(180, days)) : 14;
  const jql = `project = "${project}" AND resolution = Unresolved AND updated <= "-${staleDays}d" ORDER BY updated ASC`;
  const issues = await searchJql(jql, [...COMMON_FIELDS, 'updated']);
  const rows = staleRows(issues, new Date());
  const baseUrl = await getBaseUrl(payload.context?.cloudId);
  const items = rows.slice(0, 20).map(row => withBrowseUrl(baseUrl, row));
  return { project, staleDays, count: rows.length, items, byAssignee: countByAssignee(rows), notes: [] };
});

function topCommenters(nodes) {
  const authors = new Map();
  for (const { author, createdAt } of nodes) {
    const identity = author?.accountId || author?.name;
    if (!identity) continue;
    const row = authors.get(identity) ?? { name: author.name ?? null, comments: 0, lastAt: null };
    row.comments++;
    if (createdAt && (!row.lastAt || Date.parse(createdAt) > Date.parse(row.lastAt))) row.lastAt = createdAt;
    authors.set(identity, row);
  }
  return [...authors.values()].sort((a, b) => b.comments - a.comments).slice(0, 5);
}

function sourceNote(notes, source, result) {
  if (!result.ok) {
    notes.push(`${source} could not be fully read from Teamwork Graph.`);
  } else if (!result.complete) {
    notes.push(`${source} from Teamwork Graph may be incomplete because the page limit was reached.`);
  }
}

export const workItemPeople = action('workItemPeople', async payload => {
  const issueKey = normalizeIssueKey(payload.issueKey) || normalizeIssueKey(payload.context?.jira?.issueKey);
  if (!issueKey) return { error: 'Provide a Jira work item key or open a Jira work item.' };

  const cloudId = payload.context?.cloudId;
  const [issue, baseUrl] = await Promise.all([
    getIssue(issueKey, ['summary', 'assignee', 'reporter', 'status']),
    getBaseUrl(cloudId),
  ]);
  const { fields } = issue;
  const notes = [];
  const id = cloudId && issue.id ? workItemAri(cloudId, issue.id) : null;
  const accountId = fields.assignee?.accountId;
  const [comments, goals, teams] = await Promise.all([
    id && twgAll('workItemComments', Q.workItemComments, { id, since: 'P90D' }, 'jiraWorkItemComments'),
    id && twgAll('workItemGoals', Q.workItemGoals, { id }, 'jiraWorkItemGoals'),
    accountId && twgAll('userTeams', Q.userTeams, { userId: userAri(accountId) }, 'atlassianUserInTeams'),
  ]);

  if (id) {
    sourceNote(notes, 'Recent commenters', comments);
    sourceNote(notes, 'Linked goals', goals);
  } else {
    notes.push('Recent commenters could not be read without a work item ARI.');
    notes.push('Linked goals could not be read without a work item ARI.');
  }
  if (teams) {
    sourceNote(notes, 'Assignee teams', teams);
  } else if (fields.assignee) {
    notes.push('Assignee teams could not be read without an account ID.');
  }

  return {
    issue: withBrowseUrl(baseUrl, { key: issue.key, summary: fields.summary, status: fields.status?.name ?? null }),
    assignee: fields.assignee?.displayName ?? 'Unassigned',
    reporter: fields.reporter?.displayName ?? null,
    recentCommenters: topCommenters(comments?.nodes ?? []),
    assigneeTeams: (teams?.nodes ?? []).map(team => team.displayName),
    linkedGoals: (goals?.nodes ?? []).map(({ name, url }) => ({ name, url })),
    notes,
  };
});
