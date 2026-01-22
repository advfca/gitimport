
import { GithubRepo, GithubFile } from '../types';

/**
 * Extrai o proprietário e o nome do repositório de vários formatos de URL do GitHub.
 * Suporta:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo/tree/main/src
 * - github.com/owner/repo
 * - owner/repo
 * - Links com extensões .git
 */
const parseGithubUrl = (url: string): { owner: string; repo: string } | null => {
  const input = url.trim();
  if (!input) return null;

  // Tenta tratar como URL completa primeiro
  try {
    const urlWithProtocol = input.includes('://') ? input : `https://${input.replace(/^www\./, '')}`;
    const urlObj = new URL(urlWithProtocol);
    
    if (urlObj.hostname.includes('github.com')) {
      const segments = urlObj.pathname.split('/').filter(Boolean);
      if (segments.length >= 2) {
        // Remove .git do final do nome do repo, se houver
        const repoName = segments[1].replace(/\.git$/, '');
        return { owner: segments[0], repo: repoName };
      }
    }
  } catch (e) {
    // Se falhar, tenta regex para o formato "owner/repo"
  }

  // Regex de fallback para formatos simplificados
  const simpleMatch = input.match(/^([a-zA-Z0-9-._]+)\/([a-zA-Z0-9-._]+)$/);
  if (simpleMatch) {
    return { owner: simpleMatch[1], repo: simpleMatch[2].replace(/\.git$/, '') };
  }

  return null;
};

export const fetchRepoInfo = async (repoUrl: string): Promise<GithubRepo> => {
  const parsed = parseGithubUrl(repoUrl);
  
  if (!parsed) {
    throw new Error('Não conseguimos entender este link. Use o formato: github.com/usuario/repositorio');
  }
  
  const { owner, repo } = parsed;
  
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
    
    if (response.status === 404) {
      throw new Error(`Repositório "${owner}/${repo}" não encontrado. Verifique se o nome está correto e se o projeto é PÚBLICO.`);
    }
    
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      if (rateLimitRemaining === '0') {
        throw new Error('Limite de uso da API do GitHub atingido (60 req/hora). Tente novamente em alguns minutos.');
      }
      throw new Error('Acesso negado pelo GitHub. Este repositório pode ser privado.');
    }
    
    if (!response.ok) {
      throw new Error(`Erro do GitHub (Status ${response.status}). Tente novamente.`);
    }
    
    return await response.json();
  } catch (error: any) {
    if (error.message.includes('Failed to fetch')) {
      throw new Error('Erro de conexão. Verifique sua internet ou se o GitHub está fora do ar.');
    }
    throw error;
  }
};

export const fetchRepoContents = async (owner: string, repo: string, path: string = ''): Promise<GithubFile[]> => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
  
  if (!response.ok) {
    if (response.status === 404) return []; // Retorna lista vazia se o path não existir
    throw new Error('Não foi possível carregar a lista de arquivos.');
  }
  
  return response.json();
};

export const fetchFileRaw = async (downloadUrl: string): Promise<string> => {
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error('Não foi possível baixar o conteúdo deste arquivo.');
  return response.text();
};
