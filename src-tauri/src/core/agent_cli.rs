use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

const FILE_PREFIX: &str = "treq-agent-";
const TREQ_SKILL_MD: &str = include_str!("../../resources/agent-skill/SKILL.md");
const TREQ_SKILL_PLUGIN_JSON: &str = include_str!("../../resources/agent-skill/plugin.json");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCliFiles {
  pub prompt_path: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub settings_path: Option<String>,
  pub skill_dir: String,
}

/// Write the agent system prompt, optional Claude settings, and bundled Treq skill pack.
pub fn write_agent_cli_files(
  prompt: &str,
  settings_json: Option<&str>,
) -> Result<AgentCliFiles, String> {
  let id = uuid::Uuid::new_v4();
  let dir = std::env::temp_dir();

  let skill_dir = write_treq_skill_pack(&dir, &id)?;

  let prompt_with_skill = format!(
    "{prompt} The bundled Treq skill file is at {}/skills/treq/SKILL.md.",
    skill_dir.to_string_lossy()
  );
  let prompt_path = dir.join(format!("{FILE_PREFIX}prompt-{id}.txt"));
  fs::write(&prompt_path, prompt_with_skill)
    .map_err(|e| format!("Failed to write agent prompt file: {e}"))?;

  let settings_path = match settings_json {
    Some(json) => {
      let merged = with_skill_dir_allow_read(json, &skill_dir)?;
      let path = dir.join(format!("{FILE_PREFIX}settings-{id}.json"));
      fs::write(&path, merged).map_err(|e| format!("Failed to write agent settings file: {e}"))?;
      Some(path_to_string(&path))
    }
    None => None,
  };

  Ok(AgentCliFiles {
    prompt_path: path_to_string(&prompt_path),
    settings_path,
    skill_dir: path_to_string(&skill_dir),
  })
}

/// Delete temp files previously created by [`write_agent_cli_files`].
/// Refuses paths that are not `treq-agent-*` files or dirs under the process temp dir.
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
    if !is_safe_agent_cli_temp_path(&canonical, &temp_dir) {
      return Err(format!(
        "Refusing to delete path outside treq agent temp files: {path}"
      ));
    }
    if canonical.is_dir() {
      let _ = fs::remove_dir_all(&canonical);
    } else {
      let _ = fs::remove_file(&canonical);
    }
  }
  Ok(())
}

fn write_treq_skill_pack(temp_dir: &Path, id: &uuid::Uuid) -> Result<PathBuf, String> {
  let skill_dir = temp_dir.join(format!("{FILE_PREFIX}skills-{id}"));
  let copies = [
    skill_dir.join("skills/treq/SKILL.md"),
    skill_dir.join(".claude/skills/treq/SKILL.md"),
    skill_dir.join(".agents/skills/treq/SKILL.md"),
    skill_dir.join(".cursor/skills/treq/SKILL.md"),
  ];
  for path in &copies {
    let parent = path
      .parent()
      .ok_or_else(|| "Invalid skill pack path".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("Failed to create skill pack dir: {e}"))?;
    fs::write(path, TREQ_SKILL_MD).map_err(|e| format!("Failed to write Treq skill: {e}"))?;
  }
  fs::write(skill_dir.join("plugin.json"), TREQ_SKILL_PLUGIN_JSON)
    .map_err(|e| format!("Failed to write Treq skill plugin manifest: {e}"))?;
  Ok(skill_dir)
}

fn with_skill_dir_allow_read(settings_json: &str, skill_dir: &Path) -> Result<String, String> {
  let mut value: Value = serde_json::from_str(settings_json)
    .map_err(|e| format!("Failed to parse agent settings JSON: {e}"))?;
  let allow_read = value
    .pointer_mut("/sandbox/filesystem/allowRead")
    .and_then(Value::as_array_mut);
  let skill_dir = skill_dir.to_string_lossy().into_owned();
  match allow_read {
    Some(paths) => {
      if !paths.iter().any(|p| p.as_str() == Some(skill_dir.as_str())) {
        paths.push(json!(skill_dir));
      }
    }
    None => {
      return Err("Agent settings JSON is missing sandbox.filesystem.allowRead".to_string());
    }
  }
  serde_json::to_string_pretty(&value).map_err(|e| format!("Failed to serialize settings: {e}"))
}

