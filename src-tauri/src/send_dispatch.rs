use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::agent_dispatch;

pub const SEND_KIND: &str = "send";
pub const MEDIA_IMAGE: &str = "image";
pub const MEDIA_TEXT: &str = "text";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SendDispatchRequest {
    pub kind: String,
    pub request_id: String,
    pub repo: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pty_session_id: Option<String>,
    pub media_type: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

impl SendDispatchRequest {
    pub fn new(
        request_id: impl Into<String>,
        repo: impl Into<String>,
        media_type: impl Into<String>,
        path: impl Into<String>,
    ) -> Self {
        Self {
            kind: SEND_KIND.to_string(),
            request_id: request_id.into(),
            repo: repo.into(),
            pty_session_id: None,
            media_type: media_type.into(),
            path: path.into(),
            title: None,
        }
    }
}

/// Detect whether a path should be previewed as an image or as text.
pub fn detect_media_type_from_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg") => MEDIA_IMAGE,
        _ => MEDIA_TEXT,
    }
}

/// Sniff common image magic bytes. Used for piped stdin without a filename.
pub fn detect_media_type_from_bytes(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n']) {
        return MEDIA_IMAGE;
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return MEDIA_IMAGE;
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return MEDIA_IMAGE;
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return MEDIA_IMAGE;
    }
    if bytes.starts_with(b"BM") {
        return MEDIA_IMAGE;
    }
    let trimmed = trim_utf8_bom(bytes);
    if trimmed.windows(4).any(|w| w.eq_ignore_ascii_case(b"<svg")) {
        return MEDIA_IMAGE;
    }
    MEDIA_TEXT
}

fn trim_utf8_bom(bytes: &[u8]) -> &[u8] {
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        &bytes[3..]
    } else {
        bytes
    }
}

pub fn extension_for_media_type(media_type: &str, bytes: &[u8]) -> &'static str {
    if media_type == MEDIA_IMAGE {
        if bytes.starts_with(&[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n']) {
            return "png";
        }
        if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            return "jpg";
        }
        if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            return "gif";
        }
        if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
            return "webp";
        }
        if bytes.starts_with(b"BM") {
            return "bmp";
        }
        let trimmed = trim_utf8_bom(bytes);
        if trimmed.windows(4).any(|w| w.eq_ignore_ascii_case(b"<svg")) {
            return "svg";
        }
        return "bin";
    }
    "txt"
}

/// Resolve a durable on-disk path for `treq send` payloads.
/// Piped stdin is written under `<repo>/.treq/send/`.
pub fn resolve_send_path(
    repo_path: &str,
    path_arg: Option<&str>,
    stdin: &mut dyn Read,
    is_stdin_tty: bool,
) -> Result<(PathBuf, &'static str, String), String> {
    let use_stdin = match path_arg {
        Some("-") => true,
        None => !is_stdin_tty,
        Some(_) => false,
    };

    if use_stdin {
        let mut bytes = Vec::new();
        stdin
            .read_to_end(&mut bytes)
            .map_err(|e| format!("failed to read stdin: {}", e))?;
        if bytes.is_empty() {
            return Err("stdin is empty; pass a file path or pipe content".to_string());
        }
        let media_type = detect_media_type_from_bytes(&bytes);
        let ext = extension_for_media_type(media_type, &bytes);
        let dir = send_staging_dir(repo_path)?;
        let filename = format!("send-{}.{}", uuid::Uuid::new_v4(), ext);
        let out_path = dir.join(&filename);
        std::fs::write(&out_path, &bytes)
            .map_err(|e| format!("failed to write staged send file: {}", e))?;
        return Ok((out_path, media_type, filename));
    }

    match path_arg {
        Some(path_str) => {
            let path = PathBuf::from(path_str);
            if !path.exists() {
                return Err(format!("file not found: {}", path_str));
            }
            if !path.is_file() {
                return Err(format!("not a file: {}", path_str));
            }
            let abs = std::fs::canonicalize(&path)
                .map_err(|e| format!("failed to resolve path '{}': {}", path_str, e))?;
            let media_type = detect_media_type_from_path(&abs);
            let title = abs
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.to_string());
            Ok((abs, media_type, title))
        }
        None => Err(
            "pass a file path, or pipe content via stdin (`echo hi | treq send` / `treq send -`)"
                .to_string(),
        ),
    }
}

pub fn send_staging_dir(repo_path: &str) -> Result<PathBuf, String> {
    let dir = Path::new(repo_path).join(".treq").join("send");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("failed to create send staging dir: {}", e))?;
    Ok(dir)
}

