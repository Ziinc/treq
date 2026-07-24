#!/usr/bin/env python3
"""Interlinking auditor for treq content docs.

No third-party dependencies. Walks the content roots (default `web/learn` and
`web/docs`), builds the internal link graph, and reports:

  - broken internal links (target does not resolve to a real doc)
  - orphan docs (no other doc links to them), excluding DocCardList
    category index pages, which are never really orphans
  - thin docs (fewer than --min-body-links contextual links in the body,
    counted separately from a trailing Next Steps / Related list)
  - TF-IDF keyword coverage: each doc's own most distinctive terms, scored
    against the whole corpus, and whether each one is covered by an
    in-body link to whichever other doc actually owns that term

TF-IDF (term frequency times inverse document frequency) ranks a term high
for a doc when it is used often in that doc and rare across the rest of the
corpus. That is a much better proxy for "this doc's important keywords" than
raw word frequency: it screens out words that are simply common across every
article (git, agent, review) in favor of terms that are actually
characteristic of this one doc.

TF-IDF alone still surfaces single words that score well but make useless
anchor text, so generic unigrams are excluded before scoring. Two rules do
it: a curated stoplist of ordinary prose and generic technical vocabulary
(GENERIC_UNIGRAMS), and a corpus frequency ceiling (--generic-df-ratio) that
drops any single word appearing in more than that fraction of docs. The
ceiling is the part that keeps working as the site grows: a word used across
most of the corpus is not distinctive to any one page, whatever its score.
Multi-word phrases are never dropped, since "version control" and "merge
commit" are exactly the anchors you want even though their component words
are generic on their own.

This script finds *candidates*. It has no notion of whether two docs are
actually related, only statistical term overlap. A human (or an agent
following the audit-interlinking skill) still has to read both docs and
decide whether a suggested link belongs, and whether an existing link is
still relevant.

Usage:
    python3 link_audit.py [--root DIR ...] [--min-body-links N] [--top-keywords N]
    python3 link_audit.py [--generic-df-ratio F] [--include-generic-unigrams]
    python3 link_audit.py --json

Exit codes:
    0  ran successfully (findings are informational, not a failure)
    2  usage / path error
"""

import argparse
import json
import math
import os
import re
import sys
from collections import Counter
from pathlib import Path

DOC_SUFFIXES = (".md", ".mdx")

# Generic bolded/defined terms that are too common to be useful link signals.
GENERIC_TERMS = {
    "note", "example", "important", "tip", "warning", "summary", "goal",
    "short answer", "related", "next steps",
}

