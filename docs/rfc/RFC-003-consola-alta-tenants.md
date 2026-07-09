# 📄 RFC-003 — Consola del dueño / super-admin: rediseño del ALTA DE TENANTS

> **Tipo:** RFC (propuesta de diseño, **NO decisión, NO implementa código**). **Estado:** Etapa 1 —
> auditoría + propuesta. Sigue **Challenger (ADR-045) → Gate (ADR-040) → prototipo**.
> **Autor:** Diseño (frente de consola interna). **Fecha:** 2026-07-09.
> **Alcance:** la **herramienta INTERNA del dueño** (control-plane, ADR-021) donde se dan de alta y configuran
> los tenants. **Distinta** de la UX del ERP del tenant (eso es RFC-002). Anclado en el código real.
> **Filosofía:** C-002 (la consola es plano de plataforma, cross-tenant, ADR-021) · C-004 (naming al cliente
> **Comercio/Empresa**, nunca `lite`/`enterprise`) · C-005 (aditivo/reversible, el alta ya es idempotente ADR-019).

---

## 1. Flujo actual (mapeado sobre el código)

**Superficie:** `src/app/operador/(console)/` (plano de operador, detrás de `requireOperator()`), sobre
`operatorPrisma` (conexión cross-tenant, ADR-021) — nunca `getCurrentTenantId()`.

| Pantalla | Archivo | Qué hace hoy |
|---|---|---|
| **Home / lista** | `operador/(console)/page.tsx` | Lista todos los tenants (orden por `createdAt`) + 4 stats (Tenants / Activos / En pruebas / **Gate 2º tenant RLS** ADR-018) + botón "+ Alta". Muestra por tenant: nombre, slug, estado (badge), blueprint, nº módulos (honesto: deriva del default si la columna está vacía, OP-2), counts. |
| **Alta** | `operador/(console)/alta/page.tsx` → `provisionFromConsole` (`operator-actions.ts`) → `provisionTenant` (`scripts/provision-tenant.ts`, ADR-019) | **Un solo formulario largo, 4 cards:** ① Negocio (name, slug, ownerName, ownerEmail) · ② Rubro y vertical (rubro texto libre **o** blueprint explícito, agrupado por familia) · ③ Plan/estado/marca (plan, status, accent, tema, subdominio) · ④ Módulos (10 checkboxes; si no marcás ninguno → default del blueprint). Submit → `provisionTenant` (idempotente por slug, transaccional, **gate RLS** para el 2º tenant) → redirect a la ficha con la **password de bootstrap una vez**. |
| **Ficha / edición** | `operador/(console)/tenants/[id]/page.tsx` → `setTenant*` + `toggleTenantModule` | **N formularios sueltos, uno por sección** (Estado · Plan · Marca/acento · Link/subdominio · Módulos), cada uno con su "Guardar". Módulos: **un form por módulo**, se togglea de a uno (round-trip + redirect por cada click). Muestra counts + password de bootstrap (si viene de alta). |

**Fuente de módulos por rubro:** `defaultModulesForBlueprint` — **fuente única** (FU1, re-exportada de
`@/blueprints/presets-meta`; antes había copia con drift). El catálogo activable es `MODULES` en
`operator-config.ts` (10 módulos base) + `PLANS` + `ACCENT_PRESET_IDS` + `TENANT_STATUSES`.

---

## 2. Auditoría UX (problemas, priorizados)

### 🔴 Bloqueantes de producto
- **P1 · No se asigna el PERFIL Comercio/Empresa.** Verificado: `profile` **no aparece** ni en el form, ni en
  `provisionFromConsole`, ni en `provisionTenant`. Todo tenant nace `lite` (default de `Tenant.profile`). Es el
  **eje central del producto GROW-AR** (ADR-058/059, C-004: un Core dos motores) y la consola —cuya razón de ser
  es dar de alta negocios— **no puede crear un tenant Empresa ni cambiar el perfil de uno existente.** Gap #1.
- **P8 · Catálogo de módulos desactualizado vs el producto real.** `MODULES` tiene los 10 base; **faltan los
  módulos Empresa de ADR-060** (inventario, cuentas a pagar, cuentas a cobrar/fiado, libros, devoluciones). El
  operador no puede encenderlos desde la consola. Es deuda de catálogo, además de UX.

### 🟠 Fricción y claridad
- **P2 · Módulos sin preview del set por rubro.** El form dice "si no marcás ninguno se usan los del blueprint"
  pero **no muestra cuáles**. El operador no ve qué va a encender hasta después de crear. Y si marca módulos,
  **reemplaza** el default (no suma) — riesgo de alta a la que le falta lo básico del rubro. La info existe
  (`defaultModulesForBlueprint`), solo falta mostrarla en vivo.
