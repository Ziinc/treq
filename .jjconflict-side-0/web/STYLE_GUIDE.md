# Writing Style Guidelines

 
## Voice
 
- Direct and precise. Say what you mean. Stop.
- No em dashes. Use periods or commas instead.
- No filler words. No hedging. No "essentially", "basically", "in order to".
- Do not over-explain. Trust the reader to follow.
- Declarative sentences. Short. One idea per sentence where possible.
- Never do ALL CAPS. This is bad for readers.


## Writing Structure
 
- Headings do the heavy lifting. Use them to organize, not prose transitions.
- Use bullet points and numbered lists for discrete items, but only where it makes sense. Do not overuse.
- Use bold for key terms or labels inside lists. Not for emphasis in prose.
- Prefer tables when comparing options or listing attributes side by side.
- Diagrams and code blocks are encouraged for flows and architecture.


## Formatting
 
- No em dashes ( — ). Use periods, commas, or colons.
- No semicolons. Break into two sentences.
- Minimal use of parentheses. If the information matters, give it a full sentence.
- Code references use backticks: `alerts`, `type`, `sb-request-id`.
- Keep paragraphs to 3-4 sentences max. If longer, break it up or use a list.


## Tone
 
- Professional but not formal. Write like you are explaining to a peer senior engineer or principal software developer.
- No marketing language. No superlatives. No "powerful", "seamless", "elegant".
- Do not soften statements. "This option is not recommended." Not "This option may not be the best fit."


## Things to Avoid
 
- Restating the same point in different words across sections.
- Long introductory sentences before getting to the point.
- Passive voice when active is clearer. "The Webhook Service dispatches the alert." Not "The alert is dispatched by the Webhook Service."
- Unnecessary qualifiers: "quite", "fairly", "relatively", "somewhat".
- Apologetic language: "It should be noted that", "It is worth mentioning".
|

### Guides Structure

```markdown
---
sidebar_position: N
---

# Title

_One-line italicized description of what this page covers. State a concise summary, direct and precise_

Opening paragraph explaining the concept in 2-3 sentences. No bullet lists here.

## Section Header

Paragraph explaining this topic. Use **bold** for key terms inline rather than as list items. Continue with more sentences that flow naturally.
Interlink to key [concepts](/guides/concepts.md) where relevant


```


### Reference Structure

```markdown
---
sidebar_position: N
---

# Title

_One-line italicized description of what this page covers. State a concise summary, direct and precise_

Opening paragraph explaining the concept in 2-3 sentences. No bullet lists here. 

Multiple paragraphs here is ok. Ensure that user has a good overview of what is going to be covered and goals of this page. 

## Section Header

Paragraph explaining this topic. Use **bold** for key terms inline rather than as list items. Continue with more sentences that flow naturally.
Interlink to key [concepts](/guides/concepts.md) where relevant

Use tables for information-dense displays

| Element                 | Usage                                           | Style Example         | Notes                                 |
|-------------------------|------------------------------------------------|-----------------------|---------------------------------------|
| Headings (`#`)          | Main title (1 per page), sections (H2 only)    | `#`, `##`             | Avoid H3/H4, keep structure flat      |
| Paragraphs              | Explanation, descriptions                      | Just plain text       | Prefer prose over bulleted lists      |
| Inline bold (`**term**`)| Highlight key terms or commands                | `**commit**`          | Use sparingly, not as headers         |
| Inline code (\`code\`)  | Command names, file paths, short code          | `` `jj log` ``        | Only for things users will type/see   |
| Code block (```)        | Shell commands or copy-paste instructions      | ```shell ...```       | Only real commands, not reference     |
| Links                   | Interlink concepts, API references             | `[concepts](/guides/concepts.md)` | Use for navigation/context   |
| Blockquotes (`>`)       | Emphasize notes, caveats (rarely used)         | `> Important: ...`    | Do not overuse                        |


## Feature ABC

Let users know that specific features were added in specific versions. 

:::tip Added in v1.8.0

This feature was introduced in **v1.8.0**. Refer to the [release notes](https://github.com/link-to-treq-release-version) for more details.

:::



## Learn More

- [More information](/references/information.md)
- [More information](/references/information.md)


```
