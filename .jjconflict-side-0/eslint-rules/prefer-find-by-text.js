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
      preferFindByTextOverWaitFor:
        "Prefer `await screen.findByText(...)` instead of `await waitFor(() => { expect(screen.getByText(...)).toBeInTheDocument() })`.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function isWaitForCall(node) {
      return (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "waitFor"
      );
    }

    function findEnclosingWaitFor(toBeInDocNode) {
      const ancestors = sourceCode.getAncestors(toBeInDocNode);
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const ancestor = ancestors[i];
        const isCallback =
          ancestor.type === "ArrowFunctionExpression" ||
          ancestor.type === "FunctionExpression";
        if (!isCallback) continue;
        const parent = ancestor.parent;
        if (!parent || !isWaitForCall(parent)) continue;
        if (parent.arguments.includes(ancestor)) return parent;
      }
      return null;
    }

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

        const waitForNode = findEnclosingWaitFor(node);
        if (waitForNode) {
          context.report({
            node: waitForNode,
            messageId: "preferFindByTextOverWaitFor",
          });
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
