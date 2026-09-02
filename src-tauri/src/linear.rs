use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LinearIssue {
  pub id: String,
  pub identifier: String,
  pub title: String,
  pub description: Option<String>,
  pub state: LinearState,
  pub labels: Vec<String>,
  pub branch_name: String,
  pub parent_id: Option<String>,
  pub sub_issue_ids: Vec<String>,
  pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LinearTeam {
  pub id: String,
  pub name: String,
  pub key: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LinearState {
  pub name: String,
  #[serde(rename = "type")]
  pub state_type: String,
}

pub enum LinearClientSource {
  ApiKey(String),
  ProxyToken,
}

pub fn resolve_linear_client(
  repo_path: &str,
  db: &crate::db::Database,
) -> Result<LinearClientSource, String> {
  let api_key = db
    .get_repo_setting(repo_path, "linear_api_key")
    .map_err(|e| format!("Failed to read linear_api_key setting: {e}"))?;

  if let Some(key) = api_key {
    Ok(LinearClientSource::ApiKey(key))
  } else {
    Ok(LinearClientSource::ProxyToken)
  }
}

#[derive(Deserialize)]
struct LinearGraphqlResponse<T> {
  data: Option<T>,
  errors: Option<Vec<LinearGraphqlError>>,
}

#[derive(Deserialize)]
struct LinearGraphqlError {
  message: String,
}

#[derive(Deserialize)]
struct LinearIssuesData {
  issues: LinearIssuesConnection,
}

#[derive(Deserialize)]
struct LinearIssuesConnection {
  nodes: Vec<LinearIssueNode>,
}

#[derive(Deserialize)]
struct LinearIssueNode {
  id: String,
  identifier: String,
  title: String,
  description: Option<String>,
  #[serde(default)]
  state: LinearStateData,
  #[serde(default)]
  labels: LinearLabelsConnection,
  #[serde(rename = "branchName")]
  branch_name: String,
  #[serde(rename = "parent")]
  parent_id: Option<LinearParent>,
  #[serde(default, rename = "children")]
  sub_issues: LinearSubIssuesConnection,
  url: String,
}

#[derive(Deserialize)]
struct LinearStateData {
  name: String,
  #[serde(rename = "type")]
  state_type: String,
}

impl Default for LinearStateData {
  fn default() -> Self {
    Self {
      name: "Unknown".to_string(),
      state_type: "unknown".to_string(),
    }
  }
}

#[derive(Deserialize)]
struct LinearLabelsConnection {
  nodes: Vec<LinearLabelNode>,
}

impl Default for LinearLabelsConnection {
  fn default() -> Self {
    Self { nodes: vec![] }
  }
}

#[derive(Deserialize)]
struct LinearLabelNode {
  name: String,
}

#[derive(Deserialize)]
struct LinearParent {
  id: String,
}

#[derive(Deserialize)]
struct LinearSubIssuesConnection {
  nodes: Vec<LinearSubIssueNode>,
}

impl Default for LinearSubIssuesConnection {
  fn default() -> Self {
    Self { nodes: vec![] }
  }
}

#[derive(Deserialize)]
struct LinearSubIssueNode {
  id: String,
}

#[derive(Deserialize)]
struct LinearTeamsData {
  teams: LinearTeamsConnection,
}

#[derive(Deserialize)]
struct LinearTeamsConnection {
  nodes: Vec<LinearTeamNode>,
}

#[derive(Deserialize)]
struct LinearTeamNode {
  id: String,
  name: String,
  key: String,
}

pub async fn linear_list_teams_impl(api_key: &str) -> Result<Vec<LinearTeam>, String> {
  let query = r#"query {
    teams(first: 100) {
      nodes {
        id
        name
        key
      }
    }
  }"#;

  let client = reqwest::Client::new();
  let response = client
    .post("https://api.linear.app/graphql")
    .header("Authorization", api_key)
    .json(&serde_json::json!({ "query": query }))
    .send()
    .await
    .map_err(|e| format!("Failed to fetch Linear teams: {e}"))?;

  let result: LinearGraphqlResponse<LinearTeamsData> = response
    .json()
    .await
    .map_err(|e| format!("Failed to parse Linear response: {e}"))?;

  if let Some(errors) = result.errors {
    return Err(format!(
      "Linear API error: {}",
      errors
        .iter()
        .map(|e| e.message.as_str())
        .collect::<Vec<_>>()
        .join("; ")
    ));
  }

  let data = result
    .data
    .ok_or_else(|| "No data in Linear response".to_string())?;

  Ok(
    data
      .teams
      .nodes
      .into_iter()
      .map(|node| LinearTeam {
        id: node.id,
        name: node.name,
        key: node.key,
      })
      .collect(),
  )
}

pub async fn linear_list_issues_impl(
  api_key: &str,
  team_filter: Option<&str>,
) -> Result<Vec<LinearIssue>, String> {
  let query = if let Some(team) = team_filter {
    format!(
      r#"query {{
        issues(first: 100, filter: {{team: {{key: "{}"}}}}) {{
          nodes {{
            id
            identifier
            title
            description
            state {{ name type }}
            labels(first: 50) {{ nodes {{ name }} }}
            branchName
            parent {{ id }}
            children(first: 50) {{ nodes {{ id }} }}
            url
          }}
        }}
      }}"#,
      team
    )
  } else {
    r#"query {
      issues(first: 100) {
        nodes {
          id
          identifier
          title
          description
          state { name type }
          labels(first: 50) { nodes { name } }
          branchName
          parent { id }
          children(first: 50) { nodes { id } }
          url
        }
      }
    }"#
      .to_string()
  };

  let client = reqwest::Client::new();
  let response = client
    .post("https://api.linear.app/graphql")
    .header("Authorization", api_key)
    .json(&serde_json::json!({ "query": query }))
    .send()
    .await
    .map_err(|e| format!("Failed to fetch Linear issues: {e}"))?;

  let result: LinearGraphqlResponse<LinearIssuesData> = response
    .json()
    .await
    .map_err(|e| format!("Failed to parse Linear response: {e}"))?;

  if let Some(errors) = result.errors {
    return Err(format!(
      "Linear API error: {}",
      errors
        .iter()
        .map(|e| e.message.as_str())
        .collect::<Vec<_>>()
        .join("; ")
    ));
  }

  let data = result
    .data
    .ok_or_else(|| "No data in Linear response".to_string())?;

  Ok(
    data
      .issues
      .nodes
      .into_iter()
      .map(|node| LinearIssue {
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        description: node.description,
        state: LinearState {
          name: node.state.name,
          state_type: node.state.state_type,
        },
        labels: node.labels.nodes.into_iter().map(|l| l.name).collect(),
        branch_name: node.branch_name,
        parent_id: node.parent_id.map(|p| p.id),
        sub_issue_ids: node.sub_issues.nodes.into_iter().map(|s| s.id).collect(),
        url: node.url,
      })
      .collect(),
  )
}

