# Demo interactiva del ERP — `/demo`

**Qué es:** el recorrido interactivo (product tour) al que apunta la publicidad de
Instagram Stories. Es el "echá un vistazo más de cerca" — la respuesta a lo que hace
tuturno.io, pero mejor: en vez de un video, el visitante **toca** y ve la app funcionando.

- **Ruta:** `/demo` — pública, **sin login**, **mobile-first**.
- **Dueño:** Célula 3 (Producto/Contenido).
- **Construido:** 2026-07-06.

> **Coordinación con preventa/onboarding — Generador de Preset por IA** (`docs/metodologia/generador-preset-ia.md`):
> este `/demo` es el **motor del probador**; el **preset** de cada cliente (generado por los agentes de
> preventa: marca, catálogo, wording, branding) es el **contenido que lo alimenta**. Norte compartido:
> que el motor pase de genérico ("Estudio Aura") a **parametrizado por preset** (por cliente),
> manteniendo la garantía dura de esta ruta (`force-static`, sin base/credenciales/`process.env`, sin
> datos reales). El preset entrega su contenido como **datos de ejemplo** (estilo `demo-content.ts`),
> nunca como conexión a la DB. La interfaz preset→motor se cierra entre Célula 3 y preventa.

---

## Cómo se ve / cómo se usa

Un **teléfono en pantalla** con la app corriendo dentro, y una **barra de progreso estilo
Stories** arriba. El visitante recorre 6 escenas:

1. **Agenda** — turnos que no se pisan (entra un turno "reservado online" en vivo).
2. **Reservá online** — la vidriera pública: elige horario y confirma.
3. **Caja / POS** — arma el ticket, el total cuenta hacia arriba, se cobra y suma a la caja del día.
4. **Facturación** — emite y aparece el **CAE de ARCA** al instante.
5. **Panel del Dueño** — *"Tu negocio te habla"*: insights en lenguaje llano + tendencia. **La palanca estrella.**
6. **Cierre** — tarjeta de conversión con el CTA.

**Navegación** (nativa de Stories):
- **Tap** en la mitad derecha → siguiente; en el tercio izquierdo → anterior.
- **Swipe** izquierda/derecha (táctil).
- **Flechas** ← → y **barra espaciadora** (pausa) en desktop.
- **Autoplay:** cada escena avanza sola; el relleno de la barra ES el temporizador. El botón ❚❚ pausa.
- CTA siempre visible abajo + "Saltar al final" / "Ver de nuevo".

El CTA primario abre **WhatsApp** con un mensaje pre-cargado ("quiero esto para mi negocio");
el secundario, un **mail**. Cero backend, cero formulario, cero fricción.

---

## Aislamiento de producción (coordinación con Célula 2)

**La demo no toca prod ni datos reales.** Garantías, verificables:

- Toda la ruta vive en `src/app/demo/` y **no importa nada de la app**: los únicos imports
  externos son `react` y `next`; el resto son sus propios archivos. **No toca** `@/lib/prisma`,
  acciones, `tenant`, `rls`, `branding`, ni `process.env`.
- `export const dynamic = "force-static"` → se pre-renderiza en build, **sin conexión ni
  credenciales**. Si algún día se rompe el aislamiento, el build de esta ruta fallaría.
- **Todos los datos son de ejemplo**, hardcodeados en `demo-content.ts` (negocio ficticio
  "Estudio Aura", clientas y números inventados). Ningún tenant real (CH, Magra) aparece.

Chequeo rápido de los imports de la ruta (solo deben aparecer `react`, `next` y archivos `./`):

```bash
grep -rhoE "from \"[^\"]+\"" src/app/demo/ | sort -u
```

---

## Mensaje y CTA (coordinación con Célula 1 / GTM)

Todo el copy de venta y el destino del CTA están centralizados en
[`src/app/demo/demo-content.ts`](../../src/app/demo/demo-content.ts) para que GTM los edite
sin tocar la UI:

- `SCENES[]` — kicker, título y bajada (pitch) de cada escena.
- `DEMO_CTA` — número de WhatsApp, texto pre-cargado, mail, etiquetas de los botones.

⚠️ **A confirmar por GTM antes de publicar:**
- `DEMO_CTA.whatsappNumber` es un **placeholder provisional** (`5491100000000`). Reemplazar por
  el número real de captación (formato E.164 sin `+` ni signos).
- **Imagen OG** para el link de la campaña: hoy `page.tsx` define `openGraph` con título/bajada
  pero **sin imagen**. Sumar una `openGraph.images` cuando GTM defina el creativo, así el link
  se ve bien compartido.

---

## Archivos

| Archivo | Rol |
|---|---|
| `src/app/demo/page.tsx` | Ruta pública `force-static` + metadata/OG. |
| `src/app/demo/DemoTour.tsx` | Motor del tour (barra Stories, tap/swipe/teclado, autoplay, marco de teléfono, CTA). Cliente. |
| `src/app/demo/scenes.tsx` | Las 6 escenas animadas (cero deps; animaciones CSS + un count-up). Cliente. |
| `src/app/demo/demo-content.ts` | Datos de ejemplo + copy + config de CTA (punto de edición de GTM). |

Sin dependencias nuevas. Animaciones = CSS keyframes inyectados en `DemoTour` (no tocan
`globals.css`, que es compartido). Respeta `prefers-reduced-motion`.

---

## Correr / desplegar

**Local:**
```bash
npm run dev      # y abrir http://localhost:3000/demo
```

**Desplegar:** es una ruta más de la app; sale con el deploy normal a Netlify (Gate 1 del dueño).
No requiere migraciones ni variables de entorno. Al ser `force-static`, se sirve como HTML
estático → carga rápida, ideal para el tráfico de Stories.

**Vallas verificadas** (2026-07-06): `tsc --noEmit` limpio · `npm test` 282/282 · render en vivo
de las 6 escenas OK (agenda con turno entrante, reserva confirmada, caja con total, factura con
CAE, panel del dueño con insights, cierre con CTA).
