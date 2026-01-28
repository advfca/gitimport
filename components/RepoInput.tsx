
import React, { useState, useRef } from 'react';

interface RepoInputProps {
  onSearch: (url: string) => void;
  onLocalUpload: (files: FileList) => void;
  onDriveClick: () => void;
  isLoading: boolean;
}

const RepoInput: React.FC<RepoInputProps> = ({ onSearch, onLocalUpload, onDriveClick, isLoading }) => {
  const [url, setUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSearch(url.trim());
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onLocalUpload(e.target.files);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto mb-12 space-y-6">
      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 to-cyan-500 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
        <div className="relative flex items-center bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
          <div className="pl-6 text-slate-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 105.656 5.656l-1.1 1.1" /></svg>
          </div>
          <input
            type="text"
            className="flex-1 bg-transparent px-5 py-5 text-slate-100 placeholder-slate-500 focus:outline-none text-lg"
            placeholder="GitHub URL ou nome do projeto..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !url}
            className="px-10 py-5 font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition disabled:opacity-50"
          >
            {isLoading ? '...' : 'Analisar'}
          </button>
        </div>
      </form>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        {/* Fix: webkitdirectory is a non-standard attribute, using spread to avoid TS error */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          multiple 
          {...({ webkitdirectory: "true" } as any)}
          className="hidden" 
        />
        
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="w-full sm:w-auto flex items-center justify-center space-x-3 px-6 py-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500 transition text-slate-300 font-medium group"
        >
          <svg className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          <span>Carregar Projeto Local</span>
        </button>

        <div className="text-slate-700 font-bold hidden sm:block">OU</div>

        <button 
          onClick={onDriveClick}
          className="w-full sm:w-auto flex items-center justify-center space-x-3 px-6 py-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-emerald-500 transition text-slate-300 font-medium group"
        >
          <svg className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition" fill="currentColor" viewBox="0 0 24 24"><path d="M7.74 3.522l1.469-2.545A.48.48 0 0 1 9.625.75h4.75a.48.48 0 0 1 .416.227l1.469 2.545a.48.48 0 0 1 0 .456l-1.469 2.545a.48.48 0 0 1-.416.227H9.625a.48.48 0 0 1-.416-.227L7.74 3.978a.48.48 0 0 1 0-.456zM2.584 12.455l1.469-2.545a.48.48 0 0 1 .416-.227h4.75a.48.48 0 0 1 .416.227l1.469 2.545a.48.48 0 0 1 0 .456l-1.469 2.545a.48.48 0 0 1-.416.227h-4.75a.48.48 0 0 1-.416-.227l-1.469-2.545a.48.48 0 0 1 0-.456zm10.332 0l1.469-2.545a.48.48 0 0 1 .416-.227h4.75a.48.48 0 0 1 .416.227l1.469 2.545a.48.48 0 0 1 0 .456l-1.469 2.545a.48.48 0 0 1-.416.227h-4.75a.48.48 0 0 1-.416-.227l-1.469-2.545a.48.48 0 0 1 0-.456z"/></svg>
          <span>Google Drive</span>
        </button>
      </div>
    </div>
  );
};

export default RepoInput;
