import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adfToText, ageDays, countByAssignee, escapeJqlString, extractBlockedIssues, extractBlockers,
  rankBlockers, sanitizeProjectKey, staleRows, subtaskProgress, summarizeComments,
} from '../src/logic.js';

const now = new Date('2026-11-25T12:00:00Z');

function issue(key, fields = {}) {
  return {
    key,
    fields: {
      summary: key + ' summary',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      priority: { name: 'Medium' },
      created: '2026-11-20T12:00:00Z',
      updated: '2026-11-24T12:00:00Z',
      ...fields,
    },
  };
}

function done(key) {
  return issue(key, { status: { name: 'Done', statusCategory: { key: 'done' } } });
}

const blocks = { inward: 'is blocked by', outward: 'blocks' };

test('adfToText flattens nested text and preserves string bodies', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: '  Release ' }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: ' check\npassed  ' }] }] },
    ],
  };
  assert.equal(adfToText(doc), 'Release check passed');
  assert.equal(adfToText('  raw\ntext '), '  raw\ntext ');
});

test('blocked links respect direction and exclude done issues', () => {
  const parent = issue('ABC-1', {
    issuelinks: [
      { type: blocks, inwardIssue: issue('ABC-2') },
      { type: blocks, inwardIssue: done('ABC-3') },
      { type: blocks, outwardIssue: issue('ABC-4', { status: { name: 'Open' } }) },
      { type: blocks, outwardIssue: done('ABC-5') },
    ],
  });
  assert.deepEqual(extractBlockers(parent), [{ key: 'ABC-2', summary: 'ABC-2 summary', status: 'In Progress' }]);
  assert.deepEqual(extractBlockedIssues(parent), [{ key: 'ABC-4', summary: 'ABC-4 summary', status: 'Open' }]);
});

test('ranking combines priority, unresolved blockers, and capped age', () => {
  const medium = issue('ABC-1');
  const blocked = issue('ABC-2', {
    priority: { name: 'High' },
    created: '2026-09-01T12:00:00Z',
    issuelinks: [{ type: blocks, inwardIssue: issue('ABC-3') }],
  });
  const rows = rankBlockers([medium, blocked], now);
  assert.deepEqual(rows.map(row => [row.key, row.score]), [['ABC-2', 75], ['ABC-1', 15]]);
  assert.equal(rows[0].assignee, 'Unassigned');
});

test('subtaskProgress counts completed work and handles empty subtasks', () => {
  assert.deepEqual(subtaskProgress(issue('ABC-1', {
    subtasks: [done('ABC-2'), done('ABC-3'), issue('ABC-4'), issue('ABC-5')],
  })), { total: 4, done: 2, percent: 50 });
  assert.deepEqual(subtaskProgress(issue('ABC-1')), { total: 0, done: 0, percent: 0 });
});

test('staleRows sorts by whole days since update', () => {
  const recent = issue('ABC-1');
  const older = issue('ABC-2', { updated: '2026-11-21T06:00:00Z' });
  const rows = staleRows([recent, older], now);
  assert.deepEqual(rows.map(row => [row.key, row.daysSinceUpdate]), [['ABC-2', 4], ['ABC-1', 1]]);
  assert.equal(ageDays(older.fields.updated, now), 4);
  assert.deepEqual(countByAssignee(rows), { Unassigned: 2 });
});

test('sanitizeProjectKey normalizes valid keys and rejects invalid keys', () => {
  assert.equal(sanitizeProjectKey(' abc_1 '), 'ABC_1');
  for (const invalid of ['A B', '1ABC', 'AB"C', undefined]) {
    assert.equal(sanitizeProjectKey(invalid), null);
  }
});

test('escapeJqlString escapes quotes and backslashes', () => {
  assert.equal(escapeJqlString('release "A"\\beta'), 'release \\"A\\"\\\\beta');
});

test('summarizeComments truncates long comments and preserves newest-first order', () => {
  const longText = 'a'.repeat(200);
  const comments = [
    { author: { displayName: 'Ari' }, created: '2026-11-25', body: longText + 'b' },
    { author: { displayName: 'Sam' }, created: '2026-11-24', body: 'Short' },
  ];
  assert.deepEqual(summarizeComments(comments, 1), [
    { author: 'Ari', created: '2026-11-25', snippet: longText + '…' },
  ]);
  assert.equal(summarizeComments(comments)[1].snippet, 'Short');
});
