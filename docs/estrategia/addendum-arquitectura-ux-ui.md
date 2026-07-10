# Addendum — Arquitectura de diseño UX/UI (nuevo pilar del documento fundacional)

> **Tipo:** Addendum de investigación + diseño (**NO decisión, NO implementa, NO toca código**).
> **Destino:** integrarse como **Sección 11** de `docs/FUNDAMENTOS-Y-VISION.md` ("Fundamentos y visión —
> estetica-erp"). **Nota de numeración:** el doc vivo hoy ya tiene una §11 ("Checklist de encuadre para abrir
> cualquier sesión"); al integrar este addendum, esa pasa a §12 sin cambiar su contenido. Mismo patrón que
> ADR-058, que también se proyectó como "nueva §11" y terminó aterrizando en §10 — la numeración exacta la
> fija quien integra, no este documento.
> **Autor:** sesión de UI (Ola de calidad, GROW-AR) · **Fecha:** 2026-07-10 · **Rama:**
> `claude/sprint-startup-generic-rf6x0m`.
> **Método:** lectura directa de código con evidencia `archivo:línea` (Parte A) + investigación de mejores
> prácticas probadas, no de moda (Parte B). Se apoya en tres investigaciones YA hechas por el equipo — no las
> repite, las **consolida y eleva a pilar**: `docs/rfc/RFC-002-ux.md` (auditoría UX + direcciones de diseño,
> 2026-07-09), `docs/rfc/RFC-004-identidad-diseno.md` + `RFC-004-D-ficha-marca-tenant.md` (identidad de
> producto vs. marca de tenant, 2026-07-09), `docs/arquitectura/UX-FIORI-AUDIT.md` (score Fiori 6.2/10).

---

## PARTE A — VERDAD DE TERRENO (qué existe HOY, con evidencia)

### A.1 · Tokens y theming — más maduro de lo que un vistazo rápido sugiere

El producto tiene **cuatro capas de tokens superpuestas**, todas en `src/app/globals.css` (567 líneas) vía
`@theme inline` de Tailwind v4 (`globals.css:316-391`), no config JS — coherente con el uso de Tailwind v4
ya presente (`package.json`: `"tailwindcss": "^4"`, `"@tailwindcss/postcss": "^4"`):

1. **Capa semántica base** (`globals.css:39-97`) — nombres por ROL, no por color (`--surface`, `--text-strong`,
   `--line`, `--accent`, `--success/-soft`, etc.), mapeados a utilidades (`bg-surface`, `text-muted`,
   `border-line`…). Dual-theme real: `[data-theme="dark"]` (`globals.css:271-314`) redefine los mismos
   nombres. Foco accesible global, citando WCAG explícitamente: `globals.css:407-420`
   (`a:focus-visible,button:focus-visible,…{ outline: 2px solid var(--focus-ring); }` — *"Cumple WCAG 2.4.7
   (foco visible) y 1.4.11"*).
2. **Capa de densidad** (ADR-059 D4, `globals.css:99-126`) — token `--density` + escala `--space-3xs…2xl`
   derivada, expuesta como utilidades Tailwind (`--spacing-*` en `globals.css:383-390`, ej. `p-md`, `gap-sm`)
   que **conviven** con la escala numérica nativa (`p-4`, `gap-2`) sin pisarla. Un piso duro NO escala con la
   densidad: `--tap-min: 2.75rem` (44px, `globals.css:109`).
3. **Capa de identidad de PRODUCTO (GSG)** (RFC-004, `globals.css:128-186`) — un neutro "papel técnico"
   propio, **tenant-agnóstico**, activable con `[data-identity="gsg"]`, wireado en `src/app/layout.tsx:68,73`
   vía `gsgIdentityEnabled()`/`identityAttr()` (`src/lib/identity.ts:23-31`). Default OFF: sin el flag
   `GSG_IDENTITY_ENABLED`, el atributo nunca se emite → byte-idéntico.
4. **Capa de FICHA DE MARCA por tenant** (RFC-004-D, `globals.css:188-269`) — 5 *theme packs* completos
   (`src/lib/theme-packs.ts:151-157`: `servicios-spa`, `boutique-velas`, `retail-deporte`, `boutique-carne`,
   `gsg-base`) que redefinen **neutros + tipografía + densidad + radio** (no solo el acento) vía
   `[data-brand="…"]`. Se resuelven de **datos reales del Tenant** (`src/lib/brand-sheet.ts:57-70`,
   `buildBrandSheet` puro + `getBrandSheet` con cache por request y **fail-open a neutro, nunca a la marca de
   CH** — `brand-sheet.ts:78-93`), derivando el pack del `blueprintId` (`theme-packs.ts:163-174`, sin
   migración). Cableado en ambos layouts: `src/app/admin/(dashboard)/layout.tsx:57-80` (back) y
   `src/app/(site)/layout.tsx:29-49` (front), detrás de `TENANT_BRAND_SHEET_ENABLED` (default OFF).

**Root-cause ya diagnosticado y en corrección (RFC-004, `docs/rfc/RFC-004-identidad-diseno.md:14-38`):** el
"look base" del producto (`:root`, sin ninguna capa encendida) sigue siendo la paleta Nocturne de **CH
Estética** (`--ch-*`/`--spa-*`, `globals.css:15-37`, expuestos como utilidades `bg-ch-*` en
`globals.css:325-337`) — el producto nació para un tenant y heredó su marca como default. Las capas 3 y 4 de
arriba son **el fix ya construido**, detrás de flag, con una regla dura pendiente de gate automático: *"ningún
componente del design system usa `--ch-*`"* (RFC-004 §4.3) — ya se corrigió un caso real (`Badge` "neutral"
usaba `bg-ch-linen`, corregido en esta misma rama) y queda uno conocido: `Heading.tsx:10` (`text-ch-mocha`
en el "eyebrow" de todo el producto).

### A.2 · Primitivos — biblioteca chica, propia, y en construcción activa (no dispersión)

`src/components/ui/index.ts` es el punto de entrada único. Hoy exporta **12 primitivos** (más helpers de
formato y de columna), **cero dependencias UI externas** (`package.json` no tiene Radix, shadcn, TanStack,
Recharts, ni Storybook — todo es hecho a mano, token-driven, sobre `cn()` propio, sin `clsx`/`cva`):

`Button`/`ButtonLink` · `Card`(+Header/Title/Description) · `Badge` · `Field`(Input/Select/Textarea) ·
`Eyebrow`/`SectionHeading` · `PageHeader` · `SectionGroup` · `ProfileBadge` · `KpiTile` · `EmptyState` ·
`DataTable` (+ `data-table-columns.tsx`: `textColumn`/`moneyColumn`/`numberColumn`/`dateColumn`/
`statusColumn`, y `format.ts`: `fmtMoneyARS`/`fmtNumberAR`).

**No es una librería dispersa: es una consolidada con adopción parcial**, y eso ya está medido por
`docs/rfc/RFC-002-ux.md:17-27` (auditoría de las 22 pantallas de `/admin`): **5 de 22** pantallas usan
`PageHeader` (las 5 nuevas de Empresa: cuentas-a-pagar/cobrar, libros, inventario, devoluciones — confirmado
en este barrido: `src/components/cuentas/DebtListTable.tsx`, `src/components/inventario/InventoryTable.tsx`,
`src/components/devoluciones/ReturnHistoryTable.tsx`, `src/app/admin/(dashboard)/libros/LibrosClient.tsx`
consumen `DataTable` + las fábricas de columna); las **16 restantes** hand-rollean `<h1
className="text-2xl font-semibold">`. `SectionGroup`: 0 pantallas. `--density` nunca se setea desde ningún
layout salvo el wiring ya descrito en A.1 (el propio comentario en `globals.css:105` lo admite: *"mientras
nadie lo setee, `--density` queda en 1"*) — la diferenciación visual Comercio↔Empresa **existe en CSS pero
está inerte en pantalla** hoy. 7 pantallas definen su propio `Intl.NumberFormat` en vez de `fmtMoneyARS`.

### A.3 · Tipografía — 5 familias vía `next/font/google`, una inconsistencia menor

`src/app/layout.tsx:2,8-35`: `Geist`/`Geist_Mono` (`--font-geist-sans/mono`, sin `display` explícito),
`Playfair_Display` (`--font-spa-serif`, sin `display`), `Fraunces` (`--font-fraunces`, **`display: "swap"`**,
línea 28) y `Hanken_Grotesk` (`--font-hanken`, **`display: "swap"`**, línea 34). Las dos fuentes de la
identidad "CH" declaran `swap` explícito; las tres más viejas no lo declaran (Next.js ya usa `swap` por
default, así que el riesgo funcional es bajo, pero es una inconsistencia de estilo/documentación en el código).
Cada *theme pack* (A.1.4) reasigna `display`/`body` a una combinación de estas mismas 5 familias ya cargadas
(`theme-packs.ts:51-149`) — no se cargan fuentes nuevas por tenant, así que no hay costo de red adicional por
marca.

### A.4 · Accesibilidad — disciplina real mezclada con deuda ya auto-diagnosticada

Hay una **auditoría propia existente y vigente**: `docs/arquitectura/UX-FIORI-AUDIT.md` puntúa
"Delightful/enterprise" **4.5/10** y "Coherente" **5/10**, con dos hallazgos 🔴 Alto ya nombrados con archivo
exacto:

- **U1 — formularios sin `<Field>`:** ~50% de los forms admin no usan el primitivo `Field` (que sí resuelve
  bien `<label htmlFor>` + `role="alert"` en su error, `src/components/ui/Field.tsx:28-58`). Bare
  `aria-label`-only (placeholder hace de label visual, WCAG 3.3.2) confirmado en
  `src/app/(site)/reserva/BookingForm.tsx:249-289`, `src/app/admin/(dashboard)/usuarios/page.tsx:151-160`,
  `src/app/admin/(dashboard)/pedidos/PosForm.tsx:109-138`, `recordatorios/page.tsx:66`,
  `ajustes/AjustesForm.tsx`.
- **U7 — `role="alert"` inconsistente:** presente en `Field.tsx:53`, `CajaForms.tsx:32`, `ToastProvider.tsx:41`,
  `modulos/page.tsx:42` — pero no universal (`NewAppointmentForm.tsx:80` setea un error sin contenedor
  `alert` en ese punto).

Lo que **sí** está bien construido, con evidencia:

- **Foco visible global y citado a WCAG** (`globals.css:407-420`, ver A.1).
- **`DataTable` ya nace con presupuesto de a11y** (exigido por ADR-059 D6 fix Challenger #5 y por
  `docs/estrategia/gate-fase-C-adr060-rubrica-S5.md:63-102`): `scope="col"` + `aria-sort`
  (`DataTable.tsx:107-108`, lógica pura testeada en `data-table-sort.ts`), toolbar móvil con `aria-pressed`
  (`DataTable.tsx:88`) porque el header se oculta bajo `sm:`.
- **`Badge` hace estructuralmente imposible un estado "solo color"**: `children` es obligatorio, el `dot` es
  siempre `aria-hidden` (`Badge.tsx`) — no hay forma de armar un badge sin texto a través del primitivo.
- **Modal con foco atrapado, `Escape`, `role="dialog"`:** `src/app/(site)/_ch/BookingModal.tsx:58,303,305`.
- **Cero anti-patrón `<div onClick>`** en toda la app (verificado por grep en `src/`) — todo control
  interactivo es `<button>`/`<a>` real.
- **Metodología propia ya la exige:** `docs/metodologia/auditoria-sap-fiori.md:91-99` tiene una sección
  "Accesibilidad — ángulo obligatorio, no opcional" (labels reales, ARIA, teclado, contraste, 44px, alt).

**Gaps sin dueño hoy:** no existe ningún **"skip to content"** en `/admin` ni en `(site)` (verificado, cero
hits) — con un sidebar persistente en el back y un header con mucho contenido en el front, es fricción real
para navegación por teclado. Tampoco hay una migración a **WCAG 2.2** formal (hoy se cita 2.4.7/1.4.11 de
2.1); el criterio nuevo más relevante para un ERP con mucha grilla es **2.5.8 Target Size (24×24px mínimo)**
— el `--tap-min` de 44px que ya existe **lo excede cómodamente**, así que no hay trabajo de tamaño, solo falta
la cita formal.

### A.5 · Rendimiento percibido — el hueco más grande, y el más barato de cerrar

Ningún documento existente lo cubre: **ADR-023 ("performance multi-tenant") es 100% backend/DB** (índices,
RLS, pooling, storage de Neon free — `docs/adr/ADR-023-performance-multitenant.md`); cero mención a
renderizado, streaming o Web Vitals. Evidencia directa del código:

| Punto | Estado real | Evidencia |
|---|---|---|
| **Rendering mode** | **100% de las rutas** (40 archivos) declaran `export const dynamic = "force-dynamic"`. **Cero** `revalidate`, **cero** `generateStaticParams` en todo `src/app`. | Confirmado por barrido completo; incluye hasta el layout compartido `admin/(dashboard)/layout.tsx:36` (4 queries en paralelo antes de renderizar cualquier hijo). |
| **Streaming/Suspense** | **Cero** `<Suspense>` en toda la app. **Cero** `loading.tsx`/`error.tsx`/`not-found.tsx` (las convenciones de archivo de Next para fallback progresivo no se usan ni una vez). | Todo Server Component espera `Promise.all([...])` completo antes de devolver markup — confirmado en 15+ páginas (`compras`, `catalogo`, `reportes` con 6 queries, `(site)/layout.tsx`, `tienda/page.tsx`…). |
| **Skeletons** | Un solo patrón, en un solo componente: `DataTable.tsx` (`motion-safe:animate-pulse`, filas placeholder cuando `loading`). Ya lo consumen `LibrosClient.tsx`, `InventoryTable.tsx`, `ReturnHistoryTable.tsx`, `DebtListTable.tsx`/`DebtDetailBody.tsx` — pero es un loading **de cliente** (dentro del componente), no un `loading.tsx` de ruta. | `src/components/ui/DataTable.tsx:64,137-138,143`. |
| **UI optimista** | **Cero** `useOptimistic`. `useTransition`/`isPending` existe pero solo en 6 flujos de turnos/reserva (texto "Buscando horarios…" mientras resuelve, no optimismo real). | `EntryBooking.tsx`, `RescheduleForm.tsx`, `NewAppointmentForm.tsx`, `BookingForm.tsx`, `BookingModal.tsx`, `RescheduleButton.tsx`. |
| **Loading global** | Existe, pero es específico: `GlobalLoadingProvider.tsx` parchea `window.fetch` para detectar Server Actions (header `next-action`) y muestra un overlay full-screen tras 150ms de debounce — **no** es un spinner de navegación de router. | `src/app/admin/(dashboard)/GlobalLoadingProvider.tsx`. |
| **Imágenes** | `next/image` en **una sola ruta** ((site) home). El resto de la vidriera pública (`tienda/Storefront.tsx`, `tienda/SiteReplica.tsx` — las páginas más visitadas por clientes externos) usa `<img>` crudo con `loading="lazy"` manual, sin el `srcset`/CLS-prevention automático de Next. | `(site)/page.tsx:195,210` vs. `tienda/Storefront.tsx:544`, `tienda/SiteReplica.tsx` (6 usos). |
| **Fuentes** | Ver A.3 — `swap` inconsistente pero de bajo riesgo real. | `layout.tsx:8-35`. |

**Sin resiliencia de red mala verificada**: no hay Playwright ni ninguna suite de rendimiento/E2E instalada
(`package.json` no tiene `playwright` ni nada similar); todo lo que existe es `node:test` sobre lógica pura.
Cero mediciones de Core Web Vitals reales hoy — es terreno enteramente nuevo, no deuda sobre algo construido.

### A.6 · Síntesis — qué construir encima, qué es deuda

| Para construir ENCIMA (sólido) | Deuda (documentada, con dueño parcial) |
|---|---|
| Capa de tokens semánticos + dual-theme + densidad + identidad + ficha de marca (4 capas, todas token-driven, todas reversibles/flag-gated) | Adopción de primitivos ~30% (5/22 `PageHeader`, 0/22 `SectionGroup`) — RFC-002 P1 |
| 12 primitivos propios, chicos, sin dependencia externa, con tests de lógica pura donde aplica | `--density` inerte: nunca se percibe la diferencia Comercio/Empresa — RFC-002 P2 |
| `DataTable` con presupuesto de a11y ya exigido y parcialmente cumplido (`aria-sort`, toolbar móvil) | Formularios sin `<Field>` (U1) y `role="alert"` inconsistente (U7) — UX-FIORI-AUDIT |
| Foco visible global, citado a WCAG, sin anti-patrón `<div onClick>` en toda la app | Cero skip-link; cero cita formal a WCAG 2.2 |
| Metodología Fiori + argentina ya escrita y con checklist de a11y obligatorio | **Cero** streaming/Suspense/loading.tsx — 100% de las rutas bloquean en `Promise.all` |
| Mecanismo de theme packs ya resuelve "dos productos, dos lenguajes" a nivel token (falta encenderlo) | Cero medición de Web Vitals; cero test de resiliencia con mala conexión |

---

## PARTE B — ARQUITECTURA DE DISEÑO UX/UI (target, decision-grade)

### B.1 · El design system como motor invisible compartido entre los dos productos

**Declaración de pilar:** un solo motor de tokens y primitivos sirve a **ambos** lenguajes de diseño (B.2) y a
**todos** los tenants — nunca dos sistemas de diseño, nunca un fork visual por producto o por cliente (mismo
guardrail anti-fork de `FUNDAMENTOS-Y-VISION.md §1`). Ya existe en un ~70% (A.1): capa semántica + densidad +
identidad + ficha de marca. Lo que falta **no es construir el motor — es terminarlo de encender y adoptarlo**,
exactamente el diagnóstico de `RFC-002-ux.md §5` ("Dirección C"): *"no es falta de ideas de interacción, es que
la reingeniería ya diseñada está a medio aplicar y apagada"*. Este addendum **adopta esa lectura como doctrina
de pilar** (no la re-decide) y le agrega lo que RFC-002/RFC-004 no cubrían: performance percibida, gate de
accesibilidad formal, patrones de grilla/ERP y elección de stack.

- **Versionado:** los tokens viven en código (`globals.css` + `theme-packs.ts`), no en un config externo — se
  versionan con el repo, se revisan por PR como cualquier cambio, y un cambio de token es un diff legible
  (ya es así hoy).
- **Testeo:** hoy la única evidencia automática es `tsc` + `node:test` sobre la lógica pura (`nextSort`,
  `fmtMoneyARS`, `buildBrandSheet`…). Falta evidencia **visual** — ver B.6.

### B.2 · Dos productos, dos lenguajes de diseño, un mismo motor

Analogía correcta (Apple/UIKit): **Comercio** y **Empresa** son "apps" distintas sobre los mismos primitivos,
no dos productos con dos bases de código (esto ya es un invariante duro de ADR-058/059: `enterprise ⊇ lite`).

| | **Comercio** (micro) | **Empresa** (pyme) |
|---|---|---|
| Densidad | espaciosa (`--density: 1.32`, `data-density="lite"`, ya existe) | compacta/data-first (`--density: 1`, default) |
| Home | una acción (resumen del día, botón sólido) — ya real (ADR-059 D8, P1.c) | analítico por rol (KPIs financieros) — ya real |
| Navegación | mínima, sin candados visibles por default (D3) | 5 grupos + ítems adicionales encendidos, nunca reubicados (D2, `enterprise ⊇ lite`) |
| Camino rápido | POS de una pantalla, quick-add (RFC-002 Dirección A) — **no construido aún** | grillas potentes, teclado-first, command palette (B.5) — **no construido aún** |
| Personalización | máxima, preset-IA (ADR-058 P5) | estandarizada, con carácter (theme pack por rubro, ya existe) |

**Que un cliente NO perciba que es el mismo producto** ya tiene el mecanismo (theme packs, A.1.4); lo que
falta es que la **densidad se sienta** (hoy inerte) y que el camino rápido de cada perfil exista de verdad.

### B.3 · Accesibilidad WCAG 2.2 AA — línea base y GATE, no aspiración

WCAG 2.2 es hoy el estándar de referencia legal (EAA europea, guía del DOJ en EE. UU.) — 86 criterios, AA
exige 56. Trae 9 criterios nuevos sobre 2.1; los más relevantes para un ERP con grillas y formularios:

- **2.5.8 Target Size (mínimo 24×24px):** el `--tap-min` de 44px (`globals.css:109`) ya lo excede — **cero
  trabajo**, solo falta citarlo formalmente en la metodología Fiori.
- **2.4.11 Focus Not Obscured:** revisar que el sidebar/drawer persistente de `AdminShell` nunca tape el
  elemento con foco — auditoría puntual, no rediseño.
- **3.3.7/3.3.8 Redundant Entry / Accessible Authentication:** relevante para el login y el flujo de reserva
  (no repetir datos ya ingresados en el mismo proceso).

**Gate propuesto (formaliza lo que `auditoria-sap-fiori.md` ya casi dice):** ningún primitivo ni pantalla nueva
pasa el Gate de Excelencia sin: `<label>` real o `<Field>` (cierra U1) · `role="alert"` en todo error (cierra
U7) · foco visible + operable 100% por teclado (ya cumplido, mantenerlo) · contraste AA (ya cumplido vía
tokens) · `alt` real en imágenes (ya cumplido). Se suma **un skip-link** (`admin` y `(site)`) como ítem nuevo,
único gap sin dueño hoy.

### B.4 · Rendimiento percibido — "sin interrupciones" con presupuesto concreto

Terreno nuevo (A.5): la recomendación es **incremental, no un big-bang de reescritura de rutas**.

1. **Streaming selectivo donde ya hay `Promise.all` pesado:** empezar por `reportes/page.tsx` (6 queries) y
   `catalogo/page.tsx` (6 queries) — envolver las secciones no críticas en `<Suspense fallback={<Skeleton/>}>`
   para que el shell + lo primero importante pinte antes de que resuelva todo. Esto reusa exactamente el
   patrón de skeleton que `DataTable` ya tiene (A.5) — generalizarlo a un `Skeleton` de bloque genérico en
   `components/ui`, no inventar uno nuevo por pantalla.
2. **`loading.tsx` por grupo de ruta** (`admin/(dashboard)/loading.tsx`, `(site)/loading.tsx`): hoy no existe
   ninguno — es la ganancia más barata (un archivo, sin tocar lógica) para que la navegación entre pantallas
   del panel no se sienta "colgada" mientras el Server Component resuelve.
3. **Presupuesto Core Web Vitals** (est. 2026): **LCP < 2.5s**, **INP < 200ms** (reemplazó a FID en 2024, hoy
   pesa igual que LCP/CLS en el ranking — el 43% de los sitios lo falla, así que vale medirlo desde ya),
   **CLS < 0.1**. Sin medición real hoy — primer paso es instrumentar, no optimizar a ciegas.
4. **Resiliencia con mala conexión** (comercios AR, móvil): condición explícita del negocio (`FUNDAMENTOS §8`,
   Neon free). Antes de invertir en offline-first (fuera de escala para un equipo de 3), lo barato es: `swap`
   consistente en las 5 fuentes (A.3), `next/image` en `tienda/` (hoy `<img>` crudo, A.5) y los `loading.tsx`
   del punto 2 — cierran la mayor parte de la percepción de "lento" sin arquitectura nueva.
5. **UI optimista donde ya hay mutaciones frecuentes:** `useOptimistic` para altas rápidas del POS/quick-add
   (B.5) cuando se construyan — no retrofit del resto del código.

### B.5 · Patrones UX de ERP — sobre el motor existente, no reemplazándolo

- **Grillas de datos:** `DataTable` (hecho a mano, ya con orden/densidad/a11y/loading/vacío) alcanza para el
  volumen actual. **Disparador de migración** (no hacerlo antes de tiempo): cuando una grilla necesite
  **virtualización** (>500-1000 filas visibles) o **columnas redimensionables/reordenables por el usuario**,
  ahí sí adoptar **TanStack Table** (headless, se monta sobre los mismos `<table>`/tokens, no impone estilos)
  + **TanStack Virtual** solo para esa pantalla puntual — no reescribir `DataTable` entero de entrada.
- **Formularios:** el primitivo `Field` ya resuelve bien label/error/a11y (A.4) — el trabajo es **adopción**
  (cerrar U1), no diseño nuevo.
- **Command palette / atajos de teclado (Empresa, power users):** no existe hoy. Recomendado **`cmdk`**
  (la librería chica y probada detrás de la palette de Linear/Vercel/shadcn) — headless, ~poco peso, se
  themea 100% con los tokens existentes. Encaja con la Dirección A de RFC-002 ("teclado-first" para Empresa)
  sin construir un motor de atajos propio.
- **Estados vacíos:** `EmptyState` ya existe y ya lo adoptan 7 pantallas — falta generalizar, no diseñar.
- **Dashboards:** `KpiTile` ya existe y ya resuelve el home analítico — mismo caso.
- **Camino rápido de venta (POS):** hoy `pedidos` (vender) y `caja` (cobrar) viven separados (RFC-002 P5) —
  es el hueco de UX más citado para el operador de mostrador; se resuelve con composición de primitivos
  existentes (`PageHeader`+`DataTable`+`Field`), no con una librería nueva.

### B.6 · Elección de tecnología — aprovechar lo que ya funciona, sumar solo lo probado

Principio Apple (restraint): **no** se reemplaza una biblioteca de 12 primitivos que ya funciona, es chica y
es 100% propia. Se **suma** selectivamente donde el problema es genuinamente difícil de hacer bien a mano:

| Necesidad | Ya existe / alcanza | Sumar cuando el disparador ocurra | Por qué NO lo más nuevo |
|---|---|---|---|
| Componentes headless (Dialog/Select/Combobox complejos) | `BookingModal` ya resuelve foco/Escape/`role="dialog"` a mano | **Base UI** (no Radix — Radix bajó ritmo de mantenimiento tras su adquisición por WorkOS; el propio equipo original de Radix hoy construye Base UI, mantenido por MUI) — solo para el próximo patrón genuinamente difícil (ej. un Combobox con búsqueda) | Adoptar una librería headless entera hoy sería reemplazar componentes que ya andan y están testeados |
| Grilla de datos | `DataTable` propio | **TanStack Table + TanStack Virtual**, ver B.5 | Prematuro sin el volumen de filas que lo justifique |
| Gráficos (reportes/dashboards) | ninguno construido aún | **Recharts** (SVG, ~150kB, la opción "aburrida" con más comunidad — no Tremor, que agrega una capa de abstracción sobre el mismo Recharts sin necesidad; no visx, de más bajo nivel del que un equipo de 3 necesita) | visx exige terminar construyendo tu propia librería de charts; Tremor no aporta sobre Recharts directo |
| Command palette | ninguno | **`cmdk`** (B.5) | — |
| Movimiento/transiciones | CSS + `prefers-reduced-motion` ya respetado en 2 lugares (`ch-pulse`, `global-loading-spinner`) | librería `motion` (sucesora de Framer Motion) **solo** si aparece una transición de página o *drag-to-reorder* real | Añadir una librería de animación sin un caso de uso concreto es peso sin beneficio |
| Evidencia visual / regresión | ninguna | **Playwright con `toHaveScreenshot()`** — autohospedado, cero servicio nuevo, y el repo **todavía no tiene Playwright** (tampoco para E2E) así que resuelve dos necesidades con una sola instalación | **Storybook + Chromatic** es la opción más completa pero es una suscripción paga + mantenimiento de historias; no se justifica todavía con 12 primitivos y un equipo de 3 — revisar cuando la librería crezca a ~25-30 componentes o el equipo crezca |

**Ninguna de estas es urgente hoy.** El primer trabajo real es adopción + performance + a11y (B.3/B.4, sobre
lo que ya existe); el stack nuevo se suma **recién cuando el disparador concreto aparezca**, no por adelantado.

### B.7 · Gobernanza de diseño

- **Los tokens son DATO, no código de UI:** la ficha de marca (`Tenant.name/accentPreset/frontTheme/
  blueprintId` → theme pack) ya lo hace realidad (A.1.4) — un tenant nuevo no requiere tocar un componente,
  requiere una fila de datos + elegir un pack existente (o, si se justifica, un pack nuevo curado por Diseño,
  nunca por el cliente).
- **Quién firma la calidad UX:** el Gate de Excelencia (ADR-040) ya corre siempre en Opus (`CLAUDE.md §3`);
  este pilar agrega que el **ángulo de experiencia** (no solo "pasa el checklist") lo valida un rol de
  consultor funcional/UX dentro de ese mismo Gate — mismo patrón que "Argentinizar SAP" (ADR-044) ya tiene su
  ángulo dedicado.
- **Evidencia automática que respalda el Gate (barata, ya semi-propuesta):**
  1. **Grep-gate anti-`ch-*`**: RFC-004 §4.3 ya propone que un check falle si aparece `-ch-`/`bg-ch-`/`text-ch-`
     fuera del theme pack de CH — extender a un lint de CI simple (una línea de `grep -r` en el pipeline).
  2. **% de adopción de primitivos**, la métrica de éxito que `RFC-002-ux.md §5` ya define (`PageHeader` = 100%
     de pantallas, 0 pantallas con `Intl.NumberFormat` propio) — medible por grep, sin herramienta nueva.
  3. **Snapshots de Playwright** (B.6) como evidencia de que un cambio de token no rompió visualmente un
     theme pack — corre en CI, sin costo de servicio externo.

### B.8 · Gap vs. estado actual + plan por fases (sin reescribir lo que ya sirve)

No compite con la secuencia que `RFC-002-ux.md §5` ya propuso (C-core → C-full → A-hot → B-onboarding,
pendiente de Challenger + Gate del dueño) — la **envuelve** y le agrega las fases 0 y las columnas de
performance/a11y que ese RFC no cubría:

| Fase | Contenido | Depende de | Naturaleza |
|---|---|---|---|
| **0 · Barato y ya mismo** | `loading.tsx` en `admin/(dashboard)` y `(site)` · cerrar U1/U2/U7 (adoptar `<Field>`, `role="alert"` universal) · skip-link · `next/image` en `tienda/` · `display:"swap"` consistente en las 5 fuentes | nada — son cambios locales, reversibles, sin flag necesario | Reversible, sin Gate de arquitectura (sí Gate de Excelencia normal) |
| **1 · C-core** (RFC-002) | Encender `data-density` en los layouts + migrar 5 pantallas diarias a primitivos | Gate + prototipo Comercio vs Empresa lado a lado (ya pedido por RFC-002) | Reversible, flag-gated |
| **2 · C-full** (RFC-002) + Suspense selectivo (B.4.1) | Resto de pantallas a `DataTable`/primitivos + 5 grupos/perfil ON por default + streaming en `reportes`/`catalogo` | Gate | Reversible |
| **3 · A-hot** (RFC-002) | POS de una pantalla, quick-add, command palette (`cmdk`, B.5) | Gate + decisión del dueño sobre el eje (RFC-002 §6) | Nueva superficie, no reemplaza nada |
| **4 · B-onboarding** (RFC-002) + instrumentación Web Vitals | Primer-uso guiado + medición real de LCP/INP/CLS en producción | Gate | Nueva superficie |
| **5 · Stack nuevo bajo demanda** (B.6) | TanStack Table/Virtual, Recharts, Base UI, Playwright visual — cada uno **solo** cuando su disparador concreto aparezca | Decisión puntual, no un "sprint de librerías" | Aditivo |

---

## Resumen ejecutivo

El producto ya tiene un design system real: cuatro capas de tokens (semántica, densidad, identidad de
producto, ficha de marca por tenant) y una biblioteca propia de 12 primitivos, todo reversible detrás de
flags y sin dependencias externas. El problema no es la fundación — es que está **a medio encender y a medio
adoptar** (~30% de las pantallas), un diagnóstico que el equipo ya hizo bien en `RFC-002-ux.md` y que este
addendum adopta como doctrina de pilar en vez de re-derivarlo. Lo que faltaba declarar como parte de esta
arquitectura, y que ningún documento existente cubría, es el rendimiento percibido: el 100% de las rutas
renderiza bloqueante, sin streaming, sin `loading.tsx`, con un solo patrón de skeleton en toda la app — un
hueco grande pero barato de cerrar de forma incremental, sin arquitectura nueva. En accesibilidad hay
disciplina real (foco visible citado a WCAG, cero anti-patrones de teclado, un `Badge` que no puede depender
solo del color) mezclada con dos gaps ya nombrados por la propia auditoría Fiori (formularios sin `<Field>`,
`role="alert"` inconsistente) más uno nuevo (ningún skip-link). La recomendación de tecnología es de
contención: no reemplazar los 12 primitivos que ya funcionan; sumar librerías probadas (TanStack Table,
Recharts, Base UI, `cmdk`, Playwright) recién cuando el disparador concreto lo justifique, nunca por moda.
El plan de cierre no compite con la secuencia ya propuesta por RFC-002 — la envuelve, agrega una Fase 0 barata
y una capa de performance/accesibilidad formal como gate permanente del producto.

---

## Referencias

`docs/FUNDAMENTOS-Y-VISION.md` (documento a integrar) · `docs/rfc/RFC-002-ux.md` (auditoría UX + direcciones) ·
`docs/rfc/RFC-004-identidad-diseno.md` · `docs/rfc/RFC-004-D-ficha-marca-tenant.md` · `docs/rfc/RFC-004-C-
identidad-front-ola1.md` · `docs/rfc/RFC-004-B-deteccion-ia-branding.md` · `docs/arquitectura/UX-FIORI-
AUDIT.md` · `docs/design-system-temas.md` · `docs/metodologia/auditoria-sap-fiori.md` · `docs/adr/ADR-023-
performance-multitenant.md` · `docs/adr/ADR-059-reingenieria-de-interfaz-backoffice-grow-ar.md` (D4 densidad,
D6 primitivos/`DataTable`) · `docs/estrategia/gate-fase-C-adr060-rubrica-S5.md` · Código:
`src/app/globals.css` · `src/app/layout.tsx` · `src/lib/identity.ts` · `src/lib/brand-sheet.ts` ·
`src/lib/theme-packs.ts` · `src/components/ui/` · `src/app/admin/(dashboard)/GlobalLoadingProvider.tsx`.

— Addendum de investigación + diseño. No decide, no implementa. Sigue Challenger (S5, ADR-045) → Gate
(ADR-040) → integración a `FUNDAMENTOS-Y-VISION.md` por quien corresponda.
