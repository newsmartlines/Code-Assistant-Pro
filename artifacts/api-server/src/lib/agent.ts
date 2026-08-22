import { randomUUID } from "node:crypto";

import type { AgentFile, AgentMessage, AgentProvider } from "@workspace/api-zod";

export type ToolEvent = {
  tool: string;
  input: string;
  result: string;
};

type ProviderConfig = {
  envName: string;
  model: string;
};

type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

type ProviderTurn = {
  text?: string;
  toolCalls: ToolCall[];
  raw: unknown;
};

const PROVIDERS: Record<AgentProvider, ProviderConfig> = {
  anthropic: { envName: "ANTHROPIC_API_KEY", model: "claude-3-5-sonnet-latest" },
  openai: { envName: "OPENAI_API_KEY", model: "gpt-4o-mini" },
  gemini: { envName: "GEMINI_API_KEY", model: "gemini-3.6-flash" },
  openrouter: { envName: "OPENROUTER_API_KEY", model: "openai/gpt-4o-mini" },
};

const MAX_FILE_CHARS = 80_000;
const MAX_TOOL_RESULT_CHARS = 12_000;
const MAX_TURNS = 6;
const PROVIDER_TIMEOUT_MS = 20_000;
const runtimeKeys = new Map<AgentProvider, string>();

const systemPrompt = `You are MyCode AI, a careful coding assistant.
You are answering from a browser preview with a read-only virtual workspace.
Use the available tools whenever you need to inspect files; do not assume files exist.
Never claim to have modified files, run commands, or accessed a local filesystem.
Explain findings clearly and suggest exact next steps. Keep responses concise but useful.`;

const toolDefinitions = [
  {
    name: "list_files",
    description: "List all files available in the virtual workspace.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_file",
    description: "Read a file from the virtual workspace.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Workspace-relative path" } },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search text across the virtual workspace and return matching lines.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Text to search for" } },
      required: ["query"],
    },
  },
] as const;

function truncate(value: string, max = MAX_TOOL_RESULT_CHARS) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function validateFiles(files: AgentFile[]) {
  return files.filter((file) => {
    const path = file.path.trim();
    return Boolean(path) &&
      !path.startsWith("/") &&
      !path.includes("..") &&
      file.content.length <= MAX_FILE_CHARS;
  });
}

