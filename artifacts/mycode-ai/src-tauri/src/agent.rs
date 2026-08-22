use std::{
    env, fs,
    path::{Path, PathBuf},
};

use reqwest::blocking::Client;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    filesystem::{resolve_path, write_file},
    terminal::execute_terminal,
    types::{AgentDiff, AgentEdit, AgentPlan, AgentProviderStatus, AgentVerification},
};

const MAX_CONTEXT_FILES: usize = 80;
const MAX_FILE_BYTES: u64 = 80_000;
const MAX_PROMPT_CHARS: usize = 20_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAskInput {
    pub root: String,
    pub provider: String,
    pub prompt: String,
    #[serde(default)]
    pub feedback: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentApplyInput {
    pub root: String,
    pub plan: AgentPlan,
    #[serde(default)]
    pub permissions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentVerifyInput {
    pub root: String,
    #[serde(default)]
    pub working_directory: String,
    pub commands: Vec<String>,
}

fn provider_key(provider: &str) -> Option<(&'static str, &'static str)> {
    match provider {
        "anthropic" => Some(("ANTHROPIC_API_KEY", "claude-3-5-sonnet-latest")),
        "openai" => Some(("OPENAI_API_KEY", "gpt-4o-mini")),
        "gemini" => Some(("GEMINI_API_KEY", "gemini-3.6-flash")),
        "openrouter" => Some(("OPENROUTER_API_KEY", "openai/gpt-4o-mini")),
        _ => None,
    }
}

pub fn provider_status(provider: &str) -> AgentProviderStatus {
    let Some((env_name, model)) = provider_key(provider) else {
        return AgentProviderStatus {
            provider: provider.to_string(),
            model: String::new(),
            configured: false,
            message: "Choose a supported remote provider.".to_string(),
        };
    };
    let configured = env::var(env_name)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    AgentProviderStatus {
        provider: provider.to_string(),
        model: model.to_string(),
        configured,
        message: if configured {
            format!("{provider} is ready")
        } else {
            format!("Set {env_name} in the desktop environment")
        },
    }
}

fn collect_context(root: &Path) -> Result<Vec<(String, String)>, String> {
    let mut files = Vec::new();
    collect_context_inner(root, root, 0, &mut files)?;
    Ok(files)
}

fn collect_context_inner(
    root: &Path,
    directory: &Path,
    depth: usize,
    files: &mut Vec<(String, String)>,
) -> Result<(), String> {
    if depth > 10 || files.len() >= MAX_CONTEXT_FILES {
        return Ok(());
    }
    let mut entries = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        if files.len() >= MAX_CONTEXT_FILES {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if matches!(
            name.as_str(),
            "node_modules" | ".git" | "target" | "dist" | "build"
        ) {
            continue;
        }
        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.is_dir() {
            collect_context_inner(root, &path, depth + 1, files)?;
        } else if metadata.is_file() && metadata.len() <= MAX_FILE_BYTES && is_text_candidate(&path)
        {
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let relative = path
                .strip_prefix(root)
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            files.push((relative, content));
        }
    }
    Ok(())
}

fn is_text_candidate(path: &Path) -> bool {
    !matches!(
        path.extension().and_then(|value| value.to_str()),
        Some("png" | "jpg" | "jpeg" | "gif" | "ico" | "pdf" | "zip" | "exe" | "dll")
    )
}

fn build_prompt(input: &AgentAskInput, context: &[(String, String)]) -> String {
    let mut text = format!(
        r#"You are the coding agent inside MyCode AI. Return ONLY valid JSON, with no markdown.
Create a cautious, reviewable implementation plan for the user's request.
The response schema is:
{{
  "summary": "short summary",
  "steps": ["observable step"],
  "edits": [{{"path": "workspace-relative/path", "content": "complete new file content", "reason": "why"}}],
  "commands": ["safe verification command"]
}}
Rules:
- Read the supplied workspace context before proposing edits.
- Edits must be complete file contents, not patches or placeholders.
- Use workspace-relative paths only; never use .., absolute paths, secrets, or generated dependencies.
- Keep edits minimal and preserve the existing stack.
- Commands are verification only and should be a short allowlisted command such as `pnpm run typecheck`, `pnpm run build`, `cargo check`, or a focused test.
- If no edit is needed, return an empty edits array.

Provider: {}
User request:
{}"#,
        input.provider,
        input
            .prompt
            .chars()
            .take(MAX_PROMPT_CHARS)
            .collect::<String>()
    );
    if let Some(feedback) = &input.feedback {
        text.push_str("\n\nVerification feedback from the previous attempt:\n");
        text.push_str(&feedback.chars().take(12_000).collect::<String>());
        text.push_str("\nPropose only the additional corrections needed.");
    }
    text.push_str("\n\nWorkspace context:\n");
    for (path, content) in context {
        text.push_str(&format!("\n--- {path} ---\n{content}\n"));
    }
    text
}

fn provider_text(provider: &str, prompt: &str) -> Result<(String, String), String> {
    let Some((env_name, default_model)) = provider_key(provider) else {
        return Err(
            "Unsupported provider. Choose Anthropic, OpenAI, Gemini, or OpenRouter.".to_string(),
        );
    };
    let key = env::var(env_name)
        .map_err(|_| format!("Missing {env_name}. Add it to the desktop environment settings."))?;
    if key.trim().is_empty() {
        return Err(format!(
            "Missing {env_name}. Add it to the desktop environment settings."
        ));
    }
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|error| format!("Could not initialize provider client: {error}"))?;

    let (model, response) = match provider {
        "anthropic" => {
            let response = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01")
                .json(&json!({
                    "model": default_model,
                    "max_tokens": 12000,
                    "temperature": 0.1,
                    "system": "You are a precise software engineer. JSON only.",
                    "messages": [{"role": "user", "content": prompt}]
                }))
                .send()
                .map_err(|error| format!("Anthropic request failed: {error}"))?;
            (default_model, response)
        }
        "gemini" => {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{default_model}:generateContent?key={key}"
            );
            let response = client
                .post(url)
                .json(&json!({
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
                }))
                .send()
                .map_err(|error| format!("Gemini request failed: {error}"))?;
            (default_model, response)
        }
        "openai" | "openrouter" => {
            let url = if provider == "openrouter" {
                "https://openrouter.ai/api/v1/chat/completions"
            } else {
                "https://api.openai.com/v1/chat/completions"
            };
            let mut request = client
                .post(url)
                .bearer_auth(key)
                .json(&json!({
                    "model": default_model,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": "You are a precise software engineer. JSON only."},
                        {"role": "user", "content": prompt}
                    ]
                }));
            if provider == "openrouter" {
                request = request.header("HTTP-Referer", "https://mycode.ai");
            }
            let response = request
                .send()
                .map_err(|error| format!("OpenAI-compatible request failed: {error}"))?;
            (default_model, response)
        }
        _ => unreachable!(),
    };
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("Could not read provider response: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "Provider returned HTTP {}: {}",
            status.as_u16(),
            truncate(&body, 800)
        ));
    }
    let payload: Value = serde_json::from_str(&body)
        .map_err(|error| format!("Invalid provider response: {error}"))?;
    let text = match provider {
        "anthropic" => payload["content"][0]["text"].as_str().unwrap_or_default(),
        "gemini" => payload["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or_default(),
        _ => payload["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default(),
    };
    if text.trim().is_empty() {
        return Err("Provider returned an empty response.".to_string());
    }
    Ok((model.to_string(), text.to_string()))
}

fn parse_plan(provider: &str, model: &str, text: &str) -> Result<AgentPlan, String> {
    let cleaned = text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let start = cleaned
        .find('{')
        .ok_or_else(|| "Provider did not return a JSON plan.".to_string())?;
    let end = cleaned
        .rfind('}')
        .ok_or_else(|| "Provider returned an incomplete JSON plan.".to_string())?;
    let mut plan: AgentPlan = serde_json::from_str(&cleaned[start..=end])
        .map_err(|error| format!("Could not parse the provider plan: {error}"))?;
    plan.provider = provider.to_string();
    plan.model = model.to_string();
    for edit in &plan.edits {
        validate_relative_path(&edit.path)?;
        if edit.content.len() > 2_000_000 {
            return Err(format!("Edit is too large: {}", edit.path));
        }
    }
    for command in &plan.commands {
        validate_verification_command(command)?;
    }
    Ok(plan)
}

fn validate_relative_path(relative: &str) -> Result<(), String> {
    let path = Path::new(relative);
    if relative.trim().is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(format!("Unsafe workspace path: {relative}"));
    }
    Ok(())
}

