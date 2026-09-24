// Space YZ client entry (Milestone 1: title screen + server connection check).
import './styles.css';
import * as THREE from 'three';
import { GAME_NAME } from '@space-yz/shared';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.Fog(0x05070d, 20, 70);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);

// A simple low-poly ship room with emissive trims.
const room = new THREE.Group();
const wallMat = new THREE.MeshLambertMaterial({ color: 0x1a2233, flatShading: true });
const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 40), wallMat);
floor.position.y = -0.5;
room.add(floor);
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 12, 1.5), wallMat);
  pillar.position.set(Math.cos(a) * 14, 6, Math.sin(a) * 14);
  room.add(pillar);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.15, 1.6),
    new THREE.MeshBasicMaterial({ color: i % 2 ? 0x19e3ff : 0xff8a1f }),
  );
  trim.position.set(pillar.position.x, 3, pillar.position.z);
  room.add(trim);
}
scene.add(room);
scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x101018, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(5, 10, 3);
scene.add(sun);

const resize = (): void => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
};
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  camera.position.set(Math.cos(t * 0.1) * 9, 3.5, Math.sin(t * 0.1) * 9);
  camera.lookAt(0, 2, 0);
  renderer.render(scene, camera);
});

ui.innerHTML = `
  <div class="screen">
    <h1 class="title">${GAME_NAME.toUpperCase()}</h1>
    <div class="subtitle">Gravity arena</div>
    <div class="status" id="server-status"><span class="dot"></span>Connecting to server…</div>
  </div>`;

const statusEl = document.getElementById('server-status') as HTMLDivElement;
const setStatus = (ok: boolean | null, text: string): void => {
  statusEl.innerHTML = `<span class="dot ${ok === null ? '' : ok ? 'ok' : 'bad'}"></span>`;
  statusEl.append(text);
};

const connect = (): void => {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  let timer = 0;
  ws.onopen = () => {
    const ping = (): void => ws.send(JSON.stringify({ t: 'ping', c: performance.now() }));
    ping();
    timer = window.setInterval(ping, 1000);
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data)) as { t: string; c?: number };
    if (msg.t === 'pong' && typeof msg.c === 'number') {
      setStatus(true, `Server: connected · ${Math.round(performance.now() - msg.c)} ms`);
    }
  };
  ws.onclose = () => {
    window.clearInterval(timer);
    setStatus(false, 'Server: not connected (retrying…)');
    window.setTimeout(connect, 2000);
  };
};
connect();
