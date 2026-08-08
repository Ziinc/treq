export default {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Prefer screen.clickByText/clickByRole over clicking screen.getAllBy...[0]",
			recommended: false,
		},
		schema: [],
		messages: {
			preferClickByText:
				"Use `screen.clickByText(...)` instead of clicking `screen.getAllByText(...)[0]`.",
			preferClickByRole:
				"Use `screen.clickByRole(...)` instead of clicking `screen.getAllByRole(...)[0]`.",
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				// Check outer call is *.click(...)
				if (
					node.callee.type !== "MemberExpression" ||
					node.callee.property.type !== "Identifier" ||
					node.callee.property.name !== "click"
				) {
					return;
				}

				// Caller must be `user` or `fireEvent`
				const caller = node.callee.object;
				if (
					caller.type !== "Identifier" ||
					(caller.name !== "user" && caller.name !== "fireEvent")
				) {
					return;
				}

				// Must have exactly one argument
				if (node.arguments.length !== 1) {
					return;
				}

				const [arg] = node.arguments;

				// Argument must be MemberExpression with computed index [0]
				if (
					arg.type !== "MemberExpression" ||
					!arg.computed ||
					arg.property.type !== "Literal" ||
					arg.property.value !== 0
				) {
					return;
				}

				// The object must be screen.getAllByText(...) or screen.getAllByRole(...)
				const innerCall = arg.object;
				if (
					innerCall.type !== "CallExpression" ||
					innerCall.callee.type !== "MemberExpression" ||
					innerCall.callee.object.type !== "Identifier" ||
					innerCall.callee.object.name !== "screen" ||
					innerCall.callee.property.type !== "Identifier"
				) {
					return;
				}

				const queryName = innerCall.callee.property.name;
				if (queryName === "getAllByText") {
					context.report({ node, messageId: "preferClickByText" });
				} else if (queryName === "getAllByRole") {
					context.report({ node, messageId: "preferClickByRole" });
				}
			},
		};
	},
};
