
import { GoogleGenAI, Type } from "@google/genai";
import { ConversionResult, GithubFile } from "../types";

export const convertToReactPhp = async (
  repoName: string, 
  files: GithubFile[], 
  analysis: any
): Promise<ConversionResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Pegamos uma amostra dos arquivos mais importantes para dar contexto ao Gemini
  const relevantFiles = files
    .filter(f => f.name.endsWith('.ts') || f.name.endsWith('.tsx') || f.name.endsWith('.json'))
    .slice(0, 8);

  const contextPrompt = `
    Você é um Engenheiro de Software Fullstack Especialista em Migrações de Sistemas.
    OBJETIVO: Converter um projeto front-end React/TS purista em uma aplicação Híbrida "React + PHP Moderno".
    
    PROJETO ORIGINAL: ${repoName}
    ANÁLISE PRÉVIA: ${JSON.stringify(analysis)}
    
    TAREFA:
    1. Projete um back-end PHP 8.3 (utilizando padrões como Controllers, Repositories e PSR-12).
    2. Crie uma estrutura de pastas recomendada onde o React vive no /frontend e o PHP no /api.
    3. Identifique necessidades de Banco de Dados e crie as migrações em PHP.
    4. Gere exemplos de como o React deve chamar esse novo back-end PHP.

    Retorne APENAS um JSON válido.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: contextPrompt,
    config: {
      systemInstruction: "Retorne uma resposta estritamente no formato JSON definido no schema.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          phpStructure: { type: Type.STRING, description: "Explicação da nova estrutura de pastas e arquivos PHP" },
          apiEndpoints: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                method: { type: Type.STRING },
                route: { type: Type.STRING },
                phpController: { type: Type.STRING, description: "Exemplo de código do Controller PHP" }
              },
              required: ["method", "route", "phpController"]
            }
          },
          reactUpdates: { type: Type.STRING, description: "O que mudar no React para integrar com o PHP" },
          setupGuide: { type: Type.STRING, description: "Guia de instalação do ambiente PHP/Composer" }
        },
        required: ["phpStructure", "apiEndpoints", "reactUpdates", "setupGuide"]
      }
    }
  });

  const text = response.text || "{}";
  return JSON.parse(text);
};
