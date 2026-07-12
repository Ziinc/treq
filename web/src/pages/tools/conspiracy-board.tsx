import React, { useEffect, useRef, useState, useCallback } from 'react';
import Layout from '@theme/Layout';
import styles from './conspiracy-board.module.css';

// ── Data ─────────────────────────────────────────────────────────────────────

interface Tech {
  id: string;
  label: string;
  emoji: string;
  color: string;
  desc: string;
}

const TECHS: Tech[] = [
  { id: 'k8s',       label: 'Kubernetes', emoji: '☸️',  color: '#326CE5', desc: 'Orchestrates your suffering at scale' },
  { id: 'dns',       label: 'DNS',        emoji: '🌐',  color: '#f59e0b', desc: 'It\'s always DNS' },
  { id: 'redis',     label: 'Redis',      emoji: '🔴',  color: '#dc382d', desc: 'The "just cache it" answer' },
  { id: 'oauth',     label: 'OAuth',      emoji: '🔐',  color: '#6366f1', desc: 'Nobody understands the flow' },
  { id: 'kafka',     label: 'Kafka',      emoji: '📨',  color: '#231f20', desc: 'Events go in, chaos comes out' },
  { id: 'ai',        label: 'AI',         emoji: '🤖',  color: '#10b981', desc: 'Solved everything. Somehow.' },
  { id: 'docker',    label: 'Docker',     emoji: '🐳',  color: '#2496ED', desc: 'Works on my machine' },
  { id: 'terraform', label: 'Terraform',  emoji: '🏗️',  color: '#7B42BC', desc: 'Infra as anxiety' },
];

// ── Theory generation ─────────────────────────────────────────────────────────

type TheoryEntry = { icon: string; text: string; final?: boolean };

