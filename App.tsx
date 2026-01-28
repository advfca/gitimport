
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppStatus, GithubRepo, AnalysisResult, GithubFile, ExampleRepo, GoogleUser, ProjectLog, ConversionResult } from './types';
import { fetchRepoInfo, fetchRepoContents, fetchFileRaw, fetchFullTree, moveOrRenameFile } from './services/githubService';
import { analyzeProject, askAboutFile } from './services/geminiService';
import { convertToReactPhp } from './services/conversionService';
import { createDriveFolder, uploadToDrive } from './services/googleDriveService';
import RepoInput from './components/RepoInput';
import AnalysisBoard from './components/AnalysisBoard';
import hljs from 'highlight.js';

const EXAMPLES: ExampleRepo[] = [
  { title: "React.js", description: "Explore a arquitetura da biblioteca de UI mais famosa.", url: "https://github.com/facebook/react", category: "Frontend", icon: "⚛️" },
  { title: "Express", description: "Analise um framework web minimalista para Node.js.", url: "https://github.com/expressjs/express", category: "Backend", icon: "🚀" },
  { title: "minGPT", description: "Implementação didática de Transformers em Python.", url: "https://github.com/karpathy/minGPT", category: "AI/ML", icon: "🧠" }
];

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [repo, setRepo] = useState<GithubRepo | null>(null);
  const [files, setFiles] = useState<GithubFile[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [conversion, setConversion] = useState<ConversionResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<GithubFile | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isAsking, setIsAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [cloneProgress, setCloneProgress] = useState<string>('');
  const userMenuRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLElement>(null);
  
  const [history, setHistory] = useState<ProjectLog[]>(() => {
    const saved = localStorage.getItem('arquicode_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [ghToken, setGhToken] = useState<string>(() => localStorage.getItem('gh_token') || '');
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);

  useEffect(() => {
    localStorage.setItem('arquicode_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('gh_token', ghToken);
  }, [ghToken]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (codeRef.current && fileContent) {
      delete codeRef.current.dataset.highlighted;
      hljs.highlightElement(codeRef.current);
    }
  }, [fileContent]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const query = searchQuery.toLowerCase();
    return files.filter(f => 
      f.name.toLowerCase().includes(query) || 
      f.path.toLowerCase().includes(query)
    );
  }, [files, searchQuery]);

  const handleImport = async (url: string) => {
    try {
      setError(null);
      setRepo(null);
      setAnalysis(null);
      setConversion(null);
      setFiles([]);
      setSearchQuery('');
      setCurrentPath('');
      setSelectedFile(null);
      setStatus(AppStatus.LOADING_REPO);
      
      const repoData = await fetchRepoInfo(url);
      setRepo(repoData);
      
      const repoFiles = await fetchRepoContents(repoData.owner.login, repoData.name);
      setFiles(repoFiles);
      
      setStatus(AppStatus.ANALYZING);
      const readmeFile = repoFiles.find(f => f.name.toLowerCase() === 'readme.md');
      let readmeText = "";
      if (readmeFile && readmeFile.download_url) readmeText = await fetchFileRaw(readmeFile.download_url);
      
      const aiAnalysis = await analyzeProject(repoData, readmeText);
      setAnalysis(aiAnalysis);

      const newLog: ProjectLog = {
        id: repoData.full_name,
        name: repoData.name,
        owner: repoData.owner.login,
        category: aiAnalysis.technologies[0] || repoData.language || 'Geral',
        timestamp: Date.now(),
        avatar: repoData.owner.avatar_url
      };
      setHistory(prev => [newLog, ...prev.filter(l => l.id !== newLog.id)].slice(0, 20));
      setStatus(AppStatus.READY);
    } catch (err: any) {
      setError(err.message);
      setStatus(AppStatus.ERROR);
    }
  };

  const handleConvertProject = async () => {
    if (!repo || !analysis) return;
    try {
      setStatus(AppStatus.CONVERTING);
      const result = await convertToReactPhp(repo.name, files, analysis);
      setConversion(result);
      setStatus(AppStatus.READY);
    } catch (err) {
      alert("Falha na conversão: " + err);
      setStatus(AppStatus.READY);
    }
  };

  const handleFileClick = async (file: GithubFile) => {
    if (file.type === 'dir') {
      const newFiles = await fetchRepoContents(repo!.owner.login, repo!.name, file.path);
      setFiles(newFiles);
      setCurrentPath(file.path);
      setSearchQuery('');
      return;
    }
    try {
      setSelectedFile(file);
      setFileContent('Carregando...');
      const content = await fetchFileRaw(file.download_url!);
      setFileContent(content);
      setAnswer('');
    } catch (err) {
      setFileContent('Erro ao carregar.');
    }
  };

  const handleCloneToDrive = async () => {
    if (!googleUser) {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (response: any) => {
          if (response.access_token) {
            setGoogleUser({ access_token: response.access_token, expires_in: response.expires_in });
          }
        },
      });
      client.requestAccessToken();
      return;
    }
    // ... logic for Drive cloning simplified for space ...
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setStatus(AppStatus.IDLE)}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-300 bg-clip-text text-transparent">ArquiCode Explorer</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Entenda a arquitetura por trás do código</p>
            </div>
          </div>
          <div className="flex items-center space-x-4 relative" ref={userMenuRef}>
            <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center hover:bg-slate-700 transition">
              <svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10">
        {status === AppStatus.CONVERTING && (
          <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center">
            <div className="text-center max-w-lg">
               <div className="relative w-24 h-24 mx-auto mb-8">
                  <div className="absolute inset-0 border-4 border-indigo-500 rounded-full animate-ping opacity-25"></div>
                  <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center text-4xl">✨</div>
               </div>
               <h3 className="text-3xl font-black mb-4 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Transpolando Arquitetura</h3>
               <p className="text-slate-400 text-lg leading-relaxed">
                  O Gemini está redesenhando sua estrutura TypeScript para um back-end PHP 8.3 de alta performance. 
                  Identificando Endpoints, Models e Middlewares...
               </p>
            </div>
          </div>
        )}

        {(status === AppStatus.IDLE || status === AppStatus.ERROR || status === AppStatus.LOADING_REPO) && !repo && (
          <>
            <div className="text-center mb-12 py-10">
                <h2 className="text-5xl font-extrabold mb-6 tracking-tight leading-tight">
                    Domine a <span className="text-indigo-500">arquitetura</span> de qualquer projeto.
                </h2>
            </div>
            <RepoInput onSearch={handleImport} isLoading={status === AppStatus.LOADING_REPO} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => handleImport(ex.url)} className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl text-left hover:border-indigo-500 transition-all group">
                    <span className="text-3xl mb-4 block group-hover:scale-110 transition">{ex.icon}</span>
                    <h4 className="font-bold text-white mb-2">{ex.title}</h4>
                </button>
              ))}
            </div>
          </>
        )}

        {repo && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-center mb-10 p-8 bg-slate-900 rounded-3xl border border-slate-800 shadow-xl">
               <div className="flex items-center space-x-6">
                  <img src={repo.owner.avatar_url} className="w-16 h-16 rounded-2xl border border-slate-700" alt="" />
                  <div>
                    <h2 className="text-3xl font-extrabold">{repo.name}</h2>
                    <p className="text-slate-400">{repo.language} • {repo.stargazers_count} stars</p>
                  </div>
               </div>
               <div className="mt-6 md:mt-0 flex space-x-3">
                  <button 
                    onClick={handleConvertProject}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 rounded-xl text-sm font-bold flex items-center space-x-2 transition shadow-lg shadow-emerald-900/20"
                  >
                    <span className="text-lg">✨</span>
                    <span>Converter para React+PHP</span>
                  </button>
                  <button onClick={handleCloneToDrive} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-bold transition">Drive</button>
               </div>
            </div>

            {conversion && (
              <div className="mb-12 animate-in zoom-in-95 duration-500">
                 <div className="bg-slate-900 border-2 border-emerald-500/30 rounded-3xl overflow-hidden shadow-2xl shadow-emerald-500/10">
                    <div className="bg-emerald-500/10 p-6 border-b border-emerald-500/20 flex items-center space-x-4">
                       <span className="text-2xl">🚀</span>
                       <div>
                          <h3 className="text-xl font-bold text-emerald-400">ArquiCode Transformer: PHP Migration Blueprint</h3>
                          <p className="text-slate-400 text-sm">Seu projeto agora possui uma arquitetura Fullstack robusta.</p>
                       </div>
                    </div>
                    <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                       <div className="space-y-6">
                          <div>
                             <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Nova Estrutura de Pastas</h4>
                             <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-emerald-300 whitespace-pre-wrap">
                                {conversion.phpStructure}
                             </div>
                          </div>
                          <div>
                             <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Guia de Integração React</h4>
                             <p className="text-sm text-slate-300 leading-relaxed bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                                {conversion.reactUpdates}
                             </p>
                          </div>
                       </div>
                       <div className="space-y-6">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Endpoints API (PHP Generated)</h4>
                          <div className="space-y-4 h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                             {conversion.apiEndpoints.map((ep, i) => (
                                <div key={i} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                                   <div className="px-4 py-2 bg-slate-800 flex justify-between items-center">
                                      <span className="text-[10px] font-bold bg-blue-600 px-2 py-0.5 rounded">{ep.method}</span>
                                      <span className="text-[10px] text-slate-400 font-mono">{ep.route}</span>
                                   </div>
                                   <pre className="p-4 text-[10px] font-mono text-indigo-300 overflow-x-auto">
                                      <code>{ep.phpController}</code>
                                   </pre>
                                </div>
                             ))}
                          </div>
                          <div className="bg-emerald-900/10 border border-emerald-500/20 p-4 rounded-xl">
                             <h5 className="text-xs font-bold text-emerald-400 mb-2 italic">Como Iniciar:</h5>
                             <p className="text-[11px] text-slate-400">{conversion.setupGuide}</p>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
            )}

            {!conversion && <AnalysisBoard analysis={analysis} isAnalyzing={status === AppStatus.ANALYZING} />}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl h-[600px] flex flex-col overflow-hidden">
                 <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest truncate">{currentPath || 'Root'}</span>
                 </div>
                 <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {filteredFiles.map(f => (
                      <div key={f.path} onClick={() => handleFileClick(f)} className={`p-3 rounded-xl cursor-pointer text-sm flex items-center space-x-3 border ${selectedFile?.path === f.path ? 'bg-indigo-600/10 border-indigo-600/30 text-indigo-400' : 'border-transparent hover:bg-slate-800 text-slate-400'}`}>
                        <span>{f.type === 'dir' ? '📁' : '📄'}</span>
                        <span className="truncate flex-1">{f.name}</span>
                      </div>
                    ))}
                 </div>
              </div>

              <div className="lg:col-span-3 space-y-6">
                {selectedFile ? (
                  <>
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                      <div className="p-4 bg-slate-800/30 border-b border-slate-800 flex justify-between items-center">
                         <span className="text-xs font-mono text-indigo-400 truncate">{selectedFile.path}</span>
                      </div>
                      <pre className="p-6 text-xs font-mono overflow-auto h-[350px] bg-slate-950/50">
                        <code ref={codeRef} className="text-slate-300 leading-relaxed">{fileContent}</code>
                      </pre>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-xl">
                      <h3 className="text-xl font-bold mb-6">Arquiteto Virtual</h3>
                      <input 
                        type="text" 
                        placeholder="Pergunte sobre esse arquivo..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-indigo-500 transition"
                        onKeyDown={(e) => { if(e.key === 'Enter') {
                          const q = (e.target as HTMLInputElement).value;
                          setIsAsking(true); askAboutFile(selectedFile.name, fileContent, q).then(res => { setAnswer(res); setIsAsking(false); });
                        }}}
                      />
                      {isAsking && <div className="text-center py-4 animate-pulse">Analisando...</div>}
                      {answer && <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl mt-4 text-sm whitespace-pre-wrap">{answer}</div>}
                    </div>
                  </>
                ) : (
                  <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-3xl text-slate-500">
                    <p className="text-lg font-medium">Selecione um arquivo para iniciar a inspeção.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