pub async fn linear_get_issue_impl(api_key: &str, issue_id: &str) -> Result<LinearIssue, String> {
  let query = format!(
    r#"query {{
      issue(id: "{}") {{
        id
        identifier
        title
        description
        state {{ name type }}
        labels(first: 50) {{ nodes {{ name }} }}
        branchName
        parent {{ id }}
        children(first: 50) {{ nodes {{ id }} }}
        url
      }}
    }}"#,
    issue_id
  );

  let client = reqwest::Client::new();
  let response = client
    .post("https://api.linear.app/graphql")
    .header("Authorization", api_key)
    .json(&serde_json::json!({ "query": query }))
    .send()
    .await
    .map_err(|e| format!("Failed to fetch Linear issue: {e}"))?;

  #[derive(Deserialize)]
  struct IssueData {
    issue: Option<LinearIssueNode>,
  }

  let result: LinearGraphqlResponse<IssueData> = response
    .json()
    .await
    .map_err(|e| format!("Failed to parse Linear response: {e}"))?;

  if let Some(errors) = result.errors {
    return Err(format!(
      "Linear API error: {}",
      errors
        .iter()
        .map(|e| e.message.as_str())
        .collect::<Vec<_>>()
        .join("; ")
    ));
  }

  let data = result
    .data
    .ok_or_else(|| "No data in Linear response".to_string())?;
  let node = data
    .issue
    .ok_or_else(|| format!("Issue {issue_id} not found"))?;

  Ok(LinearIssue {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    description: node.description,
    state: LinearState {
      name: node.state.name,
      state_type: node.state.state_type,
    },
    labels: node.labels.nodes.into_iter().map(|l| l.name).collect(),
    branch_name: node.branch_name,
    parent_id: node.parent_id.map(|p| p.id),
    sub_issue_ids: node.sub_issues.nodes.into_iter().map(|s| s.id).collect(),
    url: node.url,
  })
}

const KICKOFF_POLL_INTERVAL: Duration = Duration::from_secs(60);

struct LinearAutoKickoffInner {
  watched: Mutex<std::collections::HashSet<String>>,
  shutdown: AtomicBool,
  loop_started: AtomicBool,
  wake: (Mutex<()>, std::sync::Condvar),
}

pub struct LinearAutoKickoffPoller {
  inner: Arc<LinearAutoKickoffInner>,
}

