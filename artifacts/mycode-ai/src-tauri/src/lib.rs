#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent;
mod filesystem;
mod git;
mod terminal;
mod types;

use agent::{AgentApplyInput, AgentAskInput, AgentVerifyInput};
use filesystem::{create_entry, delete_entry, load_workspace, read_file, rename_entry, write_file};
use git::{git_diff, git_status};
use terminal::execute_terminal;
use types::{
    AgentDiff, AgentPlan, AgentProviderStatus, AgentVerification, CommandResult, FileSnapshot,
    GitSummary, NativeStatus, WorkspaceSnapshot,
};

#[tauri::command]
fn native_status() -> NativeStatus {
    NativeStatus {
        runtime: "tauri".to_string(),
        platform: std::env::consts::OS.to_string(),
    }
}

#[tauri::command]
fn load_workspace_command(root: String) -> Result<WorkspaceSnapshot, String> {
    load_workspace(&root)
}

#[tauri::command]
fn read_file_command(root: String, relative_path: String) -> Result<FileSnapshot, String> {
    read_file(&root, &relative_path)
}

#[tauri::command]
fn write_file_command(root: String, relative_path: String, content: String) -> Result<(), String> {
    write_file(&root, &relative_path, &content)
}

#[tauri::command]
fn create_entry_command(
    root: String,
    parent_path: String,
    name: String,
    kind: String,
) -> Result<WorkspaceSnapshot, String> {
    create_entry(&root, &parent_path, &name, &kind)?;
    load_workspace(&root)
}

#[tauri::command]
fn rename_entry_command(
    root: String,
    relative_path: String,
    new_name: String,
) -> Result<WorkspaceSnapshot, String> {
    rename_entry(&root, &relative_path, &new_name)?;
    load_workspace(&root)
}

#[tauri::command]
fn delete_entry_command(root: String, relative_path: String) -> Result<WorkspaceSnapshot, String> {
    delete_entry(&root, &relative_path)?;
    load_workspace(&root)
}

#[tauri::command]
fn execute_terminal_command(
    root: String,
    working_directory: String,
    command: String,
) -> Result<CommandResult, String> {
    execute_terminal(&root, &working_directory, &command)
}

#[tauri::command]
fn git_status_command(root: String) -> Result<GitSummary, String> {
    git_status(&root)
}

#[tauri::command]
fn git_diff_command(root: String) -> Result<String, String> {
    git_diff(&root)
}

#[tauri::command]
fn agent_provider_status_command(provider: String) -> AgentProviderStatus {
    agent::provider_status(&provider)
}

#[tauri::command]
fn agent_ask_command(input: AgentAskInput) -> Result<AgentPlan, String> {
    agent::ask(input)
}

#[tauri::command]
fn agent_preview_command(root: String, plan: AgentPlan) -> Result<AgentDiff, String> {
    agent::preview(&root, &plan)
}

#[tauri::command]
fn agent_apply_command(input: AgentApplyInput) -> Result<AgentDiff, String> {
    agent::apply(input)
}

#[tauri::command]
fn agent_verify_command(input: AgentVerifyInput) -> Result<Vec<AgentVerification>, String> {
    agent::verify(input)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            native_status,
            load_workspace_command,
            read_file_command,
            write_file_command,
            create_entry_command,
            rename_entry_command,
            delete_entry_command,
            execute_terminal_command,
            git_status_command,
            git_diff_command,
            agent_provider_status_command,
            agent_ask_command,
            agent_preview_command,
            agent_apply_command,
            agent_verify_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running MyCode AI");
}
