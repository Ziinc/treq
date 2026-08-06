---
name: writing
description: >-
  Write or revise docs and articles in the treq house voice: direct, declarative
  prose that explains to a peer engineer, grounded in Orwell's rules for plain
  English and ASD-STE100 (Simplified Technical English), with no buzzwords, no
  marketing language, and none of the common AI-generated writing tells (em
  dashes, "not just X but Y", rule-of-three padding, "it's important to note").
  Precise software terminology stays in, vague jargon does not. Use when
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
because it is hyped. Trust the reader to keep up. The underlying discipline
comes from Orwell's rules and ASD-STE100. Cut every word that does not carry
weight. Make each sentence mean only one thing. The next section covers both,
plus where software terminology is exempt.

## Foundational principles: Orwell's rules and ASD-STE100

This voice is built on two sources: George Orwell's rules for clear prose, and
ASD-STE100 (Simplified Technical English), the standard aircraft-maintenance
writers use so a technical sentence cannot be misread. treq docs are lower
stakes than a maintenance manual, but the same discipline makes a doc easier to
skim and harder to misread. Apply both to every draft.

### Orwell's six rules

From "Politics and the English Language" (1946).

1. Never use a metaphor, simile, or figure of speech you have seen in print
   before. If you cannot invent your own for the point you are making, cut it.
2. Never use a long word where a short one does the job. "Use" beats
   "utilize". "Start" beats "initiate".
3. If a word can come out, take it out. Every adjective and adverb has to earn
   its place in the sentence.
4. Never use the passive where you can use the active. "The service dispatches
   the alert", not "the alert is dispatched by the service".
5. Never use a foreign phrase, a scientific word, or jargon if an everyday
   English word says the same thing. This bends for software: a precise
   technical term is not jargon if it is the correct name for the thing. See
   "Where software terms fit" below.
6. Break any of these rules before you write something barbarous. Clarity
   wins over the rule.

### ASD-STE100 (Simplified Technical English)

Adapted here for prose docs, not the full aerospace dictionary standard.

- One idea, one sentence. If a sentence carries two instructions or two claims
  joined by "and", split it.
- Keep sentences short. 20 words is the target, 30 is the ceiling the
  readability checker flags. Longer sentences hide more than one claim.
- Give each concept one name and reuse it through the doc. Do not vary between
  "repository", "repo", and "codebase" for the same referent. Pick the term the
  rest of the site uses and keep it.
- Avoid stacking more than three nouns in a row: "user authentication token
  refresh logic" forces the reader to unpack it backward. Rewrite with a
  preposition: "the logic that refreshes the token after user authentication".
- Prefer a plain verb over an -ing noun form when describing an action: "to
  configure the workspace", not "workspace configuration", when you mean the
  act of doing it.
- Write a sequence of steps as a numbered list, one action per line, not as a
  prose paragraph describing what happens in order.

### Where software terms fit