# Single words that are ordinary prose or generic technical vocabulary. On
# their own these make weak anchor text no matter how distinctive TF-IDF
# thinks they are for one doc: linking the word "review" or "directory"
# tells a reader nothing about where the link goes. They are only excluded
# as standalone unigrams. Multi-word phrases built from them are kept,
# because "version control", "merge commit", and "review checkpoint" are
# exactly the phrases you do want to link.
#
# Deliberately absent: domain operation and object names that name one
# specific thing a doc can own (worktree, clone, rebase, cherry-pick,
# squash, restack, stack, bookmark, jujutsu, colocated, workspace). Those
# stay eligible, and the corpus frequency ceiling below removes them
# automatically if they ever become ubiquitous.
GENERIC_UNIGRAMS = {
    # ordinary prose
    "again", "already", "always", "another", "anything", "around", "because",
    "before", "behind", "better", "between", "beyond", "clear", "common",
    "complete", "current", "different", "directly", "easier", "either",
    "enough", "entire", "every", "existing", "further", "general", "given",
    "hard", "however", "instead", "little", "longer", "making", "means",
    "might", "never", "often", "often", "other", "others", "particular",
    "possible", "rarely", "really", "right", "separate", "several", "similar",
    "simple", "since", "single", "small", "something", "specific", "still",
    "sure", "their", "thing", "things", "through", "together", "toward",
    "under", "unless", "until", "usually", "whether", "while", "within",
    "without", "wrong",
    # generic doc/UI vocabulary
    "advanced", "basic", "button", "click", "clicking", "column", "content",
    "default", "defaults", "detail", "details", "dialog", "guide", "guides",
    "icon", "interface", "item", "items", "label", "level", "levels", "list",
    "lists", "menu", "option", "options", "overview", "page", "pages",
    "panel", "recommended", "reference", "screen", "scroll", "section",
    "sections", "select", "selected", "setting", "settings", "step", "steps",
    "table", "value", "values", "window",
    # generic technical vocabulary
    "agent", "agents", "application", "approval", "automated", "behavior",
    "behaviour", "cache", "change", "changes", "code", "codebase", "command",
    "commands", "config", "configuration", "configure", "context", "control",
    "data", "database", "developer", "developers", "development", "directory",
    "directories", "engineering", "error", "errors", "evidence", "failure",
    "failures", "feature", "features", "file", "files", "folder", "function",
    "functions", "history", "human", "humans", "implementation", "input",
    "inputs", "install", "line", "lines", "local", "memory", "method",
    "methods", "model", "models", "output", "owner", "ownership", "patch",
    "path", "paths", "people", "permission", "permissions", "person",
    "process", "processes", "product", "project", "projects", "prompt",
    "prompts", "queue", "result", "results", "review", "reviewer",
    "reviewers", "reviews", "runtime", "scope", "search", "security",
    "server", "service", "services", "session", "sessions", "software",
    "state", "status", "storage", "structure", "system", "systems", "task",
    "tasks", "team", "teams", "terminal", "test", "tests", "testing", "tool",
    "tools", "user", "users", "version", "work", "working",
    # common verb and adjective forms. These rank well on TF-IDF whenever one
    # doc happens to lean on a word, but no reader clicks "approved" or
    # "missing" expecting to land somewhere specific.
    "across", "adds", "allow", "allows", "applies", "apply", "approved",
    "avoid", "based", "become", "becomes", "begin", "begins", "build",
    "builds", "cannot", "choose", "create", "creates", "decide", "decides",
    "ensure", "expect", "expects", "find", "finds", "follow", "follows",
    "gets", "gives", "handle", "handles", "happens", "helper", "helpers",
    "include", "includes", "keeps", "knows", "leave", "leaves", "limit",
    "limits", "makes", "matter", "matters", "means", "missing", "moves",
    "needs", "produce", "produces", "provide", "provides", "reads", "record",
    "records", "remain", "remains", "require", "requires", "returns", "sends",
    "setup", "share", "shares", "shows", "start", "started", "starts",
    "stays", "stop", "stops", "takes", "treat", "treats", "turns",
    "understand", "uses", "wait", "wants", "watch", "writes", "written",
}

TITLE_STRIP_PREFIXES = re.compile(r"^(what is|what are|how to)\s+", re.I)

# Stopwords for TF-IDF tokenization. A unigram made only of these is dropped;
# a multi-word n-gram is dropped if its first or last word is one of these,
# so phrases like "the git worktree" trim down to "git worktree".
STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "then", "than", "so", "as",
    "of", "in", "on", "at", "by", "for", "to", "from", "with", "without",
    "into", "onto", "over", "under", "about", "against", "between", "through",
    "during", "before", "after", "above", "below", "up", "down", "out", "off",
    "again", "further", "once", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "having", "do", "does", "did", "doing",
    "will", "would", "should", "could", "can", "may", "might", "must",
    "this", "that", "these", "those", "it", "its", "it's", "you", "your",
    "yours", "they", "their", "them", "he", "she", "his", "her", "we", "our",
    "i", "not", "no", "nor", "only", "own", "same", "such", "too", "very",
    "just", "also", "here", "there", "when", "where", "why", "how", "what",
    "which", "who", "whom", "all", "any", "both", "each", "few", "more",
    "most", "other", "some", "each", "one", "two", "first", "second",
}

TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9'-]*")