- **P3 · Rubro vs blueprint ambiguo, sin feedback de resolución.** Dos campos que compiten (texto libre vs
  select), con la regla de prioridad **en prosa**. El operador **no ve a qué blueprint resuelve** su texto
  ("ferretería" → ¿genérico? ¿retail?) hasta enviar. Sin resolución en vivo.
- **P4 · "Plan" colisiona con "Perfil Empresa".** Existe un **PLAN** comercial `enterprise` (free-form) **distinto**
  del **perfil** `enterprise` (Comercio/Empresa). El operador puede confundir "plan enterprise" con "perfil
  Empresa". Además ADR-059 D7 dice **nunca "enterprise" de cara al cliente** — el plan lo expone crudo.
- **P5 · Branding pobre y a ciegas.** Solo accent (dropdown de ids crudos: `petroleo`, `oxblood`, `rosa`…) +
  tema. **Sin swatch de color, sin ver el monograma/nombre con el acento, sin logo.** Se elige "oxblood" sin ver
  qué es.
- **P6 · Todo de un saque, validación tardía.** 15+ campos en una pantalla; la validación (slug único, email,
  gate RLS) recién aparece como **banner de error tras el submit** (round-trip completo, se pierde el contexto).
  Sin validación inline ni paso de revisión.

### 🟡 Edición y detalles
- **P7 · Edición fragmentada.** La ficha tiene un form por sección con su propio "Guardar"; los módulos se
  togglean **de a uno con round-trip+redirect** (10 módulos = 10 idas y vueltas). Tedioso.
- **P9 · Sin revisión ni preview del tenant resultante** antes de crear (el alta siembra usuario + catálogo).
- **P10 · Password de bootstrap en la URL.** Se entrega vía `?bootstrap=…` en el query param → **queda en el
  historial del browser / logs**. Riesgo de fuga menor de un secreto (roza C-005 / ADR-041: menos manos sobre el
  secreto). Conviene una entrega de un solo uso fuera de la URL.
- **P11 · Lista sin búsqueda/filtro.** `findMany` plano por fecha — no escala a muchos tenants (sin buscar por
  nombre/rubro/estado).

---

## 3. Propuesta de diseño

**Idea rectora:** pasar de *"un formulario largo que valida al final"* a un **wizard por pasos con preview en
vivo** — el operador **ve lo que está creando mientras lo arma** y **valida a medida**, y una **ficha de tenant
unificada** para editar sin N formularios. Todo dentro del plano de operador existente (ADR-021), aditivo:
`provisionTenant` no se reimplementa (sigue siendo la envoltura idempotente de ADR-019) — se le **agregan
parámetros** (`profile`, y el catálogo de módulos Empresa) y se rediseña la **capa de UI/UX** encima.

### 3.1 · Alta = Wizard de 5 pasos + panel de preview en vivo

Layout: **columna izquierda = el paso actual; columna derecha = "Vista previa del tenant"** (persistente, se
actualiza en vivo con cada campo). Barra de progreso arriba (5 pasos, con checkmarks de validación).

1. **Negocio.** Nombre · Slug (auto-sugerido del nombre; **chequeo de disponibilidad inline** contra
   `operatorPrisma`, tilde verde / cruz roja) · Dueño (nombre, email con validación de formato inline).
2. **Rubro + Edición.** Rubro (texto libre **o** blueprint del catálogo) con **resolución EN VIVO**:
   *"ferretería → Retail genérico"* mostrado apenas se tipea/elige. **+ Edición del negocio: Comercio ↔ Empresa**
   (el gap P1) — un toggle claro con explicación de qué cambia: *"Empresa suma cuentas a pagar/cobrar, libros e
   inventario; se puede subir después sin migrar (crecé sin migrar, ADR-058)"*. Naming **Comercio/Empresa** en
   canal neutro (nunca `lite`/`enterprise`, C-004/D7).
3. **Módulos.** **Pre-seleccionados según rubro** (el `defaultModulesForBlueprint` mostrado y editable, resuelve
   P2). Cada módulo es un toggle **en vivo (client, sin round-trip)**, con etiqueta *"base del rubro"* vs
   *"agregado"*. Los **módulos Empresa** (ADR-060) aparecen **solo si la edición es Empresa** (gated por el paso 2,
   respeta el invariante `enterprise ⊇ lite`). Resuelve P2 y P8.
4. **Marca + link.** Acento con **swatches de color reales** (no ids crudos) · Tema (claro/oscuro) ·
   **preview del monograma + nombre con el acento aplicado** (resuelve P5) · Subdominio (chequeo de disponibilidad
   inline, reusa la validación de unicidad que ya existe en `setTenantSubdomain`) · Plan comercial (renombrado y
   **separado visualmente** de la Edición, resuelve P4) · Estado inicial.
