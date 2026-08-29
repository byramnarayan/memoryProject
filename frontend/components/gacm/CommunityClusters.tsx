'use client';

import { CommunityCluster } from '@/types/gacm';
import { Network, Users, FolderGit2 } from '@/components/gacm/Icons';

interface CommunityClustersProps {
  communities: CommunityCluster[];
}

export default function CommunityClusters({ communities }: CommunityClustersProps) {
  if (!Array.isArray(communities) || communities.length === 0) {
    return (
      <div className="bg-white border border-slate-300 p-6 text-center text-slate-600 text-sm">
        No Louvain research clusters detected.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-purple-700" />
          <h3 className="font-bold text-sm text-navy">Louvain Interdisciplinary Research Communities</h3>
        </div>
        <span className="text-xs text-slate-500 font-medium">Total: {communities.length} Clusters</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {communities.map((cluster, idx) => (
          <div
            key={idx}
            className="bg-slate-50 border border-slate-200 hover:border-purple-400 p-3 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block border border-white mt-1 shrink-0"></span>
                <h4 className="font-bold text-xs text-navy leading-snug break-words">{cluster.cluster_department}</h4>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200 text-xs">
              <div className="bg-white p-1.5 text-center border border-slate-200">
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Faculty</span>
                <span className="font-extrabold text-amber-700 text-xs flex items-center justify-center gap-1 mt-0.5">
                  <Users className="w-3 h-3" /> {cluster.faculty_count}
                </span>
              </div>
              <div className="bg-white p-1.5 text-center border border-slate-200">
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Projects</span>
                <span className="font-extrabold text-blue-700 text-xs flex items-center justify-center gap-1 mt-0.5">
                  <FolderGit2 className="w-3 h-3" /> {cluster.project_count}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
