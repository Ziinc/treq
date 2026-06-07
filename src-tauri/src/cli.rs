use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;
use tauri_plugin_cli::{Matches, SubcommandMatches};

use crate::agent_dispatch;
use crate::binary_paths;
use crate::core;
use crate::db::Database;
use crate::local_db;

fn normalize_repo_path(path: &Path) -> String {
    std::fs::canonicalize(path)
        .ok()
        .and_then(|p| p.to_str().map(|s| s.to_string()))
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

/// Walk up from CWD to find a directory containing `.treq` or `.git`.
pub fn detect_repo_path() -> Result<String, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("Failed to get CWD: {}", e))?;

    let mut dir = cwd.as_path();
    loop {
        if dir.join(".git").is_dir() {
            return Ok(normalize_repo_path(dir));
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }

    Err("Not inside a git repository (no .git directory found)".to_string())
}

/// Initialize binary paths cache for CLI mode (no database needed).
pub fn init_cli_binary_paths() {
    let mut paths = HashMap::new();
    for name in ["jj", "git"] {
        if let Some(path) = binary_paths::detect_binary(name) {
            paths.insert(name.to_string(), path);
        }
    }
    binary_paths::init_binary_paths_cache(paths);
}

/// Top-level CLI dispatch. Returns `true` if a CLI command was handled.
pub fn handle_cli_command(subcommand: &SubcommandMatches) -> bool {
    match subcommand.name.as_str() {
        "add" => {
            handle_workspace_add(&subcommand.matches);
            true
        }
        "set" => {
            handle_workspace_set(&subcommand.matches);
            true
        }
        "st" => {
            handle_workspace_status(&subcommand.matches);
            true
        }
        "mv" => {
            handle_workspace_move(&subcommand.matches);
            true
        }
        "agent" => {
            handle_workspace_agent(&subcommand.matches);
            true
        }
        "help" => {
            print_cli_help();
            true
        }
        _ => false,
    }
}

/// Handles top-level CLI args that do not map to subcommands.
/// Returns `true` when an arg is consumed and no GUI should be opened.
pub fn handle_cli_global_args(matches: &Matches) -> bool {
    if let Some(help_text) = matches.args.get("help").and_then(|arg| arg.value.as_str()) {
        println!("{}", help_text);
        return true;
    }

    if matches.args.contains_key("version") {
        println!("treq {}", env!("CARGO_PKG_VERSION"));
        return true;
    }

    false
}

#[cfg(test)]
fn is_supported_cli_command(name: &str) -> bool {
    matches!(name, "add" | "set" | "st" | "mv" | "agent" | "help")
}

fn print_cli_help() {
    println!("Treq - Coding Agent Manager");
    println!();
    println!("Usage:");
    println!("  treq add <branch_name> [-d description] [-l title] [-s source_branch]");
    println!("  treq set <workspace_name> [-d description] [-l title] [-t target_branch]");
    println!("  treq st [workspace_name]");
    println!("  treq mv <source> <destination> -f [FILES...] -h [HUNKS...] -c [COMMITS...]");
    println!("  treq agent <branch> <prompt> [-m <edit|plan>]");
    println!("  treq help");
}

fn parse_agent_mode(mode: &str) -> Result<&'static str, String> {
    match mode.trim() {
        "edit" => Ok("acceptEdits"),
        "plan" => Ok("plan"),
        other => Err(format!(
            "invalid mode '{}'. Expected one of: edit, plan",
            other
        )),
    }
}

fn parse_agent_mode_or_default(mode: Option<&str>) -> Result<&'static str, String> {
    match mode {
        Some(value) => parse_agent_mode(value),
        None => Ok("acceptEdits"),
    }
}

fn get_db_setting(db: &Database, key: &str) -> Option<String> {
    db.get_setting(key)
        .ok()
        .flatten()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn resolve_default_agent(repo_path: &str) -> String {
    let db_path = core::resolve_app_db_path(repo_path);
    let Ok(db) = Database::new(db_path) else {
        return "claude".to_string();
    };

    db.get_repo_setting(repo_path, "default_agent")
        .ok()
        .flatten()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| get_db_setting(&db, "default_agent"))
        .unwrap_or_else(|| "claude".to_string())
}

