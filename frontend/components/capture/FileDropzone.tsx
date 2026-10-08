'use client';

import { useState, useRef } from 'react';
import { uploadDocumentFile } from '@/lib/captureApi';

interface FileDropzoneProps {
  onUploadSuccess: () => void;
}

const DEPARTMENTS = [
  'Computer Science & Engineering',
  'Biological & Environmental Sciences',
  'Physics & Astronomy',
  'Chemistry & Geology',
  'Civil & Chemical Engineering',
  'Office of Research & Sponsored Programs (ORSP)',
  'Academic Advisory Senate',
  'Institutional Review Board (IRB)'
];

const MEMORY_TYPES = [
  { value: 'GrantAward', label: 'Grant Award Notice (NSF/NIH/DoD)' },
  { value: 'ResearchProposal', label: 'Research Proposal (Pre-Award)' },
  { value: 'MeetingMinutes', label: 'Academic / Senate Meeting Minutes' },
  { value: 'IRBProtocol', label: 'IRB Protocol / Ethics Compliance' },
  { value: 'LabIncident', label: 'Lab Facility / Equipment Incident' }
];

const SENSITIVITY_LEVELS = [
  { value: 'Public', label: 'Public (Published Research & Directory)' },
  { value: 'Internal', label: 'Internal (University Faculty & Staff)' },
  { value: 'Restricted', label: 'Restricted (Department & Grant Team Only)' },
  { value: 'Confidential', label: 'Confidential (IRB Protocols & IP Disclosures)' },
  { value: 'HighlyConfidential', label: 'Highly Confidential (ITAR / Defense / Whistleblower)' }
];

export default function FileDropzone({ onUploadSuccess }: FileDropzoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [memoryType, setMemoryType] = useState('GrantAward');
  const [sensitivityLevel, setSensitivityLevel] = useState('Public');

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
      onUploadSuccess();
    } catch (err: any) {
      if (err && err.error_code === 'CAP-1005') {
        setUploadResult({
          status: 'duplicate_blocked',
          error_code: 'CAP-1005',
          message: err.message,
          existing_memory_id: err.existing_memory_id,
          existing_title: err.existing_title
        });
      } else {
        const msg = err?.error || err?.message || err?.detail || 'Upload failed. Please check file format and size.';
        setErrorMessage(msg);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-white border border-brand p-6 shadow-md">
      <div className="mb-4">
        <h2 className="text-xl font-extrabold text-navy uppercase tracking-tight flex items-center gap-2">
          <span>📤</span> Ingest Institutional Document
        </h2>
        <p className="text-xs text-muted-grey mt-1">
          Upload grant notices, research proposals, faculty senate transcripts, or lab reports to ingest them into the institutional memory layer.
        </p>
      </div>

      <form onSubmit={handleUpload} className="space-y-4">
        {/* Dropzone Area */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-gold bg-yellow-50/50 scale-[1.01]'
              : 'border-slate-300 hover:border-gold bg-cream/40'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            onChange={handleChange}
            accept=".pdf,.docx,.txt,.md,.json,.csv"
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <span className="text-3xl">📄</span>
            {selectedFile ? (
              <div className="space-y-1">
                <p className="font-bold text-navy text-sm">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">{formatFileSize(selectedFile.size)}</p>
                <span className="inline-block bg-navy text-gold text-[10px] font-extrabold px-2 py-0.5 uppercase tracking-wider">
                  File Ready For Ingestion
                </span>
              </div>
            ) : (
              <>
                <p className="text-sm font-bold text-navy">
                  Drag and drop research document here, or <span className="text-gold underline">browse files</span>
                </p>
                <p className="text-[11px] text-muted-grey">
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
            <label className="block text-[11px] font-bold text-navy uppercase tracking-wider mb-1">
              Department / College
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full bg-cream border border-brand text-navy text-xs p-2.5 font-medium focus:outline-none focus:border-gold"
            >
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Memory Type */}
          <div>
            <label className="block text-[11px] font-bold text-navy uppercase tracking-wider mb-1">
              Memory Classification
            </label>
            <select
              value={memoryType}
              onChange={(e) => setMemoryType(e.target.value)}
              className="w-full bg-cream border border-brand text-navy text-xs p-2.5 font-medium focus:outline-none focus:border-gold"
            >
              {MEMORY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sensitivity Tier */}
          <div>
            <label className="block text-[11px] font-bold text-navy uppercase tracking-wider mb-1">
              Sensitivity & Access Tier
            </label>
            <select
              value={sensitivityLevel}
              onChange={(e) => setSensitivityLevel(e.target.value)}
              className="w-full bg-cream border border-brand text-navy text-xs p-2.5 font-medium focus:outline-none focus:border-gold"
            >
              {SENSITIVITY_LEVELS.map((tier) => (
                <option key={tier.value} value={tier.value}>
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
            className="bg-gold text-navy hover:bg-yellow-400 disabled:opacity-50 px-6 py-3 font-extrabold text-xs uppercase tracking-wider transition-colors shadow-md flex items-center gap-2 cursor-pointer"
          >
            {isUploading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-navy" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Ingesting & Parsing Document...
              </>
            ) : (
              '⚡ Process & Capture Memory'
            )}
          </button>
        </div>
      </form>

      {/* Result Banners */}
      {uploadResult && uploadResult.status === 'completed' && (
        <div className="mt-4 p-4 bg-emerald-50 border border-emerald-500 text-emerald-900">
          <div className="flex items-center gap-2 font-bold text-sm">
            <span>✅</span>
            <span>Document Captured Successfully!</span>
          </div>
          <div className="mt-2 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <span className="text-emerald-700 font-semibold">Capture ID:</span>
              <p className="font-mono font-bold">{uploadResult.capture_id}</p>
            </div>
            <div>
              <span className="text-emerald-700 font-semibold">Memory ID:</span>
              <p className="font-mono font-bold text-navy">{uploadResult.memory_id}</p>
            </div>
            <div>
              <span className="text-emerald-700 font-semibold">Pages / Sections:</span>
              <p>{uploadResult.page_count} pgs / {uploadResult.section_count} sections</p>
            </div>
            <div>
              <span className="text-emerald-700 font-semibold">Classification:</span>
              <p>{uploadResult.memory_type}</p>
            </div>
          </div>
          <p className="text-xs text-emerald-800 mt-2 font-medium">
            Extracted Title: <span className="italic font-bold">"{uploadResult.title}"</span>
          </p>
        </div>
      )}

      {uploadResult && uploadResult.status === 'duplicate_blocked' && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-500 text-amber-900">
          <div className="flex items-center gap-2 font-bold text-sm">
            <span>⚠️</span>
            <span>Duplicate Document Blocked (CAP-1005)</span>
          </div>
          <p className="text-xs mt-1">
            {uploadResult.message}
          </p>
          <div className="mt-2 text-xs flex items-center gap-4 bg-white/80 p-2 border border-amber-300">
            <div>
              <span className="text-amber-800 font-semibold">Existing Memory ID:</span>
              <span className="font-mono font-bold text-navy ml-2">{uploadResult.existing_memory_id}</span>
            </div>
            {uploadResult.existing_title && (
              <div className="truncate">
                <span className="text-amber-800 font-semibold">Title:</span>
                <span className="italic ml-2">{uploadResult.existing_title}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 p-4 bg-red-50 border border-red-500 text-red-900">
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
