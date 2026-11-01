import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chunk, mapWithConcurrency } from '../src/utils/concurrency.js';
import { detectResumeType, nameFromFilename, sanitizeFilename } from '../src/utils/files.js';

const PDF = Buffer.from('%PDF-1.4 ...');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);

describe('sanitizeFilename', () => {
  it('keeps safe characters and lowercases the extension', () => {
    assert.equal(sanitizeFilename('Jane_Doe-CV.v2.PDF'), 'Jane_Doe-CV.v2.pdf');
  });

  it('replaces spaces, slashes and other unsafe characters', () => {
    assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
    assert.equal(sanitizeFilename('My Resume (final)!.docx'), 'My_Resume_final.docx');
    assert.equal(sanitizeFilename('Résumé.pdf'), 'Re_sume.pdf');
  });

  it('falls back to "resume" when nothing usable is left', () => {
    assert.equal(sanitizeFilename('简历.pdf'), 'resume.pdf');
  });
});

describe('detectResumeType', () => {
  it('accepts PDF and DOCX only when extension and content agree', () => {
    assert.equal(detectResumeType('cv.pdf', PDF), 'application/pdf');
    assert.match(detectResumeType('cv.DOCX', ZIP), /wordprocessingml/);
    assert.equal(detectResumeType('cv.docx', PDF), null);
    assert.equal(detectResumeType('cv.pdf', ZIP), null);
    assert.equal(detectResumeType('cv.txt', Buffer.from('hello')), null);
    assert.equal(detectResumeType('archive.zip', ZIP), null);
  });
});

describe('nameFromFilename', () => {
  it('turns separators into spaces', () => {
    assert.equal(nameFromFilename('jane_doe-resume.pdf'), 'jane doe resume');
    assert.equal(nameFromFilename('.pdf'), 'Unknown candidate');
  });
});

describe('mapWithConcurrency', () => {
  it('keeps result order and never exceeds the limit', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 10, 20, 5, 15], 2, async (ms, i) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running--;
      return i;
    });
    assert.deepEqual(results, [0, 1, 2, 3, 4]);
    assert.equal(peak, 2);
  });

  it('handles an empty list', async () => {
    assert.deepEqual(await mapWithConcurrency([], 3, async () => 1), []);
  });
});

describe('chunk', () => {
  it('splits into fixed-size pieces', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunk([], 2), []);
  });
});
