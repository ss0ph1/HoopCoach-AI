import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import handler, { closeDatabase, passwordHash, passwordMatches } from '../server/accounts.mjs';

test('password hashes are salted and verify without storing plaintext', async () => {
  const first = await passwordHash('long-test-password');
  assert.notEqual(first, await passwordHash('long-test-password'));
  assert.equal(await passwordMatches('long-test-password', first), true);
  assert.equal(await passwordMatches('wrong-password', first), false);
});

test('accounts persist profiles, workouts, feedback, analyses and progress with owner isolation', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = `hc_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  async function request(body, token, method = 'POST', origin) {
    const result = { headers: {}, statusCode: 200 };
    const res = { setHeader(k,v) { result.headers[k] = v; }, status(code) { result.statusCode = code; return this; }, json(value) { result.body = value; return this; } };
    await handler({ method, body, headers: { host: 'localhost:5173', cookie: token || '', ...(origin ? { origin } : {}) }, socket: { remoteAddress: 'test' } }, res);
    return result;
  }
  try {
    assert.equal((await request({ action: 'list' })).statusCode, 401);
    assert.equal((await request({}, null, 'POST', 'https://evil.example')).statusCode, 403);
    assert.equal((await request({ action: 'signup', name: 'Invalid', email: 'invalid', password: 'short' })).statusCode, 400);
    const alice = await request({ action: 'signup', name: 'Alice', email: 'Alice@example.com', password: 'test-password-1234' });
    assert.equal(alice.statusCode, 200);
    assert.equal(alice.body.user.email, 'alice@example.com');
    assert.ok(!JSON.stringify(alice.body).includes('password'));
    assert.match(alice.headers['Set-Cookie'], /HttpOnly; SameSite=Lax/);
    const a = alice.headers['Set-Cookie'].split(';')[0];
    assert.equal((await request(undefined, a, 'GET')).body.user.name, 'Alice');
    assert.equal((await request({ action: 'signup', name: 'Duplicate', email: 'ALICE@example.com', password: 'test-password-1234' })).statusCode, 409);
    assert.equal((await request({ action: 'signin', email: 'alice@example.com', password: 'wrong-password' })).statusCode, 401);
    const bob = await request({ action: 'signup', name: 'Bob', email: 'bob@example.com', password: 'test-password-1234' });
    const b = bob.headers['Set-Cookie'].split(';')[0];
    await request({ action: 'profile', profile: { name: 'Alice Player', goals: 'Improve shooting', skillLevel: 'intermediate' } }, a);
    const drill = minutes => ({ name: 'Practice', durationMinutes: minutes, purpose: 'Practice', instructions: 'Practice safely', difficulty: 'beginner', equipment: [], youtubeSearchUrl: '' });
    const workout = { title: 'Practice session', totalDurationMinutes: 20, focusAreas: ['shooting'], sections: { warmup: [drill(2)], basketballDrills: [drill(10)], conditioning: [drill(5)], gymWorkout: [], cooldown: [drill(3)] } };
    const saved = await request({ action: 'save', kind: 'workout', record: { workout } }, a);
    const id = saved.body.record.id;
    assert.equal((await request({ action: 'list' }, b)).body.records.length, 0);
    for (const action of ['delete', 'rename', 'feedback', 'complete']) assert.equal((await request({ action, id, title: 'stolen' }, b)).statusCode, 404);
    assert.equal((await request({ action: 'rename', id, title: 'My workout' }, a)).body.record.workout.title, 'My workout');
    assert.equal((await request({ action: 'feedback', id, difficultyFeedback: 'just_right', notes: 'Good practice' }, a)).body.record.feedback.notes, 'Good practice');
    assert.equal((await request({ action: 'complete', id, completedSteps: [0, 0] }, a)).statusCode, 400);
    const completed = await request({ action: 'complete', id, completedSteps: [0, 1] }, a);
    assert.equal(completed.body.record.completedMinutes, 12);
    assert.ok(completed.body.record.completedAt);
    await request({ action: 'save', kind: 'analysis', record: { fileName: 'practice.mp4', analysisType: 'shooting', score: 75 } }, a);
    // Reconnect to ensure records live in PostgreSQL rather than process memory.
    await closeDatabase();
    assert.equal((await request({ action: 'list' }, a)).body.records.length, 2);
    await request({ action: 'signout' }, a);
    assert.equal((await request({ action: 'list' }, a)).statusCode, 401);
    const login = await request({ action: 'signin', email: 'alice@example.com', password: 'test-password-1234' });
    assert.equal(login.body.user.goals, 'Improve shooting');
    const fresh = login.headers['Set-Cookie'].split(';')[0];
    const history = (await request({ action: 'list' }, fresh)).body.records;
    assert.equal(history.length, 2);
    assert.equal(history.find(item => item.id === id).completedMinutes, 12);
    await request({ action: 'delete', id }, fresh);
    assert.equal((await request({ action: 'list' }, fresh)).body.records.length, 1);
    await admin.query(`UPDATE ${schema}.hc_sessions SET expires_at=now()-interval '1 second'`);
    assert.equal((await request(undefined, fresh, 'GET')).body.user, null);
    assert.equal((await request({ action: 'list' }, fresh)).statusCode, 401);
  } finally {
    await closeDatabase();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
