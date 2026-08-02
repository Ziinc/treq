export interface SkillFile {
  path: string;
  size: number;
  binary: boolean;
  githubUrl: string;
  rawUrl: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  source: string;
  category: string | null;
  license: string | null;
  proprietary?: boolean;
  path: string;
  url: string;
  route: string;
  files: SkillFile[];
}