impl LinearAutoKickoffPoller {
  pub fn new() -> Self {
    Self {
      inner: Arc::new(LinearAutoKickoffInner {
        watched: Mutex::new(std::collections::HashSet::new()),
        shutdown: AtomicBool::new(false),
        loop_started: AtomicBool::new(false),
        wake: (Mutex::new(()), std::sync::Condvar::new()),
      }),
    }
  }

  pub fn ensure_started(&self) {
    if self
      .inner
      .loop_started
      .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
      .is_err()
    {
      return;
    }
    let inner = Arc::clone(&self.inner);
    thread::Builder::new()
      .name("linear-kickoff-poller".into())
      .spawn(move || kickoff_background_loop(inner))
      .expect("failed to spawn linear-kickoff-poller thread");
  }

  pub fn watch_repo(&self, repo_path: &str) {
    {
      let mut watched = self.inner.watched.lock().unwrap();
      watched.insert(repo_path.to_string());
    }
    self.ensure_started();
    self.request_wake();
  }

  fn request_wake(&self) {
    self.inner.wake.1.notify_one();
  }
}

fn kickoff_background_loop(inner: Arc<LinearAutoKickoffInner>) {
  use std::time::Instant;
  let mut last_poll: Option<Instant> = None;

  loop {
    if inner.shutdown.load(Ordering::SeqCst) {
      break;
    }

    let now = Instant::now();
    let poll_due = last_poll
      .map(|t| now.duration_since(t) >= KICKOFF_POLL_INTERVAL)
      .unwrap_or(true);

    if poll_due {
      let repos: Vec<String> = inner.watched.lock().unwrap().iter().cloned().collect();
      for repo_path in repos {
        if inner.shutdown.load(Ordering::SeqCst) {
          break;
        }
        if let Err(e) = poll_linear_kickoff(&repo_path) {
          log::warn!("linear-kickoff: failed for {repo_path}: {e}");
        }
      }
      last_poll = Some(Instant::now());
    }

    if inner.shutdown.load(Ordering::SeqCst) {
      break;
    }

    let wait = last_poll
      .map(|t| {
        let elapsed = now.duration_since(t);
        KICKOFF_POLL_INTERVAL.saturating_sub(elapsed)
      })
      .unwrap_or(Duration::ZERO)
      .max(Duration::from_millis(5));

    let (lock, cvar) = &inner.wake;
    let guard = lock.lock().unwrap();
    let _ = cvar
      .wait_timeout_while(guard, wait, |_| !inner.shutdown.load(Ordering::SeqCst))
      .unwrap();
  }
}

fn poll_linear_kickoff(repo_path: &str) -> Result<(), String> {
  let db_path =
    std::env::var("TREQ_APP_DB_PATH").map_err(|_| "TREQ_APP_DB_PATH not set".to_string())?;
  let db = crate::db::Database::new(std::path::PathBuf::from(db_path))
    .map_err(|e| format!("Failed to open database: {e}"))?;

  if !crate::core::feature_preview::is_enabled(
    &db,
    crate::core::feature_preview::PreviewFeature::LinearIntegration,
  ) {
    return Ok(());
  }

  let label = db
    .get_repo_setting(repo_path, "linear_auto_kickoff_label")
    .map_err(|e| format!("Failed to read linear_auto_kickoff_label: {e}"))?;

  let label = match label {
    Some(l) if !l.is_empty() => l,
    _ => return Ok(()),
  };

  let client_source = resolve_linear_client(repo_path, &db)?;
  let api_key = match client_source {
    LinearClientSource::ApiKey(key) => key,
    LinearClientSource::ProxyToken => {
      return Err("Linear auto-kickoff requires API key (OAuth proxy not ready)".to_string())
    }
  };

  let rt =
    tokio::runtime::Runtime::new().map_err(|e| format!("Failed to create async runtime: {e}"))?;

  let issues = rt.block_on(linear_list_issues_impl(&api_key, None))?;

  let handled_json = db
    .get_repo_setting(repo_path, "linear_handled_issue_ids")
    .map_err(|e| format!("Failed to read linear_handled_issue_ids: {e}"))?;

  let mut handled: std::collections::HashSet<String> = handled_json
    .as_ref()
    .and_then(|s| serde_json::from_str(s).ok())
    .unwrap_or_default();

  for issue in issues {
    if !issue.labels.contains(&label) || handled.contains(&issue.id) {
      continue;
    }

    match rt.block_on(kickoff_linear_issue_internal(
      &db, repo_path, &api_key, &issue.id, false,
    )) {
      Ok(_) => {
        handled.insert(issue.id);
      }
      Err(e) => {
        log::warn!("linear-kickoff: failed to kickoff {}: {}", issue.id, e);
        handled.insert(issue.id);
      }
    }
  }

  let handled_json = serde_json::to_string(&handled)
    .map_err(|e| format!("Failed to serialize handled issues: {e}"))?;
  db.set_repo_setting(repo_path, "linear_handled_issue_ids", &handled_json)
    .map_err(|e| format!("Failed to save linear_handled_issue_ids: {e}"))
}

