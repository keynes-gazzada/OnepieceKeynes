import type { NextRequest } from 'next/server';

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const hosts = [
      request.headers.get('host'),
      request.headers.get('x-forwarded-host'),
      request.nextUrl.host,
    ];
    if (hosts.includes(source.host)) return true;
    if (process.env.NODE_ENV !== 'production') {
      const local = new Set(['localhost', '127.0.0.1', '[::1]']);
      if (
        local.has(source.hostname) &&
        local.has(request.nextUrl.hostname) &&
        source.port === request.nextUrl.port
      )
        return true;
    }
    return false;
  } catch {
    return false;
  }
}
