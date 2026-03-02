use std::fs;
use std::process::Command;
use tempfile::TempDir;

fn setup_jj_repo(temp_dir: &TempDir) -> String {
    let path = temp_dir.path().to_str().unwrap().to_string();

    Command::new("jj")
        .args(["git", "init"])
        .current_dir(&path)
        .output()
        .expect("Failed to init jj repo");

    path
}

#[test]
fn test_get_jj_tracked_files_returns_all_files() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let repo_path = setup_jj_repo(&temp_dir);

    fs::write(temp_dir.path().join("file1.txt"), "content1").unwrap();
    fs::write(temp_dir.path().join("file2.txt"), "content2").unwrap();
    fs::create_dir(temp_dir.path().join("subdir")).unwrap();
    fs::write(temp_dir.path().join("subdir/file3.txt"), "content3").unwrap();

    Command::new("jj")
        .args(["status"])
        .current_dir(&repo_path)
        .output()
        .expect("Failed to run jj status");

    let files = treq_lib::file_indexer::get_jj_tracked_files(&repo_path).expect("Should get files");

    assert!(files.contains(&"file1.txt".to_string()));
    assert!(files.contains(&"file2.txt".to_string()));
    assert!(files.contains(&"subdir/file3.txt".to_string()));
}

#[test]
fn test_get_jj_tracked_files_includes_unchanged_committed_files() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let repo_path = setup_jj_repo(&temp_dir);

    fs::write(temp_dir.path().join("committed.txt"), "committed").unwrap();
    Command::new("jj")
        .args(["commit", "-m", "initial"])
        .current_dir(&repo_path)
        .output()
        .expect("Failed to commit");

    fs::write(temp_dir.path().join("changed.txt"), "changed").unwrap();

    let files = treq_lib::file_indexer::get_jj_tracked_files(&repo_path).expect("Should get files");

    assert!(
        files.contains(&"committed.txt".to_string()),
        "Should include committed file"
    );
    assert!(
        files.contains(&"changed.txt".to_string()),
        "Should include changed file"
    );
}
