use std::process::Command;

/// Detect which editors are available on the system
pub fn detect_available_editors() -> Result<Vec<String>, String> {
    let editors = vec!["cursor", "code", "code-insiders"];
    let mut available = Vec::new();

    let which_cmd = if cfg!(windows) { "where" } else { "which" };

    for editor in editors {
        let output = Command::new(which_cmd)
            .arg(editor)
            .output();

        if let Ok(output) = output {
            if output.status.success() {
                available.push(editor.to_string());
            }
        }
    }

    Ok(available)
}

/// Execute a shell command and return the output
pub fn execute_command(command: &str, working_dir: Option<String>) -> Result<String, String> {
    let shell = if cfg!(windows) {
        ("powershell.exe", vec!["-Command", command])
    } else {
        ("sh", vec!["-c", command])
    };

    let mut cmd = Command::new(shell.0);
    cmd.args(shell.1);
    
    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Launch an external application
pub fn launch_application(app_name: &str, path: &str) -> Result<(), String> {
    let command = match app_name.to_lowercase().as_str() {
        "cursor" => format!("cursor \"{}\"", path),
        "code" | "vscode" => format!("code \"{}\"", path),
        "code-insiders" => format!("code-insiders \"{}\"", path),
        "aider" => format!("cd \"{}\" && aider", path),
        _ => return Err(format!("Unknown application: {}", app_name)),
    };

    // Launch in background
    if cfg!(windows) {
        Command::new("powershell.exe")
            .args(["-Command", &format!("Start-Process -NoNewWindow {}", command)])
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        Command::new("sh")
            .args(["-c", &format!("{} &", command)])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

