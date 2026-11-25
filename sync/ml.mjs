// Utilidades compartidas: .env, tokens y llamadas a la API de Mercado Libre.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = path.join(ROOT, 'tokens.json');
const API = 'https://api.mercadolibre.com';

export function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) throw new Error('Falta .env (copia .env.example y llena ML_CLIENT_SECRET)');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2];
  }
  for (const k of ['ML_CLIENT_ID', 'ML_CLIENT_SECRET', 'ML_REDIRECT_URI']) {
    if (!env[k] || env[k].startsWith('pega_aqui')) throw new Error(`Falta ${k} en .env`);
  }
  return env;
}

async function tokenRequest(params) {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${body.message || JSON.stringify(body)}`);
  body.obtained_at = Date.now();
  fs.writeFileSync(TOKENS, JSON.stringify(body, null, 2));
  return body;
}

export function exchangeCode(env, code) {
  return tokenRequest({
    grant_type: 'authorization_code',
    client_id: env.ML_CLIENT_ID,
    client_secret: env.ML_CLIENT_SECRET,
    code,
    redirect_uri: env.ML_REDIRECT_URI,
  });
}

// Devuelve un access_token vigente (refresca si hace falta; el refresh_token rota).
export async function getAccessToken(env) {
  if (!fs.existsSync(TOKENS)) throw new Error('No hay tokens.json: corre primero `node sync/auth.mjs`');
  const t = JSON.parse(fs.readFileSync(TOKENS, 'utf8'));
  const ageSec = (Date.now() - t.obtained_at) / 1000;
  if (ageSec < t.expires_in - 300) return t.access_token;
  const r = await tokenRequest({
    grant_type: 'refresh_token',
    client_id: env.ML_CLIENT_ID,
    client_secret: env.ML_CLIENT_SECRET,
    refresh_token: t.refresh_token,
  });
  return r.access_token;
}

export async function api(token, pathAndQuery) {
  const res = await fetch(`${API}${pathAndQuery}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`API ${res.status} en ${pathAndQuery.split('?')[0]}: ${await res.text()}`);
  return res.json();
}
