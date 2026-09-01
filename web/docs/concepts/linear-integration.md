---
sidebar_position: 7
---

# Linear Integration

_How Treq connects workspaces to Linear issues with auto-kickoff and direct workspace creation._

Treq's Linear integration links workspaces to Linear issues, letting you view and manage issues from within Treq and kick off a workspace directly from an issue without leaving the app.

## Viewing Issues

Open the Linear panel in the workspace sidebar to list Linear issues. The list view shows all team issues with their status, assignee, and labels. You can view issue details, including the description, sub-issues, and full context.

## Kicking Off Workspaces from Issues

When you view a Linear issue, a **Create Workspace** action immediately kicks off a new workspace using the issue's suggested branch name, title, and description. Workspaces created this way stay linked to the issue.

If the issue has sub-issues, you can optionally include them as separate nested workspaces in a single action. Each sub-issue becomes a child workspace in the stack.

## Authentication

Treq supports two authentication methods for Linear:

**Free tier:** Paste your personal Linear API key into Settings and store it locally per repository. Your key stays on your machine and is never sent to Treq's servers.

**Pro tier:** Use OAuth2 to connect your Linear account. Authentication is proxied through Treq's servers, so the raw API token never reaches your browser or local machine. If both an API key and OAuth token are set, the API key takes priority.

## Auto-Kickoff with Labels

Configure a label name in your repository settings. Any Linear issue that gets that label automatically kicks off a new workspace at a regular interval. Useful for a "ready for dev" or "in review" workflow where labeling an issue should immediately start workspace creation.

The auto-kickoff poller runs every 60 seconds and checks for new issues with the configured label. It tracks which issues have already been kicked off to avoid creating duplicate workspaces. If an issue fails to create a workspace, it is still marked as handled to prevent retry storms; check the app logs for the error.

To enable auto-kickoff, set `linear_auto_kickoff_label` in your repo settings to a label name. Leave it empty or unset to disable polling. The feature requires a configured Linear API key.

## Repository Settings

| Setting | Type | Purpose |
|---|---|---|
| `linear_api_key` | String | Personal Linear API key (free tier) |
| `linear_auto_kickoff_label` | String | Label name for auto-kickoff polling; empty means disabled |
| `linear_handled_issue_ids` | JSON array | Internal tracking of issues already kicked off |

## Availability

| Features | Free | Pro |
|---|---|---|
| View Linear issues | ✅* | ✅ |
| Create workspace from issue | ✅* | ✅ |
| Include sub-issues as nested workspaces | ✅* | ✅ |
| Auto-kickoff on label | ✅* | ✅ |

\* Requires personal Linear API key
