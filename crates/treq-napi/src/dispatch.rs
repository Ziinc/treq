use serde_json::Value;

use crate::state;

/// Dispatch a command by name, with camelCase JSON args.
/// Mirrors the Tauri invoke() interface.
pub fn dispatch(command: &str, args: Value) -> Result<Value, String> {
    match command {
        // ── init_repo ──────────────────────────────────────────────────────
        "init_repo" => {
            let repo_path = get_str(&args, "repoPath")?;
            let result = treq_lib::core::init(&repo_path)?;
            Ok(Value::Bool(result))
        }

        // ── detect_editor_apps ────────────────────────────────────────────
        "detect_editor_apps" => Ok(serde_json::json!({
            "cursor": treq_lib::binary_paths::detect_editor_app("Cursor"),
            "vscode": treq_lib::binary_paths::detect_editor_app("Visual Studio Code"),
            "zed": treq_lib::binary_paths::detect_editor_app("Zed"),
        })),

        // ── get_treq_bin_dir ──────────────────────────────────────────────
        "get_treq_bin_dir" => {
            let dir = treq_lib::binary_paths::get_exe_dir()
                .ok_or_else(|| "Failed to determine treq binary directory".to_string())?;
            Ok(Value::String(dir))
        }

        // ── Settings ──────────────────────────────────────────────────────
        "get_setting" => {
            let key = get_str(&args, "key")?;
            let state = state::get()?;
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let val = db.get_setting(&key).map_err(|e| e.to_string())?;
            Ok(opt_str_to_value(val))
        }

        "get_settings_batch" => {
            let keys: Vec<String> =
                serde_json::from_value(args.get("keys").cloned().ok_or("Missing argument: keys")?)
                    .map_err(|e| e.to_string())?;
            let state = state::get()?;
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let result = db.get_settings_batch(&keys).map_err(|e| e.to_string())?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "set_setting" => {
            let key = get_str(&args, "key")?;
            let value = get_str(&args, "value")?;
            let state = state::get()?;
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.set_setting(&key, &value).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }

        "get_repo_setting" => {
            let repo_path = get_str(&args, "repoPath")?;
            let key = get_str(&args, "key")?;
            let state = state::get()?;
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let val = db
                .get_repo_setting(&repo_path, &key)
                .map_err(|e| e.to_string())?;
            Ok(opt_str_to_value(val))
        }

        "set_repo_setting" => {
            let repo_path = get_str(&args, "repoPath")?;
            let key = get_str(&args, "key")?;
            let value = get_str(&args, "value")?;
            let state = state::get()?;
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.set_repo_setting(&repo_path, &key, &value)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }

        // ── Workspace DB operations ───────────────────────────────────────
        "get_workspaces" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspaces = treq_lib::core::list_workspaces(&repo_path)?;
            serde_json::to_value(workspaces).map_err(|e| e.to_string())
        }

        "create_workspace" => {
            let repo_path = get_str(&args, "repoPath")?;
            let branch_name = get_str(&args, "branchName")?;
            let source_branch: Option<String> = args
                .get("sourceBranch")
                .and_then(|v| v.as_str())
                .map(String::from);
            let metadata: Option<String> = args
                .get("metadata")
                .and_then(|v| v.as_str())
                .map(String::from);

            let (title, description, moved_files) = parse_metadata(metadata.as_deref());
            let workspace = treq_lib::core::create_workspace(
                &repo_path,
                &branch_name,
                description,
                moved_files,
                source_branch.as_deref(),
                None, // included_copy_files
            )?;
            if let Some(t) = title {
                treq_lib::local_db::update_workspace_title(&repo_path, workspace.id, &t)?;
            }
            let workspace_id = workspace.id;
            treq_lib::local_db::update_workspace_last_rebased_commit(&repo_path, workspace_id, "")?;
            Ok(Value::Number(serde_json::Number::from(workspace_id)))
        }

        "delete_workspace" => {
            let repo_path = get_str(&args, "repoPath")?;
            let id: i64 = get_i64(&args, "id")?;
            treq_lib::core::delete_workspace(&repo_path, &id)?;
            Ok(Value::Null)
        }

        "update_workspace" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: i64 = get_i64(&args, "workspaceId")?;
            let target_branch = match args.get("targetBranch") {
                Some(Value::String(s)) if s.is_empty() => {
                    treq_lib::core::MaybeEmptyParam::EmptyValue
                }
                Some(Value::String(s)) => treq_lib::core::MaybeEmptyParam::Some(s.clone()),
                _ => treq_lib::core::MaybeEmptyParam::Omitted,
            };
            let description = match args.get("description") {
                Some(Value::String(s)) if s.is_empty() => {
                    treq_lib::core::MaybeEmptyParam::EmptyValue
                }
                Some(Value::String(s)) => treq_lib::core::MaybeEmptyParam::Some(s.clone()),
                _ => treq_lib::core::MaybeEmptyParam::Omitted,
            };
            let title = match args.get("title") {
                Some(Value::String(s)) if s.is_empty() => {
                    treq_lib::core::MaybeEmptyParam::EmptyValue
                }
                Some(Value::String(s)) => treq_lib::core::MaybeEmptyParam::Some(s.clone()),
                _ => treq_lib::core::MaybeEmptyParam::Omitted,
            };
            let workspace = treq_lib::core::update_workspace_with_title(
                &repo_path,
                workspace_id,
                target_branch,
                title,
                description,
            )?;
            serde_json::to_value(workspace).map_err(|e| e.to_string())
        }

        "get_repo_current_branch" => {
            let repo_path = get_str(&args, "repoPath")?;
            let branch = treq_lib::core::get_repo_current_branch(&repo_path)?;
            serde_json::to_value(branch).map_err(|e| e.to_string())
        }

        "get_repo_default_branch" => {
            let repo_path = get_str(&args, "repoPath")?;
            let branch = treq_lib::core::get_repo_default_branch(&repo_path)?;
            Ok(Value::String(branch))
        }

        "list_repo_branches" => {
            let repo_path = get_str(&args, "repoPath")?;
            let branches = treq_lib::core::list_repo_branches(&repo_path)?;
            serde_json::to_value(branches).map_err(|e| e.to_string())
        }

        "switch_repo_branch" => {
            let repo_path = get_str(&args, "repoPath")?;
            let bookmark_name = get_str(&args, "bookmarkName")?;
            let result = treq_lib::core::switch_repo_branch(&repo_path, &bookmark_name)?;
            Ok(Value::String(result))
        }

        "get_workspace_changed_files" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let files = treq_lib::core::list_changed_files(&repo_path, workspace_id)
                .map_err(|e| e.to_string())?;
            serde_json::to_value(files).map_err(|e| e.to_string())
        }

        "ls_workspace" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let entries = treq_lib::core::ls_workspace(&repo_path, workspace_id)?;
            serde_json::to_value(entries).map_err(|e| e.to_string())
        }

        "get_workspace_readme" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let readme = treq_lib::core::get_workspace_readme(&repo_path, workspace_id)?;
            serde_json::to_value(readme).map_err(|e| e.to_string())
        }

        "get_workspace_file_hunks" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let file_path = get_str(&args, "filePath")?;
            let conflict_style = get_conflict_style()?;
            let hunks = treq_lib::core::list_file_hunks(
                &repo_path,
                workspace_id,
                &file_path,
                &conflict_style,
            )
            .map_err(|e| e.to_string())?;
            serde_json::to_value(hunks).map_err(|e| e.to_string())
        }

        "get_workspace_file_lines" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let file_path = get_str(&args, "filePath")?;
            let from_parent = args
                .get("fromParent")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let start_line = args.get("startLine").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
            let end_line = args.get("endLine").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            let result = treq_lib::core::get_file_lines(
                &repo_path,
                workspace_id,
                &file_path,
                from_parent,
                start_line,
                end_line,
            )
            .map_err(|e| e.to_string())?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        // ── Workspace status / core operations ────────────────────────────
        "get_workspace_status" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let status = treq_lib::core::workspace_status(&repo_path, workspace_id)?;
            serde_json::to_value(status).map_err(|e| e.to_string())
        }

        "list_workspace_statuses" => {
            let repo_path = get_str(&args, "repoPath")?;
            let statuses = treq_lib::core::list_workspace_statuses(&repo_path)?;
            serde_json::to_value(statuses).map_err(|e| e.to_string())
        }

        "push_workspace_to_remote" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let result = treq_lib::core::push_workspace_to_remote(&repo_path, workspace_id)?;
            Ok(Value::String(result))
        }

        "pull_workspace_from_remote" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let conflict_style = get_conflict_style()?;
            let result = treq_lib::core::pull_workspace_from_remote(
                &repo_path,
                workspace_id,
                &conflict_style,
            )?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "check_and_rebase_workspaces" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let default_branch: Option<String> = args
                .get("defaultBranch")
                .and_then(|v| v.as_str())
                .map(String::from);
            let force: Option<bool> = args.get("force").and_then(|v| v.as_bool());
            let conflict_style = get_conflict_style()?;
            let result = treq_lib::core::check_and_rebase_workspaces(
                &repo_path,
                workspace_id,
                default_branch,
                force,
                &conflict_style,
            )?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "merge_workspace" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: i64 = get_i64(&args, "workspaceId")?;
            let message = get_str(&args, "message")?;
            let merge_strategy = get_str(&args, "mergeStrategy")?;
            let strategy = match merge_strategy.as_str() {
                "merge" => treq_lib::core::MergeCommit::Merge,
                "squash" => treq_lib::core::MergeCommit::SquashAndMerge,
                "rebase" => treq_lib::core::MergeCommit::RebaseAndMerge,
                _ => return Err(format!("Invalid merge strategy: {}", merge_strategy)),
            };
            treq_lib::core::merge_workspace(&repo_path, workspace_id, &message, strategy)?;
            Ok(Value::Null)
        }

        "move_workspace_changes" => {
            let repo_path = get_str(&args, "repoPath")?;
            let source_branch = get_str(&args, "sourceBranch")?;
            let destination_branch = get_str(&args, "destinationBranch")?;
            let request: treq_lib::core::WorkspaceMoveRequest = serde_json::from_value(
                args.get("request")
                    .ok_or("Missing required argument: request")?
                    .clone(),
            )
            .map_err(|e| e.to_string())?;
            let result = treq_lib::core::move_workspace_changes(
                &repo_path,
                &source_branch,
                &destination_branch,
                request,
            )?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "rename_workspace" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: i64 = get_i64(&args, "workspaceId")?;
            let new_branch_name = get_str(&args, "newBranchName")?;
            let dry_run: bool = args
                .get("dryRun")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let result = treq_lib::core::rename_workspace(
                &repo_path,
                workspace_id,
                &new_branch_name,
                dry_run,
            )?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "move_commit_to_existing_workspace" => {
            let repo_path = get_str(&args, "repoPath")?;
            let source_workspace_id: i64 = get_i64(&args, "sourceWorkspaceId")?;
            let commit_change_id = get_str(&args, "commitChangeId")?;
            let target_workspace_id: i64 = get_i64(&args, "targetWorkspaceId")?;
            treq_lib::core::move_commit_to_existing_workspace(
                &repo_path,
                source_workspace_id,
                &commit_change_id,
                target_workspace_id,
            )?;
            Ok(Value::Null)
        }

        "abandon_commit" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: i64 = get_i64(&args, "workspaceId")?;
            let commit_change_id = get_str(&args, "commitChangeId")?;
            treq_lib::core::abandon_commit(&repo_path, workspace_id, &commit_change_id)?;
            Ok(Value::Null)
        }

        // ── Commits ───────────────────────────────────────────────────────
        "discard_workspace_changes" => {
            let workspace_path = get_str(&args, "workspacePath")?;
            let result =
                treq_lib::jj::jj_restore_all(&workspace_path).map_err(|e| e.to_string())?;
            Ok(Value::String(result))
        }

        "create_commit" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let message = get_str(&args, "message")?;
            let result = treq_lib::core::commit_workspace(&repo_path, workspace_id, &message)?;
            Ok(Value::String(result))
        }

        "list_commits" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let include_target_branch_history: bool = args
                .get("includeTargetBranchHistory")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let target_branch_limit: Option<usize> = args
                .get("targetBranchLimit")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);
            let limit: Option<usize> = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);
            let result = treq_lib::core::list_commits(
                &repo_path,
                workspace_id,
                include_target_branch_history,
                target_branch_limit,
                limit,
            )?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "get_workspace_diff" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: i64 = get_i64(&args, "workspaceId")?;
            let result = treq_lib::core::workspace_diff(&repo_path, workspace_id)?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "get_commit_diff" => {
            let repo_path = get_str(&args, "repoPath")?;
            let revision = get_str(&args, "revision")?;
            let conflict_style = get_conflict_style()?;
            let result = treq_lib::core::get_commit_diff_with_conflict_style(
                &repo_path,
                opt_i64(&args, "workspaceId"),
                &revision,
                &conflict_style,
            )?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "get_commit_file_diff" => {
            let repo_path = get_str(&args, "repoPath")?;
            let revision = get_str(&args, "revision")?;
            let file_path = get_str(&args, "filePath")?;
            let conflict_style = get_conflict_style()?;
            let result = treq_lib::core::get_commit_file_diff_with_conflict_style(
                &repo_path,
                opt_i64(&args, "workspaceId"),
                &revision,
                &file_path,
                &conflict_style,
            )?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        // ── Sessions ──────────────────────────────────────────────────────
        "create_session" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let name = get_str(&args, "name")?;
            let id = treq_lib::local_db::add_session(&repo_path, workspace_id, name)?;
            Ok(Value::Number(id.into()))
        }

        "get_sessions" => {
            let repo_path = get_str(&args, "repoPath")?;
            let sessions = treq_lib::local_db::get_sessions(&repo_path)?;
            serde_json::to_value(sessions).map_err(|e| e.to_string())
        }

        "update_session_access" => {
            let repo_path = get_str(&args, "repoPath")?;
            let id: i64 = get_i64(&args, "id")?;
            treq_lib::local_db::update_session_access(&repo_path, id)?;
            Ok(Value::Null)
        }

        "get_session_model" => {
            let repo_path = get_str(&args, "repoPath")?;
            let id: i64 = get_i64(&args, "id")?;
            let model = treq_lib::local_db::get_session_model(&repo_path, id)?;
            Ok(opt_str_to_value(model))
        }

        "set_session_model" => {
            let repo_path = get_str(&args, "repoPath")?;
            let id: i64 = get_i64(&args, "id")?;
            let model: Option<String> =
                args.get("model").and_then(|v| v.as_str()).map(String::from);
            treq_lib::local_db::set_session_model(&repo_path, id, model)?;
            Ok(Value::Null)
        }

        // ── File view tracking ────────────────────────────────────────────
        "mark_file_viewed" => {
            let workspace_path = get_str(&args, "workspacePath")?;
            let file_path = get_str(&args, "filePath")?;
            let content_hash = get_str(&args, "contentHash")?;
            let state = state::get()?;
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.mark_file_viewed(&workspace_path, &file_path, &content_hash)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }

        "unmark_file_viewed" => {
            let workspace_path = get_str(&args, "workspacePath")?;
            let file_path = get_str(&args, "filePath")?;
            let state = state::get()?;
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.unmark_file_viewed(&workspace_path, &file_path)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }

        // ── Pending review ────────────────────────────────────────────────
        "load_pending_review" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: i64 = get_i64(&args, "workspaceId")?;
            let review = treq_lib::local_db::get_pending_review(&repo_path, workspace_id)?;
            serde_json::to_value(review).map_err(|e| e.to_string())
        }

        "save_pending_review" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: i64 = get_i64(&args, "workspaceId")?;
            let comments = get_str(&args, "comments")?;
            let viewed_files: Option<String> = args
                .get("viewedFiles")
                .and_then(|v| v.as_str())
                .map(String::from);
            let summary_text: Option<String> = args
                .get("summaryText")
                .and_then(|v| v.as_str())
                .map(String::from);
            let id = treq_lib::local_db::save_pending_review(
                &repo_path,
                workspace_id,
                &comments,
                viewed_files.as_deref(),
                summary_text.as_deref(),
            )?;
            Ok(Value::Number(id.into()))
        }

        "clear_pending_review" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: i64 = get_i64(&args, "workspaceId")?;
            treq_lib::local_db::clear_pending_review(&repo_path, workspace_id)?;
            Ok(Value::Null)
        }

        // ── Filesystem ────────────────────────────────────────────────────
        "read_file" => {
            let path = get_str(&args, "path")?;
            let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            Ok(Value::String(content))
        }

        "get_file_modified_at" => {
            let path = get_str(&args, "path")?;
            let modified_at = modified_at_rfc3339(&path);
            Ok(match modified_at {
                Some(value) => Value::String(value),
                None => Value::Null,
            })
        }

        "list_directory" => {
            let path = get_str(&args, "path")?;
            let entries = list_directory_impl(&path)?;
            serde_json::to_value(entries).map_err(|e| e.to_string())
        }

        "list_directory_cached" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let parent_path = get_str(&args, "parentPath")?;
            let entries = list_directory_cached_impl(&repo_path, workspace_id, &parent_path)?;
            serde_json::to_value(entries).map_err(|e| e.to_string())
        }

        "search_workspace_files" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let query = get_str(&args, "query")?;
            let limit: usize = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize)
                .unwrap_or(50);
            let files = treq_lib::local_db::search_workspace_files(
                &repo_path,
                workspace_id,
                &query,
                limit,
            )?;
            let result: Vec<serde_json::Value> = files
                .into_iter()
                .map(|f| {
                    serde_json::json!({
                        "file_path": f.file_path,
                        "relative_path": f.relative_path,
                    })
                })
                .collect();
            Ok(Value::Array(result))
        }

        // ── ensure_workspace_indexed ──────────────────────────────────────
        "ensure_workspace_indexed" => {
            let repo_path = get_str(&args, "repoPath")?;
            let workspace_id: Option<i64> = opt_i64(&args, "workspaceId");
            let workspace_path = get_str(&args, "workspacePath")?;
            treq_lib::file_indexer::index_workspace_files(
                &repo_path,
                workspace_id,
                &workspace_path,
            )?;
            Ok(Value::Bool(true))
        }

        // ── rebase_home_repo_branch ───────────────────────────────────────
        "rebase_home_repo_branch" => {
            let repo_path = get_str(&args, "repoPath")?;
            let current_branch = get_str(&args, "currentBranch")?;
            let target_branch = get_str(&args, "targetBranch")?;
            let result = treq_lib::jj::jj_rebase_home_repo_branch(
                &repo_path,
                &current_branch,
                &target_branch,
            )
            .map_err(|e| e.to_string())?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        // ── dry_run_home_repo_rebase ──────────────────────────────────────
        "dry_run_home_repo_rebase" => {
            let repo_path = get_str(&args, "repoPath")?;
            let current_branch = get_str(&args, "currentBranch")?;
            let target_branch = get_str(&args, "targetBranch")?;
            let result = treq_lib::jj::jj_dry_run_home_repo_rebase(
                &repo_path,
                &current_branch,
                &target_branch,
            )
            .map_err(|e| e.to_string())?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        // ── Remote SSH ───────────────────────────────────────────────────
        "list_ssh_hosts" => {
            let hosts = treq_lib::core::remote::list_configured_hosts()?;
            serde_json::to_value(hosts).map_err(|e| e.to_string())
        }

        "check_ssh_host" => {
            let host = get_str(&args, "host")?;
            let readiness = treq_lib::core::remote::check_readiness(&host)?;
            serde_json::to_value(readiness).map_err(|e| e.to_string())
        }

        "remote_probe_repo" => {
            let host = get_str(&args, "host")?;
            let path = get_str(&args, "path")?;
            let probe = treq_lib::core::remote::probe_repo(&host, &path)?;
            serde_json::to_value(probe).map_err(|e| e.to_string())
        }

        "remote_clone_repo" => {
            let host = get_str(&args, "host")?;
            let repo_url = get_str(&args, "repoUrl")?;
            let destination = get_str(&args, "destination")?;
            let repo = treq_lib::core::remote::clone_repo(&host, &repo_url, &destination)?;
            serde_json::to_value(repo).map_err(|e| e.to_string())
        }

        "remote_open_repo" => {
            let host = get_str(&args, "host")?;
            let path = get_str(&args, "path")?;
            let repo = treq_lib::core::remote::open_repo(&host, &path);
            serde_json::to_value(repo).map_err(|e| e.to_string())
        }

        // ── Tauri-runtime-only: silent no-ops ─────────────────────────────
        "pty_create_session"
        | "pty_session_exists"
        | "pty_write"
        | "pty_write_suppress_echo"
        | "pty_resize"
        | "pty_close"
        | "start_file_watcher"
        | "stop_file_watcher"
        | "set_window_repo_path"
        | "get_window_repo_path" => Ok(Value::Null),

        // ── Direct jj::* commands: not implemented — migrate to core::* ───
        "jj_restore_file"
        | "jj_restore_all"
        | "jj_split"
        | "jj_git_fetch_background"
        | "jj_get_commits_ahead"
        | "jj_check_branch_exists"
        | "set_workspace_target_branch"
        | "resolve_workspace_bookmark_conflict" => Err(format!(
            "not_implemented: '{}' — this command calls jj::* directly. \
             Migrate UI code to use a core::* equivalent instead.",
            command
        )),

        _ => Err(format!("unknown_command: '{}'", command)),
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn get_str(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| format!("Missing or invalid argument: {}", key))
}

fn get_i64(args: &Value, key: &str) -> Result<i64, String> {
    args.get(key)
        .and_then(|v| v.as_i64())
        .ok_or_else(|| format!("Missing or invalid argument: {}", key))
}

fn opt_i64(args: &Value, key: &str) -> Option<i64> {
    args.get(key).and_then(|v| v.as_i64())
}

fn opt_str_to_value(s: Option<String>) -> Value {
    match s {
        Some(v) => Value::String(v),
        None => Value::Null,
    }
}

fn get_conflict_style() -> Result<String, String> {
    // Try to read from state DB; fall back to "git"
    if let Ok(state) = state::get() {
        if let Ok(db) = state.db.lock() {
            if let Ok(Some(style)) = db.get_setting("conflict_marker_style") {
                let trimmed = style.trim();
                if !trimmed.is_empty() {
                    return Ok(trimmed.to_string());
                }
            }
        }
    }
    Ok("git".to_string())
}

fn parse_metadata(metadata: Option<&str>) -> (Option<String>, Option<String>, Option<Vec<String>>) {
    let Some(m) = metadata else {
        return (None, None, None);
    };
    let Ok(obj) = serde_json::from_str::<serde_json::Value>(m) else {
        return (None, None, None);
    };
    let title = obj.get("title").and_then(|v| v.as_str()).map(String::from);
    let description = obj
        .get("description")
        .and_then(|v| v.as_str())
        .map(String::from);
    let moved_files = obj
        .get("moved_files")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .filter(|v| !v.is_empty());
    (title, description, moved_files)
}

#[derive(serde::Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_directory: bool,
    modified_at: Option<String>,
}

