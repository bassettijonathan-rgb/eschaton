import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { layoutApparatus } from './engine/apparatus';
import { COMBATANTS } from './engine/data/combatants';
import { TARGETS } from './engine/data/targets';
import type { Viewer } from './engine/buckets';
import { nextComputerAction } from './engine/ai';
import { itemsOf, type Action } from './engine/game';
import { platformsFor, solveSpeed, type LobResult } from './engine/lob';
import { project, unproject } from './engine/projection';
import { COURTS } from './engine/theater';
import { COMBATANT_IDS, type CombatantId, type LonLat } from './engine/types';
import { BEANIE_COLOURS, buildApparatus, buildPavilion } from './render/apparatus';
import { AimPreview, FlightPlayer } from './render/flight';
import { PlumeLayer } from './render/plumes';
import { buildGarments, type PickTag } from './render/garments';
import { buildMapMesh } from './render/mapTexture';
import { buildTheaterScene, toWorld } from './render/theaterScene';
import { CourtWeather } from './render/weather';
import { mountAllocationPanel } from './ui/allocationPanel';
import { describeApparatus, describeDamage, describeTarget } from './ui/describe';
import { mountInspector } from './ui/inspector';
import { mountLegendPanel } from './ui/legendPanel';
import { mountLobPanel, type LobPanelHooks } from './ui/lobPanel';
import { dispatch, getState, launch, onStateChange } from './ui/store';
import { getControllers, isFast, onComputersChange } from './ui/computers';
import { mountGamePanel } from './ui/gamePanel';
import { mountHandOff } from './ui/handoff';
import { getViewer, setViewer } from './ui/viewer';
import { mountYushityu } from './ui/yushityu';
import './style.css';

