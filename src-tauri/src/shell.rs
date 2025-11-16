use std::process::Command;

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