Neither source means strip out real technical vocabulary. ASD-STE100 restricts
general vocabulary to keep prose unambiguous, and Orwell's rule 5 targets
jargon, but a correct, precise software term is never the problem it is
guarding against. Use `commit`, `rebase`, `workspace`, `endpoint`, `NAPI`,
`IPC` exactly and consistently, the same way a maintenance manual keeps
"hydraulic actuator" instead of paraphrasing it into something vaguer. The
target is marketing jargon and invented abstraction ("synergistic tooling
layer", "solutioning"), not domain precision. If the reader needs the term to
do the task, keep it, use the correct one, and define it once on first
mention.

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
- If a word can come out without changing the meaning, take it out.
- Sentences aim for 20 words, 30 is the ceiling. Split anything longer.
- One name per concept, used consistently. Do not alternate synonyms for the
  same referent in one doc. Keep precise software terms; drop vague jargon.
  See "Foundational principles" above.
- No hedging or qualifiers: "quite", "fairly", "relatively", "somewhat".
- No apologetic openers: "it should be noted that", "it is worth mentioning".
- Paragraphs 3 to 4 sentences. Longer means break it up or use a list.
- Headings organize the doc. Do not use prose to transition between sections.
- Do not end a paragraph with a sentence shorter than three words. Fragments like
  "Coordinate those operations." or "Isolation is the fix." read as abrupt
  commands, not natural prose. Fold the point into the previous sentence or
  expand it.

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
| contention | name the concrete collision: shared files, same checkout, or competing writers |

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

## Interlinking across the content site

Treat every article as a node in the site, not a standalone page. Readers
land on one doc from search and decide whether to keep reading the site from
whether it points them somewhere else useful. Search engines read the same
signal: an article whose key terms link to the other articles that cover them
is what makes the site's internal link graph work for SEO. An article with no
outbound links and no inbound links is dead weight in that graph, regardless
of how good the prose is.

### Where links go

**Inline, in prose, at first meaningful mention.** When you name a concept,
tool, or workflow that has its own article elsewhere on the site, link it the
first time it appears in the body, not every time it recurs.

> Use [separate clones](./git-worktrees-vs-clones) when tasks need
> independent refs, remotes, or repository configuration.

This is a real sentence doing real work. The link is not bolted on. Do not
add a second link to the same target later in the same doc, and do not
interrupt a sentence's flow just to fit a link in: if no natural mention
exists, wait for the `## Next Steps` list instead of forcing one.

**`## Next Steps` (or `## Related`) at the end.** A short list, 3 to 5 items,
each a link plus a one-clause description of what the reader gets:

```markdown
## Next Steps

- [What are Stacked PRs?](./stacked-prs): manage branches that depend on one another
- [Stacked PR Workflow](/learn/workflows/git/stacked-pr): apply rebasing to a pull-request stack
```

This section is a map, not a repeat of the body. Do not just relist links
already made in prose, add the adjacent articles a reader would want next.

### Link syntax

- Same directory or a near sibling: relative, no extension:
  `[text](./git-worktrees-vs-clones)`.
- Anywhere else on the site: absolute from the content root, no extension:
  `[text](/learn/concepts/git/git-worktrees)`, `[text](/docs/concepts/workspaces)`.
- Never link a bare URL or write "click here". The anchor text is the term or
  phrase itself, exactly as it reads in the sentence.
- Verify the target actually exists (check the file under `web/learn/` or
  `web/docs/`, or run the audit-interlinking skill's checker) before writing
  the path. A guessed path that is close but wrong is a broken link.

### What earns a link

Link a term the first time you use it if, and only if, another article on the
site is the definitive treatment of that term. Do not link:

- A word that merely resembles another doc's title in a different sense.
- Your own doc's own subject (do not link a concept article to itself).
- A tangential mention that is not what the sentence is actually about.

Every new or revised article should end up with at least 2 to 3 in-body links
to genuinely relevant existing articles, plus a `## Next Steps` list. If you
cannot find that many relevant targets honestly, write fewer rather than
padding with weak matches. A forced link reads exactly like the AI tells this
skill already bans: decoration instead of information.

### Auditing across the whole site

For a bulk check across many articles (broken links, orphaned pages, articles
that are under-linked, or finding where an article's key terms should link
out) use the `audit-interlinking` skill. It runs a link-graph checker and
turns the results into a worklist you still verify by reading, since keyword
matches are candidates, not verdicts.

## Revision and de-slop pass

Run this against any draft before you return it.

1. Run the checker script (below). Fix every hard ban, buzzword, and AI tell it
   reports, and pull long sentences apart.
2. Check paragraph length. Anything over 4 sentences gets split.
3. Check every claim is declarative, not hedged.
4. Apply Orwell's rules and ASD-STE100: one claim per sentence, active voice,
   no word that can be cut, one name per concept reused consistently, no noun
   stacks over three deep. Keep precise software terms, drop paraphrased
   jargon. See "Foundational principles" above.
5. Remove any sentence that restates a point already made.
6. Verify against the three criteria from
   `web/learn/workflows/ai/ai-documentation-writing.md`: technical accuracy (every
   claim checks out against the source), reader appropriateness (the intended
   reader understands it at first read), and task completeness (a reader can act
   on it using only this text).
7. Check interlinking: at least 2 to 3 in-body links to genuinely relevant
   existing articles, a `## Next Steps` list, and every link target verified
   to exist. See the Interlinking section above.

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
  possibly-excessive **bold spans**, **Title Case headings**, **long
  sentences** over 30 words, and **short paragraph endings** under 3 words.

A clean draft reports no hard fails, no AI tells, and a Flesch Reading Ease at or
above 50. Tier 2 words and Title Case headings are review-only signals: the house
concept-doc headings are intentionally title case, so that flag is informational.

The banlists draw on published catalogues of AI writing tells: oliviacal.com, the
Forbes "Seven Tells of AI Writing", Wikipedia:Signs_of_AI_writing,
github.com/kdgbalmer/ai-tells, and dragonflyeditorial.com. The voice model itself
draws on Orwell's "Politics and the English Language" (1946) and ASD-STE100,
the Simplified Technical English standard maintained by ASD (AeroSpace and
Defence Industries Association of Europe).
