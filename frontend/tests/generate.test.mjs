import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler, { equipmentInstructions } from "../api/workouts/generate.mjs";

const request = { availableTimeMinutes: 30, targetSkills: ["shooting"], skillLevel: "beginner", equipment: ["basketball"], includeGymWorkout: false };
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const aiEnv = Object.fromEntries(["AI_PROVIDER", "GEMINI_API_KEY", "GEMINI_MODEL"].map(name => [name, process.env[name]]));
afterEach(() => {
  for (const [name, value] of Object.entries(aiEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});
async function invoke(body = request, method = "POST") {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
  await handler({ method, body }, res);
  return res;
}
function workout() {
  const drill = { name: "No-hoop shooting mechanics", durationMinutes: 6, purpose: "Practice release", instructions: "Without a hoop, toss gently above your head and catch. Repeat for 30 seconds, rest 15 seconds.", difficulty: "beginner", equipment: ["basketball"] };
  return { title: "Shooting mechanics", totalDurationMinutes: 30, focusAreas: ["shooting"], sections: { warmup: [{ ...drill, durationMinutes: 5 }], basketballDrills: [{ ...drill, durationMinutes: 15 }], conditioning: [{ ...drill, durationMinutes: 5 }], gymWorkout: [], cooldown: [{ ...drill, durationMinutes: 5 }] } };
}
function mockAI(value) {
  process.env.GEMINI_API_KEY = "test-only";
  globalThis.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/generativelanguage.googleapis.com\//);
    assert.equal(options.headers["x-goog-api-key"], "test-only");
    assert.equal(options.headers.Authorization, undefined);
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    return { ok: true, json: async () => ({ responseId: "resp_test", modelVersion: "test-model", candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }) };
  };
}
test("missing credentials returns 503 without calling AI or substituting a sample", async () => {
  process.env.AI_PROVIDER = "gemini";
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch = () => { throw new Error("Must not call provider"); };
  const res = await invoke();
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "AI_NOT_CONFIGURED");
  assert.equal(res.body.workout, undefined);
});
test("rejects invalid input and methods", async () => {
  assert.equal((await invoke({}, "GET")).statusCode, 405);
  assert.equal((await invoke("invalid json")).statusCode, 400);
  for (const input of [{ ...request, availableTimeMinutes: 1 }, { ...request, targetSkills: [] }, { ...request, equipment: ["arbitrary instructions"] }]) {
    assert.equal((await invoke(input)).statusCode, 400);
  }
});
test("validated provider output includes provenance and safe tutorial search URLs", async () => {
  mockAI(workout());
  const res = await invoke();
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.generation.responseId, "resp_test");
  assert.equal(res.body.generation.source, "gemini");
  assert.match(res.body.workout.sections.warmup[0].youtubeSearchUrl, /^https:\/\/www.youtube.com\/results\?search_query=/);
});
test("rejects wrong duration, missing sections and unavailable equipment", async () => {
  for (const change of [value => { value.sections.warmup[0].durationMinutes = 9; }, value => { value.sections.cooldown = []; }, value => { value.sections.basketballDrills[0].equipment = ["hoop"]; }]) {
    const value = workout(); change(value); mockAI(value);
    const res = await invoke();
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.workout, undefined);
  }
});
test("provider failures remain errors", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  for (const status of [401, 429, 500]) {
    globalThis.fetch = async () => ({ ok: false, status, headers: new Headers() });
    const res = await invoke();
    assert.equal(res.statusCode, status === 429 ? 429 : status === 500 ? 503 : 502);
    assert.equal(res.body.workout, undefined);
  }
});
test("timeouts remain errors", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  globalThis.fetch = async () => { throw new DOMException("Timeout", "TimeoutError"); };
  assert.equal((await invoke()).statusCode, 504);
});

test("defaults to Gemini with structured output and supports repeated generations", async () => {
  delete process.env.AI_PROVIDER;
  delete process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = "free-test-key";
  process.env.OPENAI_API_KEY = "paid-key-must-not-be-used";
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    assert.equal(options.headers["x-goog-api-key"], "free-test-key");
    assert.equal(options.headers.Authorization, undefined);
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.ok(body.generationConfig.responseJsonSchema.properties.sections);
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text).equipment, ["basketball"]);
    return { ok: true, json: async () => ({ responseId: `gemini-${calls}`, candidates: [{ content: { parts: [{ text: "hidden reasoning", thought: true }, { text: JSON.stringify(workout()) }] } }] }) };
  };
  for (let i = 0; i < 2; i++) {
    const result = await invoke();
    assert.equal(result.statusCode, 201);
    assert.equal(result.body.generation.source, "gemini");
  }
  assert.equal(calls, 2);
});

test("Gemini missing key and quota errors never fall back to paid OpenAI", async () => {
  process.env.AI_PROVIDER = "gemini";
  process.env.OPENAI_API_KEY = "paid-key";
  delete process.env.GEMINI_API_KEY;
  globalThis.fetch = () => { throw new Error("Must not call paid provider"); };
  assert.equal((await invoke()).statusCode, 503);
  process.env.GEMINI_API_KEY = "test";
  globalThis.fetch = async url => {
    assert.match(url, /^https:\/\/generativelanguage.googleapis.com/);
    return { ok: false, status: 429, headers: new Headers() };
  };
  const result = await invoke();
  assert.equal(result.statusCode, 429);
  assert.match(result.body.error, /no paid provider/);
});