class Doc:
    def __init__(self, path: Path, root_label: str, root_dir: Path):
        self.path = path
        self.root_label = root_label
        self.root_dir = root_dir
        self.raw = path.read_text(encoding="utf-8")
        self.doc_id = self._doc_id()
        self.slug = extract_slug(self.raw)
        self.route = self._route()
        self.title = ""
        self.keywords = set()
        self.prose = ""
        self.body_text = ""
        self.next_text = ""
        self.outbound = []  # list of (line_no, raw_target, resolved_doc_or_None, in_body)
        self.addressable_keys = self._addressable_keys()

    def _doc_id(self):
        rel = self.path.relative_to(self.root_dir).with_suffix("")
        parts = rel.parts
        if parts and parts[-1] == "index":
            parts = parts[:-1]
        return "/".join(parts)

    def _route(self):
        doc_id = self.doc_id
        if self.slug is not None:
            # Docusaurus `slug:` frontmatter overrides the route. An absolute
            # slug (leading /) replaces the whole path under the plugin's
            # routeBasePath; a relative slug replaces only the last segment.
            if self.slug.startswith("/"):
                doc_id = self.slug.strip("/")
            else:
                parts = self.doc_id.split("/")[:-1]
                doc_id = "/".join(parts + [self.slug.strip("/")]) if parts else self.slug.strip("/")
        return "/" + self.root_label + (("/" + doc_id) if doc_id else "")

    def _addressable_keys(self):
        no_ext = norm_path(self.path.with_suffix(""))
        keys = {no_ext}
        if self.path.stem == "index":
            keys.add(norm_path(self.path.parent))
        return keys

    def __repr__(self):
        return f"<Doc {self.route}>"


def norm_path(p) -> str:
    return os.path.normpath(str(p)).replace("\\", "/")


def strip_frontmatter(text: str):
    if text.startswith("---"):
        m = re.match(r"^---\n.*?\n---\n", text, re.S)
        if m:
            return text[m.end():], text[: m.end()].count("\n")
    return text, 0


def extract_slug(text: str):
    """Return the Docusaurus `slug:` frontmatter value, or None if absent.
    A doc with a custom slug is reachable at that route instead of its
    filesystem-derived one, and absolute links must resolve against it."""
    if not text.startswith("---"):
        return None
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        return None
    fm = re.search(r"^slug:\s*(.+)$", m.group(1), re.M)
    if not fm:
        return None
    return fm.group(1).strip().strip("'\"")


def extract_title(text: str) -> str:
    m = re.search(r"^#\s+(.+)$", text, re.M)
    if not m:
        return ""
    title = m.group(1).strip().rstrip("?")
    title = TITLE_STRIP_PREFIXES.sub("", title).strip()
    return title


def extract_keywords(text: str, title: str) -> set:
    # Title and DefinitionCard terms are treated as strong identity signals
    # even as a single word. Plain **bold** spans are a much weaker signal in
    # practice (often generic emphasis, not a defined term), so those only
    # count when they are a multi-word phrase specific enough to be useful.
    strong = set()
    if title:
        strong.add(title)
    for m in re.finditer(r'term=["\']([^"\']+)["\']', text):
        strong.add(m.group(1).strip())

    weak = set()
    for m in re.finditer(r"\*\*([^*\n]+)\*\*", text):
        term = m.group(1).strip()
        if term and len(term.split()) >= 2:
            weak.add(term)

    cleaned = set()
    for k in strong | weak:
        k = k.strip().strip(".,:;")
        if len(k) < 4:
            continue
        if k.lower() in GENERIC_TERMS:
            continue
        cleaned.add(k)
    return cleaned


def build_prose(text: str) -> str:
    """Strip fenced code, MDX comments, inline code, JSX/import noise, and
    links down to plain prose for keyword scanning and section splitting.
    Line numbers are not preserved here; this text is only used for
    substring/heading search.

    MDX comments and inline code are removed because neither is prose a
    reader sees as link-worthy text. Leaving them in lets author TODOs and
    file paths score as corpus keywords ("todo add diagram", "src-tauri src
    core"), which is noise in exactly the same way a generic word is."""
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"\{/\*.*?\*/\}", " ", text, flags=re.S)
    text = re.sub(r"`[^`\n]+`", " ", text)
    text = re.sub(r"^import .+$", " ", text, flags=re.M)
    text = re.sub(r"<[^>]+>", " ", text)
    return text


