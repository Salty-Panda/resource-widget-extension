/**
 * Simple token-bucket rate limiter.
 * Queues async tasks and ensures at least `delayMs` between executions.
 */
export class RateLimiter {
  /**
   * @param {number} delayMs  minimum milliseconds between task executions
   */
  constructor(delayMs = 3000) {
    this.delayMs      = delayMs;
    this._queue       = [];
    this._processing  = false;
    this._lastRun     = 0;
  }

  /**
   * Enqueue an async task. Returns a promise that resolves with the task result.
   * @param {() => Promise<any>} task
   * @returns {Promise<any>}
   */
  enqueue(task) {
    return new Promise((resolve, reject) => {
      this._queue.push({ task, resolve, reject });
      if (!this._processing) this._drain();
    });
  }

  async _drain() {
    if (this._queue.length === 0) { this._processing = false; return; }
    this._processing = true;

    const { task, resolve, reject } = this._queue.shift();
    const wait = this.delayMs - (Date.now() - this._lastRun);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));

    try   { resolve(await task()); }
    catch (e) { reject(e); }
    finally {
      this._lastRun = Date.now();
      this._drain();
    }
  }

  /** Clear all pending tasks (e.g. on SW restart). */
  clear() { this._queue = []; this._processing = false; }
}