test("Gemini rejects invalid plans and blocked responses", async () => {
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test";
  const invalid = workout();
  invalid.sections.basketballDrills[0].equipment = ["hoop"];
  for (const payload of [{ candidates: [{ content: { parts: [{ text: JSON.stringify(invalid) }] } }] }, { promptFeedback: { blockReason: "SAFETY" } }]) {
    globalThis.fetch = async () => ({ ok: true, json: async () => payload });
    assert.equal((await invoke()).statusCode, 502);
  }
});

test("legacy OpenAI provider setting still uses Gemini", async () => {
  mockAI(workout());
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "must-not-be-used";
  const result = await invoke();
  assert.equal(result.statusCode, 201);
  assert.equal(result.body.generation.source, "gemini");
});

test("equipment instructions distinguish an available hoop from no hoop", () => {
  assert.match(equipmentInstructions(request), /No hoop is available/);
  const instructions = equipmentInstructions({ ...request, equipment: ["ball", "hoop"] });
  assert.match(instructions, /A hoop is available/);
  assert.match(instructions, /made-shot targets/);
  assert.doesNotMatch(instructions, /No hoop is available/);
});

test("rejects no-hoop titles and plans ignoring a selected hoop", async () => {
  const input = { ...request, equipment: ["basketball", "hoop"] };
  for (const title of ["No-Hoop Shooting Form Workout", "No Hoop Shooting", "No–Hoop Shooting", "Without a Hoop Shooting", "Shooting mechanics"]) {
    const value = workout(); value.title = title; mockAI(value);
    const res = await invoke(input);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.workout, undefined);
  }
});

test("accepts basket drills when a hoop is selected and technique drills without one", async () => {
  const noHoop = workout(); noHoop.title = "No-Hoop Shooting Form Workout";
  mockAI(noHoop);
  assert.equal((await invoke()).statusCode, 201);
  const atBasket = workout();
  atBasket.sections.basketballDrills[0] = { ...atBasket.sections.basketballDrills[0], name: "Close-range form shooting", instructions: "Make 10 shots at the basket, rest 30 seconds, repeat.", equipment: ["basketball", "hoop"] };
  mockAI(atBasket);
  assert.equal((await invoke({ ...request, equipment: ["basketball", "hoop"] })).statusCode, 201);
});


test("temporary Gemini failures retry unchanged multi-skill settings then return a real validated plan", async () => {
  process.env.GEMINI_API_KEY = "test-only";
  const input = { ...request, targetSkills:["shooting", "ball handling", "finishing"] };
  const value = workout(); value.focusAreas = input.targetSkills;
  let calls=0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.deepEqual(JSON.parse(JSON.parse(options.body).contents[0].parts[0].text).targetSkills,input.targetSkills);
    if(calls<3)return {ok:false,status:503,headers:new Headers()};
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]})};
  };
  const result=await invoke(input);
  assert.equal(calls,3);assert.equal(result.statusCode,201);
  assert.deepEqual(result.body.workout.focusAreas,input.targetSkills);
});
test("persistent provider overload stops after three attempts and does not blame API keys", async () => {
  process.env.GEMINI_API_KEY="test-only";let calls=0;
  globalThis.fetch=async()=>{calls++;return {ok:false,status:503,headers:new Headers()};};
  const result=await invoke();
  assert.equal(calls,3);assert.equal(result.statusCode,503);
  assert.equal(result.body.code,"AI_TEMPORARILY_UNAVAILABLE");
  assert.doesNotMatch(result.body.error,/API key|configuration/i);
  assert.equal(result.body.workout,undefined);
});
test("configuration and quota failures are never automatically retried",async()=>{
  process.env.GEMINI_API_KEY="test-only";
  for(const status of [400,401,403,404,429]){
    let calls=0;globalThis.fetch=async()=>{calls++;return {ok:false,status,headers:new Headers()};};
    const result=await invoke();assert.equal(calls,1);
    assert.equal(result.body.code,status===429?"AI_QUOTA_EXCEEDED":"AI_CONFIGURATION_ERROR");
  }
});
test("all focus-skill pairs and finishing with shooting and ball handling are accepted",async()=>{
  const skills=["shooting","ball handling","finishing","defense","conditioning","footwork"];
  const combinations=skills.flatMap((s,i)=>skills.slice(i+1).map(other=>[s,other]));
  combinations.push(["shooting","ball handling","finishing"]);
  for(const targetSkills of combinations){
    const value=workout();value.focusAreas=targetSkills;mockAI(value);
    assert.equal((await invoke({...request,targetSkills})).statusCode,201,targetSkills.join(', '));
  }
});

test("a temporary network failure recovers and long Retry-After does not exceed the request budget",async()=>{
  process.env.GEMINI_API_KEY="test-only";let calls=0;
  globalThis.fetch=async()=>{
    calls++;if(calls===1)throw new TypeError('fetch failed');
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(workout())}]}}]})};
  };
  assert.equal((await invoke()).statusCode,201);assert.equal(calls,2);
  calls=0;globalThis.fetch=async()=>{calls++;return {ok:false,status:503,headers:new Headers({'retry-after':'120'})};};
  assert.equal((await invoke()).body.code,'AI_TEMPORARILY_UNAVAILABLE');assert.equal(calls,1);
});
