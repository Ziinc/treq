#!/usr/bin/env python3
"""Readability and house-voice checker for treq prose.

No third-party dependencies. Reads a Markdown or MDX file, masks frontmatter,
code, and JSX (preserving line numbers), then reports readability scores and
every banlist / AI-tell hit from the explain-to-me skill.

The banlists draw on: oliviacal.com/post/ai-writing-tells, the Forbes "Seven
Tells of AI Writing", Wikipedia:Signs_of_AI_writing, github.com/kdgbalmer/ai-tells,
and dragonflyeditorial.com/ai-tells.

Usage:
    python3 readability.py path/to/doc.mdx [more.md ...]
    python3 readability.py --strict path/to/doc.mdx   # exit 1 on hard fails

Exit codes:
    0  no hard fails (or --strict not set)
    1  hard fails found and --strict set (hard bans, Tier 1 words, em-dash rate)
    2  usage / file error

--strict fails on: em dashes, semicolons, ALL CAPS, Tier 1 vocabulary, and an
em-dash rate above 3 per 500 words. Tier 2 vocabulary and structural tells are
reported for review but do not fail the run.
"""

import re
import sys

# ---------------------------------------------------------------------------
# Vocabulary banlists (matched case-insensitively as whole phrases).
# ---------------------------------------------------------------------------

# Tier 1: high-confidence AI markers. Near-zero legitimate use in treq docs.
# These fail --strict.
TIER1 = [
    # marketing / hype
    "powerful", "robust", "elegant", "seamless", "leverage", "utilize",
    "unlock", "empower", "supercharge", "all the rage", "game-changer",
    "game changer", "revolutionary", "lightning speed", "at the speed of light",
    "blazing fast", "bulletproof", "rock-solid", "rock solid", "cutting-edge",
    "cutting edge", "state-of-the-art", "world-class",
    # filler
    "in order to", "essentially", "basically", "fundamentally",
    "a wide array of", "a plethora of", "rightfully so", "needless to say",
    # AI-signature verbs / nouns
    "delve", "foster", "ignite", "uncover", "unleash", "underscore",
    "streamline", "multifaceted", "pivotal", "demystify", "meticulous",
    "nuanced", "showcase", "garner", "bolster", "elevate", "unwavering",
    "harness", "embark", "intricate", "exemplifies", "indelible", "myriad",
    # spatial-metaphor cluster
    "tapestry", "testament", "beacon", "realm", "symphony", "boasts",
    "nestled", "renowned for",
    # stiff process language
    "agreed contract", "contention",
]

# Tier 2: context-dependent. Sometimes legitimate in technical prose. Reported
# for human review, does NOT fail --strict.
TIER2 = [
    "crucial", "key", "vital", "significant", "essential", "comprehensive",
    "holistic", "dynamic", "innovative", "transformative", "optimize",
    "embrace", "journey", "landscape", "ecosystem", "paradigm", "rich",
    "profound", "vibrant", "interplay", "align with",
]

# ---------------------------------------------------------------------------
# Structural / rhetorical tells. Regex patterns, case-insensitive.
# ---------------------------------------------------------------------------

