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
    this.current = null;
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
      this.current = { priority: takeBackground ? 'background' : 'interactive', startedAt: Date.now() };
      try { item.resolve(await item.job()); }
      catch (error) { this.onError(error); item.reject(error); }
      finally { this.current = null; }
    }
    this.running = false;
  }

  status() {
    return {
      running: this.running,
      currentPriority: this.current?.priority || null,
      currentSeconds: this.current ? Math.floor((Date.now() - this.current.startedAt) / 1000) : 0,
      interactiveWaiting: this.interactive.length,
      backgroundWaiting: this.background.length
    };
  }
}

module.exports = { WorkQueue };
