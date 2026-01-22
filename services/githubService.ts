
import { GithubRepo, GithubFile } from '../types';

export const fetchRepoInfo = async (repoUrl: string): Promise<GithubRepo> => {
  // Extract owner and repo from URL: https://github.com/owner/repo
  const parts = repoUrl.replace('https://github.com/', '').split('/');
  if (parts.length < 2) throw new Error('URL do GitHub inválida');
  
  const [owner, repo] = parts;
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!response.ok) throw new Error('Repositório não encontrado ou privado');
  
  return response.json();
};

export const fetchRepoContents = async (owner: string, repo: string, path: string = ''): Promise<GithubFile[]> => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
  if (!response.ok) throw new Error('Falha ao buscar conteúdo do repositório');
  
  return response.json();
};

export const fetchFileRaw = async (downloadUrl: string): Promise<string> => {
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error('Falha ao ler arquivo');
  return response.text();
};
