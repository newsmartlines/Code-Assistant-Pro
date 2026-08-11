/**
 * Native service boundaries for the future Tauri application.
 *
 * The browser foundation deliberately does not implement these capabilities.
 * Keeping the contracts here lets the UI graduate to local Windows services
 * without coupling the editor to a particular provider or command runner.
 */

export type WorkspacePath = string;

export type AgentState = 'not-connected' | 'ready' | 'working' | 'error';

export type AIProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'local';

export type AgentPermission =
  | 'read-files'
  | 'write-files'
  | 'delete-files'
  | 'run-commands'
  | 'use-git'
  | 'start-preview';

export interface AIProvider {
  id: AIProviderId;
  label: string;
  isConfigured(): Promise<boolean>;
  complete(request: AgentRequest): Promise<AgentResponse>;
}

export interface AgentRequest {
  prompt: string;
  workspace: WorkspacePath;
  context: WorkspaceFile[];
  permissions: AgentPermission[];
}

export interface AgentResponse {
  message: string;
  proposedTools: ToolCall[];
}

export interface AgentEngine {
  state: AgentState;
  ask(request: AgentRequest): Promise<AgentResponse>;
  cancel(): Promise<void>;
}

export interface Tool {
  name: string;
  description: string;
  requiredPermission: AgentPermission;
  run(input: unknown): Promise<unknown>;
}

export interface Workspace {
  root: WorkspacePath;
  open(): Promise<void>;
  close(): Promise<void>;
  status(): Promise<'sample' | 'local' | 'closed'>;
}

export interface ProjectIndexer {
  index(root: WorkspacePath): Promise<void>;
  search(root: WorkspacePath, query: string): Promise<WorkspaceMatch[]>;
}

export interface TerminalManager {
  start(root: WorkspacePath): Promise<string>;
  run(sessionId: string, command: string): Promise<TerminalResult>;
  stop(sessionId: string): Promise<void>;
}

export interface GitManager {
  status(root: WorkspacePath): Promise<GitStatus>;
  checkpoint(root: WorkspacePath, message: string): Promise<string>;
  rollback(root: WorkspacePath, checkpointId: string): Promise<void>;
}

export interface FileManager {
  read(path: WorkspacePath): Promise<string>;
  write(path: WorkspacePath, content: string): Promise<void>;
  remove(path: WorkspacePath): Promise<void>;
}

export interface PreviewManager {
  start(root: WorkspacePath): Promise<string>;
  stop(root: WorkspacePath): Promise<void>;
}

export interface PermissionManager {
  request(permission: AgentPermission, target: WorkspacePath): Promise<boolean>;
  revoke(permission: AgentPermission): Promise<void>;
}

export interface WorkspaceFile {
  path: WorkspacePath;
  content: string;
}

export interface WorkspaceMatch {
  path: WorkspacePath;
  line: number;
  preview: string;
}

export interface ToolCall {
  tool: string;
  input: unknown;
}

export interface TerminalResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GitStatus {
  branch: string;
  changedFiles: string[];
  ahead: number;
  behind: number;
}

export interface WorkspaceNode {
  name: string;
  relativePath: string;
  kind: 'file' | 'directory';
  size: number;
  modifiedMs: number;
  children?: WorkspaceNode[];
}

export interface WorkspaceSnapshot {
  root: string;
  name: string;
  nodes: WorkspaceNode[];
  fileCount: number;
  updatedMs: number;
}

export interface FileSnapshot {
  content: string;
  modifiedMs: number;
}

export interface CommandResult {
  command: string;
  workingDirectory: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GitSummary {
  isRepository: boolean;
  branch: string;
  changedFiles: string[];
  stagedCount: number;
  unstagedCount: number;
  rawStatus: string;
}