import type { Transaction } from '@sentry/core';
import { Hub, makeMain, runWithAsyncContext } from '@sentry/core';
import * as http from 'http';
import type { fetch as FetchType } from 'undici';

import { NodeClient } from '../../src/client.ts';
import type { UndiciOptions } from '../../src/integrations/undici.ts';
import { Undici } from '../../src/integrations/undici.ts';
import { getDefaultNodeClientOptions } from '../helper/node-client-options.ts';
import { conditionalTest } from '../utils.ts';

const SENTRY_DSN = 'https://0@0.ingest.sentry.io/0';

let hub: Hub;
let fetch: typeof FetchType;

beforeAll(async () => {
  try {
    await setupTestServer();
    // need to conditionally require `undici` because it's not available in Node 10
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fetch = require('undici').fetch;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Undici integration tests are skipped because undici is not installed.');
  }
});

const DEFAULT_OPTIONS = getDefaultNodeClientOptions({
  dsn: SENTRY_DSN,
  tracesSampler: () => true,
  integrations: [new Undici()],
});

beforeEach(() => {
  const client = new NodeClient(DEFAULT_OPTIONS);
  hub = new Hub(client);
  makeMain(hub);
});

afterEach(() => {
  requestHeaders = {};
  setTestServerOptions({ statusCode: 200 });
});

afterAll(() => {
  getTestServer()?.close();
});

