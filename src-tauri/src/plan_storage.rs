use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlanMetadata {
    pub id: String,
    pub title: String,
    pub plan_type: String,
    pub workspace_id: Option<i64>,
    pub workspace_path: Option<String>,
    pub branch_name: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlanFile {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub plan_type: String,
    pub raw_markdown: String,
    pub workspace_id: Option<i64>,
    pub workspace_path: Option<String>,
    pub branch_name: Option<String>,
    pub timestamp: String,
}

/// Get the .treq/plans directory path for a repository
fn get_plans_dir(repo_path: &str) -> PathBuf {
    Path::new(repo_path).join(".treq").join("plans")
}

/// Ensure the .treq/plans directory exists
fn ensure_plans_dir(repo_path: &str) -> Result<PathBuf, String> {
    let plans_dir = get_plans_dir(repo_path);
    fs::create_dir_all(&plans_dir)
        .map_err(|e| format!("Failed to create plans directory: {}", e))?;
    Ok(plans_dir)
}

/// Save a plan to a file in .treq/plans/
pub fn save_plan_to_file(
    repo_path: &str,
    plan_id: &str,
    content: &str,
    metadata: PlanMetadata,
) -> Result<(), String> {
    let plans_dir = ensure_plans_dir(repo_path)?;
    let plan_file_path = plans_dir.join(format!("plan_{}.json", plan_id));

    let plan_file = PlanFile {
        id: plan_id.to_string(),
        title: metadata.title,
        plan_type: metadata.plan_type,
        raw_markdown: content.to_string(),
        workspace_id: metadata.workspace_id,
        workspace_path: metadata.workspace_path,
        branch_name: metadata.branch_name,
        timestamp: metadata.timestamp,
    };

    let json_content = serde_json::to_string_pretty(&plan_file)
        .map_err(|e| format!("Failed to serialize plan: {}", e))?;

    fs::write(&plan_file_path, json_content)
        .map_err(|e| format!("Failed to write plan file: {}", e))?;

    Ok(())
}

/// Load all plans from .treq/plans/
pub fn load_plans_from_files(repo_path: &str) -> Result<Vec<PlanFile>, String> {
    let plans_dir = get_plans_dir(repo_path);

    // If directory doesn't exist, return empty vec
    if !plans_dir.exists() {
        return Ok(Vec::new());
    }

    let mut plans = Vec::new();

    let entries =
        fs::read_dir(&plans_dir).map_err(|e| format!("Failed to read plans directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Only process .json files that start with "plan_"
        if path.is_file() {
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.starts_with("plan_") && file_name.ends_with(".json") {
                    match fs::read_to_string(&path) {
                        Ok(content) => match serde_json::from_str::<PlanFile>(&content) {
                            Ok(plan) => plans.push(plan),
                            Err(e) => eprintln!("Failed to parse plan file {}: {}", file_name, e),
                        },
                        Err(e) => eprintln!("Failed to read plan file {}: {}", file_name, e),
                    }
                }
            }
        }
    }

    // Sort by timestamp (newest first)
    plans.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Ok(plans)
}

/// Get a specific plan file
pub fn get_plan_file(repo_path: &str, plan_id: &str) -> Result<PlanFile, String> {
    let plans_dir = get_plans_dir(repo_path);
    let plan_file_path = plans_dir.join(format!("plan_{}.json", plan_id));

    if !plan_file_path.exists() {
        return Err(format!("Plan file not found: {}", plan_id));
    }

    let content = fs::read_to_string(&plan_file_path)
        .map_err(|e| format!("Failed to read plan file: {}", e))?;

    let plan = serde_json::from_str::<PlanFile>(&content)
        .map_err(|e| format!("Failed to parse plan file: {}", e))?;

    Ok(plan)
}

/// Delete a plan file
pub fn delete_plan_file(repo_path: &str, plan_id: &str) -> Result<(), String> {
    let plans_dir = get_plans_dir(repo_path);
    let plan_file_path = plans_dir.join(format!("plan_{}.json", plan_id));

    if plan_file_path.exists() {
        fs::remove_file(&plan_file_path)
            .map_err(|e| format!("Failed to delete plan file: {}", e))?;
    }

    Ok(())
}
