
import { GoogleGenAI, Type } from "@google/genai";
import { ConversionResult, GithubFile } from "../types";

export const convertToReactPhp = async (
  repoName: string, 
  files: GithubFile[], 
  analysis: any
): Promise<ConversionResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const relevantFilesInfo = files
    .filter(f => f.name.endsWith('.ts') || f.name.endsWith('.tsx') || f.name.endsWith('.json'))
    .slice(0, 10)
    .map(f => f.path)
    .join(', ');

  const contextPrompt = `
    Você é um Engenheiro de Software Fullstack Especialista.
    Converta o projeto React/TS "${repoName}" em uma aplicação "React + PHP 8.3 Moderno".
    
    ESTRUTURA ATUAL DETECTADA: ${relevantFilesInfo}
    ANÁLISE DE ARQUITETURA: ${JSON.stringify(analysis)}
    
    TAREFA:
    1. Gere os arquivos PHP necessários (Controllers, Models, Routes) no padrão PSR-12.
    2. Gere um arquivo manual de configuração detalhado em Markdown.
    3. Retorne uma lista de objetos contendo o caminho relativo e o conteúdo completo de cada arquivo.
    
    Os arquivos devem seguir esta estrutura sugerida:
    - /api/src/Controllers/
    - /api/src/Models/
    - /api/public/index.php
    - /README_CONVERSION.md
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: contextPrompt,
    config: {
      systemInstruction: "Retorne a conversão em formato JSON estrito. Garanta que o campo 'generatedFiles' contenha o código fonte completo dos novos arquivos PHP e o Manual.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          phpArchitectureDescription: { type: Type.STRING },
          generatedFiles: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                path: { type: Type.STRING, description: "Caminho do arquivo (ex: api/src/Controllers/UserController.php)" },
                content: { type: Type.STRING, description: "Código fonte completo do arquivo" }
              },
              required: ["path", "content"]
            }
          },
          setupGuide: { type: Type.STRING, description: "Passo a passo para rodar o projeto" }
        },
        required: ["summary", "generatedFiles", "setupGuide", "phpArchitectureDescription"]
      }
    }
  });

  const text = response.text || "{}";
  return JSON.parse(text);
};
