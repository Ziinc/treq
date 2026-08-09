#![deny(clippy::all)]

mod dispatch;
mod helpers;
mod state;

pub use helpers::*;
use napi_derive::napi;
use std::path::PathBuf;

/// Initialize the napi module state with an app-level SQLite database.
/// Must be called once before any `invoke_sync` calls that require DB access.
/// Safe to call multiple times (no-op after first call).
#[napi]
pub fn init_state(db_path: String) -> napi::Result<()> {
  state::init(PathBuf::from(db_path)).map_err(|e| napi::Error::from_reason(e))
}

/// Dispatch a Tauri command by name with camelCase JSON args.
/// Returns the serialized result or throws an error.
/// Wrap in Promise.resolve() on the JS side to match the Tauri invoke() API.
#[napi]
pub fn invoke_sync(command: String, args: serde_json::Value) -> napi::Result<serde_json::Value> {
  dispatch::dispatch(&command, args).map_err(|e| napi::Error::from_reason(e))
}

/// Information about a temporary test repository created by `create_test_repo`.
#[napi(object)]
pub struct TestRepoInfo {
  /// Absolute path to the repository root.
  pub repo_path: String,
  /// Absolute path to the temp directory (same as repo_path for simple repos).
  pub temp_dir_path: String,
  /// Default git branch name for the test repository.
  pub default_branch: String,
}
