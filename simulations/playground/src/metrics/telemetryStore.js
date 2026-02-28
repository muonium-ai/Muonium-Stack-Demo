const DEFAULT_AGGREGATE_INTERVAL_MS = 100;
const DEFAULT_TIMELINE_LIMIT = 512;

export class TelemetryStore {
  constructor(config = {}) {
    this.aggregateIntervalMs = this.normalizeInterval(config.aggregateIntervalMs ?? DEFAULT_AGGREGATE_INTERVAL_MS);
    this.timelineLimit = Math.max(64, Math.min(4096, Number(config.timelineLimit ?? DEFAULT_TIMELINE_LIMIT)));

    this.hashes = new Map();
    this.lists = new Map();
    this.frameBuffer = [];
    this.streamSubscribers = new Set();
    this.lastFlushTimestampMs = 0;
    this.streamTick = 0;
    this.lastAggregatePacket = null;

    this.operationCounts = {
      total: 0,
      hset: 0,
      hincrby: 0,
      lpush: 0,
    };
    this.lastDominoCollisionEvents = 0;
  }

  reset() {
    this.hashes.clear();
    this.lists.clear();
    this.frameBuffer = [];
    this.lastFlushTimestampMs = 0;
    this.streamTick = 0;
    this.lastAggregatePacket = null;
    this.operationCounts = {
      total: 0,
      hset: 0,
      hincrby: 0,
      lpush: 0,
    };
    this.lastDominoCollisionEvents = 0;
  }

  clearSubscribers() {
    this.streamSubscribers.clear();
  }

  setAggregateIntervalMs(value) {
    this.aggregateIntervalMs = this.normalizeInterval(value);
    return this.aggregateIntervalMs;
  }

  getAggregateIntervalMs() {
    return this.aggregateIntervalMs;
  }

  hset(key, field, value) {
    const hash = this.ensureHash(key);
    hash.set(field, value);
    this.bumpOps('hset');
    return value;
  }

  hincrby(key, field, amount = 1) {
    const hash = this.ensureHash(key);
    const increment = Number(amount);
    const current = Number(hash.get(field) ?? 0);
    const next = current + increment;
    hash.set(field, next);
    this.bumpOps('hincrby');
    return next;
  }

  lpush(key, value, maxLen = this.timelineLimit) {
    const list = this.ensureList(key);
    list.unshift(value);
    if (list.length > maxLen) {
      list.length = maxLen;
    }
    this.bumpOps('lpush');
    return list.length;
  }

  hgetall(key) {
    const hash = this.hashes.get(key);
    if (!hash) {
      return {};
    }
    return Object.fromEntries(hash.entries());
  }

  lrange(key, start = 0, end = -1) {
    const list = this.lists.get(key) ?? [];
    const to = end < 0 ? list.length : end + 1;
    return list.slice(start, to);
  }

  onStream(callback) {
    this.streamSubscribers.add(callback);
    if (this.lastAggregatePacket) {
      callback(this.lastAggregatePacket);
    }
    return () => {
      this.streamSubscribers.delete(callback);
    };
  }

  sampleFrame(frameSample) {
    this.frameBuffer.push(frameSample);
    const nowMs = Number(frameSample.timestampMs ?? performance.now());
    if (!this.lastFlushTimestampMs) {
      this.lastFlushTimestampMs = nowMs;
      return null;
    }
    if (nowMs - this.lastFlushTimestampMs < this.aggregateIntervalMs) {
      return null;
    }

    const packet = this.flush(nowMs);
    this.lastFlushTimestampMs = nowMs;
    return packet;
  }