fn validate_verification_command(command: &str) -> Result<(), String> {
    let trimmed = command.trim();
    if trimmed.is_empty() || trimmed.len() > 500 {
        return Err(
            "Verification commands must be non-empty and under 500 characters.".to_string(),
        );
    }
    if trimmed.contains([';', '&', '|', '>', '<', '`', '$']) {
        return Err(format!("Unsafe verification command: {command}"));
    }
    let program = trimmed.split_whitespace().next().unwrap_or_default();
    if !matches!(
        program,
        "pnpm"
            | "npm"
            | "yarn"
            | "bun"
            | "cargo"
            | "go"
            | "dotnet"
            | "python"
            | "python3"
            | "pytest"
            | "git"
    ) {
        return Err(format!(
            "Verification command is not allowlisted: {program}"
        ));
    }
    Ok(())
}

pub fn ask(input: AgentAskInput) -> Result<AgentPlan, String> {
    if input.prompt.trim().is_empty() {
        return Err("Describe what you want the agent to do.".to_string());
    }
    let root = PathBuf::from(&input.root);
    if !root.is_dir() {
        return Err("Selected workspace folder does not exist.".to_string());
    }
    let context = collect_context(&root)?;
    let prompt = build_prompt(&input, &context);
    let (model, response) = provider_text(&input.provider, &prompt)?;
    let mut plan = parse_plan(&input.provider, &model, &response)?;
    plan.context_files = context.iter().map(|(path, _)| path.clone()).collect();
    Ok(plan)
}

