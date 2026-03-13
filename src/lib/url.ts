export function buildAuthUrl(baseUrl: string, accountIndex: number): string {
  try {
    const targetUrl = new URL(baseUrl);
    targetUrl.searchParams.set('authuser', String(accountIndex));
    return targetUrl.toString();
  } catch {
    return baseUrl;
  }
}

export function normalizeCustomUrl(input: string): string | null {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    return null;
  }

  const candidateUrl = /^https?:\/\//i.test(trimmedInput)
    ? trimmedInput
    : `https://${trimmedInput}`;

  try {
    const normalizedUrl = new URL(candidateUrl);
    if (!['http:', 'https:'].includes(normalizedUrl.protocol)) {
      return null;
    }

    return normalizedUrl.toString();
  } catch {
    return null;
  }
}