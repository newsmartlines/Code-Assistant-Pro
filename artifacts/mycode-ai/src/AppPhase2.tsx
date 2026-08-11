import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Code2,
  FileCode2,
  FileJson,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Info,
  LoaderCircle,
  MessageSquare,
  Minus,
  PanelLeft,
  PanelRight,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Trash2,
  X,
  Pencil,
  Zap,
} from 'lucide-react';

import {
  chooseWorkspaceFolder,
  applyAgentPlan,
  askAgent,
  createWorkspaceEntry,
  deleteWorkspaceEntry,
  getGitDiff,
  getGitStatus,
  getAgentProviderStatus,
  isDesktopRuntime,
  loadWorkspace,
  readWorkspaceFile,
  renameWorkspaceEntry,
  runWorkspaceCommand,
  previewAgentPlan,
  verifyAgentPlan,
  writeWorkspaceFile,
} from '@/native/bridge';
import { askBrowserAgent, getAgentStatus as getBrowserAgentStatus } from '@workspace/api-client-react';
import type { AgentMessage, AgentToolEvent } from '@workspace/api-client-react';
import type {
  CommandResult,
  AgentDiff,
  AgentPlan,
  AgentProviderStatus,
  AgentVerification,
  GitSummary,
  WorkspaceNode,
  WorkspaceSnapshot,
} from '@/native/contracts';

type FileKind = 'ts' | 'tsx' | 'json' | 'md' | 'text';
type ProjectFile = {
  path: string;
  name: string;
  kind: FileKind;
  content: string;
  modifiedMs?: number;
};
type BrowserAgentMessage = AgentMessage & { events?: AgentToolEvent[] };

const starterFiles: ProjectFile[] = [
  {
    path: 'src/app.tsx',
    name: 'app.tsx',
    kind: 'tsx',
    content: `import { createWorkspace } from "./workspace";
import { loadSettings } from "./lib/settings";

const settings = loadSettings();
const workspace = createWorkspace({
  root: settings.root,
  provider: settings.provider,
});

workspace.on("ready", () => {
  console.info("MyCode workspace ready");
});

export default workspace;`,
  },
  {
    path: 'src/core/agent.ts',
    name: 'agent.ts',
    kind: 'ts',
    content: `export type AgentState =
  | "not-connected"
  | "ready"
  | "working";

export interface AgentEngine {
  state: AgentState;
  ask(prompt: string): Promise<never>;
}

// The native agent service will attach in the next phase.
export const agent: AgentEngine = {
  state: "not-connected",
  ask: async () => {
    throw new Error("Agent engine is not connected");
  },
};`,
  },
  {
    path: 'src/lib/settings.ts',
    name: 'settings.ts',
    kind: 'ts',
    content: `export type Provider = "anthropic" | "openai" | "gemini";

export const defaults = {
  root: "~/Projects/mycode-lab",
  provider: "anthropic" as Provider,
  model: "claude-sonnet-4",
  telemetry: false,
};`,
  },
  {
    path: 'src/workspace.ts',
    name: 'workspace.ts',
    kind: 'ts',
    content: `type WorkspaceOptions = {
  root: string;
  provider: string;
};

export function createWorkspace(options: WorkspaceOptions) {
  return {
    ...options,
    on(event: "ready", callback: () => void) {
      if (event === "ready") callback();
    },
  };
}`,
  },
  {
    path: 'package.json',
    name: 'package.json',
    kind: 'json',
    content: `{
  "name": "mycode-lab",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "typescript": "^5.6.3",
    "vite": "^6.0.0"
  }
}`,
  },
  {
    path: 'README.md',
    name: 'README.md',
    kind: 'md',
    content: `# MyCode Lab

A local workspace for testing the MyCode AI desktop foundation.

Phase 2 connects the explorer, editor, terminal, and Git surfaces to the
native Tauri shell. The AI agent remains intentionally disconnected.`,
  },
];

const sampleNodes: WorkspaceNode[] = [
  {
    name: 'src',
    relativePath: 'src',
    kind: 'directory',
    size: 0,
    modifiedMs: 0,
    children: [
      {
        name: 'core',
        relativePath: 'src/core',
        kind: 'directory',
        size: 0,
        modifiedMs: 0,
        children: [
          {
            name: 'agent.ts',
            relativePath: 'src/core/agent.ts',
            kind: 'file',
            size: 0,
            modifiedMs: 0,
          },
        ],
      },
      {
        name: 'lib',
        relativePath: 'src/lib',
        kind: 'directory',
        size: 0,
        modifiedMs: 0,
        children: [
          {
            name: 'settings.ts',
            relativePath: 'src/lib/settings.ts',
            kind: 'file',
            size: 0,
            modifiedMs: 0,
          },
        ],
      },
      {
        name: 'app.tsx',
        relativePath: 'src/app.tsx',
        kind: 'file',
        size: 0,
        modifiedMs: 0,
      },
      {
        name: 'workspace.ts',
        relativePath: 'src/workspace.ts',
        kind: 'file',
        size: 0,
        modifiedMs: 0,
      },
    ],
  },
  {
    name: 'package.json',
    relativePath: 'package.json',
    kind: 'file',
    size: 0,
    modifiedMs: 0,
  },
  {
    name: 'README.md',
    relativePath: 'README.md',
    kind: 'file',
    size: 0,
    modifiedMs: 0,
  },
];

const emptyFile: ProjectFile = {
  path: '',
  name: 'No file selected',
  kind: 'text',
  content: '// Open a file from the explorer to start editing.',
};

function kindForPath(path: string): FileKind {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'md';
  return 'text';
}

