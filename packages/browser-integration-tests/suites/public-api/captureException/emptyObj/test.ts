import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures.ts';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers.ts';

sentryTest('should capture an empty object', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'Object captured as exception with keys: [object has no keys]',
    mechanism: {
      type: 'generic',
      handled: true,
    },
  });
});