const PAIR_THEORIES: Record<string, string[]> = {
  'k8s-dns':       ['Your pods can\'t talk to each other because CoreDNS is vibing in a different timezone.', 'Kubernetes asked DNS for directions. DNS lied. Nothing works.'],
  'k8s-redis':     ['The Redis pod was evicted at 3am. Kubernetes watched, unmoved.', 'Your cache was OOMKilled. Kubernetes filed it under "working as intended."'],
  'k8s-oauth':     ['The OAuth callback URL points to a pod that was rescheduled 40 seconds ago.', 'Your auth service scaled to zero mid-login. Kubernetes considers this a success.'],
  'k8s-kafka':     ['Kafka consumer lag is 4 million. Kubernetes just autoscaled to 3 replicas. Good luck.', 'The Kafka pod was placed on a node with 0.5 mCPU. This is load balancing, apparently.'],
  'k8s-ai':        ['The AI model inference pod was OOMKilled. Kubernetes replaced it with a smaller one. The model is now dumber.', 'Kubernetes decided your GPU node was "underutilized" and removed it mid-training.'],
  'k8s-docker':    ['The Docker image is 4.2GB. Kubernetes is still pulling it. Your SLA was 4 hours ago.', 'kubectl rollout status: Waiting... Waiting... Waiting... It\'s a Docker layer cache miss.'],
  'k8s-terraform': ['Terraform created the cluster. Kubernetes destroyed the Terraform state pod. Irony achieved.', 'The Terraform provider and kubectl disagree on what "running" means. Both are right. Both are wrong.'],
  'dns-redis':     ['Redis is down because someone fat-fingered the DNS entry and it points to a parking page.', 'Your Redis connection string resolves to 127.0.0.1 in prod. DNS has opinions about caching.'],
  'dns-oauth':     ['The OAuth discovery endpoint has a 4-hour DNS TTL. Your certs rotated 3 hours ago.', 'OAuth redirect URIs are validated against DNS. Your DNS propagated everywhere except the auth server.'],
  'dns-kafka':     ['Kafka bootstrap servers resolved to the wrong IP for 6 minutes. Nobody knows why. It fixed itself.', 'The Kafka broker is at kafka.internal. DNS says kafka.internal is kafka-old.internal. Events are lost.'],
  'dns-ai':        ['The AI API gateway is unreachable because the DNS A record has 0 TTL but was still cached for 8 hours.', 'Your AI provider\'s endpoint changed. DNS cached the old one. You blamed the model.'],
  'dns-docker':    ['The Docker registry DNS entry expired mid-pull. Your CI is stuck. The deploy is at 47%.', 'Docker tried to resolve docker.io. DNS returned NXDOMAIN. This has never happened before and will happen again.'],
  'dns-terraform': ['Terraform looked up the DNS zone. The zone didn\'t exist yet. Terraform created it. Then looked it up again. Still doesn\'t exist. Race condition achieved.', 'The Terraform state backend is on a hostname that DNS can\'t resolve in this VPC. Classic.'],
  'redis-oauth':   ['OAuth tokens are stored in Redis. Redis evicted them with LRU. Users are logged out. It\'s Tuesday.', 'The Redis session store has a 5-minute TTL. OAuth access tokens last 1 hour. Users are very confused.'],
  'redis-kafka':   ['Kafka consumer offsets are in Redis. Redis flushed to disk. Disk was full. You replayed 12 hours of events.', 'Redis is used as a Kafka replacement because "it\'s basically the same thing." It is not the same thing.'],
  'redis-ai':      ['The AI response is cached in Redis. Forever. The model was updated 3 weeks ago. Users are getting 2023 answers.', 'Redis OOM at 2am. AI requests uncached. Model API rate limit hit. Users experienced "character." '],
  'redis-docker':  ['Redis is running in a Docker container with no volume mount. Someone restarted it. The cache is gone. This is a feature.', 'The Redis Docker image was updated. The new version deprecates the command your app uses. Silently.'],
  'redis-terraform': ['Terraform manages the Redis cluster. Terraform destroy was run in staging. Staging was prod.', 'The Redis Terraform module added encryption at rest. All existing keys became unreadable. Plan phase was clean.'],
  'oauth-kafka':   ['OAuth events are published to Kafka. The consumer validates tokens. The token expired during the lag. Access denied at message 4,000,001.', 'Your Kafka consumer needs OAuth credentials. The OAuth server publishes to Kafka. They are waiting for each other.'],
  'oauth-ai':      ['The AI assistant is authenticated via OAuth. The refresh token expired. The AI is now confidently hallucinating with no context.', 'OAuth scopes don\'t include "read:everything." The AI interpreted this as "make things up."'],
  'oauth-docker':  ['The Docker registry requires OAuth. The OAuth server is in the Docker registry. The container can\'t start to authenticate to pull the container that runs authentication.', 'OAuth client secret is baked into the Docker image. The image is public. Congrats on the breach.'],
  'oauth-terraform': ['Terraform needs OAuth to provision the OAuth server. The OAuth server doesn\'t exist yet. Chicken, meet egg.', 'The OAuth app client ID is hardcoded in Terraform. It\'s in git. It\'s in the logs. It\'s everywhere.'],
  'kafka-ai':      ['The AI is consuming Kafka events to learn from your users. It has learned that your users hate your product.', 'AI-generated content is published to Kafka at 10,000 events/second. The consumers are just vibes.'],
  'kafka-docker':  ['The Kafka Docker image requires 4GB heap. Your instance has 3.9GB. Kafka starts fine. Then it doesn\'t.', 'Someone ran docker-compose down on the Kafka cluster. All in-flight messages went with it. "It was just a restart."'],
  'kafka-terraform': ['Terraform deleted the Kafka topic to recreate it with more partitions. The messages were not moved. They were deleted.', 'The Kafka Terraform module creates topics idempotently. Unless someone manually created one first. Then it explodes.'],
  'ai-docker':     ['The AI model is 70GB. The Docker image is 71GB. The registry has 70.5GB free. This is a production deploy.', 'The AI container exits with code 0 and no output. The orchestrator marks it healthy. This is correct behavior.'],
  'ai-terraform':  ['Terraform provisions GPU instances for AI. It scales to zero at night to save money. The AI forgets everything. Every night.', 'The AI Terraform module is 4,000 lines. It was written by the AI. Nobody has read it.'],
  'docker-terraform': ['Terraform builds the Docker image. Docker builds the Terraform binary. You are in a loop and this is your life now.', 'The Dockerfile calls terraform plan. Terraform calls docker build. The build has been running for 6 days.'],
};

