'use client';

import { useState } from 'react';
import FileDropzone from '@/components/capture/FileDropzone';
import CaptureQueueTable from '@/components/capture/CaptureQueueTable';

export default function CapturePage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-cream text-navy font-sans py-8 px-4 md:px-8">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* Hero Header Banner */}
        <div className="bg-navy border-b-4 border-gold p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-gold/20 text-gold border border-gold/40 text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5">
                Module 1 &bull; Ingestion Pipeline
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gold tracking-tight">
              Memory Capture & Ingestion Center
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Ingest academic grant awards, research proposals, faculty senate dialog transcripts, and compliance reports into the institutional memory layer with automated parsing and SHA-256 duplicate blocking.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/5 border border-white/10 p-3">
            <div className="text-right">
              <span className="text-[10px] text-gold uppercase tracking-wider block font-bold">SLO Performance</span>
              <span className="text-sm font-extrabold text-white">Ingestion &lt; 2.0s</span>
            </div>
            <div className="text-2xl">⚡</div>
          </div>
        </div>

        {/* System Architecture Flow Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-brand p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-muted-grey block">Step 1</span>
            <span className="font-bold text-xs text-navy">Multipart Upload</span>
            <p className="text-[10px] text-slate-500 mt-0.5">PDF, DOCX, TXT, JSON</p>
          </div>
          <div className="bg-white border border-brand p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-muted-grey block">Step 2</span>
            <span className="font-bold text-xs text-navy">Duplicate Blocker</span>
            <p className="text-[10px] text-slate-500 mt-0.5">SHA-256 Hash Matching</p>
          </div>
          <div className="bg-white border border-brand p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-muted-grey block">Step 3</span>
            <span className="font-bold text-xs text-navy">Section Extraction</span>
            <p className="text-[10px] text-slate-500 mt-0.5">Aims, Budget, Minutes</p>
          </div>
          <div className="bg-white border border-brand p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-muted-grey block">Step 4</span>
            <span className="font-bold text-xs text-navy">Canonical Memory</span>
            <p className="text-[10px] text-slate-500 mt-0.5">MEM-GRT / MEM-MTG</p>
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
