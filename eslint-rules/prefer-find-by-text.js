export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer `await screen.findByText(...)` over `expect(screen.getByText(...)).toBeInTheDocument()`",
      recommended: false,
    },
    schema: [],
    messages: {
      preferFindByText:
        "Prefer `await screen.findByText(...)` instead of `expect(screen.getByText(...)).toBeInTheDocument()`.",
    },
  },
  create(context) {
    function isScreenGetByTextCall(node) {
      if (node.type !== "CallExpression") {
        return false;
      }

      if (node.callee.type !== "MemberExpression" || node.callee.computed) {
        return false;
      }

      return (
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "screen" &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "getByText"
      );
    }

    function isExpectScreenGetByTextCall(node) {
      if (node.type !== "CallExpression") {
        return false;
      }

      if (node.callee.type !== "Identifier" || node.callee.name !== "expect") {
        return false;
      }

      if (node.arguments.length !== 1) {
        return false;
      }

      return isScreenGetByTextCall(node.arguments[0]);
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression" || node.callee.computed) {
          return;
        }

        if (
          node.callee.property.type !== "Identifier" ||
          node.callee.property.name !== "toBeInTheDocument"
        ) {
          return;
        }

        if (node.arguments.length !== 0) {
          return;
        }

        const matcherTarget = node.callee.object;
        if (
          matcherTarget.type !== "CallExpression" ||
          !isExpectScreenGetByTextCall(matcherTarget)
        ) {
          return;
        }

        context.report({
          node,
          messageId: "preferFindByText",
        });
      },
    };
  },
};