pub fn pty_session_id_from_env() -> Option<String> {
    std::env::var("TREQ_PTY_SESSION_ID")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub fn parse_ipc_payload(payload: &str) -> Result<IpcDispatchMessage, String> {
    let value: serde_json::Value =
        serde_json::from_str(payload.trim()).map_err(|e| format!("invalid request json: {}", e))?;
    match value.get("kind").and_then(|k| k.as_str()) {
        Some(SEND_KIND) => {
            let request: SendDispatchRequest = serde_json::from_value(value)
                .map_err(|e| format!("invalid send request json: {}", e))?;
            Ok(IpcDispatchMessage::Send(request))
        }
        _ => {
            let request: agent_dispatch::AgentDispatchRequest = serde_json::from_value(value)
                .map_err(|e| format!("invalid agent request json: {}", e))?;
            Ok(IpcDispatchMessage::Agent(request))
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IpcDispatchMessage {
    Agent(agent_dispatch::AgentDispatchRequest),
    Send(SendDispatchRequest),
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn detects_image_extensions() {
        assert_eq!(
            detect_media_type_from_path(Path::new("/tmp/shot.PNG")),
            MEDIA_IMAGE
        );
        assert_eq!(
            detect_media_type_from_path(Path::new("notes.md")),
            MEDIA_TEXT
        );
    }

    #[test]
    fn sniffs_png_magic_bytes() {
        let png = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 1, 2];
        assert_eq!(detect_media_type_from_bytes(&png), MEDIA_IMAGE);
        assert_eq!(extension_for_media_type(MEDIA_IMAGE, &png), "png");
    }

    #[test]
    fn sniffs_svg_markup_as_image() {
        let svg = b"<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"></svg>";
        assert_eq!(detect_media_type_from_bytes(svg), MEDIA_IMAGE);
        assert_eq!(extension_for_media_type(MEDIA_IMAGE, svg), "svg");
    }

    #[test]
    fn treats_plain_bytes_as_text() {
        assert_eq!(detect_media_type_from_bytes(b"hello world"), MEDIA_TEXT);
        assert_eq!(extension_for_media_type(MEDIA_TEXT, b"hello world"), "txt");
    }

    #[test]
    fn stages_stdin_text_under_repo_treq_send() {
        let temp = tempfile::TempDir::new().expect("temp");
        let repo = temp.path().to_string_lossy().to_string();
        let mut stdin = Cursor::new(b"preview me".to_vec());
        let (path, media, title) =
            resolve_send_path(&repo, Some("-"), &mut stdin, true).expect("resolve");
        assert_eq!(media, MEDIA_TEXT);
        assert!(path.starts_with(temp.path().join(".treq").join("send")));
        assert!(title.ends_with(".txt"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "preview me");
    }

    #[test]
    fn resolves_existing_file_path_without_copying() {
        let temp = tempfile::TempDir::new().expect("temp");
        let file = temp.path().join("photo.jpg");
        std::fs::write(&file, b"not-a-real-jpeg").expect("write");
        let mut empty = Cursor::new(Vec::new());
        let (path, media, title) = resolve_send_path(
            temp.path().to_str().unwrap(),
            Some(file.to_str().unwrap()),
            &mut empty,
            true,
        )
        .expect("resolve");
        assert_eq!(media, MEDIA_IMAGE);
        assert_eq!(title, "photo.jpg");
        assert_eq!(path, std::fs::canonicalize(&file).unwrap());
    }

    #[test]
    fn returns_error_for_missing_file() {
        let temp = tempfile::TempDir::new().expect("temp");
        let mut empty = Cursor::new(Vec::new());
        let err = resolve_send_path(
            temp.path().to_str().unwrap(),
            Some("/no/such/file.png"),
            &mut empty,
            true,
        )
        .expect_err("missing");
        assert!(err.contains("file not found"));
    }

    #[test]
    fn parse_ipc_distinguishes_send_from_agent() {
        let send = SendDispatchRequest::new("r1", "/repo", MEDIA_TEXT, "/repo/.treq/send/a.txt");
        let send_json = serde_json::to_string(&send).unwrap();
        match parse_ipc_payload(&send_json).unwrap() {
            IpcDispatchMessage::Send(req) => {
                assert_eq!(req.request_id, "r1");
                assert_eq!(req.media_type, MEDIA_TEXT);
            }
            other => panic!("expected send, got {:?}", other),
        }

        let agent = agent_dispatch::AgentDispatchRequest {
            request_id: "a1".into(),
            repo: "/repo".into(),
            branch: "main".into(),
            prompt: "hi".into(),
            mode: "plan".into(),
            agent: "claude".into(),
        };
        let agent_json = serde_json::to_string(&agent).unwrap();
        match parse_ipc_payload(&agent_json).unwrap() {
            IpcDispatchMessage::Agent(req) => assert_eq!(req.request_id, "a1"),
            other => panic!("expected agent, got {:?}", other),
        }
    }
}