declare global {
  interface Window {
    /** Test hooks: where an object named on the courts appears on screen. */
    eschaton?: {
      screenPosition(name: string): { x: number; y: number } | null;
      /** A perfectly timed lob from a platform at a target, by name: for tests and demonstrations. */
      perfectLob(
        combatant: CombatantId,
        platform: string,
        target: string,
        warheads?: number,
      ): string[];
      /** Apply a game action directly, as the panels do: for tests. */
      dispatch(action: Action): string[];
    };
  }
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function findPickTag(object: THREE.Object3D | null): PickTag | undefined {
  for (let o = object; o; o = o.parent) {
    const pick = o.userData['pick'] as PickTag | undefined;
    if (pick) return pick;
  }
  return undefined;
}

/** Ask the person at the screen to click a spot on the courts; set once the courts are drawn. */
let pickPoint: () => Promise<LonLat | undefined> = () => Promise.resolve(undefined);

function start(container: HTMLElement): void {
  if (!webglAvailable()) {
    container.textContent =
      'This browser cannot draw the courts (WebGL is unavailable). Try a current Chrome, Firefox or Safari.';
    document.body.dataset['ready'] = 'no-webgl';
    return;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    'aria-label',
    'East Courts 6 through 9 seen from above, with the world drawn on them and the target garments laid out',
  );
  renderer.domElement.setAttribute('role', 'img');

  const { scene, courts } = buildTheaterScene();
  scene.add(buildMapMesh());
  const garments = buildGarments(TARGETS);
  scene.add(garments);
  const layout = layoutApparatus(getState().situation, COMBATANTS);
  const apparatus = buildApparatus(layout);
  scene.add(apparatus);
  const pavilion = buildPavilion();
  scene.add(pavilion);

  const flights = new FlightPlayer();
  scene.add(flights.group);
  const aimPreview = new AimPreview();
  scene.add(aimPreview.group);
  const plumes = new PlumeLayer();
  scene.add(plumes.group);
  const weather = new CourtWeather();
  scene.add(weather.group);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 600);
  camera.position.set(0, 70, 55);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.minDistance = 1.5;
  controls.zoomToCursor = true;
  controls.maxDistance = 200;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI * 0.45;

  const resize = (): void => {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // Picking: a click (not a drag) names what is under the pointer.
  const inspector = mountInspector(document.body);
  const raycaster = new THREE.Raycaster();
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.26, 40),
    new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide, depthTest: false }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  marker.renderOrder = 10;
  scene.add(marker);
  const lobHooks: LobPanelHooks = {
    onAimingChange(on) {
      renderer.domElement.style.cursor = on ? 'crosshair' : '';
    },
    onPreview(from, to) {
      aimPreview.show(from, to);
    },
    isFlying: () => flights.busy(),
  };
  const lobPanel = mountLobPanel(document.body, lobHooks);

  // Play each new lob as it is flown, one after another.
  let played = 0;
  const queue: LobResult[] = [];
  const playNext = (): void => {
    const result = queue.shift();
    if (!result) {
      document.body.dataset['flying'] = 'false';
      return;
    }
    document.body.dataset['flying'] = 'true';
    flights.play(result, performance.now() / 1000, undefined, () => {
      lobPanel.showResult(result);
      plumes.update(getState().endstat);
      showSelected();
      document.body.dataset['lobs'] = String(getState().lobs.length);
      playNext();
    });
  };
  // The game-master's beanie wears the game's state.
  const beanie = scene.getObjectByName('beanie');
  const showBeanie = (): void => {
    if (beanie instanceof THREE.Mesh && beanie.material instanceof THREE.MeshLambertMaterial)
      beanie.material.color.setHex(BEANIE_COLOURS[getState().beanie]);
    document.body.dataset['beanie'] = getState().beanie;
  };
  showBeanie();
  // Snow and rain on the courts are drawn, and that is all they are.
  const showWeather = (): void => {
    weather.set(getState().courtWeather);
    document.body.dataset['courtWeather'] = getState().courtWeather;
  };
  showWeather();
  // Submarines and carrier groups lie where their owners last moved them.
  const placeShips = (): void => {
    for (const item of itemsOf(getState())) {
      if (!item.mobile) continue;
      const obj = garments.getObjectByName(`target-${item.id}`);
      const { x, y } = project(item.at);
      obj?.position.copy(toWorld(x, y, 0.003));
    }
  };
  onStateChange((s) => {
    showBeanie();
    showWeather();
    placeShips();
    if (s.lobs.length < played) {
      // A new game: clear the courts.
      played = 0;
      queue.length = 0;
      flights.reset();
      plumes.update(s.endstat);
    }
    if (s.lobs.length > played) {
      queue.push(...s.lobs.slice(played));
      played = s.lobs.length;
      if (!flights.busy()) playNext();
    }
  });
  const courtPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let down: { x: number; y: number } | null = null;
  let selected: PickTag | undefined;
  let picking: ((p: LonLat | undefined) => void) | undefined;
  pickPoint = () => {
    picking?.(undefined);
    renderer.domElement.style.cursor = 'crosshair';
    document.body.dataset['picking'] = 'true';
    return new Promise((resolve) => {
      picking = (p) => {
        picking = undefined;
        renderer.domElement.style.cursor = '';
        document.body.dataset['picking'] = 'false';
        resolve(p);
      };
    });
  };

  const showSelected = (): void => {
    if (!selected) return;
    if (selected.kind === 'target') {
      const item = TARGETS.find((t) => t.id === selected?.id);
      if (item) {
        const d = describeTarget(item);
        inspector.show({ ...d, lines: [...d.lines, ...describeDamage(item, getState().endstat)] });
      }
    } else {
      const a = layout.find((x) => x.id === selected?.id);
      if (a) inspector.show(describeApparatus(a, getViewer(), getState().supply));
      else if (selected.id === 'pavilion')
        inspector.show({
          title: "The spectators' pavilion",
          lines: ['Outside the fence. Spectators, and Pemulis, watch from here.'],
        });
    }
  };

  renderer.domElement.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    if (picking) {
      const p = raycaster.ray.intersectPlane(courtPlane, new THREE.Vector3());
      picking(p ? unproject({ x: p.x, y: -p.z }) : undefined);
      return;
    }
    if (lobPanel.aiming()) {
      const p = raycaster.ray.intersectPlane(courtPlane, new THREE.Vector3());
      if (p) lobPanel.setAim({ x: p.x, y: -p.z });
      return;
    }
    const hit = raycaster.intersectObjects([garments, apparatus, pavilion], true)[0];
    selected = hit ? findPickTag(hit.object) : undefined;
    if (!selected || !hit) {
      marker.visible = false;
      inspector.clear();
      return;
    }
    let owner: THREE.Object3D | null = hit.object;
    while (owner && !owner.userData['pick']) owner = owner.parent;
    if (owner) marker.position.set(owner.position.x, 0.01, owner.position.z);
    marker.visible = true;
    showSelected();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      picking?.(undefined);
      selected = undefined;
      marker.visible = false;
      inspector.clear();
    }
  });

  // Who is looking at the screen.
  const viewSelect = document.getElementById('viewer') as HTMLSelectElement | null;
  if (viewSelect) {
    viewSelect.append(
      ...COMBATANT_IDS.map((id) => {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = COMBATANTS[id].code;
        return o;
      }),
    );
    const handOff = mountHandOff(document.body);
    const current = (): string => {
      const v = getViewer();
      return v.kind === 'gameMaster' ? 'gm' : v.id;
    };
    viewSelect.addEventListener('change', () => {
      const v = viewSelect.value;
      const next: Viewer =
        v === 'gm' ? { kind: 'gameMaster' } : { kind: 'combatant', id: v as CombatantId };
      void handOff.ask(next).then((ok) => {
        if (!ok) {
          viewSelect.value = current();
          return;
        }
        setViewer(next);
        showSelected();
      });
    });
  }

  window.eschaton = {
    dispatch(action) {
      const o = dispatch(action);
      return o.ok ? [] : [...o.problems];
    },
    perfectLob(combatant, platformName, targetName, warheads = 1) {
      const platform = platformsFor(combatant, getState().situation, itemsOf(getState())).find(
        (p) => p.name === platformName,
      );
      const target = TARGETS.find((t) => t.name === targetName);
      if (!platform || !target) return [`no platform ${platformName} or target ${targetName}`];
      const elevation = (55 * Math.PI) / 180;
      const topspinRpm = warheads > 1 ? 0 : 1500;
      const aim = solveSpeed(
        project(platform.at),
        project(target.at),
        elevation,
        topspinRpm,
        warheads,
      );
      if (!aim) return ['out of reach'];
      const outcome = launch({
        combatant,
        platformId: platform.id,
        warheads,
        swing: { bearing: aim.bearing, elevation, speed: aim.speed, topspinRpm, timing: 0 },
        aimAt: target.at,
      });
      return outcome.ok ? [] : [...outcome.problems];
    },
    screenPosition(name) {
      const obj = scene.getObjectByName(name);
      if (!obj) return null;
      const p = new THREE.Vector3();
      obj.getWorldPosition(p);
      p.y += 0.02;
      p.project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return {
        x: rect.left + ((p.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - p.y) / 2) * rect.height,
      };
    },
  };

  // The computer players move one action at a time, between flights and hand-offs.
  const computerMove = (): void => {
    if (flights.busy() || queue.length > 0) return;
    if (document.getElementById('handoff')?.hidden === false) return;
    const action = nextComputerAction(getState(), getControllers());
    if (action) dispatch(action);
  };
  let cpuTimer = 0;
  const pace = (): void => {
    flights.timeScale = isFast() ? 12 : 1;
    window.clearInterval(cpuTimer);
    cpuTimer = window.setInterval(computerMove, isFast() ? 120 : 600);
  };
  onComputersChange(pace);
  pace();

  renderer.setAnimationLoop(() => {
    controls.update();
    flights.update(performance.now() / 1000);
    weather.update(performance.now() / 1000);
    renderer.render(scene, camera);
  });

  document.body.dataset['courts'] = String(courts.length);
  document.body.dataset['garments'] = String(garments.children.length);
  document.body.dataset['ready'] = 'true';
}

const container = document.getElementById('theater');
if (!container) throw new Error('missing #theater');
start(container);

const legend = document.getElementById('court-list');
if (legend) legend.textContent = COURTS.map((c) => `Court ${String(c.number)}`).join(' · ');
mountAllocationPanel(document.body);
const yushityu = mountYushityu(document.body);
mountGamePanel(document.body, { crunch: yushityu.crunch, pickPoint: () => pickPoint() });
mountLegendPanel(document.body);
