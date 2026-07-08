# ADR-059: Reingeniería de interfaz del backoffice — GROW-AR (perfil, densidad, "crecé sin migrar")

**Estado:** Aceptado **con los cambios del Challenger** (ADR-045: propone → desafía → síntesis). Síntesis del
panel de expertos 2026-07-08 (Diseño & Marca · Arquitecto de Solución · PO del Catálogo/Plugins · Growth),
**tensionada y corregida por el Challenger** (ver §Challenger al final — 3 fixes bloqueantes incorporados).
Convocado para reingeniar la UI del backoffice al bajar la filosofía GROW-AR (ADR-058) a la interfaz.
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

### D1 · El PERFIL es una dimensión ORTOGONAL — resolución espeja módulos, comportamiento es NUEVO
`lite`/`enterprise` se **resuelven** con el patrón de módulos (predicado puro client-safe + server-side +
flag): `perfilGateAllows(itemPerfilMin, activeProfile)`, `getActiveProfile()` en `src/lib/profile-gating.ts`,
flag **`PROFILES_ENABLED`** (default OFF → `null` → nav legada intacta), perfil **en memoria** (default
`"lite"` + override por `slug` para demo). La nav pasa a **tres ejes**: `rol × módulo × perfil`.
- **⚠️ Aviso (fix Challenger #1):** el gating de módulos **esconde**; el perfil (D3) **muestra bloqueado**.
  Por eso el perfil **NO es un "gemelo probado"** — la *resolución* se reusa, pero el *comportamiento* (item
  locked, teaser, `UpgradeSheet`) es **nuevo**, con su propio riesgo de UX/accesibilidad. No se vende como
  continuidad probada; se testea como cosa nueva.
- **Reversible:** todo lo anterior (código + flag, cero DB).
- **§C · Gate 2:** persistir el perfil = **columna `Tenant.profile`** (enum, default `"lite"`, aditiva) —
  hoy **no existe** en el schema; la propone **Data/DBA** y la aprueba el dueño. **No** se reusa `modules[]`
  como sentinela (antipatrón DX-6). El perfil vive en memoria hasta que una venta justifique persistirlo.

### D2 · Invariante `enterprise ⊇ lite` — DOS invariantes, no confundirlos (fix Challenger #2, bloqueante)
Hay que separar dos cosas que la primera versión mezclaba peligrosamente (lección DX-6/DX-7: la UI "carga
bien" y el **dato** miente):
- **(a) Invariante de NAV (se testea ya):** el predicado hace a `enterprise` superconjunto de los ítems
  visibles de `lite`. Se extrae el filtro inline a `visibleNavItems(items, {role, activeModules,
  activeProfile})` y se cubre con un **property-test** (`src/modules/perfil.test.ts`): ∀ rol × subset de
  módulos, `visibleNavItems(...lite) ⊆ visibleNavItems(...enterprise)`. **Esto es un test de humo de
  navegación — NO la valla de "crecé sin migrar".**
- **(b) Invariante de DATO (la valla REAL, aún sin construir):** "crecés sin migrar, sin perder un dato" es
  una promesa sobre **datos, campos, pasos y persistencia**, no sobre nav. Esa valla —un test/QA de que un
  tenant que sube de perfil **conserva todos sus datos y pasos**— **se construye cuando exista la persistencia
  de perfil** (§C), y es exactamente donde DX-6/DX-7 nos mordieron. **Hasta que exista, este ADR NO afirma que
  el invariante esté "blindado":** el de nav está cubierto; el de dato es deuda declarada, a cubrir en el hito
  de persistencia (M4/§C) con verificación **por entidad**, no en agregado (lección DX-7).

### D3 · IA de navegación — 5 grupos criollos, enterprise-only INLINE con candado
La nav plana se agrupa estilo Fiori (Spaces/Pages) **argentinizado**, con nombres criollos:
**"Día a día" · "Clientes y avisos" · "Lo que vendo y repongo" · "Plata y papeles" · "Configuración".**
- **Ítems `enterprise-only`:** viven **en su grupo funcional** (no en un grupo aparte). Para un tenant
  `lite` **no se renderizan por defecto** (ver candado abajo).
- **⚠️ Candado/teaser DEFAULT OFF en lite (fix Challenger #4, bloqueante — resuelve la contradicción con
  D7).** Sembrar la nav del micro de candados **es** decirle "estás en el plan barato" — la misma herida que
  D7 evita. Por eso: por defecto el micro **NO ve candados**; los ítems enterprise-only simplemente no
  aparecen (como hoy esconde el gating de módulos). El camino de crecimiento se ofrece con **un solo punto de
  entrada discreto** ("¿tu negocio creció? Conocé la edición Empresa"), no con locks por toda la nav. El
  teaser por-ítem con candado es **opt-in explícito** del tenant/venta, nunca default.
- **MP-14 respetado:** *oculto-por-rol/capability* (seguridad) → nunca se renderiza; *off-por-perfil* →
  tampoco se renderiza por default (fix #4); el único acceso al upgrade es el punto de entrada discreto, que
  abre un `UpgradeSheet` informativo (cero click muerto, cero ruta protegida tocada).

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

### D6 · Primitivos nuevos token-driven — 7 primitivos + `DataTable` en hito aparte (fix Challenger #5)
`PageHeader` (reemplaza el header pobre), `SectionGroup`, `NavItem` (3 estados: activo/normal/locked),
`KpiTile`, `EmptyState`, `ProfileBadge`, `UpgradeSheet`. Se **reusan tal cual** `Card/Button/Badge/Field/
Heading`. Cada uno consume tokens (cero hex suelto) y cumple los 7 ángulos SAP Fiori + ángulo argentino
(labels/ARIA reales, estado por texto+forma no solo color, foco doble anillo, criollo).
- **⚠️ `DataTable` NO es un primitivo, es un subsistema (fix #5):** grilla accesible + responsive + densa
  (orden, paginación, ARIA, teclado, dos densidades) es de lo más difícil de hacer bien. Sale de "los 8" y
  va a **su propio hito con Gate propio y presupuesto de accesibilidad explícito**, auditado en las dos
  densidades. No entra en el PR de primitivos.

### D6b · Mapa de solapamiento ROL ↔ PERFIL antes de gatear (fix Challenger #6)
`auditoria`/`usuarios`/`localizacion` **ya se gatean por rol/capability** (un micro single-OWNER ya no ve
"Usuarios" útil). **Regla:** un ítem se marca `perfilMin` **solo si el rol/capability NO expresa ya la
distinción** — nada de doble gating del mismo intento. Antes de agregar `perfilMin` se hace el **mapa
rol↔perfil** (qué distinción ya hace el rol vs. qué agrega el perfil); si el rol ya lo cubre, el ítem **no**
recibe `perfilMin`. Evita complejidad nueva para algo que el RBAC ya dice.

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
- **Experiencia diferenciada (UI genuinamente reversible):** home analítico por rol vs. home curado de una
  acción; demo sobre un tenant de **su** rubro/tamaño (nunca la carnicería) y con **su** marca/subdominio
  (costo cero, ADR-030) — todo **aditivo**, jamás quitando del lite.
  > **⚠️ Fuera de este ADR (fix Challenger #3, bloqueante):** el **switcher multi-sucursal** NO es UI
  > reversible — "sucursal" **no existe** como entidad en el modelo de datos (hoy: 3 roles, sin sucursal).
  > Presentarlo como reversible escondería modelado irreversible (ADR-048: ante la duda, irreversible). Va a
  > un **ADR/hito aparte** (definir ≠ construir, como ADR-058 hace con el motor), no acá.
- **Prueba social segmentada:** casos/logos por tamaño en superficies separadas; hasta tener caso mediano,
  vender **rigor de proceso** ("implementación acompañada", "multi-sucursal", "SLA"), no cantidad de chicos.
- **Servicio como diferencial percibido** — atado a `costos §4`: implementación acompañada sí; **SLA
  firmable / guardia 24/7 / dominio pago se ELEVAN** (§C, comprometen mano de obra del equipo de 3), no van
  como default de landing.
- **⚠️ Válvula de capacidad humana (fix Challenger #7):** cada enterprise que el packaging atrae **compromete
  X horas/semana del equipo de 3** → dispara la **advertencia de `costos §4`** y una **decisión explícita** de
  capacidad ANTES de comprometer la venta. El packaging que atrae demanda sin esta válvula empuja lo que el
  equipo no puede sostener. La objeción de estatus es parte cosmética (la resuelve el packaging) y parte
  **estructural** (SLA/referencias de su tamaño/integración fiscal/due-diligence) que el packaging **NO**
  resuelve — esas se atienden caso por caso, no se declaran ganadas.
- **Reencuadre "plataforma, no app":** "la misma plataforma que opera a escala" es **fortaleza** (AWS/
  Salesforce), no debilidad. Copy: *"no es una app que se te queda chica: es la plataforma que crece con
  vos — arrancás en Comercio y el día que abrís tu segunda sucursal encendés Empresa, sin migrar, sin
  perder un dato."*
- **Anti-patrones prohibidos:** una sola tabla con $9.900 al lado de Empresa · filtrar "lite" en el copy ·
  demo de Empresa sobre la carnicería o en `vercel.app` genérico · presumir volumen downmarket al enterprise
  · **forkear un "producto enterprise"** (rompe `enterprise ⊇ lite`, duplica mantenimiento, dispara mano de obra).

### D9 · Módulos del catálogo que faltan — BACKLOG, NO en este ADR (fix Challenger #3)
El PO identificó descriptores faltantes: **`cobros`** (eslabón "cobrar" del lite), **perfiles dentro de
`arca`** (factura C ↔ A/B/NC), **`compras`**, **`cuentas-a-cobrar`** (el caso J59), **`inventario`**,
formalizar **`usuarios`/`auditoria`**. **Pero varios traen ENTIDADES DE DATOS QUE NO EXISTEN** (`cuentas-a-
cobrar`, `inventario`, sucursal) → **no son reingeniería de interfaz**. Este ADR **solo los nombra como
backlog**; su diseño es **reingeniería aparte** (definir ≠ construir), cada uno con su ADR, su migración
**§C · Gate 2** (Data/DBA) y el principio de variante (objeto maestro + asignación, ADR-055, nunca "a todos
con todo"). **Este ADR-059 se queda con lo genuinamente reversible de UI: agrupación de nav, tokens de
densidad, primitivos de presentación.**

## Ejecución (reversible con su Gate; §C se eleva) — atada a M1–M5 del roadmap

> **Prioridad (fix Challenger #8, norma P1/P2/P3 de `CLAUDE.md`):** esta reingeniería es mayormente **P3
> (cosmética/estructural interna)**. En congestión **cede** ante **P1** (demos, tenants que faltan) y, sobre
> todo, ante el **cuello real que `costos §4` señala y este ADR NO toca: el alta auto-servible (preset-IA,
> ADR-034)**. Pulir el shell no mueve la aguja del self-serve; se hace cuando no compite con lo que vende.

| PR | Hito | Prioridad | Contenido | Naturaleza | Gate |
|---|---|---|---|---|---|
| **PR-1** | M1 | P3 | `Perfil` + `perfilGateAllows` + `PROFILES_ENABLED` + `getActiveProfile` (memoria) + `visibleNavItems` puro + **property-test de NAV** (D2a). Sin UI visible (flag OFF). | Reversible | obligatorio |
| **PR-2** | M1→M2 | P3 | mapa rol↔perfil (D6b) → `perfilMin` en `ALL_ITEMS`; filtro triple + agrupación 5-grupos; tokens `--density`/`--space-*` aditivos; `PageHeader`/`SectionGroup`/`ProfileBadge`; punto de entrada discreto de upgrade + `UpgradeSheet` (candados **default OFF**, D3). | Reversible | Gate completo |
| **PR-3** | M2 | P3 | Set `lite` por rubro (servicios/carnicería/genérico); `KpiTile`/`EmptyState`; UI Comercio limpia. | Reversible | Gate |
| **PR-4** | M3 | P3 | Set `enterprise` aditivo (`perfilMin:"enterprise"`). **Toda entidad/tabla nueva (`cuentas-a-cobrar`, `inventario`, sucursal) → ADR aparte + §C, NO acá.** | Reversible (UI) | Gate |
| **hito propio** | M3+ | P3 | **`DataTable`** (subsistema, no primitivo) con presupuesto de a11y y auditoría en dos densidades (fix #5). | Reversible | Gate propio |
| **PR-5** | M4 | P3 | Upgrade en demo (perfil en memoria → enciende Empresa). **Persistencia (`Tenant.profile`) + switch real + valla de DATO (D2b) = §C.** | Demo reversible; real §C | Gate + QA |
| paralelo | M5 | **P1/P3** | Hardening por código (P1-adyacente); naming/packaging de ediciones + precios separados (P1 comercial). | Reversible; Neon pago/deploy/SLA §C | Gate |

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

## Challenger — crítica incorporada (ADR-045: propone → desafía → síntesis)

El Challenger red-team la propuesta y emitió **"se adopta con cambios"** (3 bloqueantes). Todos incorporados:

| # | Crítica del Challenger | Cómo quedó resuelto |
|---|---|---|
| 1 | "gemelo probado" oculta un comportamiento nuevo (show-locked ≠ hide) | **D1** — aviso explícito: la resolución se reusa, el comportamiento es nuevo y se testea como tal |
| 2 🔴 | el property-test mide nav, no dato; falsa valla de "crecé sin migrar" (DX-6/DX-7) | **D2** partido en (a) invariante de NAV (test de humo, ya) y (b) invariante de DATO (la valla real, §C/M4, por entidad) |
| 3 🔴 | contrabando de modelo de datos (multi-sucursal, `cuentas-a-cobrar`, `inventario`) como "UI reversible" | **D8/D9** — sacados de este ADR a hito/ADR aparte (definir ≠ construir); ADR-059 se queda con UI genuinamente reversible |
| 4 🔴 | candados default-ON contradicen D7 ("lite es veneno") y ahuyentan al micro | **D3** — candados **default OFF**; upgrade por **un punto de entrada discreto**, opt-in |
| 5 | `DataTable` no es primitivo, es subsistema | **D6** — sale de "los 8", hito propio con Gate y presupuesto de a11y |
| 6 | rol ya cubre parte de lo que el perfil pretende (auditoría/usuarios/localización) | **D6b** — mapa rol↔perfil obligatorio antes de gatear; no doble gating |
| 7 | D8 ignora la válvula de capacidad humana de `costos §4` | **D8** — válvula agregada: cada enterprise dispara la advertencia de horas + decisión explícita |
| 8 | falta prioridad P1/P3; esto es P3, el cuello real (self-serve/preset-IA) queda sin tocar | **Ejecución** — marcado P3; cede ante P1 y ante el self-serve, que este ADR no resuelve |

**Antítesis de fondo que se acepta como límite:** un solo Core en dos perfiles es válido **para UI y
packaging**; NO pretende resolver la objeción enterprise **estructural** (SLA firmable, referencias de su
tamaño, integración fiscal, due-diligence) ni el **cuello de mano de obra** (equipo de 3). Esos son límites
reconocidos, no resueltos por este ADR.

## Alcance
Reingeniería de **interfaz + packaging** (reversible/doc + PRs detrás de flag, mayormente **P3**). Lo §C
(columna de perfil, tablas de módulos/entidades nuevas, SLA/guardia/dominio pago, deploy, Neon pago) se
**eleva al dueño**, no se ejecuta. El motor de perfiles (`ScopeItem` con ABM) y las entidades nuevas son
**reingeniería posterior** (definir ≠ construir).

— Elaborado por GSG (PMO — síntesis del panel Diseño & Marca · Arquitecto · PO Catálogo/Plugins · Growth,
tensionada por el Challenger, ADR-045)
