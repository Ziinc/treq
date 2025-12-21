use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

/// Process a chunk of bytes, handling incomplete UTF-8 sequences at boundaries.
///
/// - `pending`: mutable buffer containing incomplete bytes from the previous chunk
/// - `new_bytes`: the new bytes read from the PTY
///
/// Returns a valid UTF-8 String, potentially leaving trailing incomplete bytes in `pending`.
fn process_utf8_chunk(pending: &mut Vec<u8>, new_bytes: &[u8]) -> String {
    // Combine pending bytes with new bytes
    let mut combined = std::mem::take(pending);
    combined.extend_from_slice(new_bytes);

    match std::str::from_utf8(&combined) {
        Ok(valid_str) => {
            // All bytes are valid UTF-8
            valid_str.to_string()
        }
        Err(error) => {
            let valid_up_to = error.valid_up_to();

            // Check if this is an incomplete sequence at the end (not a real error)
            if error.error_len().is_none() {
                // Incomplete sequence at end - buffer the trailing bytes
                let (valid, trailing) = combined.split_at(valid_up_to);
                *pending = trailing.to_vec();

                // Return the valid portion (should always be valid UTF-8)
                String::from_utf8(valid.to_vec()).unwrap_or_default()
            } else {
                // Actual invalid UTF-8 byte(s) in the middle
                // This shouldn't happen with a proper terminal, but handle gracefully
                // Use lossy conversion and clear pending
                String::from_utf8_lossy(&combined).to_string()
            }
        }
    }
}

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    _child: Box<dyn Child + Send>,
}

impl PtySession {
    pub fn write(&mut self, data: &[u8]) -> std::io::Result<()> {
        self.writer.write_all(data)?;
        self.writer.flush()
    }

    pub fn resize(&mut self, rows: u16, cols: u16) -> std::io::Result<()> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
    }
}

pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        PtyManager {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_session(
        &self,
        session_id: String,
        working_dir: Option<String>,
        shell: Option<String>,
        initial_command: Option<String>,
        callback: Box<dyn Fn(String) + Send + 'static>,
    ) -> Result<(), String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let shell_cmd = shell.unwrap_or_else(|| {
            std::env::var("SHELL").unwrap_or_else(|_| {
                if cfg!(windows) {
                    "powershell.exe".to_string()
                } else {
                    "/bin/bash".to_string()
                }
            })
        });

        let mut cmd = CommandBuilder::new(&shell_cmd);
        if let Some(dir) = working_dir {
            cmd.cwd(dir);
        }
        cmd.env("TERM", "xterm-256color");

        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let master = pair.master;

        // Store session with master for resizing
        {
            let mut sessions = self.sessions.lock().unwrap();
            sessions.insert(
                session_id.clone(),
                PtySession {
                    writer,
                    master,
                    _child: child,
                },
            );
        }

        // Execute initial command if provided
        if let Some(cmd) = initial_command {
            // Wait a bit for shell to be ready
            thread::sleep(std::time::Duration::from_millis(100));
            let cmd_with_newline = format!("{}\n", cmd);
            self.write_to_session(&session_id, &cmd_with_newline)?;
        }

        // Spawn reader thread
        thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            let mut pending_bytes: Vec<u8> = Vec::with_capacity(4);

            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        // EOF: flush any pending bytes
                        if !pending_bytes.is_empty() {
                            let data = String::from_utf8_lossy(&pending_bytes).to_string();
                            if !data.is_empty() {
                                callback(data);
                            }
                        }
                        break;
                    }
                    Ok(n) => {
                        let data = process_utf8_chunk(&mut pending_bytes, &buffer[..n]);
                        if !data.is_empty() {
                            callback(data);
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(())
    }

    pub fn write_to_session(&self, session_id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(session_id) {
            session.write(data.as_bytes()).map_err(|e| e.to_string())
        } else {
            Err("Session not found".to_string())
        }
    }

    pub fn resize_session(&self, session_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(session_id) {
            session.resize(rows, cols).map_err(|e| e.to_string())
        } else {
            Err("Session not found".to_string())
        }
    }

    pub fn close_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.remove(session_id);
        Ok(())
    }

    pub fn session_exists(&self, session_id: &str) -> bool {
        let sessions = self.sessions.lock().unwrap();
        sessions.contains_key(session_id)
    }
}