#[cfg(test)]
fn build_agent_deep_link_url(
    repo_path: &str,
    branch: &str,
    prompt: &str,
    mode: &str,
    agent: &str,
    request_id: &str,
) -> String {
    format!(
        "treq://agent/start?repo={}&branch={}&prompt={}&mode={}&agent={}&request_id={}",
        urlencoding::encode(repo_path),
        urlencoding::encode(branch),
        urlencoding::encode(prompt),
        urlencoding::encode(mode),
        urlencoding::encode(agent),
        urlencoding::encode(request_id),
    )
}

fn dispatch_agent_request(
    repo_path: &str,
    branch: &str,
    prompt: &str,
    mode: &str,
    agent: &str,
    request_id: &str,
) -> Result<(), String> {
    let now = agent_dispatch::now_millis();
    local_db::prune_stale_instance_registry(repo_path, now, agent_dispatch::HEARTBEAT_TIMEOUT_MS)?;
    let instances = local_db::list_instance_registry(repo_path)?;

    let instance =
        agent_dispatch::resolve_target_instance(&instances, repo_path).ok_or_else(|| {
            format!(
                "No running Treq instance has repo '{}'. Open this repo in Treq first.",
                repo_path
            )
        })?;

    let request = agent_dispatch::AgentDispatchRequest {
        request_id: request_id.to_string(),
        repo: repo_path.to_string(),
        branch: branch.to_string(),
        prompt: prompt.to_string(),
        mode: mode.to_string(),
        agent: agent.to_string(),
    };
    let response = agent_dispatch::send_dispatch_request(
        &instance.endpoint,
        &request,
        Duration::from_millis(250),
        Duration::from_millis(600),
    )?;
    if response.status == "handled" {
        return Ok(());
    }
    Err(format!(
        "Agent request not handled by instance '{}': {}",
        instance.instance_id,
        response
            .reason
            .unwrap_or_else(|| "unknown dispatch failure".to_string())
    ))
}

fn get_arg_value(matches: &Matches, name: &str) -> Option<String> {
    matches.args.get(name).and_then(|arg| {
        arg.value
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
    })
}

fn get_arg_values(matches: &Matches, name: &str) -> Vec<String> {
    let Some(arg) = matches.args.get(name) else {
        return Vec::new();
    };
    match &arg.value {
        serde_json::Value::Array(values) => values
            .iter()
            .filter_map(|value| value.as_str())
            .map(|value| value.to_string())
            .filter(|value| !value.is_empty())
            .collect(),
        serde_json::Value::String(value) if !value.is_empty() => vec![value.to_string()],
        _ => Vec::new(),
    }
}

fn handle_workspace_add(matches: &Matches) {
    let branch_name = match get_arg_value(matches, "branch_name") {
        Some(name) => name,
        None => {
            eprintln!("Error: branch name is required");
            eprintln!(
                "Usage: treq add <branch_name> [-d description] [-l title] [-s source_branch]"
            );
            return;
        }
    };

    let description = get_arg_value(matches, "description");
    let source_branch = get_arg_value(matches, "source-branch");

    let repo_path = match detect_repo_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Error: {}", e);
            return;
        }
    };

    // Ensure the repo is initialized
    if let Err(e) = core::init(&repo_path) {
        eprintln!("Error initializing repo: {}", e);
        return;
    }

    match core::create_workspace(
        &repo_path,
        &branch_name,
        description,
        None,
        source_branch.as_deref(),
        None,
    ) {
        Ok(workspace) => {
            println!("Created workspace: {}", workspace.branch_name);
            if let Some(ref description) = workspace.description {
                println!("  Description: {}", description);
            }
            let full_path = Path::new(&repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path);
            println!("  Path: {}", full_path.display());
        }
        Err(e) => {
            eprintln!("Error creating workspace: {}", e);
        }
    }
}

