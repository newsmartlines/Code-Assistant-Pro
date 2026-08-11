use std::process::Command;

use crate::types::GitSummary;

fn run_git(root: &str, args: &[&str]) -> Result<(i32, String, String), String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|error| format!("Git is not available: {error}"))?;
    Ok((
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

pub fn git_status(root: &str) -> Result<GitSummary, String> {
    let (exit_code, raw_status, stderr) = run_git(
        root,
        &["status", "--short", "--branch", "--untracked-files=all"],
    )?;
    if exit_code != 0 {
        if stderr.contains("not a git repository") {
            return Ok(GitSummary {
                is_repository: false,
                branch: String::new(),
                changed_files: Vec::new(),
                staged_count: 0,
                unstaged_count: 0,
                raw_status: String::new(),
            });
        }
        return Err(stderr.trim().to_string());
    }
    let mut lines = raw_status.lines();
    let branch_line = lines.next().unwrap_or_default();
    let branch = branch_line
        .strip_prefix("## ")
        .unwrap_or(branch_line)
        .split("...")
        .next()
        .unwrap_or(branch_line)
        .to_string();
    let mut changed_files = Vec::new();
    let mut staged_count = 0;
    let mut unstaged_count = 0;
    for line in lines {
        if line.len() < 3 {
            continue;
        }
        let status = &line[..2];
        if status.as_bytes()[0] != b' ' {
            staged_count += 1;
        }
        if status.as_bytes()[1] != b' ' {
            unstaged_count += 1;
        }
        changed_files.push(line[3..].to_string());
    }
    Ok(GitSummary {
        is_repository: true,
        branch,
        changed_files,
        staged_count,
        unstaged_count,
        raw_status,
    })
}

pub fn git_diff(root: &str) -> Result<String, String> {
    let (exit_code, stdout, stderr) = run_git(root, &["diff", "--stat", "--no-color"])?;
    if exit_code != 0 {
        return Err(stderr.trim().to_string());
    }
    Ok(stdout)
}
