# Diseño — Tienda de Módulos (núcleo + plugins instalables) para productos de facturación

**Estado:** Pasada de diseño (NO implementación). Entregable = plan accionable.
**Dirección:** ADR-089 (núcleo mínimo + módulos instalables por producto) · apoya en ADR-054 (repositorio de plugins), ADR-055 (principio de variante), ADR-076 (un motor, tres productos).
**Alcance:** Comerciante y arriba (Comerciante, Pyme, clientes del Contador). **Facturita y verticales (CH/Magra) FUERA.**

> Regla de oro de todo el diseño: **nada de forks, cero motor nuevo.** Casi todo el andamiaje ya existe en `src/modules/**`. Esto es **enriquecer datos + generalizar dos cables + reconstruir una pantalla**. La activación por-tenant sigue siendo `Tenant.modules[]` (dato que YA existe, `prisma/schema.prisma:207`).

---

## 0. Qué ya está construido (para no reinventarlo)

| Pieza | Archivo | Qué hace hoy |
|---|---|---|
| Objeto-maestro del módulo | `src/modules/contract.ts:99` (`ModuleDescriptor`) | id/version/nombre/descripcion/kind/capability/rubros/deps/config/migraciones/flag |
| Catálogo (18 descriptores) | `src/modules/catalog.ts:28` + `descriptors/nativos.ts` + arca/bancos/mercadopago/cartera | fuente única del "qué hay disponible", validada fail-closed |
| Resolver de asignación (variante) | `src/modules/activation.ts:71` (`resolverActivacion`) | parte de `modules[]` y **solo RESTA** (DX-6: nunca "todos con todo") |
| Vidriera + planes de toggle (PUROS) | `src/modules/vista.ts` (`vistaModulos`/`planActivar`/`planDesactivar`) | lista compatible con el rubro + activar arrastra deps + desactivar se bloquea si otro lo usa |
| Pantalla `/admin/modulos` (scaffold) | `src/app/admin/(dashboard)/modulos/page.tsx` + `src/lib/modulos-actions.ts` | ABM real: prende/apaga y persiste `Tenant.modules[]` + auditoría |
| Gating por módulo (PURO + server) | `src/modules/gating.ts:16` + `src/lib/module-gating.ts:27` | esconde pantallas de módulos apagados (hoy detrás del flag global) |
| Gating por-URL (ya generalizable) | `src/lib/admin-nav-items.ts:95` (`rutaPermitidaComerciante`) | whitelist ruta→módulo derivada de `ALL_ITEMS`, evita entrar por tecleo |
| Identidad por producto | `src/lib/producto-identidad.ts:123` (`derivarProducto`) + `src/lib/producto.ts` | comerciante/contador/facturita/vertical derivado del tenant |
| Composición de nav | `src/app/admin/(dashboard)/layout.tsx:132` (`shellModules`) + `AdminShell` + `perfil.ts:59` (`visibleNavItems`) | nav = `ALL_ITEMS` filtrada por rol × módulo × perfil |
| Grupos de nav (5) | `src/modules/nav-groups.ts:55` (`NAV_GROUPS`) | operación/clientes/inventario-y-compras/finanzas/configuración |
| Flag global | `src/modules/flags.ts:13` (`MODULE_REGISTRY_ENABLED`, **OFF**) | interruptor maestro del gating por catálogo |

**Hallazgo clave:** el layout (`layout.tsx:132-134`) YA gatea Comerciante por su `Tenant.modules[]` **aunque el flag global esté OFF**:
```ts
const shellModules = activeModuleIds ?? (productoCtx.producto === "comerciante" ? productoCtx.modules : null);
```
Es decir, el "encendido por producto sin tocar verticales" ya existe para Comerciante. **El grueso del trabajo es generalizar ese cable a todos los productos de facturación y darle una vidriera con scope items.**

---

## 1. EL NÚCLEO por producto

