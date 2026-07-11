> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), reconstruido desde las apps en vivo. Incorporado sin alterar.

---

# Manifiesto de assets construidos (deployments en vivo)

Mientras los deployments sigan online, estos son los archivos construidos que sirve cada app.
Podés re-descargarlos directamente desde el navegador (están en el mismo origen de cada app).
Son bundles **construidos/minificados** (no el código fuente `.tsx`); para el fuente ver `00-GUIA-RECUPERACION.md` (Vía 1: Vercel).

## Común a las 4 apps
- Framework: **Next.js (App Router) con Turbopack**.
- Fuente tipográfica: **Geist** (`_next/static/media/*.woff2`).
- Hoja de estilos: un bundle CSS en `_next/static/chunks/*.css` (~73 KB, framework + tokens).

## gsg-erp-magra.vercel.app — ruta `/tienda` (capturado 2026-07-10)
CSS:
- `/_next/static/chunks/2fo248wsow_bv.css`

JS (chunks Turbopack):
- `/_next/static/chunks/0ha4m18glnjqn.js`
- `/_next/static/chunks/2ed389kjanj2u.js`
- `/_next/static/chunks/0vr6eflop8zax.js`
- `/_next/static/chunks/1trqy_e13immx.js`
- `/_next/static/chunks/1_0v6exngdege.js`
- `/_next/static/chunks/turbopack-04h_6w2j96lp9.js`
- `/_next/static/chunks/05-c3ty_6dwfk.js`
- `/_next/static/chunks/14mrh2-p_w84d.js`
- `/_next/static/chunks/1eqgpxoresxrw.js`
- `/_next/static/chunks/3_c543rp4_93s.js`
- (+ 2 chunks adicionales — total 12 scripts)

> Los nombres de chunk son hashes por build; cambian en cada deploy. Para tener el set exacto
> vigente, abrí la app → DevTools (F12) → pestaña **Network** → recargá → filtrá por JS/CSS →
> "Save all as HAR". O directamente recuperá el fuente desde Vercel (Vía 1).

## Otras apps
`gsg-erp-estetica`, `gsg-erp-velas`, `gsg-erp-padel` sirven la misma estructura de assets
(`_next/static/chunks/*.js` + un `.css`), con hashes propios de cada build. El procedimiento
de descarga (HAR desde Network, o Download source en Vercel) es idéntico.

## Recomendación
No vale la pena archivar los bundles minificados: el **código fuente real** se recupera intacto
por Vercel (Vía 1) o por git (Vías 2–4). Este manifiesto es sólo un respaldo de último recurso
mientras el deploy siga vivo.
