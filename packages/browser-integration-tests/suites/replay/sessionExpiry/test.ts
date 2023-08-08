import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures.ts';
import { getExpectedReplayEvent } from '../../../utils/replayEventTemplates.ts';
import {
  getFullRecordingSnapshots,
  getReplayEvent,
  getReplaySnapshot,
  normalize,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../utils/replayHelpers.ts';

// Session should expire after 2s - keep in sync with init.js
const SESSION_TIMEOUT = 2000;

sentryTest('handles an expired session', async ({ getLocalTestPath, page }) => {
  if (shouldSkipReplayTest()) {
    sentryTest.skip();
  }

  const reqPromise0 = waitForReplayRequest(page, 0);
  const reqPromise1 = waitForReplayRequest(page, 1);

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  const req0 = await reqPromise0;

  const replayEvent0 = getReplayEvent(req0);
  expect(replayEvent0).toEqual(getExpectedReplayEvent({}));

  const fullSnapshots0 = getFullRecordingSnapshots(req0);
  expect(fullSnapshots0.length).toEqual(1);
  const stringifiedSnapshot = normalize(fullSnapshots0[0]);
  expect(stringifiedSnapshot).toMatchSnapshot('snapshot-0.json');

  // We wait for another segment 0
  const reqPromise2 = waitForReplayRequest(page, 0);

  await page.click('#button1');
  const req1 = await reqPromise1;

  const replayEvent1 = getReplayEvent(req1);
  expect(replayEvent1).toEqual(getExpectedReplayEvent({ segment_id: 1, urls: [] }));

  const replay = await getReplaySnapshot(page);
  const oldSessionId = replay.session?.id;

  await new Promise(resolve => setTimeout(resolve, SESSION_TIMEOUT));

  await page.click('#button2');
  const req2 = await reqPromise2;

  const replay2 = await getReplaySnapshot(page);

  expect(replay2.session?.id).not.toEqual(oldSessionId);

  const replayEvent2 = getReplayEvent(req2);
  expect(replayEvent2).toEqual(getExpectedReplayEvent({}));

  const fullSnapshots2 = getFullRecordingSnapshots(req2);
  expect(fullSnapshots2.length).toEqual(1);
  const stringifiedSnapshot2 = normalize(fullSnapshots2[0]);
  expect(stringifiedSnapshot2).toMatchSnapshot('snapshot-2.json');
});