def strip_links_to_anchor_text(text: str) -> str:
    """Replace [anchor](target) with just the anchor for tokenization, so
    link targets (URLs, slugs) don't get counted as content words."""
    return LINK_RE.sub(lambda m: m.group(1), text)


def tokenize(text: str):
    return [w.lower() for w in TOKEN_RE.findall(text)]


def doc_ngrams(words, max_n=3):
    """Count 1-, 2-, and 3-word phrases in one doc's token stream. A unigram
    must recur at least twice to count. Longer phrases are kept at count 1
    since word-order specificity is itself a strong signal."""
    counts = Counter()
    n = len(words)
    for size in range(1, max_n + 1):
        for i in range(n - size + 1):
            gram = words[i:i + size]
            if gram[0] in STOPWORDS or gram[-1] in STOPWORDS:
                continue
            if size == 1 and (len(gram[0]) < 5 or gram[0].isdigit()):
                continue
            if any(w.isdigit() for w in gram):
                continue
            counts[" ".join(gram)] += 1
    return Counter({
        term: c for term, c in counts.items() if " " in term or c >= 2
    })


DOCCARDLIST_RE = re.compile(r"<DocCardList\b")


def is_card_index(doc) -> bool:
    """True for a Docusaurus category landing page: an index doc that renders
    <DocCardList/>. These are never really orphans. Docusaurus links them from
    the sidebar, and the card list is generated at build time (or written as
    JSX `items`), so the link graph this script builds from Markdown syntax
    cannot see either edge. Reporting them as orphans is a false positive that
    buries the real ones."""
    return doc.path.stem == "index" and bool(DOCCARDLIST_RE.search(doc.raw))


LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
NEXT_HEADING_RE = re.compile(
    r"^#{1,3}\s*(next steps|related|see also|further reading)\s*$",
    re.I | re.M,
)


def split_body_and_next(text: str):
    m = NEXT_HEADING_RE.search(text)
    if not m:
        return text, ""
    return text[: m.start()], text[m.start():]


def resolve_target(source: Doc, target: str, roots: dict, index_by_key: dict, route_index: dict):
    """Resolve a link target to a Doc, or None if it can't be resolved.
    Returns (Doc_or_None, in_scope) where in_scope is False for targets we
    intentionally don't judge (external URLs, mailto, unrelated absolute
    routes like /pricing, or a same-page anchor).

    Absolute /learn/... and /docs/... links are resolved against each doc's
    actual route (route_index), not a filesystem path, because a doc's route
    can be overridden by Docusaurus `slug:` frontmatter and no longer match
    its file location. Relative links (./, ../) are resolved against the
    filesystem since Docusaurus matches those to the source file, not slugs.
    """
    if target.startswith(("http://", "https://", "mailto:")):
        return None, False
    target = target.split("#", 1)[0].split("?", 1)[0]
    if not target:
        return None, False  # same-page anchor
    if target.startswith("./") or target.startswith("../") or (
        not target.startswith("/") and "/" not in target[:1]
    ):
        joined = norm_path(Path(source.path.parent, target))
        return index_by_key.get(joined), True
    for label in roots:
        prefix = "/" + label
        if target == prefix or target.startswith(prefix + "/"):
            route = target.rstrip("/") or prefix
            return route_index.get(route), True
    return None, False


def load_docs(roots: dict):
    docs = []
    for label, root_dir in roots.items():
        if not root_dir.is_dir():
            continue
        for path in sorted(root_dir.rglob("*")):
            if path.suffix in DOC_SUFFIXES and path.is_file():
                docs.append(Doc(path, label, root_dir))
    return docs


