use std::process::Command;

use crate::{filesystem::resolve_path, types::CommandResult};

pub fn execute_terminal(
    root: &str,
    working_directory: &str,
    command: &str,
) -> Result<CommandResult, String> {
    if command.trim().is_empty() {
        return Err("Enter a command to run".to_string());
    }
    let cwd = resolve_path(root, working_directory)?;
    if !cwd.is_dir() {
        return Err("Working directory does not exist".to_string());
    }

    let (program, args): (&str, Vec<&str>) = if cfg!(target_os = "windows") {
        ("cmd", vec!["/C", command])
    } else {
        ("sh", vec!["-lc", command])
    };
    let output = Command::new(program)
        .args(args)
        .current_dir(&cwd)
        .output()
        .map_err(|error| error.to_string())?;
    Ok(CommandResult {
        command: command.to_string(),
        working_directory: cwd.to_string_lossy().to_string(),
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}
