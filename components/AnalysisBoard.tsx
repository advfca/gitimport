
import React from 'react';
import { AnalysisResult } from '../types';

interface AnalysisBoardProps {
  analysis: AnalysisResult | null;
  isAnalyzing: boolean;
}

const AnalysisBoard: React.FC<AnalysisBoardProps> = ({ analysis, isAnalyzing }) => {
  if (isAnalyzing) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 animate-pulse">
        <div className="h-6 w-48 bg-slate-700 rounded mb-6"></div>
        <div className="space-y-4">
          <div className="h-4 w-full bg-slate-700 rounded"></div>
          <div className="h-4 w-full bg-slate-700 rounded"></div>
          <div className="h-4 w-2/3 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl">
        <h3 className="text-xl font-bold text-blue-400 mb-4 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          Resumo do Projeto
        </h3>
        <p className="text-slate-300 leading-relaxed mb-6">{analysis.summary}</p>
        
        <h4 className="font-semibold text-slate-100 mb-3">Stack Tecnológica</h4>
        <div className="flex flex-wrap gap-2">
          {analysis.technologies.map((tech, i) => (
            <span key={i} className="px-3 py-1 bg-slate-700 text-slate-200 text-xs rounded-full border border-slate-600">
              {tech}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl">
        <h3 className="text-xl font-bold text-cyan-400 mb-4 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
          </svg>
          Insights e Sugestões
        </h3>
        <div className="mb-6">
          <h4 className="font-semibold text-slate-100 mb-2">Arquitetura</h4>
          <p className="text-slate-300 text-sm leading-relaxed">{analysis.architecture}</p>
        </div>
        <div>
          <h4 className="font-semibold text-slate-100 mb-2">Próximos Passos</h4>
          <ul className="space-y-2">
            {analysis.suggestions.map((sug, i) => (
              <li key={i} className="text-slate-400 text-sm flex items-start">
                <span className="text-cyan-500 mr-2">•</span>
                {sug}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AnalysisBoard;