5. **Revisar y crear.** Resumen de todo (negocio · rubro→blueprint resuelto · **Edición Comercio/Empresa** ·
   módulos activos · marca · link · plan/estado), con las validaciones ya resueltas. Si es el **2º tenant**,
   muestra el **gate RLS (ADR-018)** ANTES de crear, no como error post-submit (resuelve P6/P9). Botón "Crear
   tenant". Tras crear → **entrega segura del bootstrap** (§3.3).

**Panel de preview en vivo (derecha, siempre visible):** una tarjeta que muestra el tenant que se está armando —
monograma con el acento, nombre, `/slug`, **badge de Edición (Comercio/Empresa) en canal neutro**, rubro→blueprint
resuelto, **chips de módulos activos**, link. Es la materialización de *"ver lo que creás"*.

### 3.2 · Ficha de tenant UNIFICADA (edición)

Una sola pantalla editable (no N formularios sueltos), con las **mismas secciones del wizard en modo edición**:
- **Cabecera:** nombre + Edición (badge) + estado + salud (counts de usuarios/servicios/clientes/etc.) + acciones
  de plataforma (activar/suspender).
- **Edición Comercio/Empresa editable** con la advertencia de que **subir es aditivo y seguro** (crecé sin migrar);
  bajar de Empresa a Comercio se marca como decisión con impacto (los módulos Empresa dejan de verse). Cierra P1
  también en edición.
- **Módulos** con toggles **en vivo (client) + un solo commit** (resuelve P7), separando base del rubro / Empresa.
- **Marca** con los mismos swatches + preview; **Link** con chequeo de disponibilidad.
- **Zona de bootstrap:** re-generar/entregar la password de forma segura (§3.3), no en URL.

### 3.3 · Arreglos transversales
- **P4 (vocabulario):** en la consola, **"Edición: Comercio / Empresa"** (el perfil, canal neutro) queda
  **separado** de **"Plan comercial"** (trial/base/pro/…). Nunca se muestra la palabra `enterprise` como etiqueta
  de cliente; el plan usa sus propios labels.
- **P8 (catálogo):** extender `MODULES` (o derivarlo del catálogo real `src/modules/`) para incluir los módulos
  Empresa de ADR-060, marcados como *edición Empresa* y gateados por perfil/rubro. (Es trabajo de datos + UI; se
  eleva su alcance al Gate.)
- **P10 (secreto):** entregar la password de bootstrap en un **panel de un solo uso** (copiar al portapapeles +
  aviso "se muestra una vez"), **fuera del query param** (evita historial/logs). Alinea con C-005/ADR-041.
- **P11 (lista):** buscador + filtro por estado/rubro/edición en el home.

### 3.4 · Qué NO cambia (aditivo)
`provisionTenant` sigue siendo la única alta (idempotente por slug, transaccional, gate RLS — ADR-019/018). El
wizard es **UI encima**; solo se le pasan parámetros nuevos (`profile`, módulos Empresa). Plano de operador,
sesión y seguridad intactos (ADR-021). Reversible/aditivo (C-005).

---

## 4. Pantallas para prototipar (clickeable)

Detalle suficiente para un prototipo interactivo. Estética: la del control-plane actual (Card/Field/Input/Select/
Button/Badge de `@/components/ui`), tema del operador.

### Pantalla A — Home / lista de tenants (pulida)
- **Header:** "Tenants" + subtítulo + botón **"+ Alta de tenant"** (derecha).
- **Fila de stats (4):** Tenants · Activos · En pruebas · **Gate 2º tenant (RLS)** (ARMADO/libre).
- **Barra de búsqueda + filtros** (nuevo): buscar por nombre/slug; filtros por estado y por **Edición
  (Comercio/Empresa)**.
- **Tabla/lista de tenants:** por fila → monograma+nombre · `/slug` · **badge Edición** (nuevo) · badge estado ·
  blueprint · nº módulos (con marca "derivado" si aplica) · counts · link a la ficha.
- **Interacción a prototipar:** click en "+ Alta" → Wizard (B); click en una fila → Ficha (G).

### Pantalla B — Wizard, contenedor
- **Barra de progreso** (5 pasos: Negocio · Rubro+Edición · Módulos · Marca+Link · Revisar), con check verde en los
  pasos válidos.
- **Layout 2 columnas:** izquierda = el paso; derecha = **Panel de preview en vivo** (F), siempre visible.
- **Footer:** "Atrás" / "Siguiente" (Siguiente deshabilitado si el paso tiene validaciones sin resolver); en el
  último paso "Crear tenant".

