import { useState, useRef, useEffect, useCallback } from 'react';
import DarkVeil from './DarkVeil';
import { sendChatMessage, type ChatMessage } from './api/chat';

// ─────────────────────────────────────────────────────────────────────────────

interface UIMessage extends ChatMessage {
  id: number;
  typing?: boolean;
  fileAttachment?: { name: string; size: string; type: string };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function isImageMime(type: string) {
  return type.startsWith('image/');
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatStarted, setChatStarted] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [attachment, setAttachment] = useState<{
    dataUrl: string; name: string; size: string; type: string;
  } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setAttachment({
        dataUrl: ev.target!.result as string,
        name: file.name,
        size: formatBytes(file.size),
        type: file.type,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeAttachment = () => setAttachment(null);

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !attachment) || isThinking) return;

    setApiError(null);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    if (!chatStarted) setChatStarted(true);

    const userMsg: UIMessage = {
      id: nextId.current++,
      role: 'user',
      content: text,
      ...(attachment ? {
        imageDataUrl: attachment.dataUrl,
        fileAttachment: { name: attachment.name, size: attachment.size, type: attachment.type },
      } : {}),
    };

    setMessages(prev => [...prev, userMsg]);
    setAttachment(null);
    setIsThinking(true);

    const apiHistory: ChatMessage[] = [...messages, userMsg]
      .slice(-20)
      .map(({ role, content, imageDataUrl }) => ({ role, content, imageDataUrl }));

