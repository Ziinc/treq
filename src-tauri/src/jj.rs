use chrono::TimeZone;
use futures::StreamExt as _;
use futures::TryStreamExt as _;
use imara_diff::intern::InternedInput;
use imara_diff::sink::Counter;
use imara_diff::{diff, Algorithm, UnifiedDiffBuilder};
use jj_lib::config::{ConfigLayer, ConfigSource, StackedConfig};
use jj_lib::conflict_labels::ConflictLabels;
use jj_lib::conflicts::{materialized_diff_stream, MaterializedTreeValue};
use jj_lib::copies::CopyRecords;
use jj_lib::file_util;
use jj_lib::fileset::FilesetAliasesMap;
use jj_lib::git;
use jj_lib::gitignore::GitIgnoreFile;
use jj_lib::matchers::{NothingMatcher, PrefixMatcher};
use jj_lib::merge::Diff;
use jj_lib::merged_tree::MergedTree;
use jj_lib::object_id::{HexPrefix, ObjectId};
use jj_lib::op_store::{RefTarget, RemoteRef};
use jj_lib::ref_name::{RefName, RemoteName, RemoteRefSymbol, WorkspaceNameBuf};
use jj_lib::repo::{ReadonlyRepo, Repo as _, StoreFactories};
use jj_lib::repo_path::{RepoPath, RepoPathUiConverter};
use jj_lib::revset::{
    self, Revset, RevsetAliasesMap, RevsetDiagnostics, RevsetIteratorExt as _, RevsetParseContext,
    RevsetWorkspaceContext, SymbolResolver,
};
use jj_lib::rewrite::merge_commit_trees;
use jj_lib::settings::UserSettings;
use jj_lib::working_copy::{SnapshotOptions, WorkingCopyFreshness};
use jj_lib::workspace::{default_working_copy_factories, default_working_copy_factory, Workspace};
use jj_lib::workspace_store::{SimpleWorkspaceStore, WorkspaceStore as _};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

use crate::binary_paths;
use crate::local_db;

/// Helper function to create Command for a binary using cached path
fn command_for(binary: &str) -> Command {
    let path = binary_paths::get_binary_path(binary).unwrap_or_else(|| binary.to_string());
    Command::new(path)
}

/// Create a jj Command with conflict-marker-style config applied
fn jj_command(conflict_marker_style: &str) -> Command {
    let mut cmd = command_for("jj");
    let style = match conflict_marker_style {
        "snapshot" | "git" => conflict_marker_style,
        _ => "diff",
    };
    cmd.args([
        "--config",
        &format!("ui.conflict-marker-style=\"{}\"", style),
    ]);
    cmd
}

fn chain_ignore_file(base: &Arc<GitIgnoreFile>, prefix: &str, path: PathBuf) -> Arc<GitIgnoreFile> {
    base.chain_with_file(prefix, path)
        .unwrap_or_else(|_| base.clone())
}

fn repo_root_matcher() -> PrefixMatcher {
    PrefixMatcher::new([RepoPath::root()])
}

fn git_global_excludes_path(repo_path: &str) -> Option<PathBuf> {
    let output = command_for("git")
        .current_dir(repo_path)
        .args(["config", "--path", "--get", "core.excludesFile"])
        .output()
        .ok()?;
    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Some(PathBuf::from(path));
        }
    }

    let config_home = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")));
    config_home.map(|dir| dir.join("git").join("ignore"))
}

fn build_snapshot_base_ignores(ignore_root: &str) -> Arc<GitIgnoreFile> {
    let mut base_ignores = GitIgnoreFile::empty()
        .chain("", Path::new("<treq builtins>"), b".jj/\n.treq/\n.jj*/\n")
        .unwrap_or_else(|_| GitIgnoreFile::empty());

    if let Some(global_excludes) = git_global_excludes_path(ignore_root) {
        base_ignores = chain_ignore_file(&base_ignores, "", global_excludes);
    }
    base_ignores = chain_ignore_file(&base_ignores, "", Path::new(ignore_root).join(".gitignore"));
    chain_ignore_file(
        &base_ignores,
        "",
        Path::new(ignore_root)
            .join(".git")
            .join("info")
            .join("exclude"),
    )
}

struct LoadedWorkspaceRepo {
    settings: UserSettings,
    workspace: Workspace,
    repo: Arc<ReadonlyRepo>,
    path_converter: RepoPathUiConverter,
}

fn load_workspace_repo(workspace_path: &str) -> Result<LoadedWorkspaceRepo, JjError> {
    let repo_path_opt = derive_repo_path_from_workspace(workspace_path);
    let settings_path = repo_path_opt.as_deref().unwrap_or(workspace_path);
    let settings = create_user_settings(settings_path)?;
    let workspace_root = Path::new(workspace_path);
    let workspace = Workspace::load(
        &settings,
        workspace_root,
        &StoreFactories::default(),
        &default_working_copy_factories(),
    )
    .map_err(|e| JjError::IoError(format!("Failed to load workspace: {}", e)))?;
    let repo = futures::executor::block_on(workspace.repo_loader().load_at_head())
        .map_err(|e| JjError::IoError(format!("Failed to load repo: {}", e)))?;
    let path_converter = RepoPathUiConverter::Fs {
        cwd: workspace_root.to_path_buf(),
        base: workspace_root.to_path_buf(),
    };

    Ok(LoadedWorkspaceRepo {
        settings,
        workspace,
        repo,
        path_converter,
    })
}

fn import_git_head_if_needed(
    loaded: &mut LoadedWorkspaceRepo,
    repo_path: &str,
) -> Result<(), JjError> {
    let git_head_branch = read_git_head_branch(repo_path)
        .ok()
        .filter(|branch| !branch.is_empty() && branch != "HEAD");
    let mut import_tx = loaded.repo.start_transaction();
    let _ = futures::executor::block_on(git::import_head(import_tx.repo_mut()));

    let git_head_id = import_tx
        .repo()
        .view()
        .git_head()
        .added_ids()
        .next()
        .cloned();
    if let (Some(branch_name), Some(head_id)) = (git_head_branch.as_ref(), git_head_id) {
        let existing = import_tx
            .repo()
            .view()
            .get_local_bookmark(RefName::new(branch_name));
        if existing.is_absent() {
            import_tx
                .repo_mut()
                .set_local_bookmark_target(RefName::new(branch_name), RefTarget::normal(head_id));
        }
    }

    if import_tx.repo().has_changes() {
        loaded.repo = futures::executor::block_on(import_tx.commit("import git head"))
            .map_err(|e| JjError::GitWorkspaceError(format!("Failed to import git head: {}", e)))?;
    }

    Ok(())
}

fn evaluate_revset<'a>(
    loaded: &'a LoadedWorkspaceRepo,
    revset_str: &str,
) -> Result<Box<dyn Revset + 'a>, JjError> {
    let aliases_map = RevsetAliasesMap::new();
    let fileset_aliases_map = FilesetAliasesMap::new();
    let revset_extensions = jj_lib::revset::RevsetExtensions::default();
    let now = loaded
        .settings
        .commit_timestamp()
        .map(|timestamp| {
            chrono::Local
                .timestamp_millis_opt(timestamp.timestamp.0)
                .single()
                .unwrap_or_else(chrono::Local::now)
        })
        .unwrap_or_else(chrono::Local::now);
    let context = RevsetParseContext {
        aliases_map: &aliases_map,
        local_variables: std::collections::HashMap::new(),
        user_email: loaded.settings.user_email(),
        date_pattern_context: now.into(),
        default_ignored_remote: None,
        fileset_aliases_map: &fileset_aliases_map,
        use_glob_by_default: false,
        extensions: &revset_extensions,
        workspace: Some(RevsetWorkspaceContext {
            path_converter: &loaded.path_converter,
            workspace_name: loaded.workspace.workspace_name(),
        }),
    };
    let mut diagnostics = RevsetDiagnostics::new();
    let expression = revset::parse(&mut diagnostics, revset_str, &context)
        .map_err(|e| JjError::IoError(format!("Failed to parse revset '{}': {}", revset_str, e)))?;
    let extensions: Vec<Box<dyn jj_lib::revset::SymbolResolverExtension>> = Vec::new();
    let symbol_resolver = SymbolResolver::new(loaded.repo.as_ref(), &extensions);
    let resolved = expression
        .resolve_user_expression(loaded.repo.as_ref(), &symbol_resolver)
        .map_err(|e| {
            JjError::IoError(format!("Failed to resolve revset '{}': {}", revset_str, e))
        })?;
    resolved
        .evaluate(loaded.repo.as_ref())
        .map_err(|e| JjError::IoError(format!("Failed to evaluate revset '{}': {}", revset_str, e)))
}

fn snapshot_working_copy_tree(
    loaded: &mut LoadedWorkspaceRepo,
    workspace_path: &str,
) -> Result<Option<(jj_lib::backend::CommitId, MergedTree)>, JjError> {
    let workspace_name = loaded.workspace.workspace_name().to_owned();
    let Some(wc_commit_id) = loaded
        .repo
        .view()
        .get_wc_commit_id(&workspace_name)
        .cloned()
    else {
        return Ok(None);
    };

    let ignore_root = derive_repo_path_from_workspace(workspace_path)
        .unwrap_or_else(|| workspace_path.to_string());
    let matcher = repo_root_matcher();
    let opts = snapshot_options_for_all_paths(&ignore_root, &matcher);
    let mut locked_ws = loaded
        .workspace
        .start_working_copy_mutation()
        .map_err(|e| JjError::IoError(format!("Failed to lock working copy: {}", e)))?;
    let (tree, _stats) = futures::executor::block_on(locked_ws.locked_wc().snapshot(&opts))
        .map_err(|e| JjError::IoError(format!("Failed to snapshot working copy: {}", e)))?;
    futures::executor::block_on(locked_ws.finish(loaded.repo.op_id().clone()))
        .map_err(|e| JjError::IoError(format!("Failed to finish working copy snapshot: {}", e)))?;

    Ok(Some((wc_commit_id, tree)))
}

fn tree_key(tree: &MergedTree) -> String {
    tree.tree_ids()
        .iter()
        .map(|tree_id| tree_id.hex())
        .collect::<Vec<_>>()
        .join(",")
}

fn count_lines(content: &[u8]) -> u32 {
    if content.is_empty() {
        0
    } else {
        content.split_inclusive(|byte| *byte == b'\n').count() as u32
    }
}

fn bytes_to_text(bytes: Vec<u8>) -> Option<Vec<u8>> {
    if bytes.contains(&0) {
        return None;
    }
    String::from_utf8(bytes).ok().map(String::into_bytes)
}

async fn materialized_value_to_bytes(
    path: &RepoPath,
    value: MaterializedTreeValue,
) -> Option<Vec<u8>> {
    match value {
        MaterializedTreeValue::Absent => None,
        MaterializedTreeValue::File(mut file) => {
            file.read_all(path).await.ok().and_then(bytes_to_text)
        }
        MaterializedTreeValue::Symlink { target, .. } => Some(target.into_bytes()),
        MaterializedTreeValue::AccessDenied(_)
        | MaterializedTreeValue::FileConflict(_)
        | MaterializedTreeValue::OtherConflict { .. }
        | MaterializedTreeValue::GitSubmodule(_)
        | MaterializedTreeValue::Tree(_) => None,
    }
}

fn diff_line_counts(before: &str, after: &str) -> (u32, u32) {
    let input = InternedInput::new(before, after);
    let counts = diff(Algorithm::Histogram, &input, Counter::default());
    (counts.insertions, counts.removals)
}

fn build_text_hunks(before: &str, after: &str) -> Vec<JjDiffHunk> {
    let input = InternedInput::new(before, after);
    let patch = diff(
        Algorithm::Histogram,
        &input,
        UnifiedDiffBuilder::new(&input),
    );
    if patch.is_empty() {
        Vec::new()
    } else {
        parse_git_diff_hunks(&patch).unwrap_or_default()
    }
}

fn compute_commit_stats(
    repo: &Arc<ReadonlyRepo>,
    commit: &jj_lib::commit::Commit,
    tree_override: Option<&MergedTree>,
) -> (u32, u32) {
    futures::executor::block_on(async {
        let parent_tree = commit
            .parent_tree(repo.as_ref())
            .await
            .unwrap_or_else(|_| repo.store().root_commit().tree());
        let commit_tree = tree_override.cloned().unwrap_or_else(|| commit.tree());
        let conflict_labels = ConflictLabels::unlabeled();
        let copy_records = CopyRecords::default();
        let matcher = repo_root_matcher();
        let diff_stream = materialized_diff_stream(
            repo.store(),
            parent_tree.diff_stream_with_copies(&commit_tree, &matcher, &copy_records),
            Diff::new(&conflict_labels, &conflict_labels),
        );

        let mut insertions = 0;
        let mut deletions = 0;
        futures::pin_mut!(diff_stream);
        while let Some(entry) = diff_stream.next().await {
            let values = match entry.values {
                Ok(values) => values,
                Err(_) => continue,
            };
            let before = materialized_value_to_bytes(entry.path.source(), values.before).await;
            let after = materialized_value_to_bytes(entry.path.target(), values.after).await;

            match (before, after) {
                (None, Some(after)) => {
                    insertions += count_lines(&after);
                }
                (Some(before), None) => {
                    deletions += count_lines(&before);
                }
                (Some(before), Some(after)) => {
                    let before = match String::from_utf8(before) {
                        Ok(content) => content,
                        Err(_) => continue,
                    };
                    let after = match String::from_utf8(after) {
                        Ok(content) => content,
                        Err(_) => continue,
                    };
                    let (added, removed) = diff_line_counts(&before, &after);
                    insertions += added;
                    deletions += removed;
                }
                (None, None) => {}
            }
        }

        (insertions, deletions)
    })
}

fn is_empty_commit(repo: &Arc<ReadonlyRepo>, commit: &jj_lib::commit::Commit) -> bool {
    let parent_tree = futures::executor::block_on(commit.parent_tree(repo.as_ref()))
        .unwrap_or_else(|_| repo.store().root_commit().tree());
    parent_tree.tree_ids() == commit.tree().tree_ids()
}

fn commit_description_first_line(commit: &jj_lib::commit::Commit) -> String {
    commit
        .description()
        .lines()
        .next()
        .filter(|line| !line.is_empty())
        .unwrap_or("(no description)")
        .to_string()
}

fn build_log_commit(
    repo: &Arc<ReadonlyRepo>,
    commit: jj_lib::commit::Commit,
    wc_commit_ids: &HashSet<jj_lib::backend::CommitId>,
    is_immutable: &impl Fn(
        &jj_lib::backend::CommitId,
    ) -> Result<bool, jj_lib::revset::RevsetEvaluationError>,
) -> JjLogCommit {
    let short_id = commit.id().hex()[..12].to_string();
    let change_id = HexPrefix::from_id(commit.change_id()).reverse_hex()[..12].to_string();
    let description = commit_description_first_line(&commit);
    let author_name = commit.author().name.clone();
    let timestamp = commit
        .author()
        .timestamp
        .to_datetime()
        .map(|timestamp| timestamp.to_rfc3339())
        .unwrap_or_else(|_| commit.author().timestamp.timestamp.0.to_string());
    let parent_ids = commit
        .parent_ids()
        .iter()
        .map(|id| id.hex()[..12].to_string())
        .collect();
    let bookmarks = repo
        .view()
        .local_bookmarks_for_commit(commit.id())
        .filter_map(|(name, target)| {
            (target.as_normal() == Some(commit.id())).then(|| name.as_str().to_string())
        })
        .collect();
    JjLogCommit {
        commit_id: short_id.clone(),
        short_id,
        change_id,
        description,
        author_name,
        timestamp,
        parent_ids,
        is_working_copy: wc_commit_ids.contains(commit.id()),
        bookmarks,
        is_immutable: is_immutable(commit.id()).unwrap_or(false),
        insertions: 0,
        deletions: 0,
    }
}

fn build_log_commits(
    cache_repo_path: &str,
    repo: &Arc<ReadonlyRepo>,
    commits: Vec<jj_lib::commit::Commit>,
    wc_commit_ids: &HashSet<jj_lib::backend::CommitId>,
    wc_tree_override: Option<(&jj_lib::backend::CommitId, &MergedTree)>,
    is_immutable: &impl Fn(
        &jj_lib::backend::CommitId,
    ) -> Result<bool, jj_lib::revset::RevsetEvaluationError>,
) -> Vec<JjLogCommit> {
    commits
        .into_iter()
        .map(|commit| {
            let mut log_commit =
                build_log_commit(repo, commit.clone(), wc_commit_ids, is_immutable);
            let tree_override = wc_tree_override
                .filter(|(wc_commit_id, _)| **wc_commit_id == *commit.id())
                .map(|(_, tree)| tree);
            let effective_tree = tree_override.cloned().unwrap_or_else(|| commit.tree());
            let cache_key = tree_key(&effective_tree);
            let full_commit_id = commit.id().hex();
            let (insertions, deletions) = match local_db::get_cached_commit_diff_stat(
                cache_repo_path,
                &full_commit_id,
                &cache_key,
            ) {
                Ok(Some(cached)) => (cached.insertions, cached.deletions),
                _ => {
                    let (insertions, deletions) =
                        compute_commit_stats(repo, &commit, tree_override);
                    let _ = local_db::cache_commit_diff_stat(
                        cache_repo_path,
                        &full_commit_id,
                        &cache_key,
                        insertions,
                        deletions,
                    );
                    (insertions, deletions)
                }
            };
            log_commit.insertions = insertions;
            log_commit.deletions = deletions;
            log_commit
        })
        .collect()
}

fn snapshot_options_for_all_paths<'a>(
    ignore_root: &str,
    start_tracking_matcher: &'a dyn jj_lib::matchers::Matcher,
) -> SnapshotOptions<'a> {
    SnapshotOptions {
        base_ignores: build_snapshot_base_ignores(ignore_root),
        progress: None,
        start_tracking_matcher,
        force_tracking_matcher: &NothingMatcher,
        max_new_file_size: 1024 * 1024,
    }
}

/// Convert git remote branch format to jj bookmark format
/// Examples: "origin/main" -> "main@origin" (if origin is a remote)
///           "treq/test" -> "treq/test" (if treq is not a remote)
fn convert_git_branch_to_jj_format(branch: &str, repo_path: &str) -> String {
    if let Some(slash_pos) = branch.find('/') {
        let prefix = &branch[..slash_pos];
        let suffix = &branch[slash_pos + 1..];

        let remotes = get_git_remotes(repo_path);

        if remotes.contains(prefix) {
            // This is a remote reference, convert to jj format
            format!("{}@{}", suffix, prefix)
        } else {
            // This is a local bookmark with namespace pattern
            branch.to_string()
        }
    } else {
        branch.to_string()
    }
}

/// Public wrapper for use by auto_rebase and other modules
pub fn convert_git_branch_to_jj_format_public(branch: &str, repo_path: &str) -> String {
    convert_git_branch_to_jj_format(branch, repo_path)
}

/// Error type for jj operations
#[derive(Debug)]
pub enum JjError {
    AlreadyInitialized,
    NotGitRepository,
    InitFailed(String),
    ConfigError(String),
    WorkspaceNotFound(String),
    GitWorkspaceError(String),
    IoError(String),
    BookmarkConflict(BookmarkConflictInfo),
}

