import { useState } from "react";
import { X, Sparkles, Star, GitBranch, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface GithubUser {
	login: string;
	name: string | null;
	bio: string | null;
	public_repos: number;
	followers: number;
	following: number;
	created_at: string;
	avatar_url: string;
	location: string | null;
}

interface GithubRepo {
	name: string;
	language: string | null;
	stargazers_count: number;
	fork: boolean;
	description: string | null;
}

interface HoroscopeData {
	user: GithubUser;
	repos: GithubRepo[];
}

const ZODIAC_BY_MONTH = [
	"Capricorn",
	"Aquarius",
	"Pisces",
	"Aries",
	"Taurus",
	"Gemini",
	"Cancer",
	"Leo",
	"Virgo",
	"Libra",
	"Scorpio",
	"Sagittarius",
];

const ZODIAC_EMOJIS: Record<string, string> = {
	Capricorn: "♑",
	Aquarius: "♒",
	Pisces: "♓",
	Aries: "♈",
	Taurus: "♉",
	Gemini: "♊",
	Cancer: "♋",
	Leo: "♌",
	Virgo: "♍",
	Libra: "♎",
	Scorpio: "♏",
	Sagittarius: "♐",
};

const LANGUAGE_READINGS: Record<
	string,
	{ trait: string; prophecy: string; emoji: string }
> = {
	JavaScript: {
		trait: "Chaotic Gemini",
		prophecy:
			"You live in the undefined — emotionally and literally. Your callback hell is a metaphor for your inner life. The stars say: npm install therapy.",
		emoji: "⚡",
	},
	TypeScript: {
		trait: "Anxious Capricorn",
		prophecy:
			"You cannot accept uncertainty. You have typed your feelings as `string | null` and honestly, same. The stars warn: stop adding `any` and start adding boundaries.",
		emoji: "📐",
	},
	Python: {
		trait: "Zen Virgo",
		prophecy:
			"You believe in readability and that there should be one — and preferably only one — obvious way to do things. Unfortunately this philosophy has not extended to your git history.",
		emoji: "🐍",
	},
	Rust: {
		trait: "Stubborn Scorpio",
		prophecy:
			"The borrow checker has rejected your code 47 times this week. You will not give up. This is either admirable or a cry for help. The compiler says: lifetime issues detected, both in code and in spirit.",
		emoji: "🦀",
	},
	Go: {
		trait: "Pragmatic Taurus",
		prophecy:
			"Simple. Concurrent. Slightly boring at parties but highly reliable. You have `err != nil` checked so many times that it has become your mantra. Inner peace achieved.",
		emoji: "🐹",
	},
	Java: {
		trait: "Corporate Virgo",
		prophecy:
			"You have written an AbstractBeanFactoryBuilderFactory and you are not sorry. Your spirit animal is a quarterly planning meeting. The stars foresee: another refactor.",
		emoji: "☕",
	},
	"C++": {
		trait: "Masochistic Aries",
		prophecy:
			"You manage memory manually and wear it as a badge of honor. Segfaults are your love language. The stars admire your pain tolerance and question your life choices.",
		emoji: "🔧",
	},
	C: {
		trait: "Ancient Capricorn",
		prophecy:
			"You are one with the machine. You have seen things. You allocate and you free. The universe respects you and is also slightly afraid of you.",
		emoji: "⚙️",
	},
	Ruby: {
		trait: "Romantic Pisces",
		prophecy:
			"Everything is an object, including your feelings. Your Gemfile has not been updated since 2019 and neither has your LinkedIn. The stars suggest: bundle update your life.",
		emoji: "💎",
	},
	PHP: {
		trait: "Resilient Taurus",
		prophecy:
			"You have survived the global `$_POST` era. You are still here. The internet runs on you whether it admits it or not. The stars say: you are more powerful than anyone gives you credit for.",
		emoji: "🐘",
	},
	Swift: {
		trait: "Polished Leo",
		prophecy:
			"Optional chaining has rewired how you think about commitment. You unwrap carefully. Sometimes too carefully. The simulator crashes but your confidence does not.",
		emoji: "🦅",
	},
	Kotlin: {
		trait: "Evolved Gemini",
		prophecy:
			"You left Java but Java never truly left you. You enjoy null safety and coroutines and explaining to people why Kotlin is better. The stars say: they know, they heard you the first time.",
		emoji: "🎯",
	},
	Shell: {
		trait: "Hermit Aquarius",
		prophecy:
			"You have automated everything except your social calendar. Your aliases are a window into your soul: cryptic, efficient, and impossible for others to understand without documentation.",
		emoji: "🐚",
	},
	CSS: {
		trait: "Artistic Libra",
		prophecy:
			"You control layout but your own life is `position: absolute` and overflowing its container. The `z-index` wars have hardened you. The stars predict: centering a div will bring you enlightenment.",
		emoji: "💅",
	},
	HTML: {
		trait: "Foundational Cancer",
		prophecy:
			"You are the bones of the web. Underappreciated. Essential. Everyone uses you but nobody puts you on their resume headline. The stars see your worth, even if Stack Overflow does not.",
		emoji: "🏗️",
	},
	Haskell: {
		trait: "Enlightened Aquarius",
		prophecy:
			"You have transcended imperative thinking and perhaps also human communication. You explain monads at dinner parties. The stars are impressed and also confused.",
		emoji: "λ",
	},
	Elixir: {
		trait: "Zen Sagittarius",
		prophecy:
			"Let it crash. Let it crash. Let it crash. Your supervisor trees are more organized than your apartment. Phoenix is not just a framework — it is your personal mythology.",
		emoji: "🔥",
	},
	Lua: {
		trait: "Mysterious Scorpio",
		prophecy:
			"You are embedded in things. Games, routers, Neovim configs. You work behind the scenes, making the whole thing go. Underestimated but inevitable.",
		emoji: "🌙",
	},
};

function getAccountAge(createdAt: string): number {
	const created = new Date(createdAt);
	const now = new Date();
	return (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 365);
}

function getZodiacSign(createdAt: string): string {
	const month = new Date(createdAt).getMonth();
	return ZODIAC_BY_MONTH[month];
}

function getTotalStars(repos: GithubRepo[]): number {
	return repos.reduce((sum, r) => sum + r.stargazers_count, 0);
}

function getPrimaryLanguage(repos: GithubRepo[]): string | null {
	const counts: Record<string, number> = {};
	for (const repo of repos) {
		if (repo.language && !repo.fork) {
			counts[repo.language] = (counts[repo.language] || 0) + 1;
		}
	}
	const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
	return sorted.length > 0 ? sorted[0][0] : null;
}

function generateHoroscope(data: HoroscopeData): {
	title: string;
	sign: string;
	signEmoji: string;
	trait: string;
	reading: string[];
	fortune: string;
	luckyLanguage: string;
	unluckyCommitMessage: string;
} {
	const { user, repos } = data;
	const age = getAccountAge(user.created_at);
	const totalStars = getTotalStars(repos);
	const primaryLang = getPrimaryLanguage(repos);
	const ownRepos = repos.filter((r) => !r.fork);
	const zodiacSign = getZodiacSign(user.created_at);
	const zodiacEmoji = ZODIAC_EMOJIS[zodiacSign];

	const langReading =
		primaryLang && LANGUAGE_READINGS[primaryLang]
			? LANGUAGE_READINGS[primaryLang]
			: {
					trait: "Polyglot Sagittarius",
					prophecy:
						"You dabble. You experiment. You have 12 half-finished projects in 8 different languages. The stars admire your curiosity and gently suggest picking one.",
					emoji: "🌐",
				};

	const paragraphs: string[] = [];

	// Language reading
	paragraphs.push(`${langReading.emoji} ${langReading.prophecy}`);

	// Repo count reading
	const repoCount = ownRepos.length;
	if (repoCount === 0) {
		paragraphs.push(
			"📦 You have zero original repositories. Either you are a mysterious lurker, a prolific fork-er, or you simply haven't started yet. The stars say: begin. The journey of a thousand commits starts with a single `git init`.",
		);
	} else if (repoCount <= 5) {
		paragraphs.push(
			`📦 With only ${repoCount} original repositories, you believe in quality over quantity. Or you just signed up. Either way, the stars sense potential — or at least a good README.md.`,
		);
	} else if (repoCount <= 20) {
		paragraphs.push(
			`📦 ${repoCount} repositories. Solid. Respectable. You are the kind of developer who finishes things sometimes. The stars commend your restraint.`,
		);
	} else if (repoCount <= 50) {
		paragraphs.push(
			`📦 ${repoCount} repositories, hm? You have more unfinished projects than a Netflix queue. The stars see you started a React app, a CLI tool, a Discord bot, and a "just testing something" repo that's still there from 2021.`,
		);
	} else {
		paragraphs.push(
			`📦 ${repoCount} repositories. You are physically incapable of stopping. Therapy might help. Or just another git init. The stars are both impressed and concerned.`,
		);
	}

	// Star count reading
	if (totalStars === 0) {
		paragraphs.push(
			"⭐ Zero stars. Your repos are intimate — just you and the void, coding in the dark. The stars appreciate your humility, or your privacy settings.",
		);
	} else if (totalStars < 10) {
		paragraphs.push(
			`⭐ ${totalStars} total stars — mostly from yourself at 2am, the stars suspect. Growth is coming. Probably after you tweet about your side project.`,
		);
	} else if (totalStars < 100) {
		paragraphs.push(
			`⭐ ${totalStars} stars! The algorithm has noticed you exist. You are no longer shouting into the void — the void is shouting back, politely.`,
		);
	} else if (totalStars < 1000) {
		paragraphs.push(
			`⭐ ${totalStars} stars. You are officially GitHub Famous (in a niche) and insufferable at dinner parties when someone mentions their side project. The stars applaud.`,
		);
	} else {
		paragraphs.push(
			`⭐ ${totalStars.toLocaleString()} stars. You are a GitHub celebrity. Do you sell a course? You should sell a course. The stars have aligned to suggest: sell a course.`,
		);
	}

	// Account age reading
	if (age < 1) {
		paragraphs.push(
			"🌱 Fresh blood. The GitHub cosmos is vast and you have just taken your first breath. The stars say: may your first `npm install` complete without errors.",
		);
	} else if (age < 3) {
		paragraphs.push(
			`🌱 ${Math.floor(age)} year${Math.floor(age) > 1 ? "s" : ""} on GitHub. You've seen things. Stack Overflow answers from 2019 that are now deprecated. You've grown. The stars see your journey.`,
		);
	} else if (age < 7) {
		paragraphs.push(
			`🌱 ${Math.floor(age)} years on GitHub. Veteran energy. You remember when everyone was excited about microservices. You know better now. The stars respect your scar tissue.`,
		);
	} else {
		paragraphs.push(
			`🌱 ${Math.floor(age)} years on GitHub. Ancient. Wise. You predate the dark mode toggle. You survived the left-pad incident. The stars bow to you, elder.`,
		);
	}

	// Follower-to-following ratio
	const ratio =
		user.following > 0 ? user.followers / user.following : user.followers;
	if (user.followers === 0 && user.following === 0) {
		paragraphs.push(
			"👥 No followers, following no one. A true lone wolf. Coding in isolation, communing only with the compiler. The stars salute your independence.",
		);
	} else if (ratio < 0.5) {
		paragraphs.push(
			`👥 You follow ${user.following} people but only ${user.followers} follow back. The stars detect a slight parasocial imbalance and suggest: post more.`,
		);
	} else if (ratio > 10 && user.followers > 100) {
		paragraphs.push(
			`👥 ${user.followers.toLocaleString()} followers, following ${user.following}. The stars see you are a person of influence. Please use this power responsibly and not to promote a bootcamp.`,
		);
	} else {
		paragraphs.push(
			`👥 ${user.followers} followers. A respectable constellation of admirers. The GitHub social graph suggests you are a positive force in the developer ecosystem, or at least a neutral one.`,
		);
	}

	// Lucky language: one that's NOT their primary
	const allLanguages = Object.keys(LANGUAGE_READINGS);
	const luckyLanguage =
		allLanguages.find((l) => l !== primaryLang) ?? "Assembly";

	// Unlucky commit message based on repo count
	const unluckyMessages = [
		'"fix"',
		'"WIP"',
		'"asdf"',
		'"final final v2"',
		'"ok now for real"',
		'"idk man"',
		'"please work"',
		'"it works on my machine"',
		'"oops"',
		'"TODO: write better commit message"',
	];
	const unluckyCommit =
		unluckyMessages[repoCount % unluckyMessages.length] ?? '"fix"';

	const fortunes = [
		`A refactor begins today. It will never end. Embrace it.`,
		`The bug you're chasing is a semicolon. It is always a semicolon.`,
		`Someone will open a GitHub issue titled "it doesn't work" with no reproduction steps. Stay strong.`,
		`A dependency update is coming. Fear it, then do it anyway.`,
		`Your next pull request will receive exactly one review comment: "nit: whitespace."`,
		`Today is a good day to write documentation. You won't, but it is a good day for it.`,
		`A rubber duck debugging session awaits you. The duck will be right, as always.`,
		`You will google "how to exit vim" today. The stars do not judge.`,
		`A test you thought was green will go red in CI and only in CI. Mercury is in retrograde.`,
		`Your localhost is about to conflict with something else on port 3000. The stars suggest 3001.`,
	];
	const fortune = fortunes[ownRepos.length % fortunes.length] ?? fortunes[0];

	return {
		title: `The GitHub Horoscope of ${user.name ?? user.login}`,
		sign: zodiacSign,
		signEmoji: zodiacEmoji,
		trait: langReading.trait,
		reading: paragraphs,
		fortune,
		luckyLanguage,
		unluckyCommitMessage: unluckyCommit,
	};
}

interface GithubHoroscopeProps {
	open: boolean;
	onClose: () => void;
}

export const GithubHoroscope: React.FC<GithubHoroscopeProps> = ({
	open,
	onClose,
}) => {
	const [username, setUsername] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [horoscope, setHoroscope] = useState<ReturnType<
		typeof generateHoroscope
	> | null>(null);

	if (!open) return null;

	const fetchHoroscope = async () => {
		if (!username.trim()) return;
		setLoading(true);
		setError(null);
		setHoroscope(null);

		try {
			const [userRes, reposRes] = await Promise.all([
				fetch(`https://api.github.com/users/${encodeURIComponent(username.trim())}`),
				fetch(
					`https://api.github.com/users/${encodeURIComponent(username.trim())}/repos?per_page=100&sort=updated`,
				),
			]);

			if (!userRes.ok) {
				if (userRes.status === 404) {
					setError(
						`No soul found for "${username.trim()}". The stars cannot read what does not exist.`,
					);
				} else if (userRes.status === 403) {
					setError(
						"The GitHub API rate limit has been reached. Even the stars have limits. Try again in a minute.",
					);
				} else {
					setError("The cosmos is temporarily unreachable. Please try again.");
				}
				return;
			}

			const user: GithubUser = await userRes.json();
			const repos: GithubRepo[] = reposRes.ok ? await reposRes.json() : [];

			const result = generateHoroscope({ user, repos });
			setHoroscope(result);
		} catch {
			setError(
				"A cosmic disturbance prevented the reading. Check your connection and the alignment of Mercury.",
			);
		} finally {
			setLoading(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") fetchHoroscope();
	};

	const reset = () => {
		setHoroscope(null);
		setUsername("");
		setError(null);
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<div
				className="fixed inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>
			<div className="relative z-50 bg-popover text-popover-foreground rounded-2xl border border-border/50 shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 shrink-0">
					<div className="flex items-center gap-2">
						<Sparkles className="w-5 h-5 text-purple-400" />
						<span className="font-semibold text-base">
							GitHub Horoscope
						</span>
						<span className="text-xs text-muted-foreground ml-1">
							✨ 100% scientifically accurate
						</span>
					</div>
					<button
						onClick={onClose}
						className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 hover:bg-accent/50"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* Body */}
				<div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
					{!horoscope ? (
						<>
							<p className="text-sm text-muted-foreground">
								Enter a GitHub username to reveal what the stars have decoded
								from their commit history, repo count, and primary language.
								Results may be disturbing.
							</p>
							<div className="flex gap-2">
								<Input
									placeholder="GitHub username..."
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									onKeyDown={handleKeyDown}
									autoFocus
									disabled={loading}
									className="flex-1"
								/>
								<Button
									onClick={fetchHoroscope}
									disabled={loading || !username.trim()}
									className="shrink-0"
								>
									{loading ? (
										<RefreshCw className="w-4 h-4 animate-spin" />
									) : (
										<>
											<Sparkles className="w-4 h-4 mr-1.5" />
											Read
										</>
									)}
								</Button>
							</div>

							{error && (
								<div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
									{error}
								</div>
							)}

							{loading && (
								<div className="text-center py-6 text-muted-foreground">
									<div className="text-3xl mb-3 animate-pulse">🔮</div>
									<p className="text-sm">
										Consulting the cosmic commit log...
									</p>
									<p className="text-xs mt-1 opacity-60">
										Reading pull requests from a parallel universe...
									</p>
								</div>
							)}
						</>
					) : (
						<>
							{/* Horoscope result */}
							<div className="text-center py-3">
								<div className="text-5xl mb-2">{horoscope.signEmoji}</div>
								<h2 className="font-bold text-lg">{horoscope.title}</h2>
								<div className="flex items-center justify-center gap-3 mt-1.5 text-sm text-muted-foreground">
									<span className="flex items-center gap-1">
										<Star className="w-3.5 h-3.5 text-yellow-400" />
										{horoscope.sign}
									</span>
									<span>·</span>
									<span className="flex items-center gap-1">
										<GitBranch className="w-3.5 h-3.5 text-purple-400" />
										{horoscope.trait}
									</span>
								</div>
							</div>

							<div className="space-y-3">
								{horoscope.reading.map((para, i) => (
									<p
										key={i}
										className="text-sm leading-relaxed text-foreground/90"
									>
										{para}
									</p>
								))}
							</div>

							{/* Fortune */}
							<div className="rounded-xl bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20 px-4 py-3 mt-4">
								<p className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-1">
									Today's Fortune
								</p>
								<p className="text-sm italic text-foreground/80">
									"{horoscope.fortune}"
								</p>
							</div>

							{/* Lucky/Unlucky */}
							<div className="grid grid-cols-2 gap-3">
								<div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2.5 text-center">
									<p className="text-xs text-green-400 font-medium mb-1">
										Lucky Language
									</p>
									<p className="text-sm font-semibold">
										{horoscope.luckyLanguage}
									</p>
								</div>
								<div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-center">
									<p className="text-xs text-red-400 font-medium mb-1">
										Avoid Committing
									</p>
									<p className="text-sm font-mono font-semibold">
										{horoscope.unluckyCommitMessage}
									</p>
								</div>
							</div>

							<div className="pt-1 flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={reset}
									className="flex-1"
								>
									Read Another
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={onClose}
									className="flex-1"
								>
									Close
								</Button>
							</div>

							<p className="text-xs text-center text-muted-foreground/50 pb-1">
								*For entertainment purposes only. The stars are not liable for
								bad code or worse commit messages.
							</p>
						</>
					)}
				</div>
			</div>
		</div>
	);
};