    try {
      const reply = await sendChatMessage(apiHistory);
      const aiMsgId = nextId.current++;
      setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', typing: true }]);
      setIsThinking(false);
      for (let i = 1; i <= reply.length; i++) {
        await new Promise(r => setTimeout(r, 12));
        setMessages(prev =>
          prev.map(m => m.id === aiMsgId
            ? { ...m, content: reply.slice(0, i), typing: i < reply.length }
            : m
          )
        );
      }
    } catch (err) {
      setIsThinking(false);
      setApiError(err instanceof Error ? err.message : String(err));
    }
  }, [input, attachment, isThinking, chatStarted, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const hasNoKeys = !import.meta.env.VITE_GEMINI_API_KEY && !import.meta.env.VITE_GROK_API_KEY;
  const providerLabel = import.meta.env.VITE_AI_PROVIDER === 'grok' ? 'Grok 3' : 'Gemini 2.0 Flash';

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">

      {/* ── Background canvas ──────────────────────────────────────────────── */}
      <div className="absolute inset-0">
        <DarkVeil
          hueShift={20}
          noiseIntensity={0.025}
          scanlineIntensity={0.06}
          scanlineFrequency={500}
          speed={0.35}
          warpAmount={0.9}
          resolutionScale={1}
        />
      </div>
      {/* subtle vignette only — no text overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none" />

      {/* ── Top-left brand ─────────────────────────────────────────────────── */}
      {/* Replace the <div> below with your own <img> logo when ready */}
      <div className="absolute top-5 left-5 z-30 flex items-center gap-2.5 select-none pointer-events-none">
        {/* LOGO PLACEHOLDER — swap for: <img src="/logo.svg" className="w-7 h-7" /> */}
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-violet-900/50">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <span className="text-white/70 text-sm font-semibold tracking-[0.22em] uppercase">WYRM</span>
      </div>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      {/*
        This layer is always full-screen and sits above the canvas.
        When chatStarted=false it is invisible (opacity-0 + pointer-events-none).
        When chatStarted=true it fades in and becomes scrollable.
        The bottom padding reserves space for the input dock.
      */}
      <div
        className="absolute inset-0 overflow-y-auto chat-messages px-4"
        style={{
          paddingTop: '72px',
          paddingBottom: '110px',
          opacity: chatStarted ? 1 : 0,
          pointerEvents: chatStarted ? 'auto' : 'none',
          transition: 'opacity 0.45s ease 0.2s',
        }}
      >
        <div className="mx-auto w-full max-w-2xl flex flex-col">
          {messages.map(msg => (
            <div key={msg.id} className={`flex mb-5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

              {/* AI avatar */}
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-700 flex items-center justify-center mr-3 mt-0.5 flex-shrink-0 shadow-md shadow-violet-900/40">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
              )}

              <div className={`flex flex-col gap-2 max-w-[78%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {/* Image attachment */}
                {msg.fileAttachment && isImageMime(msg.fileAttachment.type) && msg.imageDataUrl && (
                  <img
                    src={msg.imageDataUrl}
                    alt={msg.fileAttachment.name}
                    className="rounded-xl max-w-xs max-h-52 object-cover border border-white/10 shadow-lg"
                  />
                )}
                {/* File attachment */}
                {msg.fileAttachment && !isImageMime(msg.fileAttachment.type) && (
                  <div className="flex items-center gap-2.5 bg-white/8 border border-white/10 rounded-xl px-3 py-2 backdrop-blur-sm">
                    <div className="w-8 h-8 rounded-lg bg-violet-600/40 flex items-center justify-center flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white/80 text-xs font-medium leading-none mb-0.5">{msg.fileAttachment.name}</p>
                      <p className="text-white/30 text-xs">{msg.fileAttachment.size}</p>
                    </div>
                  </div>
                )}
                {/* Text bubble */}
                {(msg.content || !msg.fileAttachment) && (
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-violet-600/80 text-white rounded-tr-sm backdrop-blur-sm shadow-lg shadow-violet-900/20'
                      : 'bg-white/8 text-white/90 rounded-tl-sm backdrop-blur-sm border border-white/10 shadow-lg'
                  }`}>
                    {msg.content}
                    {msg.typing && (
                      <span className="inline-block w-0.5 h-4 ml-0.5 bg-white/70 align-middle animate-pulse rounded-sm" />
                    )}
                  </div>
                )}
              </div>

              {/* User avatar */}
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center ml-3 mt-0.5 flex-shrink-0 border border-white/10">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              )}
            </div>
          ))}

          {/* Thinking indicator */}
          {isThinking && (
            <div className="flex justify-start mb-5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-700 flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div className="bg-white/8 backdrop-blur-sm border border-white/10 px-4 py-3.5 rounded-2xl rounded-tl-sm flex items-center gap-1.5 shadow-lg">
                <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-violet-400" />
                <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-violet-400" />
                <span className="thinking-dot w-1.5 h-1.5 rounded-full bg-violet-400" />
              </div>
            </div>
          )}

          {/* API error */}
          {apiError && (
            <div className="flex justify-center mb-4">
              <div className="bg-red-500/15 border border-red-500/30 text-red-300 text-xs px-4 py-2.5 rounded-xl backdrop-blur-sm max-w-md text-center leading-relaxed">
                <strong>Hata: </strong>{apiError}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input dock ─────────────────────────────────────────────────────── */}
      {/*
        position: absolute
        When chatStarted=false → vertically centered (top:50%, translateY(-50%))
        When chatStarted=true  → pinned to bottom
        Smooth cubic-bezier transition between the two states.
      */}
      <div
        className="absolute left-0 right-0 z-20 px-4 transition-all duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]"
        style={chatStarted
          ? { bottom: '0', top: 'auto', transform: 'none', paddingBottom: '20px' }
          : { top: '50%', bottom: 'auto', transform: 'translateY(-50%)', paddingBottom: '0' }
        }
      >
        <div className="mx-auto w-full max-w-2xl flex flex-col">

          {/* Prompt suggestion chips — visible before chat starts */}
          <div
            className="flex flex-wrap gap-2 justify-center mb-4 transition-all duration-500"
            style={{
              opacity: chatStarted ? 0 : 1,
              pointerEvents: chatStarted ? 'none' : 'auto',
              maxHeight: chatStarted ? '0' : '48px',
              overflow: 'hidden',
              marginBottom: chatStarted ? '0' : undefined,
            }}
          >
            {['Yapay zeka nedir?', 'Kod yazma yardımı', 'Fikir üret', 'Görsel analiz et'].map(s => (
              <button
                key={s}
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
                className="px-3 py-1.5 rounded-full text-xs text-white/45 border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white/70 transition-all duration-150 backdrop-blur-sm"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Attachment preview strip */}
          {attachment && (
            <div className="flex items-center gap-2.5 mb-2 px-1">
              {isImageMime(attachment.type) ? (
                <div className="relative group">
                  <img
                    src={attachment.dataUrl}
                    alt={attachment.name}
                    className="h-16 w-16 object-cover rounded-xl border border-white/15 shadow-md"
                  />
                  <button
                    onClick={removeAttachment}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/80 border border-white/20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-white/8 border border-white/10 rounded-xl px-3 py-2 backdrop-blur-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="text-white/70 text-xs">{attachment.name}</span>
                  <span className="text-white/30 text-xs">· {attachment.size}</span>
                  <button
                    onClick={removeAttachment}
                    className="ml-1 w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Main input box */}
          <div className="bg-white/6 backdrop-blur-2xl border border-white/12 rounded-2xl shadow-2xl shadow-black/60 hover:border-white/18 transition-colors duration-200 focus-within:border-violet-500/50">
            <div className="flex items-end gap-2 px-4 pt-3.5 pb-3">

              {/* Attach file button */}
              <button
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'image/*,application/pdf,.txt,.md,.csv,.json,.js,.ts,.py,.html,.css';
                    fileInputRef.current.click();
                  }
                }}
                title="Dosya ekle"
                className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/8 transition-all duration-150 mb-0.5"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              {/* Attach image button */}
              <button
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'image/*';
                    fileInputRef.current.click();
                  }
                }}
                title="Görsel ekle"
                className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/8 transition-all duration-150 mb-0.5"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>

              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

              {/* Text input */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={chatStarted ? 'Bir mesaj yazın...' : 'WYRM ile konuşmaya başlayın...'}
                rows={1}
                disabled={isThinking}
                className="flex-1 bg-transparent text-white/90 placeholder-white/22 text-sm resize-none outline-none leading-relaxed disabled:opacity-50"
                style={{ minHeight: '24px', maxHeight: '120px' }}
              />

              {/* Send button */}
              <button
                onClick={sendMessage}
                disabled={(!input.trim() && !attachment) || isThinking}
                className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 mb-0.5 ${
                  (input.trim() || attachment) && !isThinking
                    ? 'bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-700/40 text-white scale-100'
                    : 'bg-white/6 text-white/20 cursor-not-allowed scale-95'
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>

            {/* Footer bar */}
            <div className="flex items-center justify-between px-4 pb-2.5">
              <span className="text-white/18 text-[10px] tracking-wide select-none">
                {hasNoKeys
                  ? '⚠ .env → VITE_GEMINI_API_KEY veya VITE_GROK_API_KEY'
                  : `WYRM · ${providerLabel}`}
              </span>
              <span className="text-white/15 text-[10px] select-none">↵ Gönder · ⇧↵ Satır</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
