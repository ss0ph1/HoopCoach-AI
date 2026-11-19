import { aiConfiguration } from "../server/ai-config.mjs";

export default function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  let config;
  try { config = aiConfiguration(); }
  catch { return res.status(503).json({ status: "error", aiConfigured: false }); }
  res.status(200).json({
    status: "ok",
    aiConfigured: Boolean(config.key),
    provider: config.provider,
    model: config.model
  });
}
