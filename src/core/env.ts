/**
 * Returns the current browser origin, e.g. https://example.highq.com.
 */
export function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    throw new Error('HighQTools environment helpers require a browser window.');
  }
  return window.location.origin;
}

/**
 * Best-effort check for a HighQ browser environment.
 */
export function isInHighQ(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as any).collab_common_moduleName !== 'undefined';
}

/**
 * Returns HighQ's current module name when that global is available.
 */
export function getModuleName(): string | null {
  if (typeof window === 'undefined') return null;
  return (window as any).collab_common_moduleName || null;
}
