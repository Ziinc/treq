mod e2e_test_helpers;

use opentelemetry::KeyValue;
use opentelemetry_appender_tracing::layer::OpenTelemetryTracingBridge;
use opentelemetry_sdk::logs::{SdkLoggerProvider, SimpleLogProcessor};
use opentelemetry_sdk::Resource;
use serde_json::Value;
use std::time::Duration;
use e2e_test_helpers::TestRepo;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::Registry;
use treq_lib::telemetry::{cleanup_old_logs, forward_log_record, FileLogExporter};

/// Drive the real logging pipeline to produce a file on disk, then rewind its
/// mtime to simulate age — much closer to what we ship than `fs::write` of
/// arbitrary bytes.
fn emit_log_line_to(dir: &std::path::Path) -> std::path::PathBuf {
    let appender = tracing_appender::rolling::daily(dir, "treq");
    let (writer, worker_guard) = tracing_appender::non_blocking(appender);

    let exporter = FileLogExporter::new(writer);
    let resource = Resource::builder()
        .with_attributes(vec![KeyValue::new("service.name", "treq")])
        .build();
    let provider = SdkLoggerProvider::builder()
        .with_log_processor(SimpleLogProcessor::new(exporter))
        .with_resource(resource)
        .build();
    let layer = OpenTelemetryTracingBridge::new(&provider);
    let subscriber = Registry::default().with(layer);
    let dispatch_guard = tracing::subscriber::set_default(subscriber);

    forward_log_record(
        &log::Record::builder()
            .level(log::Level::Info)
            .target("seed")
            .args(format_args!("seed line"))
            .build(),
    );

    drop(dispatch_guard);
    drop(provider);
    drop(worker_guard);

    std::fs::read_dir(dir)
        .expect("readdir")
        .flatten()
        .find(|e| e.file_name().to_string_lossy().starts_with("treq."))
        .expect("rolling appender wrote a file")
        .path()
}

/// `cleanup_old_logs` is called on every app start; it must delete files
/// older than the threshold and leave fresher files untouched.
#[test]
fn cleanup_old_logs_deletes_only_files_older_than_threshold() {
    let dir = tempfile::tempdir().expect("tempdir");

    let old = emit_log_line_to(dir.path());
    // Rewind mtime so the file looks ancient compared to the cutoff below.
    TestRepo::set_file_modified_back(&old, Duration::from_secs(60 * 60)).expect("mtime old");

    // Move the just-written file aside so a second emission produces a distinct path, then restore it.
    let stash = dir.path().join("old.stash");
    TestRepo::rename_path(&old, &stash).expect("stash old");

    let fresh = emit_log_line_to(dir.path());
    let old_final = dir.path().join("old.log");
    TestRepo::rename_path(&stash, &old_final).expect("restore old");
    TestRepo::set_file_modified_back(&old_final, Duration::from_secs(60 * 60)).expect("mtime old");

    cleanup_old_logs(dir.path(), Duration::from_secs(60));

    assert!(
        !old_final.exists(),
        "file older than threshold should be deleted"
    );
    assert!(fresh.exists(), "file newer than threshold should be kept");
}

/// `cleanup_old_logs` must skip subdirectories and non-existent paths
/// without panicking.
#[test]
fn cleanup_old_logs_is_tolerant_of_subdirs_and_missing_dir() {
    let dir = tempfile::tempdir().expect("tempdir");

    let subdir = dir.path().join("subdir");
    TestRepo::ensure_dir(&subdir).expect("mkdir");

    let old = emit_log_line_to(dir.path());
    TestRepo::set_file_modified_back(&old, Duration::from_secs(60 * 60)).expect("mtime old");

    cleanup_old_logs(dir.path(), Duration::from_secs(60));

    assert!(!old.exists(), "regular file should be deleted");
    assert!(subdir.exists(), "subdir should be left alone");

    // Missing directory — must not panic.
    cleanup_old_logs(
        std::path::Path::new("/definitely/does/not/exist/treq-test"),
        Duration::from_secs(1),
    );
}