conditionalTest({ min: 16 })('Undici integration', () => {
  it.each([
    [
      'simple url',
      'http://localhost:18100',
      undefined,
      {
        description: 'GET http://localhost:18100/',
        op: 'http.client',
        data: expect.objectContaining({
          'http.method': 'GET',
        }),
      },
    ],
    [
      'url with query',
      'http://localhost:18100?foo=bar',
      undefined,
      {
        description: 'GET http://localhost:18100/',
        op: 'http.client',
        data: expect.objectContaining({
          'http.method': 'GET',
          'http.query': '?foo=bar',
        }),
      },
    ],
    [
      'url with POST method',
      'http://localhost:18100',
      { method: 'POST' },
      {
        description: 'POST http://localhost:18100/',
        data: expect.objectContaining({
          'http.method': 'POST',
        }),
      },
    ],
    [
      'url with POST method',
      'http://localhost:18100',
      { method: 'POST' },
      {
        description: 'POST http://localhost:18100/',
        data: expect.objectContaining({
          'http.method': 'POST',
        }),
      },
    ],
    [
      'url with GET as default',
      'http://localhost:18100',
      { method: undefined },
      {
        description: 'GET http://localhost:18100/',
      },
    ],
  ])('creates a span with a %s', async (_: string, request, requestInit, expected) => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    await fetch(request, requestInit);

    expect(transaction.spanRecorder?.spans.length).toBe(2);

    const span = transaction.spanRecorder?.spans[1];
    expect(span).toEqual(expect.objectContaining(expected));
  });

  it('creates a span with internal errors', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    try {
      await fetch('http://a-url-that-no-exists.com');
    } catch (e) {
      // ignore
    }

    expect(transaction.spanRecorder?.spans.length).toBe(2);

    const span = transaction.spanRecorder?.spans[1];
    expect(span).toEqual(expect.objectContaining({ status: 'internal_error' }));
  });

  it('creates a span for invalid looking urls', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    try {
      // Intentionally add // to the url
      // fetch accepts this URL, but throws an error later on
      await fetch('http://a-url-that-no-exists.com//');
    } catch (e) {
      // ignore
    }

    expect(transaction.spanRecorder?.spans.length).toBe(2);

    const span = transaction.spanRecorder?.spans[1];
    expect(span).toEqual(expect.objectContaining({ description: 'GET http://a-url-that-no-exists.com//' }));
    expect(span).toEqual(expect.objectContaining({ status: 'internal_error' }));
  });

  it('does not create a span for sentry requests', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    try {
      await fetch(`${SENTRY_DSN}/sub/route`, {
        method: 'POST',
      });
    } catch (e) {
      // ignore
    }

    expect(transaction.spanRecorder?.spans.length).toBe(1);
  });

  it('does not create a span if there is no active spans', async () => {
    try {
      await fetch(`${SENTRY_DSN}/sub/route`, { method: 'POST' });
    } catch (e) {
      // ignore
    }

    expect(hub.getScope().getSpan()).toBeUndefined();
  });

  it('does create a span if `shouldCreateSpanForRequest` is defined', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    const undoPatch = patchUndici({ shouldCreateSpanForRequest: url => url.includes('yes') });

    await fetch('http://localhost:18100/no', { method: 'POST' });

    expect(transaction.spanRecorder?.spans.length).toBe(1);

    await fetch('http://localhost:18100/yes', { method: 'POST' });

    expect(transaction.spanRecorder?.spans.length).toBe(2);

    undoPatch();
  });

  // This flakes on CI for some reason: https://github.com/getsentry/sentry-javascript/pull/8449
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('attaches the sentry trace and baggage headers if there is an active span', async () => {
    expect.assertions(3);

    await runWithAsyncContext(async () => {
      const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
      hub.getScope().setSpan(transaction);

      await fetch('http://localhost:18100', { method: 'POST' });

      expect(transaction.spanRecorder?.spans.length).toBe(2);
      const span = transaction.spanRecorder?.spans[1];

      expect(requestHeaders['sentry-trace']).toEqual(span?.toTraceparent());
      expect(requestHeaders['baggage']).toEqual(
        `sentry-environment=production,sentry-public_key=0,sentry-trace_id=${transaction.traceId},sentry-sample_rate=1,sentry-transaction=test-transaction`,
      );
    });
  });

  // This flakes on CI for some reason: https://github.com/getsentry/sentry-javascript/pull/8449
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('attaches the sentry trace and baggage headers if there is no active span', async () => {
    const scope = hub.getScope();

    await fetch('http://localhost:18100', { method: 'POST' });

    const propagationContext = scope.getPropagationContext();

    expect(requestHeaders['sentry-trace'].includes(propagationContext.traceId)).toBe(true);
    expect(requestHeaders['baggage']).toEqual(
      `sentry-environment=production,sentry-public_key=0,sentry-trace_id=${propagationContext.traceId},sentry-sample_rate=1,sentry-transaction=test-transaction,sentry-sampled=true`,
    );
  });

  // This flakes on CI for some reason: https://github.com/getsentry/sentry-javascript/pull/8449
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('attaches headers if `shouldCreateSpanForRequest` does not create a span using propagation context', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    const scope = hub.getScope();
    const propagationContext = scope.getPropagationContext();

    scope.setSpan(transaction);

    const undoPatch = patchUndici({ shouldCreateSpanForRequest: url => url.includes('yes') });

    await fetch('http://localhost:18100/no', { method: 'POST' });

    expect(requestHeaders['sentry-trace']).toBeDefined();
    expect(requestHeaders['baggage']).toBeDefined();

    expect(requestHeaders['sentry-trace'].includes(propagationContext.traceId)).toBe(true);
    const firstSpanId = requestHeaders['sentry-trace'].split('-')[1];

    await fetch('http://localhost:18100/yes', { method: 'POST' });

    expect(requestHeaders['sentry-trace']).toBeDefined();
    expect(requestHeaders['baggage']).toBeDefined();

    expect(requestHeaders['sentry-trace'].includes(propagationContext.traceId)).toBe(false);

    const secondSpanId = requestHeaders['sentry-trace'].split('-')[1];
    expect(firstSpanId).not.toBe(secondSpanId);

    undoPatch();
  });

  // This flakes on CI for some reason: https://github.com/getsentry/sentry-javascript/pull/8449
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('uses tracePropagationTargets', async () => {
    const transaction = hub.startTransaction({ name: 'test-transaction' }) as Transaction;
    hub.getScope().setSpan(transaction);

    const client = new NodeClient({ ...DEFAULT_OPTIONS, tracePropagationTargets: ['/yes'] });
    hub.bindClient(client);

    expect(transaction.spanRecorder?.spans.length).toBe(1);

    await fetch('http://localhost:18100/no', { method: 'POST' });

    expect(transaction.spanRecorder?.spans.length).toBe(2);

    expect(requestHeaders['sentry-trace']).toBeUndefined();
    expect(requestHeaders['baggage']).toBeUndefined();

    await fetch('http://localhost:18100/yes', { method: 'POST' });

    expect(transaction.spanRecorder?.spans.length).toBe(3);

    expect(requestHeaders['sentry-trace']).toBeDefined();
    expect(requestHeaders['baggage']).toBeDefined();
  });

  it('adds a breadcrumb on request', async () => {
    expect.assertions(1);

    const client = new NodeClient({
      ...DEFAULT_OPTIONS,
      beforeBreadcrumb: breadcrumb => {
        expect(breadcrumb).toEqual({
          category: 'http',
          data: {
            method: 'POST',
            status_code: 200,
            url: 'http://localhost:18100/',
          },
          type: 'http',
          timestamp: expect.any(Number),
        });
        return breadcrumb;
      },
    });
    hub.bindClient(client);

    await fetch('http://localhost:18100', { method: 'POST' });
  });

  it('adds a breadcrumb on errored request', async () => {
    expect.assertions(1);

    const client = new NodeClient({
      ...DEFAULT_OPTIONS,
      beforeBreadcrumb: breadcrumb => {
        expect(breadcrumb).toEqual({
          category: 'http',
          data: {
            method: 'GET',
            url: 'http://a-url-that-no-exists.com/',
          },
          level: 'error',
          type: 'http',
          timestamp: expect.any(Number),
        });
        return breadcrumb;
      },
    });
    hub.bindClient(client);

    try {
      await fetch('http://a-url-that-no-exists.com');
    } catch (e) {
      // ignore
    }
  });

  it('does not add a breadcrumb if disabled', async () => {
    expect.assertions(0);

    const undoPatch = patchUndici({ breadcrumbs: false });

    await fetch('http://localhost:18100', { method: 'POST' });

    undoPatch();
  });
});

