const SERIES = [
  { key: 'velocity', label: 'Velocity', color: '#65d7ff' },
  { key: 'torque', label: 'Torque', color: '#ffbf6b' },
  { key: 'impact', label: 'Impact', color: '#ff7f9e' },
];

const WINDOW_PRESETS = {
  short: 120,
  medium: 300,
};

export class LiveGraphPanel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.windowKey = 'medium';
    this.maxSamples = WINDOW_PRESETS[this.windowKey];
    this.samples = [];
    this.rafId = null;
    this.renderQueued = false;

    this.resizeForDevicePixelRatio();
  }

  setWindow(windowKey) {
    if (!WINDOW_PRESETS[windowKey]) {
      return this.windowKey;
    }
    this.windowKey = windowKey;
    this.maxSamples = WINDOW_PRESETS[windowKey];
    if (this.samples.length > this.maxSamples) {
      this.samples = this.samples.slice(this.samples.length - this.maxSamples);
    }
    this.queueRender();
    return this.windowKey;
  }

  ingest(sample) {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
    this.queueRender();
  }

  getSampleCount() {
    return this.samples.length;
  }

  getWindowKey() {
    return this.windowKey;
  }

  dispose() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.renderQueued = false;
  }

  queueRender() {
    if (this.renderQueued) {
      return;
    }
    this.renderQueued = true;
    this.rafId = requestAnimationFrame(() => {
      this.renderQueued = false;
      this.rafId = null;
      this.render();
    });
  }

  resizeForDevicePixelRatio() {
    const ratio = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render() {
    if (!this.ctx) {
      return;
    }

    this.resizeForDevicePixelRatio();

    const { width, height } = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#0f1a30';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#294367';
    ctx.lineWidth = 1;
    const guideRows = 4;
    for (let i = 1; i < guideRows; i += 1) {
      const y = (height / guideRows) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!this.samples.length) {
      return;
    }

    const maxValue = Math.max(
      0.001,
      ...this.samples.flatMap((sample) => [Math.abs(sample.velocity), Math.abs(sample.torque), Math.abs(sample.impact)])
    );

    for (const series of SERIES) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.samples.forEach((sample, idx) => {
        const x = this.samples.length === 1 ? width : (idx / (this.samples.length - 1)) * width;
        const normalized = Math.max(0, Math.min(1, Math.abs(sample[series.key]) / maxValue));
        const y = height - normalized * (height - 8) - 4;
        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }
  }
}
