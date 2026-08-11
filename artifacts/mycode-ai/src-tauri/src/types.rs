use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct NativeStatus {
    pub runtime: String,
    pub platform: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNode {
    pub name: String,
    pub relative_path: String,
    pub kind: String,
    pub size: u64,
    pub modified_ms: u128,
    pub children: Option<Vec<WorkspaceNode>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub root: String,
    pub name: String,
    pub nodes: Vec<WorkspaceNode>,
    pub file_count: usize,
    pub updated_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSnapshot {
    pub content: String,
    pub modified_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub command: String,
    pub working_directory: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSummary {
    pub is_repository: bool,
    pub branch: String,
    pub changed_files: Vec<String>,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub raw_status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentEdit {
    pub path: String,
    pub content: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentPlan {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub model: String,
    pub summary: String,
    #[serde(default)]
    pub steps: Vec<String>,
    #[serde(default)]
    pub edits: Vec<AgentEdit>,
    #[serde(default)]
    pub commands: Vec<String>,
    #[serde(default)]
    pub context_files: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDiff {
    pub text: String,
    pub files: Vec<String>,
    pub additions: usize,
    pub removals: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderStatus {
    pub provider: String,
    pub model: String,
    pub configured: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentVerification {
    pub command: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub passed: bool,
}