/// Information about a jj workspace
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceInfo {
    pub name: String,
    pub path: String,
    pub branch: String,
    pub is_colocated: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveredWorkspace {
    pub workspace_name: String,
    pub workspace_path: String,
    pub branch_name: String,
    pub has_conflicts: bool,
}

/// A diff hunk from jj diff output
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjDiffHunk {
    pub id: String,
    pub header: String,
    pub lines: Vec<String>,
    pub patch: String,
}

/// File change status in JJ working copy
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjFileChange {
    pub path: String,
    pub status: String,
    pub previous_path: Option<String>,
    pub changed_line_count: usize,
    pub diff_deferred: bool,
}

/// File content lines for context expansion
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjFileLines {
    pub lines: Vec<String>,
    pub start_line: usize,
    pub end_line: usize,
}

/// Result of a rebase operation
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjRebaseResult {
    pub success: bool,
    pub message: String,
}

/// A single commit in the log
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjLogCommit {
    pub commit_id: String,
    pub short_id: String,
    pub change_id: String,
    pub description: String,
    pub author_name: String,
    pub timestamp: String,
    pub parent_ids: Vec<String>,
    pub is_working_copy: bool,
    pub bookmarks: Vec<String>,
    pub is_immutable: bool,
    pub insertions: u32,
    pub deletions: u32,
}

/// The full log response including metadata
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjLogResult {
    pub commits: Vec<JjLogCommit>,
    pub target_branch: String,
    pub workspace_branch: String,
    #[serde(default)]
    pub target_branch_commits: Vec<JjLogCommit>,
}

/// Commits ahead of target branch
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjCommitsAhead {
    pub commits: Vec<JjLogCommit>,
    pub total_count: usize,
}

/// Detailed metadata about a conflicted bookmark revision
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookmarkConflictCommit {
    pub commit_id: String,
    pub short_commit_id: String,
    pub change_id: String,
    pub description: String,
    pub author_name: String,
    pub timestamp: String,
    pub diff_summary: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookmarkConflictInfo {
    pub bookmark: String,
    pub commits: Vec<BookmarkConflictCommit>,
}

/// Result of merge operation
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjMergeResult {
    pub success: bool,
    pub message: String,
    pub has_conflicts: bool,
    pub conflicted_files: Vec<String>,
    pub merge_commit_id: Option<String>,
}

/// Diff hunks for a single file
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjFileDiff {
    pub path: String,
    pub hunks: Vec<JjDiffHunk>,
}

/// Combined diff between two revisions
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjRevisionDiff {
    pub files: Vec<JjFileChange>,
    pub hunks_by_file: Vec<JjFileDiff>,
    pub too_large_to_render: bool,
    pub render_block_reason: Option<String>,
}

const LARGE_COMMIT_FILE_DIFF_THRESHOLD: usize = 500;
const TOO_LARGE_COMMIT_DIFF_THRESHOLD: usize = 10_000;
const TOO_LARGE_COMMIT_DIFF_MESSAGE: &str =
    "This commit changes more than 10,000 lines and is too large to render.";

impl std::fmt::Display for JjError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JjError::AlreadyInitialized => write!(f, "Jujutsu workspace already exists"),
            JjError::NotGitRepository => write!(f, "Not a git repository"),
            JjError::InitFailed(e) => write!(f, "Failed to initialize jj: {}", e),
            JjError::ConfigError(e) => write!(f, "Configuration error: {}", e),
            JjError::WorkspaceNotFound(name) => write!(f, "Workspace '{}' not found", name),
            JjError::GitWorkspaceError(e) => write!(f, "Git workspace error: {}", e),
            JjError::IoError(e) => write!(f, "IO error: {}", e),
            JjError::BookmarkConflict(info) => write!(
                f,
                "Conflicted bookmark '{}' with {} revision(s)",
                info.bookmark,
                info.commits.len()
            ),
        }
    }
}

/// Check if a jj workspace already exists at the given path
pub fn is_jj_workspace(repo_path: &str) -> bool {
    Path::new(repo_path).join(".jj").exists()
}

/// Get git user.name and user.email by shelling out to git config.
/// Used once during repo init to cache values into the local db.
fn read_git_user_config_from_git(repo_path: &str) -> (String, String) {
    let name = command_for("git")
        .current_dir(repo_path)
        .args(["config", "--get", "user.name"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "Treq User".to_string());

    let email = command_for("git")
        .current_dir(repo_path)
        .args(["config", "--get", "user.email"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "treq@localhost".to_string());

    (name, email)
}

/// Persist git user config to the local db so that subsequent calls don't
/// need to shell out to git. Safe to call multiple times (idempotent).
pub fn cache_git_user_config(
    db: &crate::db::Database,
    repo_path: &str,
) -> Result<(String, String), JjError> {
    let (name, email) = read_git_user_config_from_git(repo_path);
    db.set_repo_setting(repo_path, "git_user_name", &name)
        .map_err(|e| JjError::ConfigError(format!("Failed to cache user.name: {}", e)))?;
    db.set_repo_setting(repo_path, "git_user_email", &email)
        .map_err(|e| JjError::ConfigError(format!("Failed to cache user.email: {}", e)))?;
    Ok((name, email))
}

/// Read cached git user.name / user.email from the local db. Falls back to
/// reading from git (and caching) when the db has no entry yet.
fn get_git_user_config(repo_path: &str) -> (String, String) {
    let db_path = local_db::get_local_db_path(repo_path);
    if let Ok(db) = crate::db::Database::new(db_path) {
        let cached_name = db
            .get_repo_setting(repo_path, "git_user_name")
            .ok()
            .flatten();
        let cached_email = db
            .get_repo_setting(repo_path, "git_user_email")
            .ok()
            .flatten();
        if let (Some(n), Some(e)) = (cached_name, cached_email) {
            return (n, e);
        }
        if let Ok((n, e)) = cache_git_user_config(&db, repo_path) {
            return (n, e);
        }
    }
    read_git_user_config_from_git(repo_path)
}

/// Create UserSettings with reasonable defaults for Treq
/// Uses git config values if available, otherwise uses defaults
fn create_user_settings(repo_path: &str) -> Result<UserSettings, JjError> {
    // Get user info from git config
    let (user_name, user_email) = get_git_user_config(repo_path);

    // Get system hostname and username
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME")) // Windows fallback
        .unwrap_or_else(|_| "treq".to_string());
    let username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME")) // Windows fallback
        .unwrap_or_else(|_| "treq".to_string());

    // Build configuration with required fields
    let config_text = format!(
        r#"
[user]
name = "{}"
email = "{}"

[operation]
hostname = "{}"
username = "{}"
"#,
        user_name, user_email, hostname, username
    );

    // Create StackedConfig with defaults and our layer
    let mut config = StackedConfig::with_defaults();
    let layer = ConfigLayer::parse(ConfigSource::User, &config_text)
        .map_err(|e| JjError::ConfigError(e.to_string()))?;
    config.add_layer(layer);

    UserSettings::from_config(config).map_err(|e| JjError::ConfigError(e.to_string()))
}

/// Ensure .jj and .treq directories are in .gitignore
/// This is idempotent - entries won't be duplicated
pub fn ensure_gitignore_entries(repo_path: &str) -> Result<(), JjError> {
    let gitignore_path = Path::new(repo_path).join(".gitignore");
    let entries_to_add = [".jj/", ".jj*/", ".treq/"];

    // Read existing .gitignore content
    let existing_content = if gitignore_path.exists() {
        fs::read_to_string(&gitignore_path)
            .map_err(|e| JjError::InitFailed(format!("Failed to read .gitignore: {}", e)))?
    } else {
        String::new()
    };

    let existing_entries: std::collections::HashSet<&str> =
        existing_content.lines().map(|l| l.trim()).collect();

    // Find entries that need to be added
    let entries_needed: Vec<&str> = entries_to_add
        .iter()
        .filter(|entry| !existing_entries.contains(*entry))
        .copied()
        .collect();

    if entries_needed.is_empty() {
        return Ok(());
    }

    // Append missing entries to .gitignore
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&gitignore_path)
        .map_err(|e| JjError::InitFailed(format!("Failed to open .gitignore: {}", e)))?;

    // Add a newline before our entries if file doesn't end with newline
    if !existing_content.is_empty() && !existing_content.ends_with('\n') {
        writeln!(file)
            .map_err(|e| JjError::InitFailed(format!("Failed to write to .gitignore: {}", e)))?;
    }

    for entry in entries_needed {
        writeln!(file, "{}", entry)
            .map_err(|e| JjError::InitFailed(format!("Failed to write to .gitignore: {}", e)))?;
    }

    Ok(())
}

/// Initialize jj for an existing git repository (colocated mode)
/// This creates a .jj/ directory alongside the existing .git/ directory
fn init_jj_for_git_repo(repo_path: &str) -> Result<(), JjError> {
    let path = Path::new(repo_path);

    // Check if .jj already exists
    if is_jj_workspace(repo_path) {
        return Err(JjError::AlreadyInitialized);
    }

    // Check if .git exists
    if !path.join(".git").exists() {
        return Err(JjError::NotGitRepository);
    }

    let settings = create_user_settings(repo_path)?;

    // Use init_external_git to link jj to the existing .git repository.
    let git_repo_path = path.join(".git");

    futures::executor::block_on(Workspace::init_external_git(
        &settings,
        path,
        &git_repo_path,
    ))
    .map_err(|e| JjError::InitFailed(e.to_string()))?;
    // Ensure .gitignore entries
    ensure_gitignore_entries(repo_path)?;

    Ok(())
}

/// Ensure jj is initialized for a repository
/// This is idempotent - safe to call multiple times
/// Returns true on success, false only if initialization failed
pub fn ensure_jj_initialized(db: &crate::db::Database, repo_path: &str) -> Result<bool, JjError> {
    // Check database flag first (avoid filesystem check if already configured)
    let flag_key = "jj_initialized";
    let already_configured = db
        .get_repo_setting(repo_path, flag_key)
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);

    if already_configured {
        if is_jj_workspace(repo_path) {
            return Ok(true); // Flag valid, .jj exists
        }
        // Flag stale — .jj was deleted. Clear flag, fall through to reinit
        let _ = db.set_repo_setting(repo_path, flag_key, "false");
    } else if is_jj_workspace(repo_path) {
        // Double-check filesystem in case flag got out of sync
        let _ = db.set_repo_setting(repo_path, flag_key, "true");
        return Ok(true);
    }

    // Check if it's actually a git repo before trying to initialize
    if !Path::new(repo_path).join(".git").exists() {
        return Err(JjError::NotGitRepository);
    }

    // Cache git user config so subsequent commits don't shell out
    let _ = cache_git_user_config(db, repo_path);

    // Initialize jj
    init_jj_for_git_repo(repo_path)?;

    // Mark as configured in database
    db.set_repo_setting(repo_path, flag_key, "true")
        .map_err(|e| JjError::ConfigError(format!("Failed to save flag: {}", e)))?;

    Ok(true)
}

/// Sanitize workspace name for filesystem use
pub fn sanitize_workspace_name(name: &str) -> String {
    name.replace('/', "-")
        .replace('\\', "-")
        .replace(['*', '?', '<', '>', '|', '"', ':'], "_")
        .trim_matches('.')
        .trim()
        .to_string()
}

/// Create a colocated jj workspace
///
/// This creates:
/// 1. A git workspace at the specified path
/// 2. A jj workspace initialized on top of it
///
/// Returns the workspace path on success
pub fn create_workspace(
    repo_path: &str,
    workspace_name: &str,
    branch_name: &str,
    new_branch: bool,
    source_branch: Option<&str>,
) -> Result<String, JjError> {
    let repo_path_buf = Path::new(repo_path);

    if !is_jj_workspace(repo_path) {
        return Err(JjError::NotGitRepository);
    }

    let sanitized_name = sanitize_workspace_name(workspace_name);
    let workspace_dir = repo_path_buf
        .join(".treq")
        .join("workspaces")
        .join(&sanitized_name);

    // Ensure workspace directory exists (init_workspace_with_existing_repo requires it)
    if !workspace_dir.exists() {
        fs::create_dir_all(&workspace_dir).map_err(|e| {
            JjError::GitWorkspaceError(format!("Failed to create workspace dir: {}", e))
        })?;
    }

    let settings = create_user_settings(repo_path)?;

    // Load parent workspace and repo
    let parent_workspace = Workspace::load(
        &settings,
        repo_path_buf,
        &StoreFactories::default(),
        &default_working_copy_factories(),
    )
    .map_err(|e| JjError::GitWorkspaceError(format!("Failed to load parent workspace: {}", e)))?;

    let parent_repo = futures::executor::block_on(parent_workspace.repo_loader().load_at_head())
        .map_err(|e| JjError::GitWorkspaceError(format!("Failed to load repo: {}", e)))?;
    let git_head_branch = read_git_head_branch(repo_path)
        .ok()
        .filter(|branch| !branch.is_empty() && branch != "HEAD");

    // Import git HEAD and mirror fetch-style bookmark tracking to avoid untracked remote push failures.
    let parent_repo = {
        let mut import_tx = parent_repo.start_transaction();
        let _ = futures::executor::block_on(git::import_head(import_tx.repo_mut()));

        let git_head_id = import_tx
            .repo()
            .view()
            .git_head()
            .added_ids()
            .next()
            .cloned();
        if let (Some(branch_name), Some(head_id)) = (git_head_branch.as_ref(), git_head_id) {
            let existing = import_tx
                .repo()
                .view()
                .get_local_bookmark(RefName::new(branch_name));
            if existing.is_absent() {
                import_tx.repo_mut().set_local_bookmark_target(
                    RefName::new(branch_name),
                    RefTarget::normal(head_id),
                );
            }
        }

        // Collect (name, remote) pairs that have a local counterpart but are untracked.
        let to_track: Vec<(String, String)> = import_tx
            .repo()
            .view()
            .all_remote_bookmarks()
            .filter_map(|(sym, remote_ref)| {
                if remote_ref.is_tracked() {
                    return None;
                }
                let local = import_tx
                    .repo()
                    .view()
                    .get_local_bookmark(sym.name.as_ref());
                if local.is_absent() {
                    return None;
                }
                Some((
                    sym.name.as_str().to_string(),
                    sym.remote.as_str().to_string(),
                ))
            })
            .collect();
        for (name, remote) in to_track {
            let sym = RemoteRefSymbol {
                name: RefName::new(&name),
                remote: RemoteName::new(&remote),
            };
            let _ = import_tx.repo_mut().track_remote_bookmark(sym);
        }

        if import_tx.repo().has_changes() {
            futures::executor::block_on(import_tx.commit("import git head")).map_err(|e| {
                JjError::GitWorkspaceError(format!("Failed to import git head: {}", e))
            })?
        } else {
            parent_repo
        }
    };

    // Collect remote names from view (avoids subprocess for branch format conversion)
    let remote_names: HashSet<String> = parent_repo
        .view()
        .all_remote_bookmarks()
        .map(|(sym, _)| sym.remote.as_str().to_string())
        .collect();

    // Resolve the source commit to use as parent of the new wc commit
    let source_commit_id = if !new_branch {
        // Existing local bookmark: use the bookmark's current commit
        let target = parent_repo
            .view()
            .get_local_bookmark(RefName::new(branch_name));
        target.added_ids().next().cloned().ok_or_else(|| {
            JjError::GitWorkspaceError(format!("Bookmark '{}' not found", branch_name))
        })?
    } else if let Some(source) = source_branch {
        // Convert git-style prefix (origin/branch) to jj style (branch@origin)
        let jj_ref = if let Some(slash) = source.find('/') {
            let prefix = &source[..slash];
            let suffix = &source[slash + 1..];
            if remote_names.contains(prefix) {
                format!("{}@{}", suffix, prefix)
            } else {
                source.to_string()
            }
        } else {
            source.to_string()
        };

        if let Some((name, remote)) = jj_ref.split_once('@') {
            let sym = RemoteRefSymbol {
                name: RefName::new(name),
                remote: RemoteName::new(remote),
            };
            parent_repo
                .view()
                .get_remote_bookmark(sym)
                .target
                .added_ids()
                .next()
                .cloned()
                .ok_or_else(|| {
                    JjError::GitWorkspaceError(format!("Remote bookmark '{}' not found", jj_ref))
                })?
        } else {
            // Prefer a workspace WC commit with same parents (uncommitted changes atop bookmark state).
            let bookmark_id = parent_repo
                .view()
                .get_local_bookmark(RefName::new(&jj_ref))
                .added_ids()
                .next()
                .cloned()
                .ok_or_else(|| {
                    JjError::GitWorkspaceError(format!("Bookmark '{}' not found", jj_ref))
                })?;
            let bookmark_parents: Vec<_> = parent_repo
                .store()
                .get_commit(&bookmark_id)
                .map(|c| c.parent_ids().to_vec())
                .unwrap_or_default();
            let wc_override = parent_repo
                .view()
                .wc_commit_ids()
                .values()
                .find(|wc_id| {
                    if *wc_id == &bookmark_id {
                        return false;
                    }
                    parent_repo
                        .store()
                        .get_commit(wc_id)
                        .map(|wc| wc.parent_ids() == bookmark_parents.as_slice())
                        .unwrap_or(false)
                })
                .cloned();
            wc_override.unwrap_or(bookmark_id)
        }
    } else {
        // Default: use git HEAD (imported above) so git history is included
        parent_repo
            .view()
            .git_head()
            .added_ids()
            .next()
            .cloned()
            .ok_or_else(|| JjError::GitWorkspaceError("No git HEAD commit found".to_string()))?
    };

    let new_ws_name: WorkspaceNameBuf = sanitized_name.clone().into();

    // Initialize the new workspace (creates .jj, registers workspace, checks out root commit)
    let wc_factory = default_working_copy_factory();
    let (mut new_workspace, new_repo) =
        futures::executor::block_on(Workspace::init_workspace_with_existing_repo(
            &workspace_dir,
            parent_workspace.repo_path(),
            &parent_repo,
            &*wc_factory,
            new_ws_name.clone(),
        ))
        .map_err(|e| JjError::GitWorkspaceError(format!("Failed to init workspace: {}", e)))?;

    // Start a transaction on the new repo to move wc to the desired source commit
    let source_commit = new_repo
        .store()
        .get_commit(&source_commit_id)
        .map_err(|e| JjError::GitWorkspaceError(format!("Failed to get source commit: {}", e)))?;

    let mut tx = new_repo.start_transaction();

    let parent_tree =
        futures::executor::block_on(merge_commit_trees(tx.repo(), &[source_commit.clone()]))
            .map_err(|e| JjError::GitWorkspaceError(format!("Failed to merge trees: {}", e)))?;

    // Create new wc commit on top of source_commit (empty, inherits source tree)
    let new_wc = futures::executor::block_on(
        tx.repo_mut()
            .new_commit(vec![source_commit_id.clone()], parent_tree)
            .write(),
    )
    .map_err(|e| JjError::GitWorkspaceError(format!("Failed to create wc commit: {}", e)))?;

    // Point the new workspace's @ to the new wc commit
    futures::executor::block_on(tx.repo_mut().edit(new_ws_name.clone(), &new_wc))
        .map_err(|e| JjError::GitWorkspaceError(format!("Failed to set wc: {}", e)))?;

    // Set the local bookmark to the new wc commit
    tx.repo_mut().set_local_bookmark_target(
        RefName::new(branch_name),
        RefTarget::normal(new_wc.id().clone()),
    );

    // Track branch@origin if the remote bookmark exists and is not yet tracked
    {
        let sym = RemoteRefSymbol {
            name: RefName::new(branch_name),
            remote: RemoteName::new("origin"),
        };
        let remote_ref: RemoteRef = tx.repo().view().get_remote_bookmark(sym).clone();
        if !remote_ref.target.is_absent() && !remote_ref.is_tracked() {
            let sym = RemoteRefSymbol {
                name: RefName::new(branch_name),
                remote: RemoteName::new("origin"),
            };
            let _ = tx.repo_mut().track_remote_bookmark(sym);
        }
    }

    // Rebase any descendants of rewritten commits (required before tx.commit)
    futures::executor::block_on(tx.repo_mut().rebase_descendants())
        .map_err(|e| JjError::GitWorkspaceError(format!("Failed to rebase descendants: {}", e)))?;

    // Export to git refs (colocated repo)
    let _ = git::export_refs(tx.repo_mut());

    let final_repo = futures::executor::block_on(tx.commit("create_workspace"))
        .map_err(|e| JjError::GitWorkspaceError(format!("Failed to commit transaction: {}", e)))?;

    // Update the physical working copy to match the new wc commit
    futures::executor::block_on(new_workspace.check_out(final_repo.op_id().clone(), None, &new_wc))
        .map_err(|e| JjError::GitWorkspaceError(format!("Failed to checkout workspace: {}", e)))?;

    Ok(sanitized_name)
}

