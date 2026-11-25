// Autorizacion unica.
//   node sync/auth.mjs            -> imprime la URL para autorizar
//   node sync/auth.mjs <code|url> -> canjea el code (o la URL completa de google.com) por tokens
import { loadEnv, exchangeCode } from './ml.mjs';

const env = loadEnv();
const arg = process.argv[2];

if (!arg) {
  const u = new URL('https://auth.mercadolibre.com.mx/authorization');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.ML_CLIENT_ID);
  u.searchParams.set('redirect_uri', env.ML_REDIRECT_URI);
  console.log('1) Abre esta URL en Chrome (con tu sesion de Wuishop) y autoriza:\n\n' + u + '\n');
  console.log('2) Te redirige a google.com con ?code=TG-... en la barra de direcciones.');
  console.log('3) Corre: node sync/auth.mjs "<esa URL completa o solo el code>"');
} else {
  const code = arg.includes('code=') ? new URL(arg).searchParams.get('code') : arg;
  const t = await exchangeCode(env, code);
  console.log(`Listo. tokens.json guardado (user_id ${t.user_id}, vigencia ${t.expires_in}s, scope: ${t.scope}).`);
}
