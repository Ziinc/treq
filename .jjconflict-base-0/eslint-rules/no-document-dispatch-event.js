export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow dispatchEvent in test files",
      recommended: false,
    },
    schema: [],
    messages: {
      noDispatchEvent:
        "Avoid using dispatchEvent in test files. Use Testing Library methods instead.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const filename = context.filename ?? context.getFilename();
        if (!filename.includes(".test.")) return;

        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        if (
          callee.property.type !== "Identifier" ||
          callee.property.name !== "dispatchEvent"
        )
          return;

        context.report({ node, messageId: "noDispatchEvent" });
      },
    };
  },
};
