use crate::core::remote::{self, RemoteReadiness, RemoteRepoProbe, RemoteRepository, SshHost};

#[tauri::command]
pub fn list_ssh_hosts() -> Result<Vec<SshHost>, String> {
  remote::list_configured_hosts()
}

#[tauri::command]
pub async fn check_ssh_host(host: String) -> Result<RemoteReadiness, String> {
  tauri::async_runtime::spawn_blocking(move || remote::check_readiness(&host))
    .await
    .map_err(|e| format!("Failed to join check_ssh_host task: {e}"))?
}

#[tauri::command]
pub async fn remote_probe_repo(host: String, path: String) -> Result<RemoteRepoProbe, String> {
  tauri::async_runtime::spawn_blocking(move || remote::probe_repo(&host, &path))
    .await
    .map_err(|e| format!("Failed to join remote_probe_repo task: {e}"))?
}

#[tauri::command]
pub async fn remote_clone_repo(
  host: String,
  repo_url: String,
  destination: String,
) -> Result<RemoteRepository, String> {
  tauri::async_runtime::spawn_blocking(move || remote::clone_repo(&host, &repo_url, &destination))
    .await
    .map_err(|e| format!("Failed to join remote_clone_repo task: {e}"))?
}

#[tauri::command]
pub fn remote_open_repo(host: String, path: String) -> Result<RemoteRepository, String> {
  remote::open_repo(&host, &path)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn remote_open_repo_rejects_unsafe_host_before_ssh() {
    let error = remote_open_repo("dev;rm".to_string(), "/srv/project".to_string())
      .expect_err("unsafe host should fail before SSH");

    assert_eq!(error, "SSH host must be a host alias from ssh config");
  }
}
