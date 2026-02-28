import './styles.css';
import { PhysicsRuntime } from './physics/runtime.js';
import { PlaygroundRenderer } from './render/scene.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <section class="shell">
    <h1>Muonium Physics Playground</h1>
    <p class="subtitle">T-000050 Trigger mechanism sequence</p>

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

    <section class="controls ballControls" aria-label="Falling balls controls">
      <label>
        Balls
        <input id="ballCountInput" type="number" min="1" max="12" step="1" value="4" />
      </label>
      <label>
        Ball material
        <select id="ballMaterialSelect">
          <option value="wood" selected>Wood</option>
          <option value="rubber">Rubber</option>
          <option value="metal">Metal</option>
        </select>
      </label>
      <label class="toggleWrap" for="gravityEnabledToggle">
        Gravity
        <input id="gravityEnabledToggle" type="checkbox" checked />
      </label>
      <label>
        Gravity strength
        <input id="gravityStrengthInput" type="number" min="0" max="2.5" step="0.1" value="1.0" />
      </label>
      <button id="ballCreateBtn" type="button" disabled>Spawn Balls</button>
    </section>

    <section class="controls dominoControls" aria-label="Domino controls">
      <label>
        Dominoes
        <input id="dominoCountInput" type="number" min="50" max="200" step="1" value="60" />
      </label>
      <label>
        Spacing
        <input id="dominoSpacingInput" type="number" min="0.22" max="0.80" step="0.01" value="0.34" />
      </label>
      <label>
        Material
        <select id="dominoMaterialSelect">
          <option value="wood" selected>Wood</option>
          <option value="rubber">Rubber</option>
          <option value="metal">Metal</option>
        </select>
      </label>
      <button id="dominoCreateBtn" type="button" disabled>Create Chain</button>
      <button id="dominoTriggerBtn" type="button" disabled>Trigger Chain</button>
    </section>

    <section class="controls triggerControls" aria-label="Trigger mechanism controls">
      <button id="triggerRunBtn" type="button" disabled>Run Trigger Sequence</button>
    </section>

    <section class="controls leverControls" aria-label="Lever controls">
      <label>
        Left weight
        <input id="leverLeftWeightInput" type="number" min="0.2" max="8" step="0.1" value="1.5" />
      </label>
      <label>
        Right weight
        <input id="leverRightWeightInput" type="number" min="0.2" max="8" step="0.1" value="1.5" />
      </label>
      <button id="leverApplyBtn" type="button" disabled>Apply Lever Weights</button>
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

    <section class="telemetry" aria-label="Domino telemetry">
      <h2>Domino metrics</h2>
      <dl>
        <div><dt>Count</dt><dd id="dominoCountMetric">0</dd></div>
        <div><dt>Fall time avg</dt><dd id="dominoFallAvgMetric">0.000 s</dd></div>
        <div><dt>Collision events</dt><dd id="dominoCollisionMetric">0</dd></div>
        <div><dt>Max velocity</dt><dd id="dominoVelocityMetric">0.000</dd></div>
        <div><dt>Chain speed</dt><dd id="dominoChainSpeedMetric">0.00 dom/s</dd></div>
      </dl>
    </section>

    <section class="telemetry" aria-label="Ball telemetry">
      <h2>Ball metrics</h2>
      <dl>
        <div><dt>Ball count</dt><dd id="ballCountMetric">0</dd></div>
        <div><dt>Fall time avg</dt><dd id="ballFallAvgMetric">0.000 s</dd></div>
        <div><dt>Bounce count</dt><dd id="ballBounceMetric">0</dd></div>
        <div><dt>Max height</dt><dd id="ballMaxHeightMetric">0.000</dd></div>
        <div><dt>Impact force (max)</dt><dd id="ballImpactMetric">0.000</dd></div>
      </dl>
    </section>

    <section class="telemetry" aria-label="Trigger telemetry">
      <h2>Trigger metrics</h2>
      <dl>
        <div><dt>Sequence time</dt><dd id="triggerSequenceMetric">0.000 s</dd></div>
        <div><dt>Event order</dt><dd id="triggerOrderMetric">--</dd></div>
        <div><dt>Latencies</dt><dd id="triggerLatencyMetric">--</dd></div>
        <div><dt>Precision score</dt><dd id="triggerPrecisionMetric">0.0</dd></div>
      </dl>
    </section>

    <section class="telemetry" aria-label="Lever telemetry">
      <h2>Lever metrics</h2>
      <dl>
        <div><dt>Torque</dt><dd id="leverTorqueMetric">0.000</dd></div>
        <div><dt>Rotation speed</dt><dd id="leverRotationMetric">0.000</dd></div>
        <div><dt>Equilibrium time</dt><dd id="leverEquilibriumMetric">0.000 s</dd></div>
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
const ballCountInput = document.querySelector('#ballCountInput');
const ballMaterialSelect = document.querySelector('#ballMaterialSelect');
const gravityEnabledToggle = document.querySelector('#gravityEnabledToggle');
const gravityStrengthInput = document.querySelector('#gravityStrengthInput');
const ballCreateBtn = document.querySelector('#ballCreateBtn');
const dominoCountInput = document.querySelector('#dominoCountInput');
const dominoSpacingInput = document.querySelector('#dominoSpacingInput');
const dominoMaterialSelect = document.querySelector('#dominoMaterialSelect');
const dominoCreateBtn = document.querySelector('#dominoCreateBtn');
const dominoTriggerBtn = document.querySelector('#dominoTriggerBtn');
const triggerRunBtn = document.querySelector('#triggerRunBtn');
const leverLeftWeightInput = document.querySelector('#leverLeftWeightInput');
const leverRightWeightInput = document.querySelector('#leverRightWeightInput');
const leverApplyBtn = document.querySelector('#leverApplyBtn');
const runtimeStatus = document.querySelector('#runtimeStatus');

