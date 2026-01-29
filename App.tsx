
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppStatus, GithubRepo, AnalysisResult, GithubFile, ExampleRepo, GoogleUser, ProjectLog, ConversionResult } from './types';
import { fetchRepoInfo, fetchRepoContents, fetchFileRaw, fetchFullTree } from './services/githubService';
import { analyzeProject, askAboutFile } from './services/geminiService';
import { convertToReactPhp } from './services/conversionService';
import { createDriveFolder, uploadToDrive, fetchDriveFileContent } from './services/googleDriveService';
import RepoInput from './components/RepoInput';
import AnalysisBoard from './components/AnalysisBoard';
import hljs from 'highlight.js';

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
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current && fileContent) {
      delete codeRef.current.dataset.highlighted;
      hljs.highlightElement(codeRef.current);
    }
  }, [fileContent]);

  useEffect(() => {
    const loadPicker = () => {
      (window as any).gapi?.load('picker', () => {});
    };
    if ((window as any).gapi) loadPicker();
  }, []);

  const handleImport = async (url: string) => {
    try {
      setStatus(AppStatus.LOADING_REPO);
      const repoData = await fetchRepoInfo(url);
      setRepo(repoData);
      const repoFiles = await fetchRepoContents(repoData.owner.login, repoData.name);
      setFiles(repoFiles);
      setStatus(AppStatus.ANALYZING);
      const readme = repoFiles.find(f => f.name.toLowerCase() === 'readme.md');
      const readmeText = readme?.download_url ? await fetchFileRaw(readme.download_url) : "";
      const aiAnalysis = await analyzeProject(repoData, readmeText);
      setAnalysis(aiAnalysis);
      setStatus(AppStatus.READY);
    } catch (err: any) {
      alert(err.message);
      setStatus(AppStatus.IDLE);
    }
  };

  const handleLocalUpload = async (fileList: FileList) => {
    try {
      setStatus(AppStatus.UPLOADING);
      const projectFiles: GithubFile[] = [];
      const arrayFiles = Array.from(fileList);
      for (const file of arrayFiles) {
        if (file.webkitRelativePath.includes('node_modules')) continue;
        projectFiles.push({
          name: file.name,
          path: file.webkitRelativePath || file.name,
          type: 'file',
          localFile: file
        });
      }
      const mockRepo: GithubRepo = {
        name: arrayFiles[0]?.webkitRelativePath.split('/')[0] || "Projeto Local",
        full_name: "local/upload",
        description: "Projeto carregado localmente",
        stargazers_count: 0,
        language: "Local",
        owner: { login: "user", avatar_url: "https://via.placeholder.com/150" },
        html_url: "#",
        default_branch: "main"
      };
      setRepo(mockRepo);
      setFiles(projectFiles);
      setStatus(AppStatus.ANALYZING);
      const aiAnalysis = await analyzeProject(mockRepo, "Projeto Local carregado via upload.");
      setAnalysis(aiAnalysis);
      setStatus(AppStatus.READY);
    } catch (err) {
      alert("Erro no upload");
      setStatus(AppStatus.IDLE);
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
      alert("Falha na conversão");
      setStatus(AppStatus.READY);
    }
  };

  const downloadProjectZip = async () => {
    if (!conversion || !repo) return;
    
    const JSZip = (window as any).JSZip;
    if (!JSZip) {
      alert("Biblioteca de compactação não carregada.");
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder(`${repo.name}_PHP_Version`);
    
    conversion.generatedFiles.forEach(file => {
      folder.file(file.path, file.content);
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = window.URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${repo.name}_converted.zip`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleFileClick = async (file: GithubFile) => {
    try {
      setSelectedFile(file);
      setFileContent('Carregando...');
      if (file.localFile) {
        const text = await file.localFile.text();
        setFileContent(text);
      } else if (file.content) {
        setFileContent(file.content);
      } else if (file.download_url) {
        const text = await fetchFileRaw(file.download_url);
        setFileContent(text);
      }
      setAnswer('');
    } catch (err) {
      setFileContent('Erro ao carregar conteúdo.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => window.location.reload()}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-300 bg-clip-text text-transparent">ArquiCode Explorer</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10">
        {status === AppStatus.UPLOADING && (
          <div className="fixed inset-0 z-[100] bg-slate-950/90 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <h3 className="text-xl font-bold">Lendo Arquivos Locais...</h3>
            </div>
          </div>
        )}

        {status === AppStatus.CONVERTING && (
          <div className="fixed inset-0 z-[100] bg-slate-950/95 flex items-center justify-center">
             <div className="text-center">
                <div className="text-5xl mb-6 animate-bounce">🪄</div>
                <h3 className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Redesenhando para PHP...</h3>
                <p className="text-slate-500 mt-2">O Gemini está escrevendo seus novos Controllers e Models.</p>
             </div>
          </div>
        )}

        {!repo && (
          <>
            <div className="text-center mb-16 py-10">
                <h2 className="text-6xl font-black mb-6 tracking-tight">Arquitetura <span className="text-indigo-500">Inteligente</span>.</h2>
                <p className="text-slate-400 text-xl max-w-2xl mx-auto">Converta projetos React para PHP 8.3 moderno com análise estrutural profunda.</p>
            </div>
            <RepoInput 
              onSearch={handleImport} 
              onLocalUpload={handleLocalUpload}
              onDriveClick={() => alert("Função Google Drive requer Client ID configurado.")}
              isLoading={status === AppStatus.LOADING_REPO || status === AppStatus.ANALYZING} 
            />
          </>
        )}

        {repo && (
          <div className="animate-in fade-in duration-700">
             <div className="flex flex-col lg:flex-row justify-between items-center mb-8 p-8 bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl">
                <div className="flex items-center space-x-6">
                   <img src={repo.owner.avatar_url} className="w-16 h-16 rounded-2xl border border-slate-700 shadow-lg" alt="" />
                   <div>
                      <h2 className="text-3xl font-black">{repo.name}</h2>
                      <span className="text-xs bg-slate-800 px-3 py-1 rounded-full text-slate-500 font-mono">{repo.full_name}</span>
                   </div>
                </div>
                <div className="mt-6 lg:mt-0 flex space-x-4">
                   {!conversion && (
                     <button onClick={handleConvertProject} className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-2xl font-bold text-sm shadow-lg shadow-emerald-900/20 hover:scale-105 transition-all">✨ Converter para React + PHP</button>
                   )}
                   <button onClick={() => window.location.reload()} className="px-8 py-4 bg-slate-800 rounded-2xl font-bold text-sm hover:bg-slate-700 transition">Novo Projeto</button>
                </div>
             </div>

             {conversion ? (
                <div className="mb-12 bg-slate-900 border-2 border-emerald-500/20 rounded-3xl p-8 shadow-2xl animate-in slide-in-from-bottom-8">
                   <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                      <div>
                        <h3 className="text-2xl font-bold text-emerald-400 flex items-center"><span className="mr-3">🪄</span> Projeto Convertido</h3>
                        <p className="text-slate-500 text-sm mt-1">{conversion.summary}</p>
                      </div>
                      <button 
                        onClick={downloadProjectZip}
                        className="flex items-center space-x-3 px-6 py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black text-sm shadow-xl shadow-emerald-900/30 transition-transform active:scale-95"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        <span>Baixar Projeto Compactado (.zip)</span>
                      </button>
                   </div>

                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-6">
                         <div className="space-y-4">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nova Arquitetura PHP</h4>
                            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-sm text-slate-400 leading-relaxed whitespace-pre-wrap italic">
                               {conversion.phpArchitectureDescription}
                            </div>
                         </div>
                         <div className="space-y-4">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Manual de Configuração</h4>
                            <div className="bg-slate-800/30 p-6 rounded-2xl border border-slate-700 text-sm text-indigo-300 leading-relaxed font-mono whitespace-pre-wrap">
                               {conversion.setupGuide}
                            </div>
                         </div>
                      </div>

                      <div className="space-y-4">
                         <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Visualização dos Arquivos Gerados</h4>
                         <div className="space-y-3 h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                            {conversion.generatedFiles.map((f, i) => (
                               <div key={i} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden group">
                                  <div className="px-4 py-2 bg-slate-800/50 text-[10px] font-bold flex justify-between items-center">
                                     <span className="text-emerald-500 font-mono">{f.path}</span>
                                     <span className="text-slate-600 group-hover:text-slate-400">PHP 8.3</span>
                                  </div>
                                  <pre className="p-4 text-[11px] font-mono text-slate-400 overflow-x-auto max-h-[150px]">
                                     <code>{f.content}</code>
                                  </pre>
                               </div>
                            ))}
                         </div>
                      </div>
                   </div>
                </div>
             ) : (
                <AnalysisBoard analysis={analysis} isAnalyzing={status === AppStatus.ANALYZING} />
             )}

             <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl h-[600px] flex flex-col overflow-hidden shadow-xl">
                   <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
                      <span className="text-xs font-black text-slate-500 uppercase">Arquivos Inspecionados</span>
                   </div>
                   <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
                      {files.map(f => (
                        <div key={f.path} onClick={() => handleFileClick(f)} className={`p-3 rounded-xl cursor-pointer text-sm mb-1 flex items-center space-x-3 transition-all ${selectedFile?.path === f.path ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/30' : 'hover:bg-slate-800 text-slate-400 border border-transparent'}`}>
                           <span>{f.type === 'dir' ? '📁' : '📄'}</span>
                           <span className="truncate flex-1 font-medium">{f.name}</span>
                        </div>
                      ))}
                   </div>
                </div>

                <div className="lg:col-span-3 space-y-6">
                   {selectedFile ? (
                     <>
                       <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                          <div className="px-6 py-4 bg-slate-800/40 border-b border-slate-800 flex justify-between items-center">
                             <code className="text-xs text-indigo-400 font-mono">{selectedFile.path}</code>
                          </div>
                          <pre className="p-8 text-xs font-mono overflow-auto h-[400px] bg-slate-950/50 scrollbar-thin">
                             <code ref={codeRef} className="leading-relaxed">{fileContent}</code>
                          </pre>
                       </div>
                       <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-xl">
                          <h3 className="text-xl font-bold mb-6 flex items-center"><span className="w-2 h-6 bg-indigo-500 rounded mr-3"></span>Arquiteto Virtual</h3>
                          <input 
                            type="text" 
                            placeholder="Como esta lógica de front-end se tornaria um Controller PHP?"
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-5 text-sm focus:border-indigo-500 transition-all outline-none shadow-inner"
                            onKeyDown={(e) => { if(e.key === 'Enter') {
                               const q = (e.target as HTMLInputElement).value;
                               if(!q) return;
                               setIsAsking(true); askAboutFile(selectedFile.name, fileContent, q).then(res => { setAnswer(res); setIsAsking(false); });
                            }}}
                          />
                          {isAsking && <div className="text-center py-6 animate-pulse text-indigo-400 font-bold text-xs uppercase tracking-widest">Consultando Oráculo Gemini...</div>}
                          {answer && <div className="mt-6 p-8 bg-slate-950 border border-slate-800 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap border-l-4 border-l-indigo-500 animate-in slide-in-from-top-2">{answer}</div>}
                       </div>
                     </>
                   ) : (
                     <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-3xl text-slate-600">
                        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6 opacity-50">
                          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        </div>
                        <p className="text-lg font-medium">Selecione um arquivo para iniciar o redesenho arquitetural.</p>
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
