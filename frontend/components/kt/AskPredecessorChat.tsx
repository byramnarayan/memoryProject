'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface AskPredecessorChatProps {
  predecessorId: number;
  predecessorName: string;
  predecessorRole: string;
  predecessorDept: string;
}

interface ChatMessage {
  sender: 'user' | 'copilot';
  text: string;
  intuitionCaveats?: string;
  citations?: Array<{ reference_id: string; title: string; relevance_summary: string }>;
  confidence?: number;
  timestamp: string;
}

export default function AskPredecessorChat({
  predecessorId,
  predecessorName,
  predecessorRole,
  predecessorDept,
}: AskPredecessorChatProps) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'copilot',
      text: `Hello! I am ${predecessorName}'s AI Shadow Co-Pilot. I am grounded strictly in ${predecessorName}'s logged operational decisions, rejected trade-offs, incident post-mortems, and tacit workarounds. How can I help guide your succession?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const starterPrompts = [
    'How did you handle the Sector B3 watchdog reboot loop?',
    'What are your top unwritten workarounds for rain fade?',
    'Why was tower reset rejected during business hours?',
    'What vendor firmware quirks should I watch out for?',
  ];

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || inputText;
    if (!textToSend.trim() || !token) return;

    const userMsg: ChatMessage = {
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/kt/ask-predecessor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          predecessor_id: predecessorId,
          query: textToSend.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to query predecessor shadow brain.');
      }

      const data = await res.json();
      const copilotMsg: ChatMessage = {
        sender: 'copilot',
        text: data.synthesized_advice || 'No advice returned.',
        intuitionCaveats: data.unwritten_intuition_caveats,
        citations: data.citations || [],
        confidence: data.confidence_score || 90.0,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, copilotMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'copilot',
          text: `⚠️ Error querying shadow assistant: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-[#0b1120] border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[620px]">
      {/* Chat Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950/80 p-4 border-b border-slate-700/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-300 font-bold text-base shadow-inner">
            👤
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-white">{predecessorName}&apos;s Shadow Brain</h3>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                GROUNDED AI
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {predecessorRole} • <span className="text-amber-400/90">{predecessorDept}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Starter Prompt Pills */}
      <div className="bg-slate-900/60 p-2.5 border-b border-slate-800/80 flex gap-2 overflow-x-auto text-xs no-scrollbar">
        {starterPrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(prompt)}
            disabled={isLoading}
            className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-amber-500/20 hover:text-amber-300 border border-slate-700/60 text-slate-300 text-[11px] transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <span>💬</span> {prompt}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-4 text-xs md:text-sm leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-none shadow-md'
                  : 'bg-slate-900 border border-slate-700 text-slate-100 rounded-tl-none shadow-lg'
              }`}
            >
              <p className="whitespace-pre-line">{m.text}</p>

              {/* Tacit Intuition Highlight Card */}
              {m.intuitionCaveats && (
                <div className="mt-3 p-3 bg-amber-950/40 border-l-2 border-amber-500 rounded-r-lg text-xs text-amber-200">
                  <span className="font-bold text-amber-300 flex items-center gap-1 mb-1">
                    💡 Unwritten Caveat & Gut Instinct:
                  </span>
                  <p className="italic">{m.intuitionCaveats}</p>
                </div>
              )}

              {/* Citations */}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Grounded In Predecessor Log:
                  </span>
                  {m.citations.map((c, cIdx) => (
                    <div
                      key={cIdx}
                      className="p-1.5 rounded bg-slate-950/70 border border-slate-800 text-[11px] font-mono text-amber-300 flex items-center justify-between gap-2"
                    >
                      <span className="font-bold underline">{c.reference_id}</span>
                      <span className="text-slate-400 truncate text-[10px]">{c.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Meta timestamp & confidence */}
              <div className="flex items-center justify-between mt-2 pt-1 text-[10px] opacity-70">
                <span>{m.timestamp}</span>
                {m.confidence !== undefined && (
                  <span className="font-mono text-emerald-400 font-semibold">
                    {m.confidence}% Grounded
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-slate-400 text-xs p-2 bg-slate-900/60 rounded-lg w-fit border border-slate-800">
            <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            Synthesizing {predecessorName}&apos;s decisions and intuition...
          </div>
        )}
      </div>

      {/* Input Box */}
      <div className="p-3 bg-slate-900/90 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Ask ${predecessorName}'s shadow co-pilot anything...`}
            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs md:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={isLoading || !inputText.trim()}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs md:text-sm transition-all disabled:opacity-40 cursor-pointer"
          >
            Ask Brain
          </button>
        </form>
      </div>
    </div>
  );
}
