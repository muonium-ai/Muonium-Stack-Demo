import RAPIER from '@dimforge/rapier3d-compat';

const FIXED_TIMESTEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 8;
const TRIGGER_SEQUENCE_ORDER = ['ball', 'plank', 'domino', 'lever', 'gate'];
const DOMINO_SIZE = { hx: 0.04, hy: 0.25, hz: 0.12 };
const BALL_RADIUS = 0.18;
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

    this.dominoBodies = [];
    this.dominoColliderHandles = new Set();
    this.dominoConfig = {
      count: 60,
      spacing: 0.34,
      materialPreset: 'wood',
      startX: 1.2,
    };
    this.dominoMetrics = this.createEmptyDominoMetrics();

    this.ballBodies = [];
    this.ballBodyByColliderHandle = new Map();
    this.ballConfig = {
      count: 4,
      materialPreset: 'wood',
      gravityEnabled: true,
      gravityStrength: 1,
    };
    this.ballMetrics = this.createEmptyBallMetrics();
    this.triggerMetrics = this.createEmptyTriggerMetrics();

    this.triggerState = {
      sequenceRunning: false,
      leverActivated: false,
      gateActivated: false,
      gateOpenHeight: 0,
    };

    this.timingSubscribers = new Set();
    this.stateSubscribers = new Set();

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
        this.rapier = await RAPIER.init();
      }
      this.resetWorld();
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
    this.world = new this.rapier.World({ x: 0, y: -9.81, z: 0 });
    this.eventQueue = new this.rapier.EventQueue(true);
    this.accumulatorSeconds = 0;
    this.stepCount = 0;
    this.dominoBodies = [];
    this.dominoColliderHandles.clear();
    this.dominoMetrics = this.createEmptyDominoMetrics();
    this.ballBodies = [];
    this.ballBodyByColliderHandle.clear();
    this.ballMetrics = this.createEmptyBallMetrics();
    this.triggerMetrics = this.createEmptyTriggerMetrics();
    this.leverMetrics = this.createEmptyLeverMetrics();
    this.triggerState = {
      sequenceRunning: false,
      leverActivated: false,
      gateActivated: false,
      gateOpenHeight: 0,
    };

    const groundBodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(0, -0.6, 0);
    this.groundBody = this.world.createRigidBody(groundBodyDesc);
    const groundColliderDesc = this.rapier.ColliderDesc.cuboid(5, 0.5, 5);
    this.world.createCollider(groundColliderDesc, this.groundBody);

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
      this.world.removeCollider(this.leverLeftWeightCollider, true);
      this.leverLeftWeightCollider = null;
    }
    if (this.leverRightWeightCollider) {
      this.world.removeCollider(this.leverRightWeightCollider, true);
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

  createDominoChain(configInput = {}) {
    if (!this.world || !this.rapier) {
      return { ok: false, error: 'initialize Rapier first' };
    }

    const count = Math.max(50, Math.min(200, Math.round(Number(configInput.count ?? this.dominoConfig.count))));
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

  createFallingBalls(configInput = {}) {
    if (!this.world || !this.rapier) {
      return { ok: false, error: 'initialize Rapier first' };
    }

    const count = Math.max(1, Math.min(12, Math.round(Number(configInput.count ?? this.ballConfig.count))));
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
      ballTransforms,
      ballMaterialPreset: this.ballMetrics.materialPreset,
      dominoTransforms,
      dominoMaterialPreset: this.dominoMetrics.materialPreset,
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

  dispose() {
    this.pause();
    this.timingSubscribers.clear();
    this.stateSubscribers.clear();
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
      this.advanceTriggerMechanism();
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
    this.triggerMetrics.eventOrder.push({
      name,
      timeSeconds: this.stepCount * FIXED_TIMESTEP_SECONDS,
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

  emitTiming(timing) {
    this.lastTiming = timing;
    const snapshot = this.getSnapshot();
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
