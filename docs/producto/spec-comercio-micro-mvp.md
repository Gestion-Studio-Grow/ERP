# 📦 Spec lean — Producto "Comercio Micro" (MVP vendible)

> **Fase 3 · scoping de SOLO LECTURA** (el motor transaccional se arregla en paralelo — no se implementa acá).
> Para firma del consultor funcional. **Ancla de evidencia:** rama `claude/sprint-startup-generic-rf6x0m`,
> archivo:línea reales. **Regla dura:** no onboardear clientes reales hasta las **2 checklists de go-live firmadas**
> (ver §4). **Fecha:** 2026-07-10.

**Definición del producto:** el ERP en edición **Comercio** (perfil `lite`) para un **micro-comercio** de mostrador
(retail/gastronomía de barrio): vende, cobra, controla stock básico, factura y ve sus números — simple, en una sola
persona, sin la superficie de "Empresa".

---

## 1. Módulos del MVP Micro — estado real en el repo

Leyenda: ✅ construido y vivo · 🟡 construido pero **detrás de flag** / parcial · 🔴 falta.

| Módulo | Estado | Evidencia (archivo:línea) |
|---|---|---|
| **POS / venta (mostrador)** | ✅ | `src/app/admin/(dashboard)/pedidos/page.tsx:1-8,26-28` — `getPosData` + `PosForm` + flujo de estados (PENDING→…→DELIVERED) + `setOrderPaid`/`cancelOrder`. Toma de pedido online → bandeja (`src/lib/order-actions.ts`). Venta por peso (kg) existe (ciclo 2). |
| **Catálogo** | ✅ | `src/app/admin/(dashboard)/catalogo/page.tsx` — ABM de productos (core, consumido por POS/vidriera). |
| **Stock básico** | 🟡 | `src/app/admin/(dashboard)/inventario/page.tsx:3,27-39` — `getInventory` (valuación, read-model S1) + `InventoryTable`; **shell "En preparación" si `PROFILES_ENABLED` OFF** (`:30-37`). Piso anti-oversell: `ajustes/page.tsx` (ajustes y mermas) + `compras/page.tsx` (reposición). Ledger en `src/lib/inventario/`. ⚠️ **migración de inventario sin aplicar en Neon** (Gate 2). |
| **Clientes + cuenta corriente (fiado)** | 🟡 | Clientes ✅ `clientes/page.tsx` + `clientes/[id]/page.tsx` (base + detalle). Cuenta corriente/fiado = `cuentas-a-cobrar/page.tsx` (+`[id]`), **construido y cableado a loaders S1 pero gateado igual que inventario** (canal `PROFILES_ENABLED`; `defaultOff` por rubro, ver `src/modules/nav-groups.ts:197-209`). |
| **Caja / arqueo** | ✅ | `src/app/admin/(dashboard)/caja/page.tsx:1-10` — `getCajaData` + `src/lib/caja/cash-register.ts` (`expectedCash`, `summarizeMovements`) + apertura/movimientos/cierre (`CajaForms`). |
| **Facturación ARCA** | ✅ (sandbox) | `src/app/admin/(dashboard)/facturacion/page.tsx:7-15` — `getFacturacion` (ARCA, plugin `src/plugins/arca`, ADR-022) + `estadoCobros` (Mercado Pago). **Corre en sandbox sin credenciales**; real cuando el dueño las carga (`docs/arquitectura/propuesta-activacion-arca-mp.md`). |
| **Reportes simples** | ✅ (excede) | `src/app/admin/(dashboard)/reportes/page.tsx:2-11` — ventas por rango, margen (`reports/margin-loader`), medios de pago, `owner-insights`/`owner-trends`, comisiones. Más que "simple": para Micro conviene una **vista reducida**. |

**Lectura:** el corazón transaccional del Micro (POS, catálogo, caja, facturación, reportes) **ya existe y vive**.
Lo que está 🟡 (stock, fiado) está **construido pero apagado por flag/rubro** y **pendiente de migración en Neon**.
Nada del MVP Micro es 🔴 "desde cero".

---

## 2. Edición "Comercio" (config) — qué la hace un PRODUCTO, no "el ERP con módulos apagados"

**Piezas que YA existen (detrás de flags, default OFF):**
- **Perfil `lite` data-backed:** `src/lib/profile-gating.ts:41-56` (`getActiveProfile` lee `Tenant.profile`, fail-safe `lite`) + `Tenant.profile` en `prisma/schema.prisma:212` + flag `PROFILES_ENABLED` (`src/modules/flags.ts:31-35`). *(Nota: el comentario "la columna no existe" en `nav-groups.ts:118` está DESACTUALIZADO — ya está en el schema.)*
- **Densidad por edición:** `src/lib/profile-density.ts` → Comercio `data-density="lite"` (espacioso, `--density 1.32`); cableado en `admin/(dashboard)/layout.tsx:50,55`.
- **Nav de 5 grupos:** `src/modules/nav-groups.ts` (`NAV_GROUPS`, `NAV_ITEM_GROUPS`) + flag `NAV_GROUPING_ENABLED`; consumido en `AdminShell.tsx:241-245`.
- **Home mode-aware:** `admin/(dashboard)/page.tsx:1,8` — `dashboardModeForModules` → **home retail** (`getRetailDashboardData`) vs agenda.
- **Piel por tenant (ficha de marca):** RFC-004-D — theme pack por rubro (`src/lib/theme-packs.ts`) + `data-brand` (flag `TENANT_BRAND_SHEET_ENABLED`).

