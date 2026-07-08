# 🗺️ Mapa rol↔perfil + 5 grupos criollos de nav (PR-2/M2, ADR-059 D3/D6b)

> **Qué es:** el mapa de solapamiento **rol↔perfil** que exige ADR-059 D6b (fix Challenger #6) —
> "¿el rol/capability YA expresa la distinción lite/enterprise, o hace falta `perfilMin`?" —
> aplicado a los 17 ítems HOY existentes en `AdminShell.ALL_ITEMS`, más la agrupación en los
> **5 grupos criollos** que fija ADR-059 D3. Es el trabajo de **Sesión 4** (Ingeniería de
> interfaz — navegación) del sprint GROW-AR 2026-07-08.
>
> **Estado: DRAFT — NO cerrado.** La asignación de los 17 ítems existentes es de bajo riesgo
> (grupo funcional obvio) y se puede aplicar tal cual. La asignación **fina** de los scope
> items de **backlog** (cuentas-a-cobrar, inventario, compras formal, cuentas-a-pagar,
> contabilidad, activos/banco) depende del **mapa validado de Sesión 1** (analista de
> cobertura, `docs/estrategia/mapa-cobertura-scope-items.md`) — no se cierra hasta que llegue.
>
> **Código:** `src/modules/nav-groups.ts` (+ `nav-groups.test.ts`, 7 tests verdes). Skeleton
> puro, **no wired** a `AdminShell.tsx` todavía (cero riesgo de conflicto con S2/S3).

---

## 1. Los 5 grupos criollos (ADR-059 D3 — ya decidido, no se reabre acá)

| # | id | Label criollo | Qué agrupa |
|---|---|---|---|
| 1 | `dia-a-dia` | **Día a día** | lo operativo diario: agenda, mostrador, caja |
| 2 | `clientes-y-avisos` | **Clientes y avisos** | base de clientes + comunicación (recordatorios, reseñas) |
| 3 | `lo-que-vendo-y-repongo` | **Lo que vendo y repongo** | catálogo + reposición/compras |
| 4 | `plata-y-papeles` | **Plata y papeles** | facturación, reportes, (backlog: cobros/pagos/contable) |
| 5 | `configuracion` | **Configuración** | ajustes, auditoría, usuarios, localización, módulos |

---

## 2. Mapa rol↔perfil de los 17 ítems existentes (D6b)

**Pregunta por fila:** ¿el rol/capability actual ya alcanza para expresar quién ve esto, o hace
falta además un candado de perfil (`perfilMin`)?

| Ítem (href) | Cap / rol actual | ¿Rol ya expresa la distinción? | Grupo (draft) | `perfilMin` |
|---|---|---|---|---|
| `/admin` Dashboard | `dashboard:read` — OWNER+RECEPTION | Sí (por función, no por tamaño) | Día a día | — (lite) |
| `/admin/turnos` Agenda | `agenda:read` — los 3 roles | Sí | Día a día | — (lite) |
| `/admin/espera` Lista de espera | `waitlist:manage` — OWNER+RECEPTION | Sí | Día a día | — (lite) |
| `/admin/pedidos` Pedidos | `orders:read` — OWNER+RECEPTION | Sí | Día a día | — (lite) |
| `/admin/caja` Caja | `orders:read` — OWNER+RECEPTION | Sí | Día a día | — (lite) |
| `/admin/clientes` Clientes | `clients:read` — OWNER+RECEPTION | Sí | Clientes y avisos | — (lite) |
| `/admin/recordatorios` Recordatorios | `reminders:manage` — solo OWNER | Sí (config fina, no tamaño) | Clientes y avisos | — (lite) |
| `/admin/resenas` Reseñas | `reviews:manage` — solo OWNER | Sí | Clientes y avisos | — (lite) |
| `/admin/catalogo` Catálogo | `catalog:manage` — solo OWNER | Sí | Lo que vendo y repongo | — (lite) |
| `/admin/compras` Compras | `catalog:manage` — solo OWNER | **No del todo** — ver §3 | Lo que vendo y repongo | ⏳ **PENDING S1** |
| `/admin/facturacion` Facturación | `billing:manage` — solo OWNER | Sí | Plata y papeles | — (lite) |
| `/admin/reportes` Reportes | `reports:read` — solo OWNER | Sí | Plata y papeles | — (lite) |
| `/admin/ajustes` Ajustes | `catalog:manage` — solo OWNER | Sí | Configuración | — (lite) |
| `/admin/auditoria` Auditoría | `audit:read` — solo OWNER | Sí (ya lo cubre el rol) | Configuración | — (lite) |
| `/admin/usuarios` Usuarios | `users:manage` — solo OWNER | Sí (un micro single-OWNER igual lo ve, pero no molesta) | Configuración | — (lite) |
| `/admin/localizacion` Localización | `location:manage` — solo OWNER | Sí | Configuración | — (lite) |
| `/admin/modulos` Módulos | `modules:manage` — solo OWNER | Sí | Configuración | — (lite) |

**Conclusión clave:** ninguno de los 17 ítems existentes necesita `perfilMin:"enterprise"` hoy.
Coincide con `mapa-cobertura-scope-items.md` §4: la nav actual **ya es**, casi entera, el piso
`lite` que el micro necesita para operar de punta a punta (vender → cobrar → facturar) + su
configuración. Esto es consistente con el invariante `enterprise ⊇ lite` (ADR-058 P3): hoy todo
vive en el subconjunto lite, y lo enterprise-only llega **aditivamente** con el backlog de
scope items (§3), no restando nada de lo que ya existe.

---

## 3. Pendiente de cerrar cuando llegue el mapa validado de S1

### 3.1 · Compras (`/admin/compras`) — el único caso ambiguo de los 17 existentes
`mapa-cobertura-scope-items.md` clasifica **Compras** (scope SAP J45/18J) como 🔵
**enterprise/pyme** ("el micro repone a ojo" — no lo necesita). Pero la página **ya existe y
ya la usa cualquier tenant con inventario** (ledger F1b/F2, ya en `main`) — no es un mock. Antes
de marcarla `perfilMin:"enterprise"` hay que confirmar con el mapa validado de S1 si el micro
real (carnicería, pádel, velas) la sigue necesitando tal cual o si es genuinamente prescindible
para el lite. **No se decide en este documento.**

### 3.2 · Scope items de backlog que se convertirán en ítems de nav nuevos
De `mapa-cobertura-scope-items.md` §3-4, candidatos a nav nueva (perfil/grupo **a confirmar con
el mapa validado de S1**, hoy son solo hipótesis de trabajo para no arrancar de cero):

| Scope SAP | Ítem de nav (hipotético) | Grupo candidato | Perfil candidato |
|---|---|---|---|
| J60/2F3 | Cuentas a cobrar (fiado) | Plata y papeles | enterprise |
| J59 | Cuentas a pagar (proveedores) | Plata y papeles | enterprise |
| J58 | Contabilidad simple (libro mayor exportable) | Plata y papeles | enterprise |
| BMC | Inventario (stock + recuento + merma) | Lo que vendo y repongo | enterprise |
| J62 / BFA / 1W0 | Activos + banco (básico) | Configuración o Plata y papeles (a definir) | enterprise |

Estas filas **no** están en `BACKLOG_SCOPE_ITEM_NAV` (`src/modules/nav-groups.ts`) todavía —
ese arreglo queda vacío a propósito. Cuando llegue el mapa validado de S1: (1) confirmar/ajustar
segmento y perfil por fila, (2) completar `BACKLOG_SCOPE_ITEM_NAV`, (3) resolver §3.1 de Compras.

---

## 4. Qué queda preparado para aplicar rápido (mecánica lista, sin cerrar)

- **`NAV_GROUPS`** (`src/modules/nav-groups.ts`) — los 5 grupos con id + label criollo, en su
  orden fijo de despliegue. Cerrado (viene de ADR-059 D3, no es decisión de esta sesión).
- **`groupNavItems()`** — selector puro, agrupa cualquier lista de ítems ya filtrada por
  `visibleNavItems` (rol × módulo × perfil) en esos 5 grupos; omite grupos vacíos; los ítems
  sin `grupo` van a `ungrouped` (red de seguridad, no desaparecen en silencio). 7 tests verdes.
- **`DRAFT_NAV_ITEM_GROUPS`** — la asignación grupo de los 17 ítems existentes (§2), lista para
  aplicar. Con Compras marcada como el único punto de ambigüedad (§3.1).
- **`BACKLOG_SCOPE_ITEM_NAV`** — el placeholder tipado donde S1/el dueño confirman y se cargan
  las filas de §3.2, listo para completar sin tocar el resto del código.

## 5. Lo que NO se tocó (carriles de otras sesiones del pool)

- **`AdminShell.tsx`** — no se editó. `ALL_ITEMS` sigue siendo la nav plana de 17 ítems; el
  `grupo`/`perfilMin` se cablean ahí recién en el Gate de integración (junto con los primitivos
  de S2 — `SectionGroup`/`PageHeader`/`ProfileBadge` — y el flag/candado de S3).
- **`src/modules/perfil.ts`** — no se editó (PR-1 ya landed). `nav-groups.ts` solo IMPORTA el
  tipo `NavGateItem`, no lo modifica.
- **`src/modules/flags.ts`** — no se tocó ningún flag nuevo. La agrupación es puro código muerto
  hasta que se importe desde algún lado — **reversible por construcción**, no por un flag propio.
- **Tokens `--density` / primitivos** — cero. Eso es carril de Sesión 2.

— Elaborado por Sesión 4 (Ingeniería de interfaz — navegación), sprint GROW-AR 2026-07-08.
