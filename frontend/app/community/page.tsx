'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchProjectTopics } from '@/lib/gacmApi';
import { Layers, MessageSquare, Award, Building, Search, Plus, Sparkles } from '@/components/gacm/Icons';

export default function CommunityPage() {
  const [topics, setTopics] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadTopics() {
      setIsLoading(true);
      try {
        const data = await fetchProjectTopics();
        setTopics(data || []);
      } catch (err) {
        console.warn('Failed to fetch project topics:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadTopics();
  }, []);

  const filteredTopics = topics.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-cream text-navy font-sans py-8 px-4 md:px-8">
      <div className="max-w-[1200px] mx-auto space-y-6">
        
        {/* Banner Header */}
        <div className="bg-navy border-b-4 border-gold p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-gold/20 text-gold border border-gold/40 text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5">
                Institutional Collaboration Forum
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gold tracking-tight">
              Project Topics & Research Spaces
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Explore active research topics, meeting dialog spaces, and institutional discussion forums linked directly to GACM Knowledge Graph entities.
            </p>
          </div>

          <button
            onClick={() => alert('New Topic Space Creation: Form ready for user input!')}
            className="bg-gold text-navy hover:bg-yellow-400 px-5 py-3 font-extrabold text-xs uppercase tracking-wider transition-colors flex items-center gap-2 shadow-md cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-navy" /> Start New Topic Space
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project topic spaces or research domains..."
            className="w-full bg-white border border-slate-300 pl-10 pr-4 py-2.5 text-xs text-navy placeholder-slate-400 focus:outline-none focus:border-gold shadow-sm"
          />
        </div>

        {/* Topics Grid */}
        {isLoading ? (
          <div className="py-20 text-center text-slate-500 text-sm">
            Loading Project Topic Spaces & Discussion Forums...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredTopics.map((topic) => (
              <div
                key={topic.id}
                className="bg-white border border-slate-300 hover:border-gold p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">
                      {topic.category}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 font-bold flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-600" /> {topic.total_discussions} Threads
                    </span>
                  </div>

                  <h2 className="text-base font-extrabold text-navy group-hover:text-amber-700 transition-colors mb-2">
                    {topic.title}
                  </h2>

                  <p className="text-xs text-slate-600 leading-relaxed mb-4">
                    {topic.description}
                  </p>

                  <div className="bg-slate-50 p-3 border border-slate-200 text-xs space-y-1">
                    <p className="text-slate-700">
                      Faculty PI / Lead: <span className="font-bold text-amber-700">{topic.faculty_lead}</span>
                    </p>
                    <p className="text-slate-500 text-[11px]">
                      Institution: {topic.institution}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-500 font-semibold">
                    {topic.total_projects} Linked Projects
                  </span>
                  <Link
                    href={`/post/${topic.id}`}
                    className="bg-navy text-gold hover:bg-slate-800 px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                  >
                    Enter Topic Space →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
