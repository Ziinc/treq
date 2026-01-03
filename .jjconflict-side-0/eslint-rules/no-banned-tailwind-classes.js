/**
 * ESLint rule to ban specific Tailwind CSS classes
 *
 * @example
 * // In eslint.config.js:
 * rules: {
 *   "local/no-banned-tailwind-classes": ["error", {
 *     bannedClasses: ["text-xs", "text-2xs"]
 *   }]
 * }
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow specific Tailwind CSS classes",
      category: "Stylistic Issues",
      recommended: false,
    },
    schema: [
      {
        type: "object",
        properties: {
          bannedClasses: {
            type: "array",
            items: { type: "string" },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      bannedClass: 'Tailwind class "{{className}}" is banned. Consider using a different size class.',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const bannedClasses = new Set(options.bannedClasses || []);

    if (bannedClasses.size === 0) {
      // No banned classes configured, skip processing
      return {};
    }

    /**
     * Extract class names from a string
     */
    function extractClassNames(str) {
      return str.split(/\s+/).filter(Boolean);
    }

    /**
     * Check if any class in the string is banned and report
     */
    function checkClasses(node, classString) {
      const classes = extractClassNames(classString);
      for (const className of classes) {
        if (bannedClasses.has(className)) {
          context.report({
            node,
            messageId: "bannedClass",
            data: { className },
          });
        }
      }
    }

    /**
     * Recursively extract class strings from various node types
     */
    function extractFromNode(node) {
      if (!node) return;

      // String literal: "text-xs"
      if (node.type === "Literal" && typeof node.value === "string") {
        checkClasses(node, node.value);
      }

      // Template literal: `text-xs ${var}`
      else if (node.type === "TemplateLiteral") {
        for (const quasi of node.quasis) {
          checkClasses(quasi, quasi.value.raw);
        }
      }

      // JSX expression: className={"text-xs"}
      else if (node.type === "JSXExpressionContainer") {
        extractFromNode(node.expression);
      }

      // Call expression: cn("text-xs", ...) or clsx("text-xs", ...)
      else if (node.type === "CallExpression") {
        const calleeName =
          node.callee.type === "Identifier" ? node.callee.name : null;

        // Only process cn() and clsx() calls
        if (calleeName === "cn" || calleeName === "clsx") {
          for (const arg of node.arguments) {
            extractFromNode(arg);
          }
        }
      }

      // Ternary expression: condition ? "text-xs" : "text-sm"
      else if (node.type === "ConditionalExpression") {
        extractFromNode(node.consequent);
        extractFromNode(node.alternate);
      }

      // Logical expression: condition && "text-xs"
      else if (node.type === "LogicalExpression") {
        extractFromNode(node.left);
        extractFromNode(node.right);
      }

      // Array expression: ["text-xs", condition && "other"]
      else if (node.type === "ArrayExpression") {
        for (const element of node.elements) {
          if (element) {
            extractFromNode(element);
          }
        }
      }

      // Object expression (for conditional classes): { "text-xs": true }
      else if (node.type === "ObjectExpression") {
        for (const prop of node.properties) {
          if (prop.type === "Property" && prop.key.type === "Literal") {
            const keyValue = prop.key.value;
            if (typeof keyValue === "string") {
              checkClasses(prop.key, keyValue);
            }
          }
        }
      }
    }

    return {
      JSXAttribute(node) {
        // Only check className attributes
        if (node.name.name !== "className") {
          return;
        }

        extractFromNode(node.value);
      },
    };
  },
};
