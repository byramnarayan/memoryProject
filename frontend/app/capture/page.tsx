'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import FileDropzone from '@/components/capture/FileDropzone';
import CaptureQueueTable from '@/components/capture/CaptureQueueTable';

export default function CapturePage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { user } = useAuth();
  const isAcademic = user?.tenant_id === 'utc_campus' || user?.email?.includes('@utc.edu');

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen py-10 px-4 md:px-8">
      <div className="max-w-[1400px] mx-auto space-y-8">

        {/* Hero Header Banner */}
        <div className="glass-card p-8 border border-cyan-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-mono font-bold tracking-widest px-3 py-1 rounded-full border border-cyan-500/40 bg-cyan-950/40 text-cyan-300 uppercase">
                {isAcademic ? 'Module 01 • Academic Ingestion Pipeline' : 'Module 01 • Telecom Operations Pipeline'}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
              {isAcademic ? 'Memory Capture & Ingestion Center' : 'Telecom Incident & Workaround Ingestion Center'}
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
              {isAcademic
                ? 'Ingest academic grant awards, research proposals, faculty senate dialog transcripts, and compliance reports into the institutional memory layer with automated parsing and SHA-256 duplicate blocking.'
                : 'Ingest cell outage post-mortems, engineering runbooks, field workarounds, and microwave telemetry logs into Novatel institutional memory with automated SHA-256 deduplication.'}
            </p>
          </div>

          <div className="flex items-center gap-3.5 glass-panel border border-cyan-500/20 px-5 py-3.5 rounded-xl shadow-lg shrink-0">
            <div className="text-right">
              <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block font-bold">SLO Performance</span>
              <span className="text-sm font-extrabold text-white">Ingestion &lt; 2.0s</span>
            </div>
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-lg">
              ⚡
            </div>
          </div>
        </div>

        {/* System Architecture Flow Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card p-4 text-center border-cyan-500/40 shadow-[0_0_15px_rgba(14,165,233,0.12)]">
            <span className="text-[10px] uppercase font-mono font-bold text-cyan-400 block mb-1">Step 1</span>
            <span className="font-bold text-xs text-white">Multipart Upload</span>
            <p className="text-[11px] text-slate-400 mt-0.5">PDF, DOCX, TXT, JSON</p>
          </div>
          <div className="glass-card p-4 text-center">
            <span className="text-[10px] uppercase font-mono font-bold text-slate-500 block mb-1">Step 2</span>
            <span className="font-bold text-xs text-white">Duplicate Blocker</span>
            <p className="text-[11px] text-slate-400 mt-0.5">SHA-256 Hash Matching</p>
          </div>
          <div className="glass-card p-4 text-center">
            <span className="text-[10px] uppercase font-mono font-bold text-slate-500 block mb-1">Step 3</span>
            <span className="font-bold text-xs text-white">{isAcademic ? 'Section Extraction' : 'Runbook Extraction'}</span>
            <p className="text-[11px] text-slate-400 mt-0.5">{isAcademic ? 'Aims, Budget, Minutes' : 'Root Cause, Workaround, SOP'}</p>
          </div>
          <div className="glass-card p-4 text-center">
            <span className="text-[10px] uppercase font-mono font-bold text-slate-500 block mb-1">Step 4</span>
            <span className="font-bold text-xs text-white">Canonical Memory</span>
            <p className="text-[11px] text-slate-400 mt-0.5">{isAcademic ? 'MEM-GRT / MEM-MTG' : 'MEM-OUT / MEM-WRK'}</p>
          </div>
        </div>

        {/* Section 1: Upload Dropzone Form */}
        <FileDropzone onUploadSuccess={handleUploadSuccess} />

        {/* Section 2: Live Ingestion Queue Table */}
        <CaptureQueueTable refreshTrigger={refreshTrigger} />

      </div>
    </div>
  );
}
