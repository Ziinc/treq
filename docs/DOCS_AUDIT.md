# Documentation Audit Report

_Audit of the Treq documentation site against the Diataxis framework, with design guidance from Stripe developer docs and Elixir docs._

---

## Executive Summary

The Treq documentation has a solid foundation — concise prose style, good internal linking, and a consistent tone. However, it suffers from **category confusion** (the central failure mode Diataxis warns against), **missing documentation types**, a **flat information hierarchy**, and **homepage/landing page design issues**. This report identifies specific problems and recommends structural changes.

---

## Current Structure Inventory

```
docs/
├── intro.md                          → Welcome / product overview (slug: /)
├── keyboard-shortcuts.md             → Reference table
├── troubleshooting.mdx               → Problem/solution pairs
├── features/
│   ├── worktrees.md                  → Technical overview
│   ├── code-review.md                → Technical overview
│   ├── terminal-sessions.md          → Technical overview
│   └── implementation-plans.md       → Technical overview
└── guides/
    ├── index.md                      → Guide hub page
    ├── getting-started/
    │   ├── installation.md
    │   ├── your-first-worktree.md
    │   └── interface-overview.md
    ├── core-workflows/
    │   ├── using-treq-with-git-repo.md
    │   ├── creating-terminal-sessions.md
    │   ├── executing-implementation-plans.md
    │   ├── staging-and-committing.md
    │   ├── code-review-workflow.md
    │   └── merging-worktrees.md
    ├── common-tasks/
    │   ├── creating-worktrees           ← MISSING FILE (referenced in sidebar)
    │   ├── pushing-to-remote.md
    │   ├── discarding-changes.md
    │   └── moving-files-between-worktrees.md
    └── tips-and-tricks/
        └── customizing-settings.md
```

**Framework**: Docusaurus (classic preset, v4 future flag enabled)
**Two sidebars**: `guidesSidebar` (guides) and `docsSidebar` (features + reference)

---

## Issue 1: Diataxis Category Confusion

### The Problem

Diataxis defines four documentation types along two axes:

|                  | Learning (Study) | Doing (Work)    |
|------------------|-------------------|-----------------|
| **Practical**    | Tutorials          | How-to Guides   |
| **Theoretical**  | Explanation        | Reference       |

The current docs **mix categories within single pages** and **mislabel categories structurally**.

### Specific Violations

**A) "Features" pages are hybrids of Reference and Explanation**

Each features page (`worktrees.md`, `code-review.md`, `terminal-sessions.md`, `implementation-plans.md`) mixes:
- Reference content (architecture, data structures, directory layouts, lifecycle flows)
- Explanation content ("How Git Worktrees Work", design rationale)
- How-to fragments (configuration steps, troubleshooting tips)

Per Diataxis, this is the classic anti-pattern: "Reference material that breaks off to show how to do something, or explanation that digresses into reference, confuse the reader."

**Example** — `features/worktrees.md` contains:
- Line 14-25: Explanation of Git fundamentals (Explanation)
- Line 44-58: Directory layout diagram (Reference)
- Line 62-69: Creation flow steps (How-to)
- Line 89-103: Cache strategy details (Reference)
- Line 118-134: Settings enumeration (Reference)
- Line 148-154: Best practices (Explanation/How-to hybrid)

**B) "Guides" pages are hybrids of Tutorials and How-to Guides**

The "Getting Started" section functions as a tutorial (learning-oriented, sequential), but the pages are written like how-to guides (goal-oriented, assumes context). A tutorial should walk the user through a complete learning experience; the current pages are task instructions with no pedagogical scaffolding.

The "Core Workflows" section mixes how-to guides (good) with conceptual explanation (violates Diataxis). For example, `staging-and-committing.md` explains what Git staging is before showing how to do it — this explanation belongs in a separate Explanation page.

**C) No pure Explanation content exists**

There is no dedicated section answering "why" questions:
- Why use worktrees instead of branches?
- Why does Treq use `.treq/worktrees/` instead of sibling directories?
- How does Treq's review system compare to GitHub PRs?
- What is the mental model for plan-driven development?

These conceptual questions are currently scattered as fragments inside feature pages and guides.

**D) No pure Reference content exists**

