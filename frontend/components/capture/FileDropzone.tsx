'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { uploadDocumentFile } from '@/lib/captureApi';

interface FileDropzoneProps {
  onUploadSuccess?: () => void;
}

const ACADEMIC_DEPARTMENTS = [
  'Computer Science & Engineering',
  'Biological & Environmental Sciences',
  'Physics & Astronomy',
  'Chemistry & Geology',
  'Civil & Chemical Engineering',
  'Office of Research & Sponsored Programs (ORSP)',
  'Academic Advisory Senate',
  'Institutional Review Board (IRB)'
];

const TELCO_DEPARTMENTS = [
  'Radio Access Network (RAN)',
  'Core Network & EPC (5G/LTE)',
  'Field Operations & Microwave',
  'NOC & Service Assurance',
  'Optical Transport & IP Backhaul',
  'Customer Experience & B2B SLA'
];

const ACADEMIC_MEMORY_TYPES = [
  { value: 'GrantAward', label: 'Grant Award Notice (NSF/NIH/DoD)' },
  { value: 'ResearchProposal', label: 'Research Proposal (Pre-Award)' },
  { value: 'MeetingMinutes', label: 'Academic / Senate Meeting Minutes' },
  { value: 'IRBProtocol', label: 'IRB Protocol / Ethics Compliance' },
  { value: 'LabIncident', label: 'Lab Facility / Equipment Incident' }
];

const TELCO_MEMORY_TYPES = [
  { value: 'CellOutageSOP', label: 'Radio Cell Outage & Sector Post-Mortem SOP' },
  { value: 'EngineeringWorkaround', label: 'Field Workaround & Firmware Bypass SOP' },
  { value: 'NetworkDegradationLog', label: 'RAN Throughput & Call Drop Degradation Log' },
  { value: 'HardwareReplacement', label: 'SFP+ Optical / RRU Transceiver Hardware SOP' },
  { value: 'VendorWatchdogReport', label: 'OEM Vendor (Ericsson/Nokia) Bug & Patch Advisory' },
  { value: 'ServiceTicket', label: 'B2B Enterprise SLA & Escalation Ticket' }
];

const ACADEMIC_SENSITIVITY_LEVELS = [
  { value: 'Public', label: 'Public (Published Research & Directory)' },
  { value: 'Internal', label: 'Internal (University Faculty & Staff)' },
  { value: 'Restricted', label: 'Restricted (Department & Grant Team Only)' },
  { value: 'Confidential', label: 'Confidential (IRB Protocols & IP Disclosures)' },
  { value: 'HighlyConfidential', label: 'Highly Confidential (ITAR / Defense / Whistleblower)' }
];

const TELCO_SENSITIVITY_LEVELS = [
  { value: 'Public', label: 'Public (Regulatory FCC / Public Advisory)' },
  { value: 'Internal', label: 'Internal (General Telecom Engineering & Operations)' },
  { value: 'Restricted', label: 'Restricted (NOC Tier-3 & Core Network Engineers Only)' },
  { value: 'Confidential', label: 'Confidential (Vendor NDA / Security Vulnerability / PII)' },
  { value: 'HighlyConfidential', label: 'Critical Infrastructure (Core EPC / SS7 / Executive Escrow)' }
];

