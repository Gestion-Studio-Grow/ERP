# ADR-059: Reingeniería de interfaz del backoffice — GROW-AR (perfil, densidad, "crecé sin migrar")

**Estado:** Propuesto — **pendiente de pasar el Challenger** (ADR-045; se marca Aceptado al incorporar su
crítica). Síntesis del panel de expertos 2026-07-08 (Diseño & Marca · Arquitecto de Solución · PO del
Catálogo/Plugins · Growth), convocado para reingeniar la UI del backoffice al bajar la filosofía GROW-AR
(ADR-058) a la interfaz.
**Fecha:** 2026-07-08
**Depende de:** ADR-058 (filosofía GROW-AR), ADR-054/055 (módulos + variante), ADR-002 (Core/Blueprint/Plugin)
**Relacionado:** ADR-043 (sello/no-colisión de marca), ADR-044 (argentinizar), ADR-046 (de-sesgo), ADR-030
(DEMO→VENTA→INVERSIÓN), ADR-040 (Gate), ADR-048 (reversible/§C) · `docs/estrategia/roadmap-dos-modelos.md`
· `docs/estrategia/costos-por-segmento.md` · maqueta `scratchpad/maqueta-dos-modelos.html`

---

## Contexto

Al rediseñar el producto (ADR-058: un Core, dos motores `lite`/`enterprise`, "crecé sin migrar"), la
interfaz del backoffice tiene que materializar esa filosofía. Hoy el shell (`AdminShell.tsx`) tiene una
**nav plana de 17 ítems** gateada por **rol × módulo**; el sistema de tokens (`globals.css`) es sólido
(capa semántica por rol, dual-theme Nocturne, **accent por tenant**). Falta: la **dimensión perfil**, una
**IA agrupada** estilo Fiori argentinizado, la **affordance de crecimiento**, y —crítico para vender— que
el cliente **enterprise no rechace** el producto por percibir que "es el mismo que usa un comerciante".

El panel calibró sobre el código real y produjo una propuesta convergente. Este ADR la fija.

## Decisiones

### D1 · El PERFIL es una dimensión ORTOGONAL, espejo del gating de módulos
`lite`/`enterprise` se resuelven con el **mismo patrón ya probado** de módulos: predicado puro client-safe
+ resolución server-side + flag. Nuevo `perfilGateAllows(itemPerfilMin, activeProfile)` (gemelo de
`moduleGateAllows`), `getActiveProfile()` en `src/lib/profile-gating.ts`, flag **`PROFILES_ENABLED`**
(default OFF → `null` → nav legada intacta). El perfil se resuelve **en memoria** (default `"lite"` +
override por `slug` para demo). La composición de la nav pasa a **tres ejes**: `rol × módulo × perfil`.
- **Reversible:** todo lo anterior (código + flag, cero DB).
- **§C · Gate 2:** persistir el perfil = **columna `Tenant.profile`** (enum, default `"lite"`, aditiva) —
  hoy **no existe** en el schema; la propone **Data/DBA** y la aprueba el dueño. **No** se reusa `modules[]`
  como sentinela (antipatrón DX-6). El perfil vive en memoria hasta que una venta justifique persistirlo.

### D2 · Invariante `enterprise ⊇ lite` — por construcción + property-test
El predicado hace a `enterprise` **superconjunto estructural** de `lite` (solo agrega los `enterprise-only`;
nunca quita). Se extrae el filtro inline del shell a una función pura `visibleNavItems(items, {role,
activeModules, activeProfile})` y se blinda con un **property-test** (`src/modules/perfil.test.ts`): para
todo rol × subset de módulos, `visibleNavItems(...lite) ⊆ visibleNavItems(...enterprise)`. Si alguien marca
un ítem de forma que "quite" algo del lite, el test se pone **rojo**. Es la valla de "crecé sin migrar".

### D3 · IA de navegación — 5 grupos criollos, enterprise-only INLINE con candado
La nav plana se agrupa estilo Fiori (Spaces/Pages) **argentinizado**, con nombres criollos:
**"Día a día" · "Clientes y avisos" · "Lo que vendo y repongo" · "Plata y papeles" · "Configuración".**
- **Resolución de la tensión del panel:** los ítems `enterprise-only` **NO van en un grupo separado**
  ("Se enciende con enterprise"); viven **en su grupo funcional** y, para un tenant `lite`, se muestran
  **bloqueados con candado + copy "se enciende al crecer"** (no navegables). Así el comerciante ve el
  **camino de crecimiento dentro de su propia pantalla** — la promesa hecha UX — en vez de esconderlo.
