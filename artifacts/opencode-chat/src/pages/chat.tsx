import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Bot, User, Zap, ChevronDown, Plus, Loader2, StopCircle } from "lucide-react";
import { useChatWithAI, useListModels, useGetOpencodeStatus } from "@workspace/api-client-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const MODEL_LABELS: Record<string, string> = {
  "moonshotai/kimi-k2-instruct": "Kimi K2 Instruct",
  "moonshotai/kimi-k2-thinking": "Kimi K2 Thinking",
  "moonshotai/kimi-k2.5": "Kimi K2.5 VLM",
  "moonshotai/kimi-k2.6": "Kimi K2.6 VLM",
  "minimax/minimax-m2.7": "MiniMax M2.7",
};

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("moonshotai/kimi-k2-instruct");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [sessionId] = useState(() => `web-${Date.now()}`);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: statusData } = useGetOpencodeStatus();
  const { data: modelsData } = useListModels();
  const models = modelsData?.models ?? [];

  const chatMutation = useChatWithAI();

  const isLoading = chatMutation.isPending;

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const result = await chatMutation.mutateAsync({
        data: {
          message: content,
          model: selectedModel,
          sessionId,
          history,
        },
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, something went wrong. Please check your NVIDIA API key and try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const adjustTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const currentModelName = MODEL_LABELS[selectedModel] ?? selectedModel.split("/").pop() ?? selectedModel;
  const isServerUp = statusData?.running;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">OpenCode Chat</h1>
            <p className="text-xs text-gray-400">NVIDIA NIM · Kimi K2 · MiniMax</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Server status */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${isServerUp ? "bg-green-400" : "bg-yellow-400"}`} />
            <span className="text-xs text-gray-400">
              {isServerUp ? "OpenCode running" : "Direct API mode"}
            </span>
          </div>

          {/* Model picker */}
          <div className="relative">
            <button
              onClick={() => setModelDropdownOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 text-gray-200 transition-colors"
            >
              <Bot className="w-3.5 h-3.5 text-green-400" />
              <span className="max-w-[120px] truncate">{currentModelName}</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
            {modelDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                {(models.length > 0 ? models : Object.entries(MODEL_LABELS).map(([id, name]) => ({ id, name, provider: "nvidia", contextLength: 131072 }))).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedModel(m.id); setModelDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-xs hover:bg-gray-700 transition-colors ${selectedModel === m.id ? "text-green-400 bg-gray-700/50" : "text-gray-200"}`}
                  >
                    <div className="font-medium">{m.name}</div>
                    <div className="text-gray-500 mt-0.5">{m.contextLength?.toLocaleString()} ctx</div>
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
            New chat
          </button>
        </div>
      </header>

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
                Powered by Kimi K2, Kimi K2.6, and MiniMax M2.7 via NVIDIA NIM.
                Also accessible from your Telegram bot.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl w-full">
              {[
                { label: "Write code", prompt: "Write a Python function that merges two sorted lists efficiently." },
                { label: "Debug issue", prompt: "My React component re-renders infinitely. How do I fix this?" },
                { label: "Explain concept", prompt: "Explain how transformer attention mechanisms work." },
              ].map((s) => (
                <button
                  key={s.label}
                  onClick={() => { setInput(s.prompt); textareaRef.current?.focus(); }}
                  className="p-3 text-left text-xs bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-xl transition-colors group"
                >
                  <div className="font-medium text-gray-200 group-hover:text-white mb-1">{s.label}</div>
                  <div className="text-gray-500 line-clamp-2">{s.prompt}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-green-600 text-white rounded-br-sm"
                  : "bg-gray-800 text-gray-100 rounded-bl-sm"
              }`}
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              <div className={`text-xs mt-1.5 ${msg.role === "user" ? "text-green-200" : "text-gray-500"}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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

      {/* Input */}
      <div className="shrink-0 px-4 pb-4">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-3 flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); adjustTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder="Message Kimi K2... (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 resize-none outline-none leading-relaxed min-h-[24px] max-h-[160px]"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 rounded-xl bg-green-500 hover:bg-green-400 disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
          </button>
        </div>
        <p className="text-xs text-gray-600 text-center mt-2">
          Model: {currentModelName} · Also available via Telegram · NVIDIA NIM API
        </p>
      </div>

      {/* Close dropdown on outside click */}
      {modelDropdownOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
      )}
    </div>
  );
}