There is no structured, lookup-oriented reference for:
- Complete settings/configuration reference (all keys, types, defaults)
- CLI commands reference (if any)
- Keyboard shortcuts as a comprehensive reference (current page is minimal)
- File format specifications (plan markdown format, export JSON schema)
- System requirements and compatibility matrix

### Recommendation

Restructure into four explicit Diataxis sections:

```
docs/
├── tutorials/              ← Learning-oriented (new)
│   ├── getting-started.md  ← Complete walkthrough: install → first worktree → review → merge
│   └── first-code-review.md
├── guides/                 ← How-to (task-oriented, keep existing but purify)
│   ├── creating-worktrees.md
│   ├── reviewing-code.md
│   ├── merging-branches.md
│   ├── using-implementation-plans.md
│   ├── pushing-to-remote.md
│   ├── moving-files.md
│   ├── discarding-changes.md
│   └── customizing-settings.md
├── reference/              ← Information-oriented (new)
│   ├── keyboard-shortcuts.md
│   ├── configuration.md
│   ├── directory-structure.md
│   ├── plan-format.md
│   └── system-requirements.md
└── explanation/            ← Understanding-oriented (new)
    ├── worktree-architecture.md
    ├── terminal-implementation.md
    ├── review-system-design.md
    └── plan-system-design.md
```

---

## Issue 2: Missing "Getting Started" Tutorial

### The Problem

The current "Getting Started" section is three disconnected pages (Installation, Your First Worktree, Interface Overview) that function as how-to guides, not a cohesive tutorial.

Per Diataxis, a tutorial should:
- Take the learner by the hand through a complete experience
- Deliver a sense of accomplishment at the end
- Be reproducible and tested
- Focus on *learning*, not *doing*

### What's Missing

- No continuous narrative connecting install → first worktree → make changes → review → merge
- No expected outcomes ("you should see..." / "the dashboard now shows...")
- No checkpoint moments ("if you see X, you're on track")
- The three pages can be read in isolation but don't build on each other

### Recommendation

Create a single, cohesive "Getting Started" tutorial (or a clearly numbered sequence) that walks a new user through the complete cycle: install Treq, open a repository, create a worktree, make a change, stage and commit, review the diff, and merge back. This replaces the current three disconnected pages. Following Elixir's pattern, the tutorial should be the most prominent entry point in the navigation.

---

## Issue 3: Flat Information Hierarchy (Elixir Docs Pattern)

### The Problem

The Elixir docs use a clear hierarchy: the landing page presents a concise overview with prominent entry points organized by user expertise level. The current Treq docs have a flat structure where all pages feel equally weighted.

### Specific Issues

**A) The docs landing page (`intro.md` at slug `/`) is a marketing page, not a documentation hub**

It describes what Treq is and lists features with "Learn more" links. This is product copy, not documentation navigation. A user who already installed Treq gains nothing from re-reading "What is Treq?" every time they visit the docs.

Compare to Elixir's docs page: it immediately shows categorized entry points (Getting Started, Guides, Reference) with clear labels for what each section contains.

**B) No visual hierarchy between entry-level and advanced content**

All sidebar items appear with equal weight. There's no indication of:
- Recommended reading order
- Difficulty/expertise level
- Which pages are essential vs. supplementary

**C) The guides index page (`guides/index.md`) is good but buried**

This page actually does a reasonable job of categorizing content with "Just Starting Out?", "Learn Core Workflows", and "Quick Task Reference" sections. But it's only accessible via the Guides sidebar — it should be the pattern for the main docs landing page.

**D) No "Cheatsheet" or quick-reference format**

Elixir provides cheatsheets for quick lookup. Treq's keyboard shortcuts page is a start, but there's no equivalent for common Git operations in Treq, worktree lifecycle commands, or review workflow steps.

### Recommendation

