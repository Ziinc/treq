eb---
name: writing
description: >-
  Write or revise docs and articles in the treq house voice: direct, declarative
  prose that explains to a peer engineer, with no buzzwords, no marketing
  language, and none of the common AI-generated writing tells (em dashes, "not
  just X but Y", rule-of-three padding, "it's important to note"). Use when
  drafting or editing any .mdx or .md doc under web/, a README, a changelog, or
  release notes.
---

# Writing in the treq voice

## When to use

- Drafting a new doc or concept/workflow article.
- Revising existing prose to match the house voice.
- Running a de-slop edit pass on AI-generated text before it ships.

Read `web/STYLE_GUIDE.md` first. It is the baseline. This skill extends it with a
concrete voice model and banlists. Where the two agree, the style guide wins on
formatting. Where you need to know what the voice actually sounds like, use this.

## The voice, in one paragraph

You are explaining something to a peer senior engineer who is smart but new to
this specific topic. Second person. Confident and declarative. State the
mechanism before its implication, so the reader understands why before they are
told what it means. Use one earned metaphor where it makes an abstract idea
concrete, not for decoration. Sharpen a point with contrast when a distinction
matters. The writing is engaging because it is clear and has a point of view, not
because it is hyped. Trust the reader to keep up.

## Annotated exemplars

These are real passages from `web/learn/concepts/ai-engineering/ai-assisted-software-engineering/index.mdx`.
Study why each works, then write like this.

**Metaphor that carries the concept:**
> The developer's role shifts from the actor in the movie to the director
> orchestrating the AI actors, delegating implementation plans, refining and
> reviewing output.

Why it works: one metaphor does the explaining. No jargon, no definition needed.
The reader already knows what a director does, so the role shift lands instantly.

**Contrast that lands in one line:**
> Code that looks right is not the same as code that is right.

Why it works: parallel structure, one idea, the whole misconception corrected in
a single sentence. Nothing to cut.

**Mechanism stated plainly, misconception corrected without hedging:**
> The model is not performing logical reasoning about correctness, it is
> predicting plausibility.

Why it works: it says what the thing actually does, then contrasts it with what
readers assume it does. Declarative. No "it could be argued", no "somewhat".

**Now the same article's opening, which is slop. Do not write like this:**
> AI-assisted software engineering is all the rage right now, and rightfully so;
> it lets seasoned software developers multi-task, work away from the keyboard,
> and prototype ideas at lightning speed.

What is wrong: "all the rage" and "lightning speed" are hype with no information.
The semicolon should be two sentences. "rightfully so" is filler. The sentence
sells instead of explaining.

Rewrite:
> AI-assisted software engineering lets experienced developers multitask, work
> away from the keyboard, and prototype quickly. It also lowers the barrier for
> non-technical people to build software.

Same facts, no hype, no semicolon, and it now leads with what the reader gains.

## Voice rules

- Direct and declarative. One idea per sentence where you can.
- Active voice. "The service dispatches the alert", not "the alert is dispatched".
- Second person when addressing the reader.
- Mechanism before implication.
- Earn every metaphor. If it does not make an idea more concrete, cut it.
- No hedging or qualifiers: "quite", "fairly", "relatively", "somewhat".
- No apologetic openers: "it should be noted that", "it is worth mentioning".
- Paragraphs 3 to 4 sentences. Longer means break it up or use a list.
- Headings organize the doc. Do not use prose to transition between sections.

## Hard bans: formatting

- No em dashes. Use a period, comma, or colon.
- No semicolons. Break into two sentences.
- No ALL CAPS.
- Minimal parentheses. If the information matters, give it a full sentence.
- Backticks for code, file paths, commands, and identifiers: `jj log`, `type`.

## Buzzword and marketing banlist

Do not use these. Rewrite to the plain version.

Words fall in two tiers. Tier 1 has near-zero legitimate use in these docs, so
remove every one. Tier 2 is context-dependent: sometimes fine, so check each hit
and keep it only if it carries real meaning.

**Tier 1 (remove):**

| Banned | Use instead |
| --- | --- |
| powerful, robust, elegant, seamless | describe what it actually does |
| leverage, utilize, harness | use |
| unlock, empower, supercharge, elevate | enable, let you |
| all the rage, game-changer, revolutionary | cut it, or state the concrete benefit |
| lightning speed, at the speed of light, blazing fast | fast, or give a number |
| bulletproof, rock-solid, unwavering | reliable, or state the guarantee |
| in order to | to |
| essentially, basically, fundamentally | cut it |
| a wide array of, a plethora of, myriad | many, or list them |
| rightfully so, needless to say | cut it |
| delve, dive deep, embark, uncover, unleash | cut, or use a plain verb |
| foster, bolster, garner, streamline, underscore, showcase | plain verb: build, increase, show |
| multifaceted, intricate, nuanced, meticulous, pivotal | specific, detailed, careful, or cut |
| tapestry, realm, landscape (figurative), ecosystem (figurative), symphony, beacon | name the actual thing |
| testament, boasts, nestled, renowned for, exemplifies, indelible | rewrite plainly |
| cutting-edge, state-of-the-art, world-class | cut it |
| agreed contract | plain boundary: shared interface, clear file ownership, or named dependency |

**Tier 2 (review, keep only if earned):** crucial, key, vital, significant,
essential, comprehensive, holistic, dynamic, innovative, transformative,
optimize, embrace, journey, paradigm, rich, profound, vibrant, interplay,
align with. Prefer a concrete claim over the adjective.

## AI-tell banlist

These patterns read as machine-generated. Avoid each one. They are grouped by
kind, and the checker script flags most of them.

**Rhetorical framing:**

- Antithesis scaffolding: "it's not just X, it's Y", "isn't just X", "not only X
  but also Y", "it's more than X, it's Y". Say the point directly.
- Repetitive negatives: "not X, not Y", stacking negations for rhythm. State what
  the thing is.
- Negative parallelism: "X rather than Y" as a rhythmic device. Just say X.
- Rule-of-three padding: "faster, cleaner, and more maintainable". Keep only the
  items that carry weight.
- Rhetorical question then answer: "The problem? Scale." State the point.
- Encompassing opener: "Whether you are new or experienced, ...". Cut the framing.
- Inspirational pivot: "at its core, this is about", "it's about humanity". Stay
  concrete.
- Colon drama: "delivers where it counts: visibility". Rewrite as one statement.
- Trailing purpose clause: ending a sentence with ", to help your team stay
  agile". Cut the vague rationale or make it specific.

**Transitions and openers:**

- Mechanical transitions as sentence openers: "Furthermore", "Moreover",
  "Additionally", "However", "Interestingly". Start with the subject.
- Throat-clearing: "It's important to note that", "It's worth mentioning".
- Scene-setting intros: "In today's fast-paced world", "In the ever-evolving
  landscape".
- "Let's dive in", "dive deep", "navigate the complexities of".
- Fake-empathy hooks: "Picture this", "Imagine that", "As a developer, you know".
- Assistant tics: "Great question", "Absolutely", "I'd be happy to help".

**Closings:**

- Section-ending restatements: "In summary", "To sum up", "In conclusion", "In
  essence", "At the end of the day", "Ultimately". End on the last real point.

**Attribution:**

- Vague attribution: "studies show", "experts say", "research suggests", "industry
  reports" without a real, checkable source. Cite the specific source or cut the
  claim. Never attribute a quote you cannot verify.

**Sentence construction:**

- Copula avoidance: "serves as", "stands as", "marks a", "represents a shift"
  where "is" is correct. Use "is".
- Superficial -ing clauses: "highlighting the significance", "underscoring the
  importance". Say what actually happens.
- "Despite its X, it faces challenges" formula. State the specific limitation.
- Hedge stacking: "may potentially possibly". Pick one or none.
- Monotonous rhythm: many sentences of the same length. Vary sentence length.

**Formatting:**

- Em-dash-per-sentence rhythm. Covered by the formatting ban, and it is a tell.
- Curly quotes and apostrophes. Use straight quotes.
- Bold for emphasis in running prose. Bold is for key terms on first mention only.
- Inline-header list rows: "- **Term:** description" as a listicle. Prefer prose
  or a table.

## Structure for concept and workflow articles

Follow the skeleton the existing docs use.

```markdown
---
sidebar_position: N
---

import DefinitionCard from '...'

# What is X?

_One-line italicized description, direct and precise._

Opening paragraph, 2 to 3 sentences. No lists here.

## Introduction
## Understanding the Concept
## Applying It in Practice
## Engineering Considerations
## Scaling & Operational Considerations
## Next Steps
```

- H2 only. Keep the structure flat, no H3 or H4.
- Introduce each key term with a `<DefinitionCard term=... definition=... />` and
  bold the term on first mention in prose.
- Use `<ThemeAwareImage src=... alt=... />` for diagrams.
- Use tables for side-by-side comparisons and dense reference data.
- Mark version-specific features with the admonition:
  `:::tip Added in v1.8.0` ... `:::`.
- `## Next Steps` is a short list of links to sibling docs.

## Revision and de-slop pass

Run this against any draft before you return it.

1. Run the checker script (below). Fix every hard ban, buzzword, and AI tell it
   reports, and pull long sentences apart.
2. Check paragraph length. Anything over 4 sentences gets split.
3. Check every claim is declarative, not hedged.
4. Remove any sentence that restates a point already made.
5. Verify against the three criteria from
   `web/learn/workflows/ai/ai-documentation-writing.md`: technical accuracy (every
   claim checks out against the source), reader appropriateness (the intended
   reader understands it at first read), and task completeness (a reader can act
   on it using only this text).

## Readability checker script

`scripts/readability.py` is a dependency-free checker. Run it on any draft:

```bash
python3 .claude/skills/writing/scripts/readability.py path/to/doc.mdx
# --strict exits non-zero on a hard fail (em dash, semicolon, ALL CAPS,
# Tier 1 word, or em-dash rate over 3 per 500 words). Use in a hook or CI.
```

It masks frontmatter, code, and JSX (preserving line numbers), then reports:

- **Flesch Reading Ease** and Flesch-Kincaid grade. Aim for reading ease of 50 or
  higher and grade 12 or lower. Lower reading ease means the prose is too dense:
  shorten sentences and prefer shorter words.
- **Sentence-length variation** (coefficient of variation). A low value means a
  monotonous rhythm. Vary sentence length.
- **Em-dash rate** and **tell density**, both per 500 words, as at-a-glance
  scores.
- Every **hard ban** hit (em dash, semicolon, ALL CAPS) with line numbers.
- **Tier 1 vocabulary** (fix) and **Tier 2 vocabulary** (review) separately.
- Every **AI tell**: rhetorical framing, mechanical transitions, vague
  attribution, copula avoidance, and the rest of the banlist.
- **Curly quotes**, **trailing purpose clauses**, **inline-header list rows**,
  possibly-excessive **bold spans**, **Title Case headings**, and **long
  sentences** over 30 words.

A clean draft reports no hard fails, no AI tells, and a Flesch Reading Ease at or
above 50. Tier 2 words and Title Case headings are review-only signals: the house
concept-doc headings are intentionally title case, so that flag is informational.

The banlists draw on published catalogues of AI writing tells: oliviacal.com, the
Forbes "Seven Tells of AI Writing", Wikipedia:Signs_of_AI_writing,
github.com/kdgbalmer/ai-tells, and dragonflyeditorial.com.