const frameTime = document.querySelector('#frameTime');
const stepTime = document.querySelector('#stepTime');
const subSteps = document.querySelector('#subSteps');
const totalSteps = document.querySelector('#totalSteps');
const accumulator = document.querySelector('#accumulator');
const cubeY = document.querySelector('#cubeY');
const velocityY = document.querySelector('#velocityY');
const dominoCountMetric = document.querySelector('#dominoCountMetric');
const dominoFallAvgMetric = document.querySelector('#dominoFallAvgMetric');
const dominoCollisionMetric = document.querySelector('#dominoCollisionMetric');
const dominoVelocityMetric = document.querySelector('#dominoVelocityMetric');
const dominoChainSpeedMetric = document.querySelector('#dominoChainSpeedMetric');
const ballCountMetric = document.querySelector('#ballCountMetric');
const ballFallAvgMetric = document.querySelector('#ballFallAvgMetric');
const ballBounceMetric = document.querySelector('#ballBounceMetric');
const ballMaxHeightMetric = document.querySelector('#ballMaxHeightMetric');
const ballImpactMetric = document.querySelector('#ballImpactMetric');
const triggerSequenceMetric = document.querySelector('#triggerSequenceMetric');
const triggerOrderMetric = document.querySelector('#triggerOrderMetric');
const triggerLatencyMetric = document.querySelector('#triggerLatencyMetric');
const triggerPrecisionMetric = document.querySelector('#triggerPrecisionMetric');
const leverTorqueMetric = document.querySelector('#leverTorqueMetric');
const leverRotationMetric = document.querySelector('#leverRotationMetric');
const leverEquilibriumMetric = document.querySelector('#leverEquilibriumMetric');
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
  ballCreateBtn.disabled = !snapshot.initialized;
  dominoCreateBtn.disabled = !snapshot.initialized;
  dominoTriggerBtn.disabled = !snapshot.initialized;
  triggerRunBtn.disabled = !snapshot.initialized;
  leverApplyBtn.disabled = !snapshot.initialized;

  gravityEnabledToggle.checked = snapshot.ball.gravityEnabled;
  gravityStrengthInput.value = snapshot.ball.gravityStrength.toFixed(1);
  leverLeftWeightInput.value = snapshot.lever.leftWeight.toFixed(1);
  leverRightWeightInput.value = snapshot.lever.rightWeight.toFixed(1);
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

  dominoCountMetric.textContent = String(snapshot.domino.count);
  dominoFallAvgMetric.textContent = `${snapshot.domino.fallTimeAvgSeconds.toFixed(3)} s`;
  dominoCollisionMetric.textContent = String(snapshot.domino.collisionEvents);
  dominoVelocityMetric.textContent = snapshot.domino.maxVelocity.toFixed(3);
  dominoChainSpeedMetric.textContent = `${snapshot.domino.chainSpeedPerSecond.toFixed(2)} dom/s`;

  ballCountMetric.textContent = String(snapshot.ball.count);
  ballFallAvgMetric.textContent = `${snapshot.ball.fallTimeAvgSeconds.toFixed(3)} s`;
  ballBounceMetric.textContent = String(snapshot.ball.bounceCount);
  ballMaxHeightMetric.textContent = snapshot.ball.maxHeight.toFixed(3);
  ballImpactMetric.textContent = snapshot.ball.impactForceMax.toFixed(3);

  triggerSequenceMetric.textContent = `${snapshot.trigger.sequenceTimeSeconds.toFixed(3)} s`;
  triggerOrderMetric.textContent = snapshot.trigger.eventOrder.length ? snapshot.trigger.eventOrder.join(' → ') : '--';
  triggerLatencyMetric.textContent = snapshot.trigger.latencies.length
    ? snapshot.trigger.latencies.map((value) => `${value.toFixed(3)}s`).join(', ')
    : '--';
  triggerPrecisionMetric.textContent = snapshot.trigger.precisionScore.toFixed(1);

  leverTorqueMetric.textContent = snapshot.lever.torque.toFixed(3);
  leverRotationMetric.textContent = snapshot.lever.rotationSpeed.toFixed(3);
  leverEquilibriumMetric.textContent = `${snapshot.lever.equilibriumTimeSeconds.toFixed(3)} s`;
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

