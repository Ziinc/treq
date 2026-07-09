export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow inline comments that span more than two lines",
      recommended: false,
    },
    schema: [],
    messages: {
      noLongInlineComment:
        "Inline comments longer than 2 lines are not allowed. Move it above the code or shorten it.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function getLineText(lineNumber) {
      return sourceCode.lines[lineNumber - 1] ?? "";
    }

    function hasCodeBeforeComment(comment) {
      const startLine = getLineText(comment.loc.start.line);
      return startLine.slice(0, comment.loc.start.column).trim().length > 0;
    }

    function hasCodeAfterComment(comment) {
      const endLine = getLineText(comment.loc.end.line);
      return endLine.slice(comment.loc.end.column).trim().length > 0;
    }

    function isAllowedDirectiveComment(commentText) {
      const trimmed = commentText.trim();
      return (
        trimmed.startsWith("eslint-") ||
        trimmed.startsWith("eslint ") ||
        trimmed.startsWith("@ts-ignore") ||
        trimmed.startsWith("@ts-expect-error")
      );
    }

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (isAllowedDirectiveComment(comment.value)) {
            continue;
          }

          const isInline =
            hasCodeBeforeComment(comment) || hasCodeAfterComment(comment);
          const lineCount = comment.loc.end.line - comment.loc.start.line + 1;

          if (isInline && lineCount > 2) {
            context.report({
              loc: comment.loc,
              messageId: "noLongInlineComment",
            });
          }
        }
      },
    };
  },
};