def analyze(docs, roots, min_body_links, top_keywords, keyword_min_len,
            generic_df_ratio=0.18, include_generic_unigrams=False):
    index_by_key = {}
    for d in docs:
        for k in d.addressable_keys:
            index_by_key[k] = d
    route_index = {d.route: d for d in docs}

    broken = []
    for d in docs:
        prose_no_fm, _ = strip_frontmatter(d.raw)
        body_text, next_text = split_body_and_next(build_prose(prose_no_fm))
        d.body_text, d.next_text = body_text, next_text
        d.title = extract_title(prose_no_fm)
        d.keywords = extract_keywords(prose_no_fm, d.title)

        for m in LINK_RE.finditer(d.raw):
            anchor, target = m.group(1), m.group(2)
            line_no = d.raw.count("\n", 0, m.start()) + 1
            resolved, in_scope = resolve_target(d, target, roots, index_by_key, route_index)
            in_body = m.start() < (len(d.raw) - len(next_text)) if next_text else True
            d.outbound.append((line_no, anchor, target, resolved, in_body))
            if in_scope and resolved is None:
                broken.append((d, line_no, anchor, target))

    inbound_count = {d.route: 0 for d in docs}
    for d in docs:
        seen_targets = set()
        for _, _, _, resolved, _ in d.outbound:
            if resolved is not None and resolved is not d:
                seen_targets.add(resolved.route)
        for route in seen_targets:
            inbound_count[route] += 1

    # Category landing pages are excluded from the orphan list rather than
    # dropped silently, so the report can still say how many were skipped.
    unlinked = [d for d in docs if inbound_count[d.route] == 0]
    orphans = [d for d in unlinked if not is_card_index(d)]
    skipped_card_indexes = [d for d in unlinked if is_card_index(d)]

    thin = []
    for d in docs:
        body_link_targets = {
            resolved.route
            for (_, _, _, resolved, in_body) in d.outbound
            if resolved is not None and in_body and resolved is not d
        }
        if len(body_link_targets) < min_body_links:
            thin.append((d, len(body_link_targets)))

    # --- identity terms: precise ownership signal (title, DefinitionCard term,
    # multi-word bold phrase). Used to resolve *which* doc a keyword belongs
    # to whenever a keyword matches one of these exactly. ---
    identity_index = {}
    for d in docs:
        for k in d.keywords:
            if len(k) < keyword_min_len:
                continue
            identity_index.setdefault(k.lower(), d)

    # --- TF-IDF over 1-3 word phrases in each doc's body prose. ---
    doc_terms = {}  # Doc -> Counter(term -> count)
    for d in docs:
        tokenizable = strip_links_to_anchor_text(d.body_text)
        doc_terms[d] = doc_ngrams(tokenize(tokenizable))

    doc_freq = Counter()
    for terms in doc_terms.values():
        doc_freq.update(terms.keys())

    n_docs = len(docs)

    # --- generic single-word filter ---
    # A unigram is dropped when it is ordinary vocabulary (GENERIC_UNIGRAMS)
    # or when it appears in more than generic_df_ratio of the corpus. The
    # frequency ceiling is what keeps this honest as content grows: a word
    # used across most of the site is by definition not distinctive to any
    # one page, whatever its TF-IDF score says. Phrases are never dropped.
    df_ceiling = generic_df_ratio * n_docs

    def is_generic_unigram(term: str) -> bool:
        if include_generic_unigrams or " " in term:
            return False
        return term in GENERIC_UNIGRAMS or doc_freq[term] > df_ceiling

    generic_dropped = sorted(
        {t for t in doc_freq if is_generic_unigram(t)},
        key=lambda t: (-doc_freq[t], t),
    )
    term_doc_scores = {}  # term -> {Doc: tfidf}
    doc_tfidf = {}  # Doc -> {term: tfidf}
    for d, terms in doc_terms.items():
        scores = {}
        for term, count in terms.items():
            if is_generic_unigram(term):
                continue
            df = doc_freq[term]
            idf = math.log(n_docs / df) if df else 0.0
            # A multi-word phrase is better anchor text than a single common
            # word even at similar tfidf magnitude, so rank it up: "git
            # worktree" is something you'd actually link, "agent" alone
            # usually is not.
            phrase_bonus = 1.0 + 0.3 * (term.count(" "))
            score = count * idf * phrase_bonus
            if score <= 0:
                continue
            scores[term] = score
            term_doc_scores.setdefault(term, {})[d] = score
        doc_tfidf[d] = scores

    def resolve_owner(term, source_doc):
        owner = identity_index.get(term)
        if owner is not None and owner is not source_doc:
            return owner
        others = {
            doc: score
            for doc, score in term_doc_scores.get(term, {}).items()
            if doc is not source_doc
        }
        if not others:
            return None
        return max(others.items(), key=lambda kv: kv[1])[0]

    keyword_coverage = {}
    for d in docs:
        ranked_terms = sorted(
            doc_tfidf[d].items(), key=lambda kv: -kv[1]
        )[:top_keywords]
        already_linked = {
            resolved.route
            for (_, _, _, resolved, _) in d.outbound
            if resolved is not None
        }
        covered, gaps = [], []
        for term, score in ranked_terms:
            owner = resolve_owner(term, d)
            if owner is None:
                continue  # this term is d's own subject, nothing to link to
            if owner.route in already_linked:
                covered.append((term, score, owner))
            else:
                gaps.append((term, score, owner))
        if covered or gaps:
            keyword_coverage[d] = {"covered": covered, "gaps": gaps}

    return {
        "docs": docs,
        "broken": broken,
        "orphans": orphans,
        "skipped_card_indexes": skipped_card_indexes,
        "thin": thin,
        "keyword_coverage": keyword_coverage,
        "inbound_count": inbound_count,
        "generic_dropped": generic_dropped,
        "generic_df_ratio": generic_df_ratio,
    }


