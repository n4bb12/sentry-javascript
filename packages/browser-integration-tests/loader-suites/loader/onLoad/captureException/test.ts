import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures.ts';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers.ts';

sentryTest('captureException works', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);

  const eventData = envelopeRequestParser(req);

  expect(eventData.message).toBe('Test exception');
});
