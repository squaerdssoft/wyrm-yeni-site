// ─────────────────────────────────────────────────────────────────────────────
// WYRM AI — Chat API Layer
// Supports: Google Gemini & xAI Grok
// Set your keys in .env:
//   VITE_GEMINI_API_KEY=...
//   VITE_GROK_API_KEY=...
//   VITE_AI_PROVIDER=gemini | grok   (default: gemini)
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'user' | 'assistant';

export interface ChatMessage {
  role: Role;
  content: string;
  /** base64 data URL of attached image, if any */
  imageDataUrl?: string;
}

const PROVIDER = (import.meta.env.VITE_AI_PROVIDER as string) || 'gemini';

// ─── Gemini ───────────────────────────────────────────────────────────────────

async function callGemini(history: ChatMessage[]): Promise<string> {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set');

  const MODEL = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  const contents = history.map(msg => {
    const parts: unknown[] = [];

    if (msg.imageDataUrl) {
      const [meta, data] = msg.imageDataUrl.split(',');
      const mimeType = meta.split(':')[1].split(';')[0];
      parts.push({ inlineData: { mimeType, data } });
    }
    parts.push({ text: msg.content || ' ' });

    return { role: msg.role === 'assistant' ? 'model' : 'user', parts };
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{
          text: 'You are WYRM, a highly advanced AI assistant. Be concise, intelligent, and helpful. Respond in the same language the user writes in.',
        }],
      },
      generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no response)';
}

// ─── Grok (xAI) ───────────────────────────────────────────────────────────────

async function callGrok(history: ChatMessage[]): Promise<string> {
  const API_KEY = import.meta.env.VITE_GROK_API_KEY as string;
  if (!API_KEY) throw new Error('VITE_GROK_API_KEY is not set');

  const messages: unknown[] = [
    {
      role: 'system',
      content: 'You are WYRM, a highly advanced AI assistant. Be concise, intelligent, and helpful. Respond in the same language the user writes in.',
    },
    ...history.map(msg => {
      if (msg.imageDataUrl) {
        return {
          role: msg.role,
          content: [
            { type: 'image_url', image_url: { url: msg.imageDataUrl } },
            { type: 'text', text: msg.content || ' ' },
          ],
        };
      }
      return { role: msg.role, content: msg.content };
    }),
  ];

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: 'grok-3', messages, max_tokens: 2048 }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok API error ${res.status}: ${err}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '(no response)';
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function sendChatMessage(history: ChatMessage[]): Promise<string> {
  if (PROVIDER === 'grok') return callGrok(history);
  return callGemini(history);
}
