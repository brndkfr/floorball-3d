// S-BACK-029 M9: the last analysed match photo stayed in IndexedDB forever.
// For a U14 team that is a photo of minors, readable by any page on the same
// origin. Records now carry `savedAt` and expire; the IndexedDB plumbing is
// covered by test-e2e/photo-cache.spec.js, the decision logic here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHOTO_CACHE_MAX_AGE_MS, makeCacheRecord, isCacheRecordExpired,
} from '../web/src/authoring/photo-overlay/photo-cache.js';

const DAY = 24 * 60 * 60 * 1000;
const file = { name: 'match.jpg', size: 123, lastModified: 42 };

test('the cache keeps a photo for 7 days', () => {
  assert.equal(PHOTO_CACHE_MAX_AGE_MS, 7 * DAY);
});

test('makeCacheRecord stores the blob, its metadata and when it was saved', () => {
  assert.deepEqual(makeCacheRecord(file, 1000), { blob: file, name: 'match.jpg', size: 123, lastModified: 42, savedAt: 1000 });
});

test('a record is fresh within the max age and expired after it', () => {
  const rec = makeCacheRecord(file, 0);
  assert.equal(isCacheRecordExpired(rec, 0), false);
  assert.equal(isCacheRecordExpired(rec, PHOTO_CACHE_MAX_AGE_MS), false);
  assert.equal(isCacheRecordExpired(rec, PHOTO_CACHE_MAX_AGE_MS + 1), true);
});

test('records from before M9 (no savedAt) count as expired', () => {
  assert.equal(isCacheRecordExpired({ blob: file, name: 'x' }, 0), true);
  assert.equal(isCacheRecordExpired({ blob: file, savedAt: 'yesterday' }, 0), true);
});

test('a record saved in the future (clock change) counts as expired', () => {
  assert.equal(isCacheRecordExpired(makeCacheRecord(file, 10 * DAY), 0), true);
});
