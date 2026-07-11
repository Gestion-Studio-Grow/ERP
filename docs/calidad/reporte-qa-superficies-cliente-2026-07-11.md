# Barrido de calidad visual/UX — superficies de cara al cliente

> **Rama:** `qa/superficies-cliente` · **Base:** `origin/main` (`5e603ae`) · **Fecha:** 2026-07-11
> **Criterio del dueño:** *"lo que es cosmético para el cliente es crítico"*. Nada se dejó "para después".
> **Método:** render REAL en Chromium (Playwright), nunca por DOM estático. 4 tenants (un rubro/tema cada
> uno), desktop **y** mobile, sobre base efímera en RAM (PGlite, **sin tocar Neon**).

## TL;DR

- Se construyó un **instrumento de medición computada** (`scripts/qa/visual-audit.mjs`): mide **contraste
  WCAG AA**, **touch targets** y **overflow horizontal** en un navegador real, sobre vidriera + flujo de
  reserva/compra + **todo `/admin`**, en los **4 temas de color**, desktop y mobile.
- Barrido inicial: **191 defectos de contraste + 133 touch targets bajo el mínimo AA (24px) + 0 overflow**,
  sobre 84 combinaciones (ruta × viewport × tenant). Todo renderiza (0 errores 500 / pantallas en blanco).
- Se **arreglaron todos** al estándar Fable/AA. Barrido final: **0 · 0 · 0**.
- Se **subió el listón del gate**: el chequeo de contraste/touch/overflow ahora **falla el gate**
  (`npm run gates` → nueva valla `visual-aa`), corriendo DB-backed en los 4 temas. Ya no depende de que
  alguien mire.

---

## PARTE 1 — Catálogo de defectos (medición computada, no "a ojo")

Superficies recorridas por tenant (`estetica`/servicios · `magra`/carnicería · `velas` · `padel`), en
desktop (1280×900) y mobile (390×844):

- **Vidriera pública** (`/`), **flujo** (`/reserva` en servicios, `/tienda` en retail).
- **Backoffice** `/admin`: login, tablero, clientes, catálogo, reportes, ajustes, apariencia, turnos
  (servicios), pedidos + caja (retail).

### Contraste WCAG AA — 191 defectos (umbral 4.5:1 texto normal / 3:1 texto grande)

| # | Patrón (color → fondo) | Ratio | Dónde | Causa raíz |
|---|---|---|---|---|
| 123 | `#aeaeb2` → `#f5f5f7` / `#fff` | 2.0–2.2:1 | Todo `/admin` (Fable): "Dueño/a", tips, timestamps, "Mostrador·Envío", teléfonos, footer del login | Token `--text-faint` **por debajo de AA por diseño** |
| 40 | acento `#2e7c97` → hueso `#f6f3ec` / tinta `#1b1a14` | 3.7–4.3:1 | Vidriera: wordmark "Mi negocio" (header+footer), link "Ver servicios" | Acento del tenant usado **como texto** |
| 10 | success `#1a7f37` → success-soft | 4.26:1 | Píldora "Activo" (catálogo) | Token semántico de texto apenas bajo AA sobre su `-soft` |
| 8 | danger `#d70015` → danger-soft | 4.35:1 | Píldora "Stock bajo" | idem |
| 6 | verde WhatsApp `#128c4b` → blanco | 4.3:1 | Botón "Pedir/Continuar por WhatsApp" (tienda) | Verde de marca WA apenas bajo AA |
| 6 | `#a79c87` → blanco | 2.7:1 | Tienda retail: "/ kg", "/ unidad" | `--text-faint` base |
| 6 | warning `#8a6a1f` → warning-soft | 4.22:1 | Píldora "A cobrar" (pedidos) | Token semántico bajo AA sobre `-soft` |
| 4 | acento ámbar `#9a6a1f` → `#f5f5f7` | 4.33:1 | "En uso" (apariencia), "Confirmado" (pedidos) | Acento del tenant como texto (`text-accent`/`text-info`) |

### Touch targets mobile — 133 bajo el mínimo AA (WCAG 2.5.8 = **24px**)

> Nota: los 44px son **AAA** (2.5.5), no AA — se reportan como *advisory* de confort (436 casos, casi todos
> chips de 40px), no fallan el gate. El gate **falla** solo bajo el piso AA de 24px, y **exime** lo que la
> norma exime: controles nativos (checkbox/radio) y links de texto inline.

| # | Control | Tamaño | Dónde |
|---|---|---|---|
| 120 | Toggle "Activo/Inactivo" | 56×**20** | Catálogo (productos/servicios/cupones) |
| 6 | "×" quitar línea | 17×**18** | POS pedidos + ajustes de stock |
| 4 | "Editar" | 37×**20** | Catálogo (profesionales) |
| 3 | "Reprogramar" / "Cancelar turno" / "No se presentó" | ancho×**20** | Turnos |