function runTool(name: string, input: Record<string, unknown>, files: AgentFile[]) {
  const safeFiles = validateFiles(files);
  if (name === "list_files") {
    return safeFiles.map((file) => file.path).join("\n") || "The workspace is empty.";
  }
  if (name === "read_file") {
    const path = typeof input.path === "string" ? input.path : "";
    const file = safeFiles.find((candidate) => candidate.path === path);
    return file ? truncate(file.content) : `File not found: ${path}`;
  }
  if (name === "search_files") {
    const query = typeof input.query === "string" ? input.query.trim().toLowerCase() : "";
    if (!query) return "Search query is empty.";
    const matches: string[] = [];
    for (const file of safeFiles) {
      file.content.split("\n").forEach((line, index) => {
        if (line.toLowerCase().includes(query) && matches.length < 80) {
          matches.push(`${file.path}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    return matches.length ? matches.join("\n") : "No matches found.";
  }
  return `Unknown tool: ${name}`;
}

function parseToolInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function toOpenAiMessages(messages: AgentMessage[]) {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

async function fetchProvider(input: string, init: RequestInit, provider: AgentProvider) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), PROVIDER_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    if (timeoutController.signal.aborted && !init.signal?.aborted) {
      throw new Error(`${provider} did not respond within ${PROVIDER_TIMEOUT_MS / 1000} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readProviderJson<T>(response: Response, provider: AgentProvider) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.json() as Promise<T>,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${provider} did not return a complete response within ${PROVIDER_TIMEOUT_MS / 1000} seconds.`)),
          PROVIDER_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function providerRequest(
  provider: AgentProvider,
  key: string,
  messages: AgentMessage[],
  history: unknown[],
  signal?: AbortSignal,
): Promise<ProviderTurn> {
  const config = PROVIDERS[provider];
  const requestSignal = signal;
  console.info(`[agent] requesting ${provider}`);
  if (provider === "anthropic") {
    const response = await fetchProvider("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: requestSignal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1800,
        system: systemPrompt,
        messages: history.length ? history : messages.map((message) => ({ role: message.role, content: message.content })),
        tools: toolDefinitions,
      }),
    }, provider);
    const payload = await readProviderJson<{ content?: Array<{ type?: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>; error?: { message?: string } }>(response, provider);
    if (!response.ok) throw new Error(`Anthropic returned HTTP ${response.status}: ${payload.error?.message ?? "request failed"}`);
    const content = payload.content ?? [];
    return {
      text: content.filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n").trim() || undefined,
      toolCalls: content.filter((item) => item.type === "tool_use" && item.name).map((item) => ({ id: item.id ?? randomUUID(), name: item.name!, input: item.input ?? {} })),
      raw: content,
    };
  }

  if (provider === "gemini") {
    const response = await fetchProvider(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      signal: requestSignal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: history.length ? history : messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
        tools: [{ functionDeclarations: toolDefinitions.map(({ name, description, input_schema }) => ({ name, description, parameters: input_schema })) }],
        generationConfig: { temperature: 0.2 },
      }),
    }, provider);
    console.info(`[agent] ${provider} responded with HTTP ${response.status}`);
    const payload = await readProviderJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }> } }>; error?: { message?: string } }>(response, provider);
    if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}: ${payload.error?.message ?? "request failed"}`);
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    return {
      text: parts.filter((part) => part.text).map((part) => part.text).join("\n").trim() || undefined,
      toolCalls: parts.filter((part) => part.functionCall).map((part) => ({ id: randomUUID(), name: part.functionCall!.name, input: part.functionCall!.args ?? {} })),
      raw: parts,
    };
  }

  const url = provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const response = await fetchProvider(url, {
    method: "POST",
    signal: requestSignal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://mycode.ai" } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [{ role: "system", content: systemPrompt }, ...(history.length ? history : toOpenAiMessages(messages))],
      tools: toolDefinitions.map(({ name, description, input_schema }) => ({ type: "function", function: { name, description, parameters: input_schema } })),
      tool_choice: "auto",
    }),
  }, provider);
  const payload = await readProviderJson<{ choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>; error?: { message?: string } }>(response, provider);
  if (!response.ok) throw new Error(`${provider === "openrouter" ? "OpenRouter" : "OpenAI"} returned HTTP ${response.status}: ${payload.error?.message ?? "request failed"}`);
  const message = payload.choices?.[0]?.message;
  return {
    text: message?.content?.trim() || undefined,
    toolCalls: message?.tool_calls?.map((call) => ({ id: call.id, name: call.function.name, input: parseToolInput(call.function.arguments) })) ?? [],
    raw: message ?? {},
  };
}

export function getAgentStatus(provider: AgentProvider) {
  const config = PROVIDERS[provider];
  const configured = Boolean(process.env[config.envName]?.trim() || runtimeKeys.get(provider));
  return {
    provider,
    model: config.model,
    configured,
    message: configured ? `${provider} is ready` : `Set ${config.envName} on the API server to enable live responses.`,
  };
}

export function configureAgentKey(provider: AgentProvider, key: string) {
  const trimmedKey = key.trim();
  if (trimmedKey) runtimeKeys.set(provider, trimmedKey);
  else runtimeKeys.delete(provider);
  return getAgentStatus(provider);
}

function getProviderKey(provider: AgentProvider) {
  return process.env[PROVIDERS[provider].envName]?.trim() || runtimeKeys.get(provider);
}

export async function askAgent(
  provider: AgentProvider,
  messages: AgentMessage[],
  files: AgentFile[],
  signal?: AbortSignal,
) {
  const status = getAgentStatus(provider);
  const providerKey = getProviderKey(provider);
  if (!providerKey) {
    const error = new Error(status.message);
    (error as Error & { status?: number }).status = 503;
    throw error;
  }

  const events: ToolEvent[] = [];
  const history: unknown[] = [];
  let finalMessage = "";
  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const result = await providerRequest(provider, providerKey, messages, history, signal);
    if (provider === "anthropic") {
      history.push({ role: "assistant", content: result.raw });
    } else if (provider === "openai" || provider === "openrouter") {
      history.push({ role: "assistant", content: result.raw });
    } else {
      history.push({ role: "model", parts: result.raw });
    }

    if (!result.toolCalls.length) {
      finalMessage = result.text ?? "The Agent returned no text.";
      break;
    }
    for (const call of result.toolCalls) {
      const input = JSON.stringify(call.input);
      const output = runTool(call.name, call.input, files);
      events.push({ tool: call.name, input, result: truncate(output) });
      if (provider === "anthropic") {
        history.push({ role: "user", content: [{ type: "tool_result", tool_use_id: call.id, content: output }] });
      } else if (provider === "openai" || provider === "openrouter") {
        history.push({ role: "tool", tool_call_id: call.id, content: output });
      } else {
        history.push({ role: "user", parts: [{ functionResponse: { name: call.name, response: { result: output } } }] });
      }
    }
  }
  return { provider, model: status.model, message: finalMessage || "The Agent reached its tool-turn limit before replying.", events };
}