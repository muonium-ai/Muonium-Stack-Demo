const STORAGE_PREFIX = 'muon-mini-redis:';
const MAX_PERSISTED_CHARS = 750_000;

export class MiniRedisCache {
  constructor(namespace = 'default') {
    this.namespace = namespace;
    this.memory = new Map();
  }

  key(rawKey) {
    return `${STORAGE_PREFIX}${this.namespace}:${rawKey}`;
  }

  get(rawKey) {
    const key = this.key(rawKey);
    if (this.memory.has(key)) {
      return this.memory.get(key);
    }

    const fromStorage = localStorage.getItem(key);
    if (!fromStorage) {
      return null;
    }

    try {
      const parsed = JSON.parse(fromStorage);
      this.memory.set(key, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  set(rawKey, value) {
    const key = this.key(rawKey);
    this.memory.set(key, value);

    let serialized;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return;
    }

    if (!serialized || serialized.length > MAX_PERSISTED_CHARS) {
      return;
    }

    try {
      localStorage.setItem(key, serialized);
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        return;
      }
    }
  }
}
