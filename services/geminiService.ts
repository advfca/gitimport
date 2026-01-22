
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

export const analyzeProject = async (repoInfo: any, readmeContent: string): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const prompt = `
    Analise o seguinte projeto do GitHub:
    Nome: ${repoInfo.full_name}
    Descrição: ${repoInfo.description}
    Linguagem Principal: ${repoInfo.language}
    
    Conteúdo do README:
    ${readmeContent.substring(0, 5000)} // Limiting to prevent token overflow
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: "Você é um arquiteto de software sênior. Analise o projeto e retorne um objeto JSON estruturado.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: "Resumo conciso do projeto" },
          technologies: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Lista de tecnologias detectadas"
          },
          architecture: { type: Type.STRING, description: "Descrição da arquitetura provável" },
          suggestions: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Sugestões de melhoria"
          }
        },
        required: ["summary", "technologies", "architecture", "suggestions"]
      }
    }
  });

  return JSON.parse(response.text);
};

export const askAboutFile = async (fileName: string, content: string, question: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Arquivo: ${fileName}\n\nConteúdo:\n${content.substring(0, 8000)}\n\nPergunta: ${question}`,
    config: {
      systemInstruction: "Você é um desenvolvedor especialista em análise de código. Responda em Português do Brasil de forma didática."
    }
  });

  return response.text;
};
