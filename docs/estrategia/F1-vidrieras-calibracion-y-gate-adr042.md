# F1 · Vidrieras Shine + ADM — Calibración (ADR-052), estado relevado y GATE ADR-042

**Frente:** F1 `frente/diseno-vidrieras` · **Rol:** Arquitecto de Solución + célula Diseño/Adaptador (pool ADR-053)
**Modelo de norma:** Sonnet (Gate en Opus) · **Fecha:** 2026-07-07 · **Base:** `origin/main` (`7a76fd8`)
**Estado:** calibrado; **entregable principal (copy DX-5 de Shine/ADM) BLOQUEADO por el gate ADR-042 → elevado a §C.**

---

## 1. PASO 0 — Calibración obligatoria (ADR-052)

Corpus leído: `CLAUDE.md` + `AGENTS.md` · ADR-042 (autorización de marca) · ADR-048 (arquitecto de solución) ·
ADR-049 (RACI) · ADR-052 (calibración) · ADR-046 (de-sesgo) · `docs/lecciones-aprendidas/registro.md`
(**DX-5**, DX-6, DX-7) · `docs/ESTADO-ACTUAL.md` (§3 tenants, §4 gates, §C) · `docs/ESTADO-FRENTES.md`
(tablero de sprint) · `docs/estrategia/prompts-arranque-F1-F3.md` (bloque F1, prompt canónico) ·
`docs/estrategia/plan-ventana-2026-07-08.md` (implícito vía HANDOFF) · el código del territorio
(`src/tenants/storefront.ts`, `src/app/tienda/Storefront.tsx`, `src/lib/storefront-visual.ts`,
`src/blueprints/retail/rubros.ts`).

**Principios que guían mis decisiones en este frente:**

1. **El gate manda sobre el entregable.** ADR-042 es no salteable: sin autorización *registrada* del cliente
   no se replica ni se muestra su marca, aunque el fin sea comercial y a su favor. Si el gate bloquea el
   objetivo, el objetivo se para y se eleva — no se "avanza a ojo".
2. **Real relevado, no inventado (DX-5).** Copy/categorías/reviews espejan la comunicación REAL del negocio,
   con diff explícito contra la fuente; nada de personas/quotes/datos inventados presentados como reales.
   Lo que no se pudo relevar se marca *provisional a confirmar*, no se disfraza de real.
3. **Reversible y en mi territorio.** Ejecuto solo lo reversible de presentación (código de vidriera) dentro
   de mi territorio declarado; lo irreversible (deploy, Neon, branding real en DB, secretos, **marca del
   cliente**) se ELEVA, no se ejecuta (ADR-048). Ante la duda → irreversible → §C.
4. **Dato en Neon ≠ código.** El branding/catálogo real que vive en la DB es Gate 2 (DX-7): no lo toco, lo
   elevo. Solo toco código (copy de tenant en `storefront.ts`, lógica de `storefront-visual.ts`).
5. **Verde antes de integrar, sin sobre-ingeniería.** `tsc` + tests + `build` en verde; cambios aditivos y
   acotados (ventana "afinar"); no mergeo a main yo (lo hace el PMO tras el Gate de Excelencia en Opus).

**Zona de de-sesgo (ADR-046):**
- **HUMANA / criolla** — copy de vidriera, taglines, reviews, voz de marca de cada tenant: cálido, argentino,
  de persona real. *(Justo la zona que hoy está gateada por ADR-042.)*
- **ESTÁNDAR / precisa** — la clasificación de producto, secciones, tipos y tests de `storefront-visual.ts`:
  código puro, determinístico, convencional. *(La zona en la que sí avancé.)*

---

## 2. Estado relevado de las dos vidrieras (patrón DX-5, sobre `main` 7a76fd8)

| Tenant | Slug / rubro | Copy de tenant (`storefront.ts`) | Estado real |
|---|---|---|---|
| **Shine Velas** | `shinevelas` / `velas` | ✅ presente (experiencial: ritual + sets + reviews) | Copy YA en `main` (célula Shine previa, `af26494`) **pero landeado sin verificación de autorización ADR-042**; reviews (Carla P./Sofía M./Belén R.) **aparentan ser inventadas** (no marcadas como relevadas del sitio real). No hay diff DX-5 contra `@shine.velas.store`. |
| **A Dos Manos** | `adosmanos` / `padel` | ❌ ausente (`COPY_BY_SLUG` no lo tiene) | Cae al wording genérico del rubro `padel`. Sin copy de firma. Además, defecto de UX: el catálogo caía **entero en "Más productos"** (grilla plana) por falta de clasificación de pádel. |

**Consecuencia:** el corazón del A2 (alinear ambas vidrieras a lo REAL con copy exacta relevada) **depende de
tocar la identidad/marca de Shine y ADM**, que es exactamente lo que ADR-042 gatea. → Ver §3.

