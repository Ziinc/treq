import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";

const meta = {
	title: "ui/Button",
	component: Button,
	tags: ["autodocs"],
	argTypes: {
		variant: {
			control: "select",
			options: [
				"default",
				"destructive",
				"outline",
				"secondary",
				"ghost",
				"link",
			],
		},
		size: {
			control: "select",
			options: ["default", "sm", "lg", "xs", "icon", "icon-xs"],
		},
	},
	args: {
		children: "Button",
		variant: "default",
		size: "default",
		disabled: false,
	},
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = {
	args: { variant: "destructive" },
};

export const Outline: Story = {
	args: { variant: "outline" },
};

export const Secondary: Story = {
	args: { variant: "secondary" },
};

export const Ghost: Story = {
	args: { variant: "ghost" },
};

export const Link: Story = {
	args: { variant: "link" },
};

export const Disabled: Story = {
	args: { disabled: true },
};
