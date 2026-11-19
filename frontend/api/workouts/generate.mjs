import { aiConfiguration } from "../../server/ai-config.mjs";

const sectionNames = ["warmup", "basketballDrills", "conditioning", "gymWorkout", "cooldown"];
const skills = ["shooting", "ball handling", "finishing", "defense", "conditioning", "vertical jump", "strength", "footwork"];
const levels = ["beginner", "intermediate", "advanced"];
const noHoopClaim = /\b(?:no[\s\-\u2010-\u2015]*hoop|without\s+(?:a\s+)?hoop)\b/i;
const equipmentOptions = ["ball", "basketball", "hoop", "cones", "resistance bands", "dumbbells", "none"];
const object = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: "string" };
const strings = { type: "array", items: string };
const drillSchema = object({
  name: string, durationMinutes: { type: "integer", minimum: 1 }, purpose: string,
  instructions: string, difficulty: { type: "string", enum: levels }, equipment: strings
});
const schema = object({
  title: string, totalDurationMinutes: { type: "integer" }, focusAreas: strings,
  sections: object(Object.fromEntries(sectionNames.map(name => [name, { type: "array", items: drillSchema }])))
});

export function validRequest(input) {
  return input && Number.isInteger(input.availableTimeMinutes) && input.availableTimeMinutes >= 15 && input.availableTimeMinutes <= 180
    && Array.isArray(input.targetSkills) && input.targetSkills.length > 0 && input.targetSkills.length <= 3
    && input.targetSkills.every(skill => skills.includes(skill)) && levels.includes(input.skillLevel)
    && Array.isArray(input.equipment) && input.equipment.length <= 7 && input.equipment.every(item => equipmentOptions.includes(item))
    && typeof input.includeGymWorkout === "boolean";
}

