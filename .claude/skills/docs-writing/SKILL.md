---
name: docs-writing
description: >-
  Write or revise Treq technical documentation under web/docs/, plus product
  pages that document shipped app behavior (roadmap, security, settings copy).
  Activate whenever an agent drafts, updates, or reviews technical docs for
  Treq: concept pages, how-tos, tutorials, reference, security, roadmap
  feature status, or related sidebar/index links. Owns accuracy against the
  current code and product state (shipped vs WIP), prerequisite honesty,
  cross-page consistency, and the doc revision checklist. Voice and banlists
  live in explain-to-me; Learn-site article structure and interlinking live in
  writing. Use this skill first for web/docs/** work.
---

# docs-writing (technical docs for Treq)

## When to use

Use this skill every time you write or revise **technical product documentation** for Treq:

- Anything under `web/docs/**` (concepts, how-tos, tutorials, reference, security)
- Product status pages that claim what ships today (`web/src/pages/roadmap.mdx`, changelog feature framing when it asserts availability)
- Sidebar / index / guides copy that points readers at those features

Do **not** treat changelog PR titles alone as proof a feature is user-ready.

For Learn articles (`web/learn/**`), READMEs that are not product how-tos, and voice-only edits, prefer the `writing` and `explain-to-me` skills. When a Learn article documents a concrete Treq UI behavior, still apply the accuracy rules below.

## Skill stack

| Concern | Skill |
|---|---|
| Product-doc accuracy, shipped vs WIP, prerequisites | **This skill (`docs-writing`)** |
| Voice, Orwell, ASD-STE100, banlists, readability script | `explain-to-me` |
| Learn-site skeleton, DefinitionCards, interlinking audit | `writing` |
| Formatting baseline | `web/STYLE_GUIDE.md` |

Read `explain-to-me` before drafting prose. Run its readability checker before you call the doc done.

## Mandatory research before drafting

Never draft from memory or from a changelog bullet alone.

1. **Find the code path.** Locate the UI entry points and backend handlers (components, hooks, Tauri commands, native Node addon surface). Prefer reading those files over summarizing commit messages.
2. **Separate shipped from WIP.** Code in tree is not the same as a finished product. Feature flags, Pro gates, incomplete workers, and explicit maintainer notes count. If a human says a feature is WIP, treat that as authoritative over changelog wording.
3. **Map auth and prerequisites.** Document what the user must install or sign into before the UI works. Silent failures (missing `gh`, non-GitHub remotes) belong in the docs.
4. **Diff UI surfaces.** The same verb in two places can mean different implementations (example: header **Create PR** vs Review-tab **Commit and create PR** title derivation). Document each path accurately.
5. **Read sibling docs.** Update pages that would contradict the new text (security, settings, guides, tutorials, roadmap, indexes, sidebars).

## Shipped vs WIP rules

| State | How to write |
|---|---|
| Shipped | Present tense. Name exact UI labels. Link how-tos. |
| WIP / preview | `:::note[Work in progress]` near the top of that section or page. Future tense or "planned / intended" wording. Say what exists in the app today (UI shell, toggle, backend foundations) without promising end-to-end behavior. |
| Roadmap | Do not mark a milestone shipped unless the product owner or release docs treat it as available. Partial ship: tip the shipped slice, note the WIP slice. |

Admonition title form matches the site: `:::tip[Shipped in v0.2.0]` and `:::note[Work in progress]`, then a blank line, then body, then `:::`.

## Accuracy checklist (must pass)

Before finishing any technical doc change, verify each claim:

- [ ] **UI labels** match the app string exactly (`Create PR`, `View PR`, `Manage GitHub`, …).
- [ ] **Prerequisites** are complete and not overstated (do not require a Treq App install for flows that only need `gh` + a GitHub remote).
- [ ] **Plan gates** apply only to the surfaces that are actually gated (example: connected-repo listing / merge queue vs local `gh` PR actions).
- [ ] **No silent over-promise**: green Merge button is not auto-merge. Quoting a GitHub thread does not post to GitHub. Local review comments stay local.
- [ ] **Auth paths** stay distinct when the product has more than one (local CLI vs cloud App vs account sign-in).
- [ ] **Related pages** no longer contradict the new page (security, settings, guides, tutorials, roadmap, concept/how-to indexes, `web/sidebars.ts`).
- [ ] **WIP features** use WIP notes and do not appear as fully shipped on the roadmap.
- [ ] **Readability**: `python3 .claude/skills/explain-to-me/scripts/readability.py --strict path/to/doc.mdx` is clean of hard fails and Tier 1 words.

## Page types under `web/docs`

Match existing `web/docs` pages. Do not invent a new skeleton.

| Type | Lives in | Job |
|---|---|---|
| Concept | `web/docs/concepts/` | What the system is, boundaries, tables of behavior |
| How-to | `web/docs/how-to/` | Task steps a reader can execute |
| Tutorial | `web/docs/tutorials/` | Longer walkthrough of a workflow |
| Reference | `web/docs/reference/` | Commands, shortcuts, exhaustive lists |
| Security / overview | `web/docs/security-and-privacy.md`, `web/docs/intro.md` | Cross-cutting claims that other pages must not contradict |

Register new pages in `web/sidebars.ts` and the relevant `index.md` DocCardList or concept list.

Frontmatter pattern:

```markdown
---
sidebar_position: N
---

# Title

_One-line italicized description._

Opening paragraph, 2 to 3 sentences. No lists here.
```

Use H2 only. Prefer tables for comparisons. Bold UI labels on first meaningful use in a section. Interlink sibling docs in prose at first mention and finish with a short `## Next Steps` list.

## Cross-page consistency patterns

These failure modes showed up in GitHub-integration docs review. Apply them generally:

1. **Analogy vs product.** Do not leave docs that only say "like a GitHub PR" once a real integration exists. Point to the concept/how-to pages.
2. **Local vs remote review data.** If the product both keeps local comments and reads remote threads, say both. Do not let an older "never publishes" note imply remote threads are absent.
3. **Security follows features.** Optional cloud or CLI integrations must appear on Security and Privacy when they change where traffic goes.
4. **Settings follow features.** New toggles and Integrations surfaces need a Settings how-to mention.
5. **CLI follows features.** If `treq st` (or similar) prints new fields, update the CLI reference.
6. **Roadmap follows releases.** When a slice ships, update roadmap tense for that slice only.

## Revision pass

1. Apply the accuracy checklist above against the code, not against the draft.
2. Run `explain-to-me` readability with `--strict` on every touched prose file.
3. Click every new in-body and Next Steps link target (or confirm the file exists under `web/`).
4. Skim the Docusaurus preview or built page for raw admonition syntax (`:::note` leaking as text means the title form is wrong).
5. If a human or review bot corrected shipped vs WIP status, propagate that correction to every page that repeated the claim.

## Relationship to `/writing`

`writing` still owns Learn-site article shape, DefinitionCards, and bulk interlinking audits. For `web/docs/**` and product-status pages, **start here**. Pull voice rules from `explain-to-me`. Use `writing` when you need the Learn skeleton or the interlinking audit skill.

## Anti-patterns

- Claiming a feature shipped because it appears in changelog feat bullets or has UI chrome
- Documenting one Create/View path and implying all entry points behave identically
- Gating free-tier day-to-day `gh` flows behind Pro in prose
- Leaving roadmap, security, or guides on the old story after a concept page changes
- Skipping the readability script because "it's only docs"
