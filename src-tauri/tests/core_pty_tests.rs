mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use treq_lib::pty::PtyManager;

/// Helper: create a PtyManager and an output capture buffer.
fn setup() -> (PtyManager, Arc<Mutex<String>>) {
    let manager = PtyManager::new();
    let output = Arc::new(Mutex::new(String::new()));
    (manager, output)
}

/// Helper: build a callback that appends output to the shared buffer.
fn make_callback(output: &Arc<Mutex<String>>) -> Box<dyn Fn(String) + Send + 'static> {
    let output = Arc::clone(output);
    Box::new(move |data: String| {
        let mut buf = output.lock().unwrap();
        buf.push_str(&data);
    })
}

/// Helper: wait for output buffer to contain a substring (with timeout).
fn wait_for_output(output: &Arc<Mutex<String>>, needle: &str, timeout_ms: u64) -> bool {
    let start = std::time::Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    loop {
        {
            let buf = output.lock().unwrap();
            if buf.contains(needle) {
                return true;
            }
        }
        if start.elapsed() > timeout {
            return false;
        }
        thread::sleep(Duration::from_millis(50));
    }
}

#[test]
fn test_pty_manager_new() {
    let manager = PtyManager::new();
    assert!(!manager.session_exists("nonexistent-session"));
    assert!(!manager.session_exists(""));
    assert!(!manager.session_exists("abc-123"));
}

#[test]
fn test_create_session() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");
    let (manager, output) = setup();

    let result = manager.create_session(
        "test-create".to_string(),
        Some(repo.repo_path.clone()),
        None,
        None,
        make_callback(&output),
    );

    assert!(result.is_ok(), "create_session should succeed: {:?}", result);
    assert!(manager.session_exists("test-create"));

    // Cleanup
    let _ = manager.close_session("test-create");
}

#[test]
fn test_create_session_with_initial_command() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");
    let (manager, output) = setup();

    let result = manager.create_session(
        "test-initial-cmd".to_string(),
        Some(repo.repo_path.clone()),
        None,
        Some("echo HELLO_FROM_INIT".to_string()),
        make_callback(&output),
    );

    assert!(result.is_ok());

    // Wait for the initial command output
    let found = wait_for_output(&output, "HELLO_FROM_INIT", 5000);
    assert!(
        found,
        "Expected 'HELLO_FROM_INIT' in output, got: {}",
        output.lock().unwrap()
    );

    let _ = manager.close_session("test-initial-cmd");
}

#[test]
fn test_write_to_session() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");
    let (manager, output) = setup();

    manager
        .create_session(
            "test-write".to_string(),
            Some(repo.repo_path.clone()),
            None,
            None,
            make_callback(&output),
        )
        .expect("create_session should succeed");

    // Wait for shell prompt to appear
    thread::sleep(Duration::from_millis(500));

    // Write a command
    let result = manager.write_to_session("test-write", "echo WRITE_TEST_OK\n");
    assert!(result.is_ok(), "write_to_session should succeed: {:?}", result);

    let found = wait_for_output(&output, "WRITE_TEST_OK", 5000);
    assert!(
        found,
        "Expected 'WRITE_TEST_OK' in output, got: {}",
        output.lock().unwrap()
    );

    let _ = manager.close_session("test-write");
}

#[test]
fn test_write_to_nonexistent_session() {
    let manager = PtyManager::new();

    let result = manager.write_to_session("does-not-exist", "hello\n");
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), "Session not found");
}

#[test]
fn test_resize_session() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");
    let (manager, output) = setup();

    manager
        .create_session(
            "test-resize".to_string(),
            Some(repo.repo_path.clone()),
            None,
            None,
            make_callback(&output),
        )
        .expect("create_session should succeed");

    // Resize should succeed
    let result = manager.resize_session("test-resize", 48, 120);
    assert!(result.is_ok(), "resize_session should succeed: {:?}", result);

    // Resize to different dimensions should also succeed
    let result = manager.resize_session("test-resize", 24, 80);
    assert!(result.is_ok());

    let _ = manager.close_session("test-resize");
}

#[test]
fn test_resize_nonexistent_session() {
    let manager = PtyManager::new();

    let result = manager.resize_session("does-not-exist", 24, 80);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), "Session not found");
}

#[test]
fn test_close_session() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");
    let (manager, output) = setup();

    manager
        .create_session(
            "test-close".to_string(),
            Some(repo.repo_path.clone()),
            None,
            None,
            make_callback(&output),
        )
        .expect("create_session should succeed");

    assert!(manager.session_exists("test-close"));

    let result = manager.close_session("test-close");
    assert!(result.is_ok());
    assert!(!manager.session_exists("test-close"));

    // Closing again should still succeed (idempotent)
    let result = manager.close_session("test-close");
    assert!(result.is_ok());
}