export function validateWorkout(workout, request) {
  if (!workout || typeof workout.title !== "string" || !workout.title.trim()
    || workout.totalDurationMinutes !== request.availableTimeMinutes || !Array.isArray(workout.focusAreas)
    || !request.targetSkills.every(skill => workout.focusAreas.includes(skill)) || !workout.sections) {
    throw new Error("Invalid workout structure");
  }
  let minutes = 0;
  if (request.equipment.includes("hoop") && noHoopClaim.test(workout.title)) {
    throw new Error("Workout title contradicts the available hoop");
  }
  const allowed = new Set([...request.equipment.map(item => item === "ball" ? "basketball" : item), "bodyweight", "open space", "none"]);
  for (const name of sectionNames) {
    const drills = workout.sections[name];
    if (!Array.isArray(drills) || (name !== "gymWorkout" && drills.length === 0)
      || (name === "gymWorkout" && !request.includeGymWorkout && drills.length > 0)) throw new Error("Invalid sections");
    for (const drill of drills) {
      if (!Number.isInteger(drill.durationMinutes) || drill.durationMinutes < 1
        || ![drill.name, drill.purpose, drill.instructions].every(value => typeof value === "string" && value.trim())
        || !levels.includes(drill.difficulty) || !Array.isArray(drill.equipment)
        || !drill.equipment.every(item => allowed.has(item))) throw new Error("Invalid drill or unavailable equipment");
      minutes += drill.durationMinutes;
      drill.youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`basketball ${drill.name} tutorial`)}`;
    }
  }
  if (minutes !== request.availableTimeMinutes) throw new Error("Incorrect total duration");
  if (request.equipment.includes("hoop") && request.equipment.some(item => ["ball", "basketball"].includes(item))
    && request.targetSkills.some(skill => ["shooting", "finishing"].includes(skill))
    && !workout.sections.basketballDrills.some(drill => drill.equipment.includes("hoop") && drill.equipment.includes("basketball"))) {
    throw new Error("Shooting or finishing with a ball and hoop must include a drill using both");
  }
  return workout;
}

export function equipmentInstructions(input) {
  if (!input.equipment.includes("hoop")) {
    return "No hoop is available. Shooting and finishing must use no-hoop technique drills; explain this limitation. Do not prescribe shots at a basket.";
  }
  return "A hoop is available. Do not describe this as a no-hoop workout or claim that a hoop is unavailable."
    + (input.equipment.some(item => ["ball", "basketball"].includes(item)) && input.targetSkills.some(skill => ["shooting", "finishing"].includes(skill))
      ? " Include shooting or finishing drills at the basket with reps or made-shot targets. List both basketball and hoop in those drills' equipment."
      : " Only prescribe ball-based drills if a basketball is also selected.");
}

// Stay below the function's 60-second limit, including backoff and response parsing.
export async function fetchGemini(url, options) {
  const deadline = Date.now() + 52000;
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetch(url, { ...options, signal: AbortSignal.timeout(Math.max(1, Math.min(25000, deadline - Date.now()))) });
    } catch (error) {
      if (!(error instanceof TypeError || error.name === "TimeoutError") || attempt === 2 || Date.now() >= deadline - 1000) {
        if (error instanceof TypeError) error.code = "AI_NETWORK_ERROR";
        throw error;
      }
      console.warn("AI transient transport failure", { attempt: attempt + 1, type: error.name });
    }
    if (response && (response.ok || ![408,500,502,503,504].includes(response.status) || attempt === 2)) return response;
    const retryAfter = response?.headers?.get("retry-after");
    const serverDelay = retryAfter ? (/^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
    const delay = Math.max(400 * 2 ** attempt + Math.floor(Math.random() * 150), Number.isFinite(serverDelay) ? serverDelay : 0);
    if (Date.now() + delay + 1000 >= deadline) {
      if (response) return response;
      throw new DOMException("AI request timed out", "TimeoutError");
    }
    if (response) {
      console.warn("AI transient provider failure", { status: response.status, attempt: attempt + 1 });
      await response.body?.cancel();
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
export function providerError(status) {
  if (status === 429) return { status:429, code:"AI_QUOTA_EXCEEDED", error:"Gemini's free-tier usage limit was reached. Please try again later; no paid provider was used." };
  if ([408,500,502,503,504].includes(status)) return { status:503, code:"AI_TEMPORARILY_UNAVAILABLE", error:"Gemini is temporarily busy. Automatic retries did not succeed. Your focus-skill combination is valid; please try again shortly." };
  return { status:502, code:"AI_CONFIGURATION_ERROR", error:"The AI service rejected the server's configuration. Please contact the site owner; changing your focus skills will not fix this." };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to generate a workout." });
  }
  let input;
  try { input = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "Invalid JSON request." }); }
  if (!validRequest(input)) return res.status(400).json({ error: "Choose 15–180 minutes, 1–3 focus skills, a skill level and available equipment." });
  const { provider, key, model } = aiConfiguration();
  if (!key) return res.status(503).json({ error: "Free-tier AI needs a Gemini API key. Create one at aistudio.google.com/apikey, set GEMINI_API_KEY on the server and redeploy. Keep the Google project on the Free tier to avoid charges.", code: "AI_NOT_CONFIGURED" });
  try {
    const messages = [
        { role: "system", content: "You are HoopCoach, a practical basketball coach. Write every user-facing field in English only. Create an individualized workout from the provided player settings. Return clear, specific instructions with reps, rest and coaching cues. Total drill minutes must equal the requested duration exactly. Include nonempty warmup, basketballDrills, conditioning and cooldown sections; gymWorkout must be empty unless requested. Only use the selected equipment plus bodyweight and open space. Do not assume any unselected equipment, partner or gym is available. Equipment names must exactly match the supplied names, bodyweight, or open space. Never claim to have measured player performance. " + equipmentInstructions(input) },
        { role: "user", content: JSON.stringify({ ...input, equipment: input.equipment.map(item => item === "ball" ? "basketball" : item) }) }
    ];
    const response = await fetchGemini(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: messages[0].content }] },
        contents: [{ role: "user", parts: [{ text: messages[1].content }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 6000 }
      })
    });
    if (!response.ok) {
      console.error("AI request failed", { status:response.status, model });
      const failure = providerError(response.status);
      if (failure.status === 503) res.setHeader("Retry-After", "5");
      return res.status(failure.status).json({ error:failure.error, code:failure.code });
    }
    const result = await response.json();
    const output = (result.candidates?.[0]?.content?.parts || []).filter(item => !item.thought && typeof item.text === "string").map(item => item.text).join("");
    const workout = validateWorkout(JSON.parse(output), input);
    return res.status(201).json({ workoutId: null, workout, generation: { source: provider, model: result.modelVersion || result.model || model, responseId: result.responseId || result.id || null, generatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error("Workout generation failed", error.name);
    return res.status(error.name === "TimeoutError" ? 504 : error.code === "AI_NETWORK_ERROR" ? 503 : 502).json({ error: error.name === "TimeoutError" ? "Gemini took too long after automatic retries. Keep your chosen skills and try again shortly." : error.code === "AI_NETWORK_ERROR" ? "The AI service could not be reached after automatic retries. Please try again shortly." : "AI generation did not complete with a valid workout. Please retry. No sample workout has been substituted." });
  }
}
