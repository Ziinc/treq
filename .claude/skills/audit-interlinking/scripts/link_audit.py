#!/usr/bin/env python3
"""Interlinking auditor for treq content docs.

No third-party dependencies. Walks the content roots (default `web/learn` and
`web/docs`), builds the internal link graph, and reports:

  - broken internal links (target does not resolve to a real doc)
  - orphan docs (no other doc links to them)
  - thin docs (fewer than --min-body-links contextual links in the body,
    counted separately from a trailing Next Steps / Related list)
  - keyword-relevancy suggestions: places where a doc's prose names another
    doc's title or defined term but does not link to it

This script finds *candidates*. It has no notion of whether two docs are
actually related, only whether one names the other. A human (or an agent
following the audit-interlinking skill) still has to read both docs and
decide whether a suggested link belongs, and whether an existing link is
still relevant.

Usage:
    python3 link_audit.py [--root DIR ...] [--min-body-links N] [--max-suggestions N]
    python3 link_audit.py --json

Exit codes:
    0  ran successfully (findings are informational, not a failure)
    2  usage / path error
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

DOC_SUFFIXES = (".md", ".mdx")

# Generic bolded/defined terms that are too common to be useful link signals.
GENERIC_TERMS = {
    "note", "example", "important", "tip", "warning", "summary", "goal",
    "short answer", "related", "next steps",
}

TITLE_STRIP_PREFIXES = re.compile(r"^(what is|what are|how to)\s+", re.I)


class Doc:
    def __init__(self, path: Path, root_label: str, root_dir: Path):
        self.path = path
        self.root_label = root_label
        self.root_dir = root_dir
        self.raw = path.read_text(encoding="utf-8")
        self.doc_id = self._doc_id()
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
        return "/" + self.root_label + (("/" + self.doc_id) if self.doc_id else "")

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
    """Strip fenced code, JSX/import noise, and links down to plain prose
    for keyword scanning and section splitting. Line numbers are not
    preserved here; this text is only used for substring/heading search."""
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"^import .+$", " ", text, flags=re.M)
    text = re.sub(r"<[^>]+>", " ", text)
    return text


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


def resolve_target(source: Doc, target: str, roots: dict, index_by_key: dict):
    """Resolve a link target to a Doc, or None if it can't be resolved.
    Returns (Doc_or_None, in_scope) where in_scope is False for targets we
    intentionally don't judge (external URLs, mailto, unrelated absolute
    routes like /pricing)."""
    if target.startswith(("http://", "https://", "mailto:", "#")):
        return None, False
    if target.startswith("./") or target.startswith("../") or (
        not target.startswith("/") and "/" not in target[:1]
    ):
        joined = norm_path(Path(source.path.parent, target))
        return index_by_key.get(joined), True
    for label, root_dir in roots.items():
        prefix = "/" + label
        if target == prefix or target.startswith(prefix + "/"):
            remainder = target[len(prefix):].lstrip("/")
            joined = norm_path(Path(root_dir, remainder)) if remainder else norm_path(root_dir)
            return index_by_key.get(joined), True
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


def analyze(docs, roots, min_body_links, max_suggestions, keyword_min_len):
    index_by_key = {}
    for d in docs:
        for k in d.addressable_keys:
            index_by_key[k] = d

    broken = []
    for d in docs:
        body_text, next_text = split_body_and_next(build_prose(d.raw))
        d.body_text, d.next_text = body_text, next_text
        prose_no_fm, _ = strip_frontmatter(d.raw)
        d.title = extract_title(prose_no_fm)
        d.keywords = extract_keywords(prose_no_fm, d.title)

        for m in LINK_RE.finditer(d.raw):
            anchor, target = m.group(1), m.group(2)
            line_no = d.raw.count("\n", 0, m.start()) + 1
            resolved, in_scope = resolve_target(d, target, roots, index_by_key)
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

    orphans = [d for d in docs if inbound_count[d.route] == 0]

    thin = []
    for d in docs:
        body_link_targets = {
            resolved.route
            for (_, _, _, resolved, in_body) in d.outbound
            if resolved is not None and in_body and resolved is not d
        }
        if len(body_link_targets) < min_body_links:
            thin.append((d, len(body_link_targets)))

    keyword_owners = {}
    for d in docs:
        for k in d.keywords:
            if len(k) < keyword_min_len:
                continue
            keyword_owners.setdefault(k.lower(), []).append((k, d))

    suggestions = {}
    for d in docs:
        already_linked = {
            resolved.route
            for (_, _, _, resolved, _) in d.outbound
            if resolved is not None
        }
        hits = {}  # target_doc -> (keyword, count)
        for k_lower, owners in keyword_owners.items():
            pattern = re.compile(
                r"(?<![\w-])" + re.escape(k_lower) + r"(?![\w-])", re.I
            )
            matches = len(pattern.findall(d.body_text))
            if not matches:
                continue
            for k_display, owner in owners:
                if owner is d or owner.route in already_linked:
                    continue
                existing = hits.get(owner.route)
                if existing is None or len(k_display) > len(existing[0]):
                    hits[owner.route] = (k_display, matches, owner)
        ranked = sorted(
            hits.values(), key=lambda t: (-len(t[0]), -t[1])
        )[:max_suggestions]
        if ranked:
            suggestions[d] = ranked

    return {
        "docs": docs,
        "broken": broken,
        "orphans": orphans,
        "thin": thin,
        "suggestions": suggestions,
        "inbound_count": inbound_count,
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
    print()

    print(f"Thin docs, fewer than {min_body_links} body links ({len(result['thin'])})")
    print("-" * 60)
    if not result["thin"]:
        print("  none")
    for d, count in result["thin"]:
        print(f"  {relpath(d.path)}  (body links: {count})")
    print()

    print(f"Keyword-relevancy suggestions ({len(result['suggestions'])} docs with hits)")
    print("-" * 60)
    if not result["suggestions"]:
        print("  none")
    for d, ranked in result["suggestions"].items():
        print(f"  {relpath(d.path)}")
        for keyword, count, owner in ranked:
            print(
                f'    - mentions "{keyword}" ({count}x), '
                f'not linked to {owner.route}  ({relpath(owner.path)})'
            )
    print()
    print(
        "These are candidates only. Verify relevance before adding or removing "
        "any link. See the audit-interlinking skill for the review workflow."
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
        "thin": [{**doc_ref(d), "body_links": count} for d, count in result["thin"]],
        "suggestions": [
            {
                **doc_ref(d),
                "candidates": [
                    {"keyword": k, "occurrences": c, **doc_ref(owner)}
                    for k, c, owner in ranked
                ],
            }
            for d, ranked in result["suggestions"].items()
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
    parser.add_argument("--max-suggestions", type=int, default=6)
    parser.add_argument("--keyword-min-len", type=int, default=4)
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
        docs, roots, args.min_body_links, args.max_suggestions, args.keyword_min_len
    )

    if args.json:
        print(json.dumps(to_jsonable(result), indent=2))
    else:
        print_report(result, roots, args.min_body_links)
    return 0


if __name__ == "__main__":
    sys.exit(main())
