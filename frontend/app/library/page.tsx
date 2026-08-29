'use client';

import { useEffect, useState } from 'react';
import { fetchCommunities, fetchProjects } from '@/lib/gacmApi';
import { CommunityCluster } from '@/types/gacm';
import { Layers, Database, Search, Building, BookOpen, X, Info, Award } from '@/components/gacm/Icons';

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<'clusters' | 'projects'>('clusters');
  
  // Clusters state
  const [communities, setCommunities] = useState<CommunityCluster[]>([]);
  const [clusterSearch, setClusterSearch] = useState('');
  const [isClustersLoading, setIsClustersLoading] = useState(true);

  // Projects state
  const [projects, setProjects] = useState<any[]>([]);
  const [totalProjects, setTotalProjects] = useState(0);
  const [projectSearch, setProjectSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const limit = 18;
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);

  // Selected project for modal drawer
  const [selectedProject, setSelectedProject] = useState<any | null>(null);

  // Load Clusters
  useEffect(() => {
    async function loadClusters() {
      setIsClustersLoading(true);
      try {
        const data = await fetchCommunities();
        setCommunities(data || []);
      } catch (err) {
        console.warn('Failed to fetch clusters:', err);
      } finally {
        setIsClustersLoading(false);
      }
    }
    loadClusters();
  }, []);

  // Load Projects
  useEffect(() => {
    async function loadProjects() {
      setIsProjectsLoading(true);
      try {
        const res = await fetchProjects(skip, limit, projectSearch);
        setProjects(res.items || []);
        setTotalProjects(res.total || 0);
      } catch (err) {
        console.warn('Failed to fetch projects:', err);
      } finally {
        setIsProjectsLoading(false);
      }
    }
    loadProjects();
  }, [skip, projectSearch]);

  const filteredClusters = communities.filter(c => 
    (c.cluster_department || '').toLowerCase().includes(clusterSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-cream text-navy font-sans py-8 px-4 md:px-8">
      <div className="max-w-[1200px] mx-auto space-y-6">
        
        {/* Page Banner Header */}
        <div className="bg-navy border-b-4 border-gold p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-gold/20 text-gold border border-gold/40 text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5">
                Resource Library & Knowledge Catalog
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gold tracking-tight">
              Institutional Knowledge Library
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Explore 1,348 Louvain interdisciplinary research clusters and 21,422 institutional project records (NSF Research Grants & MISeD Meeting Dialog Transcripts).
            </p>
          </div>

          {/* Tab Selection Buttons */}
          <div className="flex items-center gap-2 bg-white/10 p-1.5 border border-white/20">
            <button
              onClick={() => setActiveTab('clusters')}
              className={`px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'clusters'
                  ? 'bg-gold text-navy shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" /> Research Clusters ({communities.length})
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'projects'
                  ? 'bg-gold text-navy shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" /> All Projects ({totalProjects > 0 ? totalProjects : '21,422'})
            </button>
          </div>
        </div>

        {/* TAB 1: RESEARCH CLUSTERS */}
        {activeTab === 'clusters' && (
          <div className="space-y-4">
            {/* Search Filter Bar */}
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={clusterSearch}
                onChange={(e) => setClusterSearch(e.target.value)}
                placeholder="Search research cluster department..."
                className="w-full bg-white border border-slate-300 pl-10 pr-4 py-2.5 text-xs text-navy placeholder-slate-400 focus:outline-none focus:border-gold shadow-sm"
              />
            </div>

            {/* Clusters Grid */}
            {isClustersLoading ? (
              <div className="py-20 text-center text-slate-500 text-sm">
                Loading Louvain Modularity Research Clusters...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredClusters.map((cluster, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-slate-300 hover:border-gold p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <span className="bg-purple-100 text-purple-800 border border-purple-300 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">
                          Cluster #{idx + 1}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 font-semibold">
                          {cluster.faculty_count} Faculty
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-navy line-clamp-2 mb-1">
                        {cluster.cluster_department}
                      </h3>
                    </div>

                    <div className="pt-3 border-t border-slate-100 mt-3 flex justify-between items-center text-xs">
                      <span className="text-slate-500">Linked Projects:</span>
                      <span className="font-extrabold text-gold font-mono text-sm bg-navy px-2 py-0.5">
                        {cluster.project_count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ALL PROJECTS */}
        {activeTab === 'projects' && (
          <div className="space-y-4">
            {/* Search Input Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="relative w-full max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={projectSearch}
                  onChange={(e) => {
                    setProjectSearch(e.target.value);
                    setSkip(0);
                  }}
                  placeholder="Search project title, faculty PI, institution, abstract..."
                  className="w-full bg-white border border-slate-300 pl-10 pr-4 py-2.5 text-xs text-navy placeholder-slate-400 focus:outline-none focus:border-gold shadow-sm"
                />
              </div>

              <div className="text-xs font-mono text-slate-600 font-semibold">
                Showing {skip + 1} - {Math.min(skip + limit, totalProjects)} of {totalProjects} Projects
              </div>
            </div>

            {/* Projects Grid */}
            {isProjectsLoading ? (
              <div className="py-20 text-center text-slate-500 text-sm">
                Fetching Institutional Project Records...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((proj, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedProject(proj)}
                    className="bg-white border border-slate-300 hover:border-gold p-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                          proj.is_mised_meeting
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}>
                          {proj.is_mised_meeting ? 'MISeD Meeting QA' : 'NSF Research Grant'}
                        </span>
                        {proj.award_amount > 0 && (
                          <span className="font-mono font-bold text-xs text-emerald-700">
                            ${Number(proj.award_amount).toLocaleString()}
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-xs text-navy group-hover:text-amber-700 transition-colors line-clamp-2 mb-2">
                        {proj.project_title}
                      </h3>

                      <p className="text-[11px] text-slate-600 mb-1">
                        PI / Speaker: <span className="font-bold text-navy">{proj.faculty_name}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 line-clamp-1 mb-2">
                        {proj.institution}
                      </p>

                      <p className="text-[11px] text-slate-500 line-clamp-3 italic bg-slate-50 p-2 border border-slate-100">
                        &ldquo;{proj.abstract}&rdquo;
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 mt-3 text-right">
                      <span className="text-[10px] font-bold text-amber-700 group-hover:underline">
                        View Project Evidence →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Bar */}
            <div className="flex justify-between items-center pt-4 border-t border-slate-300">
              <button
                onClick={() => setSkip(Math.max(0, skip - limit))}
                disabled={skip === 0 || isProjectsLoading}
                className="px-4 py-2 bg-navy text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
              >
                ← Previous Page
              </button>
              <span className="text-xs font-mono font-bold text-slate-700">
                Page {Math.floor(skip / limit) + 1} of {Math.ceil(totalProjects / limit)}
              </span>
              <button
                onClick={() => setSkip(skip + limit)}
                disabled={skip + limit >= totalProjects || isProjectsLoading}
                className="px-4 py-2 bg-navy text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
              >
                Next Page →
              </button>
            </div>
          </div>
        )}

      </div>

      {/* PROJECT DETAIL MODAL DRAWER */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border-2 border-gold max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto relative animate-in fade-in zoom-in-95">
            
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                  selectedProject.is_mised_meeting
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}>
                  {selectedProject.is_mised_meeting ? 'MISeD Meeting Dialog Record' : 'NSF Research Award Record'}
                </span>
                <h2 className="text-base font-extrabold text-navy mt-1.5">{selectedProject.project_title}</h2>
              </div>
              <button
                onClick={() => setSelectedProject(null)}
                className="text-slate-400 hover:text-slate-800 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 border border-slate-200">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Principal Investigator / Speaker</span>
                <span className="font-bold text-amber-700 text-sm">{selectedProject.faculty_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Institution / Consortium</span>
                <span className="font-bold text-navy">{selectedProject.institution}</span>
              </div>
              {selectedProject.award_amount > 0 && (
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Grant Award Amount</span>
                  <span className="font-extrabold text-emerald-700 font-mono text-sm">${Number(selectedProject.award_amount).toLocaleString()}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Database Identifier</span>
                <span className="font-mono text-slate-700">{selectedProject.grant_id}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase text-slate-600 mb-1 tracking-wider">Abstract / Dialog Transcript Snippet</h4>
              <p className="text-xs text-slate-800 leading-relaxed bg-white p-3 border border-slate-200 font-serif">
                {selectedProject.abstract}
              </p>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedProject(null)}
                className="bg-navy text-gold hover:bg-slate-800 px-5 py-2 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Close Record View
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
