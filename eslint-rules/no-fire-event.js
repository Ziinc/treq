const TESTING_LIBRARY_SOURCES = new Set([
  "@testing-library/react",
  "@testing-library/dom",
  "./test-utils",
  "../test-utils",
]);

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow fireEvent and recommend userEvent interactions instead",
      recommended: false,
    },
    schema: [],
    messages: {
      noFireEvent:
        "Avoid fireEvent. Prefer userEvent with `const user = userEvent.setup()` and interactions like `await user.click(element)`.",
    },
  },
  create(context) {
    const testingLibraryNamespaces = new Set();

    return {
      ImportDeclaration(node) {
        const isTestingLibrarySource = TESTING_LIBRARY_SOURCES.has(node.source.value);
        if (!isTestingLibrarySource) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.type === "Identifier" &&
            specifier.imported.name === "fireEvent"
          ) {
            context.report({
              node: specifier,
              messageId: "noFireEvent",
            });
          }

          if (specifier.type === "ImportNamespaceSpecifier") {
            testingLibraryNamespaces.add(specifier.local.name);
          }
        }
      },
      MemberExpression(node) {
        if (node.computed) {
          return;
        }

        if (
          node.object.type === "Identifier" &&
          testingLibraryNamespaces.has(node.object.name) &&
          node.property.type === "Identifier" &&
          node.property.name === "fireEvent"
        ) {
          context.report({
            node: node.property,
            messageId: "noFireEvent",
          });
        }
      },
    };
  },
};
