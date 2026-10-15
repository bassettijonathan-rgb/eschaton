import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { COURTS } from './engine/theater';
import { buildTheaterScene } from './render/theaterScene';
import './style.css';

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function start(container: HTMLElement): void {
  if (!webglAvailable()) {
    container.textContent =
      'This browser cannot draw the courts (WebGL is unavailable). Try a current Chrome, Firefox or Safari.';
    document.body.dataset['ready'] = 'no-webgl';
    return;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'East Courts 6 through 9, seen from above');
  renderer.domElement.setAttribute('role', 'img');

  const { scene, courts } = buildTheaterScene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
  camera.position.set(0, 70, 55);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.minDistance = 10;
  controls.maxDistance = 200;
  // Keep the camera above the courts: from straight down to a low tilt.
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

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  document.body.dataset['courts'] = String(courts.length);
  document.body.dataset['ready'] = 'true';
}

const container = document.getElementById('theater');
if (!container) throw new Error('missing #theater');
start(container);

const legend = document.getElementById('court-list');
if (legend) legend.textContent = COURTS.map((c) => `Court ${String(c.number)}`).join(' · ');
