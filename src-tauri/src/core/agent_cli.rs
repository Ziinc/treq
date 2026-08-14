use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const FILE_PREFIX: &str = "treq-agent-";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCliFiles {
  pub prompt_path: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub settings_path: Option<String>,
}

/// Write the agent system prompt (and optional Claude settings JSON) to temp files.
pub fn write_agent_cli_files(
  prompt: &str,
  settings_json: Option<&str>,
) -> Result<AgentCliFiles, String> {
  let id = uuid::Uuid::new_v4();
  let dir = std::env::temp_dir();

  let prompt_path = dir.join(format!("{FILE_PREFIX}prompt-{id}.txt"));
  fs::write(&prompt_path, prompt).map_err(|e| format!("Failed to write agent prompt file: {e}"))?;

  let settings_path = match settings_json {
    Some(json) => {
      let path = dir.join(format!("{FILE_PREFIX}settings-{id}.json"));
      fs::write(&path, json).map_err(|e| format!("Failed to write agent settings file: {e}"))?;
      Some(path_to_string(&path))
    }
    None => None,
  };

  Ok(AgentCliFiles {
    prompt_path: path_to_string(&prompt_path),
    settings_path,
  })
}

/// Delete temp files previously created by [`write_agent_cli_files`].
/// Refuses paths that are not `treq-agent-*` files under the process temp dir.
pub fn cleanup_agent_cli_files(paths: &[String]) -> Result<(), String> {
  let temp_dir = std::env::temp_dir()
    .canonicalize()
    .map_err(|e| format!("Failed to resolve temp dir: {e}"))?;

  for path in paths {
    if path.is_empty() {
      continue;
    }
    let candidate = Path::new(path);
    let canonical = match candidate.canonicalize() {
      Ok(p) => p,
      Err(_) => continue,
    };
    if !is_safe_agent_cli_temp_file(&canonical, &temp_dir) {
      return Err(format!(
        "Refusing to delete path outside treq agent temp files: {path}"
      ));
    }
    let _ = fs::remove_file(&canonical);
  }
  Ok(())
}

fn is_safe_agent_cli_temp_file(canonical: &Path, temp_dir: &Path) -> bool {
  let file_name = canonical.file_name().and_then(|n| n.to_str()).unwrap_or("");
  canonical.starts_with(temp_dir) && file_name.starts_with(FILE_PREFIX)
}

fn path_to_string(path: &PathBuf) -> String {
  path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn writes_prompt_file_and_optional_settings() {
    let files = write_agent_cli_files("you are in a workspace", Some(r#"{"sandbox":{}}"#))
      .expect("write files");

    let prompt = fs::read_to_string(&files.prompt_path).expect("read prompt");
    assert_eq!(prompt, "you are in a workspace");
    assert!(Path::new(&files.prompt_path)
      .file_name()
      .unwrap()
      .to_str()
      .unwrap()
      .starts_with("treq-agent-prompt-"));

    let settings_path = files.settings_path.expect("settings path");
    let settings = fs::read_to_string(&settings_path).expect("read settings");
    assert_eq!(settings, r#"{"sandbox":{}}"#);
    assert!(Path::new(&settings_path)
      .file_name()
      .unwrap()
      .to_str()
      .unwrap()
      .starts_with("treq-agent-settings-"));

    cleanup_agent_cli_files(&[files.prompt_path, settings_path]).expect("cleanup");
  }

  #[test]
  fn omits_settings_file_when_not_requested() {
    let files = write_agent_cli_files("prompt only", None).expect("write");
    assert!(files.settings_path.is_none());
    assert!(Path::new(&files.prompt_path).exists());
    cleanup_agent_cli_files(&[files.prompt_path]).expect("cleanup");
  }

  #[test]
  fn cleanup_deletes_written_files() {
    let files = write_agent_cli_files("tmp", Some("{}")).expect("write");
    let settings_path = files.settings_path.clone().unwrap();
    cleanup_agent_cli_files(&[files.prompt_path.clone(), settings_path.clone()]).expect("cleanup");
    assert!(!Path::new(&files.prompt_path).exists());
    assert!(!Path::new(&settings_path).exists());
  }

  #[test]
  fn cleanup_refuses_paths_outside_temp_prefix() {
    let result = cleanup_agent_cli_files(&["/etc/passwd".to_string()]);
    assert!(result.is_err());
  }
}
