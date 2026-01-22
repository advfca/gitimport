
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppStatus, GithubRepo, AnalysisResult, GithubFile, ExampleRepo, GoogleUser, ProjectLog, GithubTreeItem } from './types';
import { fetchRepoInfo, fetchRepoContents, fetchFileRaw, fetchFullTree, updateFileContent, moveOrRenameFile, deleteFile } from './services/githubService';
import { analyzeProject, askAboutFile } from './services/geminiService';
import { createDriveFolder, uploadToDrive } from './services/googleDriveService';
import RepoInput from './components/RepoInput';
import AnalysisBoard from './components/AnalysisBoard';

const EXAMPLES: ExampleRepo[] = [
  { title: "React.js", description: "Explore a arquitetura da biblioteca de UI mais famosa.", url: "https://github.com/facebook/react", category: "Frontend", icon: "⚛️" },
  { title: "Express", description: "Analise um framework web minimalista para Node.js.", url: "https://github.com/expressjs/express", category: "Backend", icon: "🚀" },
  { title: "minGPT", description: "Implementação didática de Transformers em Python.", url: "https://github.com/karpathy/minGPT", category: "AI/ML", icon: "🧠" }
];

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [repo, setRepo] = useState<GithubRepo | null>(null);
  const [files, setFiles] = useState<GithubFile[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<GithubFile | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isAsking, setIsAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [cloneProgress, setCloneProgress] = useState<string>('');
  const userMenuRef = useRef<HTMLDivElement>(null);
  
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

  const ranking = useMemo(() => {
    const counts: Record<string, number> = {};
    history.forEach(log => {
      counts[log.category] = (counts[log.category] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [history]);

  const handleLogout = () => {
    setGhToken('');
    setGoogleUser(null);
    setIsUserMenuOpen(false);
  };

  const handleImport = async (url: string) => {
    try {
      setError(null);
      setRepo(null);
      setAnalysis(null);
      setFiles([]);
      setCurrentPath('');
      setSelectedFile(null);
      setFileContent('');
      setAnswer('');
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

  const handleFileClick = async (file: GithubFile) => {
    if (file.type === 'dir') {
      const newFiles = await fetchRepoContents(repo!.owner.login, repo!.name, file.path);
      setFiles(newFiles);
      setCurrentPath(file.path);
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

  const handleAction = async (file: GithubFile, isRename: boolean) => {
    if (!ghToken) {
      alert("Configure seu GitHub Token no menu de usuário primeiro.");
      return;
    }
    const promptLabel = isRename ? "Novo nome do arquivo:" : "Mover para (caminho completo):";
    const newVal = prompt(promptLabel, isRename ? file.name : file.path);
    if (!newVal || newVal === (isRename ? file.name : file.path)) return;

    let targetPath = newVal;
    if (isRename) {
      const parts = file.path.split('/');
      parts.pop();
      targetPath = parts.length ? `${parts.join('/')}/${newVal}` : newVal;
    }

    try {
      setStatus(AppStatus.COMMITTING);
      const content = await fetchFileRaw(file.download_url!);
      await moveOrRenameFile(ghToken, repo!.owner.login, repo!.name, file.path, targetPath, file.sha!, content, `ArquiCode Action: ${isRename ? 'Rename' : 'Move'}`);
      
      const updatedFiles = await fetchRepoContents(repo!.owner.login, repo!.name, currentPath);
      setFiles(updatedFiles);
      if (selectedFile?.path === file.path) setSelectedFile(null);
      setStatus(AppStatus.READY);
    } catch (err: any) {
      alert(err.message);
      setStatus(AppStatus.READY);
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

    try {
      setStatus(AppStatus.CLONING);
      setCloneProgress('Buscando estrutura completa...');
      const tree = await fetchFullTree(repo!.owner.login, repo!.name, repo!.default_branch);
      const folderId = await createDriveFolder(googleUser.access_token, `ArquiCode_${repo!.name}_${Date.now()}`);
      const folderMap = new Map<string, string>();
      folderMap.set('', folderId);

      for (const item of tree) {
        const parts = item.path.split('/');
        const name = parts.pop()!;
        const parentPath = parts.join('/');
        const pId = folderMap.get(parentPath) || folderId;

        if (item.type === 'tree') {
          const newId = await createDriveFolder(googleUser.access_token, name, pId);
          folderMap.set(item.path, newId);
        } else {
          setCloneProgress(`Copiando: ${item.path}`);
          const raw = await fetchFileRaw(`https://raw.githubusercontent.com/${repo!.owner.login}/${repo!.name}/${repo!.default_branch}/${item.path}`).catch(() => null);
          if (raw) await uploadToDrive(googleUser.access_token, name, raw, pId);
        }
      }
      setStatus(AppStatus.READY);
      alert('Backup concluído no Google Drive!');
    } catch (err: any) {
      alert(err.message);
      setStatus(AppStatus.READY);
    }
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
            {isUserMenuOpen && (
              <div className="absolute right-0 top-12 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 z-[60]">
                <div className="mb-4 pb-4 border-b border-slate-800">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-2">Configurações</p>
                  <button onClick={() => {
                    const token = prompt('Insira seu GitHub Personal Access Token:', ghToken);
                    if (token !== null) setGhToken(token);
                  }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-sm flex items-center space-x-3 text-slate-300">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                    <span>GitHub Token</span>
                  </button>
                </div>
                <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-900/20 text-sm text-red-400 flex items-center space-x-3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg>
                  <span>Sair</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10">
        {status === AppStatus.CLONING && (
          <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur flex items-center justify-center">
             <div className="text-center bg-slate-900 p-10 rounded-3xl border border-slate-800 shadow-2xl max-w-sm">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                <h3 className="text-xl font-bold mb-2">Clonando Repositório</h3>
                <p className="text-slate-400 text-sm mb-4 leading-relaxed">{cloneProgress}</p>
             </div>
          </div>
        )}

        {(status === AppStatus.IDLE || status === AppStatus.ERROR || status === AppStatus.LOADING_REPO) && !repo && (
          <>
            <div className="text-center mb-12 py-10">
                <h2 className="text-5xl font-extrabold mb-6 tracking-tight leading-tight">
                    Domine a <span className="text-indigo-500">arquitetura</span> de qualquer projeto.
                </h2>
                <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                    Análise profunda de padrões de projeto, stack tecnológica e sugestões inteligentes de refatoração movidas por IA.
                </p>
            </div>

            {/* Fix: Removed AppStatus.ANALYZING from the isLoading condition because it's unreachable in this block due to the outer !repo check. */}
            <RepoInput onSearch={handleImport} isLoading={status === AppStatus.LOADING_REPO} />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => handleImport(ex.url)} className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl text-left hover:border-indigo-500 transition-all group">
                    <span className="text-3xl mb-4 block group-hover:scale-110 transition">{ex.icon}</span>
                    <h4 className="font-bold text-white mb-2">{ex.title}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{ex.description}</p>
                </button>
              ))}
            </div>

            {history.length > 0 && (
                <div className="mt-16">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6">Projetos Recentes</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {history.map(log => (
                            <div key={log.id} onClick={() => handleImport(log.id)} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center space-x-3 cursor-pointer hover:border-slate-700 transition">
                                <img src={log.avatar} className="w-10 h-10 rounded-lg" alt="" />
                                <div className="truncate">
                                    <p className="font-bold text-sm truncate">{log.name}</p>
                                    <p className="text-[10px] text-slate-500">{log.category}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </>
        )}

        {repo && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-center mb-10 p-8 bg-slate-900 rounded-3xl border border-slate-800 shadow-xl">
               <div className="flex items-center space-x-6">
                  <img src={repo.owner.avatar_url} className="w-16 h-16 rounded-2xl border border-slate-700" alt="" />
                  <div>
                    <h2 className="text-3xl font-extrabold">{repo.name}</h2>
                    <p className="text-slate-400">por <span className="font-bold text-slate-300">{repo.owner.login}</span> • {repo.language}</p>
                  </div>
               </div>
               <div className="mt-6 md:mt-0 flex space-x-3">
                  <button onClick={handleCloneToDrive} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-bold flex items-center space-x-2 transition shadow-lg shadow-indigo-900/20">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
                    <span>Clonar para Drive</span>
                  </button>
                  <a href={repo.html_url} target="_blank" rel="noreferrer" className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                  </a>
               </div>
            </div>

            <AnalysisBoard analysis={analysis} isAnalyzing={status === AppStatus.ANALYZING} />

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl h-[600px] flex flex-col overflow-hidden">
                 <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest truncate">{currentPath || 'Root'}</span>
                    {currentPath && <button onClick={() => {
                        const parts = currentPath.split('/');
                        parts.pop();
                        const p = parts.join('/');
                        fetchRepoContents(repo.owner.login, repo.name, p).then(f => { setFiles(f); setCurrentPath(p); });
                    }} className="text-[10px] text-indigo-400 font-bold">VOLTAR</button>}
                 </div>
                 <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {files.map(f => (
                      <div key={f.path} className="group relative">
                        <div onClick={() => handleFileClick(f)} className={`p-3 rounded-xl cursor-pointer text-sm flex items-center space-x-3 border ${selectedFile?.path === f.path ? 'bg-indigo-600/10 border-indigo-600/30 text-indigo-400' : 'border-transparent hover:bg-slate-800 text-slate-400'}`}>
                          <span>{f.type === 'dir' ? '📁' : '📄'}</span>
                          <span className="truncate flex-1">{f.name}</span>
                        </div>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex space-x-1 opacity-0 group-hover:opacity-100 transition">
                           <button onClick={(e) => { e.stopPropagation(); handleAction(f, true); }} className="p-1.5 bg-slate-700 hover:bg-indigo-600 rounded text-white" title="Renomear">
                             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); handleAction(f, false); }} className="p-1.5 bg-slate-700 hover:bg-cyan-600 rounded text-white" title="Mover">
                             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                           </button>
                        </div>
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
                         <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Visualizador de Código</span>
                      </div>
                      <pre className="p-6 text-xs font-mono overflow-auto h-[350px] bg-slate-950/50">
                        <code className="text-slate-300 leading-relaxed">{fileContent}</code>
                      </pre>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-5">
                        <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                      </div>
                      <h3 className="text-xl font-bold mb-6 flex items-center">
                        <span className="w-2 h-6 bg-indigo-600 rounded-full mr-3"></span>
                        Arquiteto Virtual
                      </h3>
                      <div className="flex space-x-3 mb-6">
                        <input 
                          type="text" 
                          placeholder="Pergunte sobre padrões de projeto ou complexidade deste arquivo..."
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-indigo-500 transition"
                          onKeyDown={(e) => { if(e.key === 'Enter') {
                            const q = (e.target as HTMLInputElement).value;
                            if(!q.trim()) return;
                            setIsAsking(true); setAnswer('');
                            askAboutFile(selectedFile.name, fileContent, q).then(res => { setAnswer(res); setIsAsking(false); });
                          }}}
                        />
                      </div>
                      
                      {isAsking && <div className="text-center animate-pulse py-4 text-slate-500 text-xs font-bold uppercase tracking-widest">Analisando Arquitetura...</div>}
                      {answer && (
                        <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl animate-in slide-in-from-top-4">
                          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{answer}</p>
                        </div>
                      )}
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
