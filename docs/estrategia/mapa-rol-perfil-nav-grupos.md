# 🗺️ Mapa rol↔perfil + 5 grupos de negocio de nav (PR-2/M2, ADR-059 D3/D6b) — CERRADO

> **Qué es:** el mapa de solapamiento **rol↔perfil** que exige ADR-059 D6b (fix Challenger #6) —
> "¿el rol/capability YA expresa la distinción Comercio/Empresa, o hace falta `perfilMin`?" —
> aplicado a los 17 ítems de `AdminShell.ALL_ITEMS`, más la agrupación en los **5 grupos de
> negocio** (ADR-059 D3, con naming profesional), más la asignación de los scope items KEEP del
> **mapa validado**. Trabajo de **Sesión 4** (Ingeniería de interfaz — navegación), sprint
> GROW-AR 2026-07-08.
>
> **Estado: CERRADO.** El mapa de cobertura fue VALIDADO por S1 (analista de mercado local,
> commit `427bfe4`) y aprobado en revisión adversarial por S5/Opus. Naming de grupos ajustado
> por **override del dueño** (2026-07-08): etiquetas de negocio claras, sin lunfardo. Naming al
> cliente sigue **"Comercio"/"Empresa"** (nunca lite/enterprise); tier en canal neutro.
>
> **Código:** `src/modules/nav-groups.ts` (+ `nav-groups.test.ts`, 11 tests verdes). Skeleton
> puro, **no wired** a `AdminShell.tsx` todavía (cero riesgo de conflicto con S2/S3). Integra S5.

---

## 1. Los 5 grupos de negocio (ADR-059 D3, naming profesional — override del dueño)

Labels de negocio en español neutro. La versión criolla previa de ADR-059 D3 quedó reemplazada
por este naming; los grupos conceptuales son los mismos, solo cambia el rótulo.

| # | id | Label final | Qué agrupa |
|---|---|---|---|
| 1 | `operacion` | **Operación** | el día a día: tablero, agenda, mostrador (pedidos), caja |
| 2 | `clientes` | **Clientes** | base de clientes + comunicación (recordatorios, reseñas) |
| 3 | `inventario-y-compras` | **Inventario y compras** | catálogo, compras/reposición, ajustes y mermas, inventario |
| 4 | `finanzas` | **Finanzas** | facturación, reportes, cuentas a cobrar/pagar, contabilidad |
| 5 | `configuracion` | **Configuración** | auditoría, usuarios, localización, módulos |

---

## 2. Mapa rol↔perfil de los 17 ítems existentes (D6b) — asignación CERRADA

**Pregunta por fila (D6b):** ¿el rol/capability actual ya alcanza para expresar quién ve esto, o
hace falta además un candado de perfil (`perfilMin`)?

| Ítem (href) | Cap / rol actual | ¿Rol ya expresa la distinción? | Grupo | `perfilMin` |
|---|---|---|---|---|
| `/admin` Dashboard | `dashboard:read` — OWNER+RECEPTION | Sí | Operación | — (lite) |
| `/admin/turnos` Agenda | `agenda:read` — los 3 roles | Sí | Operación | — (lite) |
| `/admin/espera` Lista de espera | `waitlist:manage` — OWNER+RECEPTION | Sí | Operación | — (lite) |
| `/admin/pedidos` Pedidos | `orders:read` — OWNER+RECEPTION | Sí | Operación | — (lite) |
| `/admin/caja` Caja | `orders:read` — OWNER+RECEPTION | Sí | Operación | — (lite) |
| `/admin/clientes` Clientes | `clients:read` — OWNER+RECEPTION | Sí | Clientes | — (lite) |
| `/admin/recordatorios` Recordatorios | `reminders:manage` — solo OWNER | Sí | Clientes | — (lite) |
| `/admin/resenas` Reseñas | `reviews:manage` — solo OWNER | Sí | Clientes | — (lite) |
| `/admin/catalogo` Catálogo | `catalog:manage` — solo OWNER | Sí | Inventario y compras | — (lite) |
| `/admin/compras` Compras | `catalog:manage` — solo OWNER | Sí (reposición; rubro-gated) | Inventario y compras | — (lite) † |
| `/admin/ajustes` Ajustes y mermas | `catalog:manage` — solo OWNER | Sí (stock puro) | Inventario y compras | — (lite) |
| `/admin/facturacion` Facturación | `billing:manage` — solo OWNER | Sí | Finanzas | — (lite) |
| `/admin/reportes` Reportes | `reports:read` — solo OWNER | Sí | Finanzas | — (lite) |
| `/admin/auditoria` Auditoría | `audit:read` — solo OWNER | Sí | Configuración | — (lite) |
| `/admin/usuarios` Usuarios | `users:manage` — solo OWNER | Sí | Configuración | — (lite) |
| `/admin/localizacion` Localización | `location:manage` — solo OWNER | Sí | Configuración | — (lite) |
| `/admin/modulos` Módulos | `modules:manage` — solo OWNER | Sí | Configuración | — (lite) |

**Correcciones vs. el draft previo:**
- **"Ajustes"** es en realidad **"Ajustes y mermas"** (recuento físico, merma, rotura,
  vencimiento) → stock puro → **Inventario y compras**, no Configuración.
- † **Compras** (mi pendiente anterior, §3.1 del draft): **resuelto** — la pantalla existente es
  reposición de stock (ligada a `add_stock_purchases`), del mismo family que Inventario/Ajustes.
  Queda `lite` (visible en Comercio) **gateada por rubro** (apagada para servicios sin stock).
  La compra FORMAL de proveedores/órdenes (J45 formal) + cuentas a pagar es la profundización
  Empresa, que vive como ítem aparte de Finanzas (Cuentas a pagar), no degradando esta pantalla.

**Conclusión (D6b):** ninguno de los 17 ítems existentes necesita `perfilMin:"enterprise"` hoy.
La nav actual ES, casi entera, el piso `lite` que el Comercio ya opera de punta a punta. Lo
Empresa-only llega **aditivo** por el backlog (§3), sin restar nada — respeta `enterprise ⊇ lite`.

---

## 3. Backlog del mapa VALIDADO → nav de M2 (asignación CERRADA)

Del set KEEP validado por S1 + S5. `perfilMin`: `lite` = visible en Comercio **y** Empresa (min
lite); `enterprise` = solo Empresa (aditivo). El **gating** (universal / rubro-flag / default-OFF)
no cambia el grupo, solo si renderiza — lo maneja module-gating (carril S3).

| Scope | Ítem de nav | Grupo | `perfilMin` | Gating | Nota |
|---|---|---|---|---|---|
| **BMC** | Inventario (`/admin/inventario`) | Inventario y compras | **lite** (ambos) | rubro | Anti-oversell. Se construye; apagado para servicios puros sin stock. |
| **2F3/J60** | Cuentas a cobrar (`/admin/cuentas-a-cobrar`) | **Finanzas** | **lite** (ambos) | **DEFAULT OFF** (rubro/perfil de fiado) | Fiado = deuda de cliente. Descriptor definido pero opt-in; NO piso universal. Empresa suma vencimientos/recordatorios (J60), aditivo. |
| **J59** | Cuentas a pagar (`/admin/cuentas-a-pagar`) | Finanzas | **enterprise** | — | Proveedores + cheque diferido. Solo Empresa. |
| **J58** | Contabilidad (`/admin/contabilidad`) | Finanzas | **enterprise** | — | Libro mayor simple/exportable al contador. Solo Empresa. |
| **BMK** | Devoluciones a proveedor (`/admin/devoluciones-proveedor`) | Inventario y compras | **enterprise** | — | Prioridad baja; puede absorberse en Compras. Solo Empresa. |

**Guía de S5 respetada:** inventario (BMC) → grupo de Inventario ✓ · fiado (2F3) → grupo de
Finanzas (es deuda de cliente) ✓. **Reclasificación de S1 respetada:** BMC y 2F3 bajan a "ambos"
(versión light para Comercio), no enterprise-only — el fiado es cultura de comercio de barrio AR.

**No son ítems nuevos (trazabilidad):** 1J2/ARCA = `/admin/facturacion` ya existe · BD9/POS =
`/admin/pedidos`+`/admin/caja` · J45/18J = `/admin/compras` (Comercio la ve, rubro-gated; Empresa
profundiza con órdenes formales, aditivo) · 16T rentabilidad = profundización de `/admin/reportes`.

**RESERVA (NO van a la nav de M2):** J62 (activos), 1W0 (conciliación banco por archivo), 3W0
(depósito inbound), J12 (registro de horas). **CUT:** BFA (alta de cuentas bancarias — se absorbe
en Configuración, no es módulo propio).

---

## 4. Qué queda listo en código

- **`NAV_GROUPS`** — los 5 grupos con id + label profesional, en orden fijo de despliegue.
- **`groupNavItems()`** — selector puro; agrupa cualquier lista ya filtrada por `visibleNavItems`
  (rol × módulo × perfil); omite grupos vacíos; ítems sin `grupo` van a `ungrouped` (red de
  seguridad). 11 tests verdes, incluida la valla del invariante `enterprise ⊇ lite` sobre el backlog.
- **`NAV_ITEM_GROUPS`** — asignación cerrada de los 17 ítems existentes (§2).
- **`BACKLOG_SCOPE_ITEM_NAV`** — asignación cerrada de los 5 ítems nuevos del backlog validado
  (§3), con grupo + perfil + naturaleza de gating.

## 5. Lo que NO se tocó (carriles de otras sesiones del pool)

- **`AdminShell.tsx`** — no editado. `ALL_ITEMS` sigue plano; el `grupo`/`perfilMin` se cablean
  ahí recién en el Gate de integración (junto con los primitivos de S2 — `SectionGroup`/
  `PageHeader`/`ProfileBadge` — y el flag/candado de S3).
- **`src/modules/perfil.ts`** — no editado (PR-1 landed). `nav-groups.ts` solo IMPORTA sus tipos.
- **`src/modules/flags.ts`** — no tocado. La agrupación es código puro hasta que se importe —
  **reversible por construcción**, sin flag propio.
- **Tokens `--density` / primitivos** — cero. Carril de Sesión 2.

— Elaborado por Sesión 4 (Ingeniería de interfaz — navegación), sprint GROW-AR 2026-07-08.
