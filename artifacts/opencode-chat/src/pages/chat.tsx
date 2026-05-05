import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Bot, User, Zap, ChevronDown, Plus, Loader2,
  Coins, Brain, Trash2, Edit3, Check, X, Sparkles, History,
} from "lucide-react";
import { useChatWithAI, useListModels, useGetOpencodeStatus } from "@workspace/api-client-react";

const STORAGE_MESSAGES = "oc-chat-messages";
const STORAGE_MEMORY   = "oc-ai-memory";
const STORAGE_STATS    = "oc-chat-stats";
const MAX_STORED_MSGS  = 60;

interface TokenUsage { prompt: number; completion: number; total: number; }

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tokens?: TokenUsage;
  model?: string;
  usedFallback?: boolean;
}

interface SessionStats {
  totalPrompt: number;
  totalCompletion: number;
  totalTokens: number;
  messageCount: number;
  byModel: Record<string, number>;
}

const DEFAULT_MODEL = "minimaxai/minimax-m2.7";
const FALLBACK_MODEL = "moonshotai/kimi-k2-instruct";

const MODEL_LABELS: Record<string, string> = {
  "minimaxai/minimax-m2.7":      "MiniMax M2.7",
  "minimaxai/minimax-m2.5":      "MiniMax M2.5",
  "moonshotai/kimi-k2-instruct": "Kimi K2 Instruct",
  "moonshotai/kimi-k2-thinking": "Kimi K2 Thinking",
  "moonshotai/kimi-k2.6":        "Kimi K2.6 VLM",
};

function fmtTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function loadJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}

const MEMORY_SYSTEM_PREFIX =
  "You are a helpful AI assistant with persistent memory. ";
const MEMORY_EXTRACT_PROMPT = (prev: string, convo: string) =>
  `You maintain a memory of important facts about the user and their preferences.\n\nCurrent memory:\n${prev || "(empty)"}\n\nRecent conversation:\n${convo}\n\nTask: Update the memory with any new important facts, preferences, or context from the conversation. Be concise (max 300 words). Omit trivial details. Return ONLY the updated memory text with no explanation.`;