const TRIPLE_THEORIES: string[] = [
  'Three technologies is where architectures go to die and engineers go to drink.',
  'At this point you have a distributed system. You had one bug. You now have three.',
  'This is what a tech lead calls "separation of concerns" and a senior engineer calls "my problem now."',
  'You\'ve connected three things. Each has its own on-call rotation. None of them talk to each other.',
  'A monolith would have prevented this. Someone read a Martin Fowler blog post in 2018.',
];

const QUAD_THEORIES: string[] = [
  'Four connections means you\'ve invented a new architecture. It will be named after you. In a post-mortem.',
  'This is microservices. You wanted microservices. This is what microservices feels like from the inside.',
  'Congratulations: you now need a service mesh. The service mesh will need its own service mesh.',
  'Your architecture diagram will not fit on a single monitor. This is considered "enterprise-grade."',
  'Four technologies, one outage. Root cause: all of them. Also DNS.',
];

const QUINTET_THEORIES: string[] = [
  'Five technologies. This is a Series B startup\'s entire infrastructure. You built it in 40 minutes.',
  'BREAKING: Local developer connects five technologies, achieves sentience of the cloud.',
  'This is the part where the CTO gives a conference talk about your "innovative distributed architecture."',
  'Five is the number where engineers start drawing diagrams with arrows pointing at themselves.',
  'Your SRE team has requested a meeting. It\'s about this. It\'s always about this.',
];

const SEXTET_THEORIES: string[] = [
  'Six connections. This is a unicorn startup\'s entire platform. You should charge $499/month.',
  'This monstrosity has been submitted to re:Invent as a reference architecture.',
  'AWS would like to sponsor this diagram. It perfectly justifies 14 managed services.',
  'CLASSIFIED: Engineers who connect six technologies are placed in a special Jira project called "tech-debt."',
];

const SEPTET_PLUS_THEORIES: string[] = [
  'MAXIMUM OVERDRAFT REACHED. The board has achieved sentience. It is filing a patent.',
  'You have connected everything. There is no longer a separation of concerns. There is only The System.',
  'This architecture will be taught in universities as a cautionary tale. The slide will just be this board.',
  'The entire engineering organization is now on-call. Permanently.',
  'Congratulations: your infrastructure has achieved consciousness. It is unhappy.',
];

const CONCLUSION_LINES = [
  'This architecture could have been a monolith.',
  'A single SQLite file would have handled this workload.',
  'The original engineer who designed this has been at a different company for 2 years.',
  'The documentation says "it\'s complicated." This is technically accurate.',
  'Total monthly cloud bill: $47,000. Original problem: displaying a list of users.',
  'Time to first byte: 4.2 seconds. Each technology contributes approximately equally.',
  '"Move fast and break things" was the original philosophy. Mission accomplished.',
  'This could have been a cron job.',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('-');
}

