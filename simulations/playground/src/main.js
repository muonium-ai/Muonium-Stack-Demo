import './styles.css';
import { PhysicsRuntime } from './physics/runtime.js';
import { PlaygroundRenderer } from './render/scene.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <section class="shell">
    <h1>Muonium Physics Playground</h1>
    <p class="subtitle">T-000046 Rapier bootstrap and fixed-step runtime</p>

    <section class="controls" aria-label="Physics controls">
      <button id="initBtn" type="button">Initialize Rapier</button>
      <button id="startBtn" type="button" disabled>Start</button>
      <button id="pauseBtn" type="button" disabled>Pause</button>
      <button id="resetBtn" type="button" disabled>Reset World</button>
      <label>
        Speed
        <select id="speedSelect">
          <option value="0.5">0.5x</option>
          <option value="1" selected>1.0x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2.0x</option>
          <option value="3">3.0x</option>
        </select>
      </label>
    </section>

    <p id="runtimeStatus" class="status">Status: idle</p>

    <section class="viewportPanel" aria-label="Playground viewport">
      <div id="viewport" class="viewport"></div>
    </section>

    <section class="telemetry" aria-label="Runtime telemetry">
      <h2>Timing stream</h2>
      <dl>
        <div><dt>Frame time</dt><dd id="frameTime">0.00 ms</dd></div>
        <div><dt>Physics step time</dt><dd id="stepTime">0.00 ms</dd></div>
        <div><dt>Sub-steps/frame</dt><dd id="subSteps">0</dd></div>
        <div><dt>Total steps</dt><dd id="totalSteps">0</dd></div>
        <div><dt>Accumulator</dt><dd id="accumulator">0.0000 s</dd></div>
        <div><dt>Cube Y</dt><dd id="cubeY">0.000</dd></div>
        <div><dt>Velocity Y</dt><dd id="velocityY">0.000</dd></div>
      </dl>
    </section>
  </section>
`;

const runtime = new PhysicsRuntime();
const renderer = new PlaygroundRenderer();

const initBtn = document.querySelector('#initBtn');
const startBtn = document.querySelector('#startBtn');
const pauseBtn = document.querySelector('#pauseBtn');
const resetBtn = document.querySelector('#resetBtn');
const speedSelect = document.querySelector('#speedSelect');
const runtimeStatus = document.querySelector('#runtimeStatus');

const frameTime = document.querySelector('#frameTime');
const stepTime = document.querySelector('#stepTime');
const subSteps = document.querySelector('#subSteps');
const totalSteps = document.querySelector('#totalSteps');
const accumulator = document.querySelector('#accumulator');
const cubeY = document.querySelector('#cubeY');
const velocityY = document.querySelector('#velocityY');
const viewport = document.querySelector('#viewport');

renderer.init(viewport);

const setStatus = (message, isError = false) => {
  runtimeStatus.textContent = `Status: ${message}`;
  runtimeStatus.dataset.state = isError ? 'error' : 'ok';
};

runtime.onState((snapshot) => {
  initBtn.disabled = snapshot.initialized;
  startBtn.disabled = !snapshot.initialized || snapshot.running;
  pauseBtn.disabled = !snapshot.initialized || !snapshot.running;
  resetBtn.disabled = !snapshot.initialized;
});

runtime.onTiming((timing, snapshot) => {
  renderer.applySnapshot(snapshot);
  frameTime.textContent = `${timing.frameTimeMs.toFixed(2)} ms`;
  stepTime.textContent = `${timing.physicsStepTimeMs.toFixed(3)} ms`;
  subSteps.textContent = String(timing.steppedFrames);
  totalSteps.textContent = String(snapshot.totalSteps);
  accumulator.textContent = `${snapshot.accumulatorSeconds.toFixed(4)} s`;
  cubeY.textContent = snapshot.cubeY.toFixed(3);
  velocityY.textContent = snapshot.velocityY.toFixed(3);
});

initBtn.addEventListener('click', async () => {
  setStatus('initializing Rapier...');
  const result = await runtime.init();
  if (!result.ok) {
    setStatus(`init failed (${result.error})`, true);
    return;
  }
  setStatus('Rapier initialized');
});

startBtn.addEventListener('click', () => {
  runtime.start();
  renderer.start();
  setStatus(`running at ${runtime.speedMultiplier.toFixed(1)}x`);
});

pauseBtn.addEventListener('click', () => {
  runtime.pause();
  renderer.pause();
  setStatus('paused');
});

resetBtn.addEventListener('click', () => {
  runtime.resetWorld();
  renderer.reset();
  setStatus('world reset');
});

speedSelect.addEventListener('change', (event) => {
  const nextSpeed = Number(event.target.value);
  runtime.setSpeedMultiplier(nextSpeed);
  const label = runtime.running ? `running at ${nextSpeed.toFixed(1)}x` : `speed set to ${nextSpeed.toFixed(1)}x`;
  setStatus(label);
});

setStatus('idle (click Initialize Rapier)');

window.addEventListener('beforeunload', () => {
  runtime.dispose();
  renderer.dispose();
});