fn handle_workspace_set(matches: &Matches) {
    let workspace_name = match get_arg_value(matches, "workspace_name") {
        Some(name) => name,
        None => {
            eprintln!("Error: workspace name is required");
            eprintln!(
                "Usage: treq set <workspace_name> [-d description] [-l title] [-t target_branch]"
            );
            return;
        }
    };

    let description = get_arg_value(matches, "description");
    let title = get_arg_value(matches, "title");
    let target_branch = get_arg_value(matches, "target-branch");

    if description.is_none() && target_branch.is_none() && title.is_none() {
        eprintln!(
            "Error: specify at least one of -d (description), -l (title), or -t (target branch)"
        );
        return;
    }

    let repo_path = match detect_repo_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Error: {}", e);
            return;
        }
    };

    // Look up workspace by branch name
    let workspace = match local_db::get_workspace_by_branch(&repo_path, &workspace_name) {
        Ok(Some(ws)) => ws,
        Ok(None) => {
            eprintln!("Error: workspace '{}' not found", workspace_name);
            return;
        }
        Err(e) => {
            eprintln!("Error looking up workspace: {}", e);
            return;
        }
    };

    let description_param = match description {
        Some(i) => core::MaybeEmptyParam::Some(i),
        None => core::MaybeEmptyParam::Omitted,
    };
    let title_param = match title {
        Some(t) => core::MaybeEmptyParam::Some(t),
        None => core::MaybeEmptyParam::Omitted,
    };

    let target_param = match target_branch {
        Some(t) => core::MaybeEmptyParam::Some(t),
        None => core::MaybeEmptyParam::Omitted,
    };

    match core::update_workspace_with_title(
        &repo_path,
        workspace.id,
        target_param,
        title_param,
        description_param,
    ) {
        Ok(updated) => {
            println!("Updated workspace: {}", updated.branch_name);
            println!("  Title: {}", updated.title);
            if let Some(ref description) = updated.description {
                println!("  Description: {}", description);
            }
            if let Some(ref target) = updated.target_branch {
                println!("  Target: {}", target);
            }
        }
        Err(e) => {
            eprintln!("Error updating workspace: {}", e);
        }
    }
}

fn handle_workspace_status(matches: &Matches) {
    let workspace_name = get_arg_value(matches, "workspace_name");

    let repo_path = match detect_repo_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Error: {}", e);
            return;
        }
    };

    match workspace_name {
        Some(name) => {
            // Show status for a specific workspace
            let workspace = match local_db::get_workspace_by_branch(&repo_path, &name) {
                Ok(Some(ws)) => ws,
                Ok(None) => {
                    eprintln!("Error: workspace '{}' not found", name);
                    return;
                }
                Err(e) => {
                    eprintln!("Error looking up workspace: {}", e);
                    return;
                }
            };

            match core::workspace_status(&repo_path, Some(workspace.id)) {
                Ok(status) => {
                    print_workspace_status_detail(&status);
                }
                Err(e) => {
                    eprintln!("Error getting workspace status: {}", e);
                }
            }
        }
        None => {
            // Show status for all workspaces
            match core::list_workspace_statuses(&repo_path) {
                Ok(statuses) => {
                    if statuses.is_empty() {
                        println!("No workspaces found.");
                        return;
                    }
                    for status in &statuses {
                        print_workspace_partial_status(status);
                    }
                }
                Err(e) => {
                    eprintln!("Error listing workspace statuses: {}", e);
                }
            }
        }
    }
}