/// End-to-end: `forward_log_record` produces tracing events that flow through
/// the OTel pipeline and `FileLogExporter` writes them as one OTLP-shaped
/// JSON object per line, preserving severity, body, the original log target
/// (as `attributes.source`), and the service resource.
#[test]
fn forward_log_record_emits_otlp_json_per_level() {
    let dir = tempfile::tempdir().expect("tempdir");

    let appender = tracing_appender::rolling::daily(dir.path(), "treq");
    let (writer, worker_guard) = tracing_appender::non_blocking(appender);

    let exporter = FileLogExporter::new(writer);
    let resource = Resource::builder()
        .with_attributes(vec![KeyValue::new("service.name", "treq")])
        .build();
    let provider = SdkLoggerProvider::builder()
        .with_log_processor(SimpleLogProcessor::new(exporter))
        .with_resource(resource)
        .build();

    let layer = OpenTelemetryTracingBridge::new(&provider);
    let subscriber = Registry::default().with(layer);

    // Thread-local default — does not touch the global subscriber, so this
    // test plays nicely with the rest of the test binary.
    let dispatch_guard = tracing::subscriber::set_default(subscriber);

    forward_log_record(
        &log::Record::builder()
            .level(log::Level::Error)
            .target("test_source")
            .args(format_args!("message at ERROR"))
            .build(),
    );
    forward_log_record(
        &log::Record::builder()
            .level(log::Level::Warn)
            .target("test_source")
            .args(format_args!("message at WARN"))
            .build(),
    );
    forward_log_record(
        &log::Record::builder()
            .level(log::Level::Info)
            .target("test_source")
            .args(format_args!("message at INFO"))
            .build(),
    );
    forward_log_record(
        &log::Record::builder()
            .level(log::Level::Debug)
            .target("test_source")
            .args(format_args!("message at DEBUG"))
            .build(),
    );
    forward_log_record(
        &log::Record::builder()
            .level(log::Level::Trace)
            .target("test_source")
            .args(format_args!("message at TRACE"))
            .build(),
    );

    drop(dispatch_guard);
    drop(provider); // shut down processors
    drop(worker_guard); // flush non-blocking writer worker

    let log_file = std::fs::read_dir(dir.path())
        .expect("readdir")
        .flatten()
        .find(|e| e.file_name().to_string_lossy().starts_with("treq."))
        .expect("rolling appender wrote a file");

    let contents = std::fs::read_to_string(log_file.path()).expect("read log file");
    let lines: Vec<&str> = contents.lines().filter(|l| !l.is_empty()).collect();
    assert_eq!(
        lines.len(),
        5,
        "expected one JSON line per forwarded record, got: {contents}"
    );

    let expected_severities = ["ERROR", "WARN", "INFO", "DEBUG", "TRACE"];
    for (line, expected_severity) in lines.iter().zip(expected_severities) {
        let v: Value = serde_json::from_str(line)
            .unwrap_or_else(|e| panic!("invalid JSON line {line:?}: {e}"));

        let log_record = &v["resourceLogs"][0]["scopeLogs"][0]["logRecords"][0];
        assert_eq!(
            log_record["severityText"], expected_severity,
            "severityText should match log level"
        );

        let body = log_record["body"]["stringValue"]
            .as_str()
            .expect("body.stringValue string");
        assert!(
            body.starts_with("message at "),
            "body should contain forwarded message, got {body:?}"
        );

        let attrs = log_record["attributes"]
            .as_array()
            .expect("attributes array");
        let source = attrs
            .iter()
            .find(|kv| kv["key"].as_str() == Some("source"))
            .and_then(|kv| kv["value"]["stringValue"].as_str());
        assert_eq!(
            source,
            Some("test_source"),
            "original log target should be preserved as attributes.source"
        );

        let resource_attrs = v["resourceLogs"][0]["resource"]["attributes"]
            .as_array()
            .expect("resource.attributes array");
        let service_name = resource_attrs
            .iter()
            .find(|kv| kv["key"].as_str() == Some("service.name"))
            .and_then(|kv| kv["value"]["stringValue"].as_str());
        assert_eq!(
            service_name,
            Some("treq"),
            "service.name resource attribute should be present"
        );

        assert!(
            log_record["timeUnixNano"].is_string(),
            "timeUnixNano should be a string per OTLP JSON spec"
        );
    }
}
