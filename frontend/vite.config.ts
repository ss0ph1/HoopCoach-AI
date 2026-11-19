import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import accountHandler from './api/account.mjs';
import generationHandler from './api/workouts/generate.mjs';
import healthHandler from './api/health.mjs';

export default defineConfig(({ mode }) => {
  const backendEnv = loadEnv(mode, '../backend', '');
  const localEnv = loadEnv(mode, '.', '');
  process.env.DATABASE_URL ||= localEnv.DATABASE_URL || backendEnv.DATABASE_URL || 'postgresql://127.0.0.1:5433/hoopflow_ai';
  for (const name of ['GEMINI_API_KEY', 'GEMINI_MODEL']) {
    process.env[name] ||= localEnv[name] || backendEnv[name] || '';
  }
  return {
    plugins: [react(), {
      name: 'local-accounts-api',
      configureServer(server) {
        const handlers = { '/api/account': accountHandler, '/api/workouts/generate': generationHandler, '/api/health': healthHandler };
        server.middlewares.use(async (req, res, next) => {
          const handler = handlers[req.url?.split('?')[0]];
          if (!handler) return next();
          let raw = '';
          for await (const chunk of req) {
            raw += chunk;
            if (Buffer.byteLength(raw) > 300000) { res.statusCode = 413; res.end(JSON.stringify({ error: 'Request is too large.' })); return; }
          }
          req.body = raw || undefined;
          res.status = code => { res.statusCode = code; return res; };
          res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
          await handler(req, res);
        });
      }
    }],
    server: { port: 5173, proxy: {
      '^/api/(?!account(?:/|$)|workouts/generate(?:/|$)|health(?:/|$))': 'http://127.0.0.1:4010'
    } }
  };
});
