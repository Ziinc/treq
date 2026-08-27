export interface SshHost {
  alias: string;
}

export interface RemoteReadinessCheck {
  name: string;
  available: boolean;
  detail: string;
}

export interface RemoteReadiness {
  host: string;
  connected: boolean;
  checks: RemoteReadinessCheck[];
}

export interface RemoteRepoProbe {
  host: string;
  path: string;
  exists: boolean;
  is_repo: boolean;
  needs_clone: boolean;
}

export type RepositoryLocation =
  | { type: "local"; path: string }
  | { type: "ssh"; host: string; path: string };

export interface RepositoryDescriptor {
  id: string;
  location: RepositoryLocation;
  display_name: string;
}

export interface RepositoryInspection {
  root: string;
  repository_type: string;
  current_branch: string | null;
  default_branch: string;
  current_change_id: string;
  current_commit_id: string;
  descriptor: RepositoryDescriptor;
}

export interface RemoteRepository {
  host: string;
  path: string;
  display_name: string;
  repo_uri: string;
  inspection: RepositoryInspection;
}
