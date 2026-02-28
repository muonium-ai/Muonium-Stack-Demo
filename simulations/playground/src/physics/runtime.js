import RAPIER from '@dimforge/rapier3d-compat';

const FIXED_TIMESTEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 8;

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
    this.groundBody = null;
    this.fallingBody = null;
    this.fallingCollider = null;

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
    this.accumulatorSeconds = 0;
    this.stepCount = 0;

    const groundBodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(0, -0.6, 0);
    this.groundBody = this.world.createRigidBody(groundBodyDesc);
    const groundColliderDesc = this.rapier.ColliderDesc.cuboid(5, 0.5, 5);
    this.world.createCollider(groundColliderDesc, this.groundBody);

    const fallingBodyDesc = this.rapier.RigidBodyDesc.dynamic().setTranslation(0, 2.5, 0);
    this.fallingBody = this.world.createRigidBody(fallingBodyDesc);
    const fallingColliderDesc = this.rapier.ColliderDesc.cuboid(0.3, 0.3, 0.3).setRestitution(0.4);
    this.fallingCollider = this.world.createCollider(fallingColliderDesc, this.fallingBody);

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

  getSnapshot() {
    const translation = this.fallingBody?.translation() ?? { x: 0, y: 0, z: 0 };
    const linvel = this.fallingBody?.linvel() ?? { x: 0, y: 0, z: 0 };
    return {
      initialized: this.initialized,
      running: this.running,
      speedMultiplier: this.speedMultiplier,
      totalSteps: this.stepCount,
      cubeY: translation.y,
      velocityY: linvel.y,
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
      this.world.step();
      this.accumulatorSeconds -= FIXED_TIMESTEP_SECONDS;
      this.stepCount += 1;
      steppedFrames += 1;
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