fn list_directory_impl(path: &str) -> Result<Vec<DirEntry>, String> {
    let mut files = Vec::new();

    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ep = entry.path();
        if let Some(name) = ep.file_name().and_then(|n| n.to_str()) {
            files.push(DirEntry {
                name: name.to_string(),
                path: ep.to_string_lossy().to_string(),
                is_directory: ep.is_dir(),
                modified_at: modified_at_rfc3339(&ep.to_string_lossy()),
            });
        }
    }

    files.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(files)
}

#[derive(serde::Serialize)]
struct CachedDirEntry {
    name: String,
    path: String,
    is_directory: bool,
    relative_path: String,
    modified_at: Option<String>,
}

fn list_directory_cached_impl(
    repo_path: &str,
    workspace_id: Option<i64>,
    parent_path: &str,
) -> Result<Vec<CachedDirEntry>, String> {
    use std::path::Path;

    // Try cache first
    if let Ok(cached) =
        treq_lib::local_db::get_cached_directory_listing(repo_path, workspace_id, parent_path)
    {
        if !cached.is_empty() {
            return Ok(cached
                .into_iter()
                .map(|f| {
                    let name = Path::new(&f.file_path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(&f.relative_path)
                        .to_string();
                    let modified_at = modified_at_rfc3339(&f.file_path);
                    CachedDirEntry {
                        name,
                        path: f.file_path,
                        is_directory: f.is_directory,
                        relative_path: f.relative_path,
                        modified_at,
                    }
                })
                .collect());
        }
    }

    // Fall back to live filesystem
    let live = list_directory_impl(parent_path)?;
    let base = Path::new(parent_path);
    Ok(live
        .into_iter()
        .map(|e| {
            let relative = Path::new(&e.path)
                .strip_prefix(base)
                .ok()
                .and_then(|p| p.to_str())
                .unwrap_or(&e.name)
                .to_string();
            CachedDirEntry {
                name: e.name,
                path: e.path,
                is_directory: e.is_directory,
                relative_path: relative,
                modified_at: e.modified_at,
            }
        })
        .collect())
}

fn modified_at_rfc3339(path: &str) -> Option<String> {
    std::fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .map(|modified| chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339())
}
