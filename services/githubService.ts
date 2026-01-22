
import { GithubRepo, GithubFile, GithubTreeItem } from '../types';

const parseGithubUrl = (url: string): { owner: string; repo: string } | null => {
  const input = url.trim();
  if (!input) return null;

  try {
    const urlWithProtocol = input.includes('://') ? input : `https://${input.replace(/^www\./, '')}`;
    const urlObj = new URL(urlWithProtocol);
    
    if (urlObj.hostname.includes('github.com')) {
      const segments = urlObj.pathname.split('/').filter(Boolean);
      if (segments.length >= 2) {
        const repoName = segments[1].replace(/\.git$/, '');
        return { owner: segments[0], repo: repoName };
      }
    }
  } catch (e) {}

  const simpleMatch = input.match(/^([a-zA-Z0-9-._]+)\/([a-zA-Z0-9-._]+)$/);
  if (simpleMatch) {
    return { owner: simpleMatch[1], repo: simpleMatch[2].replace(/\.git$/, '') };
  }

  return null;
};

export const fetchRepoInfo = async (repoUrl: string): Promise<GithubRepo> => {
  const parsed = parseGithubUrl(repoUrl);
  if (!parsed) throw new Error('Link inválido.');
  const { owner, repo } = parsed;
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
  if (!response.ok) throw new Error('Repositório não encontrado ou privado.');
  return response.json();
};

export const fetchRepoContents = async (owner: string, repo: string, path: string = ''): Promise<GithubFile[]> => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
  if (!response.ok) return [];
  return response.json();
};

export const fetchFullTree = async (owner: string, repo: string, branch: string): Promise<GithubTreeItem[]> => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  if (!response.ok) throw new Error('Falha ao buscar estrutura do repositório.');
  const data = await response.json();
  return data.tree;
};

export const fetchFileRaw = async (downloadUrl: string): Promise<string> => {
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error('Falha ao baixar arquivo.');
  return response.text();
};

export const deleteFile = async (
  token: string,
  owner: string,
  repo: string,
  path: string,
  sha: string,
  message: string
) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      sha
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Erro ao deletar arquivo');
  }
  return response.json();
};

export const updateFileContent = async (
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha: string | undefined,
  message: string
) => {
  const body: any = {
    message,
    content: btoa(unescape(encodeURIComponent(content)))
  };
  if (sha) body.sha = sha;

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Erro ao atualizar arquivo no GitHub');
  }
  return response.json();
};

export const moveOrRenameFile = async (
  token: string,
  owner: string,
  repo: string,
  oldPath: string,
  newPath: string,
  sha: string,
  content: string,
  message: string
) => {
  await updateFileContent(token, owner, repo, newPath, content, undefined, `Move from ${oldPath}: ${message}`);
  await deleteFile(token, owner, repo, oldPath, sha, `Cleanup after move to ${newPath}: ${message}`);
  return true;
};