fn handle_workspace_move(matches: &Matches) {
    let source = match get_arg_value(matches, "source") {
        Some(value) => value,
        None => {
            eprintln!("Error: source workspace is required");
            eprintln!(
                "Usage: treq mv <source> <destination> -f [FILES...] -h [HUNKS...] -c [COMMITS...]"
            );
            return;
        }
    };
    let destination = match get_arg_value(matches, "destination") {
        Some(value) => value,
        None => {
            eprintln!("Error: destination workspace is required");
            eprintln!(
                "Usage: treq mv <source> <destination> -f [FILES...] -h [HUNKS...] -c [COMMITS...]"
            );
            return;
        }
    };

    let files = get_arg_values(matches, "files");
    let commits = get_arg_values(matches, "commits");
    let raw_hunks = get_arg_values(matches, "hunks");
    let mut hunks = Vec::new();
    for raw_hunk in raw_hunks {
        match core::parse_hunk_spec(&raw_hunk) {
            Ok(spec) => hunks.push(spec),
            Err(error) => {
                eprintln!("Error: {}", error);
                return;
            }
        }
    }

    let request = core::WorkspaceMoveRequest {
        files,
        hunks,
        commits,
    };
    if !request.has_selectors() {
        eprintln!("Error: specify at least one of -f, -h, or -c");
        return;
    }

    let repo_path = match detect_repo_path() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("Error: {}", error);
            return;
        }
    };

    match core::move_workspace_changes(&repo_path, &source, &destination, request) {
        Ok(result) => {
            println!(
                "Moved changes from '{}' to '{}': commits={}, files={}, hunks_applied={}, hunks_skipped={}",
                source,
                destination,
                result.commits_moved,
                result.files_moved,
                result.hunks_applied,
                result.hunks_skipped
            );
            for warning in result.warnings {
                eprintln!("Warning: {}", warning);
            }
        }
        Err(error) => {
            eprintln!("Error moving workspace changes: {}", error);
        }
    }
}

fn handle_workspace_agent(matches: &Matches) {
    let branch = match get_arg_value(matches, "branch") {
        Some(value) => value,
        None => {
            eprintln!("Error: branch is required");
            eprintln!("Usage: treq agent <branch> <prompt> [-m <edit|plan>]");
            return;
        }
    };

    let prompt = match get_arg_value(matches, "prompt") {
        Some(value) => value,
        None => {
            eprintln!("Error: prompt is required");
            eprintln!("Usage: treq agent <branch> <prompt> [-m <edit|plan>]");
            return;
        }
    };

    let mode = match parse_agent_mode_or_default(get_arg_value(matches, "mode").as_deref()) {
        Ok(mode) => mode.to_string(),
        Err(error) => {
            eprintln!("Error: {}", error);
            return;
        }
    };

    let repo_path = match detect_repo_path() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("Error: {}", error);
            return;
        }
    };

    if let Err(error) = core::init(&repo_path) {
        eprintln!("Error initializing repo: {}", error);
        return;
    }

    let workspace = match local_db::get_workspace_by_branch(&repo_path, &branch) {
        Ok(Some(workspace)) => workspace,
        Ok(None) => {
            eprintln!(
                "Error: workspace branch '{}' not found. Create it first with `treq add {}`.",
                branch, branch
            );
            return;
        }
        Err(error) => {
            eprintln!("Error looking up workspace: {}", error);
            return;
        }
    };

    let request_id = format!(
        "cli-{}-{}",
        workspace.id,
        chrono::Utc::now().timestamp_millis()
    );
    let agent = resolve_default_agent(&repo_path);
    if let Err(error) = dispatch_agent_request(
        &repo_path,
        &workspace.branch_name,
        &prompt,
        &mode,
        &agent,
        &request_id,
    ) {
        eprintln!("Error dispatching agent request: {}", error);
        std::process::exit(1);
    }
}