- Replace `intro.md` with a proper documentation hub page (following Elixir's pattern): categorized links to Tutorials, Guides, Reference, and Explanation, with brief descriptions of what each section contains and who it's for.
- Add visual hierarchy to the sidebar (Docusaurus supports badges, descriptions, and custom sidebar items).
- Create a "Cheatsheet" reference page for common operations.

---

## Issue 4: Homepage vs. Docs Landing Page Confusion

### The Problem

The site has two "entry points" that serve overlapping purposes:
1. `src/pages/index.tsx` — Marketing homepage (hero, features grid, CTA)
2. `docs/intro.md` (slug: `/`) — Docs landing with product description

Both explain what Treq is. Neither serves as an effective documentation entry point.

### Stripe Docs Pattern

Stripe's docs homepage immediately presents:
- A clear "Get started" path (prominent, single CTA)
- Categorized entry points for different user goals
- Quick access to popular topics
- Search prominently placed
- No marketing copy — users are already "sold" if they're in the docs

### Recommendation

- The marketing homepage (`index.tsx`) should link to docs, not replicate docs content
- The docs landing page should be a pure navigation/orientation page:
  - "New to Treq? Start with the tutorial" (prominent)
  - "Looking for how-to guides?" (categorized grid of common tasks)
  - "Need reference?" (links to settings, shortcuts, formats)
  - "Want to understand the architecture?" (explanation links)

---

## Issue 5: Navbar and Sidebar Structure

### The Problem

The navbar has two doc links: "Guides" and "Docs". This labeling is confusing:
- "Docs" is too generic — it could mean anything
- "Guides" vs "Docs" doesn't communicate what's different about each section
- Users can't tell where to go for their specific need

### Current Sidebar Split

- **Guides sidebar**: Getting Started → Core Workflows → Common Tasks → Tips & Tricks
- **Docs sidebar**: Intro → Features → Keyboard Shortcuts → Troubleshooting

This split doesn't align with Diataxis categories and creates an artificial boundary.

### Recommendation

If maintaining two sidebars, rename to match Diataxis:
- "Learn" (Tutorials + Explanation)
- "Use" (How-to Guides + Reference)

Or use a single sidebar with clearly labeled sections (Docusaurus category descriptions):
- Tutorials
- How-to Guides
- Reference
- Explanation

Following Stripe's pattern, the navbar should expose top-level categories directly: "Get Started", "Guides", "API Reference" (or in Treq's case "Reference"), "Learn More".

---

## Issue 6: Broken References and Placeholder Content

### Specific Issues

1. **Missing file**: `guides/common-tasks/creating-worktrees` is referenced in `sidebars.ts` (line 49) but the file does not exist at `docs/docs/guides/common-tasks/creating-worktrees.md`. The content at `guides/getting-started/your-first-worktree.md` covers similar ground but is a different page.

2. **Placeholder URLs**: Multiple files reference `https://github.com/yourusername/treq` (a template placeholder). These appear in:
   - `docusaurus.config.ts` lines 25, 83
   - `docs/guides/index.md` line 67
   - `src/pages/index.tsx` line 35
   - Footer links

3. **Stale template content**: The `blog/` directory contains Docusaurus template blog posts (2019-05-28, 2019-05-29, 2021-08-01, 2021-08-26) that are unrelated to Treq. Blog is disabled in config (`blog: false`) but the files remain.

4. **Template images**: `static/img/` contains default Docusaurus images (`undraw_docusaurus_tree.svg`, `undraw_docusaurus_react.svg`, etc.) that are unused.

5. **Stale "edit this page" link**: `docusaurus.config.ts` line 47 points to `https://github.com/facebook/docusaurus/tree/main/...` — a Docusaurus template URL, not Treq's repository.

6. **Inconsistent product description**: `intro.md` calls Treq "your AI Code Review Manager" while the homepage calls it "Local AI Coding Agent Orchestration". The tagline in config is "A modern Git worktree manager". These are three different positioning statements.

---

## Issue 7: Content Gaps

### Missing Documentation

Measured against what the current docs reference but don't fully cover:

| Topic | Current State | What's Needed |
|-------|--------------|---------------|
| Stacked worktrees | Mentioned in `intro.md` as a key feature | No guide or reference page exists |
| AI agent integration | Homepage prominently features Claude Code | No docs on how to actually use AI agents with Treq |
| Export/import settings | Mentioned in `customizing-settings.md` | No step-by-step guide |
| Plan format specification | Briefly described in `implementation-plans.md` | No formal reference for the markdown format |
| System requirements | Not documented anywhere | Needed: OS versions, Git version, disk space |
| Changelog / release notes | No page exists | Standard for desktop apps |

### Stacked Worktrees Gap

This is particularly notable. `intro.md` lists "Stacked Workspaces" as one of three key features and compares it to Graphite's stacking workflow. But there is:
- No guide on how to create or manage stacked worktrees
- No explanation of the stacking model
- No reference for the rebase behavior

