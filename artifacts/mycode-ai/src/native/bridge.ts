import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import type {
  CommandResult,
  FileSnapshot,
  GitSummary,
  AgentApplyInput,
  AgentDiff,
  AgentPlan,
  AgentProviderStatus,
  AgentVerification,
  WorkspaceSnapshot,
} from './contracts';

export const isDesktopRuntime = () =>
  typeof window !== 'undefined' &&
  '__TAURI_INTERNALS__' in window;

export async function chooseWorkspaceFolder(): Promise<string | null> {
  if (!isDesktopRuntime()) return null;
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Open a local project folder',
  });
  return typeof selected === 'string' ? selected : null;
}

export async function loadWorkspace(root: string) {
  return invoke<WorkspaceSnapshot>('load_workspace_command', { root });
}

export async function readWorkspaceFile(root: string, relativePath: string) {
  return invoke<FileSnapshot>('read_file_command', {
    root,
    relativePath,
  });
}

export async function writeWorkspaceFile(
  root: string,
  relativePath: string,
  content: string,
) {
  return invoke<void>('write_file_command', {
    root,
    relativePath,
    content,
  });
}

export async function createWorkspaceEntry(
  root: string,
  parentPath: string,
  name: string,
  kind: 'file' | 'directory',
) {
  return invoke<WorkspaceSnapshot>('create_entry_command', {
    root,
    parentPath,
    name,
    kind,
  });
}

export async function renameWorkspaceEntry(
  root: string,
  relativePath: string,
  newName: string,
) {
  return invoke<WorkspaceSnapshot>('rename_entry_command', {
    root,
    relativePath,
    newName,
  });
}

export async function deleteWorkspaceEntry(root: string, relativePath: string) {
  return invoke<WorkspaceSnapshot>('delete_entry_command', {
    root,
    relativePath,
  });
}

export async function runWorkspaceCommand(
  root: string,
  workingDirectory: string,
  command: string,
) {
  return invoke<CommandResult>('execute_terminal_command', {
    root,
    workingDirectory,
    command,
  });
}

export async function getGitStatus(root: string) {
  return invoke<GitSummary>('git_status_command', { root });
}

export async function getGitDiff(root: string) {
  return invoke<string>('git_diff_command', { root });
}

export async function getAgentProviderStatus(provider: string) {
  return invoke<AgentProviderStatus>('agent_provider_status_command', { provider });
}

export async function askAgent(input: {
  root: string;
  provider: string;
  prompt: string;
  feedback?: string;
}) {
  return invoke<AgentPlan>('agent_ask_command', { input });
}

export async function previewAgentPlan(root: string, plan: AgentPlan) {
  return invoke<AgentDiff>('agent_preview_command', { root, plan });
}

export async function applyAgentPlan(input: AgentApplyInput) {
  return invoke<AgentDiff>('agent_apply_command', { input });
}

export async function verifyAgentPlan(input: {
  root: string;
  workingDirectory: string;
  commands: string[];
}) {
  return invoke<AgentVerification[]>('agent_verify_command', { input });
}