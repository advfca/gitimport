
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
}

export interface GithubFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  content?: string;
  download_url?: string;
}

export interface AnalysisResult {
  summary: string;
  technologies: string[];
  architecture: string;
  suggestions: string[];
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING_REPO = 'LOADING_REPO',
  ANALYZING = 'ANALYZING',
  READY = 'READY',
  ERROR = 'ERROR'
}

export interface ExampleRepo {
  title: string;
  description: string;
  url: string;
  category: string;
  icon: string;
}
