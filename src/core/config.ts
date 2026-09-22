let configuredBaseUrl: string | null = null;

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function autodetectBaseUrl(): string {
  if (typeof window === 'undefined') {
    throw new Error(
      'HighQTools could not auto-detect the API base URL outside a browser. ' +
      'Call HighQTools.config.setBaseUrl(...) first.'
    );
  }

  return `${window.location.origin}/api/3`;
}

export const HighQConfig = {
  /**
   * Overrides the HighQ API base URL used by all SDK calls.
   *
   * Example:
   * https://portal.example.com/instance/api/3
   */
  setBaseUrl(url: string): void {
    if (!url || !url.trim()) {
      throw new Error('baseUrl cannot be empty.');
    }
    configuredBaseUrl = normalizeBaseUrl(url);
  },

  /**
   * Returns the configured base URL, or the browser fallback.
   */
  getBaseUrl(): string {
    return configuredBaseUrl || autodetectBaseUrl();
  },

  /**
   * Clears a previously configured override.
   */
  resetBaseUrl(): void {
    configuredBaseUrl = null;
  },

  /**
   * Tells consumers whether a manual override has been configured.
   */
  hasCustomBaseUrl(): boolean {
    return configuredBaseUrl !== null;
  }
};