fn print_workspace_partial_status(status: &core::WorkspaceSidebarStatus) {
    let flags = if status.has_conflicts {
        " [CONFLICTS]"
    } else {
        ""
    };
    println!("  {} {}{}", "●", status.current.branch_name, flags);
    if let Some(ref description) = status.current.description {
        println!("    Description: {}", description);
    }
    if let Some(ref target) = status.current.target_branch {
        println!("    Target: {}", target);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_dispatch;
    use serde_json::Value;
    use std::fs;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::path::Path;
    use std::sync::{Mutex, OnceLock};
    use std::thread;
    use std::time::Duration;
    use tauri_plugin_cli::SubcommandMatches;
    use tempfile::TempDir;

    fn make_subcommand(name: &str) -> SubcommandMatches {
        let mut sub = SubcommandMatches::default();
        sub.name = name.to_string();
        sub.matches = Matches::default();
        sub
    }

    #[test]
    fn supports_new_top_level_commands() {
        assert!(is_supported_cli_command("add"));
        assert!(is_supported_cli_command("set"));
        assert!(is_supported_cli_command("st"));
        assert!(is_supported_cli_command("mv"));
        assert!(is_supported_cli_command("agent"));
        assert!(is_supported_cli_command("help"));
        assert!(!is_supported_cli_command("open"));
    }

    #[test]
    fn rejects_removed_commands() {
        assert!(!is_supported_cli_command("ls"));
        assert!(!is_supported_cli_command("workspace"));
    }

    #[test]
    fn help_is_handled_by_cli_dispatch() {
        let subcommand = make_subcommand("help");
        assert!(handle_cli_command(&subcommand));
    }

    #[test]
    fn unknown_subcommand_is_not_handled_by_cli_dispatch() {
        let subcommand = make_subcommand("open");
        assert!(!handle_cli_command(&subcommand));
    }

    #[test]
    fn top_level_help_arg_is_handled_by_global_dispatch() {
        let mut matches = Matches::default();
        let mut help_arg = tauri_plugin_cli::ArgData::default();
        help_arg.value = Value::String("generated help text".to_string());
        help_arg.occurrences = 0;
        matches.args.insert("help".to_string(), help_arg);

        assert!(handle_cli_global_args(&matches));
    }

    #[test]
    fn no_global_args_are_not_handled() {
        let matches = Matches::default();
        assert!(!handle_cli_global_args(&matches));
    }

    #[test]
    fn top_level_version_arg_is_handled_by_global_dispatch() {
        let mut matches = Matches::default();
        matches
            .args
            .insert("version".to_string(), tauri_plugin_cli::ArgData::default());

        assert!(handle_cli_global_args(&matches));
    }

    #[test]
    fn parse_agent_mode_maps_edit_and_plan() {
        assert_eq!(
            parse_agent_mode("edit").expect("edit mode should parse"),
            "acceptEdits"
        );
        assert_eq!(
            parse_agent_mode("plan").expect("plan mode should parse"),
            "plan"
        );
    }

    #[test]
    fn parse_agent_mode_defaults_to_edit_when_missing() {
        assert_eq!(
            parse_agent_mode_or_default(None).expect("missing mode should default"),
            "acceptEdits"
        );
    }

    #[test]
    fn parse_agent_mode_or_default_uses_explicit_mode() {
        assert_eq!(
            parse_agent_mode_or_default(Some("plan")).expect("plan should parse"),
            "plan"
        );
    }

    #[test]
    fn parse_agent_mode_rejects_invalid_mode() {
        let error = parse_agent_mode("invalid").expect_err("invalid mode must fail");
        assert!(error.contains("invalid mode"));
    }

    #[test]
    fn build_agent_deep_link_encodes_payload() {
        let url = build_agent_deep_link_url(
            "/tmp/repo path",
            "feat/test",
            "Fix this now",
            "acceptEdits",
            "codex",
            "req-123",
        );
        assert!(url.starts_with("treq://agent/start?"));
        assert!(url.contains("repo=%2Ftmp%2Frepo%20path"));
        assert!(url.contains("branch=feat%2Ftest"));
        assert!(url.contains("prompt=Fix%20this%20now"));
        assert!(url.contains("mode=acceptEdits"));
        assert!(url.contains("agent=codex"));
        assert!(url.contains("request_id=req-123"));
    }

    #[test]
    fn normalize_repo_path_returns_canonical_when_available() {
        let temp = TempDir::new().expect("temp dir");
        let canonical = std::fs::canonicalize(temp.path()).expect("canonical path");
        let normalized = normalize_repo_path(temp.path());
        assert_eq!(
            Path::new(&normalized),
            canonical.as_path(),
            "normalized path should be canonical"
        );
    }

    #[test]
    fn normalize_repo_path_falls_back_for_missing_path() {
        let missing = Path::new("/definitely/not/present/treq-missing-path");
        let normalized = normalize_repo_path(missing);
        assert_eq!(normalized, missing.to_string_lossy());
    }

    #[test]
    fn positional_cli_args_take_values_in_tauri_config() {
        let config_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
        let config = fs::read_to_string(config_path).expect("failed to read tauri.conf.json");
        let json: Value = serde_json::from_str(&config).expect("failed to parse tauri.conf.json");

        let subcommands = json["plugins"]["cli"]["subcommands"]
            .as_object()
            .expect("plugins.cli.subcommands must be an object");

        for (subcommand_name, subcommand) in subcommands {
            let args = match subcommand.get("args").and_then(Value::as_array) {
                Some(args) => args,
                None => continue,
            };

            for arg in args {
                let has_index = arg.get("index").is_some();
                if !has_index {
                    continue;
                }

                let takes_value = arg
                    .get("takesValue")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let arg_name = arg
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("<unknown>");

                assert!(
                    takes_value,
                    "positional arg '{}' in subcommand '{}' must set takesValue=true",
                    arg_name, subcommand_name
                );
            }
        }
    }

    #[test]
    fn mv_subcommand_uses_source_and_destination_positionals() {
        let config_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
        let config = fs::read_to_string(config_path).expect("failed to read tauri.conf.json");
        let json: Value = serde_json::from_str(&config).expect("failed to parse tauri.conf.json");
        let mv = json["plugins"]["cli"]["subcommands"]["mv"]
            .as_object()
            .expect("mv subcommand must exist");
        let args = mv
            .get("args")
            .and_then(Value::as_array)
            .expect("mv args must be an array");

        let source = args
            .iter()
            .find(|arg| arg.get("name").and_then(Value::as_str) == Some("source"))
            .expect("mv must define source positional arg");
        assert_eq!(source.get("index").and_then(Value::as_i64), Some(1));
        assert_eq!(
            source.get("takesValue").and_then(Value::as_bool),
            Some(true)
        );

        let destination = args
            .iter()
            .find(|arg| arg.get("name").and_then(Value::as_str) == Some("destination"))
            .expect("mv must define destination positional arg");
        assert_eq!(destination.get("index").and_then(Value::as_i64), Some(2));
        assert_eq!(
            destination.get("takesValue").and_then(Value::as_bool),
            Some(true)
        );
    }

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn seed_registry(instances: Vec<agent_dispatch::RegisteredInstance>, repo_path: &str) {
        local_db::init_local_db(repo_path).expect("init local db");
        for instance in instances {
            local_db::upsert_instance_registry(repo_path, instance).expect("upsert instance");
        }
    }

    #[test]
    fn dispatch_agent_request_selects_matching_instance_and_handles_ack() {
        let _guard = env_lock().lock().unwrap();
        let temp = TempDir::new().expect("temp");

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let endpoint = listener.local_addr().unwrap().to_string();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut payload = String::new();
            stream.read_to_string(&mut payload).expect("read");
            let request: agent_dispatch::AgentDispatchRequest =
                serde_json::from_str(payload.trim()).expect("json");
            assert_eq!(request.branch, "feat/x");
            let response = serde_json::to_string(&agent_dispatch::AgentDispatchResponse::handled())
                .expect("serialize");
            stream.write_all(response.as_bytes()).expect("write");
        });

        let repo = temp.path().join("repo");
        std::fs::create_dir_all(&repo).expect("mkdir");
        let normalized_repo = agent_dispatch::normalize_repo_path(repo.to_str().unwrap());
        seed_registry(
            vec![agent_dispatch::RegisteredInstance {
                instance_id: "instance-1".to_string(),
                pid: 1,
                started_at: 1,
                last_heartbeat_at: agent_dispatch::now_millis(),
                endpoint,
                windows: vec![agent_dispatch::InstanceWindowSnapshot {
                    window_label: "main".to_string(),
                    normalized_repo_path: normalized_repo,
                    focused: true,
                    last_focused_at: Some(agent_dispatch::now_millis()),
                }],
            }],
            repo.to_str().unwrap(),
        );

        let result = dispatch_agent_request(
            repo.to_str().unwrap(),
            "feat/x",
            "hello",
            "plan",
            "codex",
            "req-1",
        );
        assert!(result.is_ok());
        handle.join().expect("join");
    }

    #[test]
    fn dispatch_agent_request_returns_error_when_no_matching_instance() {
        let _guard = env_lock().lock().unwrap();
        let temp = TempDir::new().expect("temp");
        let repo = temp.path().join("repo");
        std::fs::create_dir_all(&repo).expect("mkdir");
        seed_registry(vec![], repo.to_str().unwrap());
        let result = dispatch_agent_request(
            "/tmp/unknown-repo",
            "feat/x",
            "hello",
            "plan",
            "codex",
            "req-1",
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No running Treq instance"));
    }

    #[test]
    fn dispatch_agent_request_surfaces_ack_timeout_error() {
        let _guard = env_lock().lock().unwrap();
        let temp = TempDir::new().expect("temp");

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let endpoint = listener.local_addr().unwrap().to_string();
        let handle = thread::spawn(move || {
            let (_stream, _) = listener.accept().expect("accept");
            thread::sleep(Duration::from_millis(900));
        });

        let repo = temp.path().join("repo");
        std::fs::create_dir_all(&repo).expect("mkdir");
        let normalized_repo = agent_dispatch::normalize_repo_path(repo.to_str().unwrap());
        seed_registry(
            vec![agent_dispatch::RegisteredInstance {
                instance_id: "instance-timeout".to_string(),
                pid: 1,
                started_at: 1,
                last_heartbeat_at: agent_dispatch::now_millis(),
                endpoint,
                windows: vec![agent_dispatch::InstanceWindowSnapshot {
                    window_label: "main".to_string(),
                    normalized_repo_path: normalized_repo,
                    focused: true,
                    last_focused_at: Some(agent_dispatch::now_millis()),
                }],
            }],
            repo.to_str().unwrap(),
        );

        let result = dispatch_agent_request(
            repo.to_str().unwrap(),
            "feat/x",
            "hello",
            "plan",
            "codex",
            "req-1",
        );
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert!(
            error.contains("failed reading dispatch response")
                || error.contains("invalid dispatch response payload")
        );
        handle.join().expect("join");
    }
}

fn print_workspace_status_detail(status: &core::WorkspaceStatus) {
    println!("Workspace: {}", status.partial.current.branch_name);
    if let Some(ref description) = status.partial.current.description {
        println!("  Description: {}", description);
    }
    if let Some(ref target) = &status.target {
        println!("  Target: {}", target.branch_name);
    }
    println!(
        "  Changes: {}",
        if status.partial.has_changes {
            "yes"
        } else {
            "no"
        }
    );
    println!(
        "  Conflicts: {}",
        if status.partial.has_conflicts {
            "YES"
        } else {
            "no"
        }
    );
    println!("  Commits ahead: {}", status.commits_ahead_of_target.len());

    if !status.children.is_empty() {
        println!("  Children:");
        for child in &status.children {
            println!("    - {}", child.branch_name);
        }
    }

    if !status.commits_ahead_of_target.is_empty() {
        println!("  Commits:");
        for commit in &status.commits_ahead_of_target {
            let msg = commit.message.lines().next().unwrap_or("");
            println!("    {} {}", &commit.hash[..8.min(commit.hash.len())], msg);
        }
    }
}
