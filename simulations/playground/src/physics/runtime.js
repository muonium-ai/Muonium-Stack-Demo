import RAPIER from '@dimforge/rapier3d-compat';
import { TelemetryStore } from '../metrics/telemetryStore.js';

const FIXED_TIMESTEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 8;
const TRIGGER_SEQUENCE_ORDER = ['ball', 'plank', 'domino', 'lever', 'gate'];
const PUZZLE_TIME_LIMIT_SECONDS = 3;
const DOMINO_SIZE = { hx: 0.04, hy: 0.25, hz: 0.12 };
const BALL_RADIUS = 0.18;
const ROLLING_RADIUS = 0.22;
const CHESSBOARD_SIZE = 8;
const CHESSBOARD_CELL_SIZE = 0.84;
const CHESSBOARD_SURFACE_Y = -0.09;
const DOMINO_MATERIAL_PRESETS = {
  wood: {
    friction: 0.75,
    restitution: 0.08,
    linearDamping: 0.2,
    angularDamping: 0.2,
  },
  rubber: {
    friction: 0.9,
    restitution: 0.22,
    linearDamping: 0.08,
    angularDamping: 0.08,
  },
  metal: {
    friction: 0.5,
    restitution: 0.02,
    linearDamping: 0.03,
    angularDamping: 0.03,
  },
};
const BALL_MATERIAL_PRESETS = {
  wood: {
    friction: 0.62,
    restitution: 0.2,
    linearDamping: 0.07,
    angularDamping: 0.07,
    density: 0.9,
  },
  rubber: {
    friction: 0.86,
    restitution: 0.82,
    linearDamping: 0.03,
    angularDamping: 0.03,
    density: 1.1,
  },
  metal: {
    friction: 0.5,
    restitution: 0.06,
    linearDamping: 0.02,
    angularDamping: 0.02,
    density: 2.4,
  },
};

export class PhysicsRuntime {
  constructor() {
    this.initialized = false;
    this.running = false;
    this.speedMultiplier = 1;
    this.stepCount = 0;
    this.accumulatorSeconds = 0;
    this.lastFrameMs = 0;
    this.rafId = null;

    this.rapier = null;
    this.world = null;
    this.eventQueue = null;
    this.groundBody = null;
    this.chessboardFloorBody = null;
    this.chessboardFloorCollider = null;
    this.triggerBallBody = null;
    this.triggerBallCollider = null;
    this.plankBody = null;
    this.plankCollider = null;
    this.leverAnchorBody = null;
    this.leverBody = null;
    this.leverCollider = null;
    this.leverJoint = null;
    this.leverLeftWeightCollider = null;
    this.leverRightWeightCollider = null;
    this.gateBody = null;
    this.gateCollider = null;
    this.rampBody = null;
    this.rampCollider = null;
    this.rollingBody = null;
    this.rollingCollider = null;
    this.triggerHandles = {
      triggerBall: null,
      plank: null,
      lever: null,
      gate: null,
    };

    this.leverConfig = {
      leftWeight: 1.5,
      rightWeight: 1.5,
    };
    this.leverMetrics = this.createEmptyLeverMetrics();

    this.rollingConfig = {
      rampAngleDeg: 18,
      frictionCoeff: 0.55,
      mass: 1.2,
    };
    this.rollingMetrics = this.createEmptyRollingMetrics();

    this.dominoBodies = [];
    this.dominoPieceVariants = [];
    this.dominoColliderHandles = new Set();
    this.dominoConfig = {
      count: 60,
      spacing: 0.34,
      materialPreset: 'wood',
      startX: 1.2,
    };
    this.dominoMetrics = this.createEmptyDominoMetrics();

    this.ballBodies = [];
    this.ballPieceVariants = [];
    this.ballBodyByColliderHandle = new Map();
    this.ballConfig = {
      count: 4,
      materialPreset: 'wood',
      gravityEnabled: true,
      gravityStrength: 1,
    };
    this.ballMetrics = this.createEmptyBallMetrics();
    this.triggerMetrics = this.createEmptyTriggerMetrics();

    this.puzzleConfig = {
      dominoCount: 60,
      dominoSpacing: 0.34,
      ballMaterialPreset: 'wood',
      maxBalls: 1,
      timeLimitSeconds: PUZZLE_TIME_LIMIT_SECONDS,
    };
    this.puzzleMetrics = this.createEmptyPuzzleMetrics();

    this.triggerState = {
      sequenceRunning: false,
      leverActivated: false,
      gateActivated: false,
      gateOpenHeight: 0,
    };

    this.timingSubscribers = new Set();
    this.stateSubscribers = new Set();
    this.basicGameMode = 'chaos';
    this.metricsStore = new TelemetryStore({
      aggregateIntervalMs: 100,
      timelineLimit: 512,
    });
    this.replayCapture = {
      enabled: false,
      intervalSteps: 6,
      maxSnapshots: 600,
    };
    this.replaySnapshots = [];

    this.lastTiming = {
      frameTimeMs: 0,
      physicsStepTimeMs: 0,
      steppedFrames: 0,
      accumulatorSeconds: 0,
      speedMultiplier: this.speedMultiplier,
      totalSteps: this.stepCount,
      timestamp: performance.now(),
    };
  }

  async init() {
    try {
      if (!this.rapier) {
        await RAPIER.init();
        this.rapier = RAPIER;
      }
      this.resetWorld();
      if (!this.world) {
        throw new Error('failed to initialize Rapier world');
      }
      this.initialized = true;
      this.emitState();
      return { ok: true };
    } catch (error) {
      this.initialized = false;
      this.emitState();
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  start() {
    if (!this.initialized || this.running) {
      return;
    }
    this.running = true;
    this.lastFrameMs = performance.now();
    this.rafId = requestAnimationFrame((timestampMs) => this.frame(timestampMs));
    this.emitState();
  }

  pause() {
    if (!this.running) {
      return;
    }
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.emitState();
  }

  resetWorld() {
    if (!this.rapier) {
      return;
    }

    this.pause();

    this.groundBody = null;
    this.chessboardFloorBody = null;
    this.chessboardFloorCollider = null;
    this.triggerBallBody = null;
    this.triggerBallCollider = null;
    this.plankBody = null;
    this.plankCollider = null;
    this.leverAnchorBody = null;
    this.leverBody = null;
    this.leverCollider = null;
    this.leverJoint = null;
    this.leverLeftWeightCollider = null;
    this.leverRightWeightCollider = null;
    this.gateBody = null;
    this.gateCollider = null;
    this.rampBody = null;
    this.rampCollider = null;
    this.rollingBody = null;
    this.rollingCollider = null;
    this.triggerHandles = {
      triggerBall: null,
      plank: null,
      lever: null,
      gate: null,
    };

    this.world = new this.rapier.World({ x: 0, y: -9.81, z: 0 });
    this.eventQueue = new this.rapier.EventQueue(true);
    this.metricsStore.reset();
    this.replaySnapshots = [];
    this.accumulatorSeconds = 0;
    this.stepCount = 0;
    this.dominoBodies = [];
    this.dominoPieceVariants = [];
    this.dominoColliderHandles.clear();
    this.dominoMetrics = this.createEmptyDominoMetrics();
    this.ballBodies = [];
    this.ballPieceVariants = [];
    this.ballBodyByColliderHandle.clear();
    this.ballMetrics = this.createEmptyBallMetrics();
    this.triggerMetrics = this.createEmptyTriggerMetrics();
    this.leverMetrics = this.createEmptyLeverMetrics();
    this.rollingMetrics = this.createEmptyRollingMetrics();
    this.puzzleMetrics.active = false;
    if (this.puzzleMetrics.status === 'running') {
      this.puzzleMetrics.status = 'idle';
      this.puzzleMetrics.failureReason = '';
    }
    this.triggerState = {
      sequenceRunning: false,
      leverActivated: false,
      gateActivated: false,
      gateOpenHeight: 0,
    };

    const groundBodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(0, -0.6, 0);
    this.groundBody = this.world.createRigidBody(groundBodyDesc);
    const floorSurfaceConfig = this.getFloorSurfaceConfig();
    const groundColliderDesc = this.rapier.ColliderDesc.cuboid(5, 0.5, 5)
      .setFriction(floorSurfaceConfig.groundFriction)
      .setRestitution(floorSurfaceConfig.groundRestitution);
    this.world.createCollider(groundColliderDesc, this.groundBody);

    if (floorSurfaceConfig.mode === 'chessboard') {
      const boardHalfSpan = (floorSurfaceConfig.boardSize * floorSurfaceConfig.boardCellSize) / 2;
      const boardHalfThickness = floorSurfaceConfig.boardThickness / 2;
      const boardCenterY = floorSurfaceConfig.boardSurfaceY - boardHalfThickness;
      const boardBodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(0, boardCenterY, 0);
      this.chessboardFloorBody = this.world.createRigidBody(boardBodyDesc);
      const boardColliderDesc = this.rapier.ColliderDesc.cuboid(boardHalfSpan, boardHalfThickness, boardHalfSpan)
        .setFriction(floorSurfaceConfig.boardFriction)
        .setRestitution(floorSurfaceConfig.boardRestitution);
      this.chessboardFloorCollider = this.world.createCollider(boardColliderDesc, this.chessboardFloorBody);
    }

    const triggerBodyDesc = this.rapier.RigidBodyDesc.dynamic().setTranslation(this.dominoConfig.startX, 2.5, 0);
    this.triggerBallBody = this.world.createRigidBody(triggerBodyDesc);
    const triggerColliderDesc = this.rapier.ColliderDesc.cuboid(0.3, 0.3, 0.3)
      .setRestitution(0.1)
      .setFriction(0.7)
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);
    this.triggerBallCollider = this.world.createCollider(triggerColliderDesc, this.triggerBallBody);
    this.triggerHandles.triggerBall = this.triggerBallCollider.handle;

    this.createTriggerMechanismObjects();

    this.setGravity(this.ballConfig.gravityEnabled, this.ballConfig.gravityStrength);
    this.createDominoChain(this.dominoConfig);
    this.createFallingBalls(this.ballConfig);
    this.configureRollingObject(this.rollingConfig);

    this.emitTiming({
      frameTimeMs: 0,
      physicsStepTimeMs: 0,
      steppedFrames: 0,
      accumulatorSeconds: 0,
      speedMultiplier: this.speedMultiplier,
      totalSteps: this.stepCount,
      timestamp: performance.now(),
    });
    this.emitState();
  }

  createTriggerMechanismObjects() {
    const plankDesc = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(this.dominoConfig.startX + 0.35, 0.55, 0)
      .setLinearDamping(0.6)
      .setAngularDamping(0.6);
    this.plankBody = this.world.createRigidBody(plankDesc);
    const plankColliderDesc = this.rapier.ColliderDesc.cuboid(0.5, 0.08, 0.25)
      .setRestitution(0.05)
      .setFriction(0.8)
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);
    this.plankCollider = this.world.createCollider(plankColliderDesc, this.plankBody);
    this.triggerHandles.plank = this.plankCollider.handle;

    const leverPivot = { x: this.dominoConfig.startX + 3.5, y: 0.4, z: 0 };
    this.leverAnchorBody = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.fixed().setTranslation(leverPivot.x, leverPivot.y, leverPivot.z)
    );