async fn kickoff_linear_issue_internal(
  db: &crate::db::Database,
  repo_path: &str,
  api_key: &str,
  issue_id: &str,
  include_subissues: bool,
) -> Result<Vec<crate::commands::linear::LinearKickoffResult>, String> {
  let issue = linear_get_issue_impl(api_key, issue_id).await?;
  let mut results = vec![];

  let workspace_result =
    crate::commands::linear::open_or_create_workspace_from_linear_issue(repo_path, &issue).await?;
  results.push(workspace_result);

  if include_subissues && !issue.sub_issue_ids.is_empty() {
    for sub_id in &issue.sub_issue_ids {
      match linear_get_issue_impl(api_key, sub_id).await {
        Ok(sub_issue) => match crate::commands::linear::open_or_create_workspace_from_linear_issue(
          repo_path, &sub_issue,
        )
        .await
        {
          Ok(result) => {
            if result.created {
              if let Err(e) = crate::commands::linear::record_linear_workspace_parent(
                db,
                repo_path,
                result.workspace_id,
                issue_id,
              ) {
                log::warn!("linear-kickoff: failed to record parent for sub-issue {sub_id}: {e}");
              }
            }
            results.push(result);
          }
          Err(e) => log::warn!("linear-kickoff: failed to kickoff sub-issue {sub_id}: {e}"),
        },
        Err(e) => log::warn!("linear-kickoff: failed to fetch sub-issue {sub_id}: {e}"),
      }
    }
  }

  Ok(results)
}

static GLOBAL_KICKOFF_POLLER: std::sync::OnceLock<LinearAutoKickoffPoller> =
  std::sync::OnceLock::new();

pub fn kickoff_poller() -> &'static LinearAutoKickoffPoller {
  GLOBAL_KICKOFF_POLLER.get_or_init(LinearAutoKickoffPoller::new)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn deserialize_linear_issue_response() {
    let json = serde_json::json!({
      "id": "ENG-1",
      "identifier": "ENG-1",
      "title": "Test Issue",
      "description": "Test description",
      "state": { "name": "In Progress", "type": "started" },
      "labels": { "nodes": [{ "name": "bug" }] },
      "branchName": "eng-1-test",
      "parent": null,
      "children": { "nodes": [] },
      "url": "https://linear.app/issue/ENG-1"
    });

    let node: LinearIssueNode = serde_json::from_value(json).unwrap();
    assert_eq!(node.identifier, "ENG-1");
    assert_eq!(node.title, "Test Issue");
    assert_eq!(node.state.name, "In Progress");
    assert_eq!(node.state.state_type, "started");
    assert_eq!(node.labels.nodes.len(), 1);
    assert_eq!(node.labels.nodes[0].name, "bug");
    assert_eq!(node.branch_name, "eng-1-test");
  }

  #[test]
  fn deserialize_linear_issue_with_subissues() {
    let json = serde_json::json!({
      "id": "ENG-1",
      "identifier": "ENG-1",
      "title": "Parent Issue",
      "description": null,
      "state": { "name": "Backlog", "type": "backlog" },
      "labels": { "nodes": [] },
      "branchName": "eng-1",
      "parent": null,
      "children": { "nodes": [{ "id": "ENG-2" }, { "id": "ENG-3" }] },
      "url": "https://linear.app/issue/ENG-1"
    });

    let node: LinearIssueNode = serde_json::from_value(json).unwrap();
    assert_eq!(node.sub_issues.nodes.len(), 2);
    assert_eq!(node.sub_issues.nodes[0].id, "ENG-2");
    assert_eq!(node.sub_issues.nodes[1].id, "ENG-3");
  }

  #[test]
  fn deserialize_linear_issue_response_with_parent() {
    let json = serde_json::json!({
      "id": "ENG-2",
      "identifier": "ENG-2",
      "title": "Child Issue",
      "description": null,
      "state": { "name": "Todo", "type": "backlog" },
      "labels": { "nodes": [] },
      "branchName": "eng-2",
      "parent": { "id": "ENG-1" },
      "children": { "nodes": [] },
      "url": "https://linear.app/issue/ENG-2"
    });

    let node: LinearIssueNode = serde_json::from_value(json).unwrap();
    assert_eq!(node.parent_id.unwrap().id, "ENG-1");
  }
}