export default function ChatPage() {
  const [messages, setMessages]           = useState<ChatMessage[]>([]);
  const [input, setInput]                 = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [memoryOpen, setMemoryOpen]       = useState(false);
  const [historyOpen, setHistoryOpen]     = useState(false);
  const [statsOpen, setStatsOpen]         = useState(false);
  const [memory, setMemory]               = useState("");
  const [editingMemory, setEditingMemory] = useState(false);
  const [memoryDraft, setMemoryDraft]     = useState("");
  const [isExtractingMemory, setIsExtractingMemory] = useState(false);
  const [sessionId]                       = useState(() => `web-${Date.now()}`);
  const [stats, setStats]                 = useState<SessionStats>({
    totalPrompt: 0, totalCompletion: 0, totalTokens: 0, messageCount: 0, byModel: {},
  });

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: statusData } = useGetOpencodeStatus();
  const { data: modelsData } = useListModels();
  const models = modelsData?.models ?? [];
  const chatMutation = useChatWithAI();
  const isLoading = chatMutation.isPending;

  // ── Load persisted state on mount ──────────────────────────────────────
  useEffect(() => {
    const saved = loadJson<ChatMessage[]>(STORAGE_MESSAGES, []);
    if (saved.length) setMessages(saved);
    const savedMemory = localStorage.getItem(STORAGE_MEMORY) ?? "";
    setMemory(savedMemory);
    const savedStats = loadJson<SessionStats>(STORAGE_STATS, {
      totalPrompt: 0, totalCompletion: 0, totalTokens: 0, messageCount: 0, byModel: {},
    });
    setStats(savedStats);
  }, []);

  // ── Persist messages ────────────────────────────────────────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    localStorage.setItem(STORAGE_MESSAGES, JSON.stringify(messages.slice(-MAX_STORED_MSGS)));
  }, [messages]);

  // ── Persist memory ──────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_MEMORY, memory);
  }, [memory]);

  // ── Persist stats ───────────────────────────────────────────────────────
  useEffect(() => {
    if (stats.totalTokens === 0) return;
    localStorage.setItem(STORAGE_STATS, JSON.stringify(stats));
  }, [stats]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ── Memory extraction (background self-improvement) ─────────────────────
  const extractMemory = useCallback(async (conversation: ChatMessage[], currentMemory: string) => {
    if (conversation.length < 2) return;
    setIsExtractingMemory(true);
    try {
      const convoText = conversation
        .slice(-10)
        .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
        .join("\n");
      const prompt = MEMORY_EXTRACT_PROMPT(currentMemory, convoText);
      const res = await fetch("/api/opencode/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          model: DEFAULT_MODEL,
          sessionId: "memory-extract",
          history: [],
        }),
      });
      if (res.ok) {
        const data = await res.json() as { content?: string };
        const updated = (data.content ?? "").trim();
        if (updated && updated.toLowerCase() !== "(empty)" && !updated.toLowerCase().startsWith("nothing")) {
          setMemory(updated);
        }
      }
    } catch { /* silent */ }
    finally { setIsExtractingMemory(false); }
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const content = input.trim();
    if (!content || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    // Build history — prepend memory as system context if present
    const systemHistory = memory
      ? [{ role: "system", content: `${MEMORY_SYSTEM_PREFIX}Your memory about this user:\n${memory}` }]
      : [];
    const history = [
      ...systemHistory,
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");

    try {
      const result = await chatMutation.mutateAsync({
        data: { message: content, model: selectedModel, sessionId, history },
      });

      const usedFallback = result.model !== selectedModel && result.model === FALLBACK_MODEL;
      const usage: TokenUsage | undefined = result.totalTokens != null
        ? { prompt: result.promptTokens ?? 0, completion: result.completionTokens ?? 0, total: result.totalTokens }
        : undefined;

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.content,
        timestamp: new Date().toISOString(),
        tokens: usage,
        model: result.model,
        usedFallback,
      };

      const updated = [...nextMessages, assistantMsg];
      setMessages(updated);

      if (usage) {
        setStats((prev) => {
          const next = {
            totalPrompt:     prev.totalPrompt + usage.prompt,
            totalCompletion: prev.totalCompletion + usage.completion,
            totalTokens:     prev.totalTokens + usage.total,
            messageCount:    prev.messageCount + 1,
            byModel: {
              ...prev.byModel,
              [result.model ?? selectedModel]: (prev.byModel[result.model ?? selectedModel] ?? 0) + usage.total,
            },
          };
          return next;
        });
      }

      // Self-improvement: extract memory every 4 exchanges
      if (updated.filter((m) => m.role === "assistant").length % 4 === 0) {
        extractMemory(updated, memory);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Something went wrong. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_MESSAGES);
  };

  const clearMemory = () => {
    setMemory("");
    setEditingMemory(false);
  };

  const saveMemoryEdit = () => {
    setMemory(memoryDraft);
    setEditingMemory(false);
  };

  const adjustTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const triggerMemoryExtract = () => {
    if (messages.length >= 2) extractMemory(messages, memory);
  };

  const currentModelName = MODEL_LABELS[selectedModel] ?? selectedModel.split("/").pop() ?? selectedModel;
  const isServerUp = statusData?.running;
  const hasStats   = stats.totalTokens > 0;
  const memoryLen  = memory.length;

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 font-sans overflow-hidden">

      {/* ── Memory / History Side Panel ─────────────────────────────────── */}
      {(memoryOpen || historyOpen) && (
        <div className="w-72 shrink-0 border-r border-gray-800 bg-gray-900 flex flex-col overflow-hidden">
          {/* Panel tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => { setMemoryOpen(true); setHistoryOpen(false); }}
              className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${memoryOpen ? "text-green-400 border-b-2 border-green-400" : "text-gray-500 hover:text-gray-300"}`}
            >
              <Brain className="w-3.5 h-3.5" /> Memory
            </button>
            <button
              onClick={() => { setHistoryOpen(true); setMemoryOpen(false); }}
              className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${historyOpen ? "text-green-400 border-b-2 border-green-400" : "text-gray-500 hover:text-gray-300"}`}
            >
              <History className="w-3.5 h-3.5" /> History
            </button>
            <button
              onClick={() => { setMemoryOpen(false); setHistoryOpen(false); }}
              className="px-3 text-gray-600 hover:text-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Memory Panel */}
          {memoryOpen && (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-semibold text-gray-300">AI Memory</span>
                  {isExtractingMemory && (
                    <Loader2 className="w-3 h-3 animate-spin text-green-400" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={triggerMemoryExtract}
                    disabled={messages.length < 2 || isExtractingMemory}
                    title="Extract memory from conversation"
                    className="p-1 rounded text-gray-500 hover:text-green-400 disabled:opacity-40 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                  {!editingMemory && (
                    <button
                      onClick={() => { setMemoryDraft(memory); setEditingMemory(true); }}
                      className="p-1 rounded text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={clearMemory}
                    className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                The AI automatically extracts and updates these notes every 4 exchanges.
                It uses them to personalise future replies.
              </p>

              {editingMemory ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={memoryDraft}
                    onChange={(e) => setMemoryDraft(e.target.value)}
                    rows={10}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 resize-none outline-none focus:border-green-500 leading-relaxed"
                    placeholder="Write memory notes..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveMemoryEdit}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-green-600 hover:bg-green-500 rounded-lg text-white transition-colors"
                    >
                      <Check className="w-3 h-3" /> Save
                    </button>
                    <button
                      onClick={() => setEditingMemory(false)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : memory ? (
                <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap border border-gray-700">
                  {memory}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Brain className="w-8 h-8 text-gray-700" />
                  <p className="text-xs text-gray-600">
                    No memory yet. Chat for a while and the AI will start learning about you.
                  </p>
                  <button
                    onClick={() => { setMemoryDraft(""); setEditingMemory(true); }}
                    className="text-xs text-green-500 hover:text-green-400 underline"
                  >
                    Add manually
                  </button>
                </div>
              )}

              {memoryLen > 0 && (
                <p className="text-xs text-gray-600">{memoryLen} characters stored</p>
              )}
            </div>
          )}

          {/* History Panel */}
          {historyOpen && (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <History className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-semibold text-gray-300">Chat History</span>
                </div>
                <button
                  onClick={clearChat}
                  className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors"
                  title="Clear history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Last {Math.min(messages.length, MAX_STORED_MSGS)} messages saved across sessions.
              </p>
              {messages.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-8">No history yet.</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      m.role === "user"
                        ? "bg-green-900/30 border border-green-800/40 text-green-200"
                        : "bg-gray-800 border border-gray-700 text-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 opacity-60">
                      <span className="font-medium">{m.role === "user" ? "You" : (MODEL_LABELS[m.model ?? ""] ?? "AI")}</span>
                      <span>·</span>
                      <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="line-clamp-3">{m.content}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Main Chat Area ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">OpenCode Chat</h1>
              <p className="text-xs text-gray-400">NVIDIA NIM · MiniMax · Kimi K2</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Server status */}
            <div className="flex items-center gap-1.5 mr-1">
              <div className={`w-2 h-2 rounded-full ${isServerUp ? "bg-green-400" : "bg-yellow-400"}`} />
              <span className="text-xs text-gray-400 hidden sm:block">
                {isServerUp ? "OpenCode" : "Direct API"}
              </span>
            </div>

            {/* Memory button */}
            <button
              onClick={() => { setMemoryOpen((v) => !v); setHistoryOpen(false); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                memoryOpen
                  ? "bg-green-500/20 border-green-500/50 text-green-400"
                  : memory
                  ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
              }`}
              title="AI Memory"
            >
              <Brain className="w-3.5 h-3.5" />
              {isExtractingMemory && <Loader2 className="w-3 h-3 animate-spin" />}
              <span className="hidden sm:block">{memory ? "Memory" : "Memory"}</span>
              {memory && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
            </button>

            {/* History button */}
            <button
              onClick={() => { setHistoryOpen((v) => !v); setMemoryOpen(false); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                historyOpen
                  ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
              }`}
              title="Chat history"
            >
              <History className="w-3.5 h-3.5" />
            </button>

            {/* Token stats pill */}
            {hasStats && (
              <button
                onClick={() => setStatsOpen((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 transition-colors"
              >
                <Coins className="w-3.5 h-3.5" />
                <span className="hidden sm:block">{fmtTokens(stats.totalTokens)}</span>
              </button>
            )}

            {/* Model picker */}
            <div className="relative">
              <button
                onClick={() => setModelDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 text-gray-200 transition-colors"
              >
                <Bot className="w-3.5 h-3.5 text-green-400" />
                <span className="max-w-[90px] truncate hidden sm:block">{currentModelName}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              {modelDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-60 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {(models.length > 0
                    ? models
                    : Object.entries(MODEL_LABELS).map(([id, name]) => ({ id, name, provider: "nvidia", contextLength: 65536 }))
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setModelDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-xs hover:bg-gray-700 transition-colors ${selectedModel === m.id ? "text-green-400 bg-gray-700/50" : "text-gray-200"}`}
                    >
                      <div className="font-medium flex items-center gap-1.5">
                        {m.name}
                        {m.id === DEFAULT_MODEL && <span className="text-green-500 text-[10px] bg-green-500/10 px-1.5 rounded-full">default</span>}
                        {m.id === FALLBACK_MODEL && <span className="text-blue-400 text-[10px] bg-blue-500/10 px-1.5 rounded-full">fallback</span>}
                      </div>
                      <div className="text-gray-500 mt-0.5 flex items-center justify-between">
                        <span>{(m.contextLength ?? 0).toLocaleString()} ctx</span>
                        {stats.byModel[m.id] != null && (
                          <span className="text-green-500">{fmtTokens(stats.byModel[m.id]!)} used</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* New chat */}
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 text-gray-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:block">New</span>
            </button>
          </div>
        </header>

        {/* Token Stats Panel */}
        {statsOpen && hasStats && (
          <div className="shrink-0 border-b border-gray-800 bg-gray-900/50 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs font-semibold text-gray-300">Session Token Usage</span>
              <button onClick={() => setStatsOpen(false)} className="ml-auto text-xs text-gray-500 hover:text-gray-300">close</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total tokens",   value: stats.totalTokens.toLocaleString(),     color: "text-green-400" },
                { label: "Prompt tokens",  value: stats.totalPrompt.toLocaleString(),      color: "text-blue-400" },
                { label: "Completion",     value: stats.totalCompletion.toLocaleString(),  color: "text-purple-400" },
                { label: "Exchanges",      value: String(stats.messageCount),              color: "text-yellow-400" },
              ].map((s) => (
                <div key={s.label} className="bg-gray-800 rounded-lg px-3 py-2">
                  <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-16">
              <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <Zap className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white mb-2">Chat with NVIDIA AI</h2>
                <p className="text-sm text-gray-400 max-w-sm">
                  Powered by MiniMax M2.7 with Kimi K2.6 fallback. Remembers your conversations and learns over time.
                </p>
              </div>
              {memory && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full text-xs text-green-400">
                  <Brain className="w-3.5 h-3.5" />
                  Memory active — AI knows your preferences
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl w-full">
                {[
                  { label: "Write code",     prompt: "Write a Python function that merges two sorted lists efficiently." },
                  { label: "Debug issue",    prompt: "My React component re-renders infinitely. How do I fix this?" },
                  { label: "Explain concept", prompt: "Explain how transformer attention mechanisms work." },
                ].map((s) => (
                  <button
                    key={s.label}
                    onClick={() => { setInput(s.prompt); textareaRef.current?.focus(); }}
                    className="p-3 text-left text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl transition-colors group"
                  >
                    <div className="font-medium text-gray-200 group-hover:text-white mb-1">{s.label}</div>
                    <div className="text-gray-500 line-clamp-2">{s.prompt}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-green-600 text-white rounded-br-sm"
                  : "bg-gray-800 text-gray-100 rounded-bl-sm"
              }`}>
                <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                <div className={`flex flex-wrap items-center gap-2 mt-1.5 text-xs ${msg.role === "user" ? "text-green-200" : "text-gray-500"}`}>
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {msg.usedFallback && (
                    <span className="flex items-center gap-1 text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full text-[10px]">
                      fallback: {MODEL_LABELS[msg.model ?? ""] ?? msg.model}
                    </span>
                  )}
                  {msg.tokens && (
                    <span className="flex items-center gap-1">
                      <Coins className="w-3 h-3" />
                      {msg.tokens.total.toLocaleString()} tokens
                      <span className="opacity-50">({msg.tokens.prompt}↑ {msg.tokens.completion}↓)</span>
                    </span>
                  )}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center shrink-0 mt-1">
                  <User className="w-4 h-4 text-gray-300" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin text-green-400" />
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Token summary bar */}
        {hasStats && (
          <div className="shrink-0 border-t border-gray-800 bg-gray-900/40 px-4 py-1.5 flex items-center gap-3 text-xs text-gray-500">
            <button
              onClick={() => setStatsOpen((v) => !v)}
              className="flex items-center gap-1.5 hover:text-gray-300 transition-colors"
            >
              <Coins className="w-3 h-3 text-green-500" />
              <span className="text-green-400 font-medium">{stats.totalTokens.toLocaleString()}</span>
              <span>tokens</span>
            </button>
            <span className="text-gray-700">·</span>
            <span><span className="text-blue-400">{stats.totalPrompt.toLocaleString()}</span> prompt</span>
            <span className="text-gray-700">·</span>
            <span><span className="text-purple-400">{stats.totalCompletion.toLocaleString()}</span> completion</span>
            {isExtractingMemory && (
              <>
                <span className="text-gray-700">·</span>
                <span className="flex items-center gap-1 text-green-400">
                  <Sparkles className="w-3 h-3 animate-pulse" /> updating memory
                </span>
              </>
            )}
          </div>
        )}

        {/* Input */}
        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-3 flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); adjustTextarea(); }}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${currentModelName}… (Enter to send, Shift+Enter for newline)`}
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none outline-none leading-relaxed min-h-[24px] max-h-[160px]"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="w-8 h-8 rounded-xl bg-green-500 hover:bg-green-400 disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
            >
              {isLoading
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : <Send className="w-4 h-4 text-white" />
              }
            </button>
          </div>
          <p className="text-xs text-gray-600 text-center mt-1.5">
            {currentModelName} · fallback: {MODEL_LABELS[FALLBACK_MODEL]} · memory {memory ? "on" : "off"}
          </p>
        </div>
      </div>

      {/* Close dropdowns on outside click */}
      {modelDropdownOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
      )}
    </div>
  );
}
