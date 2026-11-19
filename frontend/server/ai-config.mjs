export function aiConfiguration() {
  return {
    provider: "gemini",
    key: process.env.GEMINI_API_KEY?.trim(),
    model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite"
  };
}