def relpath(p: Path):
    try:
        return str(p.relative_to(Path.cwd()))
    except ValueError:
        return str(p)


def print_report(result, roots, min_body_links):
    docs = result["docs"]
    print("Interlinking Audit")
    print("=" * 60)
    print(f"Scanned {len(docs)} docs under: {', '.join(str(r) for r in roots.values())}")
    print()

    print(f"Broken internal links ({len(result['broken'])})")
    print("-" * 60)
    if not result["broken"]:
        print("  none")
    for d, line_no, anchor, target in result["broken"]:
        print(f"  {relpath(d.path)}:{line_no}  [{anchor}]({target})  -> unresolved")
    print()

    print(f"Orphan docs, no inbound links from other docs ({len(result['orphans'])})")
    print("-" * 60)
    if not result["orphans"]:
        print("  none")
    for d in result["orphans"]:
        print(f"  {relpath(d.path)}  ({d.route})")
    skipped = result["skipped_card_indexes"]
    if skipped:
        print(
            f"  ({len(skipped)} DocCardList category index pages excluded: "
            "linked from the sidebar and their card lists are generated at "
            "build time, so they are not real orphans)"
        )
    print()

    print(f"Thin docs, fewer than {min_body_links} body links ({len(result['thin'])})")
    print("-" * 60)
    if not result["thin"]:
        print("  none")
    for d, count in result["thin"]:
        print(f"  {relpath(d.path)}  (body links: {count})")
    print()

    coverage = result["keyword_coverage"]
    total_covered = sum(len(v["covered"]) for v in coverage.values())
    total_gaps = sum(len(v["gaps"]) for v in coverage.values())
    print(
        f"TF-IDF keyword coverage ({len(coverage)} docs scored, "
        f"{total_covered} covered / {total_gaps} gaps overall)"
    )
    print("-" * 60)
    if not coverage:
        print("  none")
    for d, v in coverage.items():
        covered, gaps = v["covered"], v["gaps"]
        total = len(covered) + len(gaps)
        print(f"  {relpath(d.path)}  ({len(covered)}/{total} important keywords interlinked)")
        for term, score, owner in gaps:
            print(
                f'    - GAP: "{term}" (tfidf {score:.2f}) not linked to '
                f'{owner.route}  ({relpath(owner.path)})'
            )
    dropped = result["generic_dropped"]
    if dropped:
        pct = int(result["generic_df_ratio"] * 100)
        preview = ", ".join(dropped[:12])
        more = f", +{len(dropped) - 12} more" if len(dropped) > 12 else ""
        print(
            f"  ({len(dropped)} generic single words excluded from scoring: "
            f"ordinary vocabulary, or appearing in over {pct}% of the corpus. "
            f"Phrases containing them are still scored.)"
        )
        print(f"    {preview}{more}")
        print()
    print(
        "These are candidates only. A high TF-IDF score means the term is "
        "distinctive for this doc relative to the corpus, not that the "
        "suggested target is definitely the right link. Verify relevance "
        "before adding or removing any link. See the audit-interlinking "
        "skill for the review workflow."
    )


