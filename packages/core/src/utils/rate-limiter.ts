/**
 * Rate limiting utilities
 *
 * Token bucket rate limiter, delays, and throttling helpers.
 */

/**
 * Simple delay function
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  return Math.min(exponentialDelay, maxDelay);
}

/**
 * Token bucket rate limiter
 * Allows burst requests up to bucket capacity, then enforces rate limit
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second

  /**
   * @param capacity - Maximum number of tokens (burst capacity)
   * @param refillRate - Tokens added per second
   */
  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Try to consume tokens
   * Returns true if successful, false if not enough tokens
   */
  tryConsume(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Wait until tokens are available, then consume
   */
  async consume(tokens: number = 1): Promise<void> {
    while (!this.tryConsume(tokens)) {
      // Calculate how long to wait for next token
      const waitTime = (1 / this.refillRate) * 1000; // ms per token
      await delay(Math.min(waitTime, 100)); // Check at least every 100ms
    }
  }

  /**
   * Get current number of available tokens
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Reset rate limiter to full capacity
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

/**
 * Execute a function with rate limiting
 */
export async function executeWithRateLimit<T>(
  fn: () => Promise<T>,
  rateLimiter: RateLimiter,
  tokens: number = 1
): Promise<T> {
  await rateLimiter.consume(tokens);
  return await fn();
}

/**
 * Execute multiple functions with rate limiting
 * Processes them sequentially with rate limiting
 */
export async function executeBatchWithRateLimit<T>(
  fns: Array<() => Promise<T>>,
  rateLimiter: RateLimiter,
  tokensPerItem: number = 1
): Promise<T[]> {
  const results: T[] = [];

  for (const fn of fns) {
    const result = await executeWithRateLimit(fn, rateLimiter, tokensPerItem);
    results.push(result);
  }

  return results;
}

/**
 * Throttle function - ensures function is called at most once per interval
 */
export class Throttle {
  private lastCall: number = 0;
  private readonly intervalMs: number;

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  /**
   * Execute function if enough time has passed
   * Returns true if executed, false if throttled
   */
  execute(fn: () => void): boolean {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;

    if (timeSinceLastCall >= this.intervalMs) {
      this.lastCall = now;
      fn();
      return true;
    }

    return false;
  }

  /**
   * Execute function, waiting if necessary
   */
  async executeAsync(fn: () => void | Promise<void>): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;

    if (timeSinceLastCall < this.intervalMs) {
      await delay(this.intervalMs - timeSinceLastCall);
    }

    this.lastCall = Date.now();
    await fn();
  }

  /**
   * Reset throttle timer
   */
  reset(): void {
    this.lastCall = 0;
  }
}

/**
 * Simple time-based rate limiter
 * Ensures minimum time between calls
 */
export class SimpleRateLimiter {
  private lastCallTime: number = 0;
  private readonly minInterval: number;

  constructor(minIntervalMs: number) {
    this.minInterval = minIntervalMs;
  }

  /**
   * Wait if needed to maintain rate limit, then proceed
   */
  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCallTime;

    if (elapsed < this.minInterval) {
      await delay(this.minInterval - elapsed);
    }

    this.lastCallTime = Date.now();
  }
}

/**
 * Retry helper with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const backoffDelay = calculateBackoff(attempt, baseDelay, maxDelay);
        await delay(backoffDelay);
      }
    }
  }

  throw lastError || new Error("Retry failed with unknown error");
}

