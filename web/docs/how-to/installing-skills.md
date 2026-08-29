---
sidebar_position: 9
---

# Installing Skills from the Library

_Browse the Treq skill registry, verify the download, and choose where each skill lives._

Open **Settings** and select the **Skills** tab. Treq loads the public catalog from [treq.dev/skills](https://treq.dev/skills). Search by name or description.

## Install a skill

Each catalog row has two install actions:

- **Install for application** writes the skill into your Treq application data directory. Every repository on this machine can use it.
- **Install for repository** writes the skill under `.treq/skills/` in the current repository. Only that repository uses it.

Treq downloads every file in the skill folder and computes a SHA-256 checksum of the file paths and contents. When the catalog includes a checksum, Treq refuses the install if the hashes differ.

Proprietary catalog entries stay listed. You cannot install them from Treq. Open the source link instead.

## Change install level

After a skill is installed, **Install level** switches it between application and repository. Treq moves the stored files and keeps the recorded checksum.

**Uninstall** removes the stored pack from that level.

## New workspaces

Creating a workspace copies every installed library skill into:

- `.agents/skills/<skill-name>/` (Codex and Cursor Agent)
- `.claude/skills/<skill-name>/` (Claude Code)

Treq marks those copies with `.treq-generated`. It does not overwrite a folder that already exists without that marker. `.gitignore` includes `.agents/skills/` and `.claude/skills/`, so generated copies stay out of commits.

Application-level skills copy into workspaces for every repository. Repository-level skills copy only for that repository.
