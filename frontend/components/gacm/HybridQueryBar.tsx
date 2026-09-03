'use client';

import { useState } from 'react';
import { Search, Sparkles, Database, Network, Loader2 } from '@/components/gacm/Icons';
import { GACMQueryResponse } from '@/types/gacm';

interface HybridQueryBarProps {
  onExecuteQuery: (query: string) => Promise<void>;
  queryResult: GACMQueryResponse | null;
  isLoading: boolean;
}

/**
 * Regex Highlighting Formatter:
 * Parses **text** syntax and renders styled HTML <mark> elements with amber highlight background.
 */
function formatHighlightedMarkdown(text: string) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const content = part.slice(2, -2);
      return (
        <mark key={index} className="bg-amber-100 text-amber-950 font-bold px-1.5 py-0.5 rounded border border-amber-300 mx-0.5 inline-block">
          {content}
        </mark>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export default function HybridQueryBar({
  onExecuteQuery,
  queryResult,
  isLoading
}: HybridQueryBarProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onExecuteQuery(prompt);
  };

  const citationsList = queryResult?.pgvector_citations || queryResult?.vector_citations || queryResult?.matched_citations || [];

  return (
    <div className="space-y-4">
      {/* Search Input Bar */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center bg-white border border-slate-300 focus-within:border-gold rounded-none overflow-hidden shadow-sm transition-all">
          <Search className="w-5 h-5 text-slate-500 ml-4 mr-2" />
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask GACM AI: e.g. 'Who are top experts in Oceanography and coastal systems?'..."
            className="w-full bg-transparent py-3.5 pr-4 text-slate-900 text-sm placeholder-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !prompt.trim()}
            className="bg-gold hover:bg-yellow-400 disabled:opacity-50 text-navy px-6 py-3.5 font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Synthesizing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-navy" /> Synthesize
              </>
            )}
          </button>
        </div>
      </form>

      {/* Live Tool Execution Stages Indicator - VERTICAL BOXES LAYOUT */}
      {isLoading && (
        <div className="bg-amber-50 border border-amber-300 p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-xs border-b border-amber-200 pb-2">
            <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
            <span>Google ADK Agent Executing Tool Calls...</span>
          </div>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center gap-2.5 bg-white px-3 py-2 border border-amber-200 text-slate-800 font-semibold shadow-xs">
              <span className="text-base">🧠</span> <span>1. Thinking & Query Intent Analysis</span>
            </div>
            <div className="flex items-center gap-2.5 bg-white px-3 py-2 border border-amber-200 text-slate-800 font-semibold shadow-xs">
              <span className="text-base">🕸️</span> <span>2. Traversing Memgraph Cypher Knowledge Graph</span>
            </div>
            <div className="flex items-center gap-2.5 bg-white px-3 py-2 border border-amber-200 text-slate-800 font-semibold shadow-xs">
              <span className="text-base">📌</span> <span>3. Searching PostgreSQL 384d Vector Embeddings</span>
            </div>
            <div className="flex items-center gap-2.5 bg-white px-3 py-2 border border-amber-200 text-slate-800 font-semibold shadow-xs">
              <span className="text-base">🎓</span> <span>4. Grounding via Google Scholar Academic Search</span>
            </div>
          </div>
        </div>
      )}

      {/* Query Result Card */}
      {queryResult && !isLoading && (
        <div className="bg-white border border-slate-300 rounded-none p-5 shadow-sm space-y-4 text-xs">
          {/* Header - VERTICAL BADGE LAYOUT */}
          <div className="border-b border-slate-200 pb-3">
            <div className="flex flex-col items-start gap-1.5 text-slate-600 text-[11px]">
              <h4 className="font-bold text-sm text-navy mb-1 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" /> Google ADK Agent Synthesized Answer
              </h4>
              <span className="font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 border border-blue-200">
                📌 PGVector: {citationsList.length} matches
              </span>
              <span className="font-semibold text-purple-700 bg-purple-50 px-2.5 py-0.5 border border-purple-200">
                🕸️ Memgraph: {queryResult?.graph_nodes?.length || 0} nodes
              </span>
              <span className="font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 border border-emerald-200">
                🌐 Google Web: {queryResult?.google_online_citations?.length || 0} results
              </span>
            </div>
          </div>

          {/* Out of Scope Warning Banner (STRICT STOP - NO FURTHER AI ANSWER GENERATED) */}
          {queryResult.is_out_of_scope ? (
            <div className="bg-red-50 border-l-4 border-red-600 p-4 text-red-900 space-y-1">
              <div className="flex items-center gap-2 text-red-700 font-bold text-sm uppercase tracking-wider">
                <span className="text-base">⚠️</span> OUT OF PROJECT SCOPE QUESTION DETECTED
              </div>
              <p className="text-red-800 text-xs leading-relaxed">
                This query does not directly match UTC university research grants or meeting agendas. Below is a general AI synthesis along with live Google web grounding.
              </p>
            </div>
          ) : (
            /* Synthesized Answer Box with Regex Highlighting */
            queryResult.synthesized_answer && (
              <div className="text-slate-800 leading-relaxed text-sm bg-slate-50 p-4 rounded-none border border-slate-200 whitespace-pre-wrap font-sans">
                {formatHighlightedMarkdown(queryResult.synthesized_answer)}
              </div>
            )
          )}

          {/* Source-Attributed Citations */}
          <div className="space-y-3 pt-2">
            {/* 1. PostgreSQL Vector Match Citations */}
            {citationsList.length > 0 && !queryResult.is_out_of_scope && (
              <div>
                <h5 className="font-bold text-blue-900 mb-2 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                  📌 PostgreSQL Vector Match Evidence ({citationsList.length})
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {citationsList.map((citation, idx) => (
                    <div key={idx} className="bg-blue-50/50 p-3 rounded-none border border-blue-200 text-[11px]">
                      <h6 className="font-bold text-navy truncate">{citation.project_title}</h6>
                      <p className="text-slate-600 text-[10px] mt-0.5">PI: <span className="text-amber-700 font-bold">{citation.faculty_name}</span> | Award: ${Number(citation.award_amount).toLocaleString()}</p>
                      <p className="text-slate-500 text-[10px] line-clamp-2 mt-1 italic">&ldquo;{citation.abstract_snippet}&rdquo;</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Google Scholar Online Web Search Citations */}
            {queryResult.google_online_citations && queryResult.google_online_citations.length > 0 && !queryResult.is_out_of_scope && (
              <div>
                <h5 className="font-bold text-emerald-900 mb-2 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                  🎓 Google Scholar Academic Search Grounding ({queryResult.google_online_citations.length})
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {queryResult.google_online_citations.map((web, idx) => (
                    <div key={idx} className="bg-emerald-50/50 p-3 rounded-none border border-emerald-200 text-[11px]">
                      <a href={web.url} target="_blank" rel="noreferrer" className="font-bold text-emerald-800 hover:underline truncate block">
                        {web.title}
                      </a>
                      <p className="text-emerald-600 text-[10px] truncate mt-0.5 font-mono">{web.url}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
