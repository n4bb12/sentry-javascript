import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures.ts';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers.ts';

sentryTest('should normalize non-serializable context', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.contexts?.non_serializable).toEqual('[HTMLElement: HTMLBodyElement]');
  expect(eventData.message).toBe('non_serializable');
});
