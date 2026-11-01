import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { candidatesQuery, jobBody, loginBody, registerBody } from '../src/utils/schemas.js';

const validUser = { name: 'Jo', email: 'jo@example.com', password: 'password123' };
const validJob = { title: 'Engineer', description: 'A description that is long enough.' };

describe('registerBody', () => {
  it('trims and lowercases email before validating it', () => {
    assert.equal(registerBody.parse({ ...validUser, email: '  Jo@Example.COM ' }).email, 'jo@example.com');
  });

  it('rejects malformed email and short password', () => {
    const { error } = registerBody.safeParse({ ...validUser, email: 'nope', password: 'short' });
    const paths = error.issues.map((i) => i.path[0]);
    assert.deepEqual(paths.sort(), ['email', 'password']);
  });

  it('limits passwords by bytes, matching bcrypt', () => {
    assert.ok(registerBody.safeParse({ ...validUser, password: 'a'.repeat(72) }).success);
    assert.ok(!registerBody.safeParse({ ...validUser, password: 'a'.repeat(73) }).success);
    assert.ok(!registerBody.safeParse({ ...validUser, password: '😀'.repeat(20) }).success); // 80 bytes
  });

  it('names each missing field', () => {
    const messages = registerBody.safeParse({}).error.issues.map((i) => i.message);
    assert.deepEqual(messages, ['Name is required', 'Email is required', 'Password is required']);
  });
});

describe('loginBody', () => {
  it('requires a password', () => {
    assert.ok(!loginBody.safeParse({ email: 'jo@example.com', password: '' }).success);
  });
});

describe('jobBody', () => {
  it('drops blank skills and de-duplicates case-insensitively, keeping the first spelling', () => {
    const job = jobBody.parse({ ...validJob, requiredSkills: ['React', '  ', 'react', ' Go '] });
    assert.deepEqual(job.requiredSkills, ['React', 'Go']);
  });

  it('defaults skills to an empty list', () => {
    assert.deepEqual(jobBody.parse(validJob).requiredSkills, []);
  });

  it('requires a meaningful description', () => {
    assert.ok(!jobBody.safeParse({ ...validJob, description: '   too short      ' }).success);
  });
});

describe('candidatesQuery', () => {
  it('treats empty query values as unset and applies defaults', () => {
    const query = candidatesQuery.parse({ status: '', minScore: '', sort: '' });
    assert.equal(query.sort, 'score');
    assert.equal(query.status, undefined);
    assert.equal(query.minScore, undefined);
  });

  it('coerces and bounds minScore', () => {
    assert.equal(candidatesQuery.parse({ minScore: '40' }).minScore, 40);
    assert.ok(!candidatesQuery.safeParse({ minScore: '101' }).success);
    assert.ok(!candidatesQuery.safeParse({ status: 'HIRED' }).success);
  });
});
