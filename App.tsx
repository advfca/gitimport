
import React, { useState } from 'react';
import { AppStatus, GithubRepo, AnalysisResult, GithubFile, ExampleRepo } from './types';
import { fetchRepoInfo, fetchRepoContents, fetchFileRaw } from './services/githubService';
import { analyzeProject, askAboutFile } from './services/geminiService';
import RepoInput from './components/RepoInput';
import AnalysisBoard from './components/AnalysisBoard';

const EXAMPLES: ExampleRepo[] = [
  {
    title: "React.js",
    description: "Explore a arquitetura da biblioteca de UI mais famosa do mundo.",
    url: "https://github.com/facebook/react",
    category: "Frontend",
    icon: "⚛️"
  },
  {
    title: "Express",
    description: "Analise como funciona um framework web minimalista para Node.js.",
    url: "https://github.com/expressjs/express",
    category: "Backend",
    icon: "🚀"
  },
  {
    title: "minGPT",
    description: "Veja uma implementação limpa e didática de Transformers em Python.",
    url: "https://github.com/karpathy/minGPT",
    category: "AI/ML",
    icon: "🧠"
  },
  {
    title: "Tailwind CSS",
    description: "Entenda a estrutura de um framework de CSS utilitário.",
    url: "https://github.com/tailwindlabs/tailwindcss",
    category: "Tooling",
    icon: "🎨"
  }
];

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [repo, setRepo] = useState<GithubRepo | null>(null);
  const [files, setFiles] = useState<GithubFile[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<GithubFile | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isAsking, setIsAsking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleImport = async (url: string) => {
    try {
      // Limpa estados antes de começar
      setError(null);
      setRepo(null);
      setAnalysis(null);
      setFiles([]);
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
      let readmeText = "Nenhum README encontrado para este projeto.";
      if (readme && readme.download_url) {
        readmeText = await fetchFileRaw(readme.download_url);
      }
      
      const aiAnalysis = await analyzeProject(repoData, readmeText);
      setAnalysis(aiAnalysis);
      setStatus(AppStatus.READY);
      
    } catch (err: any) {
      console.error("Erro na importação:", err);
      setError(err.message || 'Ocorreu um erro desconhecido ao tentar acessar o GitHub.');
      setStatus(AppStatus.ERROR);
      setRepo(null); 
    }
  };

  const handleFileClick = async (file: GithubFile) => {
    if (file.type === 'dir' || !file.download_url) return;
    
    try {
      setSelectedFile(file);
      setFileContent('Carregando conteúdo...');
      const content = await fetchFileRaw(file.download_url);
      setFileContent(content);
      setAnswer('');
    } catch (err) {
      setFileContent('Não foi possível carregar o arquivo. O link de download pode ter expirado.');
    }
  };

  const handleAskAI = async (question: string) => {
    if (!selectedFile || !fileContent || !question.trim()) return;
    setIsAsking(true);
    setAnswer('');
    try {
      const res = await askAboutFile(selectedFile.name, fileContent, question);
      setAnswer(res);
    } catch (err) {
      setAnswer('Infelizmente, houve um erro ao processar sua dúvida com a IA. Tente reformular a pergunta.');
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => {
            setStatus(AppStatus.IDLE);
            setRepo(null);
            setError(null);
          }}>
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">GitMind Explorer</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">AI Project Analyzer</p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-6">
            <a href="https://github.com" target="_blank" className="text-slate-400 hover:text-white transition text-sm">GitHub</a>
            <a href="https://ai.google.dev" target="_blank" className="text-slate-400 hover:text-white transition text-sm">Gemini AI</a>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        {(status === AppStatus.IDLE || status === AppStatus.ERROR) && !repo && (
          <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-5xl font-extrabold mb-6 tracking-tight leading-tight">
              Análise Inteligente de <br />
              <span className="text-blue-500">Repositórios GitHub.</span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg mb-10">
              Descubra a tecnologia por trás dos melhores projetos. Cole o link e receba 
              um relatório completo gerado pelo Gemini 3.
            </p>
          </div>
        )}

        <RepoInput 
          onSearch={handleImport} 
          isLoading={status === AppStatus.LOADING_REPO || status === AppStatus.ANALYZING} 
        />

        {error && (
          <div className="max-w-3xl mx-auto mb-8 p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 flex items-start space-x-3 shadow-lg shadow-red-900/10 animate-in shake duration-500">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
              <span className="text-sm font-semibold">Ops! Algo deu errado:</span>
              <p className="text-sm mt-1 text-red-300 opacity-90">{error}</p>
            </div>
          </div>
        )}

        {(status === AppStatus.IDLE || status === AppStatus.ERROR) && !repo && (
          <div className="max-w-4xl mx-auto mt-16 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-semibold text-slate-200 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
                Comece por um exemplo público
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => handleImport(ex.url)}
                  className="group relative bg-slate-900 border border-slate-800 rounded-2xl p-5 text-left hover:border-blue-500/50 hover:bg-slate-800/50 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
                    <span className="text-3xl">{ex.icon}</span>
                  </div>
                  <div className="relative z-10">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">{ex.category}</span>
                    <h4 className="text-lg font-bold text-slate-100 mt-1 mb-2 group-hover:text-blue-400 transition-colors">{ex.title}</h4>
                    <p className="text-sm text-slate-400 line-clamp-2">{ex.description}</p>
                    <div className="mt-4 flex items-center text-xs font-medium text-slate-500 group-hover:text-slate-300">
                      Importar agora
                      <svg className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {repo && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row items-center justify-between mb-8 p-6 bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl">
              <div className="flex items-center space-x-4">
                <img src={repo.owner.avatar_url} alt={repo.owner.login} className="w-16 h-16 rounded-full border-2 border-slate-700" />
                <div>
                  <h2 className="text-2xl font-bold flex items-center">
                    {repo.name}
                    <span className="ml-3 px-2 py-1 bg-slate-800 text-xs text-slate-400 rounded-md border border-slate-700">Público</span>
                  </h2>
                  <p className="text-slate-400">{repo.owner.login}</p>
                </div>
              </div>
              <div className="mt-4 md:mt-0 flex space-x-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-500">{repo.stargazers_count}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Estrelas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-500">{repo.language || 'N/A'}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Linguagem</p>
                </div>
              </div>
            </div>

            <AnalysisBoard analysis={analysis} isAnalyzing={status === AppStatus.ANALYZING} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden h-[600px] flex flex-col shadow-xl">
                <div className="p-4 bg-slate-800/50 border-b border-slate-700 font-semibold text-slate-200 flex justify-between items-center">
                  <span>Arquivos</span>
                  <span className="text-[10px] text-slate-500 px-2 py-0.5 bg-slate-950 rounded border border-slate-800 uppercase tracking-tighter">Root</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 scroll-smooth">
                  {files.length > 0 ? files.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => handleFileClick(file)}
                      className={`w-full text-left p-3 rounded-lg flex items-center space-x-3 transition group ${
                        selectedFile?.path === file.path 
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                        : 'hover:bg-slate-800 text-slate-400'
                      }`}
                    >
                      {file.type === 'dir' ? (
                        <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path>
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                        </svg>
                      )}
                      <span className="truncate flex-1 text-sm">{file.name}</span>
                    </button>
                  )) : (
                    <div className="p-8 text-center text-slate-500 italic text-sm">
                      Nenhum arquivo encontrado na raiz deste repositório.
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2 space-y-6">
                {selectedFile ? (
                  <>
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                      <div className="p-4 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between">
                        <span className="font-mono text-sm text-cyan-400 truncate max-w-[80%]">{selectedFile.name}</span>
                        <span className="text-xs text-slate-500 hidden sm:inline">Visualização de código</span>
                      </div>
                      <pre className="p-6 text-sm font-mono overflow-x-auto bg-slate-950 h-[400px] text-slate-300 selection:bg-cyan-500/30">
                        <code>{fileContent}</code>
                      </pre>
                    </div>

                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-2xl relative">
                      <div className="absolute top-0 right-0 p-3">
                         <div className="flex items-center space-x-1 text-[10px] text-cyan-500 uppercase tracking-widest font-bold">
                            <span className="animate-pulse">●</span>
                            <span>IA Ativa</span>
                         </div>
                      </div>
                      <h3 className="text-lg font-bold mb-4 flex items-center text-slate-100">
                        <svg className="w-5 h-5 mr-2 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        Tire dúvidas sobre este arquivo
                      </h3>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {['O que este código faz?', 'Possíveis bugs?', 'Como melhorar?', 'Explicar lógica'].map(q => (
                          <button 
                            key={q}
                            onClick={() => handleAskAI(q)}
                            disabled={isAsking}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-slate-300 transition disabled:opacity-50"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                      <div className="flex space-x-2">
                        <input 
                          type="text" 
                          placeholder="Pergunte algo personalizado..."
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition shadow-inner"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAskAI(e.currentTarget.value);
                          }}
                        />
                        <button 
                          disabled={isAsking}
                          onClick={(e) => {
                            const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                            handleAskAI(input.value);
                          }}
                          className="p-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl transition disabled:opacity-50 shadow-lg shadow-cyan-900/20"
                        >
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                          </svg>
                        </button>
                      </div>

                      {isAsking && (
                        <div className="mt-6 flex items-center justify-center space-x-3 text-slate-400 italic">
                          <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                          <span>Gemini analisando código...</span>
                        </div>
                      )}

                      {answer && (
                        <div className="mt-6 p-5 bg-cyan-900/10 border border-cyan-500/20 rounded-xl animate-in fade-in slide-in-from-top-4 duration-500">
                          <div className="flex items-start space-x-3">
                            <div className="w-8 h-8 bg-cyan-600 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white shadow-lg">AI</div>
                            <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap flex-1">
                              {answer}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-900 rounded-2xl border border-slate-800 text-slate-500 border-dashed border-2">
                    <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <p className="font-medium">Selecione um arquivo ao lado para começar</p>
                    <p className="text-sm mt-1">A IA explicará a lógica e sugerirá melhorias.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-24 border-t border-slate-900 py-12 bg-slate-950/50">
        <div className="container mx-auto px-6 text-center">
          <p className="text-slate-500 text-sm">
            Nota: Este explorador utiliza a API pública do GitHub e atualmente suporta apenas <strong>repositórios públicos</strong>.
          </p>
          <div className="mt-8 flex justify-center space-x-8">
            <div className="flex flex-col items-center">
               <span className="text-slate-400 font-bold text-lg">GitHub API</span>
               <span className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Data Source</span>
            </div>
            <div className="flex flex-col items-center border-l border-slate-800 pl-8">
               <span className="text-slate-400 font-bold text-lg">Gemini 3</span>
               <span className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Artificial Intelligence</span>
            </div>
          </div>
          <p className="mt-8 text-slate-700 text-[10px] uppercase tracking-widest font-bold">
            © 2025 GitMind Explorer — Transformando código em conhecimento
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
