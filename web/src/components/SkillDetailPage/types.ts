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
  description: string;
  source: string;
  category: string | null;
  license: string | null;
  path: string;
  url: string;
  route: string;
  files: SkillFile[];
}
