import type { Group, Mesh, MeshStandardMaterial, Object3D } from 'three';

export interface MilestoneMeta {
  id: string;
  title: string;
  quarter: string;
  href: string;
  summary: string;
}

export const ROADMAP_MILESTONES: MilestoneMeta[] = [
  {
    id: 'merge',
    title: 'GitHub Integration with Merge Queue',
    quarter: 'Q3 2026',
    href: '#github-integration-with-merge-queue',
    summary: 'Enqueue stacked PRs from the app, one layer or the full stack.',
  },
  {
    id: 'checks',
    title: 'Workspace Checks',
    quarter: 'Q3 2026',
    href: '#workspace-checks',
    summary: 'Assertion-based quality gates for agentic self-fixing loops.',
  },
  {
    id: 'ssh',
    title: 'SSH Remote Development',
    quarter: 'Q4 2026',
    href: '#ssh-remote-development',
    summary: 'Open a remote workspace over SSH and develop there directly.',
  },
];

export interface RoadmapSceneAPI {
  setActive: (index: number) => void;
  dispose: () => void;
}

type ThreeModule = typeof import('three/src/Three.js');

const NODE_X = [-3.4, 0, 3.4] as const;
const ACTIVE_MS = 4200;

function makeMat(
  THREE: ThreeModule,
  color: number,
  opts: { roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number } = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.15,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

function buildMergeIcon(THREE: ThreeModule): Group {
  const group = new THREE.Group();
  const cardMat = makeMat(THREE, 0x3b9cff, { roughness: 0.4, metalness: 0.2 });
  const accentMat = makeMat(THREE, 0x0ea5e9, { roughness: 0.35, metalness: 0.25 });
  const railMat = makeMat(THREE, 0x64748b, { roughness: 0.7 });

  for (let i = 0; i < 3; i++) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.5), cardMat);
    card.position.set(-0.35, 0.55 + i * 0.18, 0.05 * i);
    card.rotation.y = -0.12 + i * 0.04;
    card.castShadow = true;
    card.userData.kind = 'stackCard';
    card.userData.baseY = card.position.y;
    group.add(card);
  }

  const channel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.34), railMat);
  channel.position.set(0.55, 0.42, 0);
  channel.castShadow = true;
  group.add(channel);

  const out = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.34), accentMat);
  out.position.set(1.15, 0.42, 0);
  out.castShadow = true;
  out.userData.kind = 'queueOut';
  group.add(out);

  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 10), accentMat);
  arrow.rotation.z = -Math.PI / 2;
  arrow.position.set(1.45, 0.42, 0);
  group.add(arrow);

  return group;
}

function buildChecksIcon(THREE: ThreeModule): Group {
  const group = new THREE.Group();
  const frameMat = makeMat(THREE, 0x475569, { roughness: 0.65 });
  const passMat = makeMat(THREE, 0x22c55e, {
    roughness: 0.4,
    metalness: 0.2,
    emissive: 0x166534,
    emissiveIntensity: 0.15,
  });
  const pendingMat = makeMat(THREE, 0x94a3b8, { roughness: 0.7 });

  const left = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 0.12), frameMat);
  left.position.set(-0.55, 0.7, 0);
  left.castShadow = true;
  group.add(left);

  const right = left.clone();
  right.position.x = 0.55;
  group.add(right);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.12, 0.14), frameMat);
  lintel.position.set(0, 1.25, 0);
  lintel.castShadow = true;
  group.add(lintel);

  const colors = [passMat, passMat, pendingMat];
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.14), colors[i]);
    bar.position.set(-0.28 + i * 0.28, 0.55, 0);
    bar.castShadow = true;
    bar.userData.kind = 'checkBar';
    bar.userData.index = i;
    bar.userData.passMat = passMat;
    bar.userData.pendingMat = pendingMat;
    group.add(bar);
  }

  const markStem = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), passMat);
  markStem.position.set(0.05, 1.55, 0.05);
  markStem.rotation.z = -0.55;
  group.add(markStem);

  const markHook = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), passMat);
  markHook.position.set(-0.14, 1.42, 0.05);
  markHook.rotation.z = 0.7;
  group.add(markHook);

  return group;
}

