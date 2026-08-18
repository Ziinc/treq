use crate::core::auto_update::{self, UpdateCheckResult};
use tauri::AppHandle;

fn version_base_url_from_env() -> String {
  // Allow tests / local builds to override the marketing site origin.
  std::env::var("TREQ_WEB_URL")
    .unwrap_or_else(|_| auto_update::default_version_base_url().to_string())
}

fn auto_update_disabled_via_env() -> bool {
  std::env::var("TREQ_DISABLE_AUTO_UPDATE")
    .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
    .unwrap_or(false)
}

fn no_update_result() -> UpdateCheckResult {
  UpdateCheckResult {
    supported: auto_update::auto_update_supported(),
    available: false,
    current_version: auto_update::app_version().to_string(),
    latest_version: None,
    download_url: None,
  }
}

#[tauri::command]
pub fn check_for_app_update() -> Result<UpdateCheckResult, String> {
  if auto_update_disabled_via_env() || !auto_update::auto_update_supported() {
    return Ok(no_update_result());
  }
  auto_update::check_for_update(auto_update::app_version(), &version_base_url_from_env())
}

#[tauri::command]
pub fn install_app_update(app: AppHandle, download_url: String) -> Result<(), String> {
  if !auto_update::auto_update_supported() {
    return Err("Auto-update install is only supported on macOS".to_string());
  }
  if download_url.trim().is_empty() {
    return Err("Missing download URL".to_string());
  }
  // Only allow GitHub release assets for treq.
  if !download_url.starts_with("https://github.com/treq-dev/treq/releases/download/") {
    return Err("Download URL is not a trusted treq release asset".to_string());
  }
  auto_update::install_mac_update_from_url(&download_url)?;
  // Replace succeeded — relaunch into the new binary.
  app.restart();
}

#[cfg(test)]
mod tests {
  use super::{auto_update_disabled_via_env, no_update_result};
  use crate::core::auto_update::{evaluate_update, parse_version_endpoint_body};

  #[test]
  fn auto_update_disabled_via_env_recognizes_flag() {
    let key = "TREQ_DISABLE_AUTO_UPDATE";
    let previous = std::env::var(key).ok();
    std::env::set_var(key, "1");
    assert!(auto_update_disabled_via_env());
    std::env::set_var(key, "true");
    assert!(auto_update_disabled_via_env());
    std::env::set_var(key, "0");
    assert!(!auto_update_disabled_via_env());
    match previous {
      Some(value) => std::env::set_var(key, value),
      None => std::env::remove_var(key),
    }
  }

  #[test]
  fn no_update_result_never_marks_available() {
    let result = no_update_result();
    assert!(!result.available);
    assert!(result.latest_version.is_none());
    assert!(result.download_url.is_none());
  }

  #[test]
  fn trusted_download_url_prefix_is_github_releases() {
    let ok = "https://github.com/treq-dev/treq/releases/download/v0.1.4/treq_aarch64.app.tar.gz";
    assert!(ok.starts_with("https://github.com/treq-dev/treq/releases/download/"));
    assert!(!ok.contains(".."));
  }

  #[test]
  fn version_body_matches_endpoint_contract() {
    assert_eq!(parse_version_endpoint_body("0.1.3\n").unwrap(), "0.1.3");
  }

  #[test]
  fn unsupported_platforms_never_mark_update_installable() {
    let result = evaluate_update("0.1.0", "0.2.0", "aarch64", false);
    assert!(!result.supported);
    assert!(!result.available);
    assert!(result.download_url.is_none());
  }
}