function generateTheories(connections: Array<[string, string]>): TheoryEntry[] {
  if (connections.length === 0) return [];

  const entries: TheoryEntry[] = [];
  const usedPairKeys = new Set<string>();

  for (const [a, b] of connections) {
    const key = pairKey(a, b);
    if (!usedPairKeys.has(key)) {
      usedPairKeys.add(key);
      const pool = PAIR_THEORIES[key];
      if (pool) {
        entries.push({ icon: '🔴', text: pickRandom(pool) });
      }
    }
  }

  const n = connections.length;
  if (n >= 3 && n < 4) entries.push({ icon: '📌', text: pickRandom(TRIPLE_THEORIES) });
  if (n >= 4 && n < 5) entries.push({ icon: '🗂️',  text: pickRandom(QUAD_THEORIES) });
  if (n >= 5 && n < 6) entries.push({ icon: '🚨', text: pickRandom(QUINTET_THEORIES) });
  if (n >= 6 && n < 7) entries.push({ icon: '☢️',  text: pickRandom(SEXTET_THEORIES) });
  if (n >= 7)          entries.push({ icon: '💀', text: pickRandom(SEPTET_PLUS_THEORIES) });

  if (n >= 2) {
    entries.push({ icon: '⚠️', text: pickRandom(CONCLUSION_LINES), final: true });
  }

  return entries;
}

// ── Canvas renderer ───────────────────────────────────────────────────────────

interface PinPosition {
  id: string;
  x: number;
  y: number;
}