    const leverDesc = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(leverPivot.x, leverPivot.y, leverPivot.z)
      .setLinearDamping(0.25)
      .setAngularDamping(0.2)
      .setCanSleep(false);
    this.leverBody = this.world.createRigidBody(leverDesc);
    const leverColliderDesc = this.rapier.ColliderDesc.cuboid(0.7, 0.06, 0.2)
      .setRestitution(0)
      .setFriction(0.9)
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);
    this.leverCollider = this.world.createCollider(leverColliderDesc, this.leverBody);
    this.triggerHandles.lever = this.leverCollider.handle;
    const revolute = this.rapier.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    this.leverJoint = this.world.createImpulseJoint(revolute, this.leverAnchorBody, this.leverBody, true);
    this.applyLeverWeights(this.leverConfig.leftWeight, this.leverConfig.rightWeight);

    const gateDesc = this.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
      this.dominoConfig.startX + 4.7,
      0.35,
      0
    );
    this.gateBody = this.world.createRigidBody(gateDesc);
    const gateColliderDesc = this.rapier.ColliderDesc.cuboid(0.08, 0.35, 0.4)
      .setRestitution(0)
      .setFriction(0.9)
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);
    this.gateCollider = this.world.createCollider(gateColliderDesc, this.gateBody);
    this.triggerHandles.gate = this.gateCollider.handle;
  }

  setLeverWeights(leftWeight, rightWeight) {
    const left = Math.max(0.2, Math.min(8, Number(leftWeight)));
    const right = Math.max(0.2, Math.min(8, Number(rightWeight)));
    this.leverConfig.leftWeight = left;
    this.leverConfig.rightWeight = right;

    this.applyLeverWeights(left, right);
    this.leverMetrics = this.createEmptyLeverMetrics();
    this.emitState();
    return {
      ok: true,
      config: { ...this.leverConfig },
    };
  }

  applyLeverWeights(leftWeight, rightWeight) {
    if (!this.world || !this.leverBody) {
      return;
    }

    if (this.leverLeftWeightCollider) {
      try {
        this.world.removeCollider(this.leverLeftWeightCollider, true);
      } catch {
      }
      this.leverLeftWeightCollider = null;
    }
    if (this.leverRightWeightCollider) {
      try {
        this.world.removeCollider(this.leverRightWeightCollider, true);
      } catch {
      }
      this.leverRightWeightCollider = null;
    }

    const leftDesc = this.rapier.ColliderDesc.cuboid(0.12, 0.1, 0.12)
      .setTranslation(-0.58, 0.12, 0)
      .setDensity(leftWeight)
      .setFriction(0.85)
      .setRestitution(0);
    const rightDesc = this.rapier.ColliderDesc.cuboid(0.12, 0.1, 0.12)
      .setTranslation(0.58, 0.12, 0)
      .setDensity(rightWeight)
      .setFriction(0.85)
      .setRestitution(0);

    this.leverLeftWeightCollider = this.world.createCollider(leftDesc, this.leverBody);
    this.leverRightWeightCollider = this.world.createCollider(rightDesc, this.leverBody);
  }

  setGravity(enabled, strength = 1) {
    const gravityEnabled = Boolean(enabled);
    const gravityStrength = Math.max(0, Math.min(2.5, Number(strength)));
    this.ballConfig.gravityEnabled = gravityEnabled;
    this.ballConfig.gravityStrength = gravityStrength;

    if (this.world) {
      const y = gravityEnabled ? -9.81 * gravityStrength : 0;
      this.world.gravity = { x: 0, y, z: 0 };
    }

    this.emitState();
    this.emitTiming({
      ...this.lastTiming,
      timestamp: performance.now(),
    });
  }

  setSpeedMultiplier(value) {
    const nextSpeed = Number(value);
    if (!Number.isFinite(nextSpeed) || nextSpeed <= 0) {
      return;
    }
    this.speedMultiplier = nextSpeed;
    this.emitTiming({
      ...this.lastTiming,
      speedMultiplier: this.speedMultiplier,
      timestamp: performance.now(),
    });
    this.emitState();
  }

  setBasicGameMode(mode = 'chaos') {
    const normalizedMode = mode === 'chessboard' ? 'chessboard' : 'chaos';
    this.basicGameMode = normalizedMode;
    this.emitState();
    return { ok: true, mode: this.basicGameMode };
  }

  getFloorSurfaceConfig() {
    if (this.basicGameMode === 'chessboard') {
      return {
        mode: 'chessboard',
        groundFriction: 0.9,
        groundRestitution: 0.02,
        boardSize: CHESSBOARD_SIZE,
        boardCellSize: CHESSBOARD_CELL_SIZE,
        boardSurfaceY: CHESSBOARD_SURFACE_Y,
        boardThickness: 0.05,
        boardFriction: 0.78,
        boardRestitution: 0.05,
      };
    }

    return {
      mode: 'chaos',
      groundFriction: 0.72,
      groundRestitution: 0.03,
      boardSize: CHESSBOARD_SIZE,
      boardCellSize: CHESSBOARD_CELL_SIZE,
      boardSurfaceY: CHESSBOARD_SURFACE_Y,
      boardThickness: 0,
      boardFriction: 0,
      boardRestitution: 0,
    };
  }

  createDominoChain(configInput = {}) {
    if (!this.world || !this.rapier) {
      return { ok: false, error: 'initialize Rapier first' };
    }

    const count = Math.max(0, Math.min(200, Math.round(Number(configInput.count ?? this.dominoConfig.count))));
    const spacing = Math.max(0.22, Math.min(0.8, Number(configInput.spacing ?? this.dominoConfig.spacing)));
    const materialPreset =
      DOMINO_MATERIAL_PRESETS[configInput.materialPreset] ? configInput.materialPreset : this.dominoConfig.materialPreset;

    this.dominoConfig = {
      ...this.dominoConfig,
      count,
      spacing,
      materialPreset,
    };

    for (const body of this.dominoBodies) {
      this.world.removeRigidBody(body);
    }
    this.dominoBodies = [];
    this.dominoColliderHandles.clear();

    const material = DOMINO_MATERIAL_PRESETS[materialPreset];
    const startX = this.dominoConfig.startX;
    const centerY = DOMINO_SIZE.hy + 0.001;
    const centerZ = 0;

    for (let index = 0; index < count; index += 1) {
      const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(startX + index * spacing, centerY, centerZ)
        .setLinearDamping(material.linearDamping)
        .setAngularDamping(material.angularDamping)
        .setCanSleep(false);
      const body = this.world.createRigidBody(bodyDesc);
      const colliderDesc = this.rapier.ColliderDesc.cuboid(DOMINO_SIZE.hx, DOMINO_SIZE.hy, DOMINO_SIZE.hz)
        .setRestitution(material.restitution)
        .setFriction(material.friction)
        .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);
      const collider = this.world.createCollider(colliderDesc, body);
      this.dominoBodies.push(body);
      this.dominoColliderHandles.add(collider.handle);
    }

    this.triggerBallBody?.setTranslation({ x: startX, y: 2.5, z: 0 }, true);
    this.triggerBallBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.triggerBallBody?.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.dominoMetrics = this.createEmptyDominoMetrics();
    this.dominoMetrics.count = count;
    this.dominoMetrics.spacing = spacing;
    this.dominoMetrics.materialPreset = materialPreset;
    this.dominoMetrics.fallTimestampsSeconds = new Array(count).fill(null);
    this.dominoMetrics.triggered = false;
    this.dominoMetrics.triggerTimeSeconds = 0;
    this.dominoPieceVariants = this.createPieceVariants(count, 'domino');

    this.emitState();
    this.emitTiming({
      ...this.lastTiming,
      timestamp: performance.now(),
    });

    return {
      ok: true,
      config: { ...this.dominoConfig },
    };
  }

  randomizeSceneObjects(configInput = {}) {
    if (!this.world || !this.rapier) {
      return { ok: false, error: 'initialize Rapier first' };
    }

    const areaHalfWidth = Math.max(1.5, Math.min(6, Number(configInput.areaHalfWidth ?? 3.4)));
    const ballHeightMin = Math.max(0.8, Math.min(6, Number(configInput.ballHeightMin ?? 1.2)));
    const ballHeightMax = Math.max(ballHeightMin + 0.2, Math.min(8, Number(configInput.ballHeightMax ?? 4.4)));
    const placementMode = configInput.placementMode === 'chessboard' ? 'chessboard' : 'chaos';
    const boardSize = Math.max(4, Math.min(12, Math.round(Number(configInput.boardSize ?? 8))));
    const boardCellSize = Math.max(0.4, Math.min(1.5, Number(configInput.boardCellSize ?? 0.84)));
    const boardOriginX = Number(configInput.boardOriginX ?? 0);
    const boardOriginZ = Number(configInput.boardOriginZ ?? 0);

    const randRange = (min, max) => min + Math.random() * (max - min);
    const boardHalfSpan = ((boardSize - 1) * boardCellSize) / 2;
    const randomBoardCoord = (origin) => {
      const index = Math.floor(randRange(0, boardSize));
      const jitter = randRange(-boardCellSize * 0.18, boardCellSize * 0.18);
      return origin - boardHalfSpan + index * boardCellSize + jitter;
    };

    for (const body of this.dominoBodies) {
      const x =
        placementMode === 'chessboard' ? randomBoardCoord(boardOriginX) : randRange(-areaHalfWidth, areaHalfWidth);
      const y = DOMINO_SIZE.hy + randRange(0.0, 0.35);
      const z =
        placementMode === 'chessboard' ? randomBoardCoord(boardOriginZ) : randRange(-areaHalfWidth, areaHalfWidth);
      const yaw = randRange(-Math.PI, Math.PI);
      const half = yaw / 2;

      body.setTranslation({ x, y, z }, true);
      body.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, true);
      body.setLinvel({ x: randRange(-0.35, 0.35), y: 0, z: randRange(-0.35, 0.35) }, true);
      body.setAngvel({ x: 0, y: randRange(-0.8, 0.8), z: 0 }, true);
    }

    for (const body of this.ballBodies) {
      const x =
        placementMode === 'chessboard' ? randomBoardCoord(boardOriginX) : randRange(-areaHalfWidth, areaHalfWidth);
      const y = randRange(ballHeightMin, ballHeightMax);
      const z =
        placementMode === 'chessboard' ? randomBoardCoord(boardOriginZ) : randRange(-areaHalfWidth, areaHalfWidth);
      body.setTranslation({ x, y, z }, true);
      body.setLinvel({ x: randRange(-1.1, 1.1), y: randRange(-0.4, 0.4), z: randRange(-1.1, 1.1) }, true);
      body.setAngvel({ x: randRange(-1.8, 1.8), y: randRange(-1.8, 1.8), z: randRange(-1.8, 1.8) }, true);
    }

    if (this.triggerBallBody) {
      this.triggerBallBody.setTranslation(
        {
          x:
            placementMode === 'chessboard'
              ? randomBoardCoord(boardOriginX)
              : randRange(-areaHalfWidth, areaHalfWidth),
          y: randRange(ballHeightMin + 0.3, ballHeightMax + 0.8),
          z:
            placementMode === 'chessboard'
              ? randomBoardCoord(boardOriginZ)
              : randRange(-areaHalfWidth, areaHalfWidth),
        },
        true
      );
      this.triggerBallBody.setLinvel(
        {
          x: randRange(-1.2, 1.2),
          y: randRange(-0.3, 0.3),
          z: randRange(-1.2, 1.2),
        },
        true
      );
      this.triggerBallBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    this.emitState();
    return {
      ok: true,
      config: {
        placementMode,
        areaHalfWidth,
        ballHeightMin,
        ballHeightMax,
        boardSize,
        boardCellSize,
      },
    };
  }

  createFallingBalls(configInput = {}) {
    if (!this.world || !this.rapier) {
      return { ok: false, error: 'initialize Rapier first' };
    }

    const maxCount = this.basicGameMode === 'chessboard' ? 320 : 12;
    const count = Math.max(0, Math.min(maxCount, Math.round(Number(configInput.count ?? this.ballConfig.count))));
    const materialPreset =
      BALL_MATERIAL_PRESETS[configInput.materialPreset] ? configInput.materialPreset : this.ballConfig.materialPreset;
    const gravityEnabled =
      configInput.gravityEnabled === undefined ? this.ballConfig.gravityEnabled : Boolean(configInput.gravityEnabled);
    const gravityStrength = Math.max(
      0,
      Math.min(2.5, Number(configInput.gravityStrength ?? this.ballConfig.gravityStrength))
    );

    this.ballConfig = {
      ...this.ballConfig,
      count,
      materialPreset,
      gravityEnabled,
      gravityStrength,
    };

    for (const body of this.ballBodies) {
      this.world.removeRigidBody(body);
    }
    this.ballBodies = [];
    this.ballBodyByColliderHandle.clear();

    const material = BALL_MATERIAL_PRESETS[materialPreset];
    const startX = -1.8;
    const spacing = 0.5;
    const startZ = -0.7;

    for (let index = 0; index < count; index += 1) {
      const x = startX + index * spacing;
      const y = 1.2 + index * 0.35;
      const z = startZ + ((index % 2) * 1.4);

      const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setLinearDamping(material.linearDamping)
        .setAngularDamping(material.angularDamping)
        .setCanSleep(false);
      const body = this.world.createRigidBody(bodyDesc);
      const colliderDesc = this.rapier.ColliderDesc.ball(BALL_RADIUS)
        .setDensity(material.density)
        .setRestitution(material.restitution)
        .setFriction(material.friction)
        .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);
      const collider = this.world.createCollider(colliderDesc, body);

      this.ballBodies.push(body);
      this.ballBodyByColliderHandle.set(collider.handle, body);
    }

    this.ballMetrics = this.createEmptyBallMetrics();
    this.ballMetrics.count = count;
    this.ballMetrics.materialPreset = materialPreset;
    this.ballMetrics.gravityEnabled = gravityEnabled;
    this.ballMetrics.gravityStrength = gravityStrength;
    this.ballPieceVariants = this.createPieceVariants(count, 'ball');

    for (const body of this.ballBodies) {
      const t = body.translation();
      this.ballMetrics.maxHeight = Math.max(this.ballMetrics.maxHeight, t.y);
      this.ballMetrics.stateByBody.set(body, {
        spawnTimeSeconds: this.stepCount * FIXED_TIMESTEP_SECONDS,
        firstImpactTimeSeconds: null,
        bounceCount: 0,
        maxHeight: t.y,
        maxImpactForce: 0,
      });
    }

    this.setGravity(gravityEnabled, gravityStrength);
    return {
      ok: true,
      config: { ...this.ballConfig },
    };
  }

  appendFallingBall(configInput = {}) {
    if (!this.world || !this.rapier) {
      return { ok: false, error: 'initialize Rapier first' };
    }

    const maxCount = this.basicGameMode === 'chessboard' ? 320 : 12;
    if (this.ballBodies.length >= maxCount) {
      return { ok: false, error: `ball cap reached (${maxCount})` };
    }

    const materialPreset =
      BALL_MATERIAL_PRESETS[configInput.materialPreset] ? configInput.materialPreset : this.ballConfig.materialPreset;
    const material = BALL_MATERIAL_PRESETS[materialPreset];
    const nextIndex = this.ballBodies.length;
    const translation = {
      x: Number(configInput.x ?? -1.8 + nextIndex * 0.12),
      y: Number(configInput.y ?? 1.2 + nextIndex * 0.08),
      z: Number(configInput.z ?? -0.7 + ((nextIndex % 2) * 0.7)),
    };
    const linearVelocity = {
      x: Number(configInput.vx ?? 0),
      y: Number(configInput.vy ?? 0),
      z: Number(configInput.vz ?? 0),
    };
    const angularVelocity = {
      x: Number(configInput.ax ?? 0),
      y: Number(configInput.ay ?? 0),
      z: Number(configInput.az ?? 0),
    };

    const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(translation.x, translation.y, translation.z)
      .setLinearDamping(material.linearDamping)
      .setAngularDamping(material.angularDamping)
      .setCanSleep(false);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = this.rapier.ColliderDesc.ball(BALL_RADIUS)
      .setDensity(material.density)
      .setRestitution(material.restitution)
      .setFriction(material.friction)
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);
    const collider = this.world.createCollider(colliderDesc, body);

    body.setLinvel(linearVelocity, true);
    body.setAngvel(angularVelocity, true);

    this.ballBodies.push(body);
    this.ballBodyByColliderHandle.set(collider.handle, body);
    this.ballMetrics.count = this.ballBodies.length;
    this.ballMetrics.materialPreset = materialPreset;
    this.ballMetrics.maxHeight = Math.max(this.ballMetrics.maxHeight, translation.y);
    this.ballMetrics.stateByBody.set(body, {
      spawnTimeSeconds: this.stepCount * FIXED_TIMESTEP_SECONDS,
      firstImpactTimeSeconds: null,
      bounceCount: 0,
      maxHeight: translation.y,
      maxImpactForce: 0,
    });

    if (this.ballPieceVariants.length < this.ballBodies.length) {
      this.ballPieceVariants.push(this.createPieceVariantAtIndex(nextIndex, 'ball'));
    }
    this.ballConfig.count = this.ballBodies.length;

    this.emitState();
    return {
      ok: true,
      count: this.ballBodies.length,
      cap: maxCount,
    };
  }

  configureRollingObject(configInput = {}) {
    if (!this.world || !this.rapier) {
      return { ok: false, error: 'initialize Rapier first' };
    }

    const rampAngleDeg = Math.max(4, Math.min(40, Number(configInput.rampAngleDeg ?? this.rollingConfig.rampAngleDeg)));
    const frictionCoeff = Math.max(0.05, Math.min(1.25, Number(configInput.frictionCoeff ?? this.rollingConfig.frictionCoeff)));
    const mass = Math.max(0.2, Math.min(8, Number(configInput.mass ?? this.rollingConfig.mass)));

    this.rollingConfig = {
      rampAngleDeg,
      frictionCoeff,
      mass,
    };

    if (this.rollingBody) {
      this.world.removeRigidBody(this.rollingBody);
      this.rollingBody = null;
      this.rollingCollider = null;
    }
    if (this.rampBody) {
      this.world.removeRigidBody(this.rampBody);
      this.rampBody = null;
      this.rampCollider = null;
    }

    const rampCenter = { x: -1.9, y: 0.18, z: 2.0 };
    const rampHalf = { x: 1.2, y: 0.08, z: 0.55 };
    const theta = (rampAngleDeg * Math.PI) / 180;
    const half = theta / 2;
    const rampQuaternion = { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };

    this.rampBody = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(rampCenter.x, rampCenter.y, rampCenter.z));
    this.rampBody.setRotation(rampQuaternion, true);
    this.rampCollider = this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(rampHalf.x, rampHalf.y, rampHalf.z).setFriction(frictionCoeff).setRestitution(0),
      this.rampBody
    );

    const localTop = { x: rampHalf.x - 0.18, y: rampHalf.y + ROLLING_RADIUS + 0.05, z: 0 };
    const worldTop = {
      x: rampCenter.x + localTop.x * Math.cos(theta) - localTop.y * Math.sin(theta),
      y: rampCenter.y + localTop.x * Math.sin(theta) + localTop.y * Math.cos(theta),
      z: rampCenter.z,
    };

    this.rollingBody = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(worldTop.x, worldTop.y, worldTop.z)
        .setLinearDamping(0.02)
        .setAngularDamping(0.02)
        .setCanSleep(false)
    );
    this.rollingCollider = this.world.createCollider(
      this.rapier.ColliderDesc.ball(ROLLING_RADIUS)
        .setDensity(mass)
        .setFriction(frictionCoeff)
        .setRestitution(0.02)
        .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS),
      this.rollingBody
    );

    this.rollingMetrics = this.createEmptyRollingMetrics();
    this.rollingMetrics.frictionCoeff = frictionCoeff;
    this.rollingMetrics.mass = mass;
    this.rollingMetrics.rampAngleDeg = rampAngleDeg;
    this.rollingMetrics.spawnX = worldTop.x;
    this.rollingMetrics.spawnY = worldTop.y;
    this.rollingMetrics.spawnZ = worldTop.z;
    this.rollingMetrics.initialPotentialEnergy = mass * 9.81 * Math.max(worldTop.y + 0.6, 0);
    this.rollingMetrics.startTimeSeconds = this.stepCount * FIXED_TIMESTEP_SECONDS;

    this.emitState();
    this.emitTiming({ ...this.lastTiming, timestamp: performance.now() });
    return {
      ok: true,
      config: { ...this.rollingConfig },
    };
  }

  triggerDominoChain() {
    if (!this.dominoBodies.length) {
      return { ok: false, error: 'domino chain not created' };
    }

    const firstDomino = this.dominoBodies[0];
    firstDomino.applyImpulse({ x: 2.4, y: 0, z: 0 }, true);
    this.dominoMetrics.triggered = true;
    this.dominoMetrics.triggerTimeSeconds = this.stepCount * FIXED_TIMESTEP_SECONDS;
    this.emitState();
    return { ok: true };
  }

  runTriggerSequence() {
    if (!this.world || !this.triggerBallBody || !this.plankBody) {
      return { ok: false, error: 'initialize Rapier first' };
    }

    this.resetTriggerMechanismPositions();
    this.triggerMetrics = this.createEmptyTriggerMetrics();
    this.triggerState.sequenceRunning = true;
    this.recordTriggerEvent('ball');

    this.triggerBallBody.setTranslation({ x: this.dominoConfig.startX + 0.35, y: 2.1, z: 0 }, true);
    this.triggerBallBody.setLinvel({ x: 0, y: -0.2, z: 0 }, true);
    this.triggerBallBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.emitState();
    return { ok: true };
  }

  startPuzzleAttempt() {
    if (!this.initialized || !this.world) {
      return { ok: false, error: 'initialize Rapier first' };
    }

    this.resetWorld();
    this.createDominoChain({
      count: this.puzzleConfig.dominoCount,
      spacing: this.puzzleConfig.dominoSpacing,
      materialPreset: 'wood',
    });
    this.createFallingBalls({
      count: this.puzzleConfig.maxBalls,
      materialPreset: this.puzzleConfig.ballMaterialPreset,
      gravityEnabled: true,
      gravityStrength: 1,
    });

    const ball = this.ballBodies[0];
    if (!ball) {
      return { ok: false, error: 'failed to create puzzle ball' };
    }

    const launchX = this.dominoConfig.startX - 0.65;
    const launchY = DOMINO_SIZE.hy + BALL_RADIUS + 0.02;
    ball.setTranslation({ x: launchX, y: launchY, z: 0 }, true);
    ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ball.applyImpulse({ x: 3.4, y: 0, z: 0 }, true);

    this.puzzleMetrics.attempts += 1;
    this.puzzleMetrics.active = true;
    this.puzzleMetrics.status = 'running';
    this.puzzleMetrics.failureReason = '';
    this.puzzleMetrics.lastCompletionSeconds = 0;
    this.puzzleMetrics.lastScore = 0;
    this.puzzleMetrics.startTimeSeconds = this.stepCount * FIXED_TIMESTEP_SECONDS;

    this.emitState();
    return {
      ok: true,
      attempt: this.puzzleMetrics.attempts,
      objective: `Topple ${this.puzzleConfig.dominoCount} dominoes in under ${this.puzzleConfig.timeLimitSeconds.toFixed(1)} seconds using one ball`,
    };
  }

  resetPuzzleProgress() {
    this.puzzleMetrics = this.createEmptyPuzzleMetrics();
    this.emitState();
    return { ok: true };
  }

  resetTriggerMechanismPositions() {
    this.triggerState.leverActivated = false;
    this.triggerState.gateActivated = false;
    this.triggerState.gateOpenHeight = 0;

    this.plankBody?.setTranslation({ x: this.dominoConfig.startX + 0.35, y: 0.55, z: 0 }, true);
    this.plankBody?.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.plankBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.plankBody?.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.leverBody?.setTranslation({ x: this.dominoConfig.startX + 3.5, y: 0.4, z: 0 }, true);
    this.leverBody?.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.leverBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.leverBody?.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.leverMetrics = this.createEmptyLeverMetrics();

    this.setGatePose(0);
  }

  getSnapshot() {
    const translation = this.triggerBallBody?.translation() ?? { x: 0, y: 0, z: 0 };
    const linvel = this.triggerBallBody?.linvel() ?? { x: 0, y: 0, z: 0 };
    const rotation = this.triggerBallBody?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 };
    const dominoTransforms = this.dominoBodies.map((body) => {
      const t = body.translation();
      const q = body.rotation();
      return {
        x: t.x,
        y: t.y,
        z: t.z,
        qx: q.x,
        qy: q.y,
        qz: q.z,
        qw: q.w,
      };
    });

    const fallenTimes = this.dominoMetrics.fallTimestampsSeconds.filter((value) => value !== null);
    const avgFallSeconds = fallenTimes.length
      ? fallenTimes.reduce((sum, value) => sum + value, 0) / fallenTimes.length
      : 0;
    const firstFall = fallenTimes.length ? Math.min(...fallenTimes) : 0;
    const lastFall = fallenTimes.length ? Math.max(...fallenTimes) : 0;
    const chainDuration = Math.max(lastFall - firstFall, 0);
    const chainSpeed = chainDuration > 0 ? fallenTimes.length / chainDuration : 0;

    const ballTransforms = this.ballBodies.map((body) => {
      const t = body.translation();
      const q = body.rotation();
      return {
        x: t.x,
        y: t.y,
        z: t.z,
        qx: q.x,
        qy: q.y,
        qz: q.z,
        qw: q.w,
      };
    });

    const fallTimes = [];
    let bounceCount = 0;
    let maxImpactForce = 0;
    let maxHeight = 0;
    for (const state of this.ballMetrics.stateByBody.values()) {
      if (state.firstImpactTimeSeconds !== null) {
        fallTimes.push(state.firstImpactTimeSeconds - state.spawnTimeSeconds);
      }
      bounceCount += state.bounceCount;
      maxImpactForce = Math.max(maxImpactForce, state.maxImpactForce);
      maxHeight = Math.max(maxHeight, state.maxHeight);
    }
    const fallTimeAvgSeconds = fallTimes.length ? fallTimes.reduce((sum, value) => sum + value, 0) / fallTimes.length : 0;

    const plankTranslation = this.plankBody?.translation() ?? { x: 0, y: 0, z: 0 };
    const plankRotation = this.plankBody?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 };
    const leverTranslation = this.leverBody?.translation() ?? { x: 0, y: 0, z: 0 };
    const leverRotation = this.leverBody?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 };
    const gateTranslation = this.gateBody?.translation() ?? { x: 0, y: 0, z: 0 };
    const gateRotation = this.gateBody?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 };
    const rampTranslation = this.rampBody?.translation() ?? { x: 0, y: 0, z: 0 };
    const rampRotation = this.rampBody?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 };
    const rollingTranslation = this.rollingBody?.translation() ?? { x: 0, y: 0, z: 0 };
    const rollingRotation = this.rollingBody?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 };

    const triggerEventOrder = this.triggerMetrics.eventOrder.map((event) => event.name);
    const expectedPrefix = TRIGGER_SEQUENCE_ORDER.slice(0, triggerEventOrder.length);
    const inOrderMatches = triggerEventOrder.filter((name, idx) => name === expectedPrefix[idx]).length;
    const completion = triggerEventOrder.length / TRIGGER_SEQUENCE_ORDER.length;
    const orderAccuracy = triggerEventOrder.length ? inOrderMatches / triggerEventOrder.length : 0;
    const precisionScore = Math.max(0, Math.min(100, (completion * 0.5 + orderAccuracy * 0.5) * 100));

    const latencies = [];
    for (let index = 1; index < this.triggerMetrics.eventOrder.length; index += 1) {
      latencies.push(this.triggerMetrics.eventOrder[index].timeSeconds - this.triggerMetrics.eventOrder[index - 1].timeSeconds);
    }
    const sequenceTimeSeconds =
      this.triggerMetrics.eventOrder.length >= 2
        ? this.triggerMetrics.eventOrder[this.triggerMetrics.eventOrder.length - 1].timeSeconds -
          this.triggerMetrics.eventOrder[0].timeSeconds
        : 0;

    return {
      initialized: this.initialized,
      running: this.running,
      speedMultiplier: this.speedMultiplier,
      totalSteps: this.stepCount,
      cubeX: translation.x,
      cubeY: translation.y,
      cubeZ: translation.z,
      velocityY: linvel.y,
      cubeQx: rotation.x,
      cubeQy: rotation.y,
      cubeQz: rotation.z,
      cubeQw: rotation.w,
      triggerMechanismTransforms: {
        plank: {
          x: plankTranslation.x,
          y: plankTranslation.y,
          z: plankTranslation.z,
          qx: plankRotation.x,
          qy: plankRotation.y,
          qz: plankRotation.z,
          qw: plankRotation.w,
        },
        lever: {
          x: leverTranslation.x,
          y: leverTranslation.y,
          z: leverTranslation.z,
          qx: leverRotation.x,
          qy: leverRotation.y,
          qz: leverRotation.z,
          qw: leverRotation.w,
        },
        gate: {
          x: gateTranslation.x,
          y: gateTranslation.y,
          z: gateTranslation.z,
          qx: gateRotation.x,
          qy: gateRotation.y,
          qz: gateRotation.z,
          qw: gateRotation.w,
        },
      },
      rollingTransforms: {
        ramp: {
          x: rampTranslation.x,
          y: rampTranslation.y,
          z: rampTranslation.z,
          qx: rampRotation.x,
          qy: rampRotation.y,
          qz: rampRotation.z,
          qw: rampRotation.w,
        },
        roller: {
          x: rollingTranslation.x,
          y: rollingTranslation.y,
          z: rollingTranslation.z,
          qx: rollingRotation.x,
          qy: rollingRotation.y,
          qz: rollingRotation.z,
          qw: rollingRotation.w,
        },
      },
      ballTransforms,
      ballMaterialPreset: this.ballMetrics.materialPreset,
      ballPieceVariants: this.ballPieceVariants,
      dominoTransforms,
      dominoMaterialPreset: this.dominoMetrics.materialPreset,
      dominoPieceVariants: this.dominoPieceVariants,
      basicGameMode: this.basicGameMode,
      ball: {
        count: this.ballMetrics.count,
        materialPreset: this.ballMetrics.materialPreset,
        gravityEnabled: this.ballMetrics.gravityEnabled,
        gravityStrength: this.ballMetrics.gravityStrength,
        fallTimeAvgSeconds,
        bounceCount,
        maxHeight,
        impactForceMax: maxImpactForce,
      },
      trigger: {
        sequenceTimeSeconds,
        latencies,
        eventOrder: triggerEventOrder,
        precisionScore,
      },
      lever: {
        leftWeight: this.leverConfig.leftWeight,
        rightWeight: this.leverConfig.rightWeight,
        torque: this.leverMetrics.torque,
        rotationSpeed: this.leverMetrics.rotationSpeed,
        equilibriumTimeSeconds: this.leverMetrics.equilibriumTimeSeconds,
      },
      rolling: {
        rampAngleDeg: this.rollingMetrics.rampAngleDeg,
        frictionCoeff: this.rollingMetrics.frictionCoeff,
        mass: this.rollingMetrics.mass,
        distance: this.rollingMetrics.distance,
        velocityAvg: this.rollingMetrics.velocityAvg,
        energyLoss: this.rollingMetrics.energyLoss,
      },
      puzzle: {
        objective: `Topple all dominoes in under ${this.puzzleConfig.timeLimitSeconds.toFixed(1)}s using one ball`,
        attempts: this.puzzleMetrics.attempts,
        successes: this.puzzleMetrics.successes,
        status: this.puzzleMetrics.status,
        active: this.puzzleMetrics.active,
        failureReason: this.puzzleMetrics.failureReason,
        lastCompletionSeconds: this.puzzleMetrics.lastCompletionSeconds,
        bestCompletionSeconds: this.puzzleMetrics.bestCompletionSeconds,
        lastScore: this.puzzleMetrics.lastScore,
      },
      replay: {
        captureEnabled: this.replayCapture.enabled,
        intervalSteps: this.replayCapture.intervalSteps,
        maxSnapshots: this.replayCapture.maxSnapshots,
        count: this.replaySnapshots.length,
        latestIndex: Math.max(0, this.replaySnapshots.length - 1),
      },
      floor: this.getFloorSurfaceConfig(),
      metricsPipeline: this.metricsStore.exportState(),
      domino: {
        count: this.dominoMetrics.count,
        spacing: this.dominoMetrics.spacing,
        materialPreset: this.dominoMetrics.materialPreset,
        fallenCount: fallenTimes.length,
        fallTimeAvgSeconds: avgFallSeconds,
        collisionEvents: this.dominoMetrics.collisionEvents,
        maxVelocity: this.dominoMetrics.maxVelocity,
        chainSpeedPerSecond: chainSpeed,
      },
      accumulatorSeconds: this.accumulatorSeconds,
      lastTiming: this.lastTiming,
    };
  }

  onTiming(callback) {
    this.timingSubscribers.add(callback);
    callback(this.lastTiming, this.getSnapshot());
    return () => {
      this.timingSubscribers.delete(callback);
    };
  }

  onState(callback) {
    this.stateSubscribers.add(callback);
    callback(this.getSnapshot());
    return () => {
      this.stateSubscribers.delete(callback);
    };
  }

  onMetricsStream(callback) {
    return this.metricsStore.onStream(callback);
  }

  setMetricsAggregateIntervalMs(value) {
    const intervalMs = this.metricsStore.setAggregateIntervalMs(value);
    this.emitState();
    return { ok: true, intervalMs };
  }

  setReplayCaptureConfig(configInput = {}) {
    if (configInput.enabled !== undefined) {
      this.replayCapture.enabled = Boolean(configInput.enabled);
    }
    if (configInput.intervalSteps !== undefined) {
      this.replayCapture.intervalSteps = Math.max(1, Math.min(120, Math.round(Number(configInput.intervalSteps) || 1)));
    }
    if (configInput.maxSnapshots !== undefined) {
      this.replayCapture.maxSnapshots = Math.max(60, Math.min(5000, Math.round(Number(configInput.maxSnapshots) || 600)));
      if (this.replaySnapshots.length > this.replayCapture.maxSnapshots) {
        this.replaySnapshots = this.replaySnapshots.slice(this.replaySnapshots.length - this.replayCapture.maxSnapshots);
      }
    }
    this.emitState();
    return {
      ok: true,
      config: {
        ...this.replayCapture,
      },
      count: this.replaySnapshots.length,
    };
  }

  clearReplaySnapshots() {
    this.replaySnapshots = [];
    this.emitState();
    return { ok: true };
  }

  getReplaySnapshot(index) {
    if (!this.replaySnapshots.length) {
      return { ok: false, error: 'no replay snapshots available' };
    }
    const boundedIndex = Math.max(0, Math.min(this.replaySnapshots.length - 1, Math.round(Number(index) || 0)));
    return {
      ok: true,
      index: boundedIndex,
      total: this.replaySnapshots.length,
      snapshot: this.inflateReplaySnapshot(this.replaySnapshots[boundedIndex]),
    };
  }

  dispose() {
    this.pause();
    this.timingSubscribers.clear();
    this.stateSubscribers.clear();
    this.metricsStore.clearSubscribers();
    this.metricsStore.reset();
  }

  frame(timestampMs) {
    if (!this.running || !this.world) {
      return;
    }

    const elapsedMs = timestampMs - this.lastFrameMs;
    this.lastFrameMs = timestampMs;

    const scaledElapsedSeconds = (elapsedMs / 1000) * this.speedMultiplier;
    this.accumulatorSeconds += scaledElapsedSeconds;

    const stepStart = performance.now();
    let steppedFrames = 0;
    while (this.accumulatorSeconds >= FIXED_TIMESTEP_SECONDS && steppedFrames < MAX_STEPS_PER_FRAME) {
      this.world.timestep = FIXED_TIMESTEP_SECONDS;
      this.world.step(this.eventQueue);
      this.accumulatorSeconds -= FIXED_TIMESTEP_SECONDS;
      this.stepCount += 1;
      steppedFrames += 1;
      this.collectCollisionAndModuleMetrics();
      this.collectLeverMetrics();
      this.collectRollingMetrics();
      this.advanceTriggerMechanism();
      this.evaluatePuzzleAttempt();
      this.captureReplaySnapshot();
    }
    const stepEnd = performance.now();

    this.emitTiming({
      frameTimeMs: elapsedMs,
      physicsStepTimeMs: stepEnd - stepStart,
      steppedFrames,
      accumulatorSeconds: this.accumulatorSeconds,
      speedMultiplier: this.speedMultiplier,
      totalSteps: this.stepCount,
      timestamp: timestampMs,
    });

    this.rafId = requestAnimationFrame((nextTimestampMs) => this.frame(nextTimestampMs));
  }

  collectCollisionAndModuleMetrics() {
    const nowSeconds = this.stepCount * FIXED_TIMESTEP_SECONDS;

    if (this.eventQueue) {
      this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        if (!started) {
          return;
        }
        const isDominoCollision = this.dominoColliderHandles.has(handle1) || this.dominoColliderHandles.has(handle2);
        if (isDominoCollision) {
          this.dominoMetrics.collisionEvents += 1;
          if (!this.dominoMetrics.triggered) {
            this.dominoMetrics.triggered = true;
            this.dominoMetrics.triggerTimeSeconds = nowSeconds;
          }
        }

        const ballBody = this.ballBodyByColliderHandle.get(handle1) ?? this.ballBodyByColliderHandle.get(handle2);
        if (ballBody) {
          const state = this.ballMetrics.stateByBody.get(ballBody);
          if (state) {
            state.bounceCount += 1;
            if (state.firstImpactTimeSeconds === null) {
              state.firstImpactTimeSeconds = nowSeconds;
            }
            const velocity = ballBody.linvel();
            const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
            const mass = typeof ballBody.mass === 'function' ? ballBody.mass() : 1;
            const impactForceEstimate = speed * mass;
            state.maxImpactForce = Math.max(state.maxImpactForce, impactForceEstimate);
            this.ballMetrics.impactEvents += 1;
          }
        }

        const plankHitTriggerBall =
          (handle1 === this.triggerHandles.triggerBall && handle2 === this.triggerHandles.plank) ||
          (handle2 === this.triggerHandles.triggerBall && handle1 === this.triggerHandles.plank);
        if (plankHitTriggerBall) {
          this.recordTriggerEvent('plank');
          if (this.dominoBodies[0]) {
            this.dominoBodies[0].applyImpulse({ x: 2.3, y: 0, z: 0 }, true);
          }
        }
      });
    }

    for (let index = 0; index < this.dominoBodies.length; index += 1) {
      const body = this.dominoBodies[index];
      const velocity = body.linvel();
      const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
      if (speed > this.dominoMetrics.maxVelocity) {
        this.dominoMetrics.maxVelocity = speed;
      }

      const rotation = body.rotation();
      const tilt = Math.max(Math.abs(rotation.x), Math.abs(rotation.z));
      const alreadyFallen = this.dominoMetrics.fallTimestampsSeconds[index] !== null;
      if (!alreadyFallen && tilt > 0.28) {
        const relativeTime = Math.max(0, nowSeconds - this.dominoMetrics.triggerTimeSeconds);
        this.dominoMetrics.fallTimestampsSeconds[index] = relativeTime;
        if (index === 0) {
          this.recordTriggerEvent('domino');
        }
      }
    }

    for (const body of this.ballBodies) {
      const state = this.ballMetrics.stateByBody.get(body);
      if (!state) {
        continue;
      }
      const t = body.translation();
      state.maxHeight = Math.max(state.maxHeight, t.y);
      this.ballMetrics.maxHeight = Math.max(this.ballMetrics.maxHeight, t.y);
    }
  }

  advanceTriggerMechanism() {
    if (!this.triggerState.sequenceRunning) {
      return;
    }

    if (this.hasTriggerEvent('domino') && !this.triggerState.leverActivated) {
      this.triggerState.leverActivated = true;
      this.leverMetrics.activationTimeSeconds = this.stepCount * FIXED_TIMESTEP_SECONDS;
      this.leverBody?.applyImpulse({ x: 0, y: 0.25, z: 0 }, true);
      this.leverBody?.applyTorqueImpulse({ x: 0, y: 0, z: 1.8 }, true);
    }

    const leverAngleRad = this.getLeverAngleRad();
    if (this.triggerState.leverActivated && Math.abs(leverAngleRad) >= 0.2) {
      if (!this.hasTriggerEvent('lever')) {
        this.recordTriggerEvent('lever');
        this.triggerState.gateActivated = true;
      }
    }

    if (this.triggerState.gateActivated && this.triggerState.gateOpenHeight < 0.9) {
      const targetGateOpen = Math.max(0, Math.min(0.9, (Math.abs(leverAngleRad) - 0.16) * 2.4));
      this.triggerState.gateOpenHeight = Math.max(this.triggerState.gateOpenHeight, targetGateOpen);
      this.setGatePose(this.triggerState.gateOpenHeight);
      if (this.triggerState.gateOpenHeight >= 0.6) {
        this.recordTriggerEvent('gate');
      }
    }

    if (this.hasTriggerEvent('gate')) {
      this.triggerState.sequenceRunning = false;
    }
  }

  collectLeverMetrics() {
    if (!this.leverBody) {
      return;
    }

    const angle = this.getLeverAngleRad();
    const angularVelocity = this.leverBody.angvel();
    const rotationSpeed = Math.abs(angularVelocity.z);
    const armLength = 0.58;
    const g = 9.81;
    const torque = (this.leverConfig.rightWeight - this.leverConfig.leftWeight) * g * armLength * Math.cos(angle);

    this.leverMetrics.torque = torque;
    this.leverMetrics.rotationSpeed = rotationSpeed;

    if (Math.abs(angle) > 0.05 || rotationSpeed > 0.02) {
      this.leverMetrics.active = true;
      this.leverMetrics.stableFrames = 0;
    } else if (this.leverMetrics.active) {
      this.leverMetrics.stableFrames += 1;
      if (this.leverMetrics.stableFrames >= 24 && this.leverMetrics.equilibriumTimeSeconds === 0) {
        const now = this.stepCount * FIXED_TIMESTEP_SECONDS;
        const start = this.leverMetrics.activationTimeSeconds;
        this.leverMetrics.equilibriumTimeSeconds = Math.max(0, now - start);
      }
    }
  }

  getLeverAngleRad() {
    const rotation = this.leverBody?.rotation() ?? { z: 0, w: 1 };
    return 2 * Math.atan2(rotation.z, rotation.w);
  }

  collectRollingMetrics() {
    if (!this.rollingBody) {
      return;
    }

    const position = this.rollingBody.translation();
    const velocity = this.rollingBody.linvel();
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
    const elapsed = Math.max(this.stepCount * FIXED_TIMESTEP_SECONDS - this.rollingMetrics.startTimeSeconds, FIXED_TIMESTEP_SECONDS);
    const distance = Math.sqrt(
      (position.x - this.rollingMetrics.spawnX) ** 2 +
        (position.y - this.rollingMetrics.spawnY) ** 2 +
        (position.z - this.rollingMetrics.spawnZ) ** 2
    );

    this.rollingMetrics.distance = distance;
    this.rollingMetrics.speedIntegral += speed * FIXED_TIMESTEP_SECONDS;
    this.rollingMetrics.velocityAvg = this.rollingMetrics.speedIntegral / elapsed;

    const mass = this.rollingMetrics.mass;
    const potential = mass * 9.81 * Math.max(position.y + 0.6, 0);
    const kinetic = 0.5 * mass * speed * speed;
    const currentEnergy = potential + kinetic;
    this.rollingMetrics.energyLoss = Math.max(0, this.rollingMetrics.initialPotentialEnergy - currentEnergy);
  }

  setGatePose(openHeight) {
    if (!this.gateBody) {
      return;
    }
    const translation = { x: this.dominoConfig.startX + 4.7, y: 0.35 + openHeight, z: 0 };
    const rotation = { x: 0, y: 0, z: 0, w: 1 };
    if (typeof this.gateBody.setNextKinematicTranslation === 'function') {
      this.gateBody.setNextKinematicTranslation(translation);
      this.gateBody.setNextKinematicRotation(rotation);
    } else {
      this.gateBody.setTranslation(translation, true);
      this.gateBody.setRotation(rotation, true);
    }
  }

  recordTriggerEvent(name) {
    if (this.hasTriggerEvent(name)) {
      return;
    }
    const timeSeconds = this.stepCount * FIXED_TIMESTEP_SECONDS;
    this.triggerMetrics.eventOrder.push({
      name,
      timeSeconds,
    });
    this.metricsStore.lpush('timeline:events', {
      type: 'trigger',
      name,
      timeSeconds: Number(timeSeconds.toFixed(4)),
    });
  }

  hasTriggerEvent(name) {
    return this.triggerMetrics.eventOrder.some((event) => event.name === name);
  }

  createEmptyDominoMetrics() {
    return {
      count: 0,
      spacing: this.dominoConfig.spacing,
      materialPreset: this.dominoConfig.materialPreset,
      collisionEvents: 0,
      maxVelocity: 0,
      fallTimestampsSeconds: [],
      triggered: false,
      triggerTimeSeconds: 0,
    };
  }

  createEmptyBallMetrics() {
    return {
      count: 0,
      materialPreset: this.ballConfig.materialPreset,
      gravityEnabled: this.ballConfig.gravityEnabled,
      gravityStrength: this.ballConfig.gravityStrength,
      impactEvents: 0,
      maxHeight: 0,
      stateByBody: new Map(),
    };
  }

  createEmptyTriggerMetrics() {
    return {
      eventOrder: [],
    };
  }

  createEmptyLeverMetrics() {
    return {
      torque: 0,
      rotationSpeed: 0,
      equilibriumTimeSeconds: 0,
      activationTimeSeconds: this.stepCount * FIXED_TIMESTEP_SECONDS,
      active: false,
      stableFrames: 0,
    };
  }

  createEmptyRollingMetrics() {
    return {
      rampAngleDeg: this.rollingConfig.rampAngleDeg,
      frictionCoeff: this.rollingConfig.frictionCoeff,
      mass: this.rollingConfig.mass,
      distance: 0,
      velocityAvg: 0,
      energyLoss: 0,
      speedIntegral: 0,
      initialPotentialEnergy: 0,
      startTimeSeconds: this.stepCount * FIXED_TIMESTEP_SECONDS,
      spawnX: 0,
      spawnY: 0,
      spawnZ: 0,
    };
  }

  createEmptyPuzzleMetrics() {
    return {
      attempts: 0,
      successes: 0,
      status: 'idle',
      active: false,
      failureReason: '',
      startTimeSeconds: 0,
      lastCompletionSeconds: 0,
      bestCompletionSeconds: 0,
      lastScore: 0,
    };
  }

  createPieceVariants(count, kind) {
    const safeCount = Math.max(0, Math.round(Number(count) || 0));
    if (this.basicGameMode !== 'chessboard') {
      return new Array(safeCount).fill(null);
    }

    const dominoKinds = ['rook', 'bishop', 'knight', 'queen', 'king', 'pawn'];
    const ballKinds = ['pawn', 'pawn', 'knight', 'bishop', 'rook', 'queen'];
    const pieceKinds = kind === 'domino' ? dominoKinds : ballKinds;
    const variants = [];
    const midpoint = Math.ceil(safeCount / 2);

    for (let index = 0; index < safeCount; index += 1) {
      variants.push({
        color: index < midpoint ? 'white' : 'black',
        kind: pieceKinds[index % pieceKinds.length],
      });
    }

    return variants;
  }

  createPieceVariantAtIndex(index, kind) {
    if (this.basicGameMode !== 'chessboard') {
      return null;
    }
    const dominoKinds = ['rook', 'bishop', 'knight', 'queen', 'king', 'pawn'];
    const ballKinds = ['pawn', 'pawn', 'knight', 'bishop', 'rook', 'queen'];
    const pieceKinds = kind === 'domino' ? dominoKinds : ballKinds;
    return {
      color: index % 2 === 0 ? 'white' : 'black',
      kind: pieceKinds[index % pieceKinds.length],
    };
  }

  evaluatePuzzleAttempt() {
    if (!this.puzzleMetrics.active) {
      return;
    }

    const now = this.stepCount * FIXED_TIMESTEP_SECONDS;
    const elapsed = Math.max(0, now - this.puzzleMetrics.startTimeSeconds);
    const fallenCount = this.dominoMetrics.fallTimestampsSeconds.filter((value) => value !== null).length;
    const requiredCount = this.dominoMetrics.count;
    const allFallen = requiredCount > 0 && fallenCount >= requiredCount;
    const singleBallRuleSatisfied = this.ballBodies.length === this.puzzleConfig.maxBalls;

    if (allFallen) {
      if (singleBallRuleSatisfied && elapsed <= this.puzzleConfig.timeLimitSeconds) {
        this.finishPuzzleAttempt('success', elapsed, fallenCount, '');
      } else {
        const reason = !singleBallRuleSatisfied
          ? 'more than one ball used'
          : `completed in ${elapsed.toFixed(3)}s (limit ${this.puzzleConfig.timeLimitSeconds.toFixed(3)}s)`;
        this.finishPuzzleAttempt('failure', elapsed, fallenCount, reason);
      }
      return;
    }

    if (elapsed > this.puzzleConfig.timeLimitSeconds) {
      this.finishPuzzleAttempt(
        'failure',
        elapsed,
        fallenCount,
        `time limit exceeded (${elapsed.toFixed(3)}s > ${this.puzzleConfig.timeLimitSeconds.toFixed(3)}s)`
      );
    }
  }

  finishPuzzleAttempt(status, completionSeconds, fallenCount, failureReason) {
    const success = status === 'success';
    this.puzzleMetrics.active = false;
    this.puzzleMetrics.status = status;
    this.puzzleMetrics.failureReason = success ? '' : failureReason;
    this.puzzleMetrics.lastCompletionSeconds = completionSeconds;
    this.puzzleMetrics.lastScore = this.computePuzzleScore(completionSeconds, fallenCount, success);

    if (success) {
      this.puzzleMetrics.successes += 1;
      if (this.puzzleMetrics.bestCompletionSeconds === 0 || completionSeconds < this.puzzleMetrics.bestCompletionSeconds) {
        this.puzzleMetrics.bestCompletionSeconds = completionSeconds;
      }
    }

    this.metricsStore.lpush('timeline:events', {
      type: 'puzzle',
      status,
      completionSeconds: Number(completionSeconds.toFixed(4)),
      score: Number(this.puzzleMetrics.lastScore.toFixed(2)),
      reason: success ? '' : failureReason,
    });

    this.emitState();
  }

  computePuzzleScore(completionSeconds, fallenCount, success) {
    const count = Math.max(1, this.dominoMetrics.count);
    const coverage = Math.max(0, Math.min(1, fallenCount / count));
    const timeFactor = Math.max(0, Math.min(1, 1 - completionSeconds / this.puzzleConfig.timeLimitSeconds));
    const ballRuleFactor = this.ballBodies.length === this.puzzleConfig.maxBalls ? 1 : 0;

    let score = coverage * 55 + timeFactor * 35 + ballRuleFactor * 10;
    if (!success) {
      score *= 0.75;
    }
    return Math.round(score * 10) / 10;
  }

  captureReplaySnapshot() {
    if (!this.replayCapture.enabled) {
      return;
    }
    if (this.stepCount % this.replayCapture.intervalSteps !== 0) {
      return;
    }

    const snapshot = this.getSnapshot();
    const compact = this.compactReplaySnapshot(snapshot);
    this.replaySnapshots.push(compact);
    if (this.replaySnapshots.length > this.replayCapture.maxSnapshots) {
      this.replaySnapshots.shift();
    }
  }

  compactReplaySnapshot(snapshot) {
    const toVec = (transform) => [
      Number(transform.x.toFixed(4)),
      Number(transform.y.toFixed(4)),
      Number(transform.z.toFixed(4)),
      Number(transform.qx.toFixed(4)),
      Number(transform.qy.toFixed(4)),
      Number(transform.qz.toFixed(4)),
      Number(transform.qw.toFixed(4)),
    ];

    return {
      s: snapshot.totalSteps,
      c: [
        Number(snapshot.cubeX.toFixed(4)),
        Number(snapshot.cubeY.toFixed(4)),
        Number(snapshot.cubeZ.toFixed(4)),
        Number(snapshot.cubeQx.toFixed(4)),
        Number(snapshot.cubeQy.toFixed(4)),
        Number(snapshot.cubeQz.toFixed(4)),
        Number(snapshot.cubeQw.toFixed(4)),
      ],
      bt: (snapshot.ballTransforms ?? []).map((transform) => toVec(transform)),
      dt: (snapshot.dominoTransforms ?? []).map((transform) => toVec(transform)),
      tm: {
        p: toVec(snapshot.triggerMechanismTransforms.plank),
        l: toVec(snapshot.triggerMechanismTransforms.lever),
        g: toVec(snapshot.triggerMechanismTransforms.gate),
      },
      rm: {
        ramp: toVec(snapshot.rollingTransforms.ramp),
        roller: toVec(snapshot.rollingTransforms.roller),
      },
      bm: snapshot.ballMaterialPreset,
      dm: snapshot.dominoMaterialPreset,
      b: {
        count: snapshot.ball.count,
        fallTimeAvgSeconds: Number(snapshot.ball.fallTimeAvgSeconds.toFixed(4)),
        bounceCount: snapshot.ball.bounceCount,
        maxHeight: Number(snapshot.ball.maxHeight.toFixed(4)),
        impactForceMax: Number(snapshot.ball.impactForceMax.toFixed(4)),
      },
      d: {
        count: snapshot.domino.count,
        fallTimeAvgSeconds: Number(snapshot.domino.fallTimeAvgSeconds.toFixed(4)),
        collisionEvents: snapshot.domino.collisionEvents,
        maxVelocity: Number(snapshot.domino.maxVelocity.toFixed(4)),
        chainSpeedPerSecond: Number(snapshot.domino.chainSpeedPerSecond.toFixed(4)),
      },
      l: {
        torque: Number(snapshot.lever.torque.toFixed(4)),
        rotationSpeed: Number(snapshot.lever.rotationSpeed.toFixed(4)),
        equilibriumTimeSeconds: Number(snapshot.lever.equilibriumTimeSeconds.toFixed(4)),
      },
      r: {
        rampAngleDeg: Number(snapshot.rolling.rampAngleDeg.toFixed(2)),
        frictionCoeff: Number(snapshot.rolling.frictionCoeff.toFixed(4)),
        mass: Number(snapshot.rolling.mass.toFixed(4)),
        distance: Number(snapshot.rolling.distance.toFixed(4)),
        velocityAvg: Number(snapshot.rolling.velocityAvg.toFixed(4)),
        energyLoss: Number(snapshot.rolling.energyLoss.toFixed(4)),
      },
      p: {
        status: snapshot.puzzle.status,
        attempts: snapshot.puzzle.attempts,
        successes: snapshot.puzzle.successes,
        lastCompletionSeconds: Number(snapshot.puzzle.lastCompletionSeconds.toFixed(4)),
        bestCompletionSeconds: Number(snapshot.puzzle.bestCompletionSeconds.toFixed(4)),
        lastScore: Number(snapshot.puzzle.lastScore.toFixed(2)),
      },
    };
  }

  inflateReplaySnapshot(compact) {
    const fromVec = (value) => ({
      x: value[0],
      y: value[1],
      z: value[2],
      qx: value[3],
      qy: value[4],
      qz: value[5],
      qw: value[6],
    });

    const live = this.getSnapshot();
    return {
      ...live,
      totalSteps: compact.s,
      cubeX: compact.c[0],
      cubeY: compact.c[1],
      cubeZ: compact.c[2],
      cubeQx: compact.c[3],
      cubeQy: compact.c[4],
      cubeQz: compact.c[5],
      cubeQw: compact.c[6],
      ballTransforms: compact.bt.map((value) => fromVec(value)),
      dominoTransforms: compact.dt.map((value) => fromVec(value)),
      triggerMechanismTransforms: {
        plank: fromVec(compact.tm.p),
        lever: fromVec(compact.tm.l),
        gate: fromVec(compact.tm.g),
      },
      rollingTransforms: {
        ramp: fromVec(compact.rm.ramp),
        roller: fromVec(compact.rm.roller),
      },
      ballMaterialPreset: compact.bm,
      dominoMaterialPreset: compact.dm,
      ball: {
        ...live.ball,
        ...compact.b,
      },
      domino: {
        ...live.domino,
        ...compact.d,
      },
      lever: {
        ...live.lever,
        ...compact.l,
      },
      rolling: {
        ...live.rolling,
        ...compact.r,
      },
      puzzle: {
        ...live.puzzle,
        ...compact.p,
      },
    };
  }

  emitTiming(timing) {
    this.lastTiming = timing;
    const snapshot = this.getSnapshot();
    this.metricsStore.sampleFrame({
      timestampMs: timing.timestamp,
      timing,
      snapshot,
    });
    for (const callback of this.timingSubscribers) {
      callback(timing, snapshot);
    }
  }

  emitState() {
    const snapshot = this.getSnapshot();
    for (const callback of this.stateSubscribers) {
      callback(snapshot);
    }
  }
}
