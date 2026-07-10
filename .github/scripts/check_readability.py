#!/usr/bin/env python3
# /// script
# dependencies = ["textstat"]
# ///

import os
import re
from pathlib import Path

import textstat


def strip_markdown(text: str) -> str:
    # Remove YAML frontmatter
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.DOTALL)
    # Remove fenced code blocks (including Docusaurus admonitions)
    text = re.sub(r"^:::.*?^:::", "", text, flags=re.DOTALL | re.MULTILINE)
    text = re.sub(r"```[\s\S]*?```", "", text)
    # Remove inline code
    text = re.sub(r"`[^`]+`", "", text)
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    # Remove markdown images
    text = re.sub(r"!\[[^\]]*\]\([^\)]+\)", "", text)
    # Remove markdown links, keep text
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    # Remove headers (keep text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # Remove bold/italic
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"_([^_]+)_", r"\1", text)
    # Remove blockquotes
    text = re.sub(r"^>\s+", "", text, flags=re.MULTILINE)
    # Remove table rows
    text = re.sub(r"^\|.*\|$", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[-|:\s]+$", "", text, flags=re.MULTILINE)
    # Remove list markers
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    # Collapse whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def grade_label(score: float) -> str:
    if score >= 90:
        return "Very Easy"
    if score >= 80:
        return "Easy"
    if score >= 70:
        return "Fairly Easy"
    if score >= 60:
        return "Standard"
    if score >= 50:
        return "Fairly Difficult"
    if score >= 30:
        return "Difficult"
    return "Very Difficult"


def file_url(rel_path: str) -> str | None:
    server = os.environ.get("GITHUB_SERVER_URL")
    repo = os.environ.get("GITHUB_REPOSITORY")
    sha = os.environ.get("GITHUB_SHA")
    if not (server and repo and sha):
        return None
    return f"{server}/{repo}/blob/{sha}/{rel_path}"


def analyze_file(path: Path, workspace: Path) -> dict | None:
    content = path.read_text(encoding="utf-8")
    plain = strip_markdown(content)
    words = len(plain.split())
    if words < 30:
        return None
    score = round(textstat.flesch_reading_ease(plain), 1)
    rel_path = str(path.relative_to(workspace))
    return {
        "path": rel_path,
        "url": file_url(rel_path),
        "score": score,
        "words": words,
    }


def file_cell(r: dict) -> str:
    if r["url"]:
        return f"[{r['path']}]({r['url']})"
    return f"`{r['path']}`"


def main() -> None:
    workspace = Path(os.environ.get("GITHUB_WORKSPACE", "."))
    doc_dirs = [workspace / "web" / "docs", workspace / "web" / "learn"]

    results = []
    for doc_dir in doc_dirs:
        if not doc_dir.exists():
            continue
        for md_file in sorted(doc_dir.rglob("*.md")):
            result = analyze_file(md_file, workspace)
            if result:
                results.append(result)

    results.sort(key=lambda r: r["score"])
    low = [r for r in results if r["score"] < 70]

    lines: list[str] = ["## Docs Readability Report\n"]

    if low:
        lines.append(
            f"### ⚠️ Low Readability Articles ({len(low)} of {len(results)})\n"
        )
        lines.append(
            "Articles with Flesch Reading Ease score below 70 should be simplified.\n"
        )
    else:
        lines.append(
            f"### ✅ All {len(results)} articles meet readability target (Flesch ≥ 70)\n"
        )

    lines.append("| File | Score | Difficulty | Words |")
    lines.append("|------|------:|------------|------:|")
    for r in results:
        flag = "⚠️ " if r["score"] < 70 else ""
        lines.append(
            f"| {file_cell(r)} | {flag}{r['score']} | {grade_label(r['score'])} | {r['words']} |"
        )

    output = "\n".join(lines) + "\n"

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a") as f:
            f.write(output)

    if low:
        print(f"Found {len(low)} article(s) with Flesch score < 70:")
        for r in low:
            print(f"  {r['path']}: {r['score']} ({grade_label(r['score'])})")
    else:
        print(f"All {len(results)} articles have Flesch score ≥ 70.")


if __name__ == "__main__":
    main()
