const STORAGE_PREFIX = 'muon-mini-redis:';

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
    localStorage.setItem(key, JSON.stringify(value));
  }
}
