import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures.ts';
import { shouldSkipTracingTest } from '../../../utils/helpers.ts';

sentryTest(
  'exports a shim Integrations.BrowserTracing integration for non-tracing bundles',
  async ({ getLocalTestPath, page }) => {
    // Skip in tracing tests
    if (!shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const consoleMessages: string[] = [];
    page.on('console', msg => consoleMessages.push(msg.text()));

    let requestCount = 0;
    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      requestCount++;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    expect(requestCount).toBe(0);
    expect(consoleMessages).toEqual([
      'You are using new BrowserTracing() even though this bundle does not include tracing.',
    ]);
  },
);
