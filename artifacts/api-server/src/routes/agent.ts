import { Router, type IRouter } from "express";
import {
  AskBrowserAgentBody,
  AskBrowserAgentResponse,
  GetAgentStatusQueryParams,
  GetAgentStatusResponse,
} from "@workspace/api-zod";

import { askAgent, getAgentStatus } from "../lib/agent";

const router: IRouter = Router();

router.get("/agent/status", (req, res) => {
  const parsed = GetAgentStatusQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose anthropic, openai, gemini, or openrouter." });
    return;
  }
  res.json(GetAgentStatusResponse.parse(getAgentStatus(parsed.data.provider)));
});

router.post("/agent/ask", async (req, res) => {
  const parsed = AskBrowserAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Agent requests must include provider, messages, and workspace files." });
    return;
  }
  try {
    const controller = new AbortController();
    req.on("close", () => controller.abort());
    const result = await askAgent(
      parsed.data.provider,
      parsed.data.messages,
      parsed.data.files,
      controller.signal,
    );
    res.json(AskBrowserAgentResponse.parse(result));
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 502;
    if (status === 499 || req.destroyed) return;
    req.log.error({ err: error }, "Agent request failed");
    res.status(status).json({ message: error instanceof Error ? error.message : "Agent request failed." });
  }
});

export default router;