
export interface GithubRepo {
  name: string;
  full_name: string;
  description: string;
  stargazers_count: number;
  language: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  html_url: string;
  default_branch: string;
}

export interface GithubFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  content?: string;
  sha?: string;
  download_url?: string;
  localFile?: File; 
}

export interface GithubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface AnalysisResult {
  summary: string;
  technologies: string[];
  architecture: string;
  suggestions: string[];
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface ConversionResult {
  summary: string;
  generatedFiles: GeneratedFile[];
  setupGuide: string;
  phpArchitectureDescription: string;
}

export interface ProjectLog {
  id: string;
  name: string;
  owner: string;
  category: string;
  timestamp: number;
  avatar: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING_REPO = 'LOADING_REPO',
  ANALYZING = 'ANALYZING',
  CONVERTING = 'CONVERTING',
  UPLOADING = 'UPLOADING',
  READY = 'READY',
  ERROR = 'ERROR',
  CLONING = 'CLONING',
  COMMITTING = 'COMMITTING'
}

export interface ExampleRepo {
  title: string;
  description: string;
  url: string;
  category: string;
  icon: string;
}

export interface GoogleUser {
  access_token: string;
  expires_in: number;
}
