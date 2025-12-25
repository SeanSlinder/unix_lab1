class Semaphore {
  constructor(max) {
    this.max = Math.max(1, max);
    this.current = 0;
    this.queue = [];
  }

  acquire() {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve)).then(() => {
      this.current++;
    });
  }

  release() {
    this.current = Math.max(0, this.current - 1);
    const next = this.queue.shift();
    if (next) next();
  }

  async use(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

class DomainLimiter {
  constructor(perDomain) {
    this.perDomain = Math.max(1, perDomain);
    this.map = new Map();
  }

  _sem(domain) {
    let s = this.map.get(domain);
    if (!s) {
      s = new Semaphore(this.perDomain);
      this.map.set(domain, s);
    }
    return s;
  }

  async use(domain, fn) {
    return this._sem(domain).use(fn);
  }
}

module.exports = { Semaphore, DomainLimiter };
