---
id: ADR-103
nivel: plataforma
dominio: [Dependencias, Fiscal, Bancos]
depends_on: [ADR-022]
---

# ADR-103 — Tres dependencias para vender: `unpdf` (leer PDF), `pdf-lib` (armar PDF) y `qrcode` (QR de ARCA)

**Estado:** Aceptado (2026-09-25), frente R0-F1 del backlog de lanzamiento
(`Factory-GSG/30-LANZAMIENTO/realize/backlog.json`). Agregadas a `package.json` con versión exacta
y resueltas en `package-lock.json` desde `registry.npmjs.org`. **Todavía ningún archivo las importa**
(`grep -rlE "from '(unpdf|pdf-lib|qrcode)'" src scripts` = 0): las usan los frentes que siguen.
Nada cambia para CH (`beauty-spa`): sin import no entran a ningún bundle. · **Relacionados:**
ADR-022 (plugin ARCA: `urlQrAfip`, `src/plugins/arca/domain/qr-afip.ts:93`).

## Contexto (medido)

- **Leer extractos bancarios en PDF** (frente R1-F4, `src/plugins/bancos/parser/pdf.ts`): el parser
  reconstruye filas y columnas por coordenada (x, y) del texto, sin OCR, y corre en Vercel
  (serverless, sin binarios nativos). Diseño: `Factory-GSG/30-LANZAMIENTO/explore/E1-contador-whatsapp.md:193`.
- **Armar el PDF del comprobante con el QR de ARCA** (`src/lib/comprobante-pdf.ts`, para mandarlo por
  WhatsApp o email): el QR es obligatorio en el comprobante electrónico y codifica la URL que ya arma
  `urlQrAfip`. Diseño: `E1-contador-whatsapp.md:241`.
- Hoy el repo no tiene ninguna librería de PDF ni de QR.

## Decisión

| Paquete | Versión (exacta) | Licencia | En disco | Dependencias propias | Última publicación (`npm view time.modified`) |
|---|---|---|---|---|---|
| `unpdf` | 1.8.1 | MIT | 2,6 MB | ninguna | 2026-08-13 |
| `pdf-lib` | 1.17.1 | MIT | 24 MB (+1,7 MB `@pdf-lib/*`) | `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako`, `tslib` | 2022-05-12 |
| `qrcode` | 1.5.4 | MIT | 260 KB (+1,2 MB `pngjs`) | `dijkstrajs`, `pngjs`, `yargs` | 2025-11-13 |
| `@types/qrcode` (dev) | 1.5.6 | MIT | — | — | — |

- `package-lock.json` suma 32 paquetes; 22 cuelgan de `yargs`, que `qrcode` usa **sólo** en su
  línea de comandos (`bin`): `grep -rl yargs node_modules/qrcode/lib` = 0, o sea que la librería no
  lo carga.
- Uso sólo del lado del servidor. `pdf-lib` trae las 14 tipografías estándar en JS (no lee archivos
  del disco), así que no hace falta empaquetar fuentes para la función serverless.
- Cada librería queda detrás de UN módulo propio (el parser PDF y `comprobante-pdf.ts`): cambiarla
  no toca a quienes los llaman.

## Alternativas descartadas

**Leer PDF**
- `pdfjs-dist` directo: es el mismo motor (Mozilla pdf.js), pero en Node/serverless pide configurar
  el worker y parches de DOM/canvas. `unpdf` empaqueta justamente el build serverless de pdf.js.
- `pdf-parse`: su salida por defecto es texto plano sin coordenadas, y el parser necesita x e y.
- OCR (`tesseract.js`): pesado (wasm + datos de idioma) y lento; los extractos bancarios son PDF
  digitales. Un PDF escaneado entra como «ilegible» a revisión humana (E1:193), no se adivina.
- Servicio externo de lectura: costo recurrente y mandar extractos bancarios de clientes a un
  tercero. Es decisión del dueño; no hace falta.

**Armar PDF**
- Chrome sin pantalla (`puppeteer` + `@sparticuz/chromium`): decenas de MB de binario y arranque en
  frío de segundos en cada función; más costo por comprobante.
- `@react-pdf/renderer`: árbol de dependencias más grande (motor de maquetado, fuentes) y ata un
  documento del servidor a versiones de React.
- `pdfkit`: viable, pero sus fuentes se leen del disco y hay que asegurar que viajen en el bundle
  serverless. Queda como reemplazo si `pdf-lib` hiciera falta cambiarlo.
- `jsPDF`: pensado para el navegador.
- **Riesgo aceptado:** `pdf-lib` no publica desde 2022-05-12. Mitigación: JS puro sin código nativo,
  formato PDF estable, versión fijada exacta y aislado en un módulo reemplazable (`pdfkit`).

**QR**
- Escribirlo a mano (Reed-Solomon, máscaras, versiones): fácil de equivocar en algo que exige la
  norma fiscal.
- `qrcode-generator`: viable y más chico, pero `qrcode` entrega el PNG en un `Buffer` que `pdf-lib`
  embebe directo (`embedPng`) y tiene tipos mantenidos (`@types/qrcode`).
- Generar el QR con un servicio web: manda CUIT e importes a un tercero y agrega una dependencia de red.

## Fuera de esta decisión

- `xlsx` sigue apuntando a `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (`package.json`).
  Pasarlo a una copia propia en `vendor/` (E4-R-PERF-DEP) queda pendiente: en el entorno de esta
  corrida `cdn.sheetjs.com` está bloqueado y no se pudo bajar el archivo.

## Consecuencias y verificación

- `npm audit`: 13 avisos (5 moderados, 8 altos) **antes y después** de agregar estas tres; ninguno en
  los paquetes nuevos ni en sus dependencias (están en la cadena de `prisma`/`@prisma/dev`, `hono`,
  `mysql2`, `valibot`, `js-yaml`, etc.). Son previos y van aparte a BACKLOG.
- Cómo repetirlo: `node -e "console.log(require('unpdf/package.json').version)"` (idem `pdf-lib`,
  `qrcode`); `npm audit --json` sobre el lock actual y sobre el de `HEAD`. Evidencia:
  `.qa/vender-1/r0f1-migracion/`.