**Qué FALTA para que "se sienta un producto coherente" (no ERP recortado):**
1. **Encender el combo Comercio como un solo interruptor** — hoy son 4 flags sueltos (`PROFILES_ENABLED`, `NAV_GROUPING_ENABLED`, `TENANT_BRAND_SHEET_ENABLED`, densidad). Falta un "perfil Comercio = ON" coherente por defecto para el rubro Micro.
2. **Home guiado de Comercio (ADR-059 D8):** el retail dashboard existe, pero falta el home **"una acción ahora"** (pocos números, "cerrá la caja", "cargá tu primer producto") en vez del panel analítico.
3. **Reportes en versión "simple":** una vista reducida (ventas del día/semana, top productos, caja) sin el instrumental Empresa (margen/comisiones/trends).
4. **Naming y vacíos con voz de producto:** "Comercio"/"Empresa" al cliente (nunca lite/enterprise), estados vacíos que guían el alta ("todavía no cargaste productos → cargá el primero").
5. **Ocultar la superficie Empresa** (CxP/Libros/Devoluciones) sin candados que griten "plan barato" (D3: el candado es opt-in de venta, no default).

---

## 3. Flujo de alta / onboarding del Micro (consola de operador — la fábrica de tenants)

**Lo que YA hace la consola** (`src/app/operador/(console)/alta/page.tsx` → `provisionFromConsole`, ADR-019):
crea **tenant + dueño (OWNER) + branding + catálogo del rubro** con estos campos: nombre, slug, ownerName,
ownerEmail, **rubro→blueprint** (o comodín), plan, estado, **`accentPreset`**, **`frontTheme`**, **subdomain**, **módulos**.

**Pasos mínimos para dejar un comercio OPERATIVO (propuesta, con lo que falta marcado 🔴):**
1. **Datos del negocio** — nombre, slug, dueño+email (login). *(existe)*
2. **Rubro → blueprint** — define catálogo semilla + módulos default + **themeId** (pack de marca) derivado. *(existe; el theme se deriva solo)*
3. **Edición** — elegir **Comercio** (perfil `lite`). 🔴 *falta el selector de perfil en el alta (hoy default `lite` implícito).*
4. **Ficha de marca** — acento + tema (existe) **+ 🔴 logo asset + variante de layout + override de themeId** (follow-up RFC-004-D).
5. **Ruteo** — subdomain (existe) **+ 🔴 alta del host en `TENANT_HOST_MAP` de Vercel** (hoy manual; el bug de deploy vino de acá).
6. **Provisionar** → tenant + OWNER + catálogo. *(existe)*
7. **🔴 Post-alta "listo para operar":** sembrar datos demo mínimos (1-2 productos), verificar login del OWNER, confirmar que la vidriera y `/admin` resuelven al tenant correcto. Hoy es verificación manual.

---

## 4. Gaps para "vendible" + orden de construcción

**Gaps concretos (bloqueantes de venta):**
- **G1 · Migraciones Neon pendientes** (inventario/ledger, y `TenantModule` opcional) — sin esto, stock/fiado no operan en prod. *(Gate 2, dueño.)*
- **G2 · Combo "edición Comercio"** — un default coherente de flags por rubro Micro (§2.1).
- **G3 · Home guiado + reportes simples** (§2.2/2.3) — lo que separa "producto" de "ERP recortado".
- **G4 · Ficha de marca completa en el alta** (logo/layout/themeId) + **selector de perfil** (§3.3-3.4).
- **G5 · Onboarding operativo end-to-end** — host-map + post-alta + verificación (§3.5-3.7); hoy el ruteo a Vercel es manual y frágil.
- **G6 · Facturación real** — cargar credenciales ARCA/MP por tenant (hoy sandbox).
- **G7 · Las 2 checklists de go-live firmadas** — QA de staging (`docs/runbooks/qa-preview-empresa-2026-07-08.md`, `qa-staging-vercel.md`) + seguridad pre-cobro (`docs/seguridad/ANALISIS-ESTRATEGICO-SEGURIDAD.md`, los 2 rojos: rotar secretos + PITR). **Sin las dos firmadas, no se onboardea cliente real.**

**Orden de construcción sugerido (apoyado en Fase 1 endurecida):**
1. **G1** — aplicar migraciones en Neon (desbloquea stock/fiado). *(dueño)*
2. **G2** — encender la edición Comercio como combo por rubro (bajo flag; reversible).
3. **G3** — home guiado + reportes simples (la coherencia de producto).
4. **G4 + G5** — completar el alta (ficha de marca + perfil) y el onboarding operativo (host-map + post-alta).
5. **G6** — activación fiscal real por tenant (cuando haya cliente concreto).
6. **G7** — correr y **firmar las 2 checklists** → recién ahí, onboarding de cliente real.

> **Nota de dependencia (Fase 1):** el hardening de producción ya está en main (rate-limit logins, firma webhook MP,
> vallas `npm run gates`/`load-test`, RLS enforced multi-tenant). El MVP Micro se apoya sobre eso; las 2 checklists
> de §G7 son el gate final antes de cobrar.

---

**Para firma del consultor funcional** — marcar acuerdo por sección:
- [ ] §1 Alcance de módulos del MVP Micro (7) y su estado real.
- [ ] §2 Definición de la edición Comercio y qué la hace producto.
- [ ] §3 Flujo de alta/onboarding mínimo.
- [ ] §4 Gaps + orden de construcción + gate de las 2 checklists.

— Spec de scoping (Sesión 4, Diseño/Producto). Solo lectura; sin implementación. Sujeto a Gate S5.
