import './styles.css';
import { PhysicsRuntime } from './physics/runtime.js';
import { PlaygroundRenderer } from './render/scene.js';
import { LiveGraphPanel } from './ui/liveGraphPanel.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <section class="shell" data-mode="basic">
    <h1>Muonium Physics Playground</h1>
    <p class="subtitle">T-000064 Basic Redis capability showcase panel</p>

    <section class="controls modeTabs" aria-label="Mode tabs">
      <button id="tabBasicBtn" type="button" class="modeTab">Basic</button>
      <button id="tabAdvancedBtn" type="button" class="modeTab">Advanced</button>
    </section>

    <section class="controls basicOnly" aria-label="Basic mode controls">
      <button id="basicRunShowcaseBtn" type="button" class="basicPrimary">Run Simulation</button>
      <button id="basicPauseBtn" type="button">Pause</button>
      <button id="basicResetBtn" type="button">Reset</button>
      <p class="basicIterationLabel">Iteration <span id="basicIterationValue">0</span></p>
    </section>

    <section class="controls basicOnly basicCameraControls" aria-label="Basic camera controls">
      <button id="basicPanLeftBtn" type="button">Pan ←</button>
      <button id="basicPanRightBtn" type="button">Pan →</button>
      <button id="basicPanForwardBtn" type="button">Pan ↑</button>
      <button id="basicPanBackBtn" type="button">Pan ↓</button>
      <button id="basicTiltUpBtn" type="button">Tilt +</button>
      <button id="basicTiltDownBtn" type="button">Tilt -</button>
      <button id="basicZoomInBtn" type="button">Zoom +</button>
      <button id="basicZoomOutBtn" type="button">Zoom -</button>
      <button id="basicCameraResetBtn" type="button">Reset View</button>
    </section>

    <section class="controls advancedOnly advancedNav" aria-label="Advanced navigation">
      <a href="#advancedControlsAnchor" class="advancedNavLink">Controls</a>
      <a href="#advancedSimulationAnchor" class="advancedNavLink">Simulation</a>
      <a href="#advancedObservabilityAnchor" class="advancedNavLink">Observability</a>
      <a href="#advancedReplayAnchor" class="advancedNavLink">Replay</a>
    </section>

    <h2 id="advancedControlsAnchor" class="advancedOnly advancedSectionHeading">Controls</h2>

    <section id="advancedSimulationAnchor" class="controls advancedOnly" aria-label="Physics controls">
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

    <section class="controls metricsControls advancedOnly" aria-label="Metrics controls">
      <label>
        Aggregate interval (ms)
        <input id="metricsIntervalInput" type="number" min="16" max="2000" step="1" value="100" />
      </label>
      <button id="metricsIntervalBtn" type="button" disabled>Apply Metrics Interval</button>
      <label>
        Graph window
        <select id="graphWindowSelect">
          <option value="short">Short</option>
          <option value="medium" selected>Medium</option>
        </select>
      </label>
      <button id="hudToggleBtn" type="button" disabled>Hide HUD</button>
      <button id="effectsToggleBtn" type="button" disabled>Disable Effects</button>
    </section>

    <section class="controls ballControls advancedOnly" aria-label="Falling balls controls">
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

    <section class="controls dominoControls advancedOnly" aria-label="Domino controls">
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

    <section class="controls triggerControls advancedOnly" aria-label="Trigger mechanism controls">
      <button id="triggerRunBtn" type="button" disabled>Run Trigger Sequence</button>
    </section>

    <section class="controls leverControls advancedOnly" aria-label="Lever controls">
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

    <section class="controls rollingControls advancedOnly" aria-label="Rolling controls">
      <label>
        Ramp angle (deg)
        <input id="rollingAngleInput" type="number" min="4" max="40" step="1" value="18" />
      </label>
      <label>
        Friction
        <input id="rollingFrictionInput" type="number" min="0.05" max="1.25" step="0.05" value="0.55" />
      </label>
      <label>
        Mass
        <input id="rollingMassInput" type="number" min="0.2" max="8" step="0.1" value="1.2" />
      </label>
      <button id="rollingApplyBtn" type="button" disabled>Apply Rolling Setup</button>
    </section>

    <section class="controls puzzleControls advancedOnly" aria-label="Puzzle controls">
      <button id="puzzleStartBtn" type="button" disabled>Start Puzzle Attempt</button>
      <button id="puzzleResetBtn" type="button" disabled>Reset Puzzle Progress</button>
    </section>

    <section class="controls replayControls advancedOnly" aria-label="Replay controls">
      <label class="toggleWrap" for="replayCaptureToggle">
        Capture replay
        <input id="replayCaptureToggle" type="checkbox" />
      </label>
      <label>
        Capture interval (steps)
        <input id="replayIntervalInput" type="number" min="1" max="120" step="1" value="6" />
      </label>
      <button id="replayConfigBtn" type="button" disabled>Apply Replay Config</button>
      <button id="replayClearBtn" type="button" disabled>Clear Snapshots</button>
      <button id="replayOpenBtn" type="button" disabled>Open Replay</button>
    </section>

    <h2 id="advancedObservabilityAnchor" class="advancedOnly advancedSectionHeading">Observability</h2>

    <p id="runtimeStatus" class="status">Status: idle</p>

    <section class="viewportPanel" aria-label="Playground viewport">
      <div id="viewport" class="viewport"></div>
      <aside id="hudOverlay" class="hudOverlay" aria-label="HUD overlay">
        <h3>HUD</h3>
        <dl>
          <div><dt>FPS</dt><dd id="hudFpsMetric" data-state="ok">0.00</dd></div>
          <div><dt>Physics step</dt><dd id="hudStepMetric" data-state="ok">0.000 ms</dd></div>
          <div><dt>Collisions</dt><dd id="hudCollisionsMetric" data-state="ok">0</dd></div>
          <div><dt>Energy state</dt><dd id="hudEnergyStateMetric" data-state="ok">stable</dd></div>
        </dl>
      </aside>
    </section>

    <section class="basicOnly basicRedisPanel" aria-label="Basic Redis showcase panel">
      <header class="basicRedisHeader">
        <h2>Redis Capability</h2>
        <button id="basicRedisToggleBtn" type="button" class="basicRedisToggle">Minimize</button>
      </header>
      <section id="basicRedisBody" class="basicRedisBody">
        <p id="basicRedisNarrative" class="basicRedisNarrative" aria-live="polite">
          Run Simulation to stream live metrics as Redis-like operations.
        </p>
        <dl class="basicRedisGrid">
          <div><dt>Stream tick</dt><dd id="basicRedisTick">0</dd></div>
          <div><dt>Stream rate</dt><dd id="basicRedisRate">0.00 Hz</dd></div>
          <div><dt>Total ops</dt><dd id="basicRedisOpsTotal">0</dd></div>
          <div><dt>HSET ops</dt><dd id="basicRedisHsetOps">0</dd></div>
          <div><dt>HINCRBY ops</dt><dd id="basicRedisHincrbyOps">0</dd></div>
          <div><dt>LPUSH ops</dt><dd id="basicRedisLpushOps">0</dd></div>
        </dl>
        <dl class="basicRedisMap">
          <div><dt>HSET metrics:hud.fps</dt><dd id="basicRedisHudFpsMap">0.00</dd></div>
          <div><dt>HSET metrics:lever.torque</dt><dd id="basicRedisLeverTorqueMap">0.000</dd></div>
          <div><dt>LPUSH timeline:frames</dt><dd id="basicRedisTimelineMap">idle</dd></div>
        </dl>
      </section>
    </section>

    <section class="telemetry advancedOnly" aria-label="Runtime telemetry">
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

    <section class="telemetry advancedOnly" aria-label="Domino telemetry">
      <h2>Domino metrics</h2>
      <dl>
        <div><dt>Count</dt><dd id="dominoCountMetric">0</dd></div>
        <div><dt>Fall time avg</dt><dd id="dominoFallAvgMetric">0.000 s</dd></div>
        <div><dt>Collision events</dt><dd id="dominoCollisionMetric">0</dd></div>
        <div><dt>Max velocity</dt><dd id="dominoVelocityMetric">0.000</dd></div>
        <div><dt>Chain speed</dt><dd id="dominoChainSpeedMetric">0.00 dom/s</dd></div>
      </dl>
    </section>

    <section class="telemetry advancedOnly" aria-label="Ball telemetry">
      <h2>Ball metrics</h2>
      <dl>
        <div><dt>Ball count</dt><dd id="ballCountMetric">0</dd></div>
        <div><dt>Fall time avg</dt><dd id="ballFallAvgMetric">0.000 s</dd></div>
        <div><dt>Bounce count</dt><dd id="ballBounceMetric">0</dd></div>
        <div><dt>Max height</dt><dd id="ballMaxHeightMetric">0.000</dd></div>
        <div><dt>Impact force (max)</dt><dd id="ballImpactMetric">0.000</dd></div>
      </dl>
    </section>

    <section class="telemetry advancedOnly" aria-label="Trigger telemetry">
      <h2>Trigger metrics</h2>
      <dl>
        <div><dt>Sequence time</dt><dd id="triggerSequenceMetric">0.000 s</dd></div>
        <div><dt>Event order</dt><dd id="triggerOrderMetric">--</dd></div>
        <div><dt>Latencies</dt><dd id="triggerLatencyMetric">--</dd></div>
        <div><dt>Precision score</dt><dd id="triggerPrecisionMetric">0.0</dd></div>
      </dl>
    </section>

    <section class="telemetry advancedOnly" aria-label="Lever telemetry">
      <h2>Lever metrics</h2>
      <dl>
        <div><dt>Torque</dt><dd id="leverTorqueMetric">0.000</dd></div>
        <div><dt>Rotation speed</dt><dd id="leverRotationMetric">0.000</dd></div>
        <div><dt>Equilibrium time</dt><dd id="leverEquilibriumMetric">0.000 s</dd></div>
      </dl>
    </section>

    <section class="telemetry advancedOnly" aria-label="Rolling telemetry">
      <h2>Rolling metrics</h2>
      <dl>
        <div><dt>Distance</dt><dd id="rollingDistanceMetric">0.000</dd></div>
        <div><dt>Avg velocity</dt><dd id="rollingVelocityMetric">0.000</dd></div>
        <div><dt>Friction coeff</dt><dd id="rollingFrictionMetric">0.000</dd></div>
        <div><dt>Energy loss</dt><dd id="rollingEnergyLossMetric">0.000</dd></div>
      </dl>
    </section>

    <section class="telemetry advancedOnly" aria-label="Puzzle telemetry">
      <h2>Puzzle metrics</h2>
      <dl>
        <div><dt>Objective</dt><dd id="puzzleObjectiveMetric">--</dd></div>
        <div><dt>Attempts</dt><dd id="puzzleAttemptsMetric">0</dd></div>
        <div><dt>Successes</dt><dd id="puzzleSuccessMetric">0</dd></div>
        <div><dt>Status</dt><dd id="puzzleStatusMetric">idle</dd></div>
        <div><dt>Completion time</dt><dd id="puzzleCompletionMetric">0.000 s</dd></div>
        <div><dt>Best time</dt><dd id="puzzleBestMetric">--</dd></div>
        <div><dt>Efficiency score</dt><dd id="puzzleScoreMetric">0.0</dd></div>
      </dl>
    </section>

    <section class="telemetry advancedOnly" aria-label="Metrics stream telemetry">
      <h2>Metrics stream</h2>
      <dl>
        <div><dt>Tick</dt><dd id="metricsTickMetric">0</dd></div>
        <div><dt>Interval</dt><dd id="metricsIntervalMetric">100 ms</dd></div>
        <div><dt>FPS (stream)</dt><dd id="metricsFpsMetric">0.00</dd></div>
        <div><dt>Ops total</dt><dd id="metricsOpsMetric">0</dd></div>
        <div><dt>Timeline events</dt><dd id="metricsEventsMetric">0</dd></div>
        <div><dt>Graph samples</dt><dd id="metricsGraphSamplesMetric">0</dd></div>
      </dl>
    </section>

    <section class="telemetry graphTelemetry advancedOnly" aria-label="Live graph telemetry panel">
      <h2>Live graph</h2>
      <p class="graphLegend">
        <span class="swatch velocity"></span>Velocity
        <span class="swatch torque"></span>Torque
        <span class="swatch impact"></span>Impact force
      </p>
      <canvas id="graphCanvas" class="graphCanvas" width="640" height="180"></canvas>
    </section>

    <section id="advancedReplayAnchor" class="telemetry replayTelemetry advancedOnly" aria-label="Replay telemetry panel">
      <h2>Replay</h2>
      <dl>
        <div><dt>Snapshots</dt><dd id="replayCountMetric">0</dd></div>
        <div><dt>Replay index</dt><dd id="replayIndexMetric">0</dd></div>
        <div><dt>Replay mode</dt><dd id="replayModeMetric">off</dd></div>
      </dl>
      <label class="replayScrubWrap">
        Scrub
        <input id="replayScrubInput" type="range" min="0" max="0" step="1" value="0" />
      </label>
      <section class="controls replayPlaybackControls" aria-label="Replay playback controls">
        <button id="replayPlayPauseBtn" type="button" disabled>Play Replay</button>
        <button id="replayRestartBtn" type="button" disabled>Restart From Scrub</button>
        <button id="replayExitBtn" type="button" disabled>Exit Replay</button>
      </section>
    </section>
  </section>
