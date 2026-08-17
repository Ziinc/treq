import { describe, expect, it } from "vitest";
import {
  clampNormalizedRect,
  formatSendAssetReviewPrompt,
  hasUnsentSendAssetReview,
  rectFromDrag,
} from "./sendAssetReview";

describe("sendAssetReview", () => {
  it("formats a general comment for the current asset", () => {
    expect(
      formatSendAssetReviewPrompt({
        title: "note.txt",
        path: "/tmp/note.txt",
        mediaType: "text",
        generalComment: "Please tighten this copy",
      }),
    ).toBe(
      "Review of note.txt\n\nFile: /tmp/note.txt\n\nPlease tighten this copy\n",
    );
  });

  it("includes highlight comments and annotated image path", () => {
    const prompt = formatSendAssetReviewPrompt({
      title: "shot.png",
      path: "/tmp/shot.png",
      mediaType: "image",
      generalComment: "Header is too loud",
      annotatedImagePath: "/tmp/.treq/send/shot-review.png",
      highlights: [
        {
          id: "h1",
          rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.15 },
          comment: "Move this button",
        },
      ],
    });
    expect(prompt).toContain(
      "Annotated image with highlighted regions: /tmp/.treq/send/shot-review.png",
    );
    expect(prompt).toContain("1. Region 10%,20% 30%×15%: Move this button");
    expect(prompt).toContain("Header is too loud");
  });

  it("formats inline line comments like a code review", () => {
    const prompt = formatSendAssetReviewPrompt({
      title: "note.txt",
      path: "/tmp/note.txt",
      mediaType: "text",
      generalComment: "",
      lineComments: [
        {
          id: "c1",
          startLine: 2,
          endLine: 3,
          lineContent: ["beta", "gamma"],
          text: "Rename these",
        },
      ],
    });
    expect(prompt).toContain("note.txt:2:3");
    expect(prompt).toContain("```\nbeta\ngamma\n```");
    expect(prompt).toContain("> Rename these");
  });

  it("reports unsent review state", () => {
    expect(
      hasUnsentSendAssetReview({
        generalComment: "",
        highlights: [],
        lineComments: [],
      }),
    ).toBe(false);
    expect(
      hasUnsentSendAssetReview({
        generalComment: "hi",
        highlights: [],
        lineComments: [],
      }),
    ).toBe(true);
    expect(
      hasUnsentSendAssetReview({
        generalComment: "",
        highlights: [
          {
            id: "h1",
            rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            comment: "",
          },
        ],
        lineComments: [],
      }),
    ).toBe(true);
  });

  it("builds a normalized rect from a drag", () => {
    expect(
      rectFromDrag(
        { x: 80, y: 60 },
        { x: 20, y: 20 },
        { width: 100, height: 100 },
      ),
    ).toEqual({ x: 0.2, y: 0.2, width: 0.6, height: 0.4 });
    expect(
      clampNormalizedRect({ x: -0.2, y: 0.9, width: 2, height: 0.5 }),
    ).toEqual({ x: 0, y: 0.9, width: 1, height: 0.1 });
  });
});