- **MP-14 respetado y afinado:** *oculto-por-rol/capability* (seguridad) → **nunca se renderiza**;
  *disponible-pero-off-por-perfil* → teaser bloqueado que abre un `UpgradeSheet` informativo (cero click
  muerto, cero ruta protegida tocada). El teaser es **configurable por tenant** (default: mostrar en lite).

### D4 · Un solo design system, DOS densidades
Se **honra** el sistema de tokens existente (no se reemplaza). Se agrega un token **`--density`** y una
escala `--space-*` derivada, **aditivos** y **ortogonales** a tema/accent:
`:root{--density:1}` (enterprise, denso/data-first) · `[data-density="lite"]{--density:1.32}` (micro,
espacioso). El layout aplica `data-density` junto a `data-theme`. Mismos componentes, distinta densidad —
esto **es** "un Core, dos motores" a nivel visual. **Pisos duros no escalables:** área táctil 44px y
contraste AA no bajan con la densidad.

### D5 · El TIER se señaliza en canal NEUTRO, nunca con color (regla dura)
El color de acento es **del tenant** (ADR-043 no-colisión). El perfil **jamás** se señaliza con color de
acento: solo con **texto + forma neutra** (`ProfileBadge` con `--line-strong`/`--text-muted`, badge de
candado neutro). El celeste/ochre de la maqueta es **lenguaje de marketing**, confinado al material de
venta — **fuera del backoffice del tenant**. *(Esto refuerza D8: el enterprise ve SU marca dominando la
pantalla, no un "color de comerciante".)*

### D6 · Ocho primitivos nuevos, todos token-driven
`PageHeader` (reemplaza el header pobre), `SectionGroup`, `NavItem` (3 estados: activo/normal/locked),
`KpiTile`, `DataTable`, `EmptyState`, `ProfileBadge`, `UpgradeSheet`. Se **reusan tal cual** `Card/Button/
Badge/Field/Heading`. Cada primitivo consume tokens (cero hex suelto) y cumple los 7 ángulos SAP Fiori +
ángulo argentino (labels/ARIA reales, estado por texto+forma no solo color, foco doble anillo, criollo).

### D7 · Naming comercial: "Comercio" / "Empresa" — `lite`/`enterprise` NUNCA de cara al cliente
`lite`/`enterprise` son **nombres de ingeniería** (perfil del `ScopeItem`). El cliente ve **ediciones**:
**"[Producto] Comercio"** (perfil lite) y **"[Producto] Empresa"** (perfil enterprise). "Lite/básico" al
cliente es veneno (lee "de segunda"). Precio **público self-serve** en Comercio; **"pedí tu propuesta"**
(sales-assisted, sin número público) en Empresa — patrón Shopify Plus / SAP RISE.
> **Alerta de marca:** el nombre comercial del producto **no** debe ser literalmente "Grow" (es marca de
> SAP → confusión). "GROW-AR" es codename interno; el nombre madre lo define la **sesión de branding**.

### D8 · Estrategia anti-rechazo del enterprise (la objeción de estatus)
El riesgo: el enterprise rechaza "el sistema del kiosco". El invariante D2 lo hace **falso por
construcción** (el enterprise solo ve *más*, nunca la pantalla del comerciante); el trabajo es que **se
perciba** así, con **packaging + experiencia + servicio**, nunca forkeando:
- **Experiencia diferenciada (UI, reversible):** home analítico por rol vs. home curado de una acción;
  switcher multi-sucursal; módulos avanzados encendidos; demo sobre un tenant de **su** rubro/tamaño (nunca
  la carnicería) y con **su** marca/subdominio (costo cero, ADR-030) — todo **aditivo**, jamás quitando del lite.
- **Prueba social segmentada:** casos/logos por tamaño en superficies separadas; hasta tener caso mediano,
  vender **rigor de proceso** ("implementación acompañada", "multi-sucursal", "SLA"), no cantidad de chicos.
- **Servicio como diferencial percibido** — atado a `costos §4`: implementación acompañada sí; **SLA
  firmable / guardia 24/7 / dominio pago se ELEVAN** (§C, comprometen mano de obra del equipo de 3), no van
  como default de landing.
- **Reencuadre "plataforma, no app":** "la misma plataforma que opera a escala" es **fortaleza** (AWS/
  Salesforce), no debilidad. Copy: *"no es una app que se te queda chica: es la plataforma que crece con
  vos — arrancás en Comercio y el día que abrís tu segunda sucursal encendés Empresa, sin migrar, sin
  perder un dato."*
