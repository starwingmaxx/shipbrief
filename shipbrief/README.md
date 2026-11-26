# ShipBrief

ShipBrief is a Jira Rovo agent for software teams preparing a release. It ranks blockers, briefs individual work items, surfaces unresolved work that has gone stale, and shows the people and goals connected to an issue. Built for the Codegeist 2026 Apps for Software Teams category.

| Action | Answers | Data source |
| --- | --- | --- |
| `get-release-blockers` | What is blocking this project or fix version? | Jira REST search and issue links |
| `get-issue-brief` | What is the status and recent activity of this work item? | Jira REST issue fields, linked issues, subtasks, and comments |
| `get-stale-work` | What unresolved work has gone stale? | Jira REST search and update timestamps |
| `get-work-item-people` | Who is involved, what teams is the assignee on, and which goals are linked? | Jira REST issue fields and Teamwork Graph comments, teams, and goals |

## Permissions

| Scope | Used for |
| --- | --- |
| `read:jira-work` | Jira issue search, issue fields, comments, and site information for browse links |
| `read:jira-user` | Jira assignee and reporter details |
| `read:graph:issue:jira` | Jira work items in Teamwork Graph |
| `read:graph:issue-status:jira` | Jira work item status data in Teamwork Graph |
| `read:graph:issue-comment:jira` | Recent Jira comment activity in Teamwork Graph |
| `read:graph:user:atlassian` | Comment author identities and assignee lookups in Teamwork Graph |
| `read:graph:team:atlassian` | Assignee team membership in Teamwork Graph |
| `read:graph:goal:atlassian` | Goals linked to a work item in Teamwork Graph |

## Architecture

`src/logic.js` holds pure ranking, date, and formatting functions. The thin action handlers in `src/index.js` wire these functions to Jira REST and Teamwork Graph clients, both of which use the current user's permissions. Teamwork Graph calls use bounded pagination and retry transient failures. The people-and-goals brief retains partial results and flags any unreadable or incomplete source.

Release and stale-work searches process up to 100 issues. The release brief lists up to 15 ranked blockers and the stale-work brief lists up to 20 items.

## Local checks

Use Node.js 22 to match the Forge runtime.

```sh
npm install
node --check src/index.js && node --check src/jira.js && node --check src/twg.js && node --check src/logic.js
npm test
```

Deployment steps are in [SUBMISSION.md](../SUBMISSION.md).