---

## Issue 8: Style Guide vs. Actual Content Tension

### The Problem

`DOCUMENTATION_STYLE_GUIDE.md` establishes rules like "One H1, few H2s, avoid H3/H4" and "No step-by-step numbered lists." Several pages violate these:

- `features/worktrees.md` uses H3 headers extensively (lines 14, 29, 44, 62, 89, 105)
- `features/worktrees.md` uses numbered lists for lifecycle flows (lines 64-69, 73-75, 80-86)
- `features/worktrees.md` has bullet lists longer than 3 items (lines 93-98, 100-103)
- Multiple pages have >80 lines (the style guide targets 40-80)

The style guide is also internally conflicted — it says "target 40-80 lines" but some topics genuinely need more coverage. The constraint is artificial and leads to either inadequate documentation or ignored guidelines.

### Recommendation

Revise the style guide to align with Diataxis principles rather than arbitrary line counts. Different documentation types have different length expectations:
- Tutorials: as long as needed to complete the learning experience
- How-to guides: concise, but complete
- Reference: exhaustive by nature
- Explanation: as long as needed for understanding

---

## Issue 9: Design and Presentation (Stripe-Inspired)

### What Stripe Does Well That Treq Lacks

**A) Progressive disclosure**: Stripe reveals complexity gradually. Top-level pages are scannable overviews; detail is one click deeper. Treq's pages dump all information at one level.

**B) Prominent code examples**: Stripe makes runnable code the centerpiece. Treq's how-to guides describe UI actions in prose but rarely show the equivalent terminal commands alongside.

**C) Card-based navigation**: Stripe uses cards with icons and descriptions to help users self-select their path. Treq's sidebar is a plain text list.

**D) Visual indicators of page type**: Stripe clearly labels whether content is a quickstart, guide, or reference. Treq's pages all look identical regardless of type.

**E) "Was this page helpful?" feedback**: Stripe collects page-level feedback. Treq has no feedback mechanism in the docs.

### Recommendation

- Add Docusaurus admonitions/callouts to distinguish tips, warnings, and important notes
- Add card-based navigation to landing pages and section indexes
- Show terminal commands alongside UI instructions (dual-path guidance)
- Consider Docusaurus badges or tags to label page types (Tutorial, Guide, Reference)

---

## Summary of Recommendations (Priority Order)

1. **Restructure around Diataxis categories** — This is the highest-impact change. Create explicit Tutorials, How-to Guides, Reference, and Explanation sections.

2. **Fix broken references** — The missing `creating-worktrees` file and placeholder URLs are immediate bugs.

3. **Create a proper docs landing page** — Replace the product-description intro with a navigation hub following Elixir's docs.html pattern.

4. **Write the missing tutorial** — A cohesive getting-started experience is the single most impactful content addition.

5. **Extract pure reference content** — Settings reference, keyboard shortcuts expansion, plan format spec, system requirements.

6. **Document stacked worktrees** — A headline feature with zero documentation.

7. **Clean up template artifacts** — Remove placeholder URLs, template blog posts, unused Docusaurus images, and the stale edit link.

8. **Rename navbar categories** — "Guides" and "Docs" → labels that communicate purpose (e.g., "Get Started", "Guides", "Reference").

9. **Revise the style guide** — Align with Diataxis type-specific expectations rather than one-size-fits-all line count rules.

10. **Add Stripe-inspired design elements** — Cards, progressive disclosure, page type labels, and feedback mechanisms.

---

## References

- [Diataxis Framework](https://diataxis.fr/) — The systematic documentation framework
- [Diataxis Quickstart](https://diataxis.fr/start-here/) — The 2x2 matrix and category definitions
- [Stripe Developer Docs](https://docs.stripe.com/) — Design inspiration for navigation, layout, and information architecture
- [Stripe DX Teardown (Moesif)](https://www.moesif.com/blog/best-practices/api-product-management/the-stripe-developer-experience-and-docs-teardown/) — Analysis of Stripe's documentation patterns
- [Elixir Documentation](https://elixir-lang.org/docs.html) — Pattern for information hierarchy and landing page structure
- [Elixir Writing Documentation Guide](https://hexdocs.pm/elixir/writing-documentation.html) — Documentation-as-first-class-citizen principles
