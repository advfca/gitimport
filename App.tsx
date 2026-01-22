
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppStatus, GithubRepo, AnalysisResult, GithubFile, ExampleRepo, GoogleUser, ProjectLog } from './types';
import { fetchRepoInfo, fetchRepoContents, fetchFileRaw, fetchFullTree, updateFileContent, moveOrRenameFile } from './services/githubService';
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
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  // Storage states
  const [history, setHistory] = useState<ProjectLog[]>(() => {
    const saved = localStorage.getItem('arquicode_history') || localStorage.getItem('gitmind_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [ghToken, setGhToken] = useState<string>(() => localStorage.getItem('gh_token') || '');
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [cloneProgress, setCloneProgress] = useState<string>('');

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
      const readme = repoFiles.find(f => f.name.toLowerCase() === 'readme.md');
      let readmeText = "Nenhum README encontrado.";
      if (readme && readme.download_url) readmeText = await fetchFileRaw(readme.download_url);
      
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
      setHistory(prev => [newLog, ...prev.filter(l => l.id !== newLog.id)].slice(0, 50));

      setStatus(AppStatus.READY);
    } catch (err: any) {
      setError(err.message);
      setStatus(AppStatus.ERROR);
    }
  };

  const handleEditOnGithub = async () => {
    if (!ghToken || !selectedFile || !repo || !answer) return;
    try {
      setStatus(AppStatus.COMMITTING);
      const codeMatch = answer.match(/```(?:\w+)?\n([\s\S]*?)```/);
      const newContent = codeMatch ? codeMatch[1] : answer;

      await updateFileContent(
        ghToken,
        repo.owner.login,
        repo.name,
        selectedFile.path,
        newContent,
        selectedFile.sha!,
        `AI Suggestion: Alterado via ArquiCode Explorer`
      );
      
      setFileContent(newContent);
      setAnswer('✅ Alteração enviada para o GitHub com sucesso!');
      setStatus(AppStatus.READY);
    } catch (err: any) {
      setError(`Erro ao commitar: ${err.message}`);
      setStatus(AppStatus.READY);
    }
  };

  const handleMoveOrRename = async (file: GithubFile, isRename: boolean) => {
    if (!ghToken || !repo) {
      alert("Você precisa configurar um GitHub Token no menu de usuário para realizar esta ação.");
      return;
    }

    const promptText = isRename 
      ? `Novo nome para "${file.name}":` 
      : `Mover "${file.path}" para (caminho completo):`;
    
    const defaultValue = isRename ? file.name : file.path;
    const input = prompt(promptText, defaultValue);
    
    if (!input || input === defaultValue) return;

    let newPath = input;
    if (isRename) {
      const parts = file.path.split('/');
      parts.pop();
      newPath = parts.length > 0 ? `${parts.join('/')}/${input}` : input;
    }

    try {
      setStatus(AppStatus.COMMITTING);
      // Precisamos do conteúdo para recriar o arquivo no novo caminho
      const content = await fetchFileRaw(file.download_url!);
      
      await moveOrRenameFile(
        ghToken,
        repo.owner.login,
        repo.name,
        file.path,
        newPath,
        file.sha!,
        content,
        `${isRename ? 'Renaming' : 'Moving'} ${file.path} to ${newPath}`
      );

      // Atualiza a lista de arquivos
      const newFiles = await fetchRepoContents(repo.owner.login, repo.name, currentPath);
      setFiles(newFiles);
      if (selectedFile?.path === file.path) setSelectedFile(null);
      
      setStatus(AppStatus.READY);
      alert("Ação concluída com sucesso!");
    } catch (err: any) {
      setError(err.message);
      setStatus(AppStatus.READY);
      alert(`Falha na operação: ${err.message}`);
    }
  };

  const handleGoogleLogin = () => {
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
  };

  const handleCloneToDrive = async (e: React.MouseEvent) => {
    if (!repo) return;
    if (!googleUser) {
        handleGoogleLogin();
        return;
    }
    try {
      setStatus(AppStatus.CLONING);
      setCloneProgress('Buscando estrutura de arquivos...');
      const tree = await fetchFullTree(repo.owner.login, repo.name, repo.default_branch);
      const rootFolderId = await createDriveFolder(googleUser.access_token, `ArquiCode_${repo.name}_${Date.now()}`);
      const folderMap = new Map<string, string>();
      folderMap.set('', rootFolderId);

      for (const item of tree) {
        const pathParts = item.path.split('/');
        const fileName = pathParts.pop() || '';
        const parentPath = pathParts.join('/');
        const parentId = folderMap.get(parentPath) || rootFolderId;

        if (item.type === 'tree') {
          const newFolderId = await createDriveFolder(googleUser.access_token, fileName, parentId);
          folderMap.set(item.path, newFolderId);
        } else {
          setCloneProgress(`Copiando: ${item.path}`);
          const rawUrl = `https://raw.githubusercontent.com/${repo.owner.login}/${repo.name}/${repo.default_branch}/${item.path}`;
          const content = await fetchFileRaw(rawUrl).catch(() => null);
          if (content) await uploadToDrive(googleUser.access_token, fileName, content, parentId);
        }
      }
      setCloneProgress('Sucesso!');
      setTimeout(() => setStatus(AppStatus.READY), 2000);
    } catch (err: any) {
      setError(err.message);
      setStatus(AppStatus.READY);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setStatus(AppStatus.IDLE)}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-300 bg-clip-text text-transparent">ArquiCode</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Explorer</p>
            </div>
          </div>

          <div className="flex items-center space-x-4 relative" ref={userMenuRef}>
            <div className="hidden md:flex items-center space-x-2 mr-4">
                <div className={`w-2 h-2 rounded-full ${googleUser ? 'bg-green-500 animate-pulse' : 'bg-slate-700'}`}></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Google Drive</span>
            </div>
            
            <button 
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center hover:bg-slate-700 transition relative overflow-hidden group"
            >
                <svg className="w-5 h-5 text-slate-400 group-hover:text-white transition" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
            </button>

            {isUserMenuOpen && (
                <div className="absolute right-0 top-12 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 z-[60] animate-in fade-in slide-in-from-top-2">
                    <div className="mb-4 pb-4 border-b border-slate-800">
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Sessão</p>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400">Google Drive:</span>
                                <span className={googleUser ? "text-green-400" : "text-red-400"}>{googleUser ? "Conectado" : "Desconectado"}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400">GitHub Token:</span>
                                <span className={ghToken ? "text-blue-400" : "text-slate-600"}>{ghToken ? "Ativo" : "Ausente"}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-1">
                        {!googleUser && (
                            <button onClick={handleGoogleLogin} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-sm flex items-center space-x-3 text-slate-300">
                                <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-4 h-4" alt="" />
                                <span>Conectar Drive</span>
                            </button>
                        )}
                        <button onClick={() => {
                            const token = prompt('Insira seu GitHub Personal Access Token:', ghToken);
                            if (token !== null) setGhToken(token);
                            setIsUserMenuOpen(false);
                        }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-sm flex items-center space-x-3 text-slate-300">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                            <span>Configurar GitHub</span>
                        </button>
                        <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-900/20 text-sm flex items-center space-x-3 text-red-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                            <span>Sair da Conta</span>
                        </button>
                    </div>
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
                <h3 className="text-xl font-bold mb-2">Copiando Arquivos</h3>
                <p className="text-slate-400 text-sm mb-4 leading-relaxed">{cloneProgress}</p>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full animate-pulse w-full"></div>
                </div>
             </div>
          </div>
        )}

        {(status === AppStatus.IDLE || status === AppStatus.ERROR || status === AppStatus.LOADING_REPO) && !repo && (
          <>
            <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h2 className="text-5xl font-extrabold mb-6 tracking-tight leading-tight">
                    Entenda a <span className="text-indigo-500">arquitetura</span> <br />
                    por trás do código.
                </h2>
                <p className="text-slate-400 max-w-3xl mx-auto text-lg mb-4">
                    Explore projetos de código aberto, entenda estruturas complexas e receba insights 
                    de um arquiteto sênior movido pela inteligência do Gemini.
                </p>
                <div className="flex flex-wrap justify-center gap-6 mt-8 text-xs font-bold uppercase tracking-widest text-slate-500">
                    <div className="flex items-center space-x-2">
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                        <span>Análise de Padrões</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full"></span>
                        <span>Backup Estruturado</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                        <span>Sugestões de Refatoração</span>
                    </div>
                </div>
            </div>

            <RepoInput onSearch={handleImport} isLoading={status === AppStatus.LOADING_REPO} />
            
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mt-12">
              <div className="lg:col-span-3 space-y-8">
                <div>
                    <h2 className="text-xl font-bold mb-6 flex items-center">
                        <span className="w-2 h-6 bg-indigo-600 rounded-full mr-3"></span>
                        Projetos Recentes
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {history.length > 0 ? history.map(log => (
                        <div key={log.id} onClick={() => handleImport(log.id)} className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl flex items-center space-x-4 cursor-pointer hover:border-indigo-500/50 hover:bg-slate-900 transition-all group">
                        <img src={log.avatar} className="w-12 h-12 rounded-xl border border-slate-700 group-hover:scale-105 transition" alt="" />
                        <div className="flex-1 min-w-0">
                            <p className="font-bold truncate text-sm text-slate-100">{log.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{log.category}</p>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] text-slate-600 block mb-1">{new Date(log.timestamp).toLocaleDateString()}</span>
                            <svg className="w-4 h-4 text-slate-700 group-hover:text-indigo-500 ml-auto transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                        </div>
                        </div>
                    )) : (
                        <div className="col-span-2 p-12 bg-slate-900/30 border border-dashed border-slate-800 rounded-3xl text-center">
                            <svg className="w-12 h-12 text-slate-800 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                            <p className="text-slate-500 text-sm font-medium">Sua jornada começa aqui.</p>
                            <p className="text-slate-600 text-xs mt-1">Cole um link acima para analisar seu primeiro repositório.</p>
                        </div>
                    )}
                    </div>
                </div>

                <div>
                    <h2 className="text-xl font-bold mb-6 flex items-center">
                        <span className="w-2 h-6 bg-purple-600 rounded-full mr-3"></span>
                        Exemplos de Referência
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {EXAMPLES.map((ex, i) => (
                            <button key={i} onClick={() => handleImport(ex.url)} className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl text-left hover:border-purple-500/50 transition-all group relative overflow-hidden">
                                <span className="absolute -top-2 -right-2 text-4xl opacity-10 grayscale group-hover:grayscale-0 group-hover:opacity-20 transition-all">{ex.icon}</span>
                                <p className="text-[10px] font-bold text-purple-500 uppercase mb-1">{ex.category}</p>
                                <h4 className="font-bold text-sm text-slate-100 mb-2">{ex.title}</h4>
                                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{ex.description}</p>
                            </button>
                        ))}
                    </div>
                </div>
              </div>

              <div className="lg:col-span-1">
                <h2 className="text-xl font-bold mb-6 flex items-center">
                  <span className="w-2 h-6 bg-cyan-600 rounded-full mr-3"></span>
                  Stacks Analisadas
                </h2>
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  {ranking.map(([cat, count], idx) => (
                    <div key={cat} className="p-5 border-b border-slate-800/50 flex items-center justify-between last:border-0 hover:bg-slate-900 transition">
                      <div className="flex items-center space-x-3">
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${idx === 0 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-slate-800 text-slate-500'}`}>
                            {idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-slate-300 truncate max-w-[100px]">{cat}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="h-1 w-12 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500" style={{ width: `${(count / history.length) * 100}%` }}></div>
                        </div>
                        <span className="text-xs font-bold text-cyan-400">{count}</span>
                      </div>
                    </div>
                  ))}
                  {ranking.length === 0 && (
                    <div className="p-10 text-center">
                        <p className="text-xs text-slate-600 uppercase font-bold tracking-widest">Sem dados ainda</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {repo && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-center mb-10 p-8 bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                   <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
               </div>
               <div className="flex items-center space-x-6">
                  <img src={repo.owner.avatar_url} className="w-16 h-16 rounded-2xl border-2 border-slate-700 shadow-xl" alt="" />
                  <div>
                    <h2 className="text-3xl font-extrabold text-white">{repo.name}</h2>
                    <div className="flex items-center space-x-4 mt-2">
                        <span className="text-sm text-slate-400">por <span className="font-bold text-slate-300">{repo.owner.login}</span></span>
                        <span className="px-2 py-0.5 bg-slate-800 rounded text-[10px] text-slate-500 uppercase font-bold border border-slate-700">{repo.language}</span>
                    </div>
                  </div>
               </div>
               <div className="mt-6 md:mt-0 flex items-center space-x-3">
                  <button onClick={handleCloneToDrive} className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-bold shadow-xl shadow-indigo-900/20 transition-all active:scale-95">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
                    <span>Salvar no Drive</span>
                  </button>
                  <a href={repo.html_url} target="_blank" rel="noreferrer" className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700">
                    <svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                  </a>
               </div>
            </div>

            <AnalysisBoard analysis={analysis} isAnalyzing={status === AppStatus.ANALYZING} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl h-[600px] overflow-hidden flex flex-col shadow-2xl">
                 <div className="p-5 bg-slate-800/30 border-b border-slate-800 flex justify-between items-center">
                    <div className="flex items-center truncate">
                        <svg className="w-4 h-4 text-slate-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-300 truncate">{currentPath || 'Raiz do Projeto'}</span>
                    </div>
                    {currentPath && <button onClick={() => {
                        const parts = currentPath.split('/');
                        parts.pop();
                        const p = parts.join('/');
                        fetchRepoContents(repo.owner.login, repo.name, p).then(f => { setFiles(f); setCurrentPath(p); });
                    }} className="text-[10px] font-bold text-indigo-400 bg-indigo-900/20 px-2 py-1 rounded border border-indigo-900/30 hover:bg-indigo-900/40 transition">VOLTAR</button>}
                 </div>
                 <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {files.map(f => (
                      <div key={f.path} className="group relative">
                        <div 
                          onClick={() => handleFileClick(f)} 
                          className={`p-3 rounded-xl cursor-pointer text-sm flex items-center space-x-3 transition-all border ${selectedFile?.path === f.path ? 'bg-indigo-600/10 text-indigo-400 border-indigo-600/30' : 'hover:bg-slate-800 text-slate-400 border-transparent hover:border-slate-700'}`}
                        >
                          <span className="text-lg">{f.type === 'dir' ? '📁' : '📄'}</span>
                          <span className="truncate flex-1">{f.name}</span>
                        </div>
                        
                        {/* File actions */}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            title="Renomear" 
                            onClick={(e) => { e.stopPropagation(); handleMoveOrRename(f, true); }} 
                            className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-300 hover:text-white transition"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                          </button>
                          <button 
                            title="Mover" 
                            onClick={(e) => { e.stopPropagation(); handleMoveOrRename(f, false); }} 
                            className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-300 hover:text-white transition"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                 </div>
              </div>

              <div className="lg:col-span-2 space-y-6">
                {selectedFile ? (
                  <>
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                      <div className="p-4 bg-slate-800/20 border-b border-slate-800 flex items-center justify-between">
                         <span className="text-xs font-mono text-cyan-500 truncate">{selectedFile.path}</span>
                         <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Leitor de Código</span>
                      </div>
                      <pre className="p-6 text-xs font-mono overflow-auto h-[350px] bg-slate-950/50 scrollbar-thin scrollbar-thumb-slate-800">
                        <code className="text-slate-300">{fileContent}</code>
                      </pre>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl relative">
                      <div className="absolute top-4 right-4 text-[10px] font-bold text-cyan-600 uppercase tracking-widest animate-pulse">Arquiteto Virtual Ativo</div>
                      <h3 className="text-xl font-extrabold mb-6 flex items-center">
                        <span className="w-2 h-6 bg-cyan-500 rounded-full mr-3"></span>
                        Insights Arquiteturais
                      </h3>
                      <div className="flex space-x-3">
                        <input 
                          type="text" 
                          placeholder="Pergunte sobre padrões de projeto, acoplamento ou melhorias..."
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-cyan-500 transition shadow-inner"
                          onKeyDown={(e) => { if(e.key === 'Enter') {
                            const q = (e.target as HTMLInputElement).value;
                            if(!q.trim()) return;
                            setIsAsking(true);
                            setAnswer('');
                            askAboutFile(selectedFile.name, fileContent, q).then(res => { setAnswer(res); setIsAsking(false); });
                          }}}
                        />
                        <button className="p-4 bg-cyan-600 hover:bg-cyan-500 rounded-2xl transition shadow-lg shadow-cyan-900/20">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        </button>
                      </div>
                      
                      {isAsking && (
                        <div className="mt-8 text-center animate-pulse">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Analisando complexidade...</p>
                        </div>
                      )}

                      {answer && (
                        <div className="mt-8 p-6 bg-slate-950 border border-slate-800 rounded-2xl animate-in slide-in-from-top-4 duration-500">
                          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{answer}</p>
                          {ghToken && answer.includes('```') && (
                             <div className="mt-6 pt-6 border-t border-slate-800">
                                <button 
                                    onClick={handleEditOnGithub}
                                    disabled={status === AppStatus.COMMITTING}
                                    className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-2xl text-xs font-bold uppercase tracking-widest transition shadow-lg shadow-green-900/20"
                                >
                                {status === AppStatus.COMMITTING ? 'Sincronizando...' : 'Aplicar Sugestão no GitHub'}
                                </button>
                                <p className="text-[10px] text-slate-600 text-center mt-3 uppercase tracking-tighter">O commit será identificado como ArquiCode Explorer.</p>
                             </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-3xl text-slate-500 animate-in fade-in duration-1000">
                    <svg className="w-20 h-20 mb-6 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <p className="text-lg font-medium">Pronto para entender este código?</p>
                    <p className="text-sm mt-2">Selecione um arquivo para iniciar a inspeção arquitetural.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-24 border-t border-slate-900 py-16 bg-slate-950/80">
          <div className="container mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left">
            <div>
                <h4 className="font-bold text-white mb-4 uppercase tracking-widest text-xs text-indigo-500">ArquiCode Explorer</h4>
                <p className="text-slate-500 text-sm leading-relaxed">
                    Entenda a arquitetura por trás do código. A plataforma essencial para quem busca excelência técnica e compreensão profunda de sistemas.
                </p>
            </div>
            <div>
                <h4 className="font-bold text-white mb-4 uppercase tracking-widest text-xs text-cyan-500">Stack de Inteligência</h4>
                <div className="flex flex-wrap justify-center md:justify-start gap-4">
                    <span className="text-slate-400 text-sm font-medium border-b border-slate-800 pb-1">Gemini AI Models</span>
                    <span className="text-slate-400 text-sm font-medium border-b border-slate-800 pb-1">GitHub REST v3</span>
                    <span className="text-slate-400 text-sm font-medium border-b border-slate-800 pb-1">Google Drive API</span>
                </div>
            </div>
            <div>
                <h4 className="font-bold text-white mb-4 uppercase tracking-widest text-xs text-purple-500">Segurança</h4>
                <p className="text-slate-600 text-xs leading-relaxed">
                    Sua privacidade é prioridade. Tokens e histórico são mantidos localmente no seu navegador via localStorage.
                </p>
            </div>
          </div>
          <div className="text-center mt-12 border-t border-slate-900 pt-8">
            <p className="text-[10px] text-slate-700 uppercase tracking-[0.2em] font-bold">© 2025 ArquiCode — Domine a estrutura. Evolua o código.</p>
          </div>
      </footer>
    </div>
  );
};

export default App;