### Comerciante — núcleo de fábrica
```
NUCLEO_COMERCIANTE = ["bancos", "arca", "mercadopago", "clients", "reports"]
```
- **bancos** + **arca** + **mercadopago** = el corazón de facturación (extracto→propuesta→CAE + cobros MP). ADR-089 §Decisión 1.
- **clients** = receptores/ficha (arca y bancos identifican receptor arriba de umbral).
- **reports** = reportes básicos (ingresos/topes).
- **NO** entran agenda/pos/catalog/stock (ADR-089: "nada de agenda/POS/catálogo/stock por defecto").

⚠️ **Deuda a corregir (Fase 1):** hoy el núcleo real de Comerciante lo fija `defaultModulesForBlueprint("generico")` = `["catalog","clients","pos","agenda","reports"]` (`src/blueprints/presets-meta.ts:96`). **Eso trae justo el "Agregar turno" hardcodeado que motivó ADR-089.** Hay que reescribir el default de `generico` al `NUCLEO_COMERCIANTE` de arriba. Solo afecta **altas nuevas** (los tenants vivos conservan su `modules[]`; ver reconcile en Fase 4).

### Pyme — núcleo = Comerciante + perfil Empresa
Pyme **no** es otro set de núcleo: es el **mismo núcleo de facturación** con `Tenant.profile = enterprise` (`PROFILES_ENABLED`, `flags.ts:31`). Lo que la distingue no es qué viene instalado sino que el perfil Empresa **desbloquea** los procesos aditivos (Inventario, Compras, Cuentas, Libros) — que igual **se instalan como módulos** desde la tienda, no vienen de fábrica. Mantener el núcleo mínimo evita la trampa "Pyme = todo prendido".

### Contador
Producto aparte (`derivarProducto` lo detecta por el módulo `cartera`, `producto-identidad.ts:126`). Su casa es `/contador`, no `/admin`. Núcleo = `["cartera", "arca", "clients", "reports"]`. La tienda de módulos para el Contador es un frente menor (misma mecánica); **su cartera de clientes son tenants Comerciante** que sí usan la tienda `/admin/modulos` estándar.

---

## 2. CATÁLOGO agrupado por proceso + scope items

Los 18 descriptores existentes, reagrupados por **proceso** (dimensión nueva `grupo` en el descriptor, §3). Grupo ≠ los 5 grupos de *nav* (`nav-groups.ts`): el grupo de **tienda** ordena la vidriera por proceso comercial; la nav sigue agrupando pantallas por área. Se pueden mapear pero son ejes distintos.

**Grupos de tienda propuestos** (orden de vidriera):

### G1 · Facturación y cobros (Fiscal) — `facturacion-cobros`
| Módulo | Núcleo | Scope items (criollo) | Fit |
|---|---|---|---|
| **bancos** (plugin) | ✅ | Subir extracto CSV/XLSX · detectar columnas solo · separar ventas de comisiones/impuestos · proponer facturas para confirmar | Todo comercio que cobra por banco/transferencia |
| **arca** (plugin) | ✅ | Pedir CAE a ARCA (WSAA+WSFEv1) · emitir A/B/C · anular/nota de crédito | Todo el que factura electrónico en AR |
| **mercadopago** (plugin) | ✅ | Generar link de pago (Checkout Pro) · recibir webhook · auto-facturar el pago acreditado | El que cobra online por MP |
| **libros** (capability) | — | Libro IVA Ventas + Compras · exportar al contador | Pyme / quien manda al estudio (dep: reports + arca) |

### G2 · Ventas y mostrador — `ventas-mostrador`
| Módulo | Scope items | Fit |
|---|---|---|
| **pos** (capability) | Caja · toma de pedidos · venta de mostrador · venta por kg | Retail/gastronomía/mostrador (NO servicios puros) |
| **catalog** (capability) | ABM de productos/servicios · precios · categorías · compras/reposición | Quien vende ítems catalogados (dep de inventario/CxP) |

### G3 · Agenda y turnos — `agenda-turnos`
| Módulo | Scope items | Fit |
|---|---|---|
| **agenda** (capability) | Turnos por profesional/box · horarios · calendario | Servicios con reserva (estética, oficios) |
| **waitlist** (capability) | Cola de cancelaciones/no-shows · avisar hueco | Servicios con agenda saturada (dep: agenda) |

