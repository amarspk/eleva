import * as ddTrace from 'dd-trace';

let tracerInitialized = false;

export function initDatadogTracer(): void {
  if (tracerInitialized) { return; }
  if (!process.env.DD_AGENT_HOST) {
    return;
  }

  ddTrace.init({
    service: process.env.DD_SERVICE || 'zayjar-api',
    version: process.env.DD_VERSION || '1.0.0',
    env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
    hostname: process.env.DD_AGENT_HOST,
    port: parseInt(process.env.DD_TRACE_AGENT_PORT || '8126', 10),
    logInjection: true,
    runtimeMetrics: true,
    analytics: true,
    sampleRate: parseFloat(process.env.DD_TRACE_SAMPLE_RATE || '1'),
    tags: {
      'service.version': process.env.DD_VERSION || '1.0.0',
    },
  });

  tracerInitialized = true;
}

export function traceOperation<T>(name: string, fn: () => T): T {
  if (!tracerInitialized) { return fn(); }
  return ddTrace.trace(name, () => fn()) as T;
}

export async function traceAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!tracerInitialized) { return fn(); }
  return ddTrace.trace(name, async () => fn()) as Promise<T>;
}

export function addTag(key: string, value: string | number | boolean): void {
  if (!tracerInitialized) { return; }
  ddTrace.trace('active_span', (span: ddTrace.Span) => {
    if (span) {
      span.setTag(key, value);
    }
  });
}

export function logErrorToDatadog(error: Error, meta?: Record<string, unknown>): void {
  if (!tracerInitialized) { return; }
  ddTrace.trace('error', (span: ddTrace.Span) => {
    if (span) {
      span.setTag('error', true);
      span.setTag('error.type', error.name);
      span.setTag('error.message', error.message);
      span.setTag('error.stack', error.stack || '');
      if (meta) {
        for (const [key, value] of Object.entries(meta)) {
          span.setTag(key, String(value));
        }
      }
    }
  });
}
