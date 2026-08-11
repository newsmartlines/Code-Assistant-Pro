use serde::Serialize;

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
