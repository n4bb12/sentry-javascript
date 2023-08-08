import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures.ts';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers.ts';

sentryTest('should create a pageload transaction', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const timeOrigin = await page.evaluate<number>('window._testBaseTimestamp');

  const { start_timestamp: startTimestamp } = eventData;

  expect(startTimestamp).toBeCloseTo(timeOrigin, 1);

  expect(eventData.contexts?.trace?.op).toBe('pageload');
  expect(eventData.spans?.length).toBeGreaterThan(0);
  expect(eventData.transaction_info?.source).toEqual('url');
});