### G4 · Clientes y fidelización — `clientes-fidelizacion`
| Módulo | Núcleo | Scope items | Fit |
|---|---|---|---|
| **clients** (capability) | ✅ | Ficha de cliente · historial · datos de contacto | Todos |
| **reminders** (capability) | — | Avisos y difusión (WhatsApp al conectarse) | Quien recuerda turnos/promos |
| **reviews** (capability) | — | Pedir/mostrar opiniones y calificaciones | Quien trabaja reputación |
| **cuentas-a-cobrar** (capability) | — | Fiado: saldo, vencimiento, cobros parciales | Comercio de barrio con fiado (dep: clients) |

### G5 · Compras y stock — `compras-stock`
| Módulo | Scope items | Fit |
|---|---|---|
| **inventario** (capability) | Niveles de stock · valuación a costo · anti-oversell | Retail/carnicería con stock (dep: catalog) |
| **cuentas-a-pagar** (capability) | Deudas a proveedores · cheque diferido · vencimientos | Pyme con proveedores (dep: catalog) |
| **devoluciones-proveedor** (capability) | Devolver mercadería · baja de stock + crédito en CxP | Retail que devuelve a proveedor (dep: catalog) |

### G6 · Personal y comisiones (Nómina — futura) — `personal-comisiones`
| Módulo | Scope items | Fit |
|---|---|---|
| **commissions** (capability) | Liquidación por profesional | Servicios que pagan comisión (`rubros: ["servicios"]`, dep: reports) |

> **cartera** (contador) NO va en la tienda del Comerciante: es el discriminador del producto Contador. Se lista solo en la tienda del `/contador` (o se filtra con `visibleEnTienda`, §4).

---

## 3. SCHEMA del descriptor enriquecido (aditivo, opcional, NO rompe nada)

Todo lo nuevo es **opcional** → los 18 descriptores actuales siguen válidos sin tocarlos; `validarDescriptor` (`contract.ts:185`) no cambia (a lo sumo suma un *aviso* si falta `grupo`). Forma exacta a agregar en `src/modules/contract.ts`:

```ts
/** Grupo de PROCESO para ordenar la tienda (distinto de los 5 grupos de NAV). */
export type ModuleGroupId =
  | "facturacion-cobros"
  | "ventas-mostrador"
  | "agenda-turnos"
  | "clientes-fidelizacion"
  | "compras-stock"
  | "personal-comisiones";

/** Un "scope item": una pantalla o acción concreta que trae el módulo (criollo). */
export interface ScopeItem {
  /** Qué hace, en lenguaje del comerciante: "Emitir factura A/B/C". */
  label: string;
  /** Ruta del backoffice que abre, si tiene pantalla propia (para deep-link/preview). */
  ruta?: string;
}

// ── Campos NUEVOS en ModuleDescriptor (todos opcionales) ──────────────────────
export interface ModuleDescriptor {
  // ... campos actuales (id, version, nombre, ..., flag) intactos ...

  /** Grupo de proceso en la tienda. Ausente = cae en "otros" (red de seguridad). */
  grupo?: ModuleGroupId;
  /** Pantallas/acciones concretas que trae — para evaluar el FIT antes de instalar. */
  scopeItems?: ScopeItem[];
  /** "Para qué sirve", 1–2 líneas (más largo que `descripcion`, orientado a venta). */
  resumen?: string;
  /** "A quién le hace fit" — el criterio de decisión, en criollo. */
  fit?: string;
  /**
   * Productos donde el módulo viene INSTALADO de fábrica (núcleo). Declarativo y
   * PER-PRODUCTO: un módulo puede ser núcleo de Comerciante y opcional en otro.
   * NO es un boolean (núcleo no es intrínseco al módulo, es del producto).
   * Ej.: bancos/arca/mercadopago/clients/reports → ["comerciante","pyme"].
   */
  nucleoPara?: string[];
}
```

