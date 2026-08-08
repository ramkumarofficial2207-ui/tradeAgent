/**
 * retry.ts
 * Exponential backoff retry utility for handling rate-limited or delayed APIs
 */

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 5000,
  context = 'Operation'
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      console.warn(`⚠️ [Retry] ${context} attempt ${attempt}/${attempts} failed: ${err.message || err}`);
      if (attempt < attempts) {
        const backoffTime = delayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffTime));
      }
    }
  }
  throw lastError;
}