### Pantalla C — Paso 1: Negocio
- Campos: **Nombre** · **Slug** (auto-sugerido; con indicador inline de disponibilidad: "✓ disponible" / "✗ en
  uso") · **Nombre del dueño** · **Email del dueño** (validación de formato inline).
- **Interacción:** tipear nombre → sugiere slug; el preview (F) muestra nombre + monograma.

### Pantalla D — Paso 2: Rubro + Edición
- **Rubro:** input de texto libre **o** select de blueprint (agrupado por familia). **Debajo, resolución en vivo:**
  *"Se crea como: **Retail genérico**"* (o el blueprint que corresponda), actualizándose al tipear/elegir.
- **Edición del negocio (nuevo):** toggle grande **Comercio ↔ Empresa** con microcopy: *"Comercio: lo mínimo que
  resuelve. Empresa: suma cuentas a pagar/cobrar, libros e inventario. Se puede subir después **sin migrar**."*
  Canal neutro (sin color de tier), badge de Edición.
- **Interacción:** cambiar Edición → el preview y el paso 3 (módulos Empresa) reaccionan.

### Pantalla E — Paso 3: Módulos
- **Lista de módulos** con **el set del rubro pre-encendido** (toggles en vivo). Cada uno: label + descripción +
  etiqueta "base del rubro" / "agregado".
- **Sección "Módulos de la edición Empresa"** (aparece solo si Edición = Empresa): inventario · cuentas a pagar ·
  cuentas a cobrar (fiado) · libros · devoluciones — con su nota de perfil/rubro.
- **Interacción:** togglear cambia los chips del preview (F). Botón "Restablecer al set del rubro".

### Pantalla F — Panel de preview en vivo (persistente en el wizard)
- Tarjeta "Así queda el tenant": **monograma con el acento** + nombre · `/slug` · **badge Edición (Comercio/
  Empresa)** · rubro→blueprint resuelto · **chips de módulos activos** · link (si hay subdominio).
- Se actualiza con cada cambio de cualquier paso. Es el corazón del rediseño (P2/P5/P9).

### Pantalla G — Paso 4: Marca + link (y su reflejo en la Ficha)
- **Acento:** grilla de **swatches de color** (los 6 presets, mostrados como color real + nombre), seleccionable.
- **Tema:** claro / oscuro (con mini-preview del monograma en cada uno).
- **Subdominio:** input con chequeo de disponibilidad inline.
- **Plan comercial:** select (trial/base/pro/…), **rotulado claramente como "Plan comercial"** y separado de la
  Edición. **Estado inicial:** select.
- **Preview de marca:** el monograma + nombre renderizados con el acento y tema elegidos.

### Pantalla H — Paso 5: Revisar y crear
- **Resumen** en secciones (Negocio · Rubro→blueprint · **Edición** · Módulos activos · Marca · Link · Plan/Estado).
- Si es el **2º tenant:** aviso del **gate RLS (ADR-018)** ANTES de crear (no como error post-submit).
- Botón **"Crear tenant"** → estado de carga → éxito.

### Pantalla I — Entrega del bootstrap (post-creación)
- Panel de **un solo uso**: "Tenant creado. Contraseña del dueño (se muestra una vez):" + campo con **copiar al
  portapapeles** + aviso de comunicar por canal seguro. **Sin la password en la URL.** Botón "Ir a la ficha".

### Pantalla J — Ficha de tenant UNIFICADA (edición)
- **Cabecera:** monograma+nombre · **badge Edición** · badge estado · counts de salud · acciones (Activar/Suspender).
- **Secciones editables en una sola pantalla:** Edición (Comercio/Empresa, con la advertencia de aditividad) ·
  Módulos (toggles en vivo + un commit, base/Empresa separados) · Marca (swatches + preview) · Link (chequeo) ·
  Plan/Estado.
- **Zona de bootstrap:** re-generar/entregar la password de forma segura (panel de un solo uso, no URL).

---

## 5. Alcance y próximos pasos

- **Esto es Etapa 1 (auditoría + diseño), NO implementación.** Sigue: **Challenger (ADR-045)** tensiona la
  propuesta → **Gate (ADR-040)** → **prototipo interactivo** (clickeable, con las pantallas A–J) → recién después,
  implementación por `/sesion-feature` (aditiva sobre `provisionTenant`, sin tocar el gate RLS ni el plano de
  operador).
- **Decisiones que exceden el diseño y se elevan** (para Challenger/Gate/dueño): (1) agregar `profile` a
  `provisionTenant` + persistirlo en el alta (P1) — cambio de firma, aditivo; (2) extender el catálogo `MODULES`
  con los módulos Empresa de ADR-060 (P8) — datos + UI; (3) cambiar la entrega del bootstrap fuera de la URL (P10)
  — toca seguridad, alinear con ADR-041/C-005.
- **Reglas duras respetadas:** el alta sigue siendo la envoltura idempotente de ADR-019; naming Comercio/Empresa
  en canal neutro (C-004/D7); aditivo/reversible (C-005); plano de operador cross-tenant intacto (C-002/ADR-021).

— RFC de diseño (frente Consola interna). Propuesta, no decisión. No toca código de producto.
