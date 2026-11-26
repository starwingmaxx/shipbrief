const DAY_MS = 86_400_000;

export function daysBetween(fromIso, toIso) {
  return Math.floor((new Date(toIso) - new Date(fromIso)) / DAY_MS);
}

export function ageDays(iso, now = new Date()) {
  return daysBetween(iso, now);
}

export function isUnresolved(issue) {
  return issue?.fields?.status?.statusCategory?.key !== 'done';
}

function extractLinkedIssues(issue, direction, label, target) {
  return (issue.fields?.issuelinks ?? [])
    .filter(link => link.type?.[direction] === label && link[target] && isUnresolved(link[target]))
    .map(link => {
      const linked = link[target];
      return { key: linked.key, summary: linked.fields?.summary, status: linked.fields?.status?.name };
    });
}

export function extractBlockers(issue) {
  return extractLinkedIssues(issue, 'inward', 'is blocked by', 'inwardIssue');
}

export function extractBlockedIssues(issue) {
  return extractLinkedIssues(issue, 'outward', 'blocks', 'outwardIssue');
}

export const PRIORITY_WEIGHTS = Object.freeze({
  Blocker: 50, Highest: 50, High: 30, Medium: 10, Low: 0, Lowest: 0,
});

function issueRow({ key, fields }) {
  return {
    key,
    summary: fields.summary,
    status: fields.status?.name ?? null,
    priority: fields.priority?.name ?? null,
    assignee: fields.assignee?.displayName || 'Unassigned',
  };
}

export function rankBlockers(issues, now) {
  return issues.map(issue => {
    const row = issueRow(issue);
    const age = ageDays(issue.fields.created, now);
    const blockedBy = extractBlockers(issue);
    const weight = Object.hasOwn(PRIORITY_WEIGHTS, row.priority) ? PRIORITY_WEIGHTS[row.priority] : 5;
    const score = weight + Math.min(age, 30) + 15 * blockedBy.length;
    return { ...row, ageDays: age, blockedBy, score };
  }).sort((a, b) => b.score - a.score);
}

export function subtaskProgress(issue) {
  const subtasks = issue.fields?.subtasks ?? [];
  const total = subtasks.length;
  const done = subtasks.filter(subtask => !isUnresolved(subtask)).length;
  return { total, done, percent: total ? Math.round(100 * done / total) : 0 };
}

export function adfToText(node) {
  if (typeof node === 'string') return node;
  const parts = [];
  function visit(item) {
    if (typeof item?.text === 'string') parts.push(item.text);
    item?.content?.forEach(visit);
  }
  visit(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function summarizeComments(comments, limit = 3) {
  return comments.slice(0, limit).map(comment => {
    const body = adfToText(comment.body);
    return {
      author: comment.author?.displayName ?? null,
      created: comment.created,
      snippet: body.length > 200 ? body.slice(0, 200) + '…' : body,
    };
  });
}

export function staleRows(issues, now) {
  return issues.map(issue => ({
    ...issueRow(issue),
    daysSinceUpdate: ageDays(issue.fields.updated, now),
  })).sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}

export function countByAssignee(rows) {
  const counts = new Map();
  for (const { assignee } of rows) counts.set(assignee, (counts.get(assignee) ?? 0) + 1);
  return Object.fromEntries(counts);
}

export function sanitizeProjectKey(key) {
  const normalized = typeof key === 'string' ? key.trim().toUpperCase() : '';
  return /^[A-Z][A-Z0-9_]*$/.test(normalized) ? normalized : null;
}

export function escapeJqlString(value) {
  return value.replace(/["\\]/g, character => '\\' + character);
}