function layoutPins(techs: Tech[], width: number, height: number): PinPosition[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.min(width * 0.38, 200);
  const ry = Math.min(height * 0.38, 180);
  return techs.map((t, i) => {
    const angle = (i / techs.length) * Math.PI * 2 - Math.PI / 2;
    return { id: t.id, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
}

const PIN_RADIUS = 26;

function drawBoard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pins: PinPosition[],
  connections: Array<[string, string]>,
  hoverPin: string | null,
  selectedPin: string | null,
  draggingConnection: { from: string; toX: number; toY: number } | null,
  techMap: Map<string, Tech>,
  animOffset: number,
) {
  // Cork background
  ctx.fillStyle = '#c8954a';
  ctx.fillRect(0, 0, w, h);

  // Cork texture dots
  ctx.save();
  for (let xi = 0; xi < w; xi += 28) {
    for (let yi = 0; yi < h; yi += 24) {
      const jx = (xi + yi * 0.3) % 7 - 3;
      const jy = (yi + xi * 0.4) % 6 - 3;
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = '#7a4e2d';
      ctx.beginPath();
      ctx.ellipse(xi + jx, yi + jy, 4 + (xi % 5), 2 + (yi % 3), 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Grain overlay
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#3d1f00';
  for (let i = 0; i < 60; i++) {
    const lx = (i * 137.5) % w;
    const ly = (i * 93.7) % h;
    ctx.fillRect(lx, ly, w / 15, 1);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Draw existing connections
  for (const [a, b] of connections) {
    const pa = pins.find((p) => p.id === a);
    const pb = pins.find((p) => p.id === b);
    if (!pa || !pb) continue;
    drawString(ctx, pa.x, pa.y, pb.x, pb.y, animOffset, false);
  }

  // Draw dragging string
  if (draggingConnection) {
    const pa = pins.find((p) => p.id === draggingConnection.from);
    if (pa) {
      drawString(ctx, pa.x, pa.y, draggingConnection.toX, draggingConnection.toY, animOffset, true);
    }
  }

  // Draw pins
  for (const pin of pins) {
    const tech = techMap.get(pin.id);
    if (!tech) continue;
    const isSelected = pin.id === selectedPin;
    const isHovered  = pin.id === hoverPin;
    drawPin(ctx, pin.x, pin.y, tech, isSelected, isHovered);
  }
}

function drawString(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  animOffset: number,
  dashed: boolean,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + Math.sqrt(dx * dx + dy * dy) * 0.12;

  ctx.save();
  ctx.strokeStyle = dashed ? 'rgba(220,38,38,0.6)' : '#dc2626';
  ctx.lineWidth = dashed ? 1.5 : 2.2;
  ctx.shadowColor = '#dc2626';
  ctx.shadowBlur = dashed ? 4 : 8;

  if (dashed) {
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -animOffset * 0.05;
  } else {
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  tech: Tech,
  selected: boolean,
  hovered: boolean,
) {
  const r = PIN_RADIUS;
  const scale = selected ? 1.15 : hovered ? 1.08 : 1;
  const sr = r * scale;

  ctx.save();
  ctx.translate(x, y);

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = selected ? 18 : 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;

  // Note background (yellow paper)
  ctx.fillStyle = selected ? '#fef3c7' : '#fefce8';
  ctx.strokeStyle = selected ? tech.color : hovered ? '#dc2626' : 'rgba(0,0,0,0.25)';
  ctx.lineWidth = selected ? 2.5 : 1.5;
  roundRect(ctx, -sr, -sr, sr * 2, sr * 2, 5);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Pin head
  ctx.fillStyle = selected ? '#dc2626' : tech.color;
  ctx.beginPath();
  ctx.arc(0, -sr + 4, 5, 0, Math.PI * 2);
  ctx.fill();

  // Emoji
  ctx.font = `${sr * 0.78}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tech.emoji, 0, 2);

  // Label
  ctx.font = `bold ${Math.max(9, sr * 0.35)}px 'Courier New', monospace`;
  ctx.fillStyle = '#1c1917';
  ctx.fillText(tech.label, 0, sr * 0.72);

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hitTest(pins: PinPosition[], mx: number, my: number): string | null {
  for (const p of pins) {
    const dx = mx - p.x;
    const dy = my - p.y;
    if (dx * dx + dy * dy <= (PIN_RADIUS * 1.2) ** 2) return p.id;
  }
  return null;
}

// ── React component ───────────────────────────────────────────────────────────

const TECH_MAP = new Map<string, Tech>(TECHS.map((t) => [t.id, t]));

export default function ConspiracyBoardPage() {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const animRef        = useRef<number>(0);
  const animOffset     = useRef<number>(0);
  const pinsRef        = useRef<PinPosition[]>([]);

  const [connections,  setConnections]  = useState<Array<[string, string]>>([]);
  const [selectedPin,  setSelectedPin]  = useState<string | null>(null);
  const [hoverPin,     setHoverPin]     = useState<string | null>(null);
  const [dragging,     setDragging]     = useState<{ from: string; toX: number; toY: number } | null>(null);
  const [theories,     setTheories]     = useState<TheoryEntry[]>([]);
  const [isDragging,   setIsDragging]   = useState(false);

  // Layout pins on mount / resize — always in CSS pixel space
  const relayout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pinsRef.current = layoutPins(TECHS, canvas.clientWidth, canvas.clientHeight);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr  = window.devicePixelRatio || 1;
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      relayout();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [relayout]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const connectionsSnap = connections;
    const selectedSnap    = selectedPin;
    const hoverSnap       = hoverPin;
    const draggingSnap    = dragging;

    const loop = () => {
      animRef.current = requestAnimationFrame(loop);
      animOffset.current += 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w   = canvas.clientWidth;
      const h   = canvas.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBoard(ctx, w, h, pinsRef.current, connectionsSnap, hoverSnap, selectedSnap, draggingSnap, TECH_MAP, animOffset.current);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [connections, selectedPin, hoverPin, dragging]);

  // Theory updates
  useEffect(() => {
    setTheories(generateTheories(connections));
  }, [connections]);

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let cx: number, cy: number;
    if ('touches' in e) {
      cx = e.touches[0].clientX;
      cy = e.touches[0].clientY;
    } else {
      cx = e.clientX;
      cy = e.clientY;
    }
    return {
      x: cx - rect.left,
      y: cy - rect.top,
    };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPos(e);
    const hit = hitTest(pinsRef.current, x, y);
    if (hit) {
      setIsDragging(true);
      if (selectedPin === null) {
        setSelectedPin(hit);
        setDragging({ from: hit, toX: x, toY: y });
      } else if (selectedPin === hit) {
        setSelectedPin(null);
        setDragging(null);
      } else {
        const key = pairKey(selectedPin, hit);
        const existing = connections.some(([a, b]) => pairKey(a, b) === key);
        if (existing) {
          setConnections((prev) => prev.filter(([a, b]) => pairKey(a, b) !== key));
        } else {
          setConnections((prev) => [...prev, [selectedPin, hit]]);
        }
        setSelectedPin(null);
        setDragging(null);
      }
    } else {
      setSelectedPin(null);
      setDragging(null);
    }
  }, [selectedPin, connections]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPos(e);
    const hit = hitTest(pinsRef.current, x, y);
    setHoverPin(hit);
    if (dragging) {
      setDragging((d) => d ? { ...d, toX: x, toY: y } : null);
    }
  }, [dragging]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    const { x, y } = getCanvasPos(e);
    const hit = hitTest(pinsRef.current, x, y);
    if (hit && dragging && hit !== dragging.from) {
      const key = pairKey(dragging.from, hit);
      const existing = connections.some(([a, b]) => pairKey(a, b) === key);
      if (!existing) {
        setConnections((prev) => [...prev, [dragging.from, hit]]);
      }
      setSelectedPin(null);
      setDragging(null);
    }
  }, [isDragging, dragging, connections]);

  const handleMouseLeave = useCallback(() => {
    setHoverPin(null);
    if (dragging) {
      setDragging(null);
      setIsDragging(false);
    }
  }, [dragging]);

  const handleReset = useCallback(() => {
    setConnections([]);
    setSelectedPin(null);
    setDragging(null);
    setTheories([]);
  }, []);

  const connectedTechs = new Set(connections.flat());

  return (
    <Layout
      title="The Engineering Conspiracy Board™"
      description="Connect technologies with red string and discover what really went wrong."
    >
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.breadcrumb}>
            <a href="/tools">Tools</a>
            <span> / </span>
            <span>The Engineering Conspiracy Board™</span>
          </div>
          <h1 className={styles.pageTitle}>
            <span className={styles.pageTitleAccent}>The Engineering Conspiracy Board™</span>
          </h1>
          <p className={styles.pageSubtitle}>
            Connect technologies with red string. Uncover the truth behind every outage.
          </p>
        </div>

        <div className={styles.boardWrap}>
          <canvas
            ref={canvasRef}
            className={`${styles.boardCanvas} ${isDragging ? styles.dragging : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />
        </div>

        <div className={styles.statsBar}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Connections:</span>
            <span className={styles.statValue}>{connections.length}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Technologies implicated:</span>
            <span className={styles.statValue}>{connectedTechs.size}</span>
          </div>
          {connections.length >= 6 && (
            <div className={styles.statItem}>
              <span className={styles.statValue}>☢️ MAXIMUM CHAOS ACHIEVED</span>
            </div>
          )}
          <button className={styles.resetBtn} onClick={handleReset}>
            Clear board
          </button>
        </div>

        {theories.length > 0 && (
          <div className={styles.theoryPanel}>
            <div className={styles.theoryHeader}>
              <span className={styles.theoryHeaderIcon}>📋</span>
              INCIDENT INVESTIGATION FINDINGS
              <span className={styles.theoryBadge}>CLASSIFIED</span>
            </div>
            <div className={styles.theoryBody}>
              <ul className={styles.theoryList}>
                {theories.map((t, i) => (
                  <li key={i} className={`${styles.theoryItem} ${t.final ? styles.theoryItemFinal : ''}`}>
                    <span className={styles.theoryIcon}>{t.icon}</span>
                    <span className={styles.theoryText}>{t.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className={styles.instructions}>
          <div className={styles.instructionStep}>
            <span className={styles.instructionNum}>1</span>
            Click a technology to select it
          </div>
          <div className={styles.instructionStep}>
            <span className={styles.instructionNum}>2</span>
            Click another to connect with red string
          </div>
          <div className={styles.instructionStep}>
            <span className={styles.instructionNum}>3</span>
            Click a connection again to remove it
          </div>
          <div className={styles.instructionStep}>
            <span className={styles.instructionNum}>4</span>
            Watch the conspiracy unfold
          </div>
        </div>
      </div>
    </Layout>
  );
}
