# funko-catalogo

Catálogo estático de Funko Pop generado desde tus publicaciones activas de Mercado Libre.
Nuevo = Preventa, Usado = En stock.

## Uso
1. `copy .env.example .env` y pega `ML_CLIENT_SECRET` (app "Rastreador de precios Funko", scope Lectura).
2. `node sync/auth.mjs` → abre la URL, autoriza, copia la URL final de google.com y corre `node sync/auth.mjs "<url>"`.
3. `node sync/sync.mjs` → genera `docs/productos.json` y `docs/img/`.
4. Revisa en local: `npx serve docs` (o cualquier servidor estático).
5. Publica `docs/` con GitHub Pages.

## Qué NO se publica
Tokens, client secret, user_id, IDs MLM, cantidades y links de ML (a menos que `INCLUDE_PERMALINK=true`).
La liga del catálogo se comparte solo por canales externos a ML, nunca por el chat de ML.
