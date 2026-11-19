import pg from 'pg';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
let pool;
let ready;
const hash = value => createHash('sha256').update(value).digest('hex');
export async function database() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('Account storage is not configured. Set DATABASE_URL on the server.'), { status: 503 });
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000 });
  ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS hc_accounts (
      id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL,
      profile jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS hc_sessions (
      token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES hc_accounts(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hc_records (
      id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES hc_accounts(id) ON DELETE CASCADE,
      kind text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS hc_records_owner ON hc_records(user_id, kind);
    CREATE TABLE IF NOT EXISTS hc_auth_attempts (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
  `).catch(error => { ready = undefined; throw error; });
  await ready;
  return pool;
}
export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${Buffer.from(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function passwordMatches(password, stored) {
  const actual = await passwordHash(password, stored.split(':')[0]);
  return timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}
const publicUser = row => ({ id: row.id, email: row.email, ...row.profile });
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function profile(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) fail(400, 'Enter a name (up to 100 characters).');
  if (typeof input.goals !== 'string' || input.goals.length > 2000 || !['beginner','intermediate','advanced'].includes(input.skillLevel)) fail(400, 'Choose a skill level and keep goals under 2,000 characters.');
  return { name: input.name.trim(), goals: input.goals, skillLevel: input.skillLevel };
}
function cookie(res, token = '', expires = new Date(0)) {
  res.setHeader('Set-Cookie', `hc_session=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}
async function newSession(db, res, user) {
  await db.query('DELETE FROM hc_sessions WHERE expires_at < now()');
  await db.query('DELETE FROM hc_auth_attempts WHERE expires_at < now()');
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 86400000);
  await db.query('INSERT INTO hc_sessions VALUES ($1,$2,$3)', [hash(token), user.id, expires]);
  cookie(res, token, expires);
  return publicUser(user);
}
async function limitAuth(db, key) {
  const { rows } = await db.query(`INSERT INTO hc_auth_attempts VALUES ($1,1,now()+interval '15 minutes')
    ON CONFLICT (key) DO UPDATE SET count=CASE WHEN hc_auth_attempts.expires_at < now() THEN 1 ELSE hc_auth_attempts.count+1 END,
    expires_at=CASE WHEN hc_auth_attempts.expires_at < now() THEN now()+interval '15 minutes' ELSE hc_auth_attempts.expires_at END RETURNING count`, [hash(key)]);
  if (rows[0].count > 20) fail(429, 'Too many sign-in attempts. Try again in 15 minutes.');
}
function validateRecord(kind, value) {
  if (!value || typeof value !== 'object') fail(400, 'Invalid saved record.');
  if (kind === 'workout') {
    const w = value.workout;
    const sections = ['warmup','basketballDrills','conditioning','gymWorkout','cooldown'];
    if (!w || typeof w.title !== 'string' || w.title.length > 200 || !Number.isInteger(w.totalDurationMinutes) || w.totalDurationMinutes < 1 || w.totalDurationMinutes > 180 || !Array.isArray(w.focusAreas) || !sections.every(key => Array.isArray(w.sections?.[key]))) fail(400, 'Invalid workout.');
    const drills = sections.flatMap(key => w.sections[key]);
    if (w.focusAreas.some(value => typeof value !== 'string') || drills.some(drill => !drill || !Number.isInteger(drill.durationMinutes) || drill.durationMinutes < 1 || typeof drill.name !== 'string' || typeof drill.instructions !== 'string' || !Array.isArray(drill.equipment)) || drills.reduce((sum,drill) => sum + drill.durationMinutes, 0) !== w.totalDurationMinutes) fail(400, 'Invalid workout drills or duration.');
    return { workout: w, feedback: null };
  }
  if (kind === 'analysis') {
    if (!['shooting','dribbling'].includes(value.analysisType) || typeof value.fileName !== 'string' || value.fileName.length > 500 || !Number.isFinite(value.score) || value.score < 0 || value.score > 100) fail(400, 'Invalid analysis.');
    return { fileName: value.fileName, analysisType: value.analysisType, score: value.score, uploadedAt: new Date().toISOString() };
  }
  fail(400, 'Unknown record type.');
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!['GET','POST','PATCH','DELETE'].includes(req.method)) fail(405, 'Method not allowed.');
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== (req.headers['x-forwarded-host'] || req.headers.host)) fail(403, 'Request origin is not allowed.');
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (Buffer.byteLength(JSON.stringify(body)) > 300000) fail(413, 'Request is too large.');
    const db = await database();
    const token = /(?:^|;\s*)hc_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const sessionHash = token ? hash(token) : '';
    const { rows: users } = await db.query('SELECT a.* FROM hc_accounts a JOIN hc_sessions s ON s.user_id=a.id WHERE s.token_hash=$1 AND s.expires_at>now()', [sessionHash]);
    const user = users[0];
    const action = body.action;
    if (req.method === 'GET') return res.status(200).json({ user: user ? publicUser(user) : null });
    if (action === 'signout') {
      await db.query('DELETE FROM hc_sessions WHERE token_hash=$1', [sessionHash]);
      cookie(res);
      return res.status(200).json({ user: null });
    }
    if (action === 'signup' || action === 'signin') {
      if (req.method !== 'POST') fail(405, 'Use POST.');
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) fail(400, 'Enter a valid email and a password of 10–128 characters.');
      await limitAuth(db, `ip:${req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown'}`);
      await limitAuth(db, `email:${email}`);
      let account;
      if (action === 'signup') {
        const info = profile({ name: body.name, goals: '', skillLevel: 'beginner' });
        try {
          const result = await db.query('INSERT INTO hc_accounts (id,email,password_hash,profile) VALUES ($1,$2,$3,$4) RETURNING *', [randomUUID(), email, await passwordHash(body.password), info]);
          account = result.rows[0];
        } catch (error) { if (error.code === '23505') fail(409, 'An account already uses this email. Sign in instead.'); throw error; }
      } else {
        const { rows } = await db.query('SELECT * FROM hc_accounts WHERE email=$1', [email]);
        account = rows[0];
        const stored = account?.password_hash || await passwordHash('dummy-password-for-timing', '0'.repeat(32));
        if (!await passwordMatches(body.password, stored) || !account) fail(401, 'Email or password is incorrect.');
      }
      if (token) await db.query('DELETE FROM hc_sessions WHERE token_hash=$1', [sessionHash]);
      return res.status(200).json({ user: await newSession(db, res, account) });
    }
    if (!user) fail(401, 'Please sign in again to access your saved data.');
    if (action === 'profile') {
      const info = profile(body.profile);
      const { rows } = await db.query('UPDATE hc_accounts SET profile=$1 WHERE id=$2 RETURNING *', [info, user.id]);
      return res.status(200).json({ user: publicUser(rows[0]) });
    }
    if (action === 'list') {
      const { rows } = await db.query('SELECT id,kind,data,created_at FROM hc_records WHERE user_id=$1 ORDER BY created_at DESC', [user.id]);
      return res.status(200).json({ records: rows.map(row => ({ ...row.data, id: row.id, kind: row.kind, createdAt: row.created_at })) });
    }
    if (action === 'save') {
      const data = validateRecord(body.kind, body.record);
      const id = randomUUID();
      const { rows } = await db.query('INSERT INTO hc_records (id,user_id,kind,data) VALUES ($1,$2,$3,$4) RETURNING created_at', [id,user.id,body.kind,data]);
      return res.status(200).json({ record: { ...data, id, createdAt: rows[0].created_at } });
    }
    if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) fail(400, 'Invalid workout ID.');
    // Every read and write is scoped to the authenticated account.
    const { rows } = await db.query("SELECT * FROM hc_records WHERE id=$1 AND user_id=$2 AND kind='workout'", [body.id,user.id]);
    const record = rows[0];
    if (!record) fail(404, 'Workout not found.');
    if (action === 'delete') {
      await db.query('DELETE FROM hc_records WHERE id=$1 AND user_id=$2', [body.id,user.id]);
      return res.status(200).json({ ok: true });
    }
    if (action === 'rename') {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200) fail(400, 'Enter a title of up to 200 characters.');
      await db.query("UPDATE hc_records SET data=jsonb_set(data,'{workout,title}',$1::jsonb) WHERE id=$2 AND user_id=$3", [JSON.stringify(body.title.trim()), body.id, user.id]);
    } else if (action === 'feedback') {
      if (!['too_easy','just_right','too_hard'].includes(body.difficultyFeedback) || typeof body.notes !== 'string' || body.notes.length > 5000) fail(400, 'Invalid feedback.');
      const feedback = { id: randomUUID(), workoutId: body.id, difficultyFeedback: body.difficultyFeedback, notes: body.notes, createdAt: new Date().toISOString() };
      await db.query("UPDATE hc_records SET data=jsonb_set(data,'{feedback}',$1::jsonb) WHERE id=$2 AND user_id=$3", [JSON.stringify(feedback), body.id, user.id]);
    } else if (action === 'complete') {
      const allSteps = ['warmup','basketballDrills','conditioning','gymWorkout','cooldown'].flatMap(key => record.data.workout.sections[key]);
      const indexes = body.completedSteps;
      if (!Array.isArray(indexes) || new Set(indexes).size !== indexes.length || indexes.some(i => !Number.isInteger(i) || i < 0 || i >= allSteps.length)) fail(400, 'Invalid completed steps.');
      const minutes = indexes.reduce((sum,i) => sum + allSteps[i].durationMinutes, 0);
      await db.query("UPDATE hc_records SET data=data || $1::jsonb WHERE id=$2 AND user_id=$3", [JSON.stringify({ completedAt: new Date().toISOString(), completedMinutes: minutes }), body.id,user.id]);
    } else fail(400, 'Unknown account action.');
    const updated = await db.query('SELECT * FROM hc_records WHERE id=$1 AND user_id=$2', [body.id,user.id]);
    return res.status(200).json({ record: { ...updated.rows[0].data, id: body.id, createdAt: record.created_at } });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 503);
    return res.status(status).json({ error: error.status ? error.message : status === 400 ? 'Invalid JSON request.' : 'Account storage is unavailable. Please try again.' });
  }
}

export async function closeDatabase() { if (pool) await pool.end(); pool = undefined; ready = undefined; }
