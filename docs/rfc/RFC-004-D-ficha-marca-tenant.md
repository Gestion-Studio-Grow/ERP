# 📄 RFC-004-D — Ficha de marca por tenant (piel tenant-scoped de punta a punta)

> **Corrección del diagnóstico + fix.** El dueño verificó en runtime/DB que la **resolución y los
> módulos FUNCIONAN** (la base qa-empresa tiene los 4 demos; velas resuelve a velas-demo con sus módulos).
> El bug es **100% de PIEL, config-sobre-código**: el branding leía un mapa hardcodeado por slug que NO
> tiene los slugs demo → todo caía a un default con contenido de CH + tokens/tipografía globales de CH.
> **Fecha:** 2026-07-09. Detrás de flag, reversible, **sin tocar beauty-spa / erp-ch**. Sigue S5 (Gate).

---

## 1. Causa raíz (código)
- `brandForSlug` ([branding.ts]) usa `TENANTS` con claves `beauty-spa/magra/shinevelas/adosmanos` — **no**
  los slugs sembrados `estetica-demo/velas-demo/padel-demo/magra-demo` → todos caían a `DEFAULT_BRAND`
  (name "ERP", preset petróleo-CH). La **DB ya trae la ficha** (`accentPreset/frontTheme/blueprintId/name`)
  pero el branding **no la leía**.
- `RUBRO_BY_SLUG` tampoco tiene los slugs demo → `velas-demo` no matcheaba retail → el front `/` no
  redirigía a `/tienda` → renderizaba la **landing de CH hardcodeada**.
- Tokens del backoffice: `globals.css :root` = Nocturne de CH + fuentes globales de CH; solo `--accent`
  variaba por tenant → "el mismo backoffice con otro color".

## 2. Modelo — BrandSheet (config-sobre-código)
La marca se resuelve de **datos del Tenant**; los tokens ricos son **theme packs curados en código**; la
ficha **elige** uno por `themeId` (derivado de `blueprintId`, sin migración).

- **`src/lib/theme-packs.ts`** — 5 packs (light+dark): `servicios-spa`, `boutique-velas`, `retail-deporte`,
  `boutique-carne`, `gsg-base` (neutro no-CH). Cada uno: neutros/superficies + tipografía (display/body de
  las fuentes ya cargadas) + densidad + radio. **Ninguno copia el hueso/petróleo de CH.**
- **`src/lib/brand-sheet.ts`** — `buildBrandSheet(tenant)` (puro) + `getBrandSheet()` (lee la DB, cache por
  request, fail-open a neutro). Deriva `themeId` de `blueprintId`; acento/tema salen de la ficha.
- **Flag `TENANT_BRAND_SHEET_ENABLED`** ([identity.ts], default OFF). beauty-spa/erp-ch no lo usan.

## 3. Implementación
**Frente B (backoffice)** — [admin/(dashboard)/layout.tsx]: con el flag ON, `data-brand={themeId}` +
`data-theme` (back = opuesto) + acento de la ficha → `globals.css [data-brand="…"]` redefine neutros +
tipografía + densidad. Nombre/monograma del tenant.

**Frente A (front, por datos)**:
- `DEFAULT_BRAND` deja de ser CH → neutro ("Mi negocio", acento celeste).
- [(site)/layout.tsx] + [(site)/page.tsx]: piel del tenant (`data-brand`), redirect **por `blueprintId`**
  (no por slug), y **de-CH** de la landing (hero/eyebrow/footer/Header con el nombre del tenant, no "CH").
- [/tienda/page.tsx]: envuelve la vidriera en la piel del tenant (`data-brand` + tema + acento de la DB).
- [layout.tsx raíz]: metadata deja de estar hardcodeada "CH Estética" → nombre del tenant (o neutro).

## 4. Cómo se ve / DoD
- **Prototipo renderizado** (tokens reales sobre el shell del admin): `estetica` vs `velas`, back y front —
  neutros/tipografía/densidad/acento distintos. *(Artifact que acompaña este RFC.)*
- **Captura del panel LOGUEADO en vivo:** requiere el flag ON en staging (paso del dueño, §6).
- **Vallas:** tsc limpio · suite **780/780** · `globals.css` compila con Tailwind v4 CLI (83.6KB, los 5
  packs presentes en el output).

## 5. Del lado de Vercel (lo hace el dueño)
En el proyecto de staging **erp** (los `gsg-erp-*`): agregar `TENANT_BRAND_SHEET_ENABLED=on` + **redeploy**.
`erp-ch` (prod, `main`) **no se toca** (esta rama no mergea a main; y el flag es default OFF). Doble red.

## 6. Follow-up (documentado, NO implementado — para el dueño)
- **Columna `Tenant.themeId` (o `brandSheet Json?`)** para override fino del pack por tenant (hoy se deriva
  de `blueprintId`). Migración chica = §C/Gate 2. Un solo punto de cambio en `themeIdForBlueprint`/`getBrandSheet`.
- **Logo asset real** + copy por tenant en DB (hoy nombre/acento/tema/rubro salen de la DB; copy del front
  aún es por rubro/slug).

— RFC-004-D (líder de Diseño, Sesión 4). Piel por datos, detrás de flag. Sin merge (Gate S5).
