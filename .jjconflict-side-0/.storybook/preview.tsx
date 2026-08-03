import type { Decorator, Preview } from "@storybook/react-vite";
import React, { useEffect } from "react";

import "../src/index.css";

const withTheme: Decorator = (Story, context) => {
	const theme = context.globals.theme ?? "light";

	useEffect(() => {
		document.documentElement.classList.toggle("dark", theme === "dark");
	}, [theme]);

	return <Story />;
};

const preview: Preview = {
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		backgrounds: {
			options: {
				light: { name: "light", value: "#ffffff" },
				dark: { name: "dark", value: "#0f0f10" },
			},
		},
		a11y: {
			// 'todo' - show a11y violations in the test UI only
			// 'error' - fail CI on a11y violations
			// 'off' - skip a11y checks entirely
			test: "todo",
		},
	},
	globalTypes: {
		theme: {
			description: "Light/dark theme, matches treq's `.dark` class toggle",
			toolbar: {
				title: "Theme",
				icon: "circlehollow",
				items: [
					{ value: "light", icon: "sun", title: "Light" },
					{ value: "dark", icon: "moon", title: "Dark" },
				],
				dynamicTitle: true,
			},
		},
	},
	initialGlobals: {
		theme: "light",
	},
	decorators: [withTheme],
};

export default preview;