**Por qué `nucleoPara: string[]` y no `esNucleo: boolean`:** el núcleo es del **producto**, no del módulo (ADR-055: la asignación es la variante). `clients` es núcleo de Comerciante pero un vertical puede no tenerlo. Un boolean acoplaría el catálogo a un producto y volvería a mentir. Con `nucleoPara` el catálogo sigue siendo **fuente única** y product-aware, y se deriva de ahí tanto el default del alta como el badge de la tienda (un solo lugar, sin doble verdad). Se mantiene decoupled de `Producto` (usa ids string) para que `contract.ts` no arrastre dependencias.

**Reconciliación con el alta:** `defaultModulesForBlueprint` (`presets-meta.ts:111`) debería **derivar** el set de Comerciante de `nucleoPara.includes("comerciante")` en vez de la lista hardcodeada de `generico`. Así el núcleo se declara **una sola vez** en los descriptores.

---

## 4. LA TIENDA `/admin/modulos` — UX

Reemplaza el scaffold plano actual (lista de tarjetas sin agrupar, `modulos/page.tsx`) por una vidriera **por grupo de proceso**, sin tocar la mecánica de toggle (que ya funciona).

### Estructura visual
```
Módulos de tu negocio
[ Tu plan trae 5 módulos de núcleo · tenés 3 más instalados · 10 disponibles ]

▸ Facturación y cobros
   ┌─────────────────────────────────────────────┐
   │ Bancos — Facturación desde el extracto  [Núcleo] │
   │ Subís el extracto y salen las facturas solas.    │  ← resumen
   │ • Subir extracto CSV/XLSX  • Detectar columnas   │  ← scopeItems (chips)
   │ • Separar ventas  • Proponer facturas            │
   │ Le sirve a: todo comercio que cobra por banco.   │  ← fit
   │ [Integración]                 [ Viene con tu plan ] │  ← núcleo: botón disabled
   └─────────────────────────────────────────────┘
   ┌─────────────────────────────────────────────┐
   │ Libros / Exportar al contador       [Disponible] │
   │ ... scope items ...                              │
   │ Necesita: Reportes, ARCA                         │  ← dependeDe
   │ [Nativo]                          [  Instalar  ]  │
   └─────────────────────────────────────────────┘

▸ Ventas y mostrador
   ...
```

### Reglas de la tarjeta
- **Estado**: `Núcleo` (viene con el plan, no se desinstala) · `Instalado` · `Disponible`.
- **Botón**:
  - Núcleo → deshabilitado, label "Viene con tu plan" (no se puede apagar).
  - Instalado y libre → **Desinstalar**.
  - Instalado y requerido por otro activo → deshabilitado + "Lo está usando: X" (ya lo calcula `vistaModulos` → `requeridoPor`, `vista.ts:65`).
  - Disponible → **Instalar** (arrastra dependencias en cascada, ya lo hace `planActivar`).
- **scopeItems** como chips; **resumen** como subtítulo; **fit** como línea "Le sirve a:".
- Desinstalar es **reversible** (oculta el proceso, **no borra datos**) → copy tranquilizador.

### Cambios de código (mínimos)
1. `FilaModulo` (`vista.ts:26`) suma `grupo`, `scopeItems`, `resumen`, `fit`, `esNucleo`. `vistaModulos` los copia del descriptor + calcula `esNucleo = (descriptor.nucleoPara ?? []).includes(producto)`.
2. `vistaModulos` recibe el `producto` (para el badge núcleo) y filtra `visibleEnTienda` (excluye `cartera` fuera de Contador).
3. `planDesactivar` (`vista.ts:132`) suma un guard: **no se desinstala un módulo núcleo** (mismo patrón que el bloqueo por dependencia).
4. La página agrupa `filas` por `grupo` respetando el orden de `ModuleGroupId`.
5. El server action `toggleModulo` (`modulos-actions.ts:76`) queda **igual** (ya persiste `modules[]` + audita + `revalidatePath("/")`).