/// Result of a workspace recovery operation
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceRecoveryResult {
    pub workspace_name: String,
    pub branch_name: String,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone)]
struct RegisteredWorkspace {
    workspace_name: String,
    workspace_path: String,
    full_path: PathBuf,
    branch_name: String,
    has_conflicts: bool,
}

fn load_home_workspace(repo_path: &str) -> Result<Workspace, JjError> {
    let settings = create_user_settings(repo_path)?;
    Workspace::load(
        &settings,
        Path::new(repo_path),
        &StoreFactories::default(),
        &default_working_copy_factories(),
    )
    .map_err(|e| JjError::IoError(format!("Failed to load workspace: {}", e)))
}

fn load_home_repo(
    repo_path: &str,
) -> Result<(Workspace, Arc<ReadonlyRepo>, SimpleWorkspaceStore), JjError> {
    let workspace = load_home_workspace(repo_path)?;
    let repo = futures::executor::block_on(workspace.repo_loader().load_at_head())
        .map_err(|e| JjError::IoError(format!("Failed to load repo: {}", e)))?;
    let workspace_store = SimpleWorkspaceStore::load(workspace.repo_path())
        .map_err(|e| JjError::IoError(format!("Failed to load workspace store: {}", e)))?;
    Ok((workspace, repo, workspace_store))
}

fn list_registered_workspaces(repo_path: &str) -> Result<Vec<RegisteredWorkspace>, JjError> {
    let (_home_workspace, repo, workspace_store) = load_home_repo(repo_path)?;

    let mut workspaces = Vec::new();
    for (workspace_name, wc_commit_id) in repo.view().wc_commit_ids() {
        if workspace_name.as_str() == "default" {
            continue;
        }

        let stored_path = workspace_store
            .get_workspace_path(workspace_name)
            .map_err(|e| JjError::IoError(format!("Failed to read workspace path: {}", e)))?
            .ok_or_else(|| {
                JjError::IoError(format!(
                    "Workspace has no recorded path: {}",
                    workspace_name.as_str()
                ))
            })?;
        let stored_full_path = if stored_path.is_absolute() {
            stored_path
        } else {
            Path::new(repo_path)
                .join(".jj")
                .join("repo")
                .join(stored_path)
        };
        let workspace_path = stored_full_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| {
                JjError::IoError(format!(
                    "Failed to derive workspace directory name for '{}'",
                    workspace_name.as_str()
                ))
            })?
            .to_string();
        let full_path = Path::new(repo_path)
            .join(".treq")
            .join("workspaces")
            .join(&workspace_path);

        let wc_commit = repo
            .store()
            .get_commit(wc_commit_id)
            .map_err(|e| JjError::IoError(format!("Failed to load working-copy commit: {}", e)))?;
        let branch_name =
            branch_name_for_workspace_commit(repo.as_ref(), workspace_name.as_str(), &wc_commit);

        workspaces.push(RegisteredWorkspace {
            workspace_name: workspace_name.as_str().to_string(),
            workspace_path,
            full_path,
            branch_name,
            has_conflicts: !wc_commit.tree_ids().is_resolved(),
        });
    }

    workspaces.sort_by(|a, b| a.branch_name.cmp(&b.branch_name));
    Ok(workspaces)
}

/// List workspace names registered in JJ without shelling out.
pub fn list_jj_workspaces(repo_path: &str) -> Result<Vec<String>, JjError> {
    Ok(list_registered_workspaces(repo_path)?
        .into_iter()
        .map(|workspace| workspace.workspace_name)
        .collect())
}

fn branch_name_for_workspace_commit(
    repo: &dyn jj_lib::repo::Repo,
    workspace_name: &str,
    wc_commit: &jj_lib::commit::Commit,
) -> String {
    let exact_bookmarks: Vec<String> = repo
        .view()
        .local_bookmarks_for_commit(wc_commit.id())
        .filter_map(|(name, target)| {
            (target.as_normal() == Some(wc_commit.id())).then(|| name.as_str().to_string())
        })
        .collect();
    if let Some(name) = exact_bookmarks
        .iter()
        .find(|name| name.as_str() == workspace_name)
        .or_else(|| exact_bookmarks.first())
    {
        return name.clone();
    }

    let parent_bookmarks: Vec<String> = wc_commit
        .parent_ids()
        .iter()
        .flat_map(|parent_id| {
            repo.view()
                .local_bookmarks_for_commit(parent_id)
                .filter_map(move |(name, target)| {
                    (target.as_normal() == Some(parent_id)).then(|| name.as_str().to_string())
                })
        })
        .collect();
    if let Some(name) = parent_bookmarks
        .iter()
        .find(|name| name.as_str() == workspace_name)
        .or_else(|| parent_bookmarks.first())
    {
        return name.clone();
    }

    workspace_name.to_string()
}

pub fn discover_workspaces_with_conflicts(
    repo_path: &str,
) -> Result<Vec<DiscoveredWorkspace>, JjError> {
    Ok(list_registered_workspaces(repo_path)?
        .into_iter()
        .map(|workspace| DiscoveredWorkspace {
            workspace_name: workspace.workspace_name,
            workspace_path: workspace.workspace_path,
            branch_name: workspace.branch_name,
            has_conflicts: workspace.has_conflicts,
        })
        .collect())
}

fn ensure_workspace_jj_state(
    registered: &RegisteredWorkspace,
    repo_internal_path: &Path,
    repo: &Arc<ReadonlyRepo>,
    settings: &UserSettings,
) -> Result<(), JjError> {
    fs::create_dir_all(&registered.full_path)
        .map_err(|e| JjError::IoError(format!("Failed to create workspace dir: {}", e)))?;

    let jj_dir = registered.full_path.join(".jj");
    fs::create_dir(&jj_dir)
        .map_err(|e| JjError::IoError(format!("Failed to create workspace .jj dir: {}", e)))?;

    let jj_dir_abs = fs::canonicalize(&jj_dir)
        .map_err(|e| JjError::IoError(format!("Failed to canonicalize .jj dir: {}", e)))?;
    let path_to_store = file_util::relative_path(&jj_dir_abs, repo_internal_path);
    let path_to_store = if path_to_store.is_relative() {
        file_util::slash_path(&path_to_store).into_owned()
    } else {
        path_to_store
    };
    let repo_file_path = jj_dir.join("repo");
    let repo_bytes = file_util::path_to_bytes(&path_to_store)
        .map_err(|e| JjError::IoError(format!("Failed to encode repo path: {}", e)))?;
    fs::write(&repo_file_path, repo_bytes)
        .map_err(|e| JjError::IoError(format!("Failed to write workspace repo file: {}", e)))?;

    let working_copy_state_path = jj_dir.join("working_copy");
    fs::create_dir(&working_copy_state_path).map_err(|e| {
        JjError::IoError(format!(
            "Failed to create workspace working_copy dir: {}",
            e
        ))
    })?;

    let wc_factory = default_working_copy_factory();
    let working_copy = wc_factory
        .init_working_copy(
            repo.store().clone(),
            registered.full_path.clone(),
            working_copy_state_path.clone(),
            repo.op_id().clone(),
            WorkspaceNameBuf::from(registered.workspace_name.clone()),
            settings,
        )
        .map_err(|e| JjError::IoError(format!("Failed to init working copy: {}", e)))?;

    let working_copy_type_path = working_copy_state_path.join("type");
    fs::write(&working_copy_type_path, working_copy.name())
        .map_err(|e| JjError::IoError(format!("Failed to write working copy type file: {}", e)))?;

    let workspace_store = SimpleWorkspaceStore::load(repo_internal_path)
        .map_err(|e| JjError::IoError(format!("Failed to load workspace store: {}", e)))?;
    workspace_store
        .add(
            &WorkspaceNameBuf::from(registered.workspace_name.clone()),
            &registered.full_path,
        )
        .map_err(|e| JjError::IoError(format!("Failed to record workspace path: {}", e)))?;

    let mut workspace = Workspace::new(
        &registered.full_path,
        repo_internal_path.to_path_buf(),
        working_copy,
        repo.loader().clone(),
    )
    .map_err(|e| JjError::IoError(format!("Failed to build workspace object: {}", e)))?;

    let wc_commit_id = repo
        .view()
        .get_wc_commit_id(&WorkspaceNameBuf::from(registered.workspace_name.clone()))
        .cloned()
        .ok_or_else(|| {
            JjError::IoError(format!(
                "Workspace '{}' has no working-copy commit",
                registered.workspace_name
            ))
        })?;
    let wc_commit = repo
        .store()
        .get_commit(&wc_commit_id)
        .map_err(|e| JjError::IoError(format!("Failed to load workspace commit: {}", e)))?;

    futures::executor::block_on(workspace.check_out(repo.op_id().clone(), None, &wc_commit))
        .map_err(|e| JjError::IoError(format!("Failed to restore workspace checkout: {}", e)))?;

    Ok(())
}

fn forget_workspace_registration(
    repo_internal_path: &Path,
    repo: &Arc<ReadonlyRepo>,
    workspace_name: &str,
) -> Result<(), JjError> {
    let workspace_name_buf = WorkspaceNameBuf::from(workspace_name.to_string());
    if repo.view().get_wc_commit_id(&workspace_name_buf).is_none() {
        return Ok(());
    }

    let workspace_store = SimpleWorkspaceStore::load(repo_internal_path)
        .map_err(|e| JjError::IoError(format!("Failed to load workspace store: {}", e)))?;
    let mut tx = repo.start_transaction();
    futures::executor::block_on(tx.repo_mut().remove_wc_commit(&workspace_name_buf))
        .map_err(|e| JjError::IoError(format!("Failed to forget workspace commit: {}", e)))?;
    workspace_store
        .forget(&[workspace_name_buf.as_ref()])
        .map_err(|e| JjError::IoError(format!("Failed to forget workspace path: {}", e)))?;
    futures::executor::block_on(tx.commit(format!("forget workspace '{}'", workspace_name)))
        .map_err(|e| JjError::IoError(format!("Failed to commit workspace forget: {}", e)))?;
    Ok(())
}

pub fn reconcile_workspaces_with_jj(
    repo_path: &str,
) -> Result<Vec<WorkspaceRecoveryResult>, JjError> {
    let (home_workspace, repo, _) = load_home_repo(repo_path)?;
    let repo_internal_path = home_workspace.repo_path().to_path_buf();
    let settings = create_user_settings(repo_path)?;
    let registered_workspaces = list_registered_workspaces(repo_path)?;
    let db_workspaces = local_db::get_workspaces(repo_path)
        .map_err(|e| JjError::IoError(format!("Failed to get workspaces from DB: {}", e)))?;

    let mut results = Vec::new();

    for workspace in &registered_workspaces {
        if workspace.full_path.exists() {
            continue;
        }

        ensure_workspace_jj_state(workspace, &repo_internal_path, &repo, &settings)?;
        results.push(WorkspaceRecoveryResult {
            workspace_name: workspace.workspace_name.clone(),
            branch_name: workspace.branch_name.clone(),
            success: true,
            message: "Workspace recreated from JJ state".to_string(),
        });
    }

    let refreshed_at = chrono::Utc::now().to_rfc3339();
    let discovered: Vec<DiscoveredWorkspace> = registered_workspaces
        .iter()
        .map(|workspace| DiscoveredWorkspace {
            workspace_name: workspace.workspace_name.clone(),
            workspace_path: workspace.workspace_path.clone(),
            branch_name: workspace.branch_name.clone(),
            has_conflicts: workspace.has_conflicts,
        })
        .collect();
    let _ = local_db::sync_discovered_workspaces(repo_path, &discovered, &refreshed_at)
        .map_err(|e| JjError::IoError(format!("Failed to sync discovered workspaces: {}", e)))?;

    let live_pairs: HashSet<(String, String)> = discovered
        .iter()
        .map(|workspace| {
            (
                workspace.workspace_name.clone(),
                workspace.workspace_path.clone(),
            )
        })
        .collect();

    for workspace in db_workspaces {
        if live_pairs.contains(&(
            workspace.workspace_name.clone(),
            workspace.workspace_path.clone(),
        )) {
            continue;
        }

        if repo
            .view()
            .get_wc_commit_id(&WorkspaceNameBuf::from(workspace.workspace_name.clone()))
            .is_some()
        {
            forget_workspace_registration(&repo_internal_path, &repo, &workspace.workspace_name)?;
        }

        local_db::delete_workspace(repo_path, workspace.id).map_err(|e| {
            JjError::IoError(format!("Failed to delete stale workspace row: {}", e))
        })?;
        results.push(WorkspaceRecoveryResult {
            workspace_name: workspace.workspace_name,
            branch_name: workspace.branch_name,
            success: true,
            message: "Removed stale database workspace".to_string(),
        });
    }

    Ok(results)
}

/// Recover or reconcile workspace metadata against JJ state.
pub fn recover_all_orphaned_workspaces(
    repo_path: &str,
) -> Result<Vec<WorkspaceRecoveryResult>, JjError> {
    reconcile_workspaces_with_jj(repo_path)
}

/// List all workspaces in a repository
/// Returns workspaces found in .treq/workspaces/ directory
pub fn list_workspaces(repo_path: &str) -> Result<Vec<WorkspaceInfo>, JjError> {
    let workspaces_dir = Path::new(repo_path).join(".treq").join("workspaces");

    if !workspaces_dir.exists() {
        return Ok(Vec::new());
    }

    let mut workspaces = Vec::new();

    let entries = fs::read_dir(&workspaces_dir).map_err(|e| JjError::IoError(e.to_string()))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let entry_path = entry.path();

        // Must be a directory
        if !entry_path.is_dir() {
            continue;
        }

        // Must have a .git file/dir (valid git workspace)
        let git_path = entry_path.join(".git");
        if !git_path.exists() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();

        let path = entry_path.to_string_lossy().to_string();

        // Check if it's colocated (has .jj directory)
        let is_colocated = entry_path.join(".jj").exists();

        // Get branch name from git
        let branch = get_workspace_branch(&path).unwrap_or_default();

        workspaces.push(WorkspaceInfo {
            name,
            path,
            branch,
            is_colocated,
        });
    }

    // Sort by name
    workspaces.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(workspaces)
}

/// Get the current branch of a workspace
pub fn get_workspace_branch(workspace_path: &str) -> Result<String, JjError> {
    if let Some(repo_path) = derive_repo_path_from_workspace(workspace_path) {
        let ws_name = Path::new(workspace_path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| JjError::IoError("Invalid workspace path".to_string()))?;

        if let Ok(Some(workspace)) = local_db::get_workspace_by_path(&repo_path, ws_name) {
            return Ok(workspace.branch_name);
        }
    }

    let output = command_for("git")
        .current_dir(workspace_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(JjError::GitWorkspaceError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ))
    }
}

/// Remove a workspace (jj workspace + files)
pub fn remove_workspace(repo_path: &str, workspace_path: &str) -> Result<(), JjError> {
    let workspace_dir = Path::new(workspace_path);

    // Extract workspace name from path (last component)
    let workspace_name = workspace_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    // Always forget the jj workspace first so jj stops tracking even if directory is gone.
    if !workspace_name.is_empty() {
        let output = command_for("jj")
            .current_dir(repo_path)
            .args(&["workspace", "forget", workspace_name])
            .output()
            .map_err(|e| {
                JjError::IoError(format!("Failed to execute jj workspace forget: {}", e))
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Only return error if it's not a "workspace not found" error
            if !stderr.contains("No such workspace") {
                return Err(JjError::IoError(format!(
                    "Failed to forget workspace: {}",
                    stderr
                )));
            }
            // If workspace not found in jj, that's fine - continue with directory cleanup
        }
    }

    // Remove directory if it exists
    if workspace_dir.exists() {
        fs::remove_dir_all(workspace_dir).map_err(|e| JjError::IoError(e.to_string()))?;
    }

    Ok(())
}

/// Get workspace info for a specific workspace path
pub fn get_workspace_info(workspace_path: &str) -> Result<WorkspaceInfo, JjError> {
    let workspace_dir = Path::new(workspace_path);

    if !workspace_dir.exists() {
        return Err(JjError::WorkspaceNotFound(workspace_path.to_string()));
    }

    let name = workspace_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let is_colocated = workspace_dir.join(".jj").exists();
    let branch = get_workspace_branch(workspace_path).unwrap_or_default();

    Ok(WorkspaceInfo {
        name,
        path: workspace_path.to_string(),
        branch,
        is_colocated,
    })
}

/// Move changes from one workspace to another using jj squash
/// This moves changes from the current workspace (@) to the target workspace's working copy
/// Uses: jj squash --from @ --into <target-workspace-name>@
pub fn squash_to_workspace(
    source_workspace_path: &str,
    target_workspace_name: &str,
    file_paths: Option<Vec<String>>,
) -> Result<String, JjError> {
    // Construct the target revision reference: workspace-name@
    let target_ref = format!("{}@", target_workspace_name);

    // Build the jj squash command
    let mut cmd = command_for("jj");
    cmd.current_dir(source_workspace_path);
    cmd.args(["squash", "--from", "@", "--into", &target_ref]);

    // If specific file paths are provided, add them
    if let Some(paths) = file_paths {
        if !paths.is_empty() {
            for path in paths {
                cmd.arg(path);
            }
        }
    }

    let output = cmd.output().map_err(|e| JjError::IoError(e.to_string()))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(JjError::InitFailed(format!(
            "Failed to squash changes: {}",
            String::from_utf8_lossy(&output.stderr)
        )))
    }
}

/// Copy files from one workspace to another using filesystem copy.
/// jj auto-tracks new files, so no explicit add is needed.
pub fn copy_files_between_workspaces(
    source_workspace_path: &str,
    target_workspace_path: &str,
    file_paths: Vec<String>,
) -> Result<(), JjError> {
    for file_path in &file_paths {
        let src = Path::new(source_workspace_path).join(file_path);
        let dst = Path::new(target_workspace_path).join(file_path);

        if !src.exists() {
            return Err(JjError::IoError(format!(
                "Source file does not exist: {}",
                src.display()
            )));
        }

        // Create parent directories if needed
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                JjError::IoError(format!(
                    "Failed to create directory {}: {}",
                    parent.display(),
                    e
                ))
            })?;
        }

        fs::copy(&src, &dst).map_err(|e| {
            JjError::IoError(format!(
                "Failed to copy {} to {}: {}",
                src.display(),
                dst.display(),
                e
            ))
        })?;
    }
    Ok(())
}

/// Squash a specific commit's changes into a target workspace.
/// Runs: jj squash --from <change_id> --into <target_workspace_name>@
pub fn squash_commit_to_workspace(
    workspace_path: &str,
    change_id: &str,
    target_workspace_name: &str,
) -> Result<String, JjError> {
    let target_ref = format!("{}@", target_workspace_name);

    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["squash", "--from", change_id, "--into", &target_ref])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(JjError::InitFailed(format!(
            "Failed to squash commit to workspace: {}",
            String::from_utf8_lossy(&output.stderr)
        )))
    }
}