- **Anti-patrones prohibidos:** una sola tabla con $9.900 al lado de Empresa · filtrar "lite" en el copy ·
  demo de Empresa sobre la carnicería o en `vercel.app` genérico · presumir volumen downmarket al enterprise
  · **forkear un "producto enterprise"** (rompe `enterprise ⊇ lite`, duplica mantenimiento, dispara mano de obra).

### D9 · Módulos del catálogo que faltan (backlog del PO)
Para el circuito completo faltan descriptores: **`cobros`** (medios de pago en caja, eslabón "cobrar" del
lite), **perfiles dentro de `arca`** (factura C lite ↔ A/B/NC enterprise), **`compras`** (hoy cuelga de
`catalog:manage`), **`cuentas-a-cobrar`** (el caso J59, inexistente), **`inventario`** (stock/merma), y
formalizar **`usuarios`/`auditoria`** como descriptores enterprise. Cada uno = objeto maestro + asignación
(ADR-055), **nunca "a todos con todo"**. Las tablas que traigan son **§C · Gate 2** (Data/DBA).

## Ejecución (reversible con su Gate; §C se eleva) — atada a M1–M5 del roadmap

| PR | Hito | Contenido | Naturaleza | Gate |
|---|---|---|---|---|
| **PR-1** | M1 | `Perfil` + `perfilGateAllows` + `PROFILES_ENABLED` + `getActiveProfile` (memoria) + `visibleNavItems` puro + **property-test del invariante**. Sin UI visible (flag OFF). | Reversible | obligatorio |
| **PR-2** | M1→M2 | `perfilMin` en `ALL_ITEMS`; filtro triple + agrupación 5-grupos + `NavItem` locked + `UpgradeSheet`; `activeProfile` en `layout.tsx`; tokens `--density`/`--space-*` aditivos; `PageHeader`/`SectionGroup`/`ProfileBadge`. | Reversible | Gate completo |
| **PR-3** | M2 | Set `lite` por rubro (servicios/carnicería/genérico); `KpiTile`/`EmptyState`; UI Comercio limpia. | Reversible | Gate |
| **PR-4** | M3 | Set `enterprise` aditivo (`perfilMin:"enterprise"`); `DataTable`. Toda tabla nueva → **§C aparte**. | Reversible (UI); DB=§C | Gate |
| **PR-5** | M4 | Upgrade en demo (perfil en memoria → enciende Empresa). **Persistencia (`Tenant.profile`) + switch real = §C.** | Demo reversible; real §C | Gate + QA |
| paralelo | M5 | Hardening por código + naming/packaging de ediciones + páginas de precio separadas. | Reversible; Neon pago/deploy/SLA §C | Gate |

**Blast radius.** *Crea:* `src/modules/perfil.ts`(+test), `src/lib/profile-gating.ts`, los 8 primitivos.
*Edita:* `AdminShell.tsx`, `layout.tsx`, `src/modules/flags.ts`+`index.ts`, `globals.css` (tokens aditivos).
*NO toca:* la fundación de módulos (`contract/registry/activation/catalog/vista/gating`), `capabilities.ts`
(perfil ≠ rol), **`prisma/schema.prisma` (INTACTO — la columna de perfil es §C)**, datos reales / Neon.

## Consecuencias
- **(+)** La filosofía GROW-AR se ve y se opera; "crecé sin migrar" es UX + regla de arquitectura testeada.
- **(+)** El enterprise no rechaza por percepción: el invariante lo hace falso, el packaging lo hace sentir suyo.
- **(+)** Un solo design system honrado; blast radius chico; todo reversible hasta el motor de perfiles (M1).
- **(−)** Disciplina permanente: diferenciar enterprise **solo** encendiendo/densificando el superconjunto
  (nunca quitando ni forkeando) — el property-test es la valla.
- **(−)** El motor de perfiles (`ScopeItem` con ABM) sigue siendo **reingeniería pendiente** (definir ≠
  construir); este ADR fija el marco de UI + el plan, no entrega el motor.

## Alcance
Reingeniería de **interfaz + packaging** (reversible/doc + PRs detrás de flag). Lo §C (columna de perfil,
tablas de módulos nuevos, SLA/guardia/dominio pago, deploy, Neon pago) se **eleva al dueño**, no se ejecuta.

— Elaborado por GSG (PMO — síntesis del panel: Diseño & Marca · Arquitecto · PO Catálogo/Plugins · Growth)