### Cómo se refleja al instante en nav/Inicio
Ya está resuelto y es **inmediato**: `toggleModulo` hace `revalidatePath("/")` → el layout recalcula `shellModules` → `AdminShell` refiltra `ALL_ITEMS` con `visibleNavItems` (rol × **módulo** × perfil, `perfil.ts:59`) → la nav aparece/desaparece. El Inicio (`page.tsx:129`) ya ramifica por producto y por módulos activos (`dashboardModeForModules`). **No hay pantalla que componer a mano: la composición ya existe.**

### Generalizar de "comerciante" a cualquier producto de facturación
Hoy la nav focalizada y el gating por-URL están **hardcodeados a `comerciante`** (`layout.tsx:79,134`; `admin-nav-items.ts:95` `rutaPermitidaComerciante`). Generalizar:
- Renombrar `rutaPermitidaComerciante` → `rutaPermitidaPorModulos(path, modules)` (la lógica ya es genérica: whitelist derivada de `ALL_ITEMS`).
- Nuevo helper puro `productoUsaTienda(producto)` = `producto ∈ {comerciante, pyme, contador}` (facturación con tienda). Facturita y vertical → false.
- `shellModules` y el guard por-URL del layout gatean cuando `productoUsaTienda(producto)`, usando `productoCtx.modules`. **Verticales y Facturita intactos** (caen a `null` → ven todo como hoy).

---

## 5. ENCENDIDO SEGURO (sin tocar verticales ni el flag global)

**No se toca `MODULE_REGISTRY_ENABLED`.** Ese flag es global y afectaría a los verticales (CH/Magra), que hoy dependen de que esté OFF para ver todo su backoffice. El encendido es **por identidad de producto**, exactamente como ya funciona el `shellModules` de Comerciante (`layout.tsx:132`).

- **Señal de encendido:** `productoUsaTienda(producto)` (derivado del tenant vía `derivarProducto`, `producto-identidad.ts:123`). Es **data-driven y reversible**: un tenant cambia de comportamiento solo si su blueprint/módulos lo hacen Comerciante/Pyme/Contador.
- **Verticales:** `producto === "vertical"` → `productoUsaTienda` false → `shellModules = null` → gating apagado → **byte-idéntico a hoy**.
- **`getActiveModuleIds`** (`module-gating.ts:27`) hoy devuelve `null` con el flag OFF. Para los productos de facturación, la fuente autoritativa pasa a ser `productoCtx.modules` (que el layout ya usa como fallback). Cuando algún día se prenda el flag global, `getActiveModuleIds` manda (misma fuente, sin doble verdad — ya está contemplado en `layout.tsx:133`).

### ¿Migración? ¿Gate 2?
- **La tienda NO necesita migración.** `Tenant.modules[]` **ya existe** (`schema.prisma:207`). Instalar/desinstalar = `UPDATE Tenant SET modules = ...` (dato, reversible). El ABM ya persiste eso hoy (`modulos-actions.ts:100`).
- **NO hay Gate 2 para el mecanismo de la tienda.** Gate 2 (`prisma migrate deploy`) sigue aplicando **solo** a los módulos que traen tablas propias (`cartera` → `CarteraCliente`; y los descriptores Empresa `inventario`/`cuentas-*` cuando tengan sus migraciones). Eso ya está trackeado aparte y **no cambia** con este diseño.
- **Guardarraíl:** no ofrecer como "Instalable" un módulo cuya migración **no está aplicada** en prod (mostrarlo como "Próximamente" o gatearlo con la ref de `migraciones` del descriptor). Evita que alguien instale una pantalla que después explota por falta de tabla.

---

## 6. PLAN DE IMPLEMENTACIÓN por fases