function buildSshIcon(THREE: ThreeModule): Group {
  const group = new THREE.Group();
  const deviceMat = makeMat(THREE, 0x334155, { roughness: 0.5, metalness: 0.35 });
  const screenMat = makeMat(THREE, 0x3b9cff, {
    roughness: 0.3,
    metalness: 0.4,
    emissive: 0x1d4ed8,
    emissiveIntensity: 0.35,
  });
  const rackMat = makeMat(THREE, 0x1e293b, { roughness: 0.55, metalness: 0.4 });
  const ledMat = makeMat(THREE, 0x22c55e, {
    roughness: 0.3,
    emissive: 0x16a34a,
    emissiveIntensity: 0.55,
  });
  const linkMat = makeMat(THREE, 0x38bdf8, {
    roughness: 0.35,
    metalness: 0.2,
    emissive: 0x0284c7,
    emissiveIntensity: 0.4,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.45), deviceMat);
  base.position.set(-0.7, 0.28, 0);
  base.castShadow = true;
  group.add(base);

  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.05), screenMat);
  screen.position.set(-0.7, 0.55, -0.12);
  screen.rotation.x = -0.18;
  screen.castShadow = true;
  group.add(screen);

  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.95, 0.4), rackMat);
  rack.position.set(0.75, 0.55, 0);
  rack.castShadow = true;
  group.add(rack);

  for (let i = 0; i < 4; i++) {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), ledMat);
    led.position.set(0.55, 0.3 + i * 0.18, 0.22);
    group.add(led);
  }

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.15, 10), linkMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(0.05, 0.55, 0);
  group.add(beam);

  for (let i = 0; i < 3; i++) {
    const packet = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), linkMat);
    packet.position.set(-0.35 + i * 0.35, 0.55, 0);
    packet.userData.kind = 'sshPacket';
    packet.userData.phase = i / 3;
    group.add(packet);
  }

  return group;
}

function setGroupDim(root: Object3D, active: boolean) {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    if (!mat || typeof mat !== 'object') return;
    mat.transparent = true;
    mat.opacity = active ? 1 : 0.38;
    if ('emissiveIntensity' in mat) {
      const base = (mesh.userData.baseEmissive as number | undefined) ?? mat.emissiveIntensity ?? 0;
      if (mesh.userData.baseEmissive === undefined) {
        mesh.userData.baseEmissive = mat.emissiveIntensity ?? 0;
      }
      mat.emissiveIntensity = active ? base : base * 0.15;
    }
  });
}

