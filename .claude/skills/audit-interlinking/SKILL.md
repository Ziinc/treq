---
name: audit-interlinking
description: >-
  Audit and fix internal interlinking across the treq content site (web/learn
  and web/docs) for SEO and navigation. Checks existing links for relevance
  and broken targets, finds articles that are under-linked or orphaned, and
  adds links from an article's key terms to other relevant existing articles.
  Use when asked to audit, improve, or fix interlinking, internal links, or
  SEO link structure across the docs, or when asked to link a set of articles
  together.
---

# Auditing interlinking across the content site

## When to use

- "Audit the interlinking on the site" / "check our internal links for SEO".
- "Add links between these articles" for a specific set of docs.
- Before or after a content push, to catch broken links and orphaned pages.

This skill is the fix-it counterpart to the `writing` skill's interlinking
section. Read that section first for link syntax, placement, and anchor-text
rules. This skill is about finding what to fix.

## The tool only finds candidates

`scripts/link_audit.py` is a dependency-free static scan. It knows the link
graph and corpus term statistics, not the content. It reports three kinds of
*mechanical* fact:

1. A link target does not resolve to a real doc (broken).
2. A doc has zero inbound links from other docs, or fewer than N in-body
   links to other docs (orphan / thin).
3. A doc's own most important keywords, ranked by TF-IDF across the corpus,
   are not covered by an in-body link to whichever other doc actually owns
   that term (keyword coverage gap).

TF-IDF (term frequency times inverse document frequency) is what makes item 3
"important keywords" rather than just any word: it ranks a term high for a
doc when that doc uses it often and the rest of the corpus barely does. That
screens out words common to every article in this domain (agent, review, git)
in favor of terms that are actually distinctive to the one doc, which is a
reasonable proxy for the on-page keywords SEO interlinking cares about.

None of this is a verdict. A high TF-IDF score is not proof the suggested
target is the right link, and an existing link is not proof it still belongs.
Every finding gets read and judged before you touch a file. Treat the report
as a worklist, not a diff.

## Step 1: run the audit

```bash
python3 .claude/skills/audit-interlinking/scripts/link_audit.py
```

Useful flags:

- `--root learn=web/learn --root docs=web/docs --root blog=web/blog` to widen
  or narrow the scan. Repeatable, defaults to `web/learn` and `web/docs`.
- `--min-body-links N` to change the thin-doc threshold (default 2, counted
  before any `## Next Steps` / `## Related` heading).
- `--top-keywords N` to change how many of a doc's top TF-IDF terms get
  checked for link coverage (default 8).
- `--json` for a machine-readable version of the same report.

## Step 2: fix broken links first

These are unambiguous. For each one:

1. Read the sentence around the link to find what article it was meant to
   point to.
2. Search the corpus for the real doc (`Glob`/`Grep` on the slug, or open
   `web/sidebarsLearn.ts` / `web/sidebars.ts` to see the real route).
3. Fix the path. Use the same relative-vs-absolute convention already in that
   file (see the writing skill's interlinking section).
4. If no matching doc exists anymore, remove the link and its surrounding
   markup rather than leaving a broken href.

## Step 3: check existing links for relevance

Broken-link detection only tells you a link resolves. It says nothing about
whether it should still be there. For each doc you touch (and periodically
for the corpus as a whole), open every existing internal link and its
surrounding sentence, then open the target doc's title and opening paragraph.
Ask:

- Does the anchor text describe what the target doc is actually about?
- Would a reader who clicks this link find what the sentence implied they
  would find?
- Is this link doing the same job as another link three lines away (adding
  no new navigation value), or was it a plausible-sounding link that never
  fit?

Remove or repoint any link that fails these checks. A stale or tenuous
internal link hurts SEO relevance signal more than having no link at all, so
do not leave one in "just in case."

## Step 4: fix orphans

A doc with zero inbound links is invisible to internal PageRank flow and hard
for readers to discover outside the sidebar. For each orphan:

1. Read the doc to know its actual subject and the key terms it owns (title,
   defined terms).
2. Search sibling and related docs (same category first, then adjacent
   categories) for a sentence that already discusses that subject without
   linking to it.
3. Add one contextual link there, in prose, following the writing skill's
   placement rules. Do not just add it to some other doc's "Next Steps" list
   as a bare afterthought unless no in-body placement makes sense.

## Step 5: fix thin docs

A doc with fewer than the threshold of in-body links is under-linked outward,
which is the other half of the SEO problem: it never passes link equity to
related articles and gives readers no path onward mid-read. For each one:

1. Read the doc and check its TF-IDF keyword coverage line in the report
   (`N/M important keywords interlinked`).
2. For each listed gap, that keyword is already the signal: the script found
   it is one of this doc's most distinctive terms relative to the corpus.
3. For each real match, add an in-body link at the point that term is first
   used, per the writing skill's rules. Do not force a link if the only
   candidate is a weak or tangential match. A doc with 1 genuinely relevant
   link beats a doc with 3 padded ones.

## Step 6: work the TF-IDF keyword coverage gaps

This is the direct SEO lever: an article's important keywords should link to
the other articles that are actually about them. For each gap:

1. Open the source doc at the sentence(s) containing the keyword.
2. Open the suggested target doc's title, description, and opening
   paragraph.
3. Confirm the target is genuinely what that keyword means in this context.
   Common false positives: a single generic word that survived the corpus
   filter anyway (a word used in a different sense than the target doc's
   subject), a generic index page, or a target that is tangential rather than
   the definitive article on that term. A high tfidf score means the term is
   distinctive for the source doc, not that the suggested owner is correct:
   the owner is picked by which other doc scores highest for that same term,
   which is sometimes a doc that only mentions it in passing.
4. If it holds up, add the link at that mention, not at every occurrence of
   the keyword in the doc. Once per doc per target is enough.
5. If it does not hold up, skip it. Do not lower your bar to clear more items
   off the list.

Multi-word phrases ("git worktree", "human-in-the-loop development") are
better link candidates than single common words ("agent", "review") even
when both surface as gaps: prefer the phrase as anchor text when both point
to the same target. Ignore gaps pointing at bare category index pages unless
the source doc genuinely has nowhere more specific to point.

## Step 7: re-run and report

Re-run the script. Confirm broken links are gone and the orphan/thin counts
you targeted have dropped. Summarize what changed: links fixed, links
removed, links added, and any suggestions you deliberately skipped and why.
Do not claim an article is "fully interlinked": report the concrete before
and after counts instead.

## Scope discipline

Don't turn an interlinking pass into a content rewrite. Add or fix links
without restructuring prose, and don't touch unrelated sections of a file you
opened only to add a link. If a doc's content is wrong or out of date, note
it and move on. That is a separate task from interlinking.
