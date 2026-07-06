# 🔎 Auditoría GSG / Gate de Excelencia — entregables de preventa (2026-07-06)

- **Célula:** Auditoría GSG / Excelencia (capa Opus). **Rol:** control de calidad — NO integro cambios
  de otras células; solo audito y reporto.
- **Alcance auditado:** los **3 previews de negocio** (`docs/artefactos/*.html`), el **/demo publicado**
  (motor del probador, `src/app/demo/`), el **probador vivo por tenant** (vidriera `src/app/tienda/` +
  sitio público `src/app/(site)/`) y el **adaptador/intake** en diseño (`src/preset/extraction/`).
- **Estándar:** `docs/metodologia/auditoria-sap-fiori.md` (5 principios Fiori + accesibilidad +
  consistencia), `docs/metodologia/estandar-marca-gsg.md`, Gate de `docs/METODOLOGIA-SPRINT.md`.
- **Método:** lectura factual de código/HTML con evidencia `file:line` (4 barridos en paralelo) +
  verificación directa de los 2 hallazgos code-facing decisivos. **No se tocó prod/DB/deploy.**

> **Nota de contexto:** los fundamentos `auditoria-sap-fiori.md` y `estandar-marca-gsg.md` viven hoy en
> `frente/reliability`, **todavía no en `main`**. Bajar esos dos docs a `main` es prerequisito para que
> el Gate sea invocable por todas las células (item para el frente de confiabilidad, no para esta célula).

---

## 1. Veredicto por entregable (semáforo del Gate)

| Entregable | Rol-based | Coherente / tokens | Simple | Adaptable | Delightful/enterprise | a11y | Consistencia | Sello GSG | **Veredicto** |
|---|---|---|---|---|---|---|---|---|---|
| **Adaptador/intake** (`src/preset/extraction`) | N/A¹ | ✅ | ✅ | ✅ | N/A¹ | N/A¹ | ✅ | N/A² | **🟢 PASA** |
| **Probador vivo / vidriera** (`tienda` + `(site)`) | N/A³ | ✅ (~98% tokens) | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ (no-colisión OK) | **🟡 CONDICIONAL** |
| **/demo** (motor del probador) | N/A³ | ⚠️ (color crudo) | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ (artefacto GSG) | **🟡 CONDICIONAL** |
| **3 previews de negocio** (`docs/artefactos`) | N/A³ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | **🔴 NO PASA (como set)** |
| **Sello GSG global** (metadata + backoffice) | — | — | — | — | — | — | — | ❌ | **🔴 NO CUMPLE (deuda)** |

¹ El adaptador es **lógica pura/contrato sin UI** ("en diseño") → los ángulos de UX no aplican todavía.
² Código: el sello GSG se materializa por *trailer de commit*, no por firma en el archivo → N/A correcto.
³ Superficies públicas/marketing sin roles de aplicación → *role-based* N/A (el aislamiento por tenant se
  audita en el core, fuera de este alcance).

**Conclusión de alto nivel:** nada de lo auditado es **integrable/mostrable a cliente tal cual está**.
El adaptador es el entregable más sólido (pasa). El probador y el /demo pasan con correcciones acotadas.
Los 3 previews **no pasan como conjunto**: divergen en calidad y tienen huecos de honestidad y
accesibilidad que el cliente vería. El sello GSG verificable (Capa 2) **no está cableado** en la app.

---

## 2. Hallazgos priorizados

Prioridad: **P0** = bloqueante, no mostrar a cliente así · **P1** = corregir antes de campaña/rollout ·
**P2** = deuda anotada, no bloqueante.

### 🔴 P0 — Bloqueantes antes de mostrar a cliente

**P0-1 · Honestidad del dato: previews con precios/contacto que parecen reales pero no lo son.**
_Ángulo: Delightful/enterprise + Simple (honestidad)._ Regla del estándar: *"un tenant honesto con
huecos marcados es mejor que uno con datos inventados"*.
- `docs/artefactos/shinevelas-preview.html` muestra precios (`8500`, `9000`, `11900`, …) y un WhatsApp
  hardcodeado (`const WA="5491176213834"`) **sin ninguna marca visible de "demo / datos de ejemplo"**
  para el cliente (solo hay un comentario en el código, invisible). adosmanos y breakpoint sí muestran
  un tag/ribbon "Demo · precios de ejemplo". → El cliente puede tomar precios de ejemplo como reales.