function iconFor(kind: FileKind, size = 15) {
  if (kind === 'json') return <FileJson size={size} strokeWidth={1.7} color="#f1ad74" />;
  if (kind === 'md') return <FileText size={size} strokeWidth={1.7} color="#9aa4a5" />;
  if (kind === 'text') return <FileText size={size} strokeWidth={1.7} color="#9aa4a5" />;
  return <FileCode2 size={size} strokeWidth={1.7} color={kind === 'tsx' ? '#79d4cf' : '#d5f36a'} />;
}

function parentPath(path: string) {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function flattenFiles(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) => [
    ...(node.kind === 'file' ? [node] : []),
    ...(node.children ? flattenFiles(node.children) : []),
  ]);
}

function findNode(nodes: WorkspaceNode[], path: string): WorkspaceNode | undefined {
  for (const node of nodes) {
    if (node.relativePath === path) return node;
    if (node.children) {
      const match = findNode(node.children, path);
      if (match) return match;
    }
  }
  return undefined;
}

function AppPhase2() {
  const desktop = isDesktopRuntime();
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('mycode-lab');
  const [tree, setTree] = useState<WorkspaceNode[]>(sampleNodes);
  const [fileCount, setFileCount] = useState(starterFiles.length);
  const [files, setFiles] = useState<ProjectFile[]>(starterFiles);
  const [activePath, setActivePath] = useState('src/app.tsx');
  const [openPaths, setOpenPaths] = useState(['src/app.tsx', 'src/core/agent.ts', 'src/lib/settings.ts']);
  const [dirtyPaths, setDirtyPaths] = useState<string[]>([]);
  const [externalPaths, setExternalPaths] = useState<string[]>([]);
  const [modifiedAt, setModifiedAt] = useState<Record<string, number>>({});
  const [expandedPaths, setExpandedPaths] = useState<string[]>(['src', 'src/core', 'src/lib']);
  const [selectedPath, setSelectedPath] = useState<string | null>('src/app.tsx');
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [agentOpen, setAgentOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [provider, setProvider] = useState('anthropic');
  const [telemetry, setTelemetry] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [minimap, setMinimap] = useState(true);
  const [terminalCommand, setTerminalCommand] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [git, setGit] = useState<GitSummary>({
    isRepository: false,
    branch: 'main',
    changedFiles: [],
    stagedCount: 0,
    unstagedCount: 0,
    rawStatus: '',
  });
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentProviderStatus | null>(null);
  const [agentPlan, setAgentPlan] = useState<AgentPlan | null>(null);
  const [agentDiff, setAgentDiff] = useState<AgentDiff | null>(null);
  const [agentVerifications, setAgentVerifications] = useState<AgentVerification[]>([]);
  const [agentFeedback, setAgentFeedback] = useState('');
  const [browserMessages, setBrowserMessages] = useState<BrowserAgentMessage[]>(() => {
    try {
      const saved = window.sessionStorage.getItem('mycode-ai-agent-history');
      return saved ? JSON.parse(saved) as BrowserAgentMessage[] : [];
    } catch {
      return [];
    }
  });
  const browserAbortRef = useRef<AbortController | null>(null);

  const activeFile = files.find((file) => file.path === activePath) ?? files[0] ?? emptyFile;
  const lineCount = useMemo(
    () => Math.max(1, activeFile.content.split('\n').length),
    [activeFile.content],
  );
  const openFiles = openPaths
    .map((path) => files.find((file) => file.path === path))
    .filter(Boolean) as ProjectFile[];
  const activeDirty = dirtyPaths.includes(activePath);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 4200);
  }, []);

  const applySnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    setTree(snapshot.nodes);
    setFileCount(snapshot.fileCount);
    setWorkspaceName(snapshot.name);
  }, []);

  const refreshGit = useCallback(async (root: string) => {
    if (!desktop) return;
    try {
      setGit(await getGitStatus(root));
    } catch {
      showNotice('Git is not available for this workspace.');
    }
  }, [desktop, showNotice]);

  const refreshWorkspace = useCallback(async (root: string) => {
    try {
      const snapshot = await loadWorkspace(root);
      applySnapshot(snapshot);
      await refreshGit(root);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not load this folder.');
    }
  }, [applySnapshot, refreshGit, showNotice]);

  const openFolder = useCallback(async () => {
    if (!desktop) {
      showNotice('Open Folder is available when MyCode AI is running as the Windows desktop app.');
      return;
    }
    try {
      const root = await chooseWorkspaceFolder();
      if (!root) return;
      setWorkspaceRoot(root);
      setSelectedPath(null);
      setOpenPaths([]);
      setFiles([]);
      setDirtyPaths([]);
      setExternalPaths([]);
      await refreshWorkspace(root);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not open that folder.');
    }
  }, [desktop, refreshWorkspace, showNotice]);

  useEffect(() => {
    if (!workspaceRoot || !desktop) return;
    void refreshWorkspace(workspaceRoot);
  }, [desktop, refreshWorkspace, workspaceRoot]);

  useEffect(() => {
    if (!workspaceRoot || !desktop || !activeFile) return;
    const timer = window.setInterval(async () => {
      try {
        const snapshot = await readWorkspaceFile(workspaceRoot, activeFile.path);
        const previousModified = modifiedAt[activeFile.path];
        if (previousModified && snapshot.modifiedMs <= previousModified) return;
        setModifiedAt((current) => ({ ...current, [activeFile.path]: snapshot.modifiedMs }));
        if (snapshot.content === activeFile.content) return;
        if (dirtyPaths.includes(activeFile.path)) {
          setExternalPaths((current) => current.includes(activeFile.path) ? current : [...current, activeFile.path]);
          return;
        }
        setFiles((current) => current.map((file) => file.path === activeFile.path ? { ...file, content: snapshot.content, modifiedMs: snapshot.modifiedMs } : file));
        showNotice(`${activeFile.name} changed on disk and was reloaded.`);
      } catch {
        // The tree refresh will surface deleted or inaccessible files.
      }
    }, 2200);
    return () => window.clearInterval(timer);
  }, [activeFile, desktop, dirtyPaths, modifiedAt, showNotice, workspaceRoot]);

  useEffect(() => {
    const statusRequest = desktop
      ? getAgentProviderStatus(provider)
      : getBrowserAgentStatus({ provider: provider as 'anthropic' | 'openai' | 'gemini' | 'openrouter' });
    void statusRequest
      .then(setAgentStatus)
      .catch(() => setAgentStatus(null));
  }, [desktop, provider]);

  useEffect(() => {
    window.sessionStorage.setItem('mycode-ai-agent-history', JSON.stringify(browserMessages));
  }, [browserMessages]);

  const selectNode = async (node: WorkspaceNode) => {
    setSelectedPath(node.relativePath);
    if (node.kind === 'directory') {
      setExpandedPaths((current) => current.includes(node.relativePath)
        ? current.filter((path) => path !== node.relativePath)
        : [...current, node.relativePath]);
      return;
    }
    setActivePath(node.relativePath);
    setOpenPaths((current) => current.includes(node.relativePath) ? current : [...current, node.relativePath]);
    if (!workspaceRoot || !desktop) return;
    try {
      const snapshot = await readWorkspaceFile(workspaceRoot, node.relativePath);
      setFiles((current) => {
        const next = current.filter((file) => file.path !== node.relativePath);
        return [...next, {
          path: node.relativePath,
          name: node.name,
          kind: kindForPath(node.relativePath),
          content: snapshot.content,
          modifiedMs: snapshot.modifiedMs,
        }];
      });
      setModifiedAt((current) => ({ ...current, [node.relativePath]: snapshot.modifiedMs }));
      setDirtyPaths((current) => current.filter((path) => path !== node.relativePath));
      setExternalPaths((current) => current.filter((path) => path !== node.relativePath));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : `Could not open ${node.name}.`);
    }
  };

  const closeTab = (path: string) => {
    const next = openPaths.filter((openPath) => openPath !== path);
    setOpenPaths(next);
    if (activePath === path && next.length) setActivePath(next[next.length - 1]);
  };

  const updateContent = (content: string) => {
    setFiles((current) => current.map((file) => file.path === activePath ? { ...file, content } : file));
    setDirtyPaths((current) => current.includes(activePath) ? current : [...current, activePath]);
  };

  const saveFile = useCallback(async (path = activePath) => {
    const file = files.find((item) => item.path === path);
    if (!file || !dirtyPaths.includes(path)) return;
    if (!workspaceRoot || !desktop) {
      setDirtyPaths((current) => current.filter((item) => item !== path));
      showNotice(`${file.name} saved in the local preview.`);
      return;
    }
    try {
      await writeWorkspaceFile(workspaceRoot, path, file.content);
      setDirtyPaths((current) => current.filter((item) => item !== path));
      setExternalPaths((current) => current.filter((item) => item !== path));
      setModifiedAt((current) => ({ ...current, [path]: Date.now() }));
      await refreshGit(workspaceRoot);
      showNotice(`${file.name} saved to disk.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : `Could not save ${file.name}.`);
    }
  }, [activePath, desktop, dirtyPaths, files, refreshGit, showNotice, workspaceRoot]);

  useEffect(() => {
    const handleSave = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener('keydown', handleSave);
    return () => window.removeEventListener('keydown', handleSave);
  }, [saveFile]);

  const createEntry = async (kind: 'file' | 'directory') => {
    if (!workspaceRoot || !desktop) {
      showNotice('Create is available when a local folder is open in the desktop app.');
      return;
    }
    const selectedNode = selectedPath
      ? findNode(tree, selectedPath)
      : undefined;
    const parent = selectedNode?.kind === 'directory'
      ? selectedNode.relativePath
      : parentPath(selectedPath ?? '');
    const name = window.prompt(kind === 'file' ? 'New file name' : 'New folder name');
    if (!name) return;
    try {
      const snapshot = await createWorkspaceEntry(workspaceRoot, parent, name, kind);
      applySnapshot(snapshot);
      showNotice(`${name} created.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : `Could not create ${name}.`);
    }
  };

  const renameSelected = async () => {
    if (!workspaceRoot || !desktop || !selectedPath) {
      showNotice('Select a local file or folder to rename.');
      return;
    }
    const currentName = selectedPath.split('/').pop() ?? selectedPath;
    const name = window.prompt('Rename item', currentName);
    if (!name || name === currentName) return;
    try {
      const snapshot = await renameWorkspaceEntry(workspaceRoot, selectedPath, name);
      applySnapshot(snapshot);
      const nextPath = `${parentPath(selectedPath)}/${name}`.replace(/^\//, '');
      setSelectedPath(nextPath);
      if (activePath === selectedPath) {
        setActivePath(nextPath);
        setOpenPaths((current) => current.map((path) => path === selectedPath ? nextPath : path));
      }
      showNotice(`${currentName} renamed to ${name}.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : `Could not rename ${currentName}.`);
    }
  };

  const deleteSelected = async () => {
    if (!workspaceRoot || !desktop || !selectedPath) {
      showNotice('Select a local file or folder to delete.');
      return;
    }
    const name = selectedPath.split('/').pop() ?? selectedPath;
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      const snapshot = await deleteWorkspaceEntry(workspaceRoot, selectedPath);
      applySnapshot(snapshot);
      setOpenPaths((current) => current.filter((path) => path !== selectedPath && !path.startsWith(`${selectedPath}/`)));
      if (activePath === selectedPath || activePath.startsWith(`${selectedPath}/`)) {
        const fallback = starterFiles[0].path;
        setActivePath(fallback);
      }
      setSelectedPath(null);
      showNotice(`${name} deleted.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : `Could not delete ${name}.`);
    }
  };

  const executeCommand = async (command = terminalCommand) => {
    if (!command.trim()) return;
    setTerminalCommand('');
    setTerminalLines((current) => [...current, `> ${command}`]);
    if (!workspaceRoot || !desktop) {
      setTerminalLines((current) => [...current, 'Terminal is available in the Windows desktop app.']);
      return;
    }
    setTerminalBusy(true);
    try {
      const result = await runWorkspaceCommand(workspaceRoot, workingDirectory, command);
      appendCommandResult(result);
      await refreshGit(workspaceRoot);
    } catch (error) {
      setTerminalLines((current) => [...current, error instanceof Error ? error.message : 'Command failed.']);
    } finally {
      setTerminalBusy(false);
    }
  };

  const appendCommandResult = (result: CommandResult) => {
    const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n');
    setTerminalLines((current) => [...current, output || `Exited with code ${result.exitCode}.`]);
  };

  const showDiff = async () => {
    if (!workspaceRoot || !desktop) {
      showNotice('Git diff is available when a local folder is open.');
      return;
    }
    try {
      const diff = await getGitDiff(workspaceRoot);
      setTerminalOpen(true);
      setTerminalLines((current) => [...current, '$ git diff --stat', diff.trim() || 'No unstaged changes.']);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not read Git diff.');
    }
  };

  const askTheAgent = async (feedback?: string) => {
    if (desktop && !workspaceRoot) {
      showNotice('Open a local folder before asking the Agent to inspect or edit it.');
      return;
    }
    const prompt = agentPrompt.trim();
    if (!prompt && !feedback) return;
    setAgentBusy(true);
    try {
      if (!desktop) {
        const nextUserMessage: AgentMessage = {
          role: 'user',
          content: prompt || 'Please address the verification feedback from the previous response.',
        };
        const controller = new AbortController();
        browserAbortRef.current = controller;
        const contextFiles = files
          .filter((file) => file.content.length <= 80_000)
          .slice(0, 80)
          .map(({ path, content }) => ({ path, content }));
        const response = await askBrowserAgent({
          provider: provider as 'anthropic' | 'openai' | 'gemini' | 'openrouter',
          messages: [...browserMessages, nextUserMessage].slice(-20),
          files: contextFiles,
        }, { signal: controller.signal });
        setBrowserMessages((current) => [
          ...current,
          nextUserMessage,
          { role: 'assistant' as const, content: response.message, events: response.events },
        ].slice(-20));
        setAgentPrompt('');
        showNotice(`Agent replied via ${response.model}.`);
      } else {
        setAgentPlan(null);
        setAgentDiff(null);
        setAgentVerifications([]);
        const plan = await askAgent({
          root: workspaceRoot!,
          provider,
          prompt: prompt || 'Fix the verification failures using the existing workspace context.',
          feedback,
        });
        const diff = await previewAgentPlan(workspaceRoot!, plan);
        setAgentPlan(plan);
        setAgentDiff(diff);
        setAgentFeedback('');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        showNotice('Agent request stopped.');
      } else {
        showNotice(error instanceof Error ? error.message : 'The Agent could not create a response.');
      }
    } finally {
      browserAbortRef.current = null;
      setAgentBusy(false);
    }
  };

  const stopAgent = () => {
    browserAbortRef.current?.abort();
  };

  const applyPlan = async () => {
    if (!workspaceRoot || !agentPlan) return;
    setAgentBusy(true);
    try {
      const diff = await applyAgentPlan({
        root: workspaceRoot,
        plan: agentPlan,
        permissions: ['read-files', 'write-files'],
      });
      setAgentDiff(diff);
      const verification = await verifyAgentPlan({
        root: workspaceRoot,
        workingDirectory,
        commands: agentPlan.commands,
      });
      setAgentVerifications(verification);
      await refreshWorkspace(workspaceRoot);
      if (verification.some((result) => !result.passed)) {
        setAgentFeedback(verification.map((result) => `${result.command}\n${result.stderr || result.stdout}`).join('\n\n'));
      }
      showNotice(verification.length && verification.every((result) => result.passed)
        ? 'Agent changes applied and verification passed.'
        : 'Agent changes applied. Review the verification output.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not apply the Agent plan.');
    } finally {
      setAgentBusy(false);
    }
  };

  const renderTree = (nodes: WorkspaceNode[], depth = 0) => nodes.map((node) => {
    const expanded = node.kind === 'directory' && expandedPaths.includes(node.relativePath);
    return (
      <div key={node.relativePath}>
        <button
          className={`file-row ${selectedPath === node.relativePath ? 'active' : ''}`}
          style={{ paddingLeft: `${14 + depth * 13}px` }}
          onClick={() => void selectNode(node)}
          data-testid={`tree-row-${node.relativePath.replaceAll('/', '-')}`}
        >
          {node.kind === 'directory'
            ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
            : <span className="w-[14px]" />}
          {node.kind === 'directory' ? <Folder size={14} color="#79d4cf" /> : iconFor(kindForPath(node.relativePath))}
          <span className="truncate">{node.name}</span>
          {selectedPath === node.relativePath && <CircleDot className="ml-auto shrink-0" size={10} />}
        </button>
        {expanded && node.children ? renderTree(node.children, depth + 1) : null}
      </div>
    );
  });

  return (
    <main className="app-shell" data-testid="app-mycode-ai">
      <header className="topbar flex items-center justify-between px-3">
        <div className="flex items-center gap-3">
          <div className="brand-mark" aria-label="MyCode AI mark"><Code2 size={14} strokeWidth={2.6} /></div>
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-bold tracking-[-.02em] text-[#edf1ed]">MyCode <span className="text-[#d5f36a]">AI</span></span>
            <span className="desktop-only mono text-[10px] text-[#687278]">{desktop ? 'WINDOWS DESKTOP / PHASE 2' : 'LOCAL WORKSPACE / PREVIEW'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="desktop-only mr-3 flex items-center gap-2 mono text-[10px] text-[#788287]"><span className="status-dot" /> {desktop ? 'native bridge ready' : 'browser preview'}</div>
          <button className="icon-button h-7 w-7 rounded" onClick={() => setSettingsOpen(true)} aria-label="Open settings" data-testid="button-open-settings"><Settings size={15} /></button>
          <button className="icon-button h-7 w-7 rounded" onClick={() => setAgentOpen((value) => !value)} aria-label="Toggle agent panel" data-testid="button-toggle-agent-top"><PanelRight size={15} /></button>
          <button className="icon-button mobile-only h-7 w-7 rounded" onClick={() => setExplorerOpen((value) => !value)} aria-label="Toggle project explorer"><PanelLeft size={15} /></button>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className={`explorer ${explorerOpen ? '' : 'closed'} flex min-h-0 flex-col`} aria-label="Project explorer">
          <div className="flex h-[45px] items-center justify-between border-b border-[#252c34] px-4">
            <span className="ui-label text-[#9aa4a5]">Explorer</span>
            <div className="flex items-center gap-0.5">
              <button className="icon-button h-6 w-6 rounded" onClick={openFolder} aria-label="Open folder"><FolderOpen size={14} /></button>
              <button className="icon-button h-6 w-6 rounded" onClick={() => void createEntry('file')} aria-label="New file"><FilePlus2 size={14} /></button>
              <button className="icon-button h-6 w-6 rounded" onClick={() => void createEntry('directory')} aria-label="New folder"><FolderPlus size={14} /></button>
              <button className="icon-button h-6 w-6 rounded" onClick={() => setExplorerOpen(false)} aria-label="Collapse explorer"><PanelLeft size={14} /></button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <button className="flex min-w-0 items-center gap-2 truncate text-[12px] font-semibold text-[#edf1ed]" onClick={openFolder} title={workspaceRoot ?? workspaceName}><Folder size={15} color="#d5f36a" /> <span className="truncate">{workspaceName}</span></button>
            <span className="mono shrink-0 text-[10px] text-[#687278]">{fileCount} files</span>
          </div>
          <div className="flex items-center gap-1 border-b border-[#252c34] px-3 pb-2">
            <button className="tree-action" onClick={renameSelected} disabled={!selectedPath || !desktop} title="Rename selected"><Pencil size={12} /></button>
            <button className="tree-action danger" onClick={deleteSelected} disabled={!selectedPath || !desktop} title="Delete selected"><Trash2 size={12} /></button>
            <button className="tree-action ml-auto" onClick={() => workspaceRoot ? void refreshWorkspace(workspaceRoot) : showNotice('Open a local folder to refresh the explorer.')} title="Refresh workspace"><RefreshCw size={12} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pt-2">
            {renderTree(tree)}
          </div>
          <div className="border-t border-[#252c34] p-3">
            <button className="flex w-full items-center gap-2 rounded border border-dashed border-[#3b464d] px-3 py-2.5 text-left text-[11px] text-[#9aa4a5] transition hover:border-[#d5f36a] hover:text-[#d5f36a]" onClick={openFolder}>
              <FolderOpen size={14} /> <span><strong className="font-semibold text-[#cbd5ce]">{workspaceRoot ? 'Switch folder' : 'Open a folder'}</strong><br /><span className="text-[10px] text-[#687278]">{desktop ? 'Choose a local Windows project' : 'Run the desktop app for local access'}</span></span>
            </button>
          </div>
        </aside>

        <div className="main-column">
          <section className="editor-surface">
            <div className="tabs" role="tablist" aria-label="Open files">
              {openFiles.map((file) => (
                <button className={`tab ${file.path === activePath ? 'active' : ''}`} key={file.path} onClick={() => setActivePath(file.path)} role="tab" aria-selected={file.path === activePath}>
                  {iconFor(file.kind, 14)} <span>{file.name}</span>
                  {dirtyPaths.includes(file.path) && <span className="h-1.5 w-1.5 rounded-full bg-[#d5f36a]" title="Unsaved changes" />}
                  <span className="tab-close icon-button h-5 w-5" onClick={(event) => { event.stopPropagation(); closeTab(file.path); }} aria-label={`Close ${file.name}`}><X size={13} /></span>
                </button>
              ))}
              <div className="flex flex-1 items-center justify-end gap-1 pr-2">
                {activeDirty && <button className="icon-button h-6 gap-1 rounded px-2 text-[10px]" onClick={() => void saveFile()} title="Save file"><Save size={12} /> Save</button>}
                <button className="icon-button h-6 w-6 rounded" onClick={() => setOpenPaths([])} aria-label="Close all tabs"><Minus size={14} /></button>
              </div>
            </div>
            <div className="editor-toolbar">
              <div className="flex min-w-0 items-center gap-2"><span className="mono truncate text-[#9aa4a5]">{activeFile.path}</span>{activeDirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#d5f36a]" title="Unsaved local edits" />}{externalPaths.includes(activePath) && <span className="rounded bg-[#f1ad74]/15 px-1.5 py-0.5 text-[9px] text-[#f1ad74]">changed on disk</span>}</div>
              <div className="flex items-center gap-3"><span className="mono">{activeFile.kind === 'json' ? 'JSON' : activeFile.kind === 'md' ? 'Markdown' : 'TypeScript'}</span><span className="text-[#4e5961]">UTF-8</span><button className="hover:text-[#d5f36a]" onClick={() => setWordWrap((value) => !value)}>{wordWrap ? 'Wrap on' : 'Wrap off'}</button></div>
            </div>
            <div className="code-wrap">
              <div className="line-numbers">{Array.from({ length: lineCount }, (_, index) => <div key={index}>{index + 1}</div>)}</div>
              <textarea className="code-input" value={activeFile.content} onChange={(event) => updateContent(event.target.value)} wrap={wordWrap ? 'soft' : 'off'} spellCheck={false} aria-label={`Edit ${activeFile.name}`} />
              {minimap && <div className="desktop-only absolute right-3 top-[125px] hidden w-[3px] opacity-40 2xl:block" aria-hidden="true"><div className="h-28 rounded bg-gradient-to-b from-[#79d4cf] via-[#d5f36a] to-[#55616a]" /></div>}
            </div>
          </section>

          <section className={`terminal ${terminalOpen ? '' : 'closed'} terminal-grid`}>
            <div className="flex h-[33px] items-center justify-between border-b border-[#252c34] px-4">
              <div className="flex items-center gap-4"><span className="ui-label text-[#9aa4a5]">Terminal</span><span className="mono text-[10px] text-[#687278]">{workingDirectory || workspaceName}</span></div>
              <div className="flex items-center gap-1">
                <button className="terminal-action" onClick={() => void executeCommand('git status --short')} title="Run Git status"><GitBranch size={12} /> Git</button>
                <button className="terminal-action" onClick={() => void showDiff()} title="Show Git diff"><Search size={12} /> Diff</button>
                <button className="icon-button h-6 w-6 rounded" onClick={() => setTerminalOpen((value) => !value)} aria-label="Toggle terminal">{terminalOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                <button className="icon-button h-6 w-6 rounded" onClick={() => setTerminalOpen(false)} aria-label="Close terminal"><X size={13} /></button>
              </div>
            </div>
            <div className="terminal-body flex min-h-0 flex-col px-5 py-3">
              <div className="terminal-output min-h-0 flex-1 overflow-y-auto">
                {terminalLines.length === 0 && <div className="mono flex items-center gap-2 text-[11px] text-[#687278]"><span className="text-[#79d4cf]">{workspaceRoot ? `${workspaceName} ${workingDirectory || '/'}` : '~ /mycode-lab'}</span><span>$</span><span className="text-[#9aa4a5]">{desktop ? 'terminal ready' : 'terminal execution is not connected'}</span></div>}
                {terminalLines.map((line, index) => <pre key={`${line}-${index}`} className="mono whitespace-pre-wrap text-[11px] leading-[1.65] text-[#aeb9b2]">{line}</pre>)}
              </div>
              <div className="mt-2 flex items-center gap-2 border-t border-[#252c34] pt-2">
                <span className="mono text-[11px] text-[#79d4cf]">$</span>
                <input className="terminal-input" value={terminalCommand} onChange={(event) => setTerminalCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void executeCommand(); }} placeholder={desktop ? 'Run a command in this workspace' : 'Open the Windows desktop app to run commands'} disabled={!desktop || terminalBusy} aria-label="Terminal command" />
                <input className="working-dir-input" value={workingDirectory} onChange={(event) => setWorkingDirectory(event.target.value)} placeholder="/" aria-label="Terminal working directory" disabled={!desktop} />
                <button className="icon-button h-6 w-6 rounded" onClick={() => void executeCommand()} disabled={!desktop || terminalBusy || !terminalCommand.trim()} aria-label="Run command">{terminalBusy ? <RefreshCw className="animate-spin" size={13} /> : <Play size={13} />}</button>
              </div>
            </div>
          </section>
        </div>

          <aside className={`agent ${agentOpen ? '' : 'closed'} flex min-h-0 flex-col`} aria-label="Agent panel">
          <div className="flex h-[45px] items-center justify-between border-b border-[#252c34] px-4">
            <div className="flex items-center gap-2"><Bot size={16} color="#d5f36a" /><span className="ui-label text-[#cbd5ce]">Agent</span><span className="rounded bg-[#333a32] px-1.5 py-0.5 mono text-[9px] text-[#d5f36a]">PHASE 3</span></div>
            <button className="icon-button h-6 w-6 rounded" onClick={() => setAgentOpen(false)} aria-label="Collapse agent panel"><PanelRight size={14} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="flex flex-col items-center pt-6 text-center">
              <div className="agent-orbit pulse"><Sparkles size={18} color="#d5f36a" /></div>
              <h2 className="mt-5 text-[15px] font-semibold tracking-[-.02em] text-[#edf1ed]">Ask the workspace Agent.</h2>
              <p className="mt-2 max-w-[240px] text-[11px] leading-[1.7] text-[#899397]">The Agent reads local context, proposes a structured plan, and waits for your approval before changing files.</p>
            </div>
            <div className="agent-card mt-8 p-3.5">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#cbd5ce]"><ShieldCheck size={14} color="#79d4cf" /> Connection status</div>
              <div className="mt-3 flex items-center justify-between border-t border-[#303943] pt-3"><span className="text-[11px] text-[#899397]">Agent engine</span><span className={`mono text-[10px] ${agentStatus?.configured ? 'text-[#d5f36a]' : 'text-[#f1ad74]'}`}>{agentStatus?.configured ? 'ready' : 'needs provider key'}</span></div>
              <div className="mt-2 flex items-center justify-between"><span className="text-[11px] text-[#899397]">Workspace context</span><span className="mono text-[10px] text-[#79d4cf]">{workspaceRoot ? 'local folder' : 'sample files'}</span></div>
              <div className="mt-2 flex items-center justify-between"><span className="text-[11px] text-[#899397]">Git context</span><span className="mono text-[10px] text-[#79d4cf]">{git.isRepository ? `${git.changedFiles.length} changes` : 'not a repo'}</span></div>
            </div>
            {agentStatus && !agentStatus.configured && <div className="mt-5 rounded border border-[#5a4534] bg-[#2a211b] p-3 text-[11px] leading-[1.6] text-[#c6a98d]"><div className="mb-2 flex items-center gap-2 text-[#f1ad74]"><AlertTriangle size={14} /> Provider configuration</div>{agentStatus.message}</div>}
            {agentPlan && <div className="agent-card mt-5 p-3.5">
              <div className="flex items-start justify-between gap-3"><div><div className="ui-label text-[#d5f36a]">Reviewable plan</div><div className="mt-2 text-[12px] font-semibold text-[#edf1ed]">{agentPlan.summary}</div></div><span className="mono text-[9px] text-[#79d4cf]">{agentPlan.edits.length} file edits</span></div>
              <div className="mt-3 space-y-1.5">{agentPlan.steps.slice(0, 5).map((step, index) => <div key={`${step}-${index}`} className="flex gap-2 text-[10px] leading-[1.5] text-[#aeb9b2]"><span className="mono text-[#d5f36a]">{index + 1}.</span><span>{step}</span></div>)}</div>
              {agentDiff && <div className="mt-3 rounded border border-[#303943] bg-[#111419] p-2.5"><div className="flex items-center justify-between text-[10px] text-[#899397]"><span>Diff preview</span><span className="mono text-[#d5f36a]">+{agentDiff.additions} / -{agentDiff.removals}</span></div><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap mono text-[9px] leading-[1.5] text-[#9aa4a5]">{agentDiff.text}</pre></div>}
              {agentPlan.edits.length > 0 && <button className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-[#d5f36a] px-3 py-2 text-[11px] font-bold text-[#111419] hover:bg-[#e1f992]" onClick={() => void applyPlan()} disabled={agentBusy}><Check size={13} /> {agentBusy ? 'Applying…' : 'Approve & apply changes'}</button>}
              {agentVerifications.length > 0 && <div className="mt-3 space-y-2 border-t border-[#303943] pt-3">{agentVerifications.map((result) => <div key={result.command} className="text-[10px]"><div className={result.passed ? 'text-[#d5f36a]' : 'text-[#f1ad74]'}>{result.passed ? '✓' : '×'} {result.command}</div>{!result.passed && <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap mono text-[9px] text-[#aeb9b2]">{result.stderr || result.stdout}</pre>}</div>)}</div>}
            </div>}
            {!desktop && browserMessages.length > 0 && <div className="mt-5 space-y-3">
              {browserMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`rounded border p-3 ${message.role === 'user' ? 'border-[#39443b] bg-[#1b241f]' : 'border-[#303943] bg-[#171c22]'}`}>
                  <div className="mb-1 flex items-center gap-2 text-[9px] uppercase tracking-[.12em] text-[#687278]">
                    {message.role === 'user' ? 'You' : 'Agent'}
                    {message.events?.length ? <span className="text-[#79d4cf]">{message.events.length} tool calls</span> : null}
                  </div>
                  <p className="whitespace-pre-wrap text-[11px] leading-[1.65] text-[#cbd5ce]">{message.content}</p>
                  {message.events?.map((event, eventIndex) => (
                    <details key={`${event.tool}-${eventIndex}`} className="mt-2 rounded border border-[#303943] bg-[#111419] p-2">
                      <summary className="cursor-pointer text-[10px] text-[#d5f36a]">{event.tool}</summary>
                      <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap mono text-[9px] leading-[1.5] text-[#899397]">{event.result}</pre>
                    </details>
                  ))}
                </div>
              ))}
            </div>}
            <div className="mt-5 rounded border border-[#303943] bg-[#171c22] p-3 text-[11px] leading-[1.6] text-[#899397]"><div className="mb-2 flex items-center gap-2 text-[#cbd5ce]"><Activity size={14} color="#d5f36a" /> Safe agent loop</div>Search and read context → plan → preview → your approval → apply → verify. Failed checks can be sent back for another iteration.</div>
          </div>
          <div className="border-t border-[#252c34] p-4">
            {agentFeedback && <button className="mb-2 w-full rounded border border-[#5a4534] px-3 py-2 text-left text-[10px] text-[#f1ad74] hover:border-[#f1ad74]" onClick={() => void askTheAgent(agentFeedback)}>Verification failed — ask Agent to iterate</button>}
            <div className="flex items-end gap-2 rounded border border-[#303943] bg-[#171c22] p-2">
              <MessageSquare size={14} className="mb-1 text-[#79d4cf]" />
              <textarea className="agent-input" value={agentPrompt} onChange={(event) => setAgentPrompt(event.target.value)} placeholder={desktop ? 'Ask to explain, fix, or change this workspace…' : 'Ask about the sample workspace…'} disabled={agentBusy} rows={2} aria-label="Agent request" />
              <button className="icon-button h-7 w-7 shrink-0 rounded" onClick={() => agentBusy ? stopAgent() : void askTheAgent()} disabled={!agentBusy && !agentPrompt.trim()} aria-label={agentBusy ? 'Stop Agent request' : 'Send Agent request'}>{agentBusy ? <SquareTerminal size={14} /> : <Sparkles size={14} />}</button>
            </div>
          </div>
        </aside>
      </section>

      <footer className="fixed bottom-0 left-0 right-0 z-10 flex h-[22px] items-center justify-between border-t border-[#252c34] bg-[#111419] px-3 mono text-[9px] text-[#687278]">
        <div className="flex items-center gap-3"><button className="flex items-center gap-1.5 text-[#9aa4a5] hover:text-[#d5f36a]" onClick={() => workspaceRoot ? void refreshGit(workspaceRoot) : showNotice('Open a local folder to inspect Git.')}><GitBranch size={11} /> {git.branch || 'no branch'}</button><span>{git.changedFiles.length || dirtyPaths.length} changes</span></div>
        <div className="flex items-center gap-3"><span>Ln 1, Col 1</span><span className="text-[#79d4cf]">● {desktop ? 'Native workspace' : 'Preview only'}</span></div>
      </footer>

      {notice && <div className="notice fixed bottom-9 left-1/2 z-30 flex max-w-[560px] -translate-x-1/2 items-center gap-2 rounded px-4 py-2.5 text-[11px] shadow-xl"><Info size={14} /><span>{notice}</span><button className="ml-2 text-[#dce9bf] opacity-70 hover:opacity-100" onClick={() => setNotice(null)} aria-label="Dismiss notice"><X size={13} /></button></div>}
      {settingsOpen && <SettingsPanel provider={provider} setProvider={setProvider} telemetry={telemetry} setTelemetry={setTelemetry} minimap={minimap} setMinimap={setMinimap} onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}

function SettingsPanel({ provider, setProvider, telemetry, setTelemetry, minimap, setMinimap, onClose }: { provider: string; setProvider: (value: string) => void; telemetry: boolean; setTelemetry: (value: boolean) => void; minimap: boolean; setMinimap: (value: boolean) => void; onClose: () => void }) {
  return <div className="settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-panel">
      <div className="flex items-start justify-between px-7 pb-5 pt-7">
        <div><div className="ui-label text-[#d5f36a]">Workspace settings</div><h2 className="mt-2 text-[23px] font-semibold tracking-[-.04em] text-[#edf1ed]">Local by design.</h2><p className="mt-1 text-[11px] text-[#899397]">Native capabilities stay behind explicit service boundaries.</p></div>
        <button className="icon-button h-8 w-8 rounded" onClick={onClose} aria-label="Close settings"><X size={16} /></button>
      </div>
      <div className="setting-section">
        <div className="ui-label text-[#687278]">Editor</div>
        <div className="mt-5 space-y-5">
          <SettingRow title="Editor minimap" description="Keep a slim code map at the edge of the editor." control={<Toggle checked={minimap} onChange={() => setMinimap(!minimap)} />} />
          <SettingRow title="Restore open tabs" description="Reopen the last working set when the desktop shell starts." control={<Toggle checked />} />
          <SettingRow title="Usage telemetry" description="Off by default. No data leaves the app without your choice." control={<Toggle checked={telemetry} onChange={() => setTelemetry(!telemetry)} />} />
        </div>
      </div>
      <div className="setting-section">
        <div className="ui-label text-[#687278]">AI provider</div>
        <div className="mt-5">
          <label className="mb-2 block text-[11px] font-semibold text-[#cbd5ce]" htmlFor="provider-select">Preferred provider</label>
          <select id="provider-select" className="setting-select" value={provider} onChange={(event) => setProvider(event.target.value)}><option value="anthropic">Anthropic</option><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option></select>
          <p className="mt-2 text-[10px] leading-[1.6] text-[#687278]">Provider keys are read only by the native desktop Agent service and are never sent through the browser preview.</p>
        </div>
      </div>
      <div className="setting-section">
        <div className="ui-label text-[#687278]">Native services</div>
        <div className="mt-4 rounded border border-[#303943] bg-[#151a1f] p-4">
           <div className="flex items-start gap-3"><Zap size={16} color="#79d4cf" /><div><div className="text-[12px] font-semibold text-[#cbd5ce]">Desktop bridge active</div><p className="mt-1 text-[11px] leading-[1.7] text-[#899397]">Workspace files, terminal sessions, Git, provider adapters, reviewable edits, and verification are connected through Tauri.</p></div></div>
        </div>
        <div className="mt-5 flex items-center justify-between"><span className="text-[11px] text-[#687278]">Runtime</span><span className="mono rounded bg-[#333a32] px-2 py-1 text-[10px] text-[#d5f36a]">{isDesktopRuntime() ? 'Windows / Tauri' : 'browser / preview'}</span></div>
      </div>
      <div className="px-7 py-5"><button className="flex w-full items-center justify-center gap-2 rounded bg-[#d5f36a] px-3 py-2.5 text-[11px] font-bold text-[#111419] transition hover:bg-[#e1f992]" onClick={onClose}><Check size={14} /> Keep these preferences</button></div>
    </div>
  </div>;
}

function SettingRow({ title, description, control }: { title: string; description: string; control: ReactNode }) {
  return <div className="flex items-start justify-between gap-5"><div><div className="text-[12px] font-semibold text-[#cbd5ce]">{title}</div><p className="mt-1 max-w-[330px] text-[10px] leading-[1.6] text-[#687278]">{description}</p></div>{control}</div>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange?: () => void }) {
  return <button className={`toggle ${checked ? 'on' : ''}`} onClick={onChange} aria-pressed={checked}><span className="toggle-thumb block" /></button>;
}

export default AppPhase2;