| Fase | Qué | Tamaño | Reversible / Prod | Riesgo → mitigación |
|---|---|---|---|---|
| **F1 · Enriquecer datos** | Agregar `grupo`/`scopeItems`/`resumen`/`fit`/`nucleoPara` a los 18 descriptores (`contract.ts` + `descriptors/**` + arca/bancos/mp). Constante/derivación de núcleo. Reescribir `defaultModulesForBlueprint("generico")` al `NUCLEO_COMERCIANTE`. Tests puros. | **S** | 100% reversible, **no toca prod ni Neon** (dato puro tras el patrón existente) | Cambiar el default de `generico` afecta **solo altas nuevas**; tenants vivos conservan `modules[]` → sin regresión |
| **F2 · Vidriera nueva** | Reconstruir `/admin/modulos`: agrupar por proceso, tarjeta con scope/resumen/fit, badge Núcleo, botón Instalar/Desinstalar. Extender `FilaModulo`/`vistaModulos`; guard núcleo en `planDesactivar`. Server action **sin cambios**. | **M** | Reversible (UI + lógica pura); no toca schema | Desinstalar por error → mitigado: núcleo no se apaga + reversible sin borrar datos + bloqueo por dependencia (ya existe) |
| **F3 · Generalizar gating** | `rutaPermitidaComerciante`→`rutaPermitidaPorModulos`; helper `productoUsaTienda`; `shellModules` + guard por-URL + `getActiveModuleIds` por producto (comerciante/pyme/contador). Tests de nav. | **M** | Reversible (deriva de producto; verticales y Facturita intactos por construcción) | Un producto queda sin acceso a algo → mitigado: núcleo siempre instalado + `/admin` siempre pasa (sin loop) |
| **F4 · Go-live facturación** | Encender para los tenants de facturación en prod. **Sin migración.** Script de **reconcile/backfill**: a cada tenant Comerciante/Pyme sin el núcleo en `modules[]`, agregarle el núcleo (idempotente). Verificación end-to-end (instalar/desinstalar/nav/Inicio). | **S** | **No es migración** (UPDATE de datos, no schema) → no es Gate 2 formal, pero se corre como script revisado con OK del dueño | Tenant vivo con `modules[]` viejo (agenda/pos) → el backfill garantiza el núcleo; lo demás se limpia desde la tienda |

### Orden y qué es lo primero
1. **F1 primero** (todo dato, cero riesgo, habilita las otras). 
2. **F2** (la vidriera se puede construir y demostrar aún sin generalizar el gating: Comerciante ya está encendido).
3. **F3** suma Pyme/Contador al mismo comportamiento.
4. **F4** es el único que toca prod, y solo **datos** (no schema).

### Riesgos transversales y mitigación
- **Dejar un tenant sin acceso:** el núcleo viene instalado y `/admin` (Inicio) nunca se gatea (`admin-nav-items.ts:98`) → nunca hay pantalla-callejón ni loop de redirect. Backfill en F4 cubre a los vivos.
- **Tocar verticales:** el encendido es por producto, no por el flag global → verticales caen a `null` = comportamiento legado byte-idéntico. **Nunca se prende `MODULE_REGISTRY_ENABLED`.**
- **Instalar un módulo sin su tabla en prod:** gatear "Instalable" por `migraciones` aplicadas (mostrar "Próximamente" si falta) → Gate 2 sigue siendo del dueño, la tienda no lo fuerza.
- **Doble fuente de verdad del núcleo:** `nucleoPara` en el descriptor es el único lugar; el alta y la tienda derivan de ahí.

---

## Resumen de decisiones (para el Gate)
1. Núcleo Comerciante = **bancos + arca + mercadopago + clients + reports**; Pyme = mismo núcleo + perfil Empresa; Contador aparte (cartera).
2. 6 grupos de proceso para la tienda; los 18 descriptores existentes se reparten con scope items en criollo.
3. Schema: 5 campos **opcionales/aditivos** (`grupo`, `scopeItems`, `resumen`, `fit`, `nucleoPara`) — no rompe descriptores ni validación.
4. Encendido **por producto** (no por flag global); **sin migración, sin Gate 2** para la tienda (`Tenant.modules[]` ya existe). Gate 2 sigue solo para las tablas de módulos Empresa/cartera, ya trackeadas.
5. 4 fases: F1 datos (S) → F2 vidriera (M) → F3 generalizar gating (M) → F4 go-live datos (S).

— Elaborado por GSG (capa Opus) · 2026-07-12
