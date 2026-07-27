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

const VARIANTS = [
	"default",
	"destructive",
	"outline",
	"secondary",
	"ghost",
	"link",
] as const;

const SIZES = ["xs", "sm", "default", "lg"] as const;

export const Default: Story = {
	parameters: {
		// This story is a fixed kitchen-sink grid, not something the controls
		// panel should drive with the shared `args` above.
		controls: { disable: true },
	},
	render: () => (
		<div className="flex flex-col gap-6">
			{VARIANTS.map((variant) => (
				<div className="flex items-center gap-3" key={variant}>
					<span className="w-20 shrink-0 text-sm text-muted-foreground">
						{variant}
					</span>
					{SIZES.map((size) => (
						<Button key={size} size={size} variant={variant}>
							Button
						</Button>
					))}
					<Button disabled size="default" variant={variant}>
						Disabled
					</Button>
				</div>
			))}
		</div>
	),
};

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
