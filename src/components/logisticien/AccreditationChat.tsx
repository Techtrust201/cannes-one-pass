"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import { Send, MessageSquare, ChevronDown, Loader2, Languages } from "lucide-react";
import { LANGUAGES, type LangCode } from "@/lib/translations";

interface ChatMessage {
  id: number;
  userId: string;
  userName: string;
  message: string;
  createdAt: string;
}

interface AccreditationChatProps {
  accreditationId: string;
  className?: string;
  compact?: boolean;
  defaultCollapsed?: boolean;
}

const TRANSLATE_LANGS = LANGUAGES.map((l) => ({ code: l.code, label: l.label, flag: l.flag }));

export default function AccreditationChat({
  accreditationId,
  className = "",
  compact = false,
  defaultCollapsed = true,
}: AccreditationChatProps) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(!defaultCollapsed);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [targetLang, setTargetLang] = useState<LangCode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("chat_translate_lang");
      if (stored) return stored as LangCode;
    }
    return "fr";
  });
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [translating, setTranslating] = useState<Record<number, boolean>>({});
  const [showLangPicker, setShowLangPicker] = useState(false);
  const langPickerRef = useRef<HTMLDivElement>(null);

  const currentUserId = session?.user?.id;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (langPickerRef.current && !langPickerRef.current.contains(e.target as Node)) {
        setShowLangPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/accreditations/${accreditationId}/chat?limit=100`
      );
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => {
          if (prev.length !== data.messages.length) return data.messages;
          const lastPrev = prev[prev.length - 1];
          const lastNew = data.messages[data.messages.length - 1];
          if (lastPrev?.id !== lastNew?.id) return data.messages;
          return prev;
        });
      }
    } catch (err) {
      console.error("Erreur chargement messages:", err);
    } finally {
      setLoading(false);
    }
  }, [accreditationId]);

  useEffect(() => {
    if (!isOpen) return;
    fetchMessages();
    pollingRef.current = setInterval(fetchMessages, 5000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isOpen, fetchMessages]);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSend = useCallback(async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(
        `/api/accreditations/${accreditationId}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: newMessage.trim() }),
        }
      );
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, msg]);
        setNewMessage("");
        inputRef.current?.focus();
      }
    } catch (err) {
      console.error("Erreur envoi message:", err);
    } finally {
      setSending(false);
    }
  }, [accreditationId, newMessage, sending]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const translateMessage = useCallback(async (msgId: number, text: string) => {
    if (translations[msgId]) {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
      return;
    }

    setTranslating((prev) => ({ ...prev, [msgId]: true }));
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, from: "auto", to: targetLang }),
      });
      if (res.ok) {
        const data = await res.json();
        setTranslations((prev) => ({ ...prev, [msgId]: data.translatedText }));
      }
    } catch (err) {
      console.error("Translation error:", err);
    } finally {
      setTranslating((prev) => ({ ...prev, [msgId]: false }));
    }
  }, [targetLang, translations]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const groupedMessages = messages.reduce<Record<string, ChatMessage[]>>(
    (groups, msg) => {
      const date = new Date(msg.createdAt).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(msg);
      return groups;
    },
    {}
  );

  const currentLang = TRANSLATE_LANGS.find((l) => l.code === targetLang);

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[#4F587E] hover:bg-gray-50 transition"
      >
        <span className="flex items-center gap-2">
          <MessageSquare size={16} />
          Discussion agents
          {messages.length > 0 && (
            <span className="bg-[#4F587E] text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
              {messages.length}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="border-t border-gray-100">
          {/* Language selector for translation */}
          <div className="flex items-center justify-end px-3 py-1.5 border-b border-gray-100 bg-gray-50/80">
            <div ref={langPickerRef} className="relative">
              <button
                type="button"
                onClick={() => setShowLangPicker((v) => !v)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-500 hover:bg-gray-100 transition"
                title="Langue de traduction"
              >
                <Languages size={13} />
                <span>{currentLang?.flag} {currentLang?.label}</span>
                <ChevronDown size={11} className={`transition-transform ${showLangPicker ? "rotate-180" : ""}`} />
              </button>
              {showLangPicker && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[150px] z-50 max-h-[200px] overflow-y-auto">
                  {TRANSLATE_LANGS.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => {
                        setTargetLang(l.code);
                        localStorage.setItem("chat_translate_lang", l.code);
                        setTranslations({});
                        setShowLangPicker(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 transition ${
                        l.code === targetLang ? "bg-gray-100 font-semibold" : ""
                      }`}
                    >
                      <span>{l.flag}</span>
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div
            ref={containerRef}
            className={`overflow-y-auto px-3 py-2 space-y-1 bg-gray-50/50 ${
              compact ? "max-h-[250px]" : "max-h-[350px]"
            }`}
          >
            {loading ? (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 size={20} className="animate-spin mr-2" />
                Chargement...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400 text-sm">
                <MessageSquare size={24} className="mb-2 opacity-50" />
                Aucun message
                <span className="text-xs mt-1">
                  Commencez la discussion entre agents
                </span>
              </div>
            ) : (
              Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date}>
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[10px] text-gray-400 uppercase font-medium px-2">
                      {date}
                    </span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  {msgs.map((msg) => {
                    const isMe = msg.userId === currentUserId;
                    const translated = translations[msg.id];
                    const isTranslating = translating[msg.id];

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMe ? "justify-end" : "justify-start"} mb-2`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                            isMe
                              ? "bg-[#4F587E] text-white rounded-br-sm"
                              : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm"
                          }`}
                        >
                          {!isMe && (
                            <p className="text-[11px] font-semibold text-[#4F587E] mb-0.5">
                              {msg.userName}
                            </p>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.message}
                          </p>
                          {translated && (
                            <p className={`text-sm italic mt-1 pt-1 whitespace-pre-wrap break-words ${
                              isMe
                                ? "border-t border-white/20 text-white/90"
                                : "border-t border-gray-100 text-gray-600"
                            }`}>
                              {translated}
                            </p>
                          )}
                          <div className={`flex items-center gap-1.5 mt-1 ${isMe ? "justify-end" : "justify-between"}`}>
                            {!isMe && (
                              <button
                                type="button"
                                onClick={() => translateMessage(msg.id, msg.message)}
                                disabled={isTranslating}
                                className="text-[10px] text-[#4F587E]/60 hover:text-[#4F587E] transition flex items-center gap-0.5 disabled:opacity-50"
                              >
                                {isTranslating ? (
                                  <Loader2 size={9} className="animate-spin" />
                                ) : (
                                  <Languages size={9} />
                                )}
                                {translated ? "Original" : "Traduire"}
                              </button>
                            )}
                            {isMe && (
                              <button
                                type="button"
                                onClick={() => translateMessage(msg.id, msg.message)}
                                disabled={isTranslating}
                                className="text-[10px] text-white/50 hover:text-white/80 transition flex items-center gap-0.5 disabled:opacity-50 mr-1"
                              >
                                {isTranslating ? (
                                  <Loader2 size={9} className="animate-spin" />
                                ) : (
                                  <Languages size={9} />
                                )}
                                {translated ? "Original" : "Traduire"}
                              </button>
                            )}
                            <p
                              className={`text-[10px] text-right ${
                                isMe ? "text-white/70" : "text-gray-400"
                              }`}
                            >
                              {formatTime(msg.createdAt)}
                              {isMe && (
                                <span className="ml-1 font-medium">• Vous</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-white">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Écrire un message..."
              className="flex-1 text-sm rounded-full border border-gray-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#4F587E]/30 focus:border-[#4F587E] transition"
              disabled={sending}
              maxLength={500}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-[#4F587E] text-white hover:bg-[#3d4563] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shrink-0"
            >
              {sending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