def to_jsonable(result):
    def doc_ref(d):
        return {"path": relpath(d.path), "route": d.route, "title": d.title}

    return {
        "doc_count": len(result["docs"]),
        "broken": [
            {**doc_ref(d), "line": line_no, "anchor": anchor, "target": target}
            for d, line_no, anchor, target in result["broken"]
        ],
        "orphans": [doc_ref(d) for d in result["orphans"]],
        "skipped_card_indexes": [doc_ref(d) for d in result["skipped_card_indexes"]],
        "generic_dropped": result["generic_dropped"],
        "thin": [{**doc_ref(d), "body_links": count} for d, count in result["thin"]],
        "keyword_coverage": [
            {
                **doc_ref(d),
                "covered": [
                    {"term": t, "tfidf": round(s, 4), **doc_ref(owner)}
                    for t, s, owner in v["covered"]
                ],
                "gaps": [
                    {"term": t, "tfidf": round(s, 4), **doc_ref(owner)}
                    for t, s, owner in v["gaps"]
                ],
            }
            for d, v in result["keyword_coverage"].items()
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", action="append", dest="roots",
        help="Content root to scan, format label=path (e.g. learn=web/learn). "
        "Repeatable. Defaults to web/learn and web/docs from the repo root.",
    )
    parser.add_argument("--min-body-links", type=int, default=2)
    parser.add_argument(
        "--top-keywords", type=int, default=8,
        help="How many of a doc's top TF-IDF terms to check for link coverage.",
    )
    parser.add_argument("--keyword-min-len", type=int, default=4)
    parser.add_argument(
        "--generic-df-ratio", type=float, default=0.18,
        help="Drop a single-word term from TF-IDF scoring when it appears in "
        "more than this fraction of the corpus (default 0.18). A word used "
        "across most of the site is not distinctive to any one page. Multi-word "
        "phrases are never dropped. Set to 1.0 to disable the ceiling.",
    )
    parser.add_argument(
        "--include-generic-unigrams", action="store_true",
        help="Score generic single words anyway, disabling both the stoplist "
        "and the frequency ceiling. Useful for debugging the filter.",
    )
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if args.roots:
        roots = {}
        for entry in args.roots:
            if "=" not in entry:
                print(f"--root expects label=path, got: {entry}", file=sys.stderr)
                return 2
            label, path = entry.split("=", 1)
            roots[label] = Path(path).resolve()
    else:
        repo_root = Path(__file__).resolve().parents[4]
        roots = {
            "learn": repo_root / "web" / "learn",
            "docs": repo_root / "web" / "docs",
        }

    missing = [str(p) for p in roots.values() if not p.is_dir()]
    if missing and not args.roots:
        roots = {k: v for k, v in roots.items() if v.is_dir()}
    if not roots:
        print("No content roots found.", file=sys.stderr)
        return 2

    docs = load_docs(roots)
    if not docs:
        print("No .md/.mdx files found under the given roots.", file=sys.stderr)
        return 2

    result = analyze(
        docs, roots, args.min_body_links, args.top_keywords, args.keyword_min_len,
        generic_df_ratio=args.generic_df_ratio,
        include_generic_unigrams=args.include_generic_unigrams,
    )

    if args.json:
        print(json.dumps(to_jsonable(result), indent=2))
    else:
        print_report(result, roots, args.min_body_links)
    return 0


if __name__ == "__main__":
    sys.exit(main())
