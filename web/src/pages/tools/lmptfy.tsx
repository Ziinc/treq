import React, { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '@theme/Layout';
import { useHistory, useLocation } from '@docusaurus/router';
import styles from './lmptfy.module.css';

// ── URL encoding ──────────────────────────────────────────────────────────────

function encodePrompt(text: string): string {
  return btoa(encodeURIComponent(text));
}

function decodePrompt(raw: string): string | null {
  try {
    return decodeURIComponent(atob(raw));
  } catch {
    return null;
  }
}

// ── Typing animation hook ─────────────────────────────────────────────────────

function useTypingAnimation(text: string | null, speed = 38) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) return;
    setDisplayed('');
    setDone(false);

    let i = 0;
    const chars = Array.from(text);

    const tick = () => {
      i++;
      setDisplayed(chars.slice(0, i).join(''));
      if (i >= chars.length) {
        setDone(true);
        return;
      }
      const jitter = speed + Math.random() * 30 - 10;
      setTimeout(tick, jitter);
    };

    const start = setTimeout(tick, 700);
    return () => clearTimeout(start);
  }, [text, speed]);

  return { displayed, done };
}

// ── AI URLs ───────────────────────────────────────────────────────────────────

function chatgptUrl(prompt: string) {
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

function claudeUrl(prompt: string) {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

// ── Three.js scene ────────────────────────────────────────────────────────────

function buildPotatoScene(canvas: HTMLCanvasElement): { dispose: () => void } {
  const THREE = require('three') as typeof import('three');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const W = canvas.clientWidth || 560;
  const H = canvas.clientHeight || 420;
  renderer.setSize(W, H, false);

  // ── Scene ──────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0c14);
  scene.fog = new THREE.Fog(0x0d0c14, 14, 26);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 60);
  camera.position.set(4.2, 4.0, 7.5);
  camera.lookAt(-0.3, 2.1, 0);

  // ── Lighting ───────────────────────────────────────────────────────────────
  // Very dim ambient (nearly dark room)
  scene.add(new THREE.AmbientLight(0x18162a, 2.5));

  // Monitor glow — blue-tinted, primary light source
  const screenGlow = new THREE.PointLight(0x3a60cc, 5.5, 9);
  screenGlow.position.set(-0.2, 3.0, -0.9);
  scene.add(screenGlow);

  // Soft warm backlight (desk lamp suggestion)
  const backLight = new THREE.PointLight(0xffcc88, 0.6, 8);
  backLight.position.set(3, 4, 2);
  scene.add(backLight);

  // ── Materials ──────────────────────────────────────────────────────────────
  const skinMat   = new THREE.MeshStandardMaterial({ color: 0xc9a96e, roughness: 0.85 });
  const skinDark  = new THREE.MeshStandardMaterial({ color: 0xaa8445, roughness: 0.9 });
  const shirtMat  = new THREE.MeshStandardMaterial({ color: 0x1e3060, roughness: 0.75 });
  const pantsMat  = new THREE.MeshStandardMaterial({ color: 0x18202e, roughness: 0.9 });
  const hairMat   = new THREE.MeshStandardMaterial({ color: 0x2a1800, roughness: 0.9 });
  const eyeMat    = new THREE.MeshStandardMaterial({ color: 0x100c06 });
  const whiteMat  = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const deskMat   = new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.7 });
  const deskTopMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.65 });
  const monFrameMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.3, metalness: 0.5 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x08102a,
    emissive: 0x1a3888,
    emissiveIntensity: 0.65,
    roughness: 0.1,
  });
  const kbMat    = new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 0.55 });
  const keyMat   = new THREE.MeshStandardMaterial({ color: 0x242428, roughness: 0.5 });
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.9 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0e0d16, roughness: 0.98 });
  const wallMat  = new THREE.MeshStandardMaterial({ color: 0x12101e, roughness: 0.98 });

  // ── Floor & back wall ──────────────────────────────────────────────────────
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 18), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(18, 10), wallMat);
  wall.position.set(0, 4.5, -5);
  wall.receiveShadow = true;
  scene.add(wall);

  // ── Desk ──────────────────────────────────────────────────────────────────
  // Surface
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.1, 2.4), deskTopMat);
  deskTop.position.set(-0.2, 1.62, -0.8);
  deskTop.castShadow = true;
  deskTop.receiveShadow = true;
  scene.add(deskTop);

  // Apron (front face of desk)
  const deskApron = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.55, 0.06), deskMat);
  deskApron.position.set(-0.2, 1.3, 0.26);
  scene.add(deskApron);

  // Legs
  for (const [lx, lz] of [[-2.3, 0.2], [1.9, 0.2], [-2.3, -1.9], [1.9, -1.9]] as [number, number][]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.62, 0.09), deskMat);
    leg.position.set(lx, 0.81, lz);
    scene.add(leg);
  }

  // ── Monitor ────────────────────────────────────────────────────────────────
  const monFrame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 0.1), monFrameMat);
  monFrame.position.set(-0.2, 3.05, -1.75);
  monFrame.castShadow = true;
  scene.add(monFrame);

  const monScreen = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.52, 0.06), screenMat);
  monScreen.position.set(-0.2, 3.05, -1.68);
  scene.add(monScreen);

  // Screen "UI" lines
  const uiLineMat = new THREE.MeshBasicMaterial({ color: 0x4488ee, transparent: true, opacity: 0.55 });
  const uiDimMat  = new THREE.MeshBasicMaterial({ color: 0x2244aa, transparent: true, opacity: 0.4 });
  for (let i = 0; i < 6; i++) {
    const w = 1.4 + (i % 3) * 0.3;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.045), i < 2 ? uiLineMat : uiDimMat);
    line.position.set(-0.2 - (2.4 - w) / 2 + 0.15, 3.35 - i * 0.22, -1.64);
    scene.add(line);
  }

  // Blinking cursor on screen
  const cursorMat = new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.9 });
  const cursorMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.14), cursorMat);
  cursorMesh.position.set(-1.18, 2.1, -1.64);
  scene.add(cursorMesh);

  // Monitor stand
  const monPole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.1), monFrameMat);
  monPole.position.set(-0.2, 1.9, -1.75);
  scene.add(monPole);
  const monBase = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.04, 0.5), monFrameMat);
  monBase.position.set(-0.2, 1.72, -1.75);
  scene.add(monBase);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  const kb = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.045, 0.65), kbMat);
  kb.position.set(0.1, 1.69, -0.25);
  kb.castShadow = true;
  scene.add(kb);

  // Key grid
  for (let row = 0; row < 4; row++) {
    const keysPerRow = row === 0 ? 12 : row < 3 ? 11 : 10;
    for (let col = 0; col < keysPerRow; col++) {
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.025, 0.095), keyMat);
      key.position.set(-0.73 + col * 0.135, 1.715, -0.47 + row * 0.14);
      scene.add(key);
    }
  }

  // ── Chair ──────────────────────────────────────────────────────────────────
  const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.35), chairMat);
  chairSeat.position.set(0.5, 1.08, 0.55);
  chairSeat.castShadow = true;
  chairSeat.receiveShadow = true;
  scene.add(chairSeat);

  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.35, 0.08), chairMat);
  chairBack.position.set(0.5, 1.83, 1.24);
  chairBack.castShadow = true;
  scene.add(chairBack);

  const chairArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 1.0), chairMat);
  for (const ax of [-0.65, 0.65]) {
    const ca = chairArm.clone();
    ca.position.set(0.5 + ax, 1.42, 0.55);
    scene.add(ca);
  }

  const chairPole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 1.02, 8), chairMat);
  chairPole.position.set(0.5, 0.55, 0.55);
  scene.add(chairPole);

  const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.04, 5), chairMat);
  chairBase.position.set(0.5, 0.06, 0.55);
  scene.add(chairBase);

  // ── Potato man ─────────────────────────────────────────────────────────────
  // Man group — offset so he sits on the chair
  const man = new THREE.Group();
  scene.add(man);

  // Legs / thighs (horizontal, sitting)
  const thighGeo = new THREE.CylinderGeometry(0.175, 0.155, 0.9, 12);
  const leftThigh = new THREE.Mesh(thighGeo, pantsMat);
  leftThigh.rotation.x = Math.PI / 2;
  leftThigh.position.set(0.22, 1.17, 0.1);
  man.add(leftThigh);

  const rightThigh = leftThigh.clone();
  rightThigh.position.set(0.78, 1.17, 0.1);
  man.add(rightThigh);

  // Shins (hang down from thighs)
  const shinGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.75, 12);
  for (const sx of [0.22, 0.78]) {
    const shin = new THREE.Mesh(shinGeo, pantsMat);
    shin.position.set(sx, 0.75, 0.58);
    man.add(shin);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, 0.42), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.7 }));
    shoe.position.set(sx, 0.37, 0.72);
    man.add(shoe);
  }

  // Body (potato torso, seated)
  const bodyGeo = new THREE.SphereGeometry(0.6, 24, 18);
  const body = new THREE.Mesh(bodyGeo, shirtMat);
  body.scale.set(0.92, 1.12, 0.82);
  body.position.set(0.5, 2.05, 0.42);
  body.castShadow = true;
  man.add(body);

  // Belly bulge (potato people always have a belly)
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 14), shirtMat);
  belly.scale.set(0.88, 0.72, 0.5);
  belly.position.set(0.5, 1.9, 0.82);
  man.add(belly);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.22, 12), skinMat);
  neck.position.set(0.5, 2.85, 0.44);
  man.add(neck);

  // Head (potato-shaped)
  const headGeo = new THREE.SphereGeometry(0.56, 28, 22);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.scale.set(1.05, 1.08, 1.0);
  head.position.set(0.5, 3.47, 0.46);
  head.castShadow = true;
  man.add(head);

  // Stubby potato-head ears
  for (const ex of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), skinDark);
    ear.scale.set(0.45, 0.65, 0.55);
    ear.position.set(0.5 + ex * 0.6, 3.47, 0.46);
    man.add(ear);
  }

  // Eyes (wide-set, looking slightly down at screen)
  const eyeGeo = new THREE.SphereGeometry(0.1, 14, 12);
  for (const [ex, ez] of [[-0.22, 0.95], [0.22, 0.95]] as [number, number][]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.5 + ex, 3.56, 0.46 + ez);
    man.add(eye);
    const gleam = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), whiteMat);
    gleam.position.set(0.5 + ex + 0.04, 3.6, 0.46 + ez + 0.09);
    man.add(gleam);
  }

  // Eyebrows (slightly furrowed — concentrating)
  for (const [ex, rot] of [[-0.22, 0.25], [0.22, -0.25]] as [number, number][]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.055, 0.055), hairMat);
    brow.position.set(0.5 + ex, 3.69, 0.46 + 0.96);
    brow.rotation.z = rot;
    man.add(brow);
  }

  // Big bulbous potato nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), skinDark);
  nose.scale.set(1.1, 0.9, 1.35);
  nose.position.set(0.5, 3.47, 0.46 + 1.06);
  man.add(nose);

  // Mustache — two puffy halves + centre
  const mustMat = new THREE.MeshStandardMaterial({ color: 0x28140a, roughness: 0.85 });
  for (const mx of [-0.17, 0.17]) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mustMat);
    puff.scale.set(1.3, 0.65, 0.82);
    puff.position.set(0.5 + mx, 3.3, 0.46 + 1.02);
    man.add(puff);
  }
  const mustCentre = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mustMat);
  mustCentre.scale.set(0.55, 0.5, 0.75);
  mustCentre.position.set(0.5, 3.33, 0.46 + 1.07);
  man.add(mustCentre);

  // Hair tuft on top
  for (let i = 0; i < 4; i++) {
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.1 - i * 0.015, 8, 8), hairMat);
    tuft.scale.set(0.5, 1.3 - i * 0.2, 0.5);
    tuft.position.set(0.5 + (i - 1.5) * 0.13, 4.04 - i * 0.03, 0.46 + 0.15 + i * 0.05);
    man.add(tuft);
  }

  // ── Arms (shoulder pivots for typing animation) ────────────────────────────
  // Each pivot is at the shoulder. Rotating pivot.rotation.x makes the hand bob.
  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(0.5 - 0.62, 2.1, 0.42);
  man.add(leftShoulder);

  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(0.5 + 0.62, 2.1, 0.42);
  man.add(rightShoulder);

  const armGeo  = new THREE.CylinderGeometry(0.12, 0.1, 0.82, 10);
  const foreGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.7, 10);
  const handGeo = new THREE.SphereGeometry(0.13, 12, 10);

  function buildArm(shoulder: typeof leftShoulder, side: -1 | 1) {
    // Upper arm — hangs slightly outward and forward
    const upper = new THREE.Mesh(armGeo, shirtMat);
    upper.rotation.set(0.55, 0, side * 0.4);
    upper.position.set(side * -0.12, -0.24, -0.25);
    shoulder.add(upper);

    // Forearm pivot at elbow
    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(side * -0.24, -0.55, -0.62);
    shoulder.add(elbowPivot);

    const fore = new THREE.Mesh(foreGeo, skinMat);
    fore.rotation.set(0.9, 0, side * 0.15);
    fore.position.set(side * -0.05, -0.22, -0.28);
    elbowPivot.add(fore);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.scale.set(1.1, 0.7, 1.2);
    hand.position.set(side * -0.08, -0.5, -0.6);
    elbowPivot.add(hand);

    return elbowPivot;
  }

  const leftElbow  = buildArm(leftShoulder,  -1);
  const rightElbow = buildArm(rightShoulder,   1);

  // ── Render loop ────────────────────────────────────────────────────────────
  let frameId = 0;
  let lastMs  = 0;

  function animate(ms: number) {
    frameId = requestAnimationFrame(animate);
    const dt = Math.min((ms - lastMs) / 1000, 0.05);
    lastMs = ms;
    const t = ms * 0.001;

    // Typing: arms alternate up/down by rotating shoulders
    const freq   = 5.8;
    const amp    = 0.09;
    leftShoulder.rotation.x  = -0.05 + Math.sin(t * freq)           * amp;
    rightShoulder.rotation.x = -0.05 + Math.sin(t * freq + Math.PI) * amp;

    // Elbow twitch (slightly out of phase for realism)
    leftElbow.rotation.x  =  0.06 * Math.sin(t * freq + 0.3);
    rightElbow.rotation.x =  0.06 * Math.sin(t * freq + Math.PI + 0.3);

    // Head nod (follows the screen slightly)
    head.rotation.x = -0.18 + Math.sin(t * 1.1) * 0.03;

    // Body micro-sway
    body.rotation.z = Math.sin(t * 0.7) * 0.012;
    man.rotation.y  = Math.sin(t * 0.45) * 0.03;

    // Screen pulse
    screenMat.emissiveIntensity = 0.65 + Math.sin(t * 2.2) * 0.07;
    screenGlow.intensity        = 5.5  + Math.sin(t * 2.2) * 0.5;

    // Cursor blink
    cursorMesh.visible = Math.floor(t * 1.5) % 2 === 0;
    // Cursor "moves" along bottom line occasionally
    cursorMesh.position.x = -1.18 + ((Math.floor(t * 0.8) * 0.37) % 2.1);

    renderer.render(scene, camera);
  }

  frameId = requestAnimationFrame(animate);

  // ── Resize ─────────────────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  ro.observe(canvas);

  return {
    dispose() {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      renderer.dispose();
    },
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LmptfyPage() {
  const location  = useLocation();
  const history   = useHistory();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef  = useRef<{ dispose: () => void } | null>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const [inputText,    setInputText]    = useState('');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [copied,       setCopied]       = useState(false);
  const [promptCopied, setPromptCopied] = useState<'chatgpt' | 'claude' | null>(null);

  const params       = new URLSearchParams(location.search);
  const rawQ         = params.get('q');
  const sharedPrompt = rawQ ? decodePrompt(rawQ) : null;
  const { displayed, done } = useTypingAnimation(sharedPrompt);

  useEffect(() => {
    if (!canvasRef.current) return;
    const api = buildPotatoScene(canvasRef.current);
    sceneRef.current = api;
    return () => { api.dispose(); sceneRef.current = null; };
  }, []);

  const handleGenerate = useCallback(() => {
    if (!inputText.trim()) return;
    const encoded = encodePrompt(inputText.trim());
    const url = `${window.location.origin}/tools/lmptfy?q=${encoded}`;
    setGeneratedUrl(url);
    setCopied(false);
    history.push(`/tools/lmptfy?q=${encoded}`);
  }, [inputText, history]);

  const handleCopyUrl = useCallback(async () => {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [generatedUrl]);

  const handleOpenAI = useCallback(
    async (target: 'chatgpt' | 'claude') => {
      const prompt = sharedPrompt ?? inputText.trim();
      if (!prompt) return;
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(target);
      setTimeout(() => setPromptCopied(null), 2500);
      const url = target === 'chatgpt' ? chatgptUrl(prompt) : claudeUrl(prompt);
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [sharedPrompt, inputText],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate],
  );

  const hasSharedPrompt = sharedPrompt !== null;

  return (
    <Layout
      title="LMPTFY — Let Me Prompt That For You"
      description="Generate a shareable link that types out an AI prompt for someone — tell them to just ask an AI already."
    >
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.breadcrumb}>
            <a href="/tools">Tools</a>
            <span> / </span>
            <span>LMPTFY</span>
          </div>
          <h1 className={styles.pageTitle}>Let Me Prompt That For You</h1>
          <p className={styles.pageSubtitle}>
            Generate a shareable link that shows someone how to just ask an AI.
          </p>
        </div>

        <div className={styles.layout}>
          {/* Scene */}
          <div className={styles.sceneWrap}>
            <canvas ref={canvasRef} className={styles.canvas} />
          </div>

          {/* Right panel */}
          <div className={styles.rightPanel}>
            {/* Shared prompt viewer */}
            {hasSharedPrompt && (
              <div className={styles.viewerSection}>
                <div className={styles.chatBox}>
                  <div className={styles.chatBoxContent}>
                    {displayed.length === 0 ? (
                      <span className={styles.chatPlaceholder}>
                        How can I help you today?
                        <span className={styles.caret} />
                      </span>
                    ) : (
                      <span className={styles.typedText}>
                        {displayed}
                        {!done && <span className={styles.caret} />}
                      </span>
                    )}
                  </div>
                  <div className={styles.chatBoxFooter}>
                    <button className={styles.attachBtn} aria-label="Attach" tabIndex={-1}>
                      <PlusIcon />
                    </button>
                    {done && (
                      <div className={styles.chipRow}>
                        <button
                          className={`${styles.aiChip} ${styles.chatgptChip}`}
                          onClick={() => handleOpenAI('chatgpt')}
                        >
                          <ChatGPTIcon />
                          Ask ChatGPT
                          {promptCopied === 'chatgpt' && (
                            <span className={styles.copiedBadge}>Prompt copied!</span>
                          )}
                        </button>
                        <button
                          className={`${styles.aiChip} ${styles.claudeChip}`}
                          onClick={() => handleOpenAI('claude')}
                        >
                          <ClaudeIcon />
                          Ask Claude
                          {promptCopied === 'claude' && (
                            <span className={styles.copiedBadge}>Prompt copied!</span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.divider}>
                  <span>or generate your own</span>
                </div>
              </div>
            )}

            {/* Generator */}
            <div className={styles.generatorSection}>
              <p className={styles.generatorLabel}>
                {hasSharedPrompt ? 'New LMPTFY link' : 'Type a prompt to generate a shareable link'}
              </p>
              <div className={styles.chatBox}>
                <textarea
                  ref={inputRef}
                  className={styles.chatInput}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="How can I help you today?"
                  rows={3}
                />
                <div className={styles.chatBoxFooter}>
                  <button className={styles.attachBtn} aria-label="Attach" tabIndex={-1}>
                    <PlusIcon />
                  </button>
                  <button
                    className={styles.sendCircleBtn}
                    onClick={handleGenerate}
                    disabled={!inputText.trim()}
                    title="Generate shareable link"
                  >
                    <ArrowUpIcon />
                  </button>
                </div>
              </div>

              {generatedUrl && (
                <div className={styles.resultBox}>
                  <span className={styles.resultUrl}>{generatedUrl}</span>
                  <button className={styles.copyBtn} onClick={handleCopyUrl}>
                    {copied ? '✓ Copied!' : 'Copy link'}
                  </button>
                </div>
              )}
            </div>

            <div className={styles.about}>
              <p>
                <strong>LMPTFY</strong> — share a link, let the typing animation do the
                passive-aggressive work.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatGPTIcon() {
  return (
    <svg className={styles.aiIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.843-3.371 2.019-1.168a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.4-.68zm2.010-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

function ClaudeIcon() {
  return (
    <svg className={styles.aiIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128-4.72-2.648-.23.097v5.56l.23.076zM19.37 15.955l-4.72-2.647-.08-.23.08-.128 4.72-2.648.23.097v5.56l-.23.076zM14.745 8.105l-2.744-4.72-.23-.08-.23.08-2.743 4.72.128.22h5.691l.128-.22zM14.745 15.895l-2.744 4.72-.23.08-.23-.08-2.743-4.72.128-.22h5.691l.128.22zM9.287 8.04l4.72 2.648.08.23-.08.128-4.72 2.647-.23-.08V8.117l.23-.076zM14.713 8.04l-4.72 2.648-.08.23.08.128 4.72 2.647.23-.08V8.117l-.23-.076z" />
    </svg>
  );
}
