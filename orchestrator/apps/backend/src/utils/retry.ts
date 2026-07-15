interface RetryOptions {
  retries: number;
  delayMs: number;
  shouldRetry: (err: unknown) => boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= options.retries || !options.shouldRetry(err)) {
        throw err;
      }
      attempt += 1;
      await sleep(options.delayMs);
    }
  }
}

export function isRetryableOpenRouterError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 429) {
    return true;
  }
  const code = (err as { code?: string })?.code;
  const networkErrorCodes = new Set(["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED"]);
  if (code && networkErrorCodes.has(code)) {
    return true;
  }
  return false;
}
