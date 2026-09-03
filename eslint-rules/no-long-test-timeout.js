const TEST_CALLEE_NAMES = new Set(["it", "test", "describe"]);
const MAX_TIMEOUT_MS = 5000;

function isTestCallee(node) {
  if (node.type === "Identifier") {
    return TEST_CALLEE_NAMES.has(node.name);
  }
  if (node.type === "MemberExpression" && !node.computed) {
    return isTestCallee(node.object);
  }
  return false;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: `Disallow raising a test's timeout beyond ${MAX_TIMEOUT_MS}ms`,
      recommended: false,
    },
    schema: [],
    messages: {
      timeoutTooLong: `Test timeout of {{ timeout }}ms exceeds the ${MAX_TIMEOUT_MS}ms limit. Fix the underlying slowness instead of raising the timeout.`,
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isTestCallee(node.callee)) return;

        const timeoutArg = node.arguments[node.arguments.length - 1];
        if (!timeoutArg || timeoutArg.type !== "Literal") return;
        if (typeof timeoutArg.value !== "number") return;
        if (timeoutArg.value <= MAX_TIMEOUT_MS) return;

        context.report({
          node: timeoutArg,
          messageId: "timeoutTooLong",
          data: { timeout: timeoutArg.value },
        });
      },
    };
  },
};
