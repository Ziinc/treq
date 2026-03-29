export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow inline comments on lines containing code",
      recommended: false,
    },
    schema: [],
    messages: {
      noInlineComment:
        "Inline comments are not allowed in test files. Move this comment to its own line.",
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

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (hasCodeBeforeComment(comment) || hasCodeAfterComment(comment)) {
            context.report({
              loc: comment.loc,
              messageId: "noInlineComment",
            });
          }
        }
      },
    };
  },
};
