import { BookOpen, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  installSkill,
  listSkillCatalog,
  setSkillInstallScope,
  uninstallSkill,
  type SkillCatalogSkill,
  type SkillInstallScope,
} from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "./ui/toast";

interface SkillLibrarySettingsProps {
  repoPath: string;
  catalogUrl?: string | null;
}

function skillMatches(skill: SkillCatalogSkill, query: string): boolean {
  if (!query.trim()) return true;
  const haystack =
    `${skill.name} ${skill.description ?? ""} ${skill.source} ${skill.category ?? ""}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

export function SkillLibrarySettings({
  repoPath,
  catalogUrl,
}: SkillLibrarySettingsProps) {
  const { addToast } = useToast();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { data, error, isLoading, mutate } = useSWR(
    ["skill-catalog", repoPath, catalogUrl ?? ""],
    () => listSkillCatalog(repoPath, catalogUrl),
  );

  const skills = useMemo(() => {
    const list = data?.skills ?? [];
    return list.filter((skill) => skillMatches(skill, query));
  }, [data?.skills, query]);

  async function runAction(skillId: string, action: () => Promise<unknown>) {
    setPendingId(skillId);
    try {
      await action();
      await mutate();
    } catch (err) {
      addToast({
        title: "Skill library",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="skill-library-settings">
      <div>
        <h2 className="text-base font-semibold">Skill library</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Browse the Treq skill registry and install skills into this
          application or the current repository. Installed skills are copied
          into new workspaces after checksum verification.
        </p>
      </div>

      <div>
        <Label htmlFor="skill-library-search">Search skills</Label>
        <Input
          id="skill-library-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or description"
          className="mt-2"
        />
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading skill registry…
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}
      {!isLoading && !error && skills.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No skills match this search.
        </p>
      )}

      <ul className="space-y-3">
        {skills.map((skill) => (
          <SkillRow
            key={skill.id}
            skill={skill}
            busy={pendingId === skill.id}
            onInstall={(scope) =>
              runAction(skill.id, () =>
                installSkill(skill.id, scope, repoPath, catalogUrl),
              )
            }
            onUninstall={() =>
              runAction(skill.id, () => uninstallSkill(skill.id, repoPath))
            }
            onScope={(scope) =>
              runAction(skill.id, () =>
                setSkillInstallScope(skill.id, scope, repoPath),
              )
            }
          />
        ))}
      </ul>
    </div>
  );
}

function SkillRow({
  skill,
  busy,
  onInstall,
  onUninstall,
  onScope,
}: {
  skill: SkillCatalogSkill;
  busy: boolean;
  onInstall: (scope: SkillInstallScope) => void;
  onUninstall: () => void;
  onScope: (scope: SkillInstallScope) => void;
}) {
  const { installed } = skill;
  return (
    <li className="border rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{skill.name}</p>
            <span className="text-xs text-muted-foreground">
              {skill.source}
            </span>
          </div>
          {skill.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {skill.description}
            </p>
          )}
        </div>
        {skill.url && (
          <a
            href={skill.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Open ${skill.name} source`}
          >
            <BookOpen className="h-4 w-4" />
          </a>
        )}
      </div>
      {skill.proprietary ? (
        <p className="text-sm text-muted-foreground">
          Proprietary skills cannot be installed from the registry.
        </p>
      ) : installed ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`scope-${skill.id}`} className="text-sm">
            Install level
          </Label>
          <select
            id={`scope-${skill.id}`}
            aria-label={`Install level for ${skill.name}`}
            className="px-2 py-1 border rounded-md bg-background text-sm"
            value={installed.scope}
            disabled={busy}
            onChange={(event) =>
              onScope(event.target.value as SkillInstallScope)
            }
          >
            <option value="application">Application</option>
            <option value="repository">Repository</option>
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onUninstall}
          >
            Uninstall
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => onInstall("application")}
          >
            Install for application
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onInstall("repository")}
          >
            Install for repository
          </Button>
        </div>
      )}
    </li>
  );
}