pub fn preview(root: &str, plan: &AgentPlan) -> Result<AgentDiff, String> {
    let mut text = String::new();
    let mut additions = 0;
    let mut removals = 0;
    for edit in &plan.edits {
        validate_relative_path(&edit.path)?;
        let path = resolve_path(root, &edit.path)?;
        let old = fs::read_to_string(&path).unwrap_or_default();
        let old_lines = old.lines().collect::<Vec<_>>();
        let new_lines = edit.content.lines().collect::<Vec<_>>();
        let (added, removed) = simple_diff_counts(&old_lines, &new_lines);
        additions += added;
        removals += removed;
        text.push_str(&format!("\n--- a/{}\n+++ b/{}\n", edit.path, edit.path));
        for line in old_lines.iter().take(120) {
            text.push_str(&format!("-{line}\n"));
        }
        for line in new_lines.iter().take(120) {
            text.push_str(&format!("+{line}\n"));
        }
        if old_lines.len() > 120 || new_lines.len() > 120 {
            text.push_str("… diff preview truncated …\n");
        }
    }
    Ok(AgentDiff {
        text: if text.is_empty() {
            "No file changes proposed.".to_string()
        } else {
            text
        },
        files: plan.edits.iter().map(|edit| edit.path.clone()).collect(),
        additions,
        removals,
    })
}

fn simple_diff_counts(old: &[&str], new: &[&str]) -> (usize, usize) {
    let shared = old.iter().zip(new.iter()).filter(|(a, b)| a == b).count();
    (
        new.len().saturating_sub(shared),
        old.len().saturating_sub(shared),
    )
}

pub fn apply(input: AgentApplyInput) -> Result<AgentDiff, String> {
    if !input
        .permissions
        .iter()
        .any(|permission| permission == "write-files")
    {
        return Err("The agent needs write-files permission before applying a plan.".to_string());
    }
    let diff = preview(&input.root, &input.plan)?;
    for edit in &input.plan.edits {
        let path = resolve_path(&input.root, &edit.path)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        write_file(&input.root, &edit.path, &edit.content)
            .or_else(|_| fs::write(&path, &edit.content).map_err(|error| error.to_string()))?;
    }
    Ok(diff)
}

pub fn verify(input: AgentVerifyInput) -> Result<Vec<AgentVerification>, String> {
    let working_directory = input.working_directory;
    let mut results = Vec::new();
    for command in input.commands {
        validate_verification_command(&command)?;
        let result = execute_terminal(&input.root, &working_directory, &command)?;
        let passed = result.exit_code == 0;
        results.push(AgentVerification {
            command,
            exit_code: result.exit_code,
            stdout: result.stdout,
            stderr: result.stderr,
            passed,
        });
        if !passed {
            break;
        }
    }
    Ok(results)
}

fn truncate(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

#[allow(dead_code)]
fn _keep_types_used(_: AgentEdit) {}
