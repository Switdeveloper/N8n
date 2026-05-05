import { Router, type IRouter } from "express";
import {
  GetOpencodeStatusResponse,
  ListSessionsResponse,
  CreateSessionResponse,
  GetSessionMessagesResponse,
  SendMessageResponse,
  AbortSessionResponse,
  ListModelsResponse,
  ChatWithAIResponse,
  SendMessageBody,
  ChatWithAIBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const OPENCODE_API_URL = process.env.OPENCODE_API_URL || "http://localhost:4096";
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

const AVAILABLE_MODELS = [
  { id: "moonshotai/kimi-k2-instruct", name: "Kimi K2 Instruct", provider: "nvidia", contextLength: 131072 },
  { id: "moonshotai/kimi-k2-thinking", name: "Kimi K2 Thinking", provider: "nvidia", contextLength: 131072 },
  { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5 VLM", provider: "nvidia", contextLength: 262144 },
  { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6 VLM", provider: "nvidia", contextLength: 262144 },
  { id: "minimax/minimax-m2.7", name: "MiniMax M2.7", provider: "nvidia", contextLength: 65536 },
];

async function opencodeRequest(path: string, options: RequestInit = {}) {
  const url = `${OPENCODE_API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return res;
}

router.get("/status", async (req, res) => {
  try {
    const r = await opencodeRequest("/health");
    if (r.ok) {
      const data = GetOpencodeStatusResponse.parse({ running: true, version: "1.14.34", model: "moonshotai/kimi-k2-instruct" });
      res.json(data);
    } else {
      res.json(GetOpencodeStatusResponse.parse({ running: false }));
    }
  } catch {
    res.json(GetOpencodeStatusResponse.parse({ running: false }));
  }
});

router.get("/sessions", async (req, res) => {
  try {
    const r = await opencodeRequest("/session");
    if (r.ok) {
      const rawData = await r.json() as Record<string, unknown>;
      const sessions = Array.isArray(rawData) ? rawData : (rawData.sessions as unknown[] || []);
      const mapped = (sessions as Record<string, unknown>[]).map((s) => ({
        id: String(s.id || s.sessionID || ""),
        title: String(s.title || s.id || "Session"),
        model: String(s.model || "kimi-k2-instruct"),
        createdAt: String(s.createdAt || new Date().toISOString()),
        updatedAt: String(s.updatedAt || new Date().toISOString()),
      }));
      res.json(ListSessionsResponse.parse({ sessions: mapped }));
    } else {
      res.json(ListSessionsResponse.parse({ sessions: [] }));
    }
  } catch {
    res.json(ListSessionsResponse.parse({ sessions: [] }));
  }
});

router.post("/sessions", async (req, res) => {
  try {
    const r = await opencodeRequest("/session", { method: "POST", body: JSON.stringify({}) });
    if (r.ok) {
      const data = await r.json() as Record<string, unknown>;
      res.json(CreateSessionResponse.parse({
        id: String(data.id || data.sessionID || `session-${Date.now()}`),
        title: "New Session",
        model: "moonshotai/kimi-k2-instruct",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    } else {
      res.json(CreateSessionResponse.parse({
        id: `session-${Date.now()}`,
        title: "New Session",
        model: "moonshotai/kimi-k2-instruct",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    }
  } catch {
    res.json(CreateSessionResponse.parse({
      id: `session-${Date.now()}`,
      title: "New Session",
      model: "moonshotai/kimi-k2-instruct",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }
});

router.get("/sessions/:sessionId/messages", async (req, res) => {
  const { sessionId } = req.params;
  try {
    const r = await opencodeRequest(`/session/${sessionId}/message`);
    if (r.ok) {
      const rawData = await r.json() as unknown;
      const msgs = Array.isArray(rawData) ? rawData : [];
      const mapped = (msgs as Record<string, unknown>[]).map((m) => ({
        id: String(m.id || `msg-${Date.now()}`),
        role: String(m.role || "assistant"),
        content: String(m.content || ""),
        createdAt: String(m.createdAt || new Date().toISOString()),
        sessionId,
      }));
      res.json(GetSessionMessagesResponse.parse({ messages: mapped }));
    } else {
      res.json(GetSessionMessagesResponse.parse({ messages: [] }));
    }
  } catch {
    res.json(GetSessionMessagesResponse.parse({ messages: [] }));
  }
});

router.post("/sessions/:sessionId/messages", async (req, res) => {
  const { sessionId } = req.params;
  const body = SendMessageBody.parse(req.body);
  try {
    const r = await opencodeRequest(`/session/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify({ content: body.content, role: "user" }),
    });
    if (r.ok) {
      const data = await r.json() as Record<string, unknown>;
      res.json(SendMessageResponse.parse({
        id: String(data.id || `msg-${Date.now()}`),
        role: "user",
        content: body.content,
        createdAt: new Date().toISOString(),
        sessionId,
      }));
    } else {
      res.json(SendMessageResponse.parse({
        id: `msg-${Date.now()}`,
        role: "user",
        content: body.content,
        createdAt: new Date().toISOString(),
        sessionId,
      }));
    }
  } catch {
    res.json(SendMessageResponse.parse({
      id: `msg-${Date.now()}`,
      role: "user",
      content: body.content,
      createdAt: new Date().toISOString(),
      sessionId,
    }));
  }
});

router.post("/sessions/:sessionId/abort", async (req, res) => {
  const { sessionId } = req.params;
  try {
    await opencodeRequest(`/session/${sessionId}/abort`, { method: "POST" });
  } catch {
    // ignore
  }
  res.json(AbortSessionResponse.parse({ success: true }));
});

router.get("/models", (_req, res) => {
  res.json(ListModelsResponse.parse({ models: AVAILABLE_MODELS }));
});

router.post("/chat", async (req, res) => {
  const body = ChatWithAIBody.parse(req.body);
  const modelId = body.model || "moonshotai/kimi-k2-instruct";
  const sessionId = body.sessionId || `web-${Date.now()}`;

  const messages = [
    ...(body.history || []),
    { role: "user", content: body.message },
  ];

  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: 4096,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    res.status(response.status).json({ error: err });
    return;
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content || "";

  res.json(ChatWithAIResponse.parse({ content, model: modelId, sessionId }));
});

export default router;
