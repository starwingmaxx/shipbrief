# ShipBrief — Codegeist 2026 Submission Pack

**Status: built and locally verified, NOT deployed.** Deployment needs the user's own Atlassian API token (a personal credential), so everything below the "Deployment runbook" heading is written for the user to run. Do not paste an API token into chat — enter it only in your own terminal when `forge login` prompts for it.

**Local verification (2026-11-25):** `npm install` OK (@forge/api installed) · `node --check` passed for all 4 source files · `npm test` 8/8 passed · handler module imports cleanly against the real `@forge/api` and exports all 4 action handlers · `manifest.yml` parses as YAML and was checked field-by-field against Atlassian's official `rovo:agent` / `action` module references (agent↔action keys match, 8 scopes, nodejs22.x, no `app.id` yet — `forge register` adds it). **Not yet run:** `forge lint` — it cannot run in the build VM (its first-run analytics prompt requires a TTY), so it is step 4 of the runbook below, on the user's own terminal.

- Hackathon: Codegeist 2026 (Devpost) — https://codegeist2026.devpost.com
- **Deadline: 2026-12-23 05:00 JST** (Dec 22, 2026 12:00 pm Pacific)
- Category: **Apps for Software Teams**
- Bonus prizes entered: **Best Agents – Rovo/Assignable agents**, **Best apps with Teamwork Graph integration**
- App code: `./shipbrief/` (Forge app: `manifest.yml`, `src/`, `prompts/`)
- Preview images: `./preview/` — *design mocks with sample data*, rendered before deployment. Replace with real screenshots after installing the app (see runbook step 8).

---

## 1. Devpost submission copy (paste-ready, English)

### Project name
ShipBrief

### Tagline (short description)
A Rovo agent that briefs your release readiness from live Jira and Teamwork Graph context — blockers, stale work, owners, and goals, in one go/no-go answer.

### About the project (description)

**The problem.** Every release ends with the same meeting: "Are we ready to ship?" The answer is scattered — a blocker is buried three links deep in Jira, a critical fix has been untouched for two weeks, nobody remembers who owns the failing work item, and the goal the release was supposed to serve was written down somewhere else entirely. Teams burn standups and go/no-go calls reassembling context that their tools already have.

**The solution.** ShipBrief is a Rovo agent for Jira that assembles that context on demand and answers like a release manager who has read everything:

- 🔴🟡🟢 **A verdict first.** Ask "Are we ready to ship version 2.4?" and ShipBrief answers with a readiness verdict and a one-line reason, then shows its evidence.
- **Ranked blockers.** It scans the project's open work, follows "is blocked by" links, and ranks what actually blocks the release by priority, age, and how much work is stuck behind it — with owners named.
- **Stale-work radar.** Work that has not moved in 14+ days (configurable) is surfaced with days-since-update and a per-assignee breakdown, so silent stalls stop being silent.
- **People & goals around a work item.** For any single issue it briefs who is involved — assignee, reporter, the most active recent commenters — which Atlassian teams the assignee belongs to, and which company goals the item serves, read from the Teamwork Graph.
- **Recommended next actions.** Every brief ends with concrete, owner-addressed next steps instead of a data dump.

**Honest by design.** ShipBrief only reports what its actions actually read. If a data source cannot be read (for example a Teamwork Graph query fails), the brief says that part may be incomplete instead of claiming nothing exists — because in release decisions, "no data" and "no problem" are dangerously different answers.

### How it meets the main technology requirement (explanation field)

ShipBrief is an Atlassian Forge app that integrates with Jira and Rovo, and consumes the Teamwork Graph API:

