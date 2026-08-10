use crate::core;
use crate::AppState;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Instant;
use tauri::{AppHandle, Manager, State, Window};

#[tauri::command]
pub async fn init_repo(repo_path: String) -> Result<bool, String> {
  let started_at = Instant::now();
  let repo_path_for_task = repo_path.clone();
  let result = tauri::async_runtime::spawn_blocking(move || {
    core::init(&repo_path_for_task).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| format!("Failed to join init_repo task: {}", e))?;
  log::debug!(
    "init_repo(repo_path={}) completed in {:?}",
    repo_path,
    started_at.elapsed()
  );
  result
}

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, String> {
  let db = state.db.lock().unwrap();
  db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings_batch(
  state: State<AppState>,
  keys: Vec<String>,
) -> Result<HashMap<String, Option<String>>, String> {
  let db = state.db.lock().unwrap();
  db.get_settings_batch(&keys).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
  let db = state.db.lock().unwrap();
  db.set_setting(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_repo_setting(
  state: State<AppState>,
  repo_path: String,
  key: String,
) -> Result<Option<String>, String> {
  let db = state.db.lock().unwrap();
  db.get_repo_setting(&repo_path, &key)
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_repo_setting(
  state: State<AppState>,
  repo_path: String,
  key: String,
  value: String,
) -> Result<(), String> {
  let db = state.db.lock().unwrap();
  db.set_repo_setting(&repo_path, &key, &value)
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_window_repo_path(
  state: State<AppState>,
  window: Window,
  repo_path: String,
) -> Result<(), String> {
  allow_repository_assets(window.app_handle(), &repo_path)?;

  let mut map = state.window_repo_paths.lock().unwrap();
  map.insert(window.label().to_string(), repo_path);
  Ok(())
}

pub(crate) fn allow_repository_assets(app: &AppHandle, repo_path: &str) -> Result<(), String> {
  for asset_root in resolve_asset_roots(repo_path)? {
    app
      .asset_protocol_scope()
      .allow_directory(asset_root, true)
      .map_err(|error| format!("Failed to allow repository assets: {error}"))?;
  }
  Ok(())
}

fn resolve_asset_roots(repo_path: &str) -> Result<Vec<PathBuf>, String> {
  if repo_path.is_empty() {
    return Ok(Vec::new());
  }

  let path = PathBuf::from(repo_path);
  let canonical = path
    .canonicalize()
    .map_err(|error| format!("Failed to resolve working directory: {error}"))?;

  if !canonical.is_dir() {
    return Err("Working directory path is not a directory".to_string());
  }

  let mut roots = vec![canonical.clone()];
  if let Some(home_repo) = canonical
    .parent()
    .filter(|parent| parent.file_name().is_some_and(|name| name == "workspaces"))
    .and_then(|parent| parent.parent())
    .filter(|parent| parent.file_name().is_some_and(|name| name == ".treq"))
    .and_then(|parent| parent.parent())
  {
    roots.push(home_repo.to_path_buf());
  }

  Ok(roots)
}

#[tauri::command]
pub fn get_window_repo_path(
  state: State<AppState>,
  window: Window,
) -> Result<Option<String>, String> {
  let map = state.window_repo_paths.lock().unwrap();
  Ok(map.get(window.label()).cloned())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  #[test]
  fn resolves_asset_roots_for_home_repository() {
    let temp = TempDir::new().unwrap();
    fs::create_dir_all(temp.path().join(".generated")).unwrap();

    let roots = resolve_asset_roots(temp.path().to_str().unwrap()).unwrap();

    assert_eq!(roots, vec![temp.path().canonicalize().unwrap()]);
    assert!(roots[0].join(".generated").starts_with(&roots[0]));
  }

  #[test]
  fn resolves_asset_roots_for_working_directory_and_home_repository() {
    let temp = TempDir::new().unwrap();
    let workspace = temp.path().join(".treq/workspaces/feature");
    fs::create_dir_all(workspace.join(".screenshots")).unwrap();

    let roots = resolve_asset_roots(workspace.to_str().unwrap()).unwrap();

    assert_eq!(
      roots,
      vec![
        workspace.canonicalize().unwrap(),
        temp.path().canonicalize().unwrap(),
      ]
    );
  }

  #[test]
  fn returns_no_asset_roots_when_repository_is_cleared() {
    assert!(resolve_asset_roots("").unwrap().is_empty());
  }

  #[test]
  fn rejects_asset_root_when_working_directory_is_missing() {
    let temp = TempDir::new().unwrap();
    let missing = temp.path().join("missing");

    let error = resolve_asset_roots(missing.to_str().unwrap()).unwrap_err();

    assert!(error.contains("working directory"));
  }
}
