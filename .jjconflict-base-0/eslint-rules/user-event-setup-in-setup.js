const SETUP_BLOCKS = new Set(["beforeAll", "beforeEach"]);
const TEST_BLOCKS = new Set(["it", "test"]);

function getRootCalleeName(callee) {
  if (callee.type === "Identifier") {
    return callee.name;
  }

  if (callee.type === "MemberExpression" && !callee.computed) {
    return getRootCalleeName(callee.object);
  }

  return null;
}

function isUserEventSetupCall(node) {
  if (node.type !== "CallExpression") {
    return false;
  }

  if (node.callee.type !== "MemberExpression" || node.callee.computed) {
  return false;s;
  }

  return (
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "userEvent" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "setup"
  );
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require `const user = userEvent.setup()` to be created in setup hooks, not inside test blocks",
      recommended: false,
    },
    schema: [],
    messages: {
      setupInTestBlock:
        "Move `const user = userEvent.setup()` to a setup hook (`beforeEach` or `beforeAll`), not inside `test`/`it`.",
      setupOutsideSetupBlock:
        "Declare `const user = userEvent.setup()` inside a setup hook (`beforeEach` or `beforeAll`).",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      VariableDeclarator(node) {
        if (
          node.id.type !== "Identifier" ||
          node.id.name !== "user" ||
          !node.init ||
          !isUserEventSetupCall(node.init)
        ) {
          return;
        }

        if (
          !node.parent ||
          node.parent.type !== "VariableDeclaration" ||
          node.parent.kind !== "const"
        ) {
          return;
        }

        let isInsideSetupBlock = false;
        let isInsideTestBlock = false;

        const ancestors = sourceCode.getAncestors(node);
        for (const ancestor of ancestors) {
          const isCallbackFunction =
            ancestor.type === "ArrowFunctionExpression" ||
            ancestor.type === "FunctionExpression";

          if (!isCallbackFunction || !ancestor.parent) {
            continue;
          }

          if (ancestor.parent.type !== "CallExpression") {
            continue;
          }

          if (!ancestor.parent.arguments.includes(ancestor)) {
            continue;
          }

          const rootCalleeName = getRootCalleeName(ancestor.parent.callee);
          if (!rootCalleeName) {
            continue;
          }

          if (SETUP_BLOCKS.has(rootCalleeName)) {
            isInsideSetupBlock = true;
          }

          if (TEST_BLOCKS.has(rootCalleeName)) {
            isInsideTestBlock = true;
          }
        }

        if (isInsideTestBlock) {
          context.report({
            node,
            messageId: "setupInTestBlock",
          });
          return;
        }

        if (!isInsideSetupBlock) {
          context.report({
            node,
            messageId: "setupOutsideSetupBlock",
          });
        }
      },
    };
  },
};
