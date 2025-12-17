use crate::local_db;
use ignore::WalkBuilder;

#[derive(serde::Serialize)]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(serde::Serialize)]
pub struct CachedDirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub relative_path: String,
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirectoryEntry>, String> {
    use std::path::Path;

    let base_path = Path::new(&path);
    let mut files = Vec::new();

    // Use ignore::WalkBuilder to respect .gitignore patterns
    let walker = WalkBuilder::new(&path)
        .max_depth(Some(1)) // Only immediate children
        .hidden(false) // Show hidden files (except those in .gitignore)
        .git_ignore(true) // Respect .gitignore patterns
        .git_global(true) // Respect global gitignore
        .git_exclude(true) // Respect .git/info/exclude
        .parents(true) // Check parent directories for ignore files
        .build();

    for entry in walker {
        if let Ok(entry) = entry {
            let entry_path = entry.path();

            // Skip the base directory itself
            if entry_path == base_path {
                continue;
            }

            if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
                let is_dir = entry_path.is_dir();
                files.push(DirectoryEntry {
                    name: name.to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: is_dir,
                });
            }
        }
    }

    // Sort: directories first, then files
    files.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(files)
}

#[tauri::command]
pub fn list_directory_cached(
    repo_path: String,
    workspace_id: Option<i64>,
    parent_path: String,
) -> Result<Vec<CachedDirectoryEntry>, String> {
    use std::path::Path;

    // Try cache first
    if let Ok(cached) = local_db::get_cached_directory_listing(&repo_path, workspace_id, &parent_path) {
        if !cached.is_empty() {
            // Convert to CachedDirectoryEntry format
            let entries: Vec<CachedDirectoryEntry> = cached
                .into_iter()
                .map(|file| {
                    let name = Path::new(&file.file_path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(&file.relative_path)
                        .to_string();
                    CachedDirectoryEntry {
                        name,
                        path: file.file_path,
                        is_directory: file.is_directory,
                        relative_path: file.relative_path,
                    }
                })
                .collect();
            return Ok(entries);
        }
    }

    // Cache miss: fall back to live filesystem
    let live_entries = list_directory(parent_path.clone())?;

    // Convert live entries to cached format
    let entries: Vec<CachedDirectoryEntry> = live_entries
        .into_iter()
        .map(|entry| {
            // Compute relative path
            let base = Path::new(&parent_path);
            let full_path = Path::new(&entry.path);
            let relative = full_path
                .strip_prefix(base)
                .ok()
                .and_then(|p| p.to_str())
                .unwrap_or(&entry.name)
                .to_string();

            CachedDirectoryEntry {
                name: entry.name,
                path: entry.path,
                is_directory: entry.is_directory,
                relative_path: relative,
            }
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
pub fn get_change_indicators(workspace_path: String) -> Result<Vec<String>, String> {
    // Get directories with changes (includes all parent directories of changed files)
    let directories = crate::git_ops::get_directories_with_changes(&workspace_path)?;

    // Also get the actual changed file paths
    let files = crate::git_ops::get_changed_paths_set(&workspace_path)?;

    // Combine both into a single vector
    let mut all_paths: Vec<String> = directories.into_iter().collect();
    all_paths.extend(files.into_iter());

    Ok(all_paths)
}
