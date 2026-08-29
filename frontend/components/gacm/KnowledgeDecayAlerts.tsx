'use client';

import { KnowledgeDecayNode } from '@/types/gacm';
import { AlertTriangle, ShieldAlert, CheckCircle, ArrowRight } from '@/components/gacm/Icons';

interface KnowledgeDecayAlertsProps {
  decayNodes: KnowledgeDecayNode[];
  onSelectFaculty?: (facultyName: string) => void;
}

export default function KnowledgeDecayAlerts({ decayNodes, onSelectFaculty }: KnowledgeDecayAlertsProps) {
  if (!Array.isArray(decayNodes) || decayNodes.length === 0) {
    return (
      <div className="bg-white border border-slate-300 rounded-none p-6 text-center text-slate-600 text-sm">
        <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
        <p className="font-bold text-navy">No High Risk Knowledge SPOFs Detected</p>
        <p className="text-xs text-slate-500 mt-1">All research projects have active co-investigators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-600" />
          <h3 className="font-bold text-base text-navy">Single Point of Failure (SPOF) Knowledge Decay Alerts</h3>
        </div>
        <span className="text-xs bg-red-100 text-red-800 border border-red-200 px-2.5 py-1 rounded-none font-bold">
          {decayNodes.filter(n => n.risk_level === 'HIGH').length} High Risk Critical
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {decayNodes.map((node, index) => {
          const isHigh = node.risk_level === 'HIGH';
          const isMedium = node.risk_level === 'MEDIUM';

          return (
            <div
              key={index}
              className={`p-4 rounded-none border text-xs transition-all ${
                isHigh
                  ? 'bg-red-50/70 border-red-200 text-red-950'
                  : isMedium
                  ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                  : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-bold text-sm text-navy flex items-center gap-2">
                    {node.faculty_name}
                    {isHigh && <AlertTriangle className="w-4 h-4 text-red-600 inline" />}
                  </h4>
                  <p className="text-slate-600 text-xs">{node.institution}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-none text-[10px] font-extrabold uppercase tracking-wider ${
                      isHigh
                        ? 'bg-red-600 text-white'
                        : isMedium
                        ? 'bg-amber-500 text-navy'
                        : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {node.risk_level} RISK
                  </span>
                  <p className="text-slate-600 font-mono text-[11px] mt-1">
                    Score: <span className="font-bold text-navy">{node.decay_risk_score}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 text-xs">
                <div className="text-slate-700 font-medium">
                  Solo Projects: <span className="font-bold text-amber-700">{node.single_author_count}</span> / {node.total_projects} total
                </div>
                {onSelectFaculty && (
                  <button
                    onClick={() => onSelectFaculty(node.faculty_name)}
                    className="flex items-center gap-1 text-navy hover:text-amber-700 font-bold cursor-pointer"
                  >
                    View Lineage <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-2 text-slate-600 italic bg-white/80 p-2 rounded-none border border-slate-200">
                &ldquo;{node.recommendation}&rdquo;
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