export default function FileDropzone({ onUploadSuccess }: FileDropzoneProps) {
  const { user } = useAuth();
  const isAcademic = user?.tenant_id === 'utc_campus' || user?.email?.includes('@utc.edu');

  const departments = isAcademic ? ACADEMIC_DEPARTMENTS : TELCO_DEPARTMENTS;
  const memoryTypes = isAcademic ? ACADEMIC_MEMORY_TYPES : TELCO_MEMORY_TYPES;
  const sensitivityLevels = isAcademic ? ACADEMIC_SENSITIVITY_LEVELS : TELCO_SENSITIVITY_LEVELS;

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [department, setDepartment] = useState(departments[0]);
  const [memoryType, setMemoryType] = useState(memoryTypes[0].value);
  const [sensitivityLevel, setSensitivityLevel] = useState(sensitivityLevels[0].value);

  useEffect(() => {
    if (isAcademic) {
      if (!ACADEMIC_DEPARTMENTS.includes(department)) setDepartment(ACADEMIC_DEPARTMENTS[0]);
      if (!ACADEMIC_MEMORY_TYPES.some(m => m.value === memoryType)) setMemoryType(ACADEMIC_MEMORY_TYPES[0].value);
    } else {
      if (!TELCO_DEPARTMENTS.includes(department)) setDepartment(TELCO_DEPARTMENTS[0]);
      if (!TELCO_MEMORY_TYPES.some(m => m.value === memoryType)) setMemoryType(TELCO_MEMORY_TYPES[0].value);
    }
  }, [isAcademic]);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setUploadResult(null);
      setErrorMessage(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadResult(null);
      setErrorMessage(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadResult(null);
    setErrorMessage(null);

    try {
      const res = await uploadDocumentFile(
        selectedFile,
        department,
        memoryType,
        sensitivityLevel
      );
      setUploadResult(res);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onUploadSuccess?.();
    } catch (err: any) {
      if (err && err.error_code === 'CAP-1005') {
        setUploadResult({
          status: 'duplicate_blocked',
          message: err.detail || 'Exact cryptographic hash already exists in institutional memory.',
          existing_memory_id: err.existing_memory_id,
          existing_title: err.existing_title,
        });
      } else {
        setErrorMessage(err.detail || err.message || 'Failed to upload document.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div className="glass-card p-6 border border-cyan-500/20 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-sm">
              {isAcademic ? '📥' : '📡'}
            </span>
            {isAcademic ? 'Ingest Institutional Document' : 'Ingest Telecom Incident & Network Operations Document'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isAcademic
              ? 'Upload grant notices, research proposals, faculty senate transcripts, or lab reports to ingest them into the institutional memory layer.'
              : 'Upload cell outage post-mortems, engineering workarounds, BGP routing bypass runbooks, fiber cut incident logs, and SLA reports into telecom memory.'}
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono bg-cyan-950/40 border border-cyan-500/30 text-cyan-300">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          SHA-256 Verified
        </span>
      </div>

      <form onSubmit={handleUpload} className="space-y-4">
        {/* Dropzone Area */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed p-8 text-center cursor-pointer rounded-xl transition-all duration-300 ${
            dragActive
              ? 'border-cyan-400 bg-cyan-950/30 shadow-[0_0_25px_rgba(14,165,233,0.25)] scale-[1.01]'
              : 'border-slate-700/80 hover:border-cyan-400/50 bg-slate-900/40 hover:bg-slate-900/60'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            onChange={handleChange}
            accept=".pdf,.docx,.txt,.md,.json,.csv"
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(14,165,233,0.15)]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            {selectedFile ? (
              <div className="space-y-1">
                <p className="font-bold text-white text-sm">{selectedFile.name}</p>
                <p className="text-xs text-slate-400">{formatFileSize(selectedFile.size)}</p>
                <span className="inline-block bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                  File Ready For Ingestion
                </span>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-200">
                  {isAcademic ? (
                    <>Drag and drop research document here, or <span className="text-cyan-400 font-semibold underline underline-offset-2">browse files</span></>
                  ) : (
                    <>Drag and drop telecom operational document, runbook, or incident report here, or <span className="text-cyan-400 font-semibold underline underline-offset-2">browse files</span></>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  Supported formats: PDF, DOCX, TXT, Markdown, JSON, CSV (Max 50 MB)
                </p>
              </>
            )}
          </div>
        </div>

        {/* Metadata Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {/* Department */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              {isAcademic ? 'Department / College' : 'Engineering Division / Department'}
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg text-slate-200 text-xs p-2.5 font-medium focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
            >
              {departments.map((dept) => (
                <option key={dept} value={dept} className="bg-slate-900 text-slate-200">
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Memory Type */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              {isAcademic ? 'Memory Classification' : 'Telecom Classification'}
            </label>
            <select
              value={memoryType}
              onChange={(e) => setMemoryType(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg text-slate-200 text-xs p-2.5 font-medium focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
            >
              {memoryTypes.map((type) => (
                <option key={type.value} value={type.value} className="bg-slate-900 text-slate-200">
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sensitivity Tier */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              {isAcademic ? 'Sensitivity & Access Tier' : 'Network Security & Access Tier'}
            </label>
            <select
              value={sensitivityLevel}
              onChange={(e) => setSensitivityLevel(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg text-slate-200 text-xs p-2.5 font-medium focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
            >
              {sensitivityLevels.map((tier) => (
                <option key={tier.value} value={tier.value} className="bg-slate-900 text-slate-200">
                  {tier.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={!selectedFile || isUploading}
            className="btn-primary-cyan px-6 py-2.5 font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40 flex items-center gap-2 cursor-pointer"
          >
            {isUploading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Ingesting & Parsing Document...
              </>
            ) : (
              isAcademic ? '⚡ Process & Capture Memory' : '⚡ Process & Capture Network Memory'
            )}
          </button>
        </div>
      </form>

      {/* Result Banners */}
      {uploadResult && uploadResult.status === 'completed' && (
        <div className="mt-4 p-4 bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 rounded-xl shadow-lg">
          <div className="flex items-center gap-2 font-bold text-sm">
            <span>✅</span>
            <span>Document Captured Successfully!</span>
          </div>
          <div className="mt-2 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <span className="text-emerald-400 font-semibold">Capture ID:</span>
              <p className="font-mono font-bold text-white">{uploadResult.capture_id}</p>
            </div>
            <div>
              <span className="text-emerald-400 font-semibold">Memory ID:</span>
              <p className="font-mono font-bold text-cyan-300">{uploadResult.memory_id}</p>
            </div>
            <div>
              <span className="text-emerald-400 font-semibold">Pages / Sections:</span>
              <p className="text-slate-200">{uploadResult.page_count} pgs / {uploadResult.section_count} sections</p>
            </div>
            <div>
              <span className="text-emerald-400 font-semibold">Classification:</span>
              <p className="text-slate-200">{uploadResult.memory_type}</p>
            </div>
          </div>
          <p className="text-xs text-emerald-300 mt-2 font-medium">
            Extracted Title: <span className="italic font-bold text-white">"{uploadResult.title}"</span>
          </p>
        </div>
      )}

      {uploadResult && uploadResult.status === 'duplicate_blocked' && (
        <div className="mt-4 p-4 bg-amber-950/60 border border-amber-500/40 text-amber-200 rounded-xl shadow-lg">
          <div className="flex items-center gap-2 font-bold text-sm">
            <span>⚠️</span>
            <span>Duplicate Document Blocked (CAP-1005)</span>
          </div>
          <p className="text-xs mt-1 text-amber-300/90">
            {uploadResult.message}
          </p>
          <div className="mt-2 text-xs flex items-center gap-4 bg-slate-900/80 p-2.5 rounded-lg border border-amber-500/30">
            <div>
              <span className="text-amber-400 font-semibold">Existing Memory ID:</span>
              <span className="font-mono font-bold text-cyan-300 ml-2">{uploadResult.existing_memory_id}</span>
            </div>
            {uploadResult.existing_title && (
              <div className="truncate">
                <span className="text-amber-400 font-semibold">Title:</span>
                <span className="italic ml-2 text-slate-200">{uploadResult.existing_title}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 p-4 bg-rose-950/60 border border-rose-500/40 text-rose-200 rounded-xl shadow-lg">
          <div className="flex items-center gap-2 font-bold text-sm">
            <span>❌</span>
            <span>Capture Engine Rejection</span>
          </div>
          <p className="text-xs mt-1">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