- Los WhatsApp de los previews son **inconsistentes y sin verificar**: uno es placeholder puro
  (`5490000000000`), otros son números reales-sin-confirmar y **distintos entre sí** (`5491161870066`,
  `5491176213834`). Un CTA de preventa que cae en un número equivocado o inexistente quema la reunión.
- **Corrección:** todo preview lleva (a) marca visible y uniforme "Demo de preventa · datos de ejemplo,
  a confirmar" y (b) **un único** destino de contacto real y verificado (o marcado explícitamente como
  provisional). Ningún número `000…` ni precio sin flag va a la vista del cliente.

**P0-2 · CTA del /demo publicado apunta a un placeholder.**
_Ángulo: Delightful/enterprise + propósito del artefacto._
- `src/app/demo/demo-content.ts:85` → `whatsappNumber: "5491100000000" // PROVISIONAL`. El /demo es la
  pieza de captación; si se publica/promociona con este número, **todo lead se pierde**.
- El email (`gestionstudiogrow@gmail.com`) sí es real, lo que agrava la incoherencia del canal principal.
- **Corrección:** GTM fija el número real de captación **antes de publicar o linkear el /demo**. Hasta
  entonces, el /demo no se difunde como canal de leads.

### 🟠 P1 — Corregir antes de campaña / rollout a más tenants

**P1-1 · Inconsistencia de calidad entre los 3 previews (la "mano GSG" no es uniforme).**
_Ángulo: Consistencia (transversal)._ Es el hallazgo estructural del set.
- Break Point (`breakpoint-preventa.html`, ~29 KB / 927 líneas): pulido — `focus-visible` con outline,
  `role="img"`/`aria-labelledby` por sección, 10+ media queries, **sello GSG en el footer**.
- adosmanos (~15 KB) y shine (~14 KB): más simples — 1 y 4 media queries respectivamente, sin
  `focus-visible`, **sin sello GSG**, glifos/emoji como imágenes sin `alt`.
- Resultado: tres piezas del mismo estudio con niveles de terminación visiblemente distintos. Rompe el
  ángulo de consistencia y diluye el estándar GSG.
- **Corrección:** nivelar los tres al piso de Break Point (focus-visible, roles/aria, cobertura
  responsive) y **unificar el sello GSG** (ver P1-2).

**P1-2 · Sello GSG en los previews: presente en 1 de 3.**
_Ángulo: Sello GSG (Capa 2)._ Los previews son **artefactos de preventa de GSG** ("…sobre nuestro ERP"),
no la superficie pública desplegada del tenant → el estándar admite/pide **firma GSG visible** para
artefactos propios de GSG. Hoy solo Break Point la tiene (`<span class="gsg">… Gestión Studio Grow</span>`).
- **Corrección:** los tres previews llevan el mismo crédito GSG discreto en el pie, sin pisar la marca
  del negocio (principio de no-colisión respetado: la marca dominante sigue siendo la del tenant).

**P1-3 · Vidriera del tenant: inputs de checkout sin `<label>` real (placeholder-como-label).**
_Ángulo: Accesibilidad._ Es superficie que el **cliente final del tenant usa** (p. ej. la vidriera viva
de Magra).
- `src/app/tienda/SiteReplica.tsx:176-182` → `<input name="customerName" placeholder="Nombre *">`,
  `customerPhone`, `address` y el `<select>` de entrega **sin etiqueta asociada**. Al enfocar, el lector
  de pantalla no anuncia el campo; al escribir, desaparece la única pista.
- **Inconsistencia interna:** `src/app/tienda/Storefront.tsx:340-350` **sí** usa `<label>` reales para el
  mismo formulario. Dos variantes del mismo patrón → deuda de consistencia además del defecto a11y.
- **Corrección:** envolver cada input/select en `<label>` (o `htmlFor`/`id`) como ya hace Storefront.

**P1-4 · Pantalla `/tienda/gracias` fuera del design system y del tema del tenant.**
_Ángulo: Coherente/tokens + Adaptable._ Página **client-facing** (confirmación de pedido).
- `src/app/tienda/gracias/page.tsx:19-25` → paleta hardcodeada (`#f4efe6`, `#2a211c`, `#e9e1d3`,
  `#6b5d52`) y `fontFamily: "system-ui"`. Usa el `accent` del tenant en el título/botón (bien), pero el
  **fondo/superficie es fijo beige-claro**: no respeta `frontTheme` del tenant ni los tokens Nocturne,
  y no usa `clamp()` responsive como el resto de la vidriera. Un tenant de tema oscuro rompe el hilo.