fn is_safe_agent_cli_temp_path(canonical: &Path, temp_dir: &Path) -> bool {
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
  fn writes_prompt_settings_and_skill_pack() {
    let files = write_agent_cli_files(
      "you are in a workspace",
      Some(r#"{"sandbox":{"filesystem":{"allowRead":["/ws"]}}}"#),
    )
    .expect("write files");

    let prompt = fs::read_to_string(&files.prompt_path).expect("read prompt");
    assert!(prompt.starts_with("you are in a workspace"));
    assert!(prompt.contains("/skills/treq/SKILL.md"));
    assert!(Path::new(&files.prompt_path)
      .file_name()
      .unwrap()
      .to_str()
      .unwrap()
      .starts_with("treq-agent-prompt-"));

    let settings_path = files.settings_path.expect("settings path");
    let settings = fs::read_to_string(&settings_path).expect("read settings");
    assert!(settings.contains(&files.skill_dir));
    assert!(settings.contains("/ws"));

    let skill_md = Path::new(&files.skill_dir).join("skills/treq/SKILL.md");
    let body = fs::read_to_string(skill_md).expect("read skill");
    assert!(body.contains("name: treq"));
    assert!(body.contains("treq send"));
    assert!(body.contains("treq commit"));
    assert!(body.contains("treq add"));
    assert!(Path::new(&files.skill_dir)
      .join(".claude/skills/treq/SKILL.md")
      .exists());
    assert!(Path::new(&files.skill_dir)
      .join(".agents/skills/treq/SKILL.md")
      .exists());
    assert!(Path::new(&files.skill_dir).join("plugin.json").exists());

    cleanup_agent_cli_files(&[files.prompt_path, settings_path, files.skill_dir]).expect("cleanup");
  }

  #[test]
  fn omits_settings_file_when_not_requested() {
    let files = write_agent_cli_files("prompt only", None).expect("write");
    assert!(files.settings_path.is_none());
    assert!(Path::new(&files.prompt_path).exists());
    assert!(Path::new(&files.skill_dir).is_dir());
    cleanup_agent_cli_files(&[files.prompt_path, files.skill_dir]).expect("cleanup");
  }

  #[test]
  fn cleanup_deletes_written_files_and_skill_dir() {
    let files = write_agent_cli_files(
      "tmp",
      Some(r#"{"sandbox":{"filesystem":{"allowRead":[]}}}"#),
    )
    .expect("write");
    let settings_path = files.settings_path.clone().unwrap();
    cleanup_agent_cli_files(&[
      files.prompt_path.clone(),
      settings_path.clone(),
      files.skill_dir.clone(),
    ])
    .expect("cleanup");
    assert!(!Path::new(&files.prompt_path).exists());
    assert!(!Path::new(&settings_path).exists());
    assert!(!Path::new(&files.skill_dir).exists());
  }

  #[test]
  fn cleanup_refuses_paths_outside_temp_prefix() {
    let result = cleanup_agent_cli_files(&["/etc/passwd".to_string()]);
    assert!(result.is_err());
  }

  #[test]
  fn with_skill_dir_allow_read_appends_skill_path() {
    let json = r#"{"sandbox":{"filesystem":{"allowRead":["/ws"],"allowWrite":["/ws"]}}}"#;
    let merged = with_skill_dir_allow_read(json, Path::new("/tmp/treq-agent-skills-1")).unwrap();
    let value: Value = serde_json::from_str(&merged).unwrap();
    let allow = value
      .pointer("/sandbox/filesystem/allowRead")
      .and_then(Value::as_array)
      .unwrap();
    assert_eq!(
      allow,
      &vec![json!("/ws"), json!("/tmp/treq-agent-skills-1")]
    );
  }
}
