# PUBLICAR — runbook §C (1 clic del dueño) · Plantillería AR demo

> **Estado:** ✅ demo lista y verde (tsc + tests + build) y verificada end-to-end en local.
> **Falta solo la acción irreversible del dueño:** elegir la cuenta gratis donde vive la URL pública.
> **Nada de esto cuesta plata ni usa datos reales** — es la demo costo-cero (ADR-030/031).
> Elaborado por GSG — Frente C (Plantillería), sprint.

La célula **no publica sola** porque no hay token de Vercel/Netlify en el entorno y **no se inventan
secretos** (§C, Gate 1). Todo lo demás ya está hecho. El dueño elige **una** de estas tres vías; todas
llevan a una URL `*.vercel.app` / `*.netlify.app` gratis, sin dominio ni tarjeta.

Ruta del sitio: `celula-negocios-digitales/productos/plantilleria/sitio/`

---

## Opción A — Netlify Drop (la más rápida, 0 cuenta obligatoria) · ~1 min

1. En la carpeta `sitio/`, generar el sitio:
   ```bash
   npm install        # solo la 1ª vez (baja tsx/esbuild/typescript, gratis)
   npm run build      # deja el sitio en sitio/out/
   ```
2. Abrir **https://app.netlify.com/drop** y **arrastrar la carpeta `sitio/out`** a la página.
3. Netlify devuelve al instante una URL tipo `https://random-name.netlify.app`. **Ese es el link.**
   (Con login gratis, la URL queda permanente y renombrable.)

## Opción B — Vercel CLI · ~2 min (URL permanente con nombre de proyecto)

1. Instalar y loguearse una vez (gratis): `npm i -g vercel && vercel login`.
2. Desde `sitio/`:
   ```bash
   vercel --prod
   ```
   Vercel lee `vercel.json` (ya incluido): build `npm run build`, output `out`. Devuelve
   `https://plantilleria-ar.vercel.app` (o el nombre que se elija). **Ese es el link.**

## Opción C — Conectar el repo (deploy continuo, cada push republica) · ~3 min

1. En Vercel o Netlify: **New Project → importar el repo** `Gestion-Studio-Grow/ERP`.
2. Setear **Root Directory** = `celula-negocios-digitales/productos/plantilleria/sitio`.
3. Los archivos `vercel.json` / `netlify.toml` ya definen build (`npm run build`) y output (`out`).
   Deploy automático. **La URL que asigne es el link.**

---

## Checklist de seguridad de la demo (ya cumplido en el código)
- [x] **Sin cobro real:** el checkout es Mercado Pago en **MODO DEMO** (banner permanente); el botón
      "Pagar" solo genera una orden ficticia `DEMO-xxxxxxxx` y va a la página de gracias.
- [x] **Sin datos reales / sin backend:** carrito y "compra" viven en `localStorage` del visitante; no
      hay servidor, DB ni endpoint que reciba datos.
- [x] **Sin secretos:** no hay tokens, API keys ni URLs de pasarela real en el repo.
- [x] **Disclaimer legal** de ARCA/AFIP en cada ficha y en el footer.
- [x] **Sello GSG** discreto (`<meta generator>` + footer) sin pisar la marca del producto.

## Cuando la demo pase a VENTA (post-venta, NO ahora)
Recién con la venta concretada (ADR-030 §2): registrar cuenta de cobro real (Mercado Pago y/o Lemon
Squeezy MoR para USD), reemplazar el checkout demo por el real, subir los archivos de las 5 plantillas
**realmente construidas** (hoy el catálogo es copy real pero los `.xlsx/Sheet` no están armados),
comprar dominio `.com.ar` y activar analítica/email. Los secretos los pega **siempre el dueño**.