---

## 3. 🔒 GATE ADR-042 — hallazgo y elevación (BLOQUEANTE)

**Verificación (pedida por el prompt F1 y por `ESTADO-ACTUAL.md:47` / `ESTADO-FRENTES.md:35`):**
la **autorización de marca registrada** de Shine Velas y A Dos Manos **NO existe**. Contrastado contra el
precedente de Magra, cuya autorización SÍ está registrada ("el dueño autorizó copiar EXACTO (autorización
TOTAL)", `docs/metodologia/registro-casos/magra.md`). Para Shine/ADM no hay ningún registro equivalente en
`docs/` — solo alta en Neon y "email OWNER provisional".

**Por ADR-042 (no salteable): sin OK registrado no se replica ni se muestra su marca.** Por lo tanto:

- **No ejecuto** el relevamiento-y-réplica DX-5 de copy/identidad de Shine ni de ADM.
- **No agrego** copy de tenant para `adosmanos`.
- **No expando** el copy de Shine ya presente en `main`.

**Hallazgo de cumplimiento (para el PMO/dueño):** el copy experiencial de Shine ya vive en `main` habiéndose
landeado **antes** de esta verificación de autorización, y sus reviews parecen construidas, no relevadas.
Recomendación: (a) obtener/registrar la autorización de Shine para regularizarlo, y (b) en el mismo pase,
rehacer el copy por DX-5 (diff contra el sitio/redes reales) y **marcar o quitar las reviews no verificables**.

**→ Elevado a §C de `docs/ESTADO-ACTUAL.md` como fila `I7`** (autorización de marca Shine + ADM). Es acción
del dueño; desbloquea todo el A2 real.

---

## 4. Qué avancé SIN depender del gate (reversible, brand-neutral, en verde)

> Regla del prompt: "avanzá con lo que no depende de eso". Lo brand-neutral no replica la identidad de ningún
> tenant: es **vocabulario genérico del rubro** (producto GSG), útil para cualquier tienda de ese rubro.

**Secciones de pádel en `src/lib/storefront-visual.ts` (lógica pura, mi territorio exclusivo).**
Antes, el clasificador solo conocía velas → **todo el catálogo de una tienda de pádel caía en "Más
productos"** (grilla plana, mala UX para la demo de ADM, que es P1). Ahora el mismo taxón reconoce las
categorías genéricas de pádel y arma el recorrido **Palas · Calzado · Pelotas · Bolsos y paleteros · Grips y
accesorios**.

- **Aditivo y sin cambiar firmas** (no toca `Storefront.tsx` ni la página): los vocabularios de velas y pádel
  **no colisionan** (verificado con tests) y `groupBySection` omite las secciones vacías, así cada rubro solo
  ve las suyas. `equipo` va antes que `pala` para que "Protector de pala" no caiga en Palas.
- **Tests:** bloque nuevo en `storefront-visual.test.ts` sobre los nombres del catálogo real del rubro
  (`rubros.ts`): clasificación, prioridad protector→equipo, recorrido de secciones y no-colisión entre rubros.
- **Deuda anotada (Gate §3):** la evolución "limpia" es un esquema de secciones **por rubro** (variante
  ADR-055) inyectado desde el tenant, en vez de un taxón único compartido. Se dejó aditivo a propósito
  (ventana "afinar", cambio reversible acotado). Se completa naturalmente junto con el copy de ADM
  post-autorización, cuando se toque `Storefront.tsx`/página.

**Estado de vallas:** _(ver reporte del frente al cierre)_ — `tsc --noEmit`, `npm test` y `npm run build`.
Cambio brand-neutral es lógica pura + tests; **no observable en preview de browser** (se verifica por unit
tests, no por render). No mergeo a main: queda para el Gate de Excelencia (Opus) + PMO.

---

## 5. Qué queda pendiente (para el pase post-autorización)

1. **[gate dueño]** Registrar autorización de marca de Shine y ADM (I7 en §C). Sin eso, lo de abajo no corre.
2. **[post-gate]** DX-5 real de Shine: diff contra `@shine.velas.store` (accessibility tree + innerText, no
   WebFetch plano), corregir copy y **reviews reales o retiradas**.
3. **[post-gate]** Copy de tenant de ADM (`adosmanos`) relevado de sus redes reales, + threading del esquema
   de secciones por rubro en `Storefront.tsx`/página (cierra la deuda de §4).
4. **[Gate 2, dueño]** Branding real (BusinessSettings) de Shine/ADM en Neon — es DATO, no código (DX-7).

---

*Documento de frente (F1). No toca prod ni deploy; el único cambio de código es reversible y brand-neutral.
— Elaborado por GSG (Arquitecto de Solución + Diseño)*
