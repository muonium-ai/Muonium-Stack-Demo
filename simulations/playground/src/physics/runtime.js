import RAPIER from '@dimforge/rapier3d-compat';

const FIXED_TIMESTEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 8;
const DOMINO_SIZE = { hx: 0.04, hy: 0.25, hz: 0.12 };
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
    this.fallingBody = null;
    this.fallingCollider = null;

    this.dominoBodies = [];
    this.dominoColliderHandles = new Set();
    this.dominoConfig = {
      count: 60,
      spacing: 0.34,
      materialPreset: 'wood',
      startX: 1.2,
    };
    this.dominoMetrics = this.createEmptyDominoMetrics();

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

    const groundBodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(0, -0.6, 0);
    this.groundBody = this.world.createRigidBody(groundBodyDesc);
    const groundColliderDesc = this.rapier.ColliderDesc.cuboid(5, 0.5, 5);
    this.world.createCollider(groundColliderDesc, this.groundBody);

    const fallingBodyDesc = this.rapier.RigidBodyDesc.dynamic().setTranslation(this.dominoConfig.startX, 2.5, 0);
    this.fallingBody = this.world.createRigidBody(fallingBodyDesc);
    const fallingColliderDesc = this.rapier.ColliderDesc.cuboid(0.3, 0.3, 0.3)
      .setRestitution(0.1)
      .setFriction(0.7)
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);
    this.fallingCollider = this.world.createCollider(fallingColliderDesc, this.fallingBody);

    this.createDominoChain(this.dominoConfig);

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

    this.fallingBody?.setTranslation({ x: startX, y: 2.5, z: 0 }, true);
    this.fallingBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.fallingBody?.setAngvel({ x: 0, y: 0, z: 0 }, true);

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

  getSnapshot() {
    const translation = this.fallingBody?.translation() ?? { x: 0, y: 0, z: 0 };
    const linvel = this.fallingBody?.linvel() ?? { x: 0, y: 0, z: 0 };
    const rotation = this.fallingBody?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 };
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
      dominoTransforms,
      dominoMaterialPreset: this.dominoMetrics.materialPreset,
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
      this.collectDominoMetrics();
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

  collectDominoMetrics() {
    if (!this.dominoBodies.length) {
      return;
    }

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
      }
    }
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