AI_TELLS = [
    # -- rhetorical framing ------------------------------------------------
    (r"\bnot just\b[^.]*\bbut\b", "antithesis: 'not just X but Y'"),
    (r"\bnot only\b[^.]*\bbut also\b", "antithesis: 'not only X but also Y'"),
    (r"\b(is|it['’]s|isn['’]t|are|aren['’]t)\s+not\s+just\b", "antithesis: 'isn't just ...'"),
    (r"\bit['’]s more than\b[^.]*,\s*it['’]s\b", "antithesis: 'it's more than X, it's Y'"),
    (r"\bnot\b[^,.;:]*,\s*not\b", "repetitive negatives: 'not X, not Y'"),
    (r"\b\w+\s+rather than\s+\w+", "negative parallelism: 'X rather than Y'"),
    (r"\bwhether\b[^.]*\bor\b[^.,]*,\s*(it['’]s|they['’]re|you)", "encompassing opener: 'whether X or Y, it's Z'"),
    (r"[a-z]{4,}\?\s+[A-Z][a-z]+\.", "rhetorical question then one-word answer: 'The problem? Scale.'"),
    (r"\b(at its core|at the end of the day|ultimately, it['’]s about|it['’]s about (humanity|people))\b", "inspirational pivot"),
    # -- transitions & openers ---------------------------------------------
    (r"(?m)^\s*(furthermore|moreover|additionally|however|interestingly)\b", "mechanical transition as sentence opener"),
    (r"\bit['’]s (important|worth) (to note|noting|mentioning)\b", "throat-clearing: 'it's important to note'"),
    (r"\bit is (important|worth) (to note|noting|mentioning)\b", "throat-clearing: 'it is important to note'"),
    (r"\bin today['’]s .{0,25}\b(world|landscape|era|age)\b", "scene-setting intro"),
    (r"\bever-evolving\b|\bever-changing\b", "'ever-evolving / ever-changing'"),
    (r"\blet['’]s dive in\b|\bdive deep\b|\bdiving into\b", "'let's dive in / dive deep'"),
    (r"\bnavigat(e|ing) the (complexit|landscape|world)", "spatial metaphor: 'navigate the complexities'"),
    (r"\b(picture this|imagine (a|that|you)|as a \w+, you know)\b", "fake-empathy scenario"),
    (r"\b(here['’]s the kicker|that['’]s only half the story|real talk)\b", "hook transition"),
    (r"\b(great question|absolutely|i['’]d be happy to help|happy to help|certainly,)\b", "assistant/sycophantic opener"),
    # -- closings ----------------------------------------------------------
    (r"\b(in summary|to sum up|in conclusion|in essence|at the end of the day|ultimately)\b", "closing restatement"),
    # -- attribution -------------------------------------------------------
    (r"\b(studies show|research (shows|suggests)|experts (say|argue|agree)|many experts|industry reports|observers have (cited|noted))\b", "vague attribution without source"),
    # -- superficial analysis ----------------------------------------------
    (r"\b(highlighting|underscoring|reflecting|showcasing|emphasizing)\s+(the\s+)?(significance|importance|need|broader|trend)", "superficial -ing clause"),
    (r"\bdespite its\b[^.]*\bfaces?\b[^.]*\bchallenges?\b", "'despite its X, faces challenges' formula"),
    # -- copula avoidance --------------------------------------------------
    (r"\b(serves as|stands as|marks a|represents a shift)\b", "copula avoidance (use 'is')"),
    # -- hedging -----------------------------------------------------------
    (r"\b(may|might|could)\s+(potentially|possibly)\b|\bpotentially possibly\b", "hedge stacking"),
]

SENTENCE_SPLIT = re.compile(r"[.!?]+(?:\s|$)")
VOWEL_GROUP = re.compile(r"[aeiouy]+")
CURLY = re.compile(r"[‘’“”]")
HEADING = re.compile(r"^(#+)\s+(.*)$")
BOLD_SPAN = re.compile(r"\*\*[^*]+\*\*")
INLINE_HEADER_LIST = re.compile(
    r"^\s*(?:[-*+]|\d+\.)\s+\*\*[^*]+(?::\*\*|\*\*\s*:)")
TRAILING_PURPOSE = re.compile(r",\s+to\s+(help|enable|ensure|allow|make)\b[^.]*\.\s*$", re.IGNORECASE)

# Common acronyms that are legitimately upper-case, excluded from the ALL CAPS ban.
ACRONYM_ALLOW = {
    "HTTP", "HTTPS", "JSON", "YAML", "HTML", "CSS", "API", "APIS", "CLI",
    "SQL", "REST", "CRUD", "UUID", "MDX", "LLM", "LLMS", "AI", "CI", "URL",
    "URLS", "TODO", "NOTE", "JJ", "GPU", "CPU", "RAM", "OS", "SDK", "IDE",
}

SMALL_WORDS = {"a", "an", "the", "and", "or", "of", "to", "in", "for", "on",
               "at", "by", "with", "as", "is", "it", "&"}


def _blank(m):
    """Replace a matched region with newlines, preserving line numbers."""
    return "\n" * m.group(0).count("\n")