  flush(nowMs = performance.now()) {
    if (!this.frameBuffer.length) {
      return null;
    }

    const frames = this.frameBuffer;
    this.frameBuffer = [];

    const frameCount = frames.length;
    const intervalMs = Math.max(nowMs - Number(frames[0].timestampMs ?? nowMs), 1);
    let frameTimeSum = 0;
    let stepTimeSum = 0;
    let subStepsSum = 0;
    let maxStepTimeMs = 0;

    for (const frame of frames) {
      frameTimeSum += Number(frame.timing.frameTimeMs ?? 0);
      const stepTimeMs = Number(frame.timing.physicsStepTimeMs ?? 0);
      stepTimeSum += stepTimeMs;
      subStepsSum += Number(frame.timing.steppedFrames ?? 0);
      maxStepTimeMs = Math.max(maxStepTimeMs, stepTimeMs);
    }

    const latest = frames[frames.length - 1];
    const latestSnapshot = latest.snapshot;

    const fps = 1000 / Math.max(frameTimeSum / frameCount, 0.0001);
    const avgFrameTimeMs = frameTimeSum / frameCount;
    const avgPhysicsStepTimeMs = stepTimeSum / frameCount;
    const avgSubSteps = subStepsSum / frameCount;

    this.hset('metrics:hud', 'fps', Number(fps.toFixed(2)));
    this.hset('metrics:hud', 'frame_time_ms', Number(avgFrameTimeMs.toFixed(3)));
    this.hset('metrics:hud', 'physics_step_time_ms', Number(avgPhysicsStepTimeMs.toFixed(3)));
    this.hset('metrics:hud', 'sub_steps_avg', Number(avgSubSteps.toFixed(3)));
    this.hset('metrics:hud', 'step_time_max_ms', Number(maxStepTimeMs.toFixed(3)));

    this.hset('metrics:domino', 'count', latestSnapshot.domino.count);
    this.hset('metrics:domino', 'collision_events', latestSnapshot.domino.collisionEvents);
    this.hset('metrics:domino', 'fall_time_avg', Number(latestSnapshot.domino.fallTimeAvgSeconds.toFixed(4)));
    this.hset('metrics:domino', 'max_velocity', Number(latestSnapshot.domino.maxVelocity.toFixed(4)));

    this.hset('metrics:ball', 'fall_time_avg', Number(latestSnapshot.ball.fallTimeAvgSeconds.toFixed(4)));
    this.hset('metrics:ball', 'bounce_count', latestSnapshot.ball.bounceCount);
    this.hset('metrics:ball', 'impact_force_max', Number(latestSnapshot.ball.impactForceMax.toFixed(4)));

    this.hset('metrics:lever', 'torque', Number(latestSnapshot.lever.torque.toFixed(4)));
    this.hset('metrics:lever', 'rotation_speed', Number(latestSnapshot.lever.rotationSpeed.toFixed(4)));

    this.hset('metrics:roll', 'distance', Number(latestSnapshot.rolling.distance.toFixed(4)));
    this.hset('metrics:roll', 'velocity_avg', Number(latestSnapshot.rolling.velocityAvg.toFixed(4)));
    this.hset('metrics:roll', 'energy_loss', Number(latestSnapshot.rolling.energyLoss.toFixed(4)));

    this.hset('metrics:puzzle', 'attempts', latestSnapshot.puzzle.attempts);
    this.hset('metrics:puzzle', 'successes', latestSnapshot.puzzle.successes);
    this.hset('metrics:puzzle', 'completion_time', Number(latestSnapshot.puzzle.lastCompletionSeconds.toFixed(4)));
    this.hset('metrics:puzzle', 'physics_efficiency_score', Number(latestSnapshot.puzzle.lastScore.toFixed(2)));

    this.hincrby('metrics:counters', 'aggregate_flushes', 1);
    const collisionDelta = Math.max(0, latestSnapshot.domino.collisionEvents - this.lastDominoCollisionEvents);
    this.lastDominoCollisionEvents = latestSnapshot.domino.collisionEvents;
    if (collisionDelta > 0) {
      this.hincrby('metrics:counters', 'domino_collision_delta_total', collisionDelta);
    }

    this.lpush('timeline:frames', {
      timestampMs: nowMs,
      fps: Number(fps.toFixed(2)),
      frameTimeMs: Number(avgFrameTimeMs.toFixed(3)),
      physicsStepTimeMs: Number(avgPhysicsStepTimeMs.toFixed(3)),
      subStepsAvg: Number(avgSubSteps.toFixed(3)),
      dominoCollisionEvents: latestSnapshot.domino.collisionEvents,
      ballImpactMax: Number(latestSnapshot.ball.impactForceMax.toFixed(3)),
      leverTorque: Number(latestSnapshot.lever.torque.toFixed(3)),
    });

    const packet = {
      tick: ++this.streamTick,
      timestampMs: nowMs,
      intervalMs,
      frameCount,
      gauges: {
        fps: Number(fps.toFixed(2)),
        frameTimeMs: Number(avgFrameTimeMs.toFixed(3)),
        physicsStepTimeMs: Number(avgPhysicsStepTimeMs.toFixed(3)),
        subStepsAvg: Number(avgSubSteps.toFixed(3)),
      },
      hashes: {
        hud: this.hgetall('metrics:hud'),
        domino: this.hgetall('metrics:domino'),
        ball: this.hgetall('metrics:ball'),
        lever: this.hgetall('metrics:lever'),
        roll: this.hgetall('metrics:roll'),
        puzzle: this.hgetall('metrics:puzzle'),
        counters: this.hgetall('metrics:counters'),
      },
      timelineHead: this.lrange('timeline:frames', 0, 0)[0] ?? null,
      opCounts: { ...this.operationCounts },
    };

    this.lastAggregatePacket = packet;
    for (const callback of this.streamSubscribers) {
      callback(packet);
    }
    return packet;
  }

  exportState() {
    return {
      aggregateIntervalMs: this.aggregateIntervalMs,
      streamTick: this.streamTick,
      opCounts: { ...this.operationCounts },
      lastAggregatePacket: this.lastAggregatePacket,
    };
  }

  ensureHash(key) {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    return this.hashes.get(key);
  }

  ensureList(key) {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    return this.lists.get(key);
  }

  bumpOps(type) {
    this.operationCounts.total += 1;
    this.operationCounts[type] += 1;
  }

  normalizeInterval(value) {
    const interval = Number(value);
    if (!Number.isFinite(interval)) {
      return DEFAULT_AGGREGATE_INTERVAL_MS;
    }
    return Math.max(16, Math.min(2000, Math.round(interval)));
  }
}