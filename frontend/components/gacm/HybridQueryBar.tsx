'use client';

import { useState } from 'react';
import { Search, Sparkles, Database, Network, Loader2 } from '@/components/gacm/Icons';
import { GACMQueryResponse } from '@/types/gacm';

interface HybridQueryBarProps {
  onExecuteQuery: (query: string) => Promise<void>;
  queryResult: GACMQueryResponse | null;
  isLoading: boolean;
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
                <Loader2 className="w-4 h-4 animate-spin" /> Querying...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-navy" /> Synthesize
              </>
            )}
          </button>
        </div>
      </form>

      {/* Query Result Card */}
      {queryResult && (
        <div className="bg-white border border-slate-300 rounded-none p-5 shadow-sm space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <h4 className="font-bold text-sm text-navy">GACM Synthesized Hybrid Response</h4>
            </div>
            <div className="flex items-center gap-3 text-slate-600 text-[11px]">
              <span className="flex items-center gap-1 font-medium">
                <Database className="w-3.5 h-3.5 text-blue-600" /> Vector Matches: {queryResult?.vector_citations?.length || 0}
              </span>
              <span className="flex items-center gap-1 font-medium">
                <Network className="w-3.5 h-3.5 text-amber-600" /> Graph Subgraph: {queryResult?.graph_nodes?.length || 0} nodes
              </span>
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-none font-mono font-bold">
                Score: {((queryResult?.confidence_score || 0) * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <p className="text-slate-800 leading-relaxed text-sm bg-slate-50 p-4 rounded-none border border-slate-200">
            {queryResult.synthesized_answer}
          </p>

          {/* Vector Evidence Citations */}
          {queryResult?.vector_citations && queryResult.vector_citations.length > 0 && (
            <div>
              <h5 className="font-semibold text-slate-600 mb-2 uppercase text-[10px] tracking-wider">Verified Evidence Citations (PostgreSQL Vector Store)</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {queryResult.vector_citations.map((citation, idx) => (
                  <div key={idx} className="bg-slate-50 p-3.5 rounded-none border border-slate-200">
                    <h6 className="font-bold text-navy truncate">{citation.project_title}</h6>
                    <p className="text-slate-600 text-[11px] mt-0.5">Faculty: <span className="text-amber-700 font-bold">{citation.faculty_name}</span> | Award: ${Number(citation.award_amount).toLocaleString()}</p>
                    <p className="text-slate-500 text-[10px] line-clamp-2 mt-1 italic">&ldquo;{citation.abstract_snippet}&rdquo;</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