ballCreateBtn.addEventListener('click', async () => {
  if (!runtime.getSnapshot().initialized) {
    setStatus('initializing Rapier for ball spawn...');
    const initResult = await runtime.init();
    if (!initResult.ok) {
      setStatus(`init failed (${initResult.error})`, true);
      return;
    }
  }

  const result = runtime.createFallingBalls({
    count: Number(ballCountInput.value),
    materialPreset: ballMaterialSelect.value,
    gravityEnabled: gravityEnabledToggle.checked,
    gravityStrength: Number(gravityStrengthInput.value),
  });
  if (!result.ok) {
    setStatus(`ball spawn failed (${result.error})`, true);
    return;
  }
  setStatus(`spawned ${result.config.count} ${result.config.materialPreset} balls`);
});

gravityEnabledToggle.addEventListener('change', () => {
  runtime.setGravity(gravityEnabledToggle.checked, Number(gravityStrengthInput.value));
  setStatus(
    gravityEnabledToggle.checked
      ? `gravity enabled (${Number(gravityStrengthInput.value).toFixed(1)}x)`
      : 'gravity disabled'
  );
});

gravityStrengthInput.addEventListener('change', () => {
  runtime.setGravity(gravityEnabledToggle.checked, Number(gravityStrengthInput.value));
  if (gravityEnabledToggle.checked) {
    setStatus(`gravity strength set to ${Number(gravityStrengthInput.value).toFixed(1)}x`);
  }
});

dominoCreateBtn.addEventListener('click', async () => {
  if (!runtime.getSnapshot().initialized) {
    setStatus('initializing Rapier for domino chain...');
    const initResult = await runtime.init();
    if (!initResult.ok) {
      setStatus(`init failed (${initResult.error})`, true);
      return;
    }
  }

  const result = runtime.createDominoChain({
    count: Number(dominoCountInput.value),
    spacing: Number(dominoSpacingInput.value),
    materialPreset: dominoMaterialSelect.value,
  });
  if (!result.ok) {
    setStatus(`domino create failed (${result.error})`, true);
    return;
  }
  setStatus(
    `domino chain created (${result.config.count} @ ${result.config.spacing.toFixed(2)} ${result.config.materialPreset})`
  );
});

dominoTriggerBtn.addEventListener('click', () => {
  const result = runtime.triggerDominoChain();
  if (!result.ok) {
    setStatus(`domino trigger failed (${result.error})`, true);
    return;
  }
  setStatus('domino chain triggered');
});

triggerRunBtn.addEventListener('click', () => {
  const result = runtime.runTriggerSequence();
  if (!result.ok) {
    setStatus(`trigger sequence failed (${result.error})`, true);
    return;
  }
  setStatus('trigger sequence started');
});

leverApplyBtn.addEventListener('click', () => {
  const result = runtime.setLeverWeights(Number(leverLeftWeightInput.value), Number(leverRightWeightInput.value));
  if (!result.ok) {
    setStatus('lever weight update failed', true);
    return;
  }
  setStatus(`lever weights set (L ${result.config.leftWeight.toFixed(1)} / R ${result.config.rightWeight.toFixed(1)})`);
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