- The app declares a **`rovo:agent`** module ("ShipBrief") with a resource-based prompt, conversation starters, and a follow-up prompt.
- The agent's capabilities are four reusable **`action`** modules (all `GET`), each backed by a Forge **function** (Node.js 22 runtime):
  - `get-release-blockers` and `get-stale-work` query Jira through the REST API (`POST /rest/api/3/search/jql`) as the user, then rank and age the results.
  - `get-issue-brief` reads one work item (status, links, subtasks, recent comments) via the Jira REST API.
  - `get-work-item-people` combines Jira REST with **Teamwork Graph curated queries** (`jiraWorkItemComments`, `jiraWorkItemGoals`, `atlassianUserInTeams`) via `api.asUser().requestTeamworkGraph`, with operation naming, 25-row paging, and retry/backoff for the Graph API's HTTP-200-with-errors behaviour.
- Because the actions are standard Forge action modules, other agents and automation can invoke them as tools — the agent is an assignable teammate, not a chatbot skin.
- No Forge LLM APIs are used, so the app incurs no LLM charges; Rovo provides the language model.

### Bonus prize write-ups

**Best Agents – Rovo/Assignable agents.** ShipBrief is a Forge app built around the `rovo:agent` module. Its four capabilities are declared as reusable `action` modules with plain-language descriptions written as the questions they answer, so Rovo (and other agents) can select and invoke them as tools. The agent prompt, conversation starters, and follow-up prompt are included in the app package (`prompts/prompt.md`).

**Best apps with Teamwork Graph integration.** ShipBrief consumes the Teamwork Graph API in the `get-work-item-people` action: recent commenters on a work item (`jiraWorkItemComments`), the goals a work item is linked to (`jiraWorkItemGoals`), and the Atlassian teams of the assignee (`atlassianUserInTeams`). It uses per-object-type graph scopes (`read:graph:issue:jira`, `read:graph:issue-comment:jira`, `read:graph:goal:atlassian`, `read:graph:team:atlassian`, `read:graph:user:atlassian`, `read:graph:issue-status:jira`), named GraphQL operations, cursor paging at the API's 25-row cap, and treats an errors-array response as a failed read rather than an empty result.

### Built with
Atlassian Forge · Rovo (rovo:agent + action modules) · Jira Cloud REST API · Teamwork Graph API (curated GraphQL queries) · Node.js 22 · @forge/api

### Testing instructions for judges (paste into the submission's testing field)

1. ShipBrief installs onto **Jira** via the installation link provided in this submission. Installing requires a site/org admin, because the app requests Teamwork Graph read scopes.
2. Rovo is required to chat with the agent; please use a site on a plan that includes Rovo (Standard/Premium/Enterprise or a trial of one).
3. After installing, open **Rovo Chat** and pick the **ShipBrief** agent (or ask Rovo to use it).
4. Try the conversation starters, using a project key from your test site, e.g.:
   - "What is blocking our release right now?" (then give it a project key)
   - "Give me the release brief for project `<KEY>`, fix version `<a version in that project>`"
   - "Brief me on `<ISSUE-KEY>` — who is involved and what is blocking it?"
   - "Which work in project `<KEY>` has gone stale?"
5. The agent only sees what the chatting user can see (all reads run as the user), so results reflect your test site's own data. A project with linked "blocks" issues and a few untouched issues shows the ranking best.

---

## 2. Deployment runbook (user steps — needs your Atlassian API token)

Prerequisites: Node.js 22+ and npm (already on this machine: Node v24). An Atlassian account with a developer site (already created). **Rovo note:** Rovo ships with paid Atlassian plans; if your developer site is on the Free plan, start a Standard trial on the site so Rovo Chat is available for testing and for the demo video.

### Step 1 — Create an Atlassian API token (your credential, ~1 minute)
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. **Create API token** → label it e.g. `forge-cli` → copy the token. You will paste it into your terminal in step 3 only. (Do not send it in chat.)

### Step 2 — Install the Forge CLI
```bash
npm install -g @forge/cli
forge --version
```

### Step 3 — Log in (email + the API token from step 1)
```bash
forge login
# Email address: <your Atlassian account email>
# API token: <paste the token — input is hidden>
```