#[test]
fn test_multiple_concurrent_sessions() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");
    let manager = PtyManager::new();

    let output_a = Arc::new(Mutex::new(String::new()));
    let output_b = Arc::new(Mutex::new(String::new()));
    let output_c = Arc::new(Mutex::new(String::new()));

    // Create 3 sessions
    manager
        .create_session(
            "multi-a".to_string(),
            Some(repo.repo_path.clone()),
            None,
            None,
            make_callback(&output_a),
        )
        .expect("create session A");

    manager
        .create_session(
            "multi-b".to_string(),
            Some(repo.repo_path.clone()),
            None,
            None,
            make_callback(&output_b),
        )
        .expect("create session B");

    manager
        .create_session(
            "multi-c".to_string(),
            Some(repo.repo_path.clone()),
            None,
            None,
            make_callback(&output_c),
        )
        .expect("create session C");

    assert!(manager.session_exists("multi-a"));
    assert!(manager.session_exists("multi-b"));
    assert!(manager.session_exists("multi-c"));

    // Wait for shells to be ready
    thread::sleep(Duration::from_millis(500));

    // Write unique commands to each session
    manager
        .write_to_session("multi-a", "echo SESSION_A_OUTPUT\n")
        .expect("write to A");
    manager
        .write_to_session("multi-b", "echo SESSION_B_OUTPUT\n")
        .expect("write to B");
    manager
        .write_to_session("multi-c", "echo SESSION_C_OUTPUT\n")
        .expect("write to C");

    // Verify each session got its output
    assert!(
        wait_for_output(&output_a, "SESSION_A_OUTPUT", 5000),
        "Session A output: {}",
        output_a.lock().unwrap()
    );
    assert!(
        wait_for_output(&output_b, "SESSION_B_OUTPUT", 5000),
        "Session B output: {}",
        output_b.lock().unwrap()
    );
    assert!(
        wait_for_output(&output_c, "SESSION_C_OUTPUT", 5000),
        "Session C output: {}",
        output_c.lock().unwrap()
    );

    // Cleanup
    let _ = manager.close_session("multi-a");
    let _ = manager.close_session("multi-b");
    let _ = manager.close_session("multi-c");
}

#[test]
fn test_session_isolation() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");
    let manager = PtyManager::new();

    let output_a = Arc::new(Mutex::new(String::new()));
    let output_b = Arc::new(Mutex::new(String::new()));

    manager
        .create_session(
            "iso-a".to_string(),
            Some(repo.repo_path.clone()),
            None,
            None,
            make_callback(&output_a),
        )
        .expect("create session A");

    manager
        .create_session(
            "iso-b".to_string(),
            Some(repo.repo_path.clone()),
            None,
            None,
            make_callback(&output_b),
        )
        .expect("create session B");

    // Wait for shells
    thread::sleep(Duration::from_millis(500));

    // Write a unique marker to session A only
    manager
        .write_to_session("iso-a", "echo UNIQUE_MARKER_ISOLATION_A\n")
        .expect("write to A");

    // Wait for A's output
    assert!(
        wait_for_output(&output_a, "UNIQUE_MARKER_ISOLATION_A", 5000),
        "Session A should have the marker"
    );

    // Give session B some time to receive any cross-contaminated output
    thread::sleep(Duration::from_millis(500));

    // Session B should NOT contain the marker from session A
    let b_output = output_b.lock().unwrap();
    assert!(
        !b_output.contains("UNIQUE_MARKER_ISOLATION_A"),
        "Session B should not contain session A's output, but got: {}",
        b_output
    );

    let _ = manager.close_session("iso-a");
    let _ = manager.close_session("iso-b");
}

#[test]
fn test_utf8_output() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");
    let (manager, output) = setup();

    manager
        .create_session(
            "test-utf8".to_string(),
            Some(repo.repo_path.clone()),
            None,
            None,
            make_callback(&output),
        )
        .expect("create_session should succeed");

    // Wait for shell
    thread::sleep(Duration::from_millis(500));

    // Test CJK characters
    manager
        .write_to_session("test-utf8", "echo '你好世界'\n")
        .expect("write CJK");
    assert!(
        wait_for_output(&output, "你好世界", 5000),
        "CJK output expected, got: {}",
        output.lock().unwrap()
    );

    // Test emoji
    manager
        .write_to_session("test-utf8", "echo '🎉🚀✨'\n")
        .expect("write emoji");
    assert!(
        wait_for_output(&output, "🎉🚀✨", 5000),
        "Emoji output expected, got: {}",
        output.lock().unwrap()
    );

    // Test mixed symbols
    manager
        .write_to_session("test-utf8", "echo '€£¥©®™'\n")
        .expect("write symbols");
    assert!(
        wait_for_output(&output, "€£¥©®™", 5000),
        "Symbol output expected, got: {}",
        output.lock().unwrap()
    );

    let _ = manager.close_session("test-utf8");
}