### Overflow horizontal — 0. **HTTP≥400 / pantallas en blanco — 0** (todo renderiza).

---

## PARTE 2 — Arreglos (al estándar Fable/AA, para los 4 tenants)

Priorizados por **impacto sistémico** (token > componente) para que sirvan a los 4 temas, no a un tenant.

### Tokens (arreglan la mayoría de una vez)

1. **`--text-faint` → AA en los 7 temas** (base + Fable + 5 theme packs), light y dark. Antes daba
   2.0–3.1:1; ahora ≥4.5:1 sobre el canvas de cada tema. Valores calculados (no a ojo) contra la superficie
   real. Espejado en `src/lib/theme-packs.ts`. → **~129 defectos**.
2. **Tokens semánticos de texto en Fable** (`--success`/`--warning`/`--danger`): oscurecidos lo justo para
   ≥4.5:1 sobre su `-soft` (siguen AA sobrados sobre card blanca). → **~24 defectos** (badges de estado).
3. **Nuevo token `--accent-ink`** = acento del tenant **afinado a AA como texto** (oscurecido en claro,
   aclarado en oscuro, derivado de `--accent` → respeta la marca de cada tenant). Se re-declara en los
   bloques Fable para computar con el acento del tenant (no el fallback de `:root`). `--info` pasa a usarlo.
   → badges "En uso"/"Confirmado" y futuros usos de acento-como-texto.

### Componentes

4. **Wordmarks de la vidriera** ("Mi negocio", header + footer) → 22→**24px** = "texto grande" WCAG (umbral
   3:1) **sin tocar el color de marca**.
5. **Links/labels chicos de acento** (hero "Ver servicios", eyebrow/kicker de la tienda) → acento
   oscurecido con `color-mix` (conserva el tono de marca, llega a ≥4.5:1).
6. **Verde WhatsApp** `#128C4B` → `#118648` (≥4.6:1) en los 4 botones WA.
7. **Touch targets** a mínimo 24px: toggles de catálogo, "×" de POS/ajustes, acciones de turnos,
   "Editar" de profesionales (`min-h-6` + `inline-flex items-center`).

### Resultado

| | Contraste AA | Touch (AA <24px) | Overflow | HTTP≥400 | En blanco |
|---|---|---|---|---|---|
| **Antes** | 191 | 133 | 0 | 0 | 0 |
| **Después** | **0** | **0** | **0** | **0** | **0** |

---

## PARTE 3 — El gate sube el listón (lo sistémico)

**El problema:** el gate visual previo (`visual-smoke.mjs`) solo veía "el CSS no cargó / layout colapsado".
No medía contraste ni calidad. Un texto gris sobre fondo gris pasaba.

**Lo nuevo:**

- **`scripts/qa/visual-audit.mjs`** — checker computado: por cada nodo de texto visible calcula el color
  efectivo (compone alfa sobre el fondo real; texto sobre imagen = no medible, no falso-positivo), el ratio
  WCAG y el umbral por tamaño. Mide touch targets (piso AA 24px, exime nativos/inline) y overflow. Excluye
  controles **disabled** (WCAG los exime). Una página que 500ea o queda en blanco = **fallo duro** (no puede
  "pasar" contraste por no tener qué medir).
- **`scripts/qa/visual-audit-gate.mjs`** — orquestador **self-contained y a costo cero**: levanta PGlite
  (Postgres en RAM, sin Neon), migra, siembra los 4 tenants, arranca `next start` con ruteo por subdominio
  (`*.localhost`) y corre el checker en los **4 temas**, desktop + mobile, sobre `/admin` + reserva +
  vidriera. Inyecta sesión de admin (cookie firmada) para auditar las pantallas autenticadas.
- **Cobertura ampliada**: de los 3 logins a **~13 rutas × 4 tenants × 2 viewports** (vidriera, flujo,
  tablero, clientes, catálogo, reportes, ajustes, apariencia, turnos, pedidos, caja).
- **Wiring**: `npm run gates` suma la valla **`visual-aa`** (después de `build`). Si un texto no llega a
  4.5:1 (o 3:1 grande), o un control queda <24px, o hay scroll horizontal → **gate rojo**.

---

## Notas / decisiones

- **Sin migración** (Gate 2 intacto). Solo CSS/tokens + componentes + scripts de QA.
- Se agregó un hook backward-compatible en los seeds (`SEED_DB_MAX`) para poder sembrar contra la base en
  RAM del gate (PGlite no tolera el `Promise.all` concurrente); default = comportamiento de siempre.
- Los 4 temas de color quedan **todos** AA, no solo CH.

— Elaborado por GSG (Célula de Confiabilidad / QA)
