export function ensureWritableErrorStackTraceLimit(): void {
  const currentValue = (Error as any).stackTraceLimit ?? 10;
  try {
    Object.defineProperty(Error, 'stackTraceLimit', {
      value: currentValue,
      writable: true,
      configurable: true
    });
  } catch {
    // If a host makes the property non-configurable, Playwright will still be the
    // source of truth for the final error. Most affected hosts keep it configurable.
  }
}

export async function importPlaywright() {
  ensureWritableErrorStackTraceLimit();
  return import('playwright');
}