### Step 4 — Install dependencies and run local checks
```bash
cd ~/workspace/bounty/codegeist/shipbrief
npm install
npm test
forge lint
```
`forge lint` should report no errors. (Before `forge register`, lint may warn that the app has no id yet — that is expected and fixed by the next step.)

### Step 5 — Register the app (one time; writes `app.id` into manifest.yml)
```bash
forge register
```
Keep the generated id in `manifest.yml` from now on — every later command uses it.

### Step 6 — Deploy and install on your own site (development)
```bash
forge deploy
forge install --site <your-site>.atlassian.net --product jira
```
Installing asks you to approve the permission scopes, including the Teamwork Graph read scopes — this is why an org admin account is needed. Then open your Jira site → Rovo Chat → find **ShipBrief** and try the conversation starters against a real project. Check function logs with `forge logs` if anything misbehaves.

### Step 7 — Deploy to production and create the judges' installation link
```bash
forge deploy -e production
```
Then in the browser:
1. Open https://developer.atlassian.com/console → select **ShipBrief**.
2. Left menu: **Distribution** → **Edit** (Distribution controls).
3. Choose **Sharing** (public sharing). ⚠️ Do **not** choose "Sharing within organization" — judges outside your org cannot install from that link.
4. Fill in the app details (name, description, icon if asked), select **Jira** as the product it installs onto, save.
5. Copy the **installation link** — this goes into the Devpost form.

### Step 8 — Real screenshots + demo video (< 5 minutes, public on YouTube)
Record on your own site with the installed app. Suggested script (~3 minutes):
1. (0:00–0:30) The problem: a go/no-go meeting hunting through Jira tabs for blockers.
2. (0:30–1:00) Open Rovo Chat, pick ShipBrief, show the conversation starters.
3. (1:00–2:00) Ask for the release brief on a real project + fix version; walk through the verdict, ranked blockers, stale work, next actions.
4. (2:00–2:40) Brief a single blocked work item; show people, teams, and linked goals from Teamwork Graph.
5. (2:40–3:00) How it works: rovo:agent + 4 actions, Jira REST + Teamwork Graph; close with the category/bonus line.
Also capture 2–3 real screenshots to replace the mocks in `preview/` for the Devpost gallery. The video must not use third-party copyrighted music/material.

### Step 9 — Submit on Devpost (before 2026-12-23 05:00 JST)
1. Open your Codegeist 2026 project (you are already registered as Working solo) → **Start project** / edit submission.
2. Paste the copy from section 1 of this file; select category **Apps for Software Teams** and bonus prizes **Best Agents** and **Best apps with Teamwork Graph integration**; paste the bonus write-ups.
3. Add: installation link (step 7), YouTube video URL (step 8), real screenshots, testing instructions (section 1).
4. Review once, then **Submit**. Drafts can be edited until the deadline; after Dec 23 05:00 JST the submission locks.

### After any code change later
```bash
cd ~/workspace/bounty/codegeist/shipbrief
forge deploy -e production        # updates the shared (production) app
forge install --upgrade --site <your-site>.atlassian.net --product jira   # your own install, if scopes changed
```

---

## 3. Notes and known limitations

- **Teamwork Graph is a Preview API.** Curated queries and per-object scopes are as documented in November 2026; Atlassian promises ≥1 month deprecation notice for breaking changes. If a graph query fails at runtime, ShipBrief reports that source as unreadable instead of failing the whole brief.
- **Runs as the user.** All Jira and Graph reads use `asUser()`, so the agent never sees more than the person chatting — good for judging on any test site, and the reason results vary with the test data.
- **No Forge LLM usage** → no LLM charges from this app. Forge platform usage on the free developer license is sufficient for judging traffic.
- **Marketplace bonus not targeted.** Publishing to the Marketplace would conflict with sharing via installation link (an app submitted for listing cannot also be shared by link); we deliberately target the Agents + Teamwork Graph bonuses instead.
- Eligibility check (official rules): Japan is not an excluded region; the project is newly built on Forge during the submission period; all submission materials are in English.