interface TestServerOptions {
  statusCode: number;
  responseHeaders?: Record<string, string | string[] | undefined>;
}

let testServer: http.Server | undefined;

let requestHeaders: any = {};

let testServerOptions: TestServerOptions = {
  statusCode: 200,
};

function setTestServerOptions(options: TestServerOptions): void {
  testServerOptions = { ...options };
}

function getTestServer(): http.Server | undefined {
  return testServer;
}

function setupTestServer() {
  testServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on('data', data => {
      chunks.push(data);
    });

    req.on('end', () => {
      requestHeaders = req.headers;
    });

    res.writeHead(testServerOptions.statusCode, testServerOptions.responseHeaders);
    res.end();

    // also terminate socket because keepalive hangs connection a bit
    res.connection?.end();
  });

  testServer?.listen(18100);

  return new Promise(resolve => {
    testServer?.on('listening', resolve);
  });
}

function patchUndici(userOptions: Partial<UndiciOptions>): () => void {
  try {
    const undici = hub.getClient()!.getIntegration(Undici);
    // @ts-ignore need to access private property
    options = { ...undici._options };
    // @ts-ignore need to access private property
    undici._options = Object.assign(undici._options, userOptions);
  } catch (_) {
    throw new Error('Could not undo patching of undici');
  }

  return () => {
    try {
      const undici = hub.getClient()!.getIntegration(Undici);
      // @ts-expect-error Need to override readonly property
      undici!['_options'] = { ...options };
    } catch (_) {
      throw new Error('Could not undo patching of undici');
    }
  };
}
