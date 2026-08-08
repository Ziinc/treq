export default {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow class-based DOM selectors in querySelector, querySelectorAll, and closest calls",
			recommended: false,
		},
		schema: [],
		messages: {
			noLucideClass:
				"Avoid selecting by Lucide class `.lucide-*`. Use `data-testid` or accessible queries instead.",
			noClassAttribute:
				"Avoid `[class*=...]` selectors. Use `data-testid` or accessible queries instead.",
			noClassSelector:
				"Avoid selecting by CSS class. Use `data-testid` or accessible queries instead.",
		},
	},
	create(context) {
		const SELECTOR_METHODS = new Set([
			"querySelector",
			"querySelectorAll",
			"closest",
		]);

		return {
			CallExpression(node) {
				if (
					node.callee.type !== "MemberExpression" ||
					node.callee.property.type !== "Identifier" ||
					!SELECTOR_METHODS.has(node.callee.property.name)
				) {
					return;
				}

				if (node.arguments.length === 0) {
					return;
				}

				const arg = node.arguments[0];
				if (arg.type !== "Literal" || typeof arg.value !== "string") {
					return;
				}

				const selector = arg.value;

				if (/\.lucide-/.test(selector)) {
					context.report({ node, messageId: "noLucideClass" });
					return;
				}

				if (/\[class[*^$~]=/.test(selector)) {
					context.report({ node, messageId: "noClassAttribute" });
					return;
				}

				// Match CSS class selectors: a dot followed by a letter or hyphen (class name),
				// but not inside attribute selectors like [data-foo="bar.baz"]
				// Strip attribute selectors first, then check for remaining dot-class patterns
				const withoutAttrs = selector.replace(/\[[^\]]*\]/g, "");
				if (/\.[a-zA-Z_-]/.test(withoutAttrs)) {
					context.report({ node, messageId: "noClassSelector" });
				}
			},
		};
	},
};