- **Corrección:** migrar la superficie a `var(--surface*/--text*/--line)` como Storefront/SiteReplica.

### 🟡 P2 — Deuda anotada (no bloquea mostrar)

**P2-1 · Sello GSG verificable (Capa 2) sin cablear en la app.**
_Ángulo: Sello GSG._ Es la deuda que el propio estándar reconoce como pendiente de los frentes de UI.
- `src/app/layout.tsx:41-50`: `generateMetadata()` no incluye `metadata.generator = "Gestión Studio
  Grow"`. **Ausente en todo `src/app`.**
- Sin crédito "Hecho por Gestión Studio Grow" en el footer del **backoffice** (`src/app/admin`,
  `src/app/operador`) — grep = 0 apariciones. El `AdminShell` tiene footer de navegación pero sin sello.
- No es client-facing (metadatos + backoffice), por eso P2; pero **es un ítem del Gate (Bloque 2) que
  hoy no se cumple**. Cablearlo una vez en el layout raíz + footer de backoffice lo salda.
- **Corrección:** añadir `generator` al `metadata` raíz y el crédito discreto en el footer de
  `/admin` y `/operador` (NO en la vidriera pública del tenant → no-colisión). Anotar en `PROXIMOS-PASOS.md`.

**P2-2 · /demo — foco de teclado sin indicador visible y color mayormente crudo.**
_Ángulo: Accesibilidad + Coherente._
- Buena base a11y (aria-label en controles, `aria-live` de escena, navegación por flechas/espacio,
  autoplay pausable). **Falta** un `:focus-visible` visible → un usuario de teclado no ve dónde está.
- ~60% de los colores del escenario son hex/rgba crudos (`src/app/demo/DemoTour.tsx:233-240`) con
  `--demo-ink` local en vez de tokens del sistema. Aceptable por ser una escena autónoma, pero anotado.
- **Corrección:** agregar estilo `:focus-visible` al mock; opcional migrar la paleta a tokens.

**P2-3 · Imágenes decorativas de los previews sin `alt`/`aria-hidden`.**
_Ángulo: Accesibilidad._ Glifos/emoji usados como imágenes en adosmanos (10) y shine (20+) sin `alt`.
Al ser decorativos, el fix correcto es `aria-hidden="true"` (o `alt=""`), no texto alternativo.

---

## 3. Qué debe corregirse ANTES de mostrar a clientes (checklist accionable)

Ordenado por lo que un cliente vería primero:

1. **[P0-1]** Marca visible y uniforme de "demo / datos de ejemplo" en los **3 previews**, y un único
   contacto real verificado (eliminar el WhatsApp `5490000000000` y los números divergentes).
2. **[P0-2]** Número real de captación en `demo-content.ts` **antes** de publicar/linkear el /demo.
3. **[P1-1]** Nivelar los 3 previews al piso de calidad de Break Point (a11y + responsive).
4. **[P1-2]** Sello GSG discreto y uniforme en el pie de los 3 previews.
5. **[P1-3]** `<label>` reales en el checkout de `SiteReplica` (paridad con `Storefront`).
6. **[P1-4]** `/tienda/gracias` a tokens del design system + tema del tenant.

**Puede integrarse ya (con su corrección menor anotada como deuda):** el **adaptador/intake** — contrato
puro, sistema de `provenance` honesto (verificado / provisional / pedido-al-dueno), tests exhaustivos, sin
TODOs. Es el patrón de calidad a replicar en el resto.

**Deuda a levantar por los frentes de UI (no bloquea preventa):** cablear el sello GSG verificable
(P2-1), `focus-visible` en /demo (P2-2), `aria-hidden` en glifos decorativos (P2-3).

---

## 4. Nota de gobernanza (PMO)

- Ningún preview ni el /demo se muestran a un cliente hasta cerrar **P0-1 y P0-2** (honestidad del dato y
  CTA real). Es criterio de calidad, no de estética.
- Las correcciones son responsabilidad de las células dueñas (Diseño para vidriera/gracias, Célula 3 para
  /demo, el generador de preset para los previews). **Esta célula no las ejecuta**; reaudita al recibir.
- Prerequisito de método: bajar `auditoria-sap-fiori.md` y `estandar-marca-gsg.md` a `main`.

— Elaborado por **Gestión Studio Grow (GSG)** · Célula de Auditoría / Excelencia (Opus).