def mask(raw):
    """Blank out non-prose regions (frontmatter, code, JSX, tables, imports)
    while preserving line count, so line-numbered scans see only prose."""
    text = raw
    text = re.sub(r"\A---\n.*?\n---\n", _blank, text, flags=re.DOTALL)
    text = re.sub(r"```.*?```", _blank, text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", _blank, text, flags=re.DOTALL)  # JSX/HTML, multiline
    text = re.sub(r"`[^`]*`", " ", text)                      # inline code
    lines = []
    for line in text.split("\n"):
        s = line.strip()
        if re.match(r"^(import|export)\b", s) or s.startswith(":::") or s.startswith("|"):
            lines.append("")
            continue
        if re.match(r"^#+\s+", line):
            lines.append("")                       # blank headings; keep line count
            continue
        line = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", line)  # keep link text
        line = re.sub(r"[*_>]", "", line)                     # emphasis/quote marks
        lines.append(line)
    return "\n".join(lines)


def count_syllables(word):
    word = word.lower().strip()
    if not word:
        return 0
    groups = VOWEL_GROUP.findall(word)
    count = len(groups)
    if word.endswith("e") and count > 1:
        count -= 1
    return max(count, 1)


def sentence_word_counts(prose):
    counts = []
    for s in SENTENCE_SPLIT.split(prose):
        n = len(re.findall(r"[A-Za-z][A-Za-z'’-]*", s))
        if n:
            counts.append(n)
    return counts


def stdev(nums):
    if len(nums) < 2:
        return 0.0
    mean = sum(nums) / len(nums)
    var = sum((n - mean) ** 2 for n in nums) / (len(nums) - 1)
    return var ** 0.5


def readability(prose):
    words = re.findall(r"[A-Za-z][A-Za-z'’-]*", prose)
    counts = sentence_word_counts(prose)
    n_words = len(words)
    n_sentences = max(len(counts), 1)
    n_syllables = sum(count_syllables(w) for w in words)
    if n_words == 0:
        return None
    wps = n_words / n_sentences
    spw = n_syllables / n_words
    flesch = 206.835 - 1.015 * wps - 84.6 * spw
    fk_grade = 0.39 * wps + 11.8 * spw - 15.59
    mean_len = sum(counts) / len(counts) if counts else 0
    cv = (stdev(counts) / mean_len) if mean_len else 0
    return {
        "words": n_words,
        "sentences": n_sentences,
        "words_per_sentence": round(wps, 1),
        "flesch_reading_ease": round(flesch, 1),
        "fk_grade": round(fk_grade, 1),
        "len_cv": round(cv, 2),
    }


def long_sentences(prose, limit=30):
    hits = []
    for s in SENTENCE_SPLIT.split(prose):
        s = s.strip()
        n = len(re.findall(r"[A-Za-z][A-Za-z'’-]*", s))
        if n > limit:
            hits.append((n, s[:80] + ("..." if len(s) > 80 else "")))
    return hits


def short_paragraph_endings(prose, min_words=3):
    """Flag paragraphs whose final sentence has fewer than min_words words."""
    hits = []
    lines = prose.splitlines()
    para = []

    def flush(end_line):
        nonlocal para
        text = " ".join(l.strip() for l in para if l.strip())
        para = []
        if not text or not re.search(r"[.!?]\s*$", text):
            return
        parts = [p.strip() for p in SENTENCE_SPLIT.split(text) if p.strip()]
        if not parts:
            return
        last = parts[-1]
        n = len(re.findall(r"[A-Za-z][A-Za-z'’-]*", last))
        if 0 < n < min_words:
            hits.append((end_line, n, last[:80]))

    for i, line in enumerate(lines, 1):
        if not line.strip():
            if para:
                flush(i - 1)
            continue
        para.append(line)
    if para:
        flush(len(lines))
    return hits


def find_lines(pattern, text, flags=0):
    rx = re.compile(pattern, flags)
    return [(i, line.strip()) for i, line in enumerate(text.splitlines(), 1)
            if rx.search(line)]


def find_words(words, text):
    """Whole-phrase, case-insensitive scan. Returns (phrase, line, context)."""
    hits = []
    for w in words:
        pat = r"\b" + re.escape(w).replace(r"\ ", r"\s+") + r"\b"
        for ln, txt in find_lines(pat, text, re.IGNORECASE):
            hits.append((w, ln, txt))
    return hits


def all_caps_hits(text):
    hits = []
    for i, line in enumerate(text.splitlines(), 1):
        for m in re.finditer(r"\b[A-Z][A-Z]{3,}\b", line):
            if m.group(0) not in ACRONYM_ALLOW:
                hits.append((i, line.strip()))
                break
    return hits


def title_case_headings(raw):
    hits = []
    for i, line in enumerate(raw.splitlines(), 1):
        m = HEADING.match(line)
        if not m:
            continue
        words = m.group(2).split()
        significant = [w for w in words if w.lower() not in SMALL_WORDS]
        if len(significant) >= 3 and all(w[:1].isupper() for w in significant):
            hits.append((i, m.group(2)))
    return hits


def report(label, items, formatter, limit=20):
    if not items:
        return
    print(f"{label} ({len(items)}):")
    for it in items[:limit]:
        print("  " + formatter(it))
    if len(items) > limit:
        print(f"  ... and {len(items) - limit} more")


def check_file(path, strict):
    try:
        with open(path, encoding="utf-8") as f:
            raw = f.read()
    except OSError as e:
        print(f"error: cannot read {path}: {e}", file=sys.stderr)
        return 2

    prose = mask(raw)
    print(f"\n=== {path} ===")

    # --- hard bans (on masked prose) ---
    em_hits = find_lines(r"—", prose)
    semi_hits = find_lines(r";", prose)
    caps_hits = all_caps_hits(prose)

    tier1_hits = find_words(TIER1, prose)
    tier2_hits = find_words(TIER2, prose)
    tell_hits = [(desc, ln, txt) for pat, desc in AI_TELLS
                 for ln, txt in find_lines(pat, prose, re.IGNORECASE)]

    curly_hits = find_lines(CURLY.pattern, prose)
    tc_headings = title_case_headings(raw)
    bold_hits = [(i, ln.strip()) for i, ln in enumerate(raw.splitlines(), 1)
                 for _ in BOLD_SPAN.finditer(ln)]
    inline_hdr = find_lines(INLINE_HEADER_LIST.pattern, raw)
    purpose_hits = [(i, ln.strip()) for i, ln in enumerate(prose.splitlines(), 1)
                    if TRAILING_PURPOSE.search(ln)]
    ls = long_sentences(prose)
    short_ends = short_paragraph_endings(prose)

    r = readability(prose)
    words_total = r["words"] if r else 0
    n_em = len(em_hits)
    em_rate = round(n_em / words_total * 500, 2) if words_total else 0
    tell_total = n_em + len(semi_hits) + len(caps_hits) + len(tier1_hits) + len(tell_hits)
    density = round(tell_total / words_total * 500, 2) if words_total else 0

    if r:
        print("readability:")
        print(f"  words {r['words']}, sentences {r['sentences']}, "
              f"{r['words_per_sentence']} words/sentence")
        print(f"  Flesch reading ease {r['flesch_reading_ease']} (aim 50+; higher is easier)")
        print(f"  Flesch-Kincaid grade {r['fk_grade']} (aim <= 12)")
        cv_note = " (low = monotonous rhythm)" if r["len_cv"] < 0.4 else ""
        print(f"  sentence-length variation (CV) {r['len_cv']}{cv_note}")
        print(f"  em-dash rate {em_rate} per 500 words (aim 0)")
        print(f"  tell density {density} per 500 words (hard bans + Tier 1 + tells)")

    report("hard ban: em dash", em_hits, lambda h: f"L{h[0]}: {h[1][:90]}")
    report("hard ban: semicolon", semi_hits, lambda h: f"L{h[0]}: {h[1][:90]}")
    report("hard ban: ALL CAPS", caps_hits, lambda h: f"L{h[0]}: {h[1][:90]}")
    report("Tier 1 vocabulary (fix these)", tier1_hits,
           lambda h: f"L{h[1]}: '{h[0]}' -> {h[2][:70]}")
    report("AI tells", tell_hits, lambda h: f"L{h[1]}: {h[0]} -> {h[2][:70]}")
    report("curly quotes", curly_hits, lambda h: f"L{h[0]}: {h[1][:90]}")
    report("trailing purpose clause", purpose_hits, lambda h: f"L{h[0]}: {h[1][:90]}")
    report("inline-header list rows", inline_hdr, lambda h: f"L{h[0]}: {h[1][:90]}")
    report("long sentences (>30 words)", ls, lambda h: f"{h[0]} words: {h[1]}")
    report("short paragraph endings (<3 words)", short_ends,
           lambda h: f"L{h[0]}: {h[1]} words -> '{h[2]}'")

    # Soft / review-only signals (do not fail --strict).
    report("Tier 2 vocabulary (review)", tier2_hits,
           lambda h: f"L{h[1]}: '{h[0]}' -> {h[2][:70]}")
    if len(bold_hits) > max(6, words_total // 200):
        report("bold spans in prose (possibly excessive)", bold_hits,
               lambda h: f"L{h[0]}: {h[1][:80]}", limit=10)
    if tc_headings:
        print("Title Case headings (review; house concept-doc headings are "
              "intentionally title case):")
        for ln, h in tc_headings[:20]:
            print(f"  L{ln}: {h}")

    hard_fail = bool(em_hits or semi_hits or caps_hits or tier1_hits) or em_rate > 3
    if not (hard_fail or tell_hits or tier2_hits or ls or curly_hits or short_ends):
        print("clean: no hard fails, tells, or overlong sentences.")

    if strict and hard_fail:
        return 1
    return 0


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("-")]
    strict = "--strict" in argv
    if not args:
        print(__doc__)
        return 2
    rc = 0
    for path in args:
        rc = max(rc, check_file(path, strict))
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv))