export async function buildRoadmapScene(
  canvas: HTMLCanvasElement,
  options: {
    dark: boolean;
    reducedMotion: boolean;
    onActiveChange: (index: number) => void;
  },
): Promise<RoadmapSceneAPI> {
  const THREE = await import('three/src/Three.js');
  const {
    WebGLRenderer,
    Scene,
    Color,
    Fog,
    PerspectiveCamera,
    AmbientLight,
    DirectionalLight,
    HemisphereLight,
    Group,
    Mesh,
    BoxGeometry,
    CylinderGeometry,
    SphereGeometry,
    MeshStandardMaterial,
    MathUtils,
  } = THREE;

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const fogColor = options.dark ? 0x0b1220 : 0xe8f3ff;
  scene.fog = new Fog(fogColor, 10, 22);

  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 3.2, 8.2);
  camera.lookAt(0, 1.1, 0);

  scene.add(new AmbientLight(0xffffff, options.dark ? 0.45 : 0.7));
  scene.add(new HemisphereLight(options.dark ? 0x1e3a5f : 0xdbeafe, options.dark ? 0x0f172a : 0xf8fafc, 0.7));

  const key = new DirectionalLight(0xffffff, options.dark ? 1.1 : 1.35);
  key.position.set(4, 8, 5);
  scene.add(key);

  const fill = new DirectionalLight(0x3b9cff, options.dark ? 0.45 : 0.35);
  fill.position.set(-5, 3, -2);
  scene.add(fill);

  const ground = new Mesh(
    new BoxGeometry(14, 0.08, 4.5),
    new MeshStandardMaterial({
      color: options.dark ? 0x111827 : 0xffffff,
      roughness: 0.92,
      metalness: 0.05,
      transparent: true,
      opacity: options.dark ? 0.55 : 0.65,
    }),
  );
  ground.position.y = -0.04;
  scene.add(ground);

  const railMat = new MeshStandardMaterial({
    color: options.dark ? 0x334155 : 0xcbd5e1,
    roughness: 0.6,
    metalness: 0.2,
  });
  const rail = new Mesh(new CylinderGeometry(0.06, 0.06, 8.2, 16), railMat);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 0.18, 0);
  scene.add(rail);

  const progressMat = new MeshStandardMaterial({
    color: 0x3b9cff,
    roughness: 0.35,
    metalness: 0.25,
    emissive: 0x1d4ed8,
    emissiveIntensity: options.dark ? 0.45 : 0.25,
  });
  const progress = new Mesh(new CylinderGeometry(0.075, 0.075, 1, 16), progressMat);
  progress.rotation.z = Math.PI / 2;
  progress.position.set(NODE_X[0], 0.18, 0);
  scene.add(progress);

  const iconBuilders = [buildMergeIcon, buildChecksIcon, buildSshIcon];
  const milestones: Group[] = [];
  const nodes: Mesh[] = [];

  for (let i = 0; i < 3; i++) {
    const pedestal = new Group();
    pedestal.position.set(NODE_X[i], 0, 0);

    const disk = new Mesh(
      new CylinderGeometry(0.55, 0.62, 0.1, 24),
      new MeshStandardMaterial({
        color: options.dark ? 0x1f2937 : 0xf1f5f9,
        roughness: 0.7,
        metalness: 0.1,
      }),
    );
    disk.position.y = 0.12;
    pedestal.add(disk);

    const node = new Mesh(
      new SphereGeometry(0.14, 18, 18),
      new MeshStandardMaterial({
        color: 0x3b9cff,
        roughness: 0.3,
        metalness: 0.35,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.2,
      }),
    );
    node.position.y = 0.28;
    pedestal.add(node);
    nodes.push(node);

    const icon = iconBuilders[i](THREE);
    icon.position.y = 0.35;
    icon.scale.setScalar(0.95);
    pedestal.add(icon);

    scene.add(pedestal);
    milestones.push(pedestal);
    setGroupDim(pedestal, i === 0);
  }

  let active = 0;
  let targetCamX: number = NODE_X[0];
  let disposed = false;
  let autoTimer: ReturnType<typeof setInterval> | null = null;
  let raf = 0;
  const clock = { t: 0 };

  const resize = () => {
    const w = canvas.clientWidth || 960;
    const h = canvas.clientHeight || 420;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const setActive = (index: number) => {
    active = ((index % 3) + 3) % 3;
    targetCamX = NODE_X[active];
    milestones.forEach((m, i) => setGroupDim(m, i === active));
    options.onActiveChange(active);
  };

  const animate = () => {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    clock.t += 0.016;

    const camX = MathUtils.damp(camera.position.x, targetCamX * 0.35, 4, 0.016);
    camera.position.x = camX;
    camera.position.y = 3.15 + Math.sin(clock.t * 0.7) * (options.reducedMotion ? 0 : 0.05);
    camera.lookAt(targetCamX * 0.55, 1.05, 0);

    const span = NODE_X[2] - NODE_X[0];
    const filled = NODE_X[0] + ((active + 1) / 3) * span;
    const length = Math.max(0.2, filled - NODE_X[0]);
    progress.scale.set(1, length, 1);
    progress.position.x = NODE_X[0] + length / 2;

    milestones.forEach((m, i) => {
      const focus = i === active ? 1 : 0;
      const bob = options.reducedMotion ? 0 : Math.sin(clock.t * 2 + i) * 0.03 * focus;
      m.position.y = bob;
      m.rotation.y = options.reducedMotion ? 0 : Math.sin(clock.t * 0.8 + i) * 0.08 * focus;

      m.traverse((obj) => {
        const mesh = obj as Mesh;
        if (!mesh.isMesh || !mesh.userData.kind) return;
        if (mesh.userData.kind === 'stackCard' && focus) {
          const baseY = mesh.userData.baseY as number;
          mesh.position.y = baseY + Math.sin(clock.t * 3 + mesh.position.x) * 0.03;
        }
        if (mesh.userData.kind === 'queueOut' && focus) {
          mesh.position.x = 1.15 + Math.sin(clock.t * 2.4) * 0.04;
        }
        if (mesh.userData.kind === 'checkBar' && focus) {
          const idx = mesh.userData.index as number;
          const on = (clock.t * 1.2 + idx * 0.35) % 3 < 2.1;
          mesh.material = on ? mesh.userData.passMat : mesh.userData.pendingMat;
          mesh.scale.y = on ? 1 : 0.55;
        }
        if (mesh.userData.kind === 'sshPacket' && focus) {
          const phase = mesh.userData.phase as number;
          const u = (phase + clock.t * 0.35) % 1;
          mesh.position.x = -0.45 + u * 1.2;
          mesh.position.y = 0.55 + Math.sin(u * Math.PI) * 0.08;
        }
      });
    });

    nodes.forEach((node, i) => {
      const mat = node.material as MeshStandardMaterial;
      mat.emissiveIntensity = i === active ? 0.65 : 0.12;
      node.scale.setScalar(i === active ? 1.25 : 1);
    });

    renderer.render(scene, camera);
  };

  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  setActive(0);
  animate();

  if (!options.reducedMotion) {
    autoTimer = setInterval(() => setActive(active + 1), ACTIVE_MS);
  }

  return {
    setActive: (index: number) => {
      setActive(index);
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = setInterval(() => setActive(active + 1), ACTIVE_MS);
      }
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (autoTimer) clearInterval(autoTimer);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      scene.traverse((obj) => {
        const mesh = obj as Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose?.();
        }
      });
    },
  };
}
