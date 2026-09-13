'use strict';

// The Sheets compatibility layer is process-wide and must not run two jobs at
// once. Prefer waiting LINE replies over the next background sync instead.
class WorkQueue {
  constructor(onError = console.error) {
    this.onError = onError;
    this.interactive = [];
    this.background = [];
    this.running = false;
    this.interactiveSinceBackground = 0;
  }

  enqueue(job, priority = 'interactive') {
    return new Promise((resolve, reject) => {
      const target = priority === 'background' ? this.background : this.interactive;
      target.push({ job, resolve, reject });
      if (!this.running) this.drain();
    });
  }

  async drain() {
    this.running = true;
    while (this.interactive.length || this.background.length) {
      const takeBackground = this.background.length && (!this.interactive.length || this.interactiveSinceBackground >= 10);
      const item = takeBackground ? this.background.shift() : this.interactive.shift();
      this.interactiveSinceBackground = takeBackground ? 0 : this.interactiveSinceBackground + 1;
      try { item.resolve(await item.job()); }
      catch (error) { this.onError(error); item.reject(error); }
    }
    this.running = false;
  }
}

module.exports = { WorkQueue };
