'use client';

import { ExpertRanking } from '@/types/gacm';
import { Award, Building, BookOpen } from '@/components/gacm/Icons';

interface ExpertRankingsTableProps {
  rankings: ExpertRanking[];
  onSelectFaculty?: (facultyName: string) => void;
}

export default function ExpertRankingsTable({ rankings, onSelectFaculty }: ExpertRankingsTableProps) {
  if (!Array.isArray(rankings) || rankings.length === 0) {
    return (
      <div className="bg-white border border-slate-300 rounded-none p-6 text-center text-slate-600 text-sm">
        No PageRank expert rankings available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-600" />
          <h3 className="font-bold text-base text-navy">PageRank & Centrality Institutional Expert Leaderboard</h3>
        </div>
        <span className="text-xs text-slate-500 font-mono">CALL pagerank.get() Memgraph Procedure</span>
      </div>

      <div className="bg-white border border-slate-300 rounded-none overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-slate-100 text-navy uppercase tracking-wider font-bold border-b border-slate-300">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Faculty Expert</th>
                <th className="px-4 py-3">Department / Institution</th>
                <th className="px-4 py-3 text-center">Projects</th>
                <th className="px-4 py-3 text-right">PageRank Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rankings.map((item, idx) => (
                <tr
                  key={idx}
                  onClick={() => onSelectFaculty && onSelectFaculty(item.faculty_name)}
                  className="hover:bg-amber-50/60 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-bold text-amber-700 font-mono text-center">
                    #{idx + 1}
                  </td>
                  <td className="px-4 py-3 font-bold text-navy flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block border border-white"></span>
                    {item.faculty_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[250px] truncate font-medium">
                    <Building className="w-3.5 h-3.5 inline mr-1 text-slate-500" />
                    {item.department}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-slate-900">
                    <BookOpen className="w-3.5 h-3.5 inline mr-1 text-slate-500" />
                    {item.project_count}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-extrabold text-emerald-700">
                    {item.centrality_rank.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