`;

const runtime = new PhysicsRuntime();
const renderer = new PlaygroundRenderer();
const UI_MODE_STORAGE_KEY = 'playground.uiMode';
const shell = document.querySelector('.shell');

const tabBasicBtn = document.querySelector('#tabBasicBtn');
const tabAdvancedBtn = document.querySelector('#tabAdvancedBtn');
const basicRunShowcaseBtn = document.querySelector('#basicRunShowcaseBtn');
const basicPauseBtn = document.querySelector('#basicPauseBtn');
const basicResetBtn = document.querySelector('#basicResetBtn');
const basicIterationValue = document.querySelector('#basicIterationValue');
const basicPanLeftBtn = document.querySelector('#basicPanLeftBtn');
const basicPanRightBtn = document.querySelector('#basicPanRightBtn');
const basicPanForwardBtn = document.querySelector('#basicPanForwardBtn');
const basicPanBackBtn = document.querySelector('#basicPanBackBtn');
const basicTiltUpBtn = document.querySelector('#basicTiltUpBtn');
const basicTiltDownBtn = document.querySelector('#basicTiltDownBtn');
const basicZoomInBtn = document.querySelector('#basicZoomInBtn');
const basicZoomOutBtn = document.querySelector('#basicZoomOutBtn');
const basicCameraResetBtn = document.querySelector('#basicCameraResetBtn');
const basicRedisToggleBtn = document.querySelector('#basicRedisToggleBtn');
const basicRedisBody = document.querySelector('#basicRedisBody');
const basicRedisNarrative = document.querySelector('#basicRedisNarrative');
const basicRedisTick = document.querySelector('#basicRedisTick');
const basicRedisRate = document.querySelector('#basicRedisRate');
const basicRedisOpsTotal = document.querySelector('#basicRedisOpsTotal');
const basicRedisHsetOps = document.querySelector('#basicRedisHsetOps');
const basicRedisHincrbyOps = document.querySelector('#basicRedisHincrbyOps');
const basicRedisLpushOps = document.querySelector('#basicRedisLpushOps');
const basicRedisHudFpsMap = document.querySelector('#basicRedisHudFpsMap');
const basicRedisLeverTorqueMap = document.querySelector('#basicRedisLeverTorqueMap');
const basicRedisTimelineMap = document.querySelector('#basicRedisTimelineMap');
const initBtn = document.querySelector('#initBtn');
const startBtn = document.querySelector('#startBtn');
const pauseBtn = document.querySelector('#pauseBtn');
const resetBtn = document.querySelector('#resetBtn');
const speedSelect = document.querySelector('#speedSelect');
const metricsIntervalInput = document.querySelector('#metricsIntervalInput');
const metricsIntervalBtn = document.querySelector('#metricsIntervalBtn');
const graphWindowSelect = document.querySelector('#graphWindowSelect');
const hudToggleBtn = document.querySelector('#hudToggleBtn');
const effectsToggleBtn = document.querySelector('#effectsToggleBtn');
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
const rollingAngleInput = document.querySelector('#rollingAngleInput');
const rollingFrictionInput = document.querySelector('#rollingFrictionInput');
const rollingMassInput = document.querySelector('#rollingMassInput');
const rollingApplyBtn = document.querySelector('#rollingApplyBtn');
const puzzleStartBtn = document.querySelector('#puzzleStartBtn');
const puzzleResetBtn = document.querySelector('#puzzleResetBtn');
const replayCaptureToggle = document.querySelector('#replayCaptureToggle');
const replayIntervalInput = document.querySelector('#replayIntervalInput');
const replayConfigBtn = document.querySelector('#replayConfigBtn');
const replayClearBtn = document.querySelector('#replayClearBtn');
const replayOpenBtn = document.querySelector('#replayOpenBtn');
const replayPlayPauseBtn = document.querySelector('#replayPlayPauseBtn');
const replayRestartBtn = document.querySelector('#replayRestartBtn');
const replayExitBtn = document.querySelector('#replayExitBtn');
const replayScrubInput = document.querySelector('#replayScrubInput');
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
const rollingDistanceMetric = document.querySelector('#rollingDistanceMetric');
const rollingVelocityMetric = document.querySelector('#rollingVelocityMetric');
const rollingFrictionMetric = document.querySelector('#rollingFrictionMetric');
const rollingEnergyLossMetric = document.querySelector('#rollingEnergyLossMetric');
const puzzleObjectiveMetric = document.querySelector('#puzzleObjectiveMetric');
const puzzleAttemptsMetric = document.querySelector('#puzzleAttemptsMetric');
const puzzleSuccessMetric = document.querySelector('#puzzleSuccessMetric');
const puzzleStatusMetric = document.querySelector('#puzzleStatusMetric');
const puzzleCompletionMetric = document.querySelector('#puzzleCompletionMetric');
const puzzleBestMetric = document.querySelector('#puzzleBestMetric');
const puzzleScoreMetric = document.querySelector('#puzzleScoreMetric');
const metricsTickMetric = document.querySelector('#metricsTickMetric');
const metricsIntervalMetric = document.querySelector('#metricsIntervalMetric');
const metricsFpsMetric = document.querySelector('#metricsFpsMetric');
const metricsOpsMetric = document.querySelector('#metricsOpsMetric');
const metricsEventsMetric = document.querySelector('#metricsEventsMetric');
const metricsGraphSamplesMetric = document.querySelector('#metricsGraphSamplesMetric');
const replayCountMetric = document.querySelector('#replayCountMetric');
const replayIndexMetric = document.querySelector('#replayIndexMetric');
const replayModeMetric = document.querySelector('#replayModeMetric');
const hudOverlay = document.querySelector('#hudOverlay');
const hudFpsMetric = document.querySelector('#hudFpsMetric');
const hudStepMetric = document.querySelector('#hudStepMetric');
const hudCollisionsMetric = document.querySelector('#hudCollisionsMetric');
const hudEnergyStateMetric = document.querySelector('#hudEnergyStateMetric');
const graphCanvas = document.querySelector('#graphCanvas');
const viewport = document.querySelector('#viewport');
const graphPanel = new LiveGraphPanel(graphCanvas);
let hudVisible = true;
let effectsEnabled = true;
let previousCollisionCount = 0;
let replayModeActive = false;
let replayPlaying = false;
let replayCurrentIndex = 0;
let replayAnimationId = null;
let replayLastTimestampMs = 0;
let uiMode = 'advanced';
let basicShowcaseTimers = [];
let basicRedisMinimized = false;
let latestMetricsPacket = null;
let basicNoActionDebugActive = false;
let basicActivityBaseline = {
  tick: 0,
  totalOps: 0,
};
let basicChaosModeActive = false;
let basicChaosIteration = 0;
let basicChaosLastCollisionCount = 0;
let basicChaosIdleSinceMs = 0;
let basicChaosAdvancing = false;
let basicChaosRunIteration = null;
let basicChaosMetricsUpdated = false;
let basicChaosIterationStartedAtMs = 0;

const randomInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

const resetBasicRedisPanelData = () => {
  basicRedisTick.textContent = '0';
  basicRedisRate.textContent = '0.00 Hz';
  basicRedisOpsTotal.textContent = '0';
  basicRedisHsetOps.textContent = '0';
  basicRedisHincrbyOps.textContent = '0';
  basicRedisLpushOps.textContent = '0';
  basicRedisHudFpsMap.textContent = '0.00';
  basicRedisLeverTorqueMap.textContent = '0.000';
  basicRedisTimelineMap.textContent = 'idle';
  basicRedisNarrative.textContent = 'Run Simulation to stream live metrics as Redis-like operations.';
};

const clearBasicShowcaseTimers = () => {
  for (const timer of basicShowcaseTimers) {
    clearTimeout(timer);
  }
  basicShowcaseTimers = [];
  basicChaosModeActive = false;
  basicChaosAdvancing = false;
  basicChaosRunIteration = null;
  basicChaosMetricsUpdated = false;
  basicChaosIterationStartedAtMs = 0;
};

const queueBasicShowcaseStep = (delayMs, handler) => {
  const timer = setTimeout(() => {
    basicShowcaseTimers = basicShowcaseTimers.filter((value) => value !== timer);
    handler();
  }, delayMs);
  basicShowcaseTimers.push(timer);
};

const printBasicNoActionDebug = (reason) => {
  const snapshot = runtime.getSnapshot();
  const observedPacket = latestMetricsPacket;
  const debugPayload = {
    tag: 'DEBUG_BASIC_NO_ACTION',
    reason,
    uiMode,
    replayModeActive,
    baseline: basicActivityBaseline,
    observed: observedPacket
      ? {
          tick: observedPacket.tick,
          totalOps: observedPacket.opCounts.total,
          hsetOps: observedPacket.opCounts.hset,
          lpushOps: observedPacket.opCounts.lpush,
        }
      : null,
    snapshot: {
      initialized: snapshot.initialized,
      running: snapshot.running,
      totalSteps: snapshot.totalSteps,
      dominoCollisions: snapshot.domino.collisionEvents,
      rollingDistance: Number(snapshot.rolling.distance.toFixed(4)),
      puzzleStatus: snapshot.puzzle.status,
    },
    timestamp: new Date().toISOString(),
  };

  const debugMessage = `DEBUG_BASIC_NO_ACTION ${JSON.stringify(debugPayload)}`;
  basicNoActionDebugActive = true;
  basicRedisNarrative.textContent = debugMessage;
  setStatus('basic simulation: no activity detected (debug printed)', true);
  console.error(debugMessage);
};

const printBasicStageDebug = (reason, extra = {}) => {
  const snapshot = runtime.getSnapshot();
  const debugPayload = {
    tag: 'DEBUG_BASIC_STAGE_FAILURE',
    reason,
    uiMode,
    replayModeActive,
    latestPacket: latestMetricsPacket
      ? {
          tick: latestMetricsPacket.tick,
          totalOps: latestMetricsPacket.opCounts.total,
        }
      : null,
    snapshot: {
      initialized: snapshot.initialized,
      running: snapshot.running,
      totalSteps: snapshot.totalSteps,
      dominoCollisions: snapshot.domino.collisionEvents,
      rollingDistance: Number(snapshot.rolling.distance.toFixed(4)),
      puzzleStatus: snapshot.puzzle.status,
    },
    ...extra,
    timestamp: new Date().toISOString(),
  };
  const debugMessage = `DEBUG_BASIC_STAGE_FAILURE ${JSON.stringify(debugPayload)}`;
  basicNoActionDebugActive = true;
  basicRedisNarrative.textContent = debugMessage;
  setStatus(`basic simulation failed (${reason})`, true);
  console.error(debugMessage);
};

const applyBasicShowcasePreset = () => {
  runtime.setSpeedMultiplier(1.5);
  speedSelect.value = '1.5';

  const intervalResult = runtime.setMetricsAggregateIntervalMs(80);
  if (intervalResult.ok) {
    metricsIntervalInput.value = String(intervalResult.intervalMs);
  }

  graphPanel.setWindow('short');
  graphWindowSelect.value = 'short';

  runtime.setGravity(true, 1.1);
  gravityEnabledToggle.checked = true;
  gravityStrengthInput.value = '1.1';

  const dominoResult = runtime.createDominoChain({
    count: 96,
    spacing: 0.3,
    materialPreset: 'wood',
  });
  if (!dominoResult.ok) {
    return dominoResult;
  }

  const ballResult = runtime.createFallingBalls({
    count: 6,
    materialPreset: 'metal',
    gravityEnabled: true,
    gravityStrength: 1.1,
  });
  if (!ballResult.ok) {
    return ballResult;
  }

  const leverResult = runtime.setLeverWeights(1.0, 2.8);
  if (!leverResult.ok) {
    return leverResult;
  }
  leverLeftWeightInput.value = '1.0';
  leverRightWeightInput.value = '2.8';

  const rollingResult = runtime.configureRollingObject({
    rampAngleDeg: 24,
    frictionCoeff: 0.32,
    mass: 1.8,
  });
  if (!rollingResult.ok) {
    return rollingResult;
  }
  rollingAngleInput.value = '24';
  rollingFrictionInput.value = '0.32';
  rollingMassInput.value = '1.8';

  return { ok: true };
};

const runBasicShowcase = async () => {
  clearBasicShowcaseTimers();
  basicNoActionDebugActive = false;
  basicRedisNarrative.textContent = 'Starting simulation...';
  let basicInitWatchdog = null;
  let currentStage = 'start';

  const setBasicNarrative = (message) => {
    if (!basicNoActionDebugActive) {
      basicRedisNarrative.textContent = message;
    }
  };

  const clearBasicInitWatchdog = () => {
    if (basicInitWatchdog !== null) {
      clearTimeout(basicInitWatchdog);
      basicInitWatchdog = null;
    }
  };

  const debugStageFailure = (reason, extra = {}) => {
    clearBasicInitWatchdog();
    printBasicStageDebug(reason, {
      stage: currentStage,
      ...extra,
    });
  };

  basicInitWatchdog = setTimeout(() => {
    debugStageFailure('init_timeout', { timeoutMs: 6000 });
  }, 6000);

  try {
    if (replayModeActive) {
      exitReplayMode();
    }

    currentStage = 'init';
    setBasicNarrative('Initializing physics engine...');
    setStatus('initializing Rapier for showcase...');
    const initResult = await Promise.race([
      runtime.init(),
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({ ok: false, error: 'init timeout after 6000ms' });
        }, 6000);
      }),
    ]);
    clearBasicInitWatchdog();
    if (!initResult.ok) {
      setStatus(`init failed (${initResult.error})`, true);
      debugStageFailure('init_failed', { initError: initResult.error });
      return;
    }

    currentStage = 'reset';
    setBasicNarrative('Preparing simulation world...');
    runtime.pause();
    renderer.pause();
    runtime.resetWorld();
    renderer.reset();

    hudVisible = true;
    hudOverlay.hidden = false;
    hudToggleBtn.textContent = 'Hide HUD';

    effectsEnabled = true;
    renderer.setEffectsEnabled(true);
    effectsToggleBtn.textContent = 'Disable Effects';

    basicChaosModeActive = true;
    basicChaosIteration = 0;

    const runRandomIteration = () => {
      currentStage = 'random_iteration';
      basicChaosIteration += 1;
      basicIterationValue.textContent = String(basicChaosIteration);
      basicChaosAdvancing = false;

      runtime.pause();
      renderer.pause();
      runtime.resetWorld();
      renderer.reset();

      const dominoCount = randomInt(1, 50);
      const ballCount = randomInt(1, 50);
      const spacing = Number((0.22 + Math.random() * 0.38).toFixed(2));
      const dominoMaterial = ['wood', 'rubber', 'metal'][randomInt(0, 2)];
      const ballMaterial = ['wood', 'rubber', 'metal'][randomInt(0, 2)];

      const dominoResult = runtime.createDominoChain({
        count: dominoCount,
        spacing,
        materialPreset: dominoMaterial,
      });
      if (!dominoResult.ok) {
        debugStageFailure('random_domino_failed', { error: dominoResult.error ?? 'unknown' });
        basicChaosModeActive = false;
        return;
      }

      const ballResult = runtime.createFallingBalls({
        count: ballCount,
        materialPreset: ballMaterial,
        gravityEnabled: true,
        gravityStrength: Number((0.8 + Math.random() * 1.2).toFixed(1)),
      });
      if (!ballResult.ok) {
        debugStageFailure('random_ball_failed', { error: ballResult.error ?? 'unknown' });
        basicChaosModeActive = false;
        return;
      }

      runtime.setLeverWeights(Number((0.6 + Math.random() * 3.2).toFixed(1)), Number((0.6 + Math.random() * 3.2).toFixed(1)));
      runtime.configureRollingObject({
        rampAngleDeg: randomInt(8, 34),
        frictionCoeff: Number((0.1 + Math.random() * 0.9).toFixed(2)),
        mass: Number((0.4 + Math.random() * 3.2).toFixed(1)),
      });

      const randomizeResult = runtime.randomizeSceneObjects({
        areaHalfWidth: Number((2.4 + Math.random() * 2.2).toFixed(2)),
        ballHeightMin: Number((1 + Math.random() * 1.2).toFixed(2)),
        ballHeightMax: Number((3.5 + Math.random() * 2.4).toFixed(2)),
      });
      if (!randomizeResult.ok) {
        debugStageFailure('randomize_scene_failed', { error: randomizeResult.error ?? 'unknown' });
        basicChaosModeActive = false;
        return;
      }

      runtime.start();
      renderer.start();

      latestMetricsPacket = null;
      basicChaosMetricsUpdated = false;
      basicChaosIterationStartedAtMs = performance.now();

      basicActivityBaseline = {
        tick: 0,
        totalOps: 0,
      };
      basicChaosLastCollisionCount = Number(runtime.getSnapshot().domino.collisionEvents ?? 0);
      basicChaosIdleSinceMs = performance.now();

      setStatus(`basic random iteration ${basicChaosIteration} running`);
      setBasicNarrative(
        `Iteration ${basicChaosIteration}: dominoes ${dominoCount}, balls ${ballCount}, random 3D placement active.`
      );

      queueBasicShowcaseStep(1800, () => {
        if (!basicChaosModeActive) {
          return;
        }
        const packet = latestMetricsPacket;
        const snapshot = runtime.getSnapshot();
        const metricsUpdated = basicChaosMetricsUpdated;
        const opsAdvanced = packet ? packet.opCounts.total > 0 : false;
        const movementDetected =
          snapshot.totalSteps > 0 || snapshot.domino.collisionEvents > 0 || snapshot.rolling.distance > 0.005;
        if (!metricsUpdated || !opsAdvanced || !movementDetected) {
          printBasicNoActionDebug('missing expected Redis activity or scene movement in random iteration');
          basicChaosModeActive = false;
        }
      });
    };

    basicChaosRunIteration = runRandomIteration;

    runRandomIteration();
  } catch (error) {
    debugStageFailure('unhandled_exception', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearBasicInitWatchdog();
  }
};

renderer.init(viewport);

const setStatus = (message, isError = false) => {
  runtimeStatus.textContent = `Status: ${message}`;
  runtimeStatus.dataset.state = isError ? 'error' : 'ok';

  if (uiMode === 'basic' && isError && !basicNoActionDebugActive) {
    basicRedisNarrative.textContent = `ERROR: ${message}`;
  }
};

const resolveInitialUiMode = () => {
  const params = new URLSearchParams(window.location.search);
  const queryMode = params.get('mode');
  if (queryMode === 'advanced') {
    return 'advanced';
  }
  if (queryMode === 'basic') {
    return queryMode;
  }

  return 'basic';
};

const setBasicRedisMinimized = (nextState) => {
  basicRedisMinimized = Boolean(nextState);
  basicRedisBody.hidden = basicRedisMinimized;
  basicRedisToggleBtn.textContent = basicRedisMinimized ? 'Expand' : 'Minimize';
};

const applyUiMode = (nextMode, persist = true) => {
  uiMode = nextMode === 'basic' ? 'basic' : 'advanced';
  const showBasic = uiMode === 'basic';
  shell.dataset.mode = uiMode;

  for (const element of document.querySelectorAll('.basicOnly')) {
    element.hidden = !showBasic;
  }
  for (const element of document.querySelectorAll('.advancedOnly')) {
    element.hidden = showBasic;
  }

  tabBasicBtn.dataset.active = showBasic ? 'true' : 'false';
  tabAdvancedBtn.dataset.active = showBasic ? 'false' : 'true';

  if (persist) {
    localStorage.setItem(UI_MODE_STORAGE_KEY, uiMode);
    const url = new URL(window.location.href);
    url.searchParams.set('mode', uiMode);
    window.history.replaceState({}, '', url);
  }
};

const stopReplayLoop = () => {
  replayPlaying = false;
  replayLastTimestampMs = 0;
  replayPlayPauseBtn.textContent = 'Play Replay';
  if (replayAnimationId !== null) {
    cancelAnimationFrame(replayAnimationId);
    replayAnimationId = null;
  }
};

const renderReplayIndex = (index) => {
  const result = runtime.getReplaySnapshot(index);
  if (!result.ok) {
    setStatus(`replay snapshot unavailable (${result.error})`, true);
    return false;
  }
  replayCurrentIndex = result.index;
  replayScrubInput.value = String(replayCurrentIndex);
  replayIndexMetric.textContent = `${replayCurrentIndex}`;
  renderer.applySnapshot(result.snapshot);
  return true;
};

const exitReplayMode = () => {
  stopReplayLoop();
  replayModeActive = false;
  replayModeMetric.textContent = 'off';
  replayExitBtn.disabled = true;
  replayPlayPauseBtn.disabled = true;
  replayRestartBtn.disabled = true;

  const liveSnapshot = runtime.getSnapshot();
  renderer.applySnapshot(liveSnapshot);
  if (liveSnapshot.running) {
    renderer.start();
  }
  runtime.setReplayCaptureConfig({});
};

const replayTick = (timestampMs) => {
  if (!replayPlaying || !replayModeActive) {
    return;
  }

  if (!replayLastTimestampMs) {
    replayLastTimestampMs = timestampMs;
  }

  const elapsed = timestampMs - replayLastTimestampMs;
  if (elapsed >= 1000 / 24) {
    replayLastTimestampMs = timestampMs;
    const nextIndex = replayCurrentIndex + 1;
    const maxIndex = Number(replayScrubInput.max);
    if (nextIndex > maxIndex) {
      stopReplayLoop();
      return;
    }
    renderReplayIndex(nextIndex);
  }

  replayAnimationId = requestAnimationFrame((nextTimestampMs) => replayTick(nextTimestampMs));
};

runtime.onState((snapshot) => {
  tabBasicBtn.disabled = false;
  tabAdvancedBtn.disabled = false;
  basicRunShowcaseBtn.disabled = replayModeActive;
  basicPauseBtn.disabled = !snapshot.initialized || replayModeActive;
  basicPauseBtn.textContent = snapshot.running ? 'Pause' : 'Resume';
  basicResetBtn.disabled = !snapshot.initialized || replayModeActive;
  initBtn.disabled = snapshot.initialized;
  startBtn.disabled = !snapshot.initialized || snapshot.running || replayModeActive;
  pauseBtn.disabled = !snapshot.initialized || !snapshot.running || replayModeActive;
  resetBtn.disabled = !snapshot.initialized;
  metricsIntervalBtn.disabled = !snapshot.initialized;
  hudToggleBtn.disabled = !snapshot.initialized;
  effectsToggleBtn.disabled = !snapshot.initialized;
  ballCreateBtn.disabled = !snapshot.initialized || replayModeActive;
  dominoCreateBtn.disabled = !snapshot.initialized || replayModeActive;
  dominoTriggerBtn.disabled = !snapshot.initialized || replayModeActive;
  triggerRunBtn.disabled = !snapshot.initialized || replayModeActive;
  leverApplyBtn.disabled = !snapshot.initialized || replayModeActive;
  rollingApplyBtn.disabled = !snapshot.initialized || replayModeActive;
  puzzleStartBtn.disabled = !snapshot.initialized || replayModeActive;
  puzzleResetBtn.disabled = !snapshot.initialized || replayModeActive;
  replayConfigBtn.disabled = !snapshot.initialized || replayModeActive;
  replayClearBtn.disabled = !snapshot.initialized || replayModeActive;
  replayOpenBtn.disabled = !snapshot.initialized || replayModeActive || snapshot.replay.count === 0;
  replayCaptureToggle.disabled = !snapshot.initialized || replayModeActive;
  replayIntervalInput.disabled = !snapshot.initialized || replayModeActive;

  gravityEnabledToggle.checked = snapshot.ball.gravityEnabled;
  gravityStrengthInput.value = snapshot.ball.gravityStrength.toFixed(1);
  leverLeftWeightInput.value = snapshot.lever.leftWeight.toFixed(1);
  leverRightWeightInput.value = snapshot.lever.rightWeight.toFixed(1);
  rollingAngleInput.value = snapshot.rolling.rampAngleDeg.toFixed(0);
  rollingFrictionInput.value = snapshot.rolling.frictionCoeff.toFixed(2);
  rollingMassInput.value = snapshot.rolling.mass.toFixed(1);
  metricsIntervalInput.value = String(snapshot.metricsPipeline.aggregateIntervalMs);
  replayCaptureToggle.checked = snapshot.replay.captureEnabled;
  replayIntervalInput.value = String(snapshot.replay.intervalSteps);
  replayCountMetric.textContent = String(snapshot.replay.count);
  replayScrubInput.max = String(Math.max(0, snapshot.replay.count - 1));
  if (!replayModeActive) {
    replayCurrentIndex = Math.max(0, snapshot.replay.count - 1);
    replayScrubInput.value = String(replayCurrentIndex);
    replayIndexMetric.textContent = String(replayCurrentIndex);
  }
});

runtime.onTiming((timing, snapshot) => {
  if (!replayModeActive) {
    renderer.applySnapshot(snapshot);
  }
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

  rollingDistanceMetric.textContent = snapshot.rolling.distance.toFixed(3);
  rollingVelocityMetric.textContent = snapshot.rolling.velocityAvg.toFixed(3);
  rollingFrictionMetric.textContent = snapshot.rolling.frictionCoeff.toFixed(3);
  rollingEnergyLossMetric.textContent = snapshot.rolling.energyLoss.toFixed(3);

  puzzleObjectiveMetric.textContent = snapshot.puzzle.objective;
  puzzleAttemptsMetric.textContent = String(snapshot.puzzle.attempts);
  puzzleSuccessMetric.textContent = String(snapshot.puzzle.successes);
  puzzleStatusMetric.textContent =
    snapshot.puzzle.status === 'failure' && snapshot.puzzle.failureReason
      ? `failure (${snapshot.puzzle.failureReason})`
      : snapshot.puzzle.status;
  puzzleCompletionMetric.textContent = `${snapshot.puzzle.lastCompletionSeconds.toFixed(3)} s`;
  puzzleBestMetric.textContent =
    snapshot.puzzle.bestCompletionSeconds > 0 ? `${snapshot.puzzle.bestCompletionSeconds.toFixed(3)} s` : '--';
  puzzleScoreMetric.textContent = snapshot.puzzle.lastScore.toFixed(1);

  replayCountMetric.textContent = String(snapshot.replay.count);
  if (!replayModeActive) {
    replayScrubInput.max = String(Math.max(0, snapshot.replay.count - 1));
    replayCurrentIndex = Math.max(0, snapshot.replay.count - 1);
    replayScrubInput.value = String(replayCurrentIndex);
    replayIndexMetric.textContent = String(replayCurrentIndex);
  }
});

runtime.onMetricsStream((packet) => {
  latestMetricsPacket = packet;
  if (basicChaosModeActive) {
    basicChaosMetricsUpdated = true;
  }
  graphPanel.ingest({
    tick: packet.tick,
    velocity: Number(packet.hashes.roll.velocity_avg ?? 0),
    torque: Number(packet.hashes.lever.torque ?? 0),
    impact: Number(packet.hashes.ball.impact_force_max ?? 0),
  });

  metricsTickMetric.textContent = String(packet.tick);
  metricsIntervalMetric.textContent = `${Math.round(packet.intervalMs)} ms`;
  metricsFpsMetric.textContent = packet.gauges.fps.toFixed(2);
  metricsOpsMetric.textContent = String(packet.opCounts.total);
  metricsEventsMetric.textContent = String(packet.opCounts.lpush);
  metricsGraphSamplesMetric.textContent = String(graphPanel.getSampleCount());

  basicRedisTick.textContent = String(packet.tick);
  basicRedisRate.textContent = `${(1000 / Math.max(packet.intervalMs, 1)).toFixed(2)} Hz`;
  basicRedisOpsTotal.textContent = String(packet.opCounts.total);
  basicRedisHsetOps.textContent = String(packet.opCounts.hset);
  basicRedisHincrbyOps.textContent = String(packet.opCounts.hincrby);
  basicRedisLpushOps.textContent = String(packet.opCounts.lpush);
  basicRedisHudFpsMap.textContent = Number(packet.hashes.hud.fps ?? 0).toFixed(2);
  basicRedisLeverTorqueMap.textContent = Number(packet.hashes.lever.torque ?? 0).toFixed(3);

  const timelineFrame = packet.timelineHead;
  if (timelineFrame) {
    basicRedisTimelineMap.textContent = `fps ${Number(timelineFrame.fps ?? 0).toFixed(2)} · collisions ${Number(
      timelineFrame.dominoCollisionEvents ?? 0
    )}`;
  } else {
    basicRedisTimelineMap.textContent = 'idle';
  }

  if (!basicNoActionDebugActive) {
    basicRedisNarrative.textContent =
      packet.opCounts.total > 0
        ? `Tick ${packet.tick}: HSET updates gauges, LPUSH appends frame timeline, HINCRBY remains available for counters.`
        : 'Run Simulation to stream live metrics as Redis-like operations.';
  }

  const fps = Number(packet.gauges.fps ?? 0);
  const stepMs = Number(packet.gauges.physicsStepTimeMs ?? 0);
  const collisionCount = Number(packet.hashes.domino.collision_events ?? 0);
  const energyLoss = Number(packet.hashes.roll.energy_loss ?? 0);
  const collisionDelta = Math.max(0, collisionCount - previousCollisionCount);
  previousCollisionCount = collisionCount;

  if (basicChaosModeActive) {
    const nowMs = performance.now();
    if (collisionCount !== basicChaosLastCollisionCount) {
      basicChaosLastCollisionCount = collisionCount;
      basicChaosIdleSinceMs = nowMs;
      basicChaosAdvancing = false;
    } else if (!basicChaosAdvancing && nowMs - basicChaosIdleSinceMs >= 500) {
      basicChaosAdvancing = true;
      setStatus(`collision idle 500ms, advancing iteration ${basicChaosIteration + 1}`);
      setTimeout(() => {
        if (!basicChaosModeActive) {
          return;
        }
        if (typeof basicChaosRunIteration === 'function') {
          basicChaosRunIteration();
        }
      }, 50);
    }
  }

  hudFpsMetric.textContent = fps.toFixed(2);
  hudStepMetric.textContent = `${stepMs.toFixed(3)} ms`;
  hudCollisionsMetric.textContent = String(collisionCount);

  const fpsState = fps < 40 ? 'danger' : fps < 50 ? 'warn' : 'ok';
  const stepState = stepMs > 2 ? 'danger' : stepMs > 1 ? 'warn' : 'ok';
  const collisionState = collisionDelta >= 15 ? 'danger' : collisionDelta >= 8 ? 'warn' : 'ok';
  let energyState = 'stable';
  let energyVisualState = 'ok';
  if (energyLoss > 4) {
    energyState = 'high';
    energyVisualState = 'danger';
  } else if (energyLoss > 1) {
    energyState = 'active';
    energyVisualState = 'warn';
  }

  hudFpsMetric.dataset.state = fpsState;
  hudStepMetric.dataset.state = stepState;
  hudCollisionsMetric.dataset.state = collisionState;
  hudEnergyStateMetric.dataset.state = energyVisualState;
  hudEnergyStateMetric.textContent = energyState;
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
  clearBasicShowcaseTimers();
  runtime.pause();
  renderer.pause();
  setStatus('paused');
});

resetBtn.addEventListener('click', () => {
  clearBasicShowcaseTimers();
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

rollingApplyBtn.addEventListener('click', async () => {
  if (!runtime.getSnapshot().initialized) {
    setStatus('initializing Rapier for rolling setup...');
    const initResult = await runtime.init();
    if (!initResult.ok) {
      setStatus(`init failed (${initResult.error})`, true);
      return;
    }
  }

  const result = runtime.configureRollingObject({
    rampAngleDeg: Number(rollingAngleInput.value),
    frictionCoeff: Number(rollingFrictionInput.value),
    mass: Number(rollingMassInput.value),
  });
  if (!result.ok) {
    setStatus(`rolling setup failed (${result.error})`, true);
    return;
  }
  setStatus(
    `rolling setup applied (angle ${result.config.rampAngleDeg.toFixed(0)}°, friction ${result.config.frictionCoeff.toFixed(
      2
    )}, mass ${result.config.mass.toFixed(1)})`
  );
});

puzzleStartBtn.addEventListener('click', async () => {
  if (!runtime.getSnapshot().initialized) {
    setStatus('initializing Rapier for puzzle mode...');
    const initResult = await runtime.init();
    if (!initResult.ok) {
      setStatus(`init failed (${initResult.error})`, true);
      return;
    }
  }

  const result = runtime.startPuzzleAttempt();
  if (!result.ok) {
    setStatus(`puzzle start failed (${result.error})`, true);
    return;
  }

  runtime.start();
  renderer.start();
  setStatus(`puzzle attempt ${result.attempt} started`);
});

puzzleResetBtn.addEventListener('click', () => {
  runtime.resetPuzzleProgress();
  setStatus('puzzle progress reset');
});

speedSelect.addEventListener('change', (event) => {
  const nextSpeed = Number(event.target.value);
  runtime.setSpeedMultiplier(nextSpeed);
  const label = runtime.running ? `running at ${nextSpeed.toFixed(1)}x` : `speed set to ${nextSpeed.toFixed(1)}x`;
  setStatus(label);
});

metricsIntervalBtn.addEventListener('click', () => {
  const result = runtime.setMetricsAggregateIntervalMs(Number(metricsIntervalInput.value));
  if (!result.ok) {
    setStatus('failed to set metrics interval', true);
    return;
  }
  setStatus(`metrics interval set to ${result.intervalMs} ms`);
});

graphWindowSelect.addEventListener('change', (event) => {
  const activeWindow = graphPanel.setWindow(event.target.value);
  setStatus(`graph window set to ${activeWindow}`);
});

hudToggleBtn.addEventListener('click', () => {
  hudVisible = !hudVisible;
  hudOverlay.hidden = !hudVisible;
  hudToggleBtn.textContent = hudVisible ? 'Hide HUD' : 'Show HUD';
  setStatus(hudVisible ? 'HUD shown' : 'HUD hidden');
});

effectsToggleBtn.addEventListener('click', () => {
  effectsEnabled = !effectsEnabled;
  renderer.setEffectsEnabled(effectsEnabled);
  effectsToggleBtn.textContent = effectsEnabled ? 'Disable Effects' : 'Enable Effects';
  setStatus(effectsEnabled ? 'visual effects enabled' : 'visual effects disabled');
});

basicRedisToggleBtn.addEventListener('click', () => {
  setBasicRedisMinimized(!basicRedisMinimized);
});

tabBasicBtn.addEventListener('click', () => {
  applyUiMode('basic');
  setStatus('basic mode active — click Run Showcase');
});

tabAdvancedBtn.addEventListener('click', () => {
  clearBasicShowcaseTimers();
  applyUiMode('advanced');
  setStatus('advanced mode active — full controls enabled');
});

basicRunShowcaseBtn.addEventListener('click', async () => {
  await runBasicShowcase();
});

basicPauseBtn.addEventListener('click', () => {
  const snapshot = runtime.getSnapshot();
  if (!snapshot.initialized) {
    return;
  }
  if (snapshot.running) {
    basicChaosModeActive = false;
    basicChaosAdvancing = false;
    runtime.pause();
    renderer.pause();
    setStatus('basic simulation paused');
    return;
  }

  runtime.start();
  renderer.start();
  setStatus('basic simulation resumed');
});

basicResetBtn.addEventListener('click', async () => {
  clearBasicShowcaseTimers();
  runtime.pause();
  renderer.pause();

  if (!runtime.getSnapshot().initialized) {
    const initResult = await runtime.init();
    if (!initResult.ok) {
      printBasicStageDebug('reset_init_failed', { error: initResult.error ?? 'unknown' });
      return;
    }
  }

  runtime.resetWorld();
  renderer.reset();
  latestMetricsPacket = null;
  basicActivityBaseline = { tick: 0, totalOps: 0 };
  basicChaosIteration = 0;
  basicIterationValue.textContent = '0';
  resetBasicRedisPanelData();
  setStatus('basic simulation reset (Redis counters cleared)');
});

basicPanLeftBtn.addEventListener('click', () => {
  renderer.panCamera(-0.45, 0);
});

basicPanRightBtn.addEventListener('click', () => {
  renderer.panCamera(0.45, 0);
});

basicPanForwardBtn.addEventListener('click', () => {
  renderer.panCamera(0, -0.45);
});

basicPanBackBtn.addEventListener('click', () => {
  renderer.panCamera(0, 0.45);
});

basicTiltUpBtn.addEventListener('click', () => {
  renderer.tiltCamera(0.1);
});

basicTiltDownBtn.addEventListener('click', () => {
  renderer.tiltCamera(-0.1);
});

basicZoomInBtn.addEventListener('click', () => {
  renderer.zoomCamera(-0.55);
});

basicZoomOutBtn.addEventListener('click', () => {
  renderer.zoomCamera(0.55);
});

basicCameraResetBtn.addEventListener('click', () => {
  renderer.resetCameraView();
});

replayConfigBtn.addEventListener('click', () => {
  const result = runtime.setReplayCaptureConfig({
    enabled: replayCaptureToggle.checked,
    intervalSteps: Number(replayIntervalInput.value),
  });
  if (!result.ok) {
    setStatus('failed to update replay config', true);
    return;
  }
  setStatus(
    `replay capture ${result.config.enabled ? 'enabled' : 'disabled'} @ interval ${result.config.intervalSteps} steps`
  );
});

replayClearBtn.addEventListener('click', () => {
  runtime.clearReplaySnapshots();
  replayScrubInput.max = '0';
  replayScrubInput.value = '0';
  replayIndexMetric.textContent = '0';
  setStatus('replay snapshots cleared');
});

replayOpenBtn.addEventListener('click', () => {
  const liveSnapshot = runtime.getSnapshot();
  if (liveSnapshot.replay.count === 0) {
    setStatus('no replay snapshots available', true);
    return;
  }

  runtime.pause();
  renderer.pause();
  replayModeActive = true;
  replayModeMetric.textContent = 'on';
  replayExitBtn.disabled = false;
  replayPlayPauseBtn.disabled = false;
  replayRestartBtn.disabled = false;

  replayCurrentIndex = Number(replayScrubInput.value);
  renderReplayIndex(replayCurrentIndex);
  setStatus('replay mode opened');
});

replayScrubInput.addEventListener('input', (event) => {
  if (!replayModeActive) {
    return;
  }
  stopReplayLoop();
  renderReplayIndex(Number(event.target.value));
});

replayPlayPauseBtn.addEventListener('click', () => {
  if (!replayModeActive) {
    return;
  }
  if (replayPlaying) {
    stopReplayLoop();
    setStatus('replay paused');
    return;
  }

  replayPlaying = true;
  replayPlayPauseBtn.textContent = 'Pause Replay';
  replayLastTimestampMs = 0;
  replayAnimationId = requestAnimationFrame((timestampMs) => replayTick(timestampMs));
  setStatus('replay playing');
});

replayRestartBtn.addEventListener('click', () => {
  if (!replayModeActive) {
    return;
  }
  stopReplayLoop();
  const selectedIndex = Number(replayScrubInput.value);
  renderReplayIndex(selectedIndex);
  setStatus(`replay restarted from snapshot ${selectedIndex}`);
});

replayExitBtn.addEventListener('click', () => {
  exitReplayMode();
  setStatus('replay mode exited');
});

applyUiMode(resolveInitialUiMode(), false);
setBasicRedisMinimized(false);
resetBasicRedisPanelData();
setStatus('idle — choose Basic for one-click demo or Advanced for full controls');

window.addEventListener('beforeunload', () => {
  clearBasicShowcaseTimers();
  stopReplayLoop();
  graphPanel.dispose();
  runtime.dispose();
  renderer.dispose();
});