/// Abandon a specific commit by change-id.
/// Runs: jj abandon <change_id>
pub fn jj_abandon(workspace_path: &str, change_id: &str) -> Result<String, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["abandon", change_id])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(JjError::InitFailed(format!(
            "Failed to abandon commit: {}",
            String::from_utf8_lossy(&output.stderr)
        )))
    }
}

/// Get the list of files changed in a specific commit.
/// Runs: jj diff --summary -r <change_id>
/// Returns file paths (added/modified/removed) from the commit.
pub fn jj_diff_summary(workspace_path: &str, change_id: &str) -> Result<Vec<String>, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["diff", "--summary", "-r", change_id])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::InitFailed(format!(
            "Failed to get diff summary: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let files: Vec<String> = stdout
        .lines()
        .filter_map(|line| {
            // Parse jj diff --summary entries like M/A/D paths and R rename records.
            let line = line.trim();
            if line.len() > 2 {
                let raw_path = &line[2..];
                let (path, _) = parse_rename_path(raw_path);
                Some(path)
            } else {
                None
            }
        })
        .collect();

    Ok(files)
}

/// Update a stale workspace working copy
/// Runs: jj workspace update-stale in the workspace directory
pub fn update_stale_workspace(workspace_path: &str) -> Result<(), JjError> {
    let path = Path::new(workspace_path);
    if !path.join(".jj").exists() {
        return Ok(());
    }

    let repo_path_opt = derive_repo_path_from_workspace(workspace_path);
    let settings_path = repo_path_opt.as_deref().unwrap_or(workspace_path);
    let settings = create_user_settings(settings_path)?;

    let mut workspace = Workspace::load(
        &settings,
        path,
        &StoreFactories::default(),
        &default_working_copy_factories(),
    )
    .map_err(|e| JjError::InitFailed(format!("Failed to load workspace: {}", e)))?;

    let repo = futures::executor::block_on(workspace.repo_loader().load_at_head())
        .map_err(|e| JjError::InitFailed(format!("Failed to load repo: {}", e)))?;

    let workspace_name = workspace.workspace_name().to_owned();

    let wc_commit_id = match repo.view().get_wc_commit_id(&workspace_name) {
        Some(id) => id.clone(),
        None => return Ok(()),
    };
    let wc_commit = repo
        .store()
        .get_commit(&wc_commit_id)
        .map_err(|e| JjError::InitFailed(format!("Failed to get wc commit: {}", e)))?;

    let mut locked_ws = workspace
        .start_working_copy_mutation()
        .map_err(|e| JjError::InitFailed(format!("Failed to lock working copy: {}", e)))?;

    let freshness = futures::executor::block_on(WorkingCopyFreshness::check_stale(
        locked_ws.locked_wc(),
        &wc_commit,
        &repo,
    ))
    .map_err(|e| JjError::InitFailed(format!("Failed to check staleness: {}", e)))?;

    match freshness {
        WorkingCopyFreshness::Fresh => {
            futures::executor::block_on(locked_ws.finish(repo.op_id().clone()))
                .map_err(|e| JjError::InitFailed(format!("Failed to finish wc: {}", e)))?;
        }
        _ => {
            futures::executor::block_on(locked_ws.locked_wc().check_out(&wc_commit))
                .map_err(|e| JjError::InitFailed(format!("Failed to check out: {}", e)))?;
            futures::executor::block_on(locked_ws.finish(repo.op_id().clone()))
                .map_err(|e| JjError::InitFailed(format!("Failed to finish wc: {}", e)))?;
        }
    }

    Ok(())
}

/// Edit the working copy of a workspace branch
/// Tries to edit <branch>+ (child of bookmark), falls back to <branch> + new if no child exists
/// This ensures we're editing the working copy, not the bookmark commit itself
///
/// Note: This function is kept for potential future use. After the fix for stale working copies,
/// we no longer edit working copies from outside their workspace directories.
pub fn jj_edit_workspace_working_copy(
    workspace_path: &str,
    branch_name: &str,
) -> Result<(), JjError> {
    // 1. Try: jj edit <branch>+
    let branch_plus = format!("{}+", branch_name);
    let result = command_for("jj")
        .current_dir(workspace_path)
        .args(["edit", &branch_plus])
        .output();

    if let Ok(output) = result {
        if output.status.success() {
            // Successfully edited the child of the bookmark
            return Ok(());
        }
    }

    // 2. If bookmark already points to @, no new working copy is needed.
    let bookmark_commit = jj_get_commit_id(workspace_path, branch_name);
    let working_copy_commit = jj_get_commit_id(workspace_path, "@");

    if let (Ok(bookmark_id), Ok(wc_id)) = (bookmark_commit, working_copy_commit) {
        if bookmark_id == wc_id {
            // Bookmark points to working copy, we're already in the right place
            return Ok(());
        }
    }

    // 3. Fallback to `jj edit <branch>` then `jj new` when no child exists.
    let edit_result = command_for("jj")
        .current_dir(workspace_path)
        .args(["edit", branch_name])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !edit_result.status.success() {
        return Err(JjError::IoError(format!(
            "Failed to edit branch '{}': {}",
            branch_name,
            String::from_utf8_lossy(&edit_result.stderr)
        )));
    }

    // Create a new working copy on top of the bookmark
    let new_result = command_for("jj")
        .current_dir(workspace_path)
        .args(["new"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !new_result.status.success() {
        return Err(JjError::IoError(format!(
            "Failed to create new working copy: {}",
            String::from_utf8_lossy(&new_result.stderr)
        )));
    }

    Ok(())
}

// ============================================================================
// Stale Working Copy Detection and Recovery
// ============================================================================

/// Check if a workspace has a stale working copy
/// Returns true if the workspace is stale
pub fn is_workspace_stale(workspace_path: &str) -> Result<bool, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["status", "--no-pager"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stderr = String::from_utf8_lossy(&output.stderr);

    // Check for stale working copy error messages
    Ok(stderr.contains("stale") || stderr.contains("not updated since operation"))
}

/// Update a stale working copy using jj workspace update-stale
pub fn jj_workspace_update_stale(workspace_path: &str) -> Result<String, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["workspace", "update-stale"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}{}", stdout, stderr);

    if !output.status.success() {
        return Err(JjError::IoError(combined));
    }

    Ok(combined)
}

// ============================================================================
// Diff Operations using hybrid CLI approach
// Uses jj CLI for file listing (faster) and git CLI for diffs (reliable)
// ============================================================================

/// Get list of changed files in working copy using jj-lib (no subprocess)
/// Snapshots the working copy and diffs against the parent commit tree.
pub fn jj_get_changed_files(workspace_path: &str) -> Result<Vec<JjFileChange>, JjError> {
    use futures::StreamExt as _;

    let path = Path::new(workspace_path);
    if !path.exists() {
        return Ok(Vec::new());
    }
    if !path.is_dir() {
        return Err(JjError::IoError(format!(
            "Workspace path is not a directory: {}",
            workspace_path
        )));
    }
    if !path.join(".jj").exists() {
        return Ok(Vec::new());
    }

    let repo_path_opt = derive_repo_path_from_workspace(workspace_path);
    let settings_path = repo_path_opt.as_deref().unwrap_or(workspace_path);
    let settings = match create_user_settings(settings_path) {
        Ok(s) => s,
        Err(_) => return Ok(Vec::new()),
    };
    let mut workspace = match Workspace::load(
        &settings,
        path,
        &StoreFactories::default(),
        &default_working_copy_factories(),
    ) {
        Ok(ws) => ws,
        Err(_) => return Ok(Vec::new()),
    };
    let repo = match futures::executor::block_on(workspace.repo_loader().load_at_head()) {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()),
    };

    let ignore_root = repo_path_opt.as_deref().unwrap_or(workspace_path);
    let matcher = repo_root_matcher();
    let opts = snapshot_options_for_all_paths(ignore_root, &matcher);

    let workspace_name = workspace.workspace_name().to_owned();

    // Load current WC commit before locking (needed for tree comparison and diffing)
    let wc_commit_id = match repo.view().get_wc_commit_id(&workspace_name) {
        Some(id) => id.clone(),
        None => return Ok(Vec::new()),
    };
    let wc_commit = match repo.store().get_commit(&wc_commit_id) {
        Ok(c) => c,
        Err(_) => return Ok(Vec::new()),
    };

    let mut locked_ws = match workspace.start_working_copy_mutation() {
        Ok(lws) => lws,
        Err(_) => return Ok(Vec::new()),
    };
    let new_tree = match futures::executor::block_on(locked_ws.locked_wc().snapshot(&opts)) {
        Ok((tree, _)) => tree,
        Err(_) => return Ok(Vec::new()), // locked_ws dropped here, lock released
    };

    // If tree changed, create a new WC commit and update op-store to expose the snapshotted state.
    if new_tree.tree_ids() != wc_commit.tree_ids() {
        let mut tx = repo.start_transaction();
        let mut builder = tx.repo_mut().rewrite_commit(&wc_commit).detach();
        builder.set_tree(new_tree.clone());
        match futures::executor::block_on(builder.write(tx.repo_mut())) {
            Ok(rewritten_wc) => {
                let _ = futures::executor::block_on(
                    tx.repo_mut().edit(workspace_name.clone(), &rewritten_wc),
                );
                let _ = futures::executor::block_on(tx.repo_mut().rebase_descendants());
                match futures::executor::block_on(tx.commit("snapshot working copy")) {
                    Ok(final_repo) => {
                        let _ = futures::executor::block_on(
                            locked_ws.finish(final_repo.op_id().clone()),
                        );
                    }
                    Err(_) => {
                        let _ = futures::executor::block_on(locked_ws.finish(repo.op_id().clone()));
                    }
                }
            }
            Err(_) => {
                let _ = futures::executor::block_on(locked_ws.finish(repo.op_id().clone()));
            }
        }
    } else {
        let _ = futures::executor::block_on(locked_ws.finish(repo.op_id().clone()));
    }

    // Get the wc commit's parent tree to diff against
    let parent_tree = if wc_commit.parent_ids().is_empty() {
        repo.store().root_commit().tree()
    } else {
        match repo.store().get_commit(&wc_commit.parent_ids()[0]) {
            Ok(parent) => parent.tree(),
            Err(_) => return Ok(Vec::new()),
        }
    };

    let diff_matcher = repo_root_matcher();
    let diff_entries = futures::executor::block_on(
        parent_tree
            .diff_stream(&new_tree, &diff_matcher)
            .collect::<Vec<_>>(),
    );

    let mut changes = Vec::new();
    for entry in diff_entries {
        let file_path = entry.path.as_internal_file_string().to_string();
        let values = match entry.values {
            Ok(v) => v,
            Err(_) => continue,
        };
        let status = if values.before.is_absent() {
            "A"
        } else if values.after.is_absent() {
            "D"
        } else {
            "M"
        };
        changes.push(JjFileChange {
            path: file_path,
            status: status.to_string(),
            previous_path: None,
            changed_line_count: 0,
            diff_deferred: false,
        });
    }

    Ok(changes)
}

/// Checks if the working copy is empty (no uncommitted changes)
pub fn jj_is_working_copy_empty(workspace_path: &str) -> Result<bool, JjError> {
    let changed_files = jj_get_changed_files(workspace_path)?;
    Ok(changed_files.is_empty())
}

/// Checks if working copy needs syncing with bookmark
pub fn jj_working_copy_needs_sync(
    workspace_path: &str,
    branch_name: &str,
) -> Result<bool, JjError> {
    let bookmark_commit = jj_get_commit_id(workspace_path, branch_name)?;
    let working_copy_commit = jj_get_commit_id(workspace_path, "@")?;
    Ok(bookmark_commit != working_copy_commit)
}

/// Safely syncs working copy to bookmark (only if empty)
///
/// Returns:
/// - Ok(true) if sync was performed
/// - Ok(false) if sync was skipped (working copy not empty or already synced)
/// - Err if sync failed
pub fn jj_sync_working_copy_if_safe(
    workspace_path: &str,
    branch_name: &str,
) -> Result<bool, JjError> {
    // Check if sync is needed
    if !jj_working_copy_needs_sync(workspace_path, branch_name)? {
        return Ok(false); // Already synced
    }

    // Check if working copy is empty
    if !jj_is_working_copy_empty(workspace_path)? {
        return Ok(false); // Skip: working copy has uncommitted changes
    }

    // Safe to sync only when WC is empty and run from workspace directory.
    let result = command_for("jj")
        .current_dir(workspace_path)
        .args(["edit", branch_name])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !result.status.success() {
        return Err(JjError::IoError(format!(
            "Failed to sync working copy: {}",
            String::from_utf8_lossy(&result.stderr)
        )));
    }

    // Create a new empty working copy instead of editing a potentially immutable bookmark commit.
    let result = command_for("jj")
        .current_dir(workspace_path)
        .args(["new"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !result.status.success() {
        return Err(JjError::IoError(format!(
            "Failed to create new working copy: {}",
            String::from_utf8_lossy(&result.stderr)
        )));
    }

    Ok(true) // Sync performed successfully
}

/// Parse jj rename path format: "{old => new}" → (new_path, Some(old_path))
/// For non-rename paths, returns (path, None)
fn parse_rename_path(path: &str) -> (String, Option<String>) {
    if let Some(open) = path.find('{') {
        if let Some(close) = path.find('}') {
            if let Some((old_part, new_part)) = path[open + 1..close].split_once(" => ") {
                let prefix = &path[..open];
                let suffix = &path[close + 1..];
                let new_path = format!("{}{}{}", prefix, new_part.trim(), suffix);
                let old_path = format!("{}{}{}", prefix, old_part.trim(), suffix);
                return (new_path, Some(old_path));
            }
        }
    }
    (path.to_string(), None)
}

/// Parse jj status output into file changes
fn parse_jj_status(status: &str) -> Result<Vec<JjFileChange>, JjError> {
    let mut changes = Vec::new();

    for line in status.lines() {
        let line = line.trim();

        // Skip empty lines and section headers
        if line.is_empty() || line.starts_with("Working copy") || line.starts_with("Parent commit")
        {
            continue;
        }

        // Parse lines like "M file.txt" or "A new.txt" or "D removed.txt"
        if let Some((status_char, rest)) = line.split_once(' ') {
            let status = match status_char {
                "M" => "M", // Modified
                "A" => "A", // Added
                "D" => "D", // Deleted
                "R" => "R", // Renamed
                _ => continue,
            };

            let raw_path = rest.trim();
            let (path, previous_path) = parse_rename_path(raw_path);
            changes.push(JjFileChange {
                path,
                status: status.to_string(),
                previous_path,
                changed_line_count: 0,
                diff_deferred: false,
            });
        }
    }

    Ok(changes)
}

/// Get diff hunks for a specific file
/// Uses jj diff CLI with git-format output
pub fn jj_get_file_hunks(
    workspace_path: &str,
    file_path: &str,
    conflict_marker_style: &str,
) -> Result<Vec<JjDiffHunk>, JjError> {
    // Use jj diff --git to get hunks in git-compatible format
    let output = jj_command(conflict_marker_style)
        .current_dir(workspace_path)
        .args(["diff", "--git", "--no-pager", "--", file_path])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let diff_output = String::from_utf8_lossy(&output.stdout);
    parse_git_diff_hunks(&diff_output)
}

/// Parse git diff output into hunks
fn parse_git_diff_hunks(diff: &str) -> Result<Vec<JjDiffHunk>, JjError> {
    let mut hunks = Vec::new();
    let mut current_hunk: Option<(String, Vec<String>)> = None;
    let mut hunk_index = 0;

    for line in diff.lines() {
        if line.starts_with("@@") {
            // Save previous hunk if exists
            if let Some((header, lines)) = current_hunk.take() {
                hunks.push(JjDiffHunk {
                    id: format!("hunk-{}", hunk_index),
                    header: header.clone(),
                    lines: lines.clone(),
                    patch: format!("{}\n{}", header, lines.join("\n")),
                });
                hunk_index += 1;
            }

            // Start new hunk
            current_hunk = Some((line.to_string(), Vec::new()));
        } else if let Some((_, ref mut lines)) = current_hunk {
            // Skip diff metadata lines (be specific to avoid filtering conflict markers)
            if !line.starts_with("diff --git")
                && !line.starts_with("index ")
                && !line.starts_with("--- ")
                && !line.starts_with("+++ ")
            {
                lines.push(line.to_string());
            }
        }
    }

    // Save last hunk
    if let Some((header, lines)) = current_hunk {
        hunks.push(JjDiffHunk {
            id: format!("hunk-{}", hunk_index),
            header: header.clone(),
            lines: lines.clone(),
            patch: format!("{}\n{}", header, lines.join("\n")),
        });
    }

    Ok(hunks)
}

/// Get file content at specific lines for context expansion
pub fn jj_get_file_lines(
    workspace_path: &str,
    file_path: &str,
    from_parent: bool,
    start_line: usize,
    end_line: usize,
) -> Result<JjFileLines, JjError> {
    let content = if from_parent {
        // Get file from parent commit using git show
        let output = command_for("git")
            .current_dir(workspace_path)
            .args(["show", &format!("HEAD:{}", file_path)])
            .output()
            .map_err(|e| JjError::IoError(e.to_string()))?;

        if !output.status.success() {
            return Err(JjError::IoError(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        String::from_utf8_lossy(&output.stdout).to_string()
    } else {
        // Read file from working directory
        let full_path = Path::new(workspace_path).join(file_path);
        fs::read_to_string(&full_path)
            .map_err(|e| JjError::IoError(format!("Failed to read file: {}", e)))?
    };

    let all_lines: Vec<&str> = content.lines().collect();
    let start_idx = start_line.saturating_sub(1).min(all_lines.len());
    let end_idx = end_line.min(all_lines.len());

    let lines: Vec<String> = all_lines[start_idx..end_idx]
        .iter()
        .map(|s| s.to_string())
        .collect();

    Ok(JjFileLines {
        lines,
        start_line: start_idx + 1,
        end_line: end_idx,
    })
}

// ============================================================================
// Mutation Operations (CLI fallbacks)
// ============================================================================

/// Restore a file to parent state (discard changes)
/// Uses CLI as jj-lib mutation APIs are complex
pub fn jj_restore_file(workspace_path: &str, file_path: &str) -> Result<String, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["restore", file_path])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Restore all changes
pub fn jj_restore_all(workspace_path: &str) -> Result<String, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["restore"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Set (or create) a jj bookmark to point at a specific revision
/// Uses: jj bookmark set <name> -r <revision>
pub fn jj_set_bookmark(
    workspace_path: &str,
    bookmark_name: &str,
    revision: &str,
) -> Result<(), JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args([
            "bookmark",
            "set",
            bookmark_name,
            "-r",
            revision,
            "--allow-backwards",
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(())
}

/// Delete a jj bookmark
/// Uses: jj bookmark delete <name>
pub fn jj_delete_bookmark(workspace_path: &str, bookmark_name: &str) -> Result<(), JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["bookmark", "delete", bookmark_name])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(())
}

/// Track a remote bookmark
/// Uses: jj bookmark track <name>@<remote>
pub fn jj_bookmark_track(
    workspace_path: &str,
    bookmark_name: &str,
    remote_name: &str,
) -> Result<(), JjError> {
    let tracking_ref = format!("{}@{}", bookmark_name, remote_name);
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["bookmark", "track", &tracking_ref])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(())
}

/// Check if a bookmark is tracked with a remote
/// Uses: jj bookmark list --all-remotes
/// Returns true if the bookmark has a tracking relationship with the specified remote
pub fn is_bookmark_tracked(
    workspace_path: &str,
    bookmark_name: &str,
    remote_name: &str,
) -> Result<bool, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["bookmark", "list", "--all-remotes"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(JjError::IoError(format!(
            "Failed to list bookmarks: {}",
            stderr
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Handle both single-line and multi-line tracked bookmark output formats.

    let all_in_one_pattern = format!("{}@{}:", bookmark_name, remote_name);
    let lines: Vec<&str> = stdout.lines().collect();

    for i in 0..lines.len() {
        let line = lines[i];

        // Check for all-in-one format
        if line.contains(&all_in_one_pattern) {
            return Ok(true);
        }

        // Also handle multi-line format by matching lines that start with bookmark_name.
        if line.starts_with(&format!("{}:", bookmark_name)) {
            // Check if next line (if exists) is an indented remote reference
            if i + 1 < lines.len() {
                let next_line = lines[i + 1];
                // Next line should be indented and start with @remote_name
                if next_line.starts_with("  @") && next_line.contains(remote_name) {
                    return Ok(true);
                }
            }
        }
    }

    Ok(false)
}

/// Edit/switch to a bookmark (similar to git checkout)
/// Uses a multi-strategy approach to handle immutable commits
/// For colocated repos, also syncs git HEAD
pub fn jj_edit_bookmark(repo_path: &str, bookmark_name: &str) -> Result<String, JjError> {
    // Strategy 1: Try jj edit <bookmark>+ (edit a child commit if one exists)
    let branch_plus = format!("{}+", bookmark_name);
    let result = command_for("jj")
        .current_dir(repo_path)
        .args(["edit", &branch_plus])
        .output();
    if let Ok(output) = result {
        if output.status.success() {
            let _ = command_for("git")
                .current_dir(repo_path)
                .args(["checkout", bookmark_name])
                .output();
            return Ok(format!("Switched to {}", bookmark_name));
        }
    }

    // Strategy 2: Check if already at the bookmark commit
    let bookmark_commit = jj_get_commit_id(repo_path, bookmark_name);
    let working_copy_commit = jj_get_commit_id(repo_path, "@");
    if let (Ok(b_id), Ok(wc_id)) = (bookmark_commit, working_copy_commit) {
        if b_id == wc_id {
            return Ok(format!("Already at {}", bookmark_name));
        }
    }

    // Strategy 3: `jj new <bookmark>` works for mutable and immutable commits.
    let output = command_for("jj")
        .current_dir(repo_path)
        .args(["new", bookmark_name])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    // For colocated repos, best-effort sync git HEAD
    let _ = command_for("git")
        .current_dir(repo_path)
        .args(["checkout", bookmark_name])
        .output();

    Ok(format!("Switched to {}", bookmark_name))
}

/// Derive repo_path from workspace_path
/// Workspace paths are: {repo_path}/.treq/workspaces/{workspace_name}
pub fn derive_repo_path_from_workspace(workspace_path: &str) -> Option<String> {
    let path = Path::new(workspace_path);

    // Look for .treq/workspaces pattern in the path
    let mut current = path;
    while let Some(parent) = current.parent() {
        if current.file_name() == Some(std::ffi::OsStr::new("workspaces")) {
            if let Some(grandparent) = parent.parent() {
                if parent.file_name() == Some(std::ffi::OsStr::new(".treq")) {
                    // Found the pattern - grandparent is repo_path
                    return Some(grandparent.to_string_lossy().to_string());
                }
            }
        }
        current = parent;
    }

    None
}

/// Commit with message and create new working copy using jj-lib (no subprocess)
pub fn jj_commit(workspace_path: &str, message: &str) -> Result<String, JjError> {
    let repo_path_opt = derive_repo_path_from_workspace(workspace_path);

    // Resolve branch: workspace DB for sub-workspaces, .git/HEAD file for main repo
    let branch = if let Some(ref rp) = repo_path_opt {
        let ws_name = Path::new(workspace_path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| JjError::IoError("Invalid workspace path".to_string()))?;
        let ws = local_db::get_workspace_by_path(rp, ws_name)
            .map_err(|e| JjError::IoError(format!("Failed to query workspace: {}", e)))?
            .ok_or_else(|| JjError::WorkspaceNotFound(workspace_path.to_string()))?;
        ws.branch_name
    } else {
        resolve_home_repo_branch(workspace_path)?
    };

    let settings_path = repo_path_opt.as_deref().unwrap_or(workspace_path);
    let settings = create_user_settings(settings_path)?;
    let mut workspace = Workspace::load(
        &settings,
        Path::new(workspace_path),
        &StoreFactories::default(),
        &default_working_copy_factories(),
    )
    .map_err(|e| JjError::IoError(format!("Failed to load workspace: {}", e)))?;

    let repo = futures::executor::block_on(workspace.repo_loader().load_at_head())
        .map_err(|e| JjError::IoError(format!("Failed to load repo: {}", e)))?;

    // Snapshot working copy and load main-repo ignore rules to avoid expensive noise.
    let ignore_repo_root = repo_path_opt.as_deref().unwrap_or(workspace_path);
    let matcher = repo_root_matcher();
    let opts = snapshot_options_for_all_paths(ignore_repo_root, &matcher);
    let workspace_name: WorkspaceNameBuf = workspace.workspace_name().to_owned();
    let mut locked_ws = workspace
        .start_working_copy_mutation()
        .map_err(|e| JjError::IoError(format!("Failed to lock working copy: {}", e)))?;
    let (new_tree, _stats) = futures::executor::block_on(locked_ws.locked_wc().snapshot(&opts))
        .map_err(|e| JjError::IoError(format!("Snapshot failed: {}", e)))?;

    // Start transaction
    let mut tx = repo.start_transaction();

    let wc_commit_id = tx
        .repo()
        .view()
        .get_wc_commit_id(&workspace_name)
        .cloned()
        .ok_or_else(|| JjError::IoError("No working-copy commit found".to_string()))?;
    let wc_commit = tx
        .repo()
        .store()
        .get_commit(&wc_commit_id)
        .map_err(|e| JjError::IoError(format!("Failed to load wc commit: {}", e)))?;
    let workspace_names = tx.repo().view().workspaces_for_wc_commit_id(wc_commit.id());
    let bookmark_names = tx
        .repo()
        .view()
        .local_bookmarks_for_commit(wc_commit.id())
        .filter_map(|(name, target)| {
            (target.as_normal() == Some(wc_commit.id())).then(|| name.to_owned())
        })
        .collect::<Vec<_>>();

    // Rewrite @ with new tree + description, using detached builder to avoid borrow conflict
    let mut builder = tx.repo_mut().rewrite_commit(&wc_commit).detach();
    builder.set_tree(new_tree);
    builder.set_description(message);
    let committed = futures::executor::block_on(builder.write(tx.repo_mut()))
        .map_err(|e| JjError::IoError(format!("Failed to write commit: {}", e)))?;

    let ref_name = RefName::new(&branch);
    tx.repo_mut()
        .set_local_bookmark_target(ref_name, RefTarget::normal(committed.id().clone()));

    if !workspace_names.is_empty() {
        let new_wc = futures::executor::block_on(
            tx.repo_mut()
                .new_commit(vec![committed.id().clone()], committed.tree())
                .write(),
        )
        .map_err(|e| JjError::IoError(format!("Failed to create wc commit: {}", e)))?;

        for bookmark_name in bookmark_names {
            tx.repo_mut().set_local_bookmark_target(
                &bookmark_name,
                RefTarget::normal(committed.id().clone()),
            );
        }

        for name in workspace_names {
            futures::executor::block_on(tx.repo_mut().edit(name, &new_wc))
                .map_err(|e| JjError::IoError(format!("Failed to update wc pointer: {}", e)))?;
        }
    }

    // Rebase any descendants of the rewritten commit (required by jj-lib before commit)
    futures::executor::block_on(tx.repo_mut().rebase_descendants())
        .map_err(|e| JjError::IoError(format!("Failed to rebase descendants: {}", e)))?;

    // Keep colocated git refs aligned with jj refs to avoid stale/conflicted bookmark revsets.
    let _ = git::export_refs(tx.repo_mut());

    // Commit the transaction and finalize working copy
    let new_repo = futures::executor::block_on(tx.commit("commit_workspace"))
        .map_err(|e| JjError::IoError(format!("Failed to commit transaction: {}", e)))?;
    futures::executor::block_on(locked_ws.finish(new_repo.op_id().clone()))
        .map_err(|e| JjError::IoError(format!("Failed to finish wc mutation: {}", e)))?;

    Ok(format!("Committed successfully to branch '{}'", branch))
}

/// Read the current git branch from .git/HEAD without shelling out
fn read_git_head_branch(repo_path: &str) -> Result<String, String> {
    let head_path = Path::new(repo_path).join(".git").join("HEAD");
    let content =
        fs::read_to_string(&head_path).map_err(|e| format!("Failed to read .git/HEAD: {}", e))?;
    let trimmed = content.trim();
    if let Some(branch) = trimmed.strip_prefix("ref: refs/heads/") {
        Ok(branch.to_string())
    } else {
        Ok("HEAD".to_string())
    }
}

pub fn resolve_home_repo_branch(repo_path: &str) -> Result<String, JjError> {
    let git_branch = read_git_head_branch(repo_path)
        .map_err(|e| JjError::IoError(format!("Failed to determine branch: {}", e)))?;
    return Ok(git_branch);
}

/// Split selected files from working copy into a new parent commit
/// Uses: jj split -r @ -m <message> <file_paths...>
pub fn jj_split(
    workspace_path: &str,
    message: &str,
    file_paths: Vec<String>,
) -> Result<String, JjError> {
    let repo_path = derive_repo_path_from_workspace(workspace_path);

    // Get branch name - different logic for workspaces vs main repo
    let branch = if let Some(ref rp) = repo_path {
        // For workspaces: get branch_name from the workspace record in db
        let workspace = local_db::get_workspace_by_path(rp, workspace_path)
            .map_err(|e| JjError::IoError(format!("Failed to query workspace: {}", e)))?
            .ok_or_else(|| JjError::WorkspaceNotFound(workspace_path.to_string()))?;
        workspace.branch_name
    } else {
        let git_branch = get_workspace_branch(workspace_path).map_err(|e| {
            JjError::IoError(format!("Failed to determine current git branch: {}", e))
        })?;

        if git_branch.is_empty() || git_branch == "HEAD" {
            return Err(JjError::IoError(
                "Git is not checked out to a branch. Please checkout a branch before committing."
                    .to_string(),
            ));
        }
        git_branch
    };

    // Build and execute the jj split command
    let mut cmd = command_for("jj");
    cmd.current_dir(workspace_path);
    cmd.args(["split", "-r", "@", "-m", message]);
    for path in &file_paths {
        cmd.arg(path);
    }

    let output = cmd.output().map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    // Set the bookmark to point at @- (critical - same as jj_commit)
    jj_set_bookmark(workspace_path, &branch, "@-")
        .map_err(|e| JjError::IoError(format!("Failed to advance bookmark '{}': {}", branch, e)))?;

    // Only checkout branch in git for main repo
    if repo_path.is_none() {
        let checkout = command_for("git")
            .current_dir(workspace_path)
            .args(["checkout", &branch])
            .output();
        if let Err(e) = checkout {
            eprintln!("Warning: Failed to checkout git branch '{}': {}", branch, e);
        }
    }

    Ok(format!("Committed successfully to branch '{}'", branch))
}

/// Rebase the current workspace onto a target branch
/// Uses: jj rebase -d <target_branch>
pub fn jj_rebase_onto(
    workspace_path: &str,
    target_branch: &str,
    conflict_marker_style: &str,
) -> Result<JjRebaseResult, JjError> {
    let output = jj_command(conflict_marker_style)
        .current_dir(workspace_path)
        .args(["rebase", "-d", target_branch])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined_message = format!("{}{}", stdout, stderr);

    Ok(JjRebaseResult {
        success: output.status.success(),
        message: combined_message,
    })
}

/// Get list of conflicted files in the workspace
///
/// If target_branch is provided, uses: jj diff --from <target_branch> --to @ --summary
/// This checks for conflicts in changes between target branch and working copy (@)
///
/// If target_branch is None, falls back to: jj status --no-pager
/// This checks for conflicts in the current working copy only
pub fn get_conflicted_files(
    workspace_path: &str,
    target_branch: Option<&str>,
) -> Result<Vec<String>, JjError> {
    // Validate workspace path
    if workspace_path.is_empty() {
        return Err(JjError::IoError("Workspace path is empty".to_string()));
    }

    let path = std::path::Path::new(workspace_path);
    if !path.exists() {
        return Err(JjError::IoError(format!(
            "Workspace path does not exist: {}",
            workspace_path
        )));
    }

    if !path.is_dir() {
        return Err(JjError::IoError(format!(
            "Workspace path is not a directory: {}",
            workspace_path
        )));
    }

    // 1. Proactively check and update if stale
    if let Ok(true) = is_workspace_stale(workspace_path) {
        if let Err(update_err) = jj_workspace_update_stale(workspace_path) {
            eprintln!(
                "Failed to update stale workspace in get_conflicted_files for {}: {}",
                workspace_path, update_err
            );
        }
    }

    // 2. Try jj diff approach with retry on stale errors
    if let Some(branch) = target_branch {
        // Validate branch name to prevent injection
        if !branch.starts_with('-') && !branch.contains('\0') && !branch.is_empty() {
            // Convert git branch format to jj format using derived repo path for remote detection.
            let repo_path = derive_repo_path_from_workspace(workspace_path)
                .unwrap_or_else(|| workspace_path.to_string());
            let jj_branch = convert_git_branch_to_jj_format(branch, &repo_path);

            // Try jj diff approach with retry
            match get_conflicted_files_from_diff_with_retry(workspace_path, &jj_branch) {
                Ok(conflicts) => {
                    // If diff succeeded but returned empty, still check status as fallback
                    if !conflicts.is_empty() {
                        return Ok(conflicts);
                    }
                    // Fall through to status-based approach
                }
                Err(_e) => {
                    // Fall through to status-based approach
                }
            }
        }
    }

    // 3. Fallback to jj status with retry on stale errors
    get_conflicted_files_from_status_with_retry(workspace_path)
}

/// Get conflicted files using jj diff approach with retry on stale errors
/// Wraps get_conflicted_files_from_diff() with stale error detection and retry
fn get_conflicted_files_from_diff_with_retry(
    workspace_path: &str,
    jj_branch: &str,
) -> Result<Vec<String>, JjError> {
    match get_conflicted_files_from_diff(workspace_path, jj_branch) {
        Ok(conflicts) => Ok(conflicts),
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("stale") || err_str.contains("not updated since operation") {
                if let Err(update_err) = jj_workspace_update_stale(workspace_path) {
                    eprintln!(
                        "Failed to update stale workspace in diff retry: {}",
                        update_err
                    );
                    return Err(e);
                }
                // Retry once
                get_conflicted_files_from_diff(workspace_path, jj_branch)
            } else {
                Err(e)
            }
        }
    }
}

/// Get conflicted files using jj status approach with retry on stale errors
/// Extracts the status-based conflict detection logic and adds stale error detection and retry
fn get_conflicted_files_from_status_with_retry(
    workspace_path: &str,
) -> Result<Vec<String>, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["status"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let err_str = stderr.to_string();

        if err_str.contains("stale") || err_str.contains("not updated since operation") {
            if let Err(update_err) = jj_workspace_update_stale(workspace_path) {
                eprintln!(
                    "Failed to update stale workspace in status retry: {}",
                    update_err
                );
                return Ok(Vec::new());
            }
            // Retry once
            let retry_output = command_for("jj")
                .current_dir(workspace_path)
                .args(["status"])
                .output()
                .map_err(|e| JjError::IoError(e.to_string()))?;

            if !retry_output.status.success() {
                return Ok(Vec::new());
            }

            let status = String::from_utf8_lossy(&retry_output.stdout);
            return parse_conflicted_files_from_status(&status);
        }

        return Ok(Vec::new());
    }

    let status = String::from_utf8_lossy(&output.stdout);
    let conflicts = parse_conflicted_files_from_status(&status)?;

    Ok(conflicts)
}

/// Get conflicted files using jj diff approach
/// Uses: jj diff --from <target_branch> --to @ --summary
pub fn get_conflicted_files_from_diff(
    workspace_path: &str,
    jj_branch: &str,
) -> Result<Vec<String>, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["diff", "--from", jj_branch, "--to", "@", "--summary"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let summary = String::from_utf8_lossy(&output.stdout);
    let files = parse_diff_summary(&summary)?;
    let conflicts = extract_conflicted_files_from_summary(files);

    Ok(conflicts)
}

/// Parse jj st output to extract conflicted files
///
/// jj st output format with conflicts:
/// ```
/// Working copy changes:
/// M src/file.ts
/// Working copy  (@) : wsxupqkr 5a3c905b (conflict) (no description set)
/// Parent commit (@-): tqkoqust 9d3dff68 (empty) (no description set)
/// Warning: There are unresolved conflicts at these paths:
/// src/file1.rs    2-sided conflict including 1 deletion
/// src/file2.ts    2-sided conflict
/// ```
fn parse_conflicted_files_from_status(status: &str) -> Result<Vec<String>, JjError> {
    // Step 1: Check if "Working copy" line contains "(conflict)" marker
    let has_conflict_marker = status
        .lines()
        .any(|line| line.trim().starts_with("Working copy") && line.contains("(conflict)"));

    if !has_conflict_marker {
        return Ok(Vec::new());
    }

    // Step 2: Parse "Warning:" section to extract file paths
    let mut conflicts = Vec::new();
    let mut in_warning_section = false;

    for line in status.lines() {
        let trimmed = line.trim();

        // Detect start of warning section
        if trimmed.starts_with("Warning: There are unresolved conflicts at these paths:") {
            in_warning_section = true;
            continue;
        }

        // Parse conflict lines in warning section
        if in_warning_section {
            if trimmed.is_empty() {
                break; // End of warning section
            }

            // Format: "<file_path>    <conflict_description>"
            if let Some(file_path) = trimmed.split_whitespace().next() {
                if !file_path.is_empty() && !file_path.starts_with("Warning") {
                    conflicts.push(file_path.to_string());
                }
            }
        }
    }

    Ok(conflicts)
}

/// Collect detailed information about all revisions for a conflicted bookmark
fn collect_bookmark_conflict_info(
    repo_path: &str,
    revision: &str,
) -> Result<BookmarkConflictInfo, JjError> {
    let bookmark_name = revision.split('@').next().unwrap_or(revision).to_string();
    let exact_query = format!("bookmarks(exact:{})", bookmark_name);

    let template = concat!(
        "commit_id() ++ \"\\t\" ++ ",
        "commit_id.short(12) ++ \"\\t\" ++ ",
        "change_id.short(12) ++ \"\\t\" ++ ",
        "if(description, description.first_line(), \"(no description)\") ++ \"\\t\" ++ ",
        "author.name() ++ \"\\t\" ++ ",
        "author.timestamp() ++ \"\\t\" ++ ",
        "diff.stat() ++ \"\\x1E\""
    );

    let output = command_for("jj")
        .current_dir(repo_path)
        .args(["log", "-r", &exact_query, "--no-graph", "-T", template])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    for record in stdout.split('\x1E') {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }

        let mut lines = record.lines();
        let first_line = match lines.next() {
            Some(line) => line,
            None => continue,
        };

        let parts: Vec<&str> = first_line.split('\t').collect();
        if parts.len() < 6 {
            continue;
        }

        // diff.stat() output might span multiple lines; append remaining lines
        let mut diff_stat_parts: Vec<&str> = Vec::new();
        if parts.len() > 6 {
            diff_stat_parts.push(parts[6]);
        }
        for line in lines {
            diff_stat_parts.push(line);
        }
        let diff_summary = diff_stat_parts
            .last()
            .copied()
            .unwrap_or("")
            .trim()
            .to_string();

        commits.push(BookmarkConflictCommit {
            commit_id: parts[0].to_string(),
            short_commit_id: parts[1].to_string(),
            change_id: parts[2].to_string(),
            description: parts[3].to_string(),
            author_name: parts[4].to_string(),
            timestamp: parts[5].to_string(),
            diff_summary,
        });
    }

    Ok(BookmarkConflictInfo {
        bookmark: bookmark_name,
        commits,
    })
}

/// Get the current commit ID for a branch/revision
/// Uses: jj log -r <revision> --no-graph -T 'commit_id.short(12)'
/// Returns error if the bookmark is conflicted (with details about all conflicting commits)
pub fn jj_get_commit_id(repo_path: &str, revision: &str) -> Result<String, JjError> {
    let output = command_for("jj")
        .current_dir(repo_path)
        .args([
            "log",
            "-r",
            revision,
            "--no-graph",
            "-T",
            "commit_id.short(12)",
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let error_msg = stderr.to_string();

        // If the bookmark is conflicted, get all commits and report them
        if error_msg.contains("conflicted") && !revision.starts_with("bookmarks(") {
            if let Ok(info) = collect_bookmark_conflict_info(repo_path, revision) {
                if !info.commits.is_empty() {
                    return Err(JjError::BookmarkConflict(info));
                }
            }
        }

        return Err(JjError::IoError(format!(
            "Failed to get commit ID for '{}': {}",
            revision, error_msg
        )));
    }

    let commit_id = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if commit_id.is_empty() {
        return Err(JjError::IoError(format!(
            "No commit found for revision '{}'",
            revision
        )));
    }

    Ok(commit_id)
}

/// Get commit IDs matching a revset expression.
/// Returns short (12-char) commit IDs, one per matching commit.
/// Returns empty vec if the revset matches nothing (not an error).
pub fn jj_log_revset_commit_ids(
    workspace_path: &str,
    revset: &str,
) -> Result<Vec<String>, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args([
            "log",
            "-r",
            revset,
            "--no-graph",
            "-T",
            r#"commit_id.short(12) ++ "\n""#,
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Empty revision set is not an error - just means no matches
        if stderr.contains("Empty revision set") {
            return Ok(Vec::new());
        }
        return Err(JjError::IoError(format!(
            "Failed to log revset '{}': {}",
            revset, stderr
        )));
    }

    let ids: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    Ok(ids)
}

/// Rebase using a revset expression
/// Runs from specified directory to ensure correct commit resolution
/// Sets jj bookmark after successful rebase
pub fn jj_rebase_with_revset(
    working_dir: &str,
    revset: &str,
    target_branch: &str,
    _branch_name: &str, // No longer used after switching to bookmark-only rebasing
    conflict_marker_style: &str,
) -> Result<JjRebaseResult, JjError> {
    let output = jj_command(conflict_marker_style)
        .current_dir(working_dir)
        .args(["rebase", "-s", revset, "-d", target_branch])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined_message = format!("{}{}", stdout, stderr);

    // Empty revision sets are successful no-ops when branch is already on target.
    if !output.status.success() && stderr.contains("Empty revision set") {
        return Ok(JjRebaseResult {
            success: true,
            message: "Nothing to rebase (empty revision set)".to_string(),
        });
    }

    // Rebase updates included bookmarks automatically; keep bookmark operations commit-only for workspace isolation.

    Ok(JjRebaseResult {
        success: output.status.success(),
        message: combined_message,
    })
}

/// Get the default branch of the repository (main/master)
/// Checks git symbolic-ref for origin/HEAD, falls back to checking for main/master
pub fn get_default_branch(repo_path: &str) -> Result<String, JjError> {
    // Try origin/HEAD first
    let output = command_for("git")
        .current_dir(repo_path)
        .args(["symbolic-ref", "refs/remotes/origin/HEAD"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout)
            .trim()
            .strip_prefix("refs/remotes/origin/")
            .unwrap_or("main")
            .to_string();
        return Ok(branch);
    }

    // Fallback: check for main or master branches
    for branch in &["main", "master"] {
        let check = command_for("git")
            .current_dir(repo_path)
            .args(["rev-parse", "--verify", branch])
            .output();

        if check.map(|o| o.status.success()).unwrap_or(false) {
            return Ok(branch.to_string());
        }
    }

    // Default fallback
    Ok("main".to_string())
}

/// Push changes to remote using jj git push
pub fn jj_push(workspace_path: &str) -> Result<String, JjError> {
    // Get current branch name to check/ensure tracking
    let branch_name = get_workspace_branch(workspace_path)?;

    // Ensure bookmark is tracked before push to avoid non-tracking bookmark warnings.
    let mut tracking_message = String::new();

    match is_bookmark_tracked(workspace_path, &branch_name, "origin") {
        Ok(true) => {
            // Already tracked, proceed normally
        }
        Ok(false) => {
            // Not tracked, attempt to set up tracking
            tracking_message.push_str(&format!(
                "Warning: Bookmark '{}' was not tracked. Attempting to set up tracking...\n",
                branch_name
            ));

            if let Err(e) = jj_bookmark_track(workspace_path, &branch_name, "origin") {
                tracking_message.push_str(&format!(
                    "Warning: Could not set up tracking: {}. Attempting push anyway...\n",
                    e
                ));
            }
        }
        Err(e) => {
            // Error checking, log but continue
            tracking_message.push_str(&format!(
                "Warning: Could not verify tracking status: {}. Attempting push anyway...\n",
                e
            ));
        }
    }

    // Push explicit bookmark names so new/untracked bookmarks are still pushed.
    let mut cmd = command_for("jj");
    cmd.current_dir(workspace_path);
    cmd.args(["git", "push", "--bookmark", &branch_name]);

    let output = cmd.output().map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(JjError::IoError(format!(
            "{}{}{}",
            tracking_message, stdout, stderr
        )));
    }

    // Fallback to git push when jj CLI and jj_lib behavior diverges.
    if let Some(repo_path) = derive_repo_path_from_workspace(workspace_path) {
        let git_out = std::process::Command::new("git")
            .current_dir(&repo_path)
            .args(["push", "origin", &branch_name])
            .output()
            .map_err(|e| JjError::IoError(format!("git push fallback failed: {}", e)))?;
        if !git_out.status.success() {
            let git_stderr = String::from_utf8_lossy(&git_out.stderr);
            // Ignore "already up to date" / "Everything up-to-date" - those are fine
            let msg = git_stderr.to_lowercase();
            if !msg.contains("up to date")
                && !msg.contains("up-to-date")
                && !msg.contains("already exists")
            {
                return Err(JjError::IoError(format!(
                    "git push fallback failed: {}",
                    git_stderr
                )));
            }
        }
    }

    Ok(format!("{}{}{}", tracking_message, stdout, stderr))
}

/// Get bookmarks on a given revision
pub fn get_bookmarks_on_revision(
    workspace_path: &str,
    revision: &str,
) -> Result<Vec<String>, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args([
            "log",
            "-r",
            revision,
            "--no-graph",
            "-T",
            r#"bookmarks.map(|b| b.name()).join(",") ++ "\n""#,
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let bookmarks: Vec<String> = stdout
        .lines()
        .flat_map(|line| line.split(','))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(bookmarks)
}

/// Get sync status with remote (ahead/behind counts)
/// Returns (ahead_count, behind_count)
///
/// If the branch is not on remote and not_on_remote is false, logs an error.
/// If the branch is not on remote and not_on_remote is true, silently returns (0, 0).
pub fn jj_get_sync_status(
    workspace_path: &str,
    branch_name: &str,
    not_on_remote: bool,
) -> Result<(usize, usize), JjError> {
    let repo_path = derive_repo_path_from_workspace(workspace_path)
        .unwrap_or_else(|| workspace_path.to_string());
    let remote_branch = format!("{}@origin", branch_name);

    if !check_remote_branch_exists(&repo_path, &remote_branch)? {
        return Ok((0, 0));
    }

    if jj_is_bookmark_conflicted(workspace_path, branch_name) {
        return jj_get_diverged_sync_counts(workspace_path, branch_name);
    }

    // Count commits ahead with `jj log <remote>..<local>`.
    let ahead_output = command_for("jj")
        .current_dir(workspace_path)
        .args([
            "log",
            "-r",
            &format!("{}..{}", remote_branch, branch_name),
            "--no-graph",
            "-T",
            r#"commit_id ++ "\n""#,
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let ahead_count = if ahead_output.status.success() {
        String::from_utf8_lossy(&ahead_output.stdout)
            .lines()
            .filter(|line| !line.trim().is_empty())
            .count()
    } else {
        let stderr = String::from_utf8_lossy(&ahead_output.stderr);
        // Only log if branch should be on remote (not_on_remote is false)
        if !not_on_remote {
            eprintln!("[sync_status] Failed to get ahead count: {}", stderr);
        }
        0
    };

    // Count commits behind with `jj log <local>..<remote>`.
    let behind_output = command_for("jj")
        .current_dir(workspace_path)
        .args([
            "log",
            "-r",
            &format!("{}..{}", branch_name, remote_branch),
            "--no-graph",
            "-T",
            r#"commit_id ++ "\n""#,
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let behind_count = if behind_output.status.success() {
        String::from_utf8_lossy(&behind_output.stdout)
            .lines()
            .filter(|line| !line.trim().is_empty())
            .count()
    } else {
        let stderr = String::from_utf8_lossy(&behind_output.stderr);
        // Only log if branch should be on remote (not_on_remote is false)
        if !not_on_remote {
            eprintln!("[sync_status] Failed to get behind count: {}", stderr);
        }
        0
    };

    Ok((ahead_count, behind_count))
}

/// Check if a bookmark is in a conflicted (diverged) state.
///
/// This happens when both local and remote have diverged from a common ancestor.
pub fn jj_is_bookmark_conflicted(workspace_path: &str, branch_name: &str) -> bool {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["bookmark", "list", "--conflicted", "-T", r#"name ++ "\n""#])
        .output();

    match output {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .lines()
            .any(|line| line.trim() == branch_name),
        _ => false,
    }
}

/// Get sync counts for a diverged (conflicted) bookmark.
///
/// When a bookmark is conflicted, the bookmark name can't be used directly in revsets.
/// Instead, we use `@-` (parent of working copy) as a proxy for the local bookmark tip.
pub fn jj_get_diverged_sync_counts(
    workspace_path: &str,
    branch_name: &str,
) -> Result<(usize, usize), JjError> {
    let remote_ref = format!("{}@origin", branch_name);

    // Count ahead: commits in local but not remote
    let ahead_output = command_for("jj")
        .current_dir(workspace_path)
        .args([
            "log",
            "-r",
            &format!("{}..@-", remote_ref),
            "--no-graph",
            "-T",
            r#"commit_id ++ "\n""#,
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let ahead_count = if ahead_output.status.success() {
        String::from_utf8_lossy(&ahead_output.stdout)
            .lines()
            .filter(|line| !line.trim().is_empty())
            .count()
    } else {
        0
    };

    // Count behind: commits in remote but not local
    let behind_output = command_for("jj")
        .current_dir(workspace_path)
        .args([
            "log",
            "-r",
            &format!("@-..{}", remote_ref),
            "--no-graph",
            "-T",
            r#"commit_id ++ "\n""#,
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let behind_count = if behind_output.status.success() {
        String::from_utf8_lossy(&behind_output.stdout)
            .lines()
            .filter(|line| !line.trim().is_empty())
            .count()
    } else {
        0
    };

    Ok((ahead_count, behind_count))
}

// ============================================================================
// Batched queries for list_workspace_statuses — reduce subprocess calls
// ============================================================================

/// Get all conflicted bookmarks in the repo in a single global call.
/// Returns a HashSet of conflicted bookmark names.
pub fn jj_get_all_conflicted_bookmarks(repo_path: &str) -> HashSet<String> {
    let output = command_for("jj")
        .current_dir(repo_path)
        .args(["bookmark", "list", "--conflicted", "-T", r#"name ++ "\n""#])
        .output();

    match output {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| line.trim().to_string())
            .collect(),
        _ => HashSet::new(),
    }
}

/// Combined status for a workspace: changed files + conflict markers from a single jj status call.
pub struct WorkspaceStatusCombined {
    pub changed_files: Vec<JjFileChange>,
    pub has_conflict_markers: bool,
}

/// Get changed files and conflict marker presence from a single jj status call.
/// Reuses the status output that jj_get_changed_files would have produced.
pub fn jj_get_workspace_status_combined(workspace_path: &str) -> WorkspaceStatusCombined {
    let path = std::path::Path::new(workspace_path);
    if !path.exists() || !path.is_dir() {
        return WorkspaceStatusCombined {
            changed_files: Vec::new(),
            has_conflict_markers: false,
        };
    }

    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["status", "--no-pager"])
        .output();

    match output {
        Ok(output) if output.status.success() => {
            let status_output = String::from_utf8_lossy(&output.stdout);
            let changed_files = parse_jj_status(&status_output).unwrap_or_default();
            // jj status reports "There are unresolved conflicts" when conflicts exist
            let has_conflict_markers = status_output.contains("unresolved conflicts");
            WorkspaceStatusCombined {
                changed_files,
                has_conflict_markers,
            }
        }
        _ => WorkspaceStatusCombined {
            changed_files: Vec::new(),
            has_conflict_markers: false,
        },
    }
}

/// Combined ahead/behind counts for a workspace.
pub struct CombinedCounts {
    pub commits_ahead_of_target: usize,
    pub ahead_of_origin: usize,
    pub behind_origin: usize,
}

/// Get commits ahead of target + sync status in a single jj log call using a union revset.
/// Falls back gracefully when branch@origin doesn't exist (returns 0 for sync counts).
pub fn jj_get_combined_counts(
    workspace_path: &str,
    target_branch: &str,
    branch_name: &str,
    not_on_remote: bool,
    is_diverged: bool,
) -> CombinedCounts {
    // Validate inputs
    if target_branch.starts_with('-') || target_branch.contains('\0') || target_branch.is_empty() {
        return CombinedCounts {
            commits_ahead_of_target: 0,
            ahead_of_origin: 0,
            behind_origin: 0,
        };
    }

    // Build union revset with tags to distinguish each category
    let ahead_of_target_revset = format!("({}..@-) ~ empty()", target_branch);

    if not_on_remote {
        // Only query commits ahead of target — no sync needed
        let output = command_for("jj")
            .current_dir(workspace_path)
            .args([
                "log",
                "-r",
                &ahead_of_target_revset,
                "--no-graph",
                "-T",
                r#"commit_id ++ "\n""#,
            ])
            .output();

        let commits_ahead = match output {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter(|l| !l.trim().is_empty())
                .count(),
            _ => 0,
        };

        return CombinedCounts {
            commits_ahead_of_target: commits_ahead,
            ahead_of_origin: 0,
            behind_origin: 0,
        };
    }

    // For diverged bookmarks, use @- as proxy for local tip
    let (local_ref, remote_ref) = if is_diverged {
        ("@-".to_string(), format!("{}@origin", branch_name))
    } else {
        (branch_name.to_string(), format!("{}@origin", branch_name))
    };

    let ahead_of_origin_revset = format!("{}..{}", remote_ref, local_ref);
    let behind_origin_revset = format!("{}..{}", local_ref, remote_ref);

    // Use a union revset and tag template to classify each commit.
    let union_revset = format!(
        "({}) | ({}) | ({})",
        ahead_of_target_revset, ahead_of_origin_revset, behind_origin_revset
    );

    // Template: output commit_id + which sets it belongs to using contained_in()
    let template = format!(
        r#"commit_id.short(12) ++ " " ++ if(self.contained_in("{}"), "T", "") ++ if(self.contained_in("{}"), "A", "") ++ if(self.contained_in("{}"), "B", "") ++ "\n""#,
        ahead_of_target_revset.replace('"', r#"\""#),
        ahead_of_origin_revset.replace('"', r#"\""#),
        behind_origin_revset.replace('"', r#"\""#),
    );

    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["log", "-r", &union_revset, "--no-graph", "-T", &template])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let mut target_count = 0usize;
            let mut ahead_count = 0usize;
            let mut behind_count = 0usize;

            for line in stdout.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                // Format: "commit_id TAB" where TAB contains T/A/B flags
                if let Some(flags_start) = line.find(' ') {
                    let flags = &line[flags_start + 1..];
                    if flags.contains('T') {
                        target_count += 1;
                    }
                    if flags.contains('A') {
                        ahead_count += 1;
                    }
                    if flags.contains('B') {
                        behind_count += 1;
                    }
                }
            }

            CombinedCounts {
                commits_ahead_of_target: target_count,
                ahead_of_origin: ahead_count,
                behind_origin: behind_count,
            }
        }
        Ok(o) => {
            // Command failed — likely stale bookmark reference. Fall back to individual queries.
            let stderr = String::from_utf8_lossy(&o.stderr);
            if !not_on_remote {
                eprintln!(
                    "[combined_counts] Union revset failed, falling back: {}",
                    stderr.lines().next().unwrap_or("")
                );
            }
            // Fall back to individual counts
            let commits_ahead = jj_get_commits_ahead(workspace_path, target_branch)
                .map(|ca| ca.total_count)
                .unwrap_or(0);
            let (ahead, behind) = if is_diverged {
                jj_get_diverged_sync_counts(workspace_path, branch_name).unwrap_or((0, 0))
            } else {
                jj_get_sync_status(workspace_path, branch_name, false).unwrap_or((0, 0))
            };
            CombinedCounts {
                commits_ahead_of_target: commits_ahead,
                ahead_of_origin: ahead,
                behind_origin: behind,
            }
        }
        Err(_) => CombinedCounts {
            commits_ahead_of_target: 0,
            ahead_of_origin: 0,
            behind_origin: 0,
        },
    }
}

/// Fetch remote branches using jj git fetch (without rebasing)
/// This updates remote tracking refs and makes remote branches available
pub fn jj_git_fetch(repo_path: &str) -> Result<String, JjError> {
    let output = command_for("jj")
        .current_dir(repo_path)
        .args(["git", "fetch"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // `jj git fetch` can warn on stderr on success; fail only on non-zero command status.
    if !output.status.success() {
        return Err(JjError::IoError(format!("{}{}", stdout, stderr)));
    }

    Ok(format!("{}{}", stdout, stderr))
}

/// Pull changes from remote using jj git fetch + rebase
/// Fetches from origin and rebases current workspace onto tracking branch
pub fn jj_pull(workspace_path: &str, conflict_marker_style: &str) -> Result<String, JjError> {
    // First, fetch from remote
    let fetch_output = command_for("jj")
        .current_dir(workspace_path)
        .args(["git", "fetch"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let fetch_stdout = String::from_utf8_lossy(&fetch_output.stdout);
    let fetch_stderr = String::from_utf8_lossy(&fetch_output.stderr);

    if !fetch_output.status.success() {
        return Err(JjError::IoError(format!(
            "{}{}",
            fetch_stdout, fetch_stderr
        )));
    }

    // Get the current branch name to determine tracking branch
    let branch_name = get_workspace_branch(workspace_path)?;

    if branch_name.is_empty() || branch_name == "HEAD" {
        // No branch - just return fetch result
        return Ok(format!("{}{}", fetch_stdout, fetch_stderr));
    }

    // Rebase onto the tracking branch (branch@origin)
    let tracking_branch = format!("{}@origin", branch_name);
    let rebase_output = jj_command(conflict_marker_style)
        .current_dir(workspace_path)
        .args(["rebase", "-d", &tracking_branch])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let rebase_stdout = String::from_utf8_lossy(&rebase_output.stdout);
    let rebase_stderr = String::from_utf8_lossy(&rebase_output.stderr);

    // Combine fetch and rebase output
    let combined = format!(
        "Fetch:\n{}{}\nRebase:\n{}{}",
        fetch_stdout, fetch_stderr, rebase_stdout, rebase_stderr
    );

    if !rebase_output.status.success() {
        return Err(JjError::IoError(combined));
    }

    Ok(combined)
}

/// Branch status indicating whether a branch exists locally and/or remotely
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BranchStatus {
    pub local_exists: bool,
    pub remote_exists: bool,
    pub remote_name: Option<String>, // The remote name (e.g., "origin") if remote exists
    pub remote_ref: Option<String>,  // Full remote ref (e.g., "origin/branch") if remote exists
}

/// Check if a branch exists locally and/or remotely
/// Uses git rev-parse to check refs/heads/{branch} and refs/remotes/{remote}/{branch}
/// Currently only checks 'origin' remote
pub fn check_branch_exists(repo_path: &str, branch_name: &str) -> Result<BranchStatus, JjError> {
    // Check local branch existence
    let local_ref = format!("refs/heads/{}", branch_name);
    let local_check = command_for("git")
        .current_dir(repo_path)
        .args(["rev-parse", "--verify", &local_ref])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let local_exists = local_check.status.success();

    // Check branch existence against origin (future: all remotes).
    let remote_name = "origin";
    let remote_ref = format!("refs/remotes/{}/{}", remote_name, branch_name);
    let remote_check = command_for("git")
        .current_dir(repo_path)
        .args(["rev-parse", "--verify", &remote_ref])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let remote_exists = remote_check.status.success();

    let remote_ref_short = if remote_exists {
        Some(format!("{}/{}", remote_name, branch_name))
    } else {
        None
    };

    Ok(BranchStatus {
        local_exists,
        remote_exists,
        remote_name: if remote_exists {
            Some(remote_name.to_string())
        } else {
            None
        },
        remote_ref: remote_ref_short,
    })
}

/// Get list of git remotes in the repository with graceful fallback
/// Uses jj git remote list which returns format: "<remote_name> <remote_url>"
pub fn get_git_remotes(repo_path: &str) -> std::collections::HashSet<String> {
    let output = match command_for("jj")
        .current_dir(repo_path)
        .args(["git", "remote", "list"])
        .output()
    {
        Ok(output) => output,
        Err(e) => {
            eprintln!("Warning: Failed to execute jj git remote list: {}", e);
            return std::collections::HashSet::new();
        }
    };

    if !output.status.success() {
        eprintln!(
            "Warning: jj git remote list failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        return std::collections::HashSet::new();
    }

    // Parse `git remote -v` lines and extract the first token as remote name.
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                None
            } else {
                // Take first word (remote name)
                line.split_whitespace().next().map(|s| s.to_string())
            }
        })
        .collect()
}

/// Information about a jj bookmark/branch
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjBranch {
    pub name: String,
    pub is_current: bool,
}

/// Get list of branches in the repository using jj-lib (no subprocess)
pub fn get_branches(repo_path: &str) -> Result<Vec<JjBranch>, JjError> {
    let settings = create_user_settings(repo_path)?;
    let workspace = Workspace::load(
        &settings,
        Path::new(repo_path),
        &StoreFactories::default(),
        &default_working_copy_factories(),
    )
    .map_err(|e| JjError::IoError(format!("Failed to load workspace: {}", e)))?;
    let repo = futures::executor::block_on(workspace.repo_loader().load_at_head())
        .map_err(|e| JjError::IoError(format!("Failed to load repo: {}", e)))?;

    // Determine which commit IDs are parents of the current wc to mark is_current
    let parent_ids: std::collections::HashSet<jj_lib::backend::CommitId> = {
        let ws_name = workspace.workspace_name();
        if let Some(wc_id) = repo.view().get_wc_commit_id(ws_name) {
            match repo.store().get_commit(wc_id) {
                Ok(wc_commit) => wc_commit.parent_ids().iter().cloned().collect(),
                Err(_) => std::collections::HashSet::new(),
            }
        } else {
            std::collections::HashSet::new()
        }
    };

    let branches = repo
        .view()
        .local_bookmarks()
        .filter_map(|(name, target)| {
            let is_current = target.added_ids().any(|id| parent_ids.contains(id));
            Some(JjBranch {
                name: name.as_str().to_string(),
                is_current,
            })
        })
        .collect();

    Ok(branches)
}

/// Check if a remote branch exists in jj
///
/// # Arguments
/// * `repo_path` - Path to the repository
/// * `branch_ref` - Branch reference in jj format (e.g., "feature@origin")
///
/// # Returns
/// Returns true if the remote branch exists, false otherwise
/// Check if a remote bookmark exists using jj-lib (no subprocess).
/// Expects `branch_ref` in jj format: "name@remote" (e.g. "feature@origin").
pub fn check_remote_branch_exists(repo_path: &str, branch_ref: &str) -> Result<bool, JjError> {
    let (bookmark_name, remote_name) = match branch_ref.split_once('@') {
        Some((n, r)) if !n.is_empty() && !r.is_empty() => (n, r),
        _ => return Ok(false),
    };

    let settings = create_user_settings(repo_path)?;
    let workspace = Workspace::load(
        &settings,
        Path::new(repo_path),
        &StoreFactories::default(),
        &default_working_copy_factories(),
    )
    .map_err(|e| JjError::IoError(format!("Failed to load workspace: {}", e)))?;
    let repo = futures::executor::block_on(workspace.repo_loader().load_at_head())
        .map_err(|e| JjError::IoError(format!("Failed to load repo: {}", e)))?;

    let symbol = RemoteRefSymbol {
        name: RefName::new(bookmark_name),
        remote: RemoteName::new(remote_name),
    };
    let remote_ref = repo.view().get_remote_bookmark(symbol);
    Ok(!remote_ref.target.is_absent())
}

/// Get commit log from fork point to HEAD for a workspace
/// Uses: jj log with custom template for machine-readable output
/// Parse diff stat output from jj: "X files changed, Y insertions(+), Z deletions(-)"
/// Returns (insertions, deletions) tuple
fn parse_diff_stat(stat: &str) -> (u32, u32) {
    let mut insertions = 0;
    let mut deletions = 0;

    // Look for "Y insertions(+)"
    if let Some(ins_start) = stat.find("insertions(+)") {
        let before = &stat[..ins_start].trim();
        if let Some(last_space) = before.rfind(' ') {
            if let Ok(num) = before[last_space + 1..].parse::<u32>() {
                insertions = num;
            }
        }
    } else if let Some(ins_start) = stat.find("insertion(+)") {
        // Handle singular "insertion"
        let before = &stat[..ins_start].trim();
        if let Some(last_space) = before.rfind(' ') {
            if let Ok(num) = before[last_space + 1..].parse::<u32>() {
                insertions = num;
            }
        }
    }

    // Look for "Z deletions(-)"
    if let Some(del_start) = stat.find("deletions(-)") {
        let before = &stat[..del_start].trim();
        if let Some(last_space) = before.rfind(' ') {
            if let Ok(num) = before[last_space + 1..].parse::<u32>() {
                deletions = num;
            }
        }
    } else if let Some(del_start) = stat.find("deletion(-)") {
        // Handle singular "deletion"
        let before = &stat[..del_start].trim();
        if let Some(last_space) = before.rfind(' ') {
            if let Ok(num) = before[last_space + 1..].parse::<u32>() {
                deletions = num;
            }
        }
    }

    (insertions, deletions)
}

/// Build the revset string for jj_get_log based on context
fn build_jj_get_log_revset(target_ref: &str, is_home_repo: bool, limit: Option<usize>) -> String {
    let target_ref = format_revset_symbol(target_ref);
    if is_home_repo {
        let n = limit.unwrap_or(15);
        format!("latest(::{}, {})", target_ref, n)
    } else {
        // For workspace: show commits ahead of target branch
        format!("{}..@", target_ref)
    }
}

fn build_home_repo_fallback_revset(limit: Option<usize>) -> String {
    let n = limit.unwrap_or(15);
    format!("latest(::@, {})", n)
}

fn candidate_target_refs(target_branch: &str) -> Vec<String> {
    let mut refs = vec![target_branch.to_string()];
    if !target_branch.contains('@') {
        refs.push(format!("{}@git", target_branch));
    }
    refs
}

fn format_revset_symbol(symbol: &str) -> String {
    if symbol.starts_with('@') {
        return symbol.to_string();
    }
    if let Some((name, remote)) = symbol.split_once('@') {
        if !name.is_empty() && !remote.is_empty() {
            return revset::format_remote_symbol(name, remote);
        }
    }
    revset::format_symbol(symbol)
}

pub fn jj_get_log(
    workspace_path: &str,
    target_branch: &str,
    is_home_repo: Option<bool>,
    limit: Option<usize>,
) -> Result<JjLogResult, JjError> {
    if target_branch.starts_with('-') || target_branch.contains('\0') || target_branch.is_empty() {
        return Err(JjError::IoError("Invalid target branch name".to_string()));
    }

    let cache_repo_path = derive_repo_path_from_workspace(workspace_path)
        .unwrap_or_else(|| workspace_path.to_string());
    let workspace_branch = get_workspace_branch(workspace_path)?;
    let mut loaded = load_workspace_repo(workspace_path)?;
    if is_home_repo.unwrap_or(false) {
        import_git_head_if_needed(&mut loaded, workspace_path)?;
    }
    let wc_tree_override = snapshot_working_copy_tree(&mut loaded, workspace_path)
        .ok()
        .flatten();
    let mut last_error = None;
    let mut selected_target_ref = None;
    let mut revset = None;
    for target_ref in candidate_target_refs(target_branch) {
        let revset_expr =
            build_jj_get_log_revset(&target_ref, is_home_repo.unwrap_or(false), limit);
        match evaluate_revset(&loaded, &revset_expr) {
            Ok(evaluated) => {
                selected_target_ref = Some(target_ref);
                revset = Some((revset_expr, evaluated));
                break;
            }
            Err(err) => last_error = Some(err),
        }
    }
    if revset.is_none() && is_home_repo.unwrap_or(false) {
        let revset_expr = build_home_repo_fallback_revset(limit);
        match evaluate_revset(&loaded, &revset_expr) {
            Ok(evaluated) => {
                selected_target_ref = Some("@-".to_string());
                revset = Some((revset_expr, evaluated));
            }
            Err(err) => last_error = Some(err),
        }
    }
    let selected_target_ref = selected_target_ref.ok_or_else(|| {
        last_error.unwrap_or_else(|| JjError::IoError("Failed to evaluate log revset".to_string()))
    })?;
    let (revset_expr, revset) = revset.expect("selected target ref must include a revset");
    let immutable_revset = evaluate_revset(
        &loaded,
        &format!("::{}", format_revset_symbol(&selected_target_ref)),
    )?;
    let is_immutable = immutable_revset.containing_fn();
    let commits = revset
        .iter()
        .commits(loaded.repo.store())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| {
            JjError::IoError(format!("Failed to iterate revset '{}': {}", revset_expr, e))
        })?;
    let wc_commit_ids: HashSet<_> = loaded
        .repo
        .view()
        .wc_commit_ids()
        .values()
        .cloned()
        .collect();
    let commits = build_log_commits(
        &cache_repo_path,
        &loaded.repo,
        commits,
        &wc_commit_ids,
        wc_tree_override
            .as_ref()
            .map(|(commit_id, tree)| (commit_id, tree)),
        &is_immutable,
    );

    Ok(JjLogResult {
        commits,
        target_branch: target_branch.to_string(),
        workspace_branch,
        target_branch_commits: Vec::new(),
    })
}

/// Get the most recent commits on a target branch (for display below active workspace commits).
///
/// Uses revset: `latest(::{target_branch}, {limit})` to get the N most recent commits
/// on the target branch.
pub fn jj_get_target_branch_log(
    workspace_path: &str,
    target_branch: &str,
    limit: usize,
) -> Result<Vec<JjLogCommit>, JjError> {
    if target_branch.starts_with('-') || target_branch.contains('\0') || target_branch.is_empty() {
        return Err(JjError::IoError("Invalid target branch name".to_string()));
    }

    let cache_repo_path = derive_repo_path_from_workspace(workspace_path)
        .unwrap_or_else(|| workspace_path.to_string());
    // Over-fetch to allow dropping WC placeholders without truncating visible target history.
    let fetch_limit = limit.saturating_add(5);
    let loaded = load_workspace_repo(workspace_path)?;
    let mut last_error = None;
    let mut selected_target_ref = None;
    let mut revset = None;
    for target_ref in candidate_target_refs(target_branch) {
        let revset_expr = build_target_branch_revset(&target_ref, fetch_limit);
        match evaluate_revset(&loaded, &revset_expr) {
            Ok(evaluated) => {
                selected_target_ref = Some(target_ref);
                revset = Some((revset_expr, evaluated));
                break;
            }
            Err(err) => last_error = Some(err),
        }
    }
    let selected_target_ref = selected_target_ref.ok_or_else(|| {
        last_error.unwrap_or_else(|| {
            JjError::IoError("Failed to evaluate target branch revset".to_string())
        })
    })?;
    let (revset_expr, revset) = revset.expect("selected target ref must include a revset");
    let immutable_revset = evaluate_revset(
        &loaded,
        &format!("::{}", format_revset_symbol(&selected_target_ref)),
    )?;
    let is_immutable = immutable_revset.containing_fn();
    let wc_commit_ids: HashSet<_> = loaded
        .repo
        .view()
        .wc_commit_ids()
        .values()
        .cloned()
        .collect();
    let commits = revset
        .iter()
        .commits(loaded.repo.store())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| {
            JjError::IoError(format!("Failed to iterate revset '{}': {}", revset_expr, e))
        })?;
    let mut commits: Vec<_> = commits
        .into_iter()
        .filter(|commit| {
            !wc_commit_ids.contains(commit.id())
                && !(commit_description_first_line(commit) == "(no description)"
                    && loaded
                        .repo
                        .view()
                        .local_bookmarks_for_commit(commit.id())
                        .next()
                        .is_none()
                    && is_empty_commit(&loaded.repo, commit))
        })
        .collect();
    commits.truncate(limit);
    Ok(build_log_commits(
        &cache_repo_path,
        &loaded.repo,
        commits,
        &wc_commit_ids,
        None,
        &is_immutable,
    ))
}

fn build_target_branch_revset(target_ref: &str, limit: usize) -> String {
    format!("latest(::{}, {})", format_revset_symbol(target_ref), limit)
}

/// Get commits that are in workspace but not in target branch
/// Uses revset: target_branch..@- (commits reachable from @- but not from target)
/// Note: Uses @- (parent of working copy) to exclude the empty working copy commit
pub fn jj_get_commits_ahead(
    workspace_path: &str,
    target_branch: &str,
) -> Result<JjCommitsAhead, JjError> {
    // Validate target_branch to prevent injection
    if target_branch.starts_with('-') || target_branch.contains('\0') || target_branch.is_empty() {
        return Err(JjError::IoError("Invalid target branch name".to_string()));
    }

    // Use same template as jj_get_log
    let template = concat!(
        "commit_id.short(12) ++ \"\\t\" ++ ",
        "change_id.short(12) ++ \"\\t\" ++ ",
        "if(description, description.first_line(), \"(no description)\") ++ \"\\t\" ++ ",
        "author.name() ++ \"\\t\" ++ ",
        "author.timestamp() ++ \"\\t\" ++ ",
        "parents.map(|p| p.commit_id().short(12)).join(\",\") ++ \"\\t\" ++ ",
        "if(working_copies, \"true\", \"false\") ++ \"\\t\" ++ ",
        "bookmarks.map(|b| b.name()).join(\",\") ++ \"\\t\" ++ ",
        "if(immutable, \"true\", \"false\") ++ \"\\t\" ++ ",
        "diff.stat() ++ \"\\n\""
    );

    let mut candidates = vec![target_branch.to_string()];
    if !target_branch.contains('@') {
        candidates.push(format!("{}@git", target_branch));
    }

    let mut stdout = None;
    let mut last_error = None;
    for candidate in candidates {
        // Revset excludes working-copy and empty commits while selecting @-reachable non-target commits.
        let revset = format!("({}..@-) ~ empty()", candidate);

        let output = command_for("jj")
            .current_dir(workspace_path)
            .args(["log", "-r", &revset, "--no-graph", "-T", template])
            .output()
            .map_err(|e| JjError::IoError(e.to_string()))?;

        if output.status.success() {
            stdout = Some(String::from_utf8_lossy(&output.stdout).into_owned());
            break;
        }

        last_error = Some(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let stdout = stdout.ok_or_else(|| {
        last_error.unwrap_or_else(|| JjError::IoError("Failed to get commits ahead".to_string()))
    })?;
    let mut commits = Vec::new();

    // Parse each line of tab-separated output (same logic as jj_get_log)
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 10 {
            continue;
        }

        let short_id = parts[0].to_string();
        let change_id = parts[1].to_string();
        let description = parts[2].to_string();
        let author_name = parts[3].to_string();
        let timestamp = parts[4].to_string();
        let parent_ids_str = parts[5];
        let is_working_copy = parts[6] == "true";
        let bookmarks_str = parts[7];
        let is_immutable = parts[8] == "true";
        let diff_stat = parts[9];

        let parent_ids: Vec<String> = if parent_ids_str.is_empty() {
            Vec::new()
        } else {
            parent_ids_str.split(',').map(|s| s.to_string()).collect()
        };

        let bookmarks: Vec<String> = if bookmarks_str.is_empty() {
            Vec::new()
        } else {
            bookmarks_str.split(',').map(|s| s.to_string()).collect()
        };

        // Parse diff stats
        let (insertions, deletions) = parse_diff_stat(diff_stat);

        commits.push(JjLogCommit {
            commit_id: short_id.clone(),
            short_id,
            change_id,
            description,
            author_name,
            timestamp,
            parent_ids,
            is_working_copy,
            bookmarks,
            is_immutable,
            insertions,
            deletions,
        });
    }

    let total_count = commits.len();

    Ok(JjCommitsAhead {
        commits,
        total_count,
    })
}

/// Abandon empty commits between target branch and working copy parent.
/// Returns list of abandoned change IDs.
pub fn jj_abandon_empty_commits(
    workspace_path: &str,
    target_branch: &str,
) -> Result<Vec<String>, JjError> {
    if target_branch.starts_with('-') || target_branch.contains('\0') || target_branch.is_empty() {
        return Err(JjError::IoError("Invalid target branch name".to_string()));
    }

    // Find empty commits in the range
    let revset = format!("({}..@-) & empty()", target_branch);

    let output = command_for("jj")
        .current_dir(workspace_path)
        .args([
            "log",
            "-r",
            &revset,
            "--no-graph",
            "-T",
            "change_id.short(12) ++ \"\\n\"",
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let change_ids: Vec<String> = stdout
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    for change_id in &change_ids {
        jj_abandon(workspace_path, change_id)?;
    }

    Ok(change_ids)
}

/// Parse diff summary output from jj diff --summary
/// Format: "M file.txt", "A new.txt", "D removed.txt"
fn parse_diff_summary(summary: &str) -> Result<Vec<JjFileChange>, JjError> {
    let mut files = Vec::new();

    for line in summary.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Parse format: "M path/to/file.txt"
        let parts: Vec<&str> = line.splitn(2, ' ').collect();
        if parts.len() < 2 {
            continue;
        }

        let status = parts[0].to_string();
        let raw_path = parts[1];
        let (path, previous_path) = parse_rename_path(raw_path);

        files.push(JjFileChange {
            path,
            status,
            previous_path,
            changed_line_count: 0,
            diff_deferred: false,
        });
    }

    Ok(files)
}

/// Extract only conflicted files from diff summary
/// Filters files with status 'C' (conflict)
fn extract_conflicted_files_from_summary(files: Vec<JjFileChange>) -> Vec<String> {
    files
        .into_iter()
        .filter(|f| f.status == "C")
        .map(|f| f.path)
        .collect()
}

fn too_large_revision_diff() -> JjRevisionDiff {
    JjRevisionDiff {
        files: Vec::new(),
        hunks_by_file: Vec::new(),
        too_large_to_render: true,
        render_block_reason: Some(TOO_LARGE_COMMIT_DIFF_MESSAGE.to_string()),
    }
}

fn resolve_commit_by_revision(
    loaded: &LoadedWorkspaceRepo,
    revision: &str,
) -> Result<jj_lib::commit::Commit, JjError> {
    let revset = evaluate_revset(loaded, revision)?;
    let commits = revset
        .iter()
        .commits(loaded.repo.store())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| {
            JjError::IoError(format!("Failed to resolve revision '{}': {}", revision, e))
        })?;
    match commits.len() {
        1 => Ok(commits.into_iter().next().expect("single commit expected")),
        0 => Err(JjError::IoError(format!(
            "Revision '{}' did not resolve to a commit",
            revision
        ))),
        _ => Err(JjError::IoError(format!(
            "Revision '{}' resolved to multiple commits",
            revision
        ))),
    }
}

fn get_commit_copy_records(
    store: &jj_lib::store::Store,
    commit: &jj_lib::commit::Commit,
) -> Result<CopyRecords, JjError> {
    let mut copy_records = CopyRecords::default();
    for parent_id in commit.parent_ids() {
        let records_stream = store
            .get_copy_records(None, parent_id, commit.id())
            .map_err(|e| JjError::IoError(format!("Failed to read copy records: {}", e)))?;
        let records = futures::executor::block_on(records_stream.try_collect::<Vec<_>>())
            .map_err(|e| JjError::IoError(format!("Failed to collect copy records: {}", e)))?;
        copy_records.add_records(records);
    }
    Ok(copy_records)
}

fn build_file_change(
    entry_path: &jj_lib::copies::CopiesTreeDiffEntryPath,
    changed_line_count: usize,
    diff_deferred: bool,
    before_absent: bool,
    after_absent: bool,
) -> JjFileChange {
    let path = entry_path.target().as_internal_file_string().to_string();
    let previous_path = entry_path
        .to_diff()
        .map(|diff| diff.before.as_internal_file_string().to_string());
    let status = match entry_path.copy_operation() {
        Some(jj_lib::copies::CopyOperation::Rename) => "R",
        Some(jj_lib::copies::CopyOperation::Copy) => "C",
        None if before_absent => "A",
        None if after_absent => "D",
        None => "M",
    };

    JjFileChange {
        path,
        status: status.to_string(),
        previous_path,
        changed_line_count,
        diff_deferred,
    }
}

fn build_file_diff_from_bytes(
    before_bytes: Option<Vec<u8>>,
    after_bytes: Option<Vec<u8>>,
) -> (usize, Vec<JjDiffHunk>) {
    match (before_bytes, after_bytes) {
        (None, Some(after)) => {
            let after = String::from_utf8_lossy(&after).into_owned();
            let hunks = build_text_hunks("", &after);
            (count_changed_lines(&hunks), hunks)
        }
        (Some(before), None) => {
            let before = String::from_utf8_lossy(&before).into_owned();
            let hunks = build_text_hunks(&before, "");
            (count_changed_lines(&hunks), hunks)
        }
        (Some(before), Some(after)) => {
            let before = String::from_utf8_lossy(&before).into_owned();
            let after = String::from_utf8_lossy(&after).into_owned();
            let hunks = build_text_hunks(&before, &after);
            (count_changed_lines(&hunks), hunks)
        }
        (None, None) => (0, Vec::new()),
    }
}

/// Get combined diff of all changes between target branch and workspace HEAD
/// Uses: jj diff --from target_branch --to @- --git
pub fn jj_get_merge_diff(
    workspace_path: &str,
    target_branch: &str,
    conflict_marker_style: &str,
) -> Result<JjRevisionDiff, JjError> {
    // Validate target_branch to prevent injection
    if target_branch.starts_with('-') || target_branch.contains('\0') || target_branch.is_empty() {
        return Err(JjError::IoError("Invalid target branch name".to_string()));
    }

    // First get list of changed files
    let status_output = command_for("jj")
        .current_dir(workspace_path)
        .args(["diff", "--from", target_branch, "--to", "@-", "--summary"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !status_output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&status_output.stderr).to_string(),
        ));
    }

    let summary = String::from_utf8_lossy(&status_output.stdout);
    let files = parse_diff_summary(&summary)?;

    // For each file, get the hunks
    let mut hunks_by_file = Vec::new();
    for file in &files {
        let diff_output = jj_command(conflict_marker_style)
            .current_dir(workspace_path)
            .args([
                "diff",
                "--from",
                target_branch,
                "--to",
                "@-",
                "--git",
                "--no-pager",
                "--",
                &file.path,
            ])
            .output()
            .map_err(|e| JjError::IoError(e.to_string()))?;

        if !diff_output.status.success() {
            // If diff fails for a file, skip it but continue with others
            continue;
        }

        let diff_text = String::from_utf8_lossy(&diff_output.stdout);
        let hunks = parse_git_diff_hunks(&diff_text)?;

        hunks_by_file.push(JjFileDiff {
            path: file.path.clone(),
            hunks,
        });
    }

    Ok(JjRevisionDiff {
        files,
        hunks_by_file,
        too_large_to_render: false,
        render_block_reason: None,
    })
}

pub fn jj_get_commit_diff(
    workspace_path: &str,
    revision: &str,
    _conflict_marker_style: &str,
) -> Result<JjRevisionDiff, JjError> {
    if revision.starts_with('-') || revision.contains('\0') || revision.is_empty() {
        return Err(JjError::IoError("Invalid revision".to_string()));
    }

    let loaded = load_workspace_repo(workspace_path)?;
    let commit = resolve_commit_by_revision(&loaded, revision)?;
    let parent_tree = futures::executor::block_on(commit.parent_tree(loaded.repo.as_ref()))
        .map_err(|e| JjError::IoError(format!("Failed to read parent tree: {}", e)))?;
    let commit_tree = commit.tree();
    let copy_records = get_commit_copy_records(loaded.repo.store(), &commit)?;
    let conflict_labels = Diff::new(parent_tree.labels(), commit_tree.labels());
    let matcher = repo_root_matcher();
    let diff_stream = materialized_diff_stream(
        loaded.repo.store(),
        parent_tree.diff_stream_with_copies(&commit_tree, &matcher, &copy_records),
        conflict_labels,
    );
    let mut files = Vec::new();
    let mut hunks_by_file = Vec::new();
    let too_large = futures::executor::block_on(async {
        futures::pin_mut!(diff_stream);
        let mut total_changed_lines = 0usize;

        while let Some(entry) = diff_stream.next().await {
            let values = match entry.values {
                Ok(values) => values,
                Err(_) => continue,
            };
            let before_absent = matches!(&values.before, MaterializedTreeValue::Absent);
            let after_absent = matches!(&values.after, MaterializedTreeValue::Absent);
            let before_bytes =
                materialized_value_to_bytes(entry.path.source(), values.before).await;
            let after_bytes = materialized_value_to_bytes(entry.path.target(), values.after).await;
            let (changed_line_count, hunks) = build_file_diff_from_bytes(before_bytes, after_bytes);

            total_changed_lines += changed_line_count;
            if total_changed_lines > TOO_LARGE_COMMIT_DIFF_THRESHOLD {
                return true;
            }

            let diff_deferred = changed_line_count > LARGE_COMMIT_FILE_DIFF_THRESHOLD;
            let file = build_file_change(
                &entry.path,
                changed_line_count,
                diff_deferred,
                before_absent,
                after_absent,
            );
            if !diff_deferred {
                hunks_by_file.push(JjFileDiff {
                    path: file.path.clone(),
                    hunks,
                });
            }
            files.push(file);
        }

        false
    });

    if too_large {
        return Ok(too_large_revision_diff());
    }

    Ok(JjRevisionDiff {
        files,
        hunks_by_file,
        too_large_to_render: false,
        render_block_reason: None,
    })
}

pub fn jj_get_commit_file_diff(
    workspace_path: &str,
    revision: &str,
    file_path: &str,
    _conflict_marker_style: &str,
) -> Result<JjFileDiff, JjError> {
    if revision.starts_with('-') || revision.contains('\0') || revision.is_empty() {
        return Err(JjError::IoError("Invalid revision".to_string()));
    }
    if file_path.contains('\0') || file_path.is_empty() {
        return Err(JjError::IoError("Invalid file path".to_string()));
    }

    let loaded = load_workspace_repo(workspace_path)?;
    let commit = resolve_commit_by_revision(&loaded, revision)?;
    let parent_tree = futures::executor::block_on(commit.parent_tree(loaded.repo.as_ref()))
        .map_err(|e| JjError::IoError(format!("Failed to read parent tree: {}", e)))?;
    let commit_tree = commit.tree();
    let copy_records = get_commit_copy_records(loaded.repo.store(), &commit)?;
    let conflict_labels = Diff::new(parent_tree.labels(), commit_tree.labels());
    let matcher = repo_root_matcher();
    let diff_stream = materialized_diff_stream(
        loaded.repo.store(),
        parent_tree.diff_stream_with_copies(&commit_tree, &matcher, &copy_records),
        conflict_labels,
    );
    futures::executor::block_on(async {
        futures::pin_mut!(diff_stream);
        while let Some(entry) = diff_stream.next().await {
            let target_path = entry.path.target().as_internal_file_string().to_string();
            if target_path != file_path {
                continue;
            }
            let values = match entry.values {
                Ok(values) => values,
                Err(_) => continue,
            };
            let before_bytes =
                materialized_value_to_bytes(entry.path.source(), values.before).await;
            let after_bytes = materialized_value_to_bytes(entry.path.target(), values.after).await;
            let (_, hunks) = build_file_diff_from_bytes(before_bytes, after_bytes);
            return Ok(JjFileDiff {
                path: file_path.to_string(),
                hunks,
            });
        }

        Ok(JjFileDiff {
            path: file_path.to_string(),
            hunks: Vec::new(),
        })
    })
}

fn count_changed_lines(hunks: &[JjDiffHunk]) -> usize {
    hunks
        .iter()
        .map(|hunk| {
            hunk.lines
                .iter()
                .filter(|line| line.starts_with('+') || line.starts_with('-'))
                .count()
        })
        .sum()
}

/// Create a merge commit using jj new
///
/// Flow:
/// 1. jj new workspace_branch target_branch+ -m "message" - create merge
/// 2. jj new @ - create new working copy on top
/// 3. jj bookmark set target_branch -r @- - move target_branch to merge commit
/// This is executed in the context of the workspace directory, @ refers to workspace HEAD
pub fn jj_create_merge_commit(
    workspace_path: &str,
    workspace_branch: &str,
    target_branch: &str,
    message: &str,
    conflict_marker_style: &str,
) -> Result<JjMergeResult, JjError> {
    if workspace_branch.starts_with('-')
        || workspace_branch.contains('\0')
        || workspace_branch.is_empty()
    {
        return Err(JjError::IoError(
            "Invalid workspace branch name".to_string(),
        ));
    }

    if target_branch.starts_with('-') || target_branch.contains('\0') || target_branch.is_empty() {
        return Err(JjError::IoError("Invalid target branch name".to_string()));
    }

    if message.contains('\0') {
        return Err(JjError::IoError("Invalid commit message".to_string()));
    }

    if message.len() > 10000 {
        return Err(JjError::IoError(
            "Commit message too long (max 10000 characters)".to_string(),
        ));
    }

    // Step 1: Create merge commit with workspace_branch and target_branch+ as parents
    let target_revset = format!("{}+", target_branch);
    let output = jj_command(conflict_marker_style)
        .current_dir(workspace_path)
        .args(["new", workspace_branch, &target_revset, "-m", message])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}{}", stdout, stderr);

    let has_conflicts = combined.to_lowercase().contains("conflict");

    let conflicted_files = if has_conflicts {
        get_conflicted_files(workspace_path, None).unwrap_or_default()
    } else {
        Vec::new()
    };

    let merge_commit_id = if output.status.success() {
        // Step 2: Create new working copy on top of merge
        let new_wc_output = command_for("jj")
            .current_dir(workspace_path)
            .args(["new", "@"])
            .output()
            .map_err(|e| JjError::IoError(e.to_string()))?;

        if !new_wc_output.status.success() {
            let new_wc_stderr = String::from_utf8_lossy(&new_wc_output.stderr);
            eprintln!(
                "Warning: Failed to create new working copy: {}",
                new_wc_stderr
            );
        }

        // Step 3: Move target_branch bookmark to merge commit (parent of new working copy)
        if let Err(e) = jj_set_bookmark(workspace_path, target_branch, "@-") {
            eprintln!(
                "Warning: Failed to update target bookmark '{}': {}",
                target_branch, e
            );
        }

        // Get merge commit ID (now at @-)
        command_for("jj")
            .current_dir(workspace_path)
            .args(["log", "-r", "@-", "--no-graph", "-T", "commit_id.short(12)"])
            .output()
            .ok()
            .and_then(|out| {
                if out.status.success() {
                    String::from_utf8(out.stdout)
                        .ok()
                        .map(|s| s.trim().to_string())
                } else {
                    None
                }
            })
    } else {
        None
    };

    Ok(JjMergeResult {
        success: output.status.success(),
        message: combined,
        has_conflicts,
        conflicted_files,
        merge_commit_id,
    })
}

/// Rebases a workspace branch onto the target branch and moves the target bookmark.
///
/// # Arguments
/// * `workspace_path` - Path to the workspace directory
/// * `workspace_branch` - Name of the workspace branch to rebase
/// * `target_branch` - Name of the target branch
///
/// # Returns
/// Returns the rebase result or a JjError on failure.
pub fn jj_rebase_merge_commit(
    workspace_path: &str,
    workspace_branch: &str,
    target_branch: &str,
) -> Result<JjRebaseResult, JjError> {
    if workspace_branch.starts_with('-')
        || workspace_branch.contains('\0')
        || workspace_branch.is_empty()
    {
        return Err(JjError::IoError(
            "Invalid workspace branch name".to_string(),
        ));
    }

    if target_branch.starts_with('-') || target_branch.contains('\0') || target_branch.is_empty() {
        return Err(JjError::IoError("Invalid target branch name".to_string()));
    }

    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["rebase", "-s", workspace_branch, "-d", target_branch])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}{}", stdout, stderr);

    if output.status.success() {
        if let Err(e) = jj_set_bookmark(workspace_path, target_branch, workspace_branch) {
            eprintln!(
                "Warning: Failed to update target bookmark '{}': {}",
                target_branch, e
            );
        }
    }

    Ok(JjRebaseResult {
        success: output.status.success(),
        message: combined,
    })
}

/// Squashes a workspace branch into the target branch and updates the description.
///
/// # Arguments
/// * `workspace_path` - Path to the workspace directory
/// * `workspace_branch` - Name of the workspace branch to squash
/// * `target_branch` - Name of the target branch to squash into
/// * `message` - Commit message for the squashed change
///
/// # Returns
/// Returns Ok(()) on success, or a JjError on failure.
pub fn jj_squash_merge_commit(
    workspace_path: &str,
    workspace_branch: &str,
    target_branch: &str,
    message: &str,
) -> Result<(), JjError> {
    let squash_output = command_for("jj")
        .current_dir(workspace_path)
        .args([
            "squash",
            "--from",
            workspace_branch,
            "--into",
            target_branch,
            "-m",
            message,
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !squash_output.status.success() {
        let stderr = String::from_utf8_lossy(&squash_output.stderr);
        return Err(JjError::IoError(format!("jj squash failed: {}", stderr)));
    }

    Ok(())
}

/// Updates the home repo's state by running jj st
///
/// # Arguments
/// * `repo_path` - Path to the home repository
///
/// # Returns
/// Returns Ok(()) on success, or a JjError on failure.
pub fn jj_status(repo_path: &str) -> Result<(), JjError> {
    let output = command_for("jj")
        .current_dir(repo_path)
        .args(["st"])
        .output()
        .map_err(|e| JjError::IoError(format!("Failed to run jj st: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(JjError::IoError(format!("jj st failed: {}", stderr)));
    }

    Ok(())
}

/// Imports colocated git state into jj (`import_git_head_if_needed`, `git::import_refs`) without
/// snapshotting the working copy.
///
/// Aligns with the import portion of [jj `util snapshot`](https://github.com/jj-vcs/jj/blob/main/cli/src/commands/util/snapshot.rs).
///
/// Does not shell out to `jj util snapshot`.
pub fn jj_util_import_git_refs(repo_path: &str) -> Result<(), JjError> {
    let mut loaded = load_workspace_repo(repo_path)?;
    import_colocated_git_state(&mut loaded, repo_path)?;
    Ok(())
}

/// Snapshots the working copy if needed using jj-lib (no subprocess).
///
/// Runs [`jj_util_import_git_refs`] first, then snapshots the working copy (`snapshot_working_copy_tree`).
/// Aligns with [jj `util snapshot`](https://github.com/jj-vcs/jj/blob/main/cli/src/commands/util/snapshot.rs)
/// (`maybe_snapshot`).
///
/// Does not shell out to `jj util snapshot` so behavior is consistent when the CLI lacks that subcommand.
pub fn jj_util_snapshot(repo_path: &str) -> Result<(), JjError> {
    let mut loaded = load_workspace_repo(repo_path)?;
    import_colocated_git_state(&mut loaded, repo_path)?;
    let _ = snapshot_working_copy_tree(&mut loaded, repo_path)?;
    Ok(())
}

fn import_colocated_git_state(
    loaded: &mut LoadedWorkspaceRepo,
    repo_path: &str,
) -> Result<(), JjError> {
    import_git_head_if_needed(loaded, repo_path)?;

    let import_options = git::GitImportOptions {
        auto_local_bookmark: false,
        abandon_unreachable_commits: true,
        remote_auto_track_bookmarks: HashMap::new(),
    };
    let mut tx = loaded.repo.start_transaction();
    futures::executor::block_on(git::import_refs(tx.repo_mut(), &import_options)).map_err(
        |e| JjError::GitWorkspaceError(format!("git import_refs: {}", e)),
    )?;
    if tx.repo().has_changes() {
        loaded.repo = futures::executor::block_on(tx.commit("import git refs")).map_err(|e| {
            JjError::GitWorkspaceError(format!("Failed to commit git import_refs: {}", e))
        })?;
    }

    Ok(())
}

/// Checks out a branch in the repository using git
///
/// # Arguments
/// * `repo_path` - Path to the repository
/// * `branch_name` - Name of the branch to check out
///
/// # Returns
/// Returns Ok(()) on success, or a JjError on failure.
pub fn checkout_branch(repo_path: &str, branch_name: &str) -> Result<(), JjError> {
    let output = command_for("git")
        .current_dir(repo_path)
        .args(["checkout", branch_name])
        .output()
        .map_err(|e| JjError::IoError(format!("Failed to checkout branch: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(JjError::IoError(format!("git checkout failed: {}", stderr)));
    }

    Ok(())
}
