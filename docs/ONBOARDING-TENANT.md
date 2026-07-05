# Onboarding de un tenant nuevo — cómo se da de alta, qué viene predefinido, cómo se vende

**Qué es este documento:** la guía clara de negocio + producto sobre cómo entra un
cliente nuevo a la plataforma. Cubre tres cosas: (1) el **flujo de alta** real de
hoy, (2) **qué recibe** un negocio al nacer según su rubro (blueprint), y (3) una
**propuesta comercial** de cómo se vendería y cómo sería el primer día del cliente.

**Audiencia:** el dueño (decisión de producto) + quien opere el alta.
**Marco:** `docs/FUNDAMENTOS-Y-VISION.md` (un Core, cada cliente = un tenant) ·
ADR-002 (Core/Blueprint/Plugin) · ADR-019 (provisioning) · ADR-018 (RLS) ·
ADR-021 (consola super-admin) · ADR-017 (roles).

**Cómo leer los estados:** ✅ = existe y verificado en código · ⚠️ = existe a
medias / gap conocido · 🔜 = propuesta / diferido (todavía no decidido). Todo lo
marcado **(Supuesto)** es criterio propio de esta propuesta, no una decisión tomada.

---

## 1. Flujo de alta paso a paso

### 1.1 Qué corre

El alta de un negocio nuevo es **un comando**, no editar código a mano:

```
npm run provision -- \
  --name "Estética Norte" \
  --slug estetica-norte \
  --owner-email ana@estetica-norte.com \
  --owner-name "Ana Ruiz" \
  --blueprint servicios          # o: carniceria
  # branding opcional: --city ... --whatsapp ... --instagram ... --hours-label ...
```

Detrás está `scripts/provision-tenant.ts` (ADR-019). Es **idempotente por `slug`**
(correrlo dos veces no duplica ni pisa lo que el negocio ya cargó), **transaccional**
(todo-o-nada: o el tenant queda completo o no queda nada) y **aditivo** (nunca borra;
no toca a ningún tenant existente). No comparte código con el `prisma/seed.ts` de demo.

### 1.2 Qué datos mínimos pide

| Dato | Obligatorio | Ejemplo | Para qué |
|---|---|---|---|
| `--name` | ✅ | "Estética Norte" | Nombre del negocio |
| `--slug` | ✅ | `estetica-norte` | Identificador URL-safe único, clave de idempotencia y de direccionamiento |
| `--owner-email` | ✅ | `ana@...` | Login del dueño (OWNER) |
| `--owner-name` | opcional (default "Dueño/a") | "Ana Ruiz" | Nombre del OWNER |
| `--blueprint` | opcional (default `servicios`) | `carniceria` | Rubro → qué catálogo/branding se siembra |
| `--timezone` | opcional (default AR/Buenos_Aires) | `America/...` | Zona horaria del tenant |
| `--password` | opcional | — | Si no se pasa, **se genera una y se muestra una sola vez** |
| branding (`--city`, `--whatsapp`, …) | opcional | — | Pisa los defaults del blueprint |

**Mínimo absoluto:** nombre + slug + email del dueño. El resto tiene defaults
sensatos por rubro. *(No frenar por datos: lo que falte se completa con el default
del blueprint y se corrige después desde el panel — módulo Localización.)*

### 1.3 Qué se genera automáticamente

En una sola transacción el script crea:

1. **Tenant** (`name`, `slug`, `timezone`).
2. **Usuario OWNER** con hash scrypt (ADR-017). La contraseña de bootstrap **nunca
   vive en el repo**: se pasa por flag/entorno o se genera al azar y se imprime
   **una única vez** para comunicarla por canal seguro; el dueño la cambia en el
   primer login.
3. **BusinessSettings** (branding/localización): horarios públicos por defecto
   (`Lun a sáb · 9 a 19 h` para servicios) + los defaults de marca del blueprint,
   pisados por cualquier flag que se haya pasado.
4. **Catálogo base editable del rubro** — "nunca una pantalla vacía" (ADR-009 §5):
   el negocio abre el sistema y ya tiene algo usable, no un formulario en blanco.
   El detalle por rubro está en la §2.

### 1.4 En cuánto queda operativo

**Minutos.** Es un comando; la parte lenta es humana (comunicar la contraseña al
dueño y que cargue sus datos reales). Apenas corre, el OWNER ya puede entrar a
`/admin`, ve su catálogo de ejemplo cargado y empieza a reemplazarlo por lo suyo.

### 1.5 El gate de hoy (por qué el próximo cliente NO es solo correr el comando)

Hay **un solo tenant vivo** (CH Estética / Carolina). Por diseño de seguridad
(ADR-015), en el instante en que exista una **2ª fila** en `Tenant`, la resolución
de tenant "falla cerrada" y **rompe la app para todos** hasta que esté activo el
aislamiento de base (RLS de Postgres, ADR-018). Por eso:

- El script **se niega a crear el 2º tenant si RLS no está activo** (aborta con un
  error explícito, no deja nada a medias). Es una garantía, no un bug.
- El **RLS ya está escrito y verificado offline pero NO aplicado** a la base real
  (`prisma/rls/`, ADR-018). Aplicarlo es **Gate 2**: cambio de estructura de la DB
  de producción → requiere **OK explícito del dueño** y ensayo previo en una rama de
  Neon.

> **En una línea:** dar de alta el 2º cliente = activar RLS **+** correr el alta. Son
> el mismo trabajo (ADR-019 §2.d). El 1er cliente ya está; el 2º arranca ese gate.

**Flujo real del próximo alta:**

| # | Paso | Quién | Gate |
|---|---|---|---|
| 1 | Ensayar RLS en rama de Neon con un tenant sintético | Nosotros | — |
| 2 | Aplicar RLS a producción (`migrate deploy` + policies) | Nosotros, con OK del dueño | **Gate 2** |
| 3 | Correr `npm run provision -- --blueprint …` contra la base real | Nosotros | Gate del script (ya pasa RLS) |
| 4 | Comunicar credencial al OWNER; el negocio carga sus datos | Dueño del negocio | — |

### 1.6 Cómo quedaría cuando sea self-service (futuro 🔜)

Hoy el alta es **operada por nosotros** a propósito (Fase 1 semi-manual, ADR-019
§2.a): con ~1 alta cada muchos meses, un portal público de registro es superficie de
ataque y mantenimiento que no se justifica todavía. El camino cuando las altas sean
frecuentes:

- **Portal self-service:** el cliente se registra, elige rubro + plan, paga, y el
  sistema **corre el mismo `provisionTenant()` solo** (el core ya es una función
  reutilizable, no solo un script de consola).
- **Consola super-admin** (ADR-021): superficie interna nuestra, con **identidad de
  operador separada** del login de los tenants (nunca god-mode desde la cuenta de un
  cliente), que en su versión mínima es una envoltura del script de alta + ver estado
  de la plataforma.

Ambos están **diferidos y ya encuadrados** en sus ADR: el día que se justifiquen, no
se improvisan.

---

## 2. Qué viene PREDEFINIDO por blueprint

Un **Blueprint** es **configuración pura sobre el Core** (ADR-002): define qué rubro
se está dando de alta, su catálogo mínimo, su branding por defecto y qué capacidades
usa — **sin schema propio ni código duplicado**. Vive en `src/blueprints/`
(`servicios.ts`, `carniceria.ts`, `generico.ts`, registro en `index.ts`). Hoy hay
**tres**: dos verticales modelados (servicios, carnicería) y **uno comodín**
(`generico`) para todo lo demás.

### 2.1 Comparación: servicios vs carnicería vs genérico (comodín)

| Dimensión | `servicios` (estética / spa / salón) ✅ | `carniceria` (carnicería / retail) ✅ | `generico` (comodín, cualquier rubro) ✅ |
|---|---|---|---|
| **Flujo de negocio núcleo** | Agenda de **turnos** por profesional | **Mostrador / POS**: venta y pedidos, sin turnos | **Flexible**: catálogo + caja; agenda disponible si la usa |
| **Catálogo base sembrado** | 1 box, 1 categoría "General", 2 **servicios** de ejemplo, 1 **profesional** de ejemplo | ~14 **cortes** de ejemplo (lomo, asado, picada, pollo, cerdo…) | 1 categoría "General" + 2 **servicios** + 2 **productos** de ejemplo (editables) |
| **Unidad de venta** | Servicio con `durationMin` + `price` | **Por kg** (`saleUnit=WEIGHT`, `pricePerKg`) y por unidad | Por unidad; el negocio ajusta lo que venda |
| **Horarios** | WorkingHours **Lun–Sáb 9–19** por profesional + leyenda pública | Sin horario por profesional; leyenda **Mar–Dom 9–20** | Leyenda pública **Lun–Vie 9–18** (editable); sin profesionales pre-sembrados |
| **Stock** | No central (se descuenta al completar turno) | `stock` + `lowStockAt` por corte | Disponible en los productos de ejemplo |
| **Capabilities centrales** (declaradas) | `agenda:manage`, `clients:manage`, `catalog:manage`, `reports:read` | `catalog:manage`, `orders:manage`, `clients:manage`, `reports:read` | **Superset sensato**: catálogo, clientes, **caja (orders)**, agenda, reportes |
| **Branding por defecto** | Genérico (horarios spa); se completa desde el panel | Marca **magra** premium *(datos de contacto provisionales)* | Neutro editable (`shortLabel "Tu negocio"`); el descubrimiento lo pisa con lo real |
| **Roles** | OWNER / RECEPTION / **PROFESSIONAL** | OWNER / RECEPTION (mostrador) | OWNER / RECEPTION; PROFESSIONAL si trabaja por turnos |
| **Cuándo se usa** | Rubro matchea estética/spa/salón | Rubro matchea carnicería/retail | **Fallback**: cualquier rubro no modelado (guardrail, §2.4) |

> Los precios, stock y datos de contacto de los blueprints son **provisionales a
> confirmar** / **de ejemplo editable** (para que catálogo, vidriera y POS se vean
> poblados desde el día uno). No son la lista real de nadie: el negocio los edita en
> su catálogo. En `generico` los precios arrancan en 0 a propósito ("poné tu precio").

### 2.2 Qué comparten los dos (es el mismo Core)

Clientes, cobros (`Payment`), cupones, auditoría, usuarios/roles (ADR-017),
reportes y el módulo de Localización son **capacidades del Core** que cualquier
vertical reutiliza. Lo único que cambia entre rubros es **catálogo + unidad de venta
+ flujo (turnos vs POS) + marca** — configuración, no código.

### 2.3 Gap honesto: las pantallas todavía NO se filtran por rubro ⚠️

Hoy el menú del panel (`AdminShell`) se muestra **según el rol** del usuario, **no
según el vertical del tenant**. Consecuencia real: un tenant de carnicería y uno de
estética ven **el mismo menú** — a la carnicería le aparece "Agenda" (que no usa) y
al salón le aparece "Pedidos". El campo `capabilities` de cada blueprint hoy es
**documental**; no apaga pantallas todavía.

**Propuesta de cierre (🔜, Supuesto):** persistir el vertical en el tenant
(`Tenant.blueprintId`) y filtrar el menú por las capabilities del blueprint activo,
además del rol. Así la carnicería no ve "Agenda" y el salón no ve "Pedidos". Es un
cambio chico y de alto impacto en la primera impresión; queda como próximo paso
(candidato a `/sesion-feature`, atado a formalizar el ADR-024 del blueprint retail).

### 2.4 El blueprint comodín (`generico`) y el guardrail de negocio ✅

**Regla de negocio (guardrail):** *"si tu negocio no está acá, lo solucionamos"*
significa **acomodarlo sobre lo que ya existe** (el blueprint `generico` + config +
módulos + branding), **nunca** un desarrollo a medida para un solo cliente. Un fork
por cliente está prohibido por FUNDAMENTOS §1 y ADR-002: multiplica el mantenimiento y
mata la economía del SaaS. El comodín es la materialización de esa regla.

- **Qué es:** un vertical universal (`src/blueprints/generico.ts`) que arranca con un
  catálogo flexible (servicios **y** productos de ejemplo), clientes, caja y
  facturación — usable desde el día uno, nunca una pantalla vacía, sin asumir un flujo
  puntual (no siembra profesionales; si el negocio trabaja por turnos, los agrega).
- **Cuándo cae acá:** cuando el rubro del cliente no matchea ningún vertical modelado.
  Lo decide el **selector** (§3.2.1), que nunca falla: matchea un vertical o cae al
  comodín.
- **Cómo deja de ser genérico:** el descubrimiento (§3) pisa el branding neutro con la
  marca real, activa/desactiva módulos y carga el catálogo del cliente → el tenant
  genérico se **siente hecho para ese negocio** sin haber tocado una línea de código.
- **Cuándo se "gradúa" a vertical propio (Supuesto):** si un rubro repite (varios
  clientes de ferretería, kiosco, etc.) y acumula reglas propias que la config no
  cubre, recién ahí se modela un blueprint nuevo — una fila en el registro, no un fork.
  Hasta entonces, el comodín los cubre a todos.

---

## 3. Cómo sería la VENTA / onboarding comercial (propuesta de producto)

> **Estado: PROPUESTA 🔜.** No hay decisión tomada de planes/precios: ADR-021 §1
> difiere explícitamente "planes/pricing/facturación de clientes" a trabajo futuro
> (Feature Flags, ADR-006). Todo lo de esta sección es criterio propio para discutir,
> marcado **(Supuesto)** donde corresponde.

### 3.1 El principio: en todo momento el cliente siente que el producto es para SU negocio

Hoy el alta toma 3 datos y siembra un catálogo de ejemplo. Eso alcanza para un caso
estándar, pero **vender "personalizado" empieza antes del alta**: una **fase de
descubrimiento** captura qué necesita cada cliente y produce una **ficha de tenant
(Tenant Spec)** que provisiona un tenant **ya customizado**, no genérico. Esa misma
fase es, a la vez, la herramienta de venta.

**Principio rector (UX):** de la primera pregunta al primer login, el cliente nunca ve
un producto genérico — ve **su** negocio. En concreto eso significa: el descubrimiento
usa el vocabulario de su rubro; el sistema abre con **su** catálogo, **su** marca y
**sus** módulos; y **si su rubro no está modelado, igual entra a algo hecho a su
medida** vía el comodín + branding (nunca "tu rubro no existe, esperá"). El comodín
(§2.4) es lo que hace que ese principio **no tenga excepciones**.

### 3.2 Fase de descubrimiento + customización PRE-alta (el configurador guiado)

Antes de provisionar, un **cuestionario guiado** —wizard self-service para casos
simples, o **entrevista asistida** para los complejos: mismo cuestionario, distinto
canal— releva:

| Bloque | Qué se pregunta | Cómo mapea al tenant |
|---|---|---|
| **Rubro** | ¿Qué tipo de negocio? | **Selector** rubro→blueprint (§3.2.1): vertical modelado **o comodín genérico** |
| **Tamaño** | ¿Cuántos profesionales / cajas / usuarios? | Tier + límites del plan |
| **Sucursales** | ¿Una o varias? | 1 = estándar; varias = Enterprise (multi-sucursal, hoy no soportado ⚠️) |
| **Módulos** | ¿Qué necesita usar? (agenda, POS, reservas online, lista de espera, reportes, comisiones, recordatorios) | Capacidades/pantallas activas del tenant |
| **Formas de cobro** | ¿Efectivo/manual? ¿Cobro online? | `Payment` manual (hoy) vs plugin **MercadoPago** (🔜) |
| **Integraciones** | ¿Factura electrónica? | Plugin **ARCA** (ADR-022) activable |
| **Marca** | Nombre público, logo, colores, contacto | `BusinessSettings` (hoy) + theming logo/colores (🔜) |
| **Catálogo** | ¿Cargamos su lista real o arranca con ejemplos? | Seed a medida vs blueprint vs import CSV (ADR-019 §2.c) |

**Salida:** una **Tenant Spec** (una ficha, técnicamente un JSON) con **doble función**:

- **Como venta:** es la propuesta/presupuesto y una demo — el cliente ve su sistema
  pre-armado **antes de pagar**. Muestra valor y **califica** al cliente (tamaño +
  módulos + integraciones → tier y precio).
- **Como insumo del provisioning:** es exactamente lo que parametriza el alta (§4). El
  descubrimiento y el alta dejan de ser dos mundos: **lo que se relevó vendiendo es lo
  que se siembra**.

*(Supuesto: el cuestionario y la Tenant Spec son propuesta; hoy el alta toma un
subconjunto —rubro + marca—. El resto se habilita parametrizando el script, §4.)*

#### 3.2.1 El selector de blueprint (esqueleto ya funcional) ✅

La pieza que traduce el rubro del descubrimiento en un blueprint **ya existe y está
probada**: `resolveBlueprint(rubro)` (`src/blueprints/index.ts`). Es el corazón del
onboarding hiper-personalizado y del guardrail (§2.4):

- Normaliza el texto del rubro (minúsculas, sin acentos) y lo matchea contra pistas por
  vertical (`estética/spa/salón/peluquería…` → `servicios`; `carnicería/carne/pollo…` →
  `carniceria`).
- **Si matchea**, el tenant nace con ese vertical (se siente hecho para su negocio).
- **Si no matchea nada, cae al comodín `generico`** — nunca falla, nunca fuerza un
  desarrollo a medida. Sumar pistas o un vertical nuevo es **una fila de datos**, no
  tocar el selector.

Ya está **cableado al provisioning**: el alta acepta `--rubro "texto libre"` y resuelve
el blueprint sola (o `--blueprint` explícito para forzarlo); `--list-blueprints` lista
los verticales disponibles para el configurador. Ejemplos verificados en local:

```
provision --rubro "spa y estética"   → blueprint servicios   (vertical modelado)
provision --rubro "ferretería"       → blueprint generico    (comodín: se acomoda)
provision --blueprint carniceria     → blueprint carniceria  (explícito)
```

Precedencia: `--blueprint` explícito › `--rubro` (selector) › default histórico
(`servicios`). Lo que falta para el flujo completo es sólo la **UI del configurador**
que recopile las respuestas y arme la Tenant Spec; la resolución rubro→tenant ya corre.

### 3.3 Tipos de implementación (tiers)

Un modelo escalonado: **el mismo Core y el mismo script**, distinto grado de
customización y de acompañamiento.

| Tier | Perfil típico | Descubrimiento | Customización | Quién provisiona | Soporte |
|---|---|---|---|---|---|
| **Express / autoservicio** | Caso estándar: monotributista que solo quiere ARCA, salón chico | Wizard self-service (minutos) | Blueprint estándar + marca; catálogo de ejemplo | El sistema solo (🔜), o nosotros en 1 paso | Autoservicio / docs |
| **Asistida / personalizada** | `magra`, o cliente con requerimientos propios | Entrevista guiada | Catálogo real cargado, módulos elegidos, integraciones (ARCA/MP), marca propia | Nosotros (o socio-canal) desde la Tenant Spec | Onboarding acompañado |
| **Enterprise / a medida** | Multi-sucursal o necesidades específicas | Relevamiento en profundidad | Todo lo anterior + multi-sucursal, migración de datos, config a medida | Proyecto de implementación | Dedicado |

**Qué determina el tier (Supuesto)** — una matriz simple sobre las respuestas del
descubrimiento:

- **≥2 sucursales** o config a medida → **Enterprise**.
- **Catálogo real a cargar / integraciones / módulos no estándar** → **Asistida**.
- **Caso estándar, 1 sucursal, sin customización** → **Express**.

Cada tier **recibe** lo de su fila; ninguno cambia el Core — cambia cuánto se
customiza y quién lo opera.

### 3.4 Cómo mapea a la venta (qué se cobra)

Dos componentes de precio, en proporción inversa al tier: **setup/implementación**
(one-time, paga el trabajo de customización) + **suscripción** (recurrente, paga el
uso de la plataforma).

| Tier | Setup / implementación | Suscripción | Canal típico | Prueba gratis |
|---|---|---|---|---|
| **Express** | $0 o mínimo (self-service) | Plan base mensual | Directo / web | Trial 14–30 días con catálogo de ejemplo |
| **Asistida** | Fee de implementación (descubrimiento + carga inicial) | Plan según módulos | Directo o **contador-socio** | El descubrimiento **es** el trial guiado (ve su tenant pre-armado) |
| **Enterprise** | Proyecto cotizado | Plan mayor + por volumen | Directo / socio | Piloto acordado |

- **Rol del contador-socio (canal):** revende a su cartera, cobra su **fee de
  implementación** y opera las altas; nosotros cobramos la **suscripción** (o
  revenue-share). El Plugin **ARCA** es el gancho natural ("te lo dejo facturando
  legal"). Escala con la consola super-admin (ADR-021) para que gestione sus tenants
  sin ver los de otros.
- **Ejes de plan/precio (Supuesto):** por rubro/tamaño · por capacidades activas (base
  vs reportes/WhatsApp/MP) · por plugins (ARCA) · por volumen (turnos/pedidos/
  usuarios). No decidido — ADR-021 §1 difiere planes/pricing.

### 3.5 El "primer día" del cliente, por tier

Nunca una pantalla vacía (gracias al blueprint); qué tan "listo" arranca depende del tier:

- **Express:** entra a un tenant con el **catálogo de ejemplo de su rubro**; cambia la
  contraseña y reemplaza los ejemplos por lo suyo (marca, catálogo, equipo, horarios).
- **Asistida:** entra a un tenant que **ya tiene SU catálogo, SU marca y SUS módulos**
  cargados desde el descubrimiento → arranca casi listo, solo revisa y ajusta.
- **Enterprise:** sesión de arranque acompañada, con **datos migrados** y config a
  medida ya aplicada.

**Meta:** del "compré" al "lo estoy usando con mis datos" en **minutos** (Express) o en
una **sesión de onboarding** (Asistida/Enterprise), nunca en semanas.

---

## 4. Motor de customización (cómo se refleja técnicamente, sin forkear)

**Regla que no se rompe:** toda customización es **configuración/datos por tenant +
módulos activables + plugins**, nunca código por cliente. Un fork por cliente está
prohibido por FUNDAMENTOS §1 y ADR-002 (paga N veces cada fix y mata la economía del
SaaS). El motor son **cuatro palancas** sobre el mismo Core:

| Palanca | Qué customiza | Dónde vive | Estado |
|---|---|---|---|
| **1. Blueprint (rubro)** | Catálogo, flujo (turnos/POS), branding y capabilities base | `src/blueprints/*` + `--blueprint`/`--rubro` + `resolveBlueprint()` | ✅ Existe (servicios, carniceria, **generico** comodín + selector) |
| **2. Branding por tenant** | Nombre público, contacto, horarios / logo, colores | `BusinessSettings` / theming | ✅ datos · ⚠️ logo+colores por tenant (🔜) |
| **3. Módulos activables por tenant** | Qué capacidades/pantallas ve ese tenant | (propuesto) `Tenant.blueprintId` + `TenantModule` | 🔜 No persiste hoy: `Tenant` no tiene el campo y el nav filtra por rol, no por tenant (§2.3) |
| **4. Plugins** | Integraciones externas (ARCA, MercadoPago) | Contrato evento/comando (ADR-002/020) | ⚠️ ARCA en curso · MP 🔜 |

### 4.1 De la Tenant Spec al alta: parametrizar `provision-tenant.ts`

`provisionTenant(prisma, params)` **ya es spec-driven en su núcleo**: hoy acepta
`name, slug, owner, blueprint, branding, skipCatalog`. La customización pre-alta es
**extender esa ficha**, no reescribir el alta — cada extensión es aditiva y respeta la
idempotencia/transaccionalidad ya probadas.

```
Descubrimiento (wizard / entrevista)          §3.2
        │
        ▼
   Tenant Spec  (JSON: versionable, reproducible, auditable)
   { name, slug, owner, blueprint,
     plan, modules[], plugins[],        ← extensiones propuestas (🔜)
     branding{ logo, colores, … },
     catalog: "blueprint" | "custom" | "import-csv" }
        │
        ▼   (aprobación / venta)
   provisionTenant(prisma, spec)  →  tenant PRE-CONFIGURADO
        │
        ▼
   Primer día del cliente                       §3.5
```

**Extensiones propuestas a `ProvisionParams`** (🔜, Supuesto), cada una aditiva:

- `plan?: string` y `modules?: string[]` → persistir en `Tenant.blueprintId` + tabla
  `TenantModule`, y encender/apagar pantallas **por tenant** (cierra el gap §2.3).
- `plugins?: string[]` (`arca`, `mercadopago`) → activar integraciones por tenant.
- `catalogSource: "blueprint" | "custom" | "import-csv"` → sembrar el catálogo **real**
  del cliente en vez de los ejemplos (el import CSV ya está diferido, ADR-019 §2.c).
- `branding` con logo/colores → theming por tenant.

**Propiedad clave:** la Tenant Spec es el **"archivo de implementación"** — versionable
en git, reproducible (mismo spec → mismo tenant, por la idempotencia del script) y
auditable. La implementación de un cliente deja de ser un chat perdido: es un artefacto.

### 4.2 Qué falta construir (checklist 🔜, en orden)

Para habilitar los tiers completos: **RLS aplicado** (ADR-018, gate del 2º tenant) ·
persistencia de módulos por tenant (`Tenant.blueprintId` + `TenantModule`) y **filtrado
de pantallas por tenant** (§2.3) · **theming** (logo/colores) por tenant · plugin
**MercadoPago** · **import de catálogo** a medida / CSV (ADR-019 §2.c) · para
Enterprise, **multi-sucursal** · **portal de descubrimiento** self-service (Express) y
**consola super-admin** (ADR-021, canal socio). Cada uno es su `/sesion-feature`;
**ninguno bloquea vender Asistida con la Tenant Spec hecha a mano** mientras tanto.

---

## Resumen para el dueño

- **Modelo de venta recomendado:** que la personalización empiece **antes del alta**.
  Una **fase de descubrimiento** (wizard o entrevista) releva rubro, tamaño,
  sucursales, módulos, cobro, marca, catálogo e integraciones, y produce una **ficha
  de tenant (Tenant Spec)** que sirve para **dos cosas a la vez**: es la propuesta de
  venta (el cliente ve su sistema pre-armado antes de pagar y nos ayuda a calificarlo)
  y es el insumo exacto que provisiona su tenant ya customizado.
- **Tres tipos de implementación:** **Express** (autoservicio, caso estándar tipo
  monotributista-solo-ARCA o salón chico: blueprint + marca, alta rápida) · **Asistida**
  (tipo `magra` o requerimientos propios: descubrimiento + catálogo real + módulos +
  integraciones cargados por nosotros) · **Enterprise** (multi-sucursal / a medida, con
  acompañamiento). Lo define la matriz sucursales + customización + integraciones.
- **Ningún rubro queda afuera (guardrail):** hay un **blueprint comodín (`generico`)**
  ya construido que cubre cualquier negocio no modelado —arranca con catálogo, clientes,
  caja y facturación usables— y un **selector** (también hecho y probado) que, del rubro
  que dice el cliente, elige su vertical o cae al comodín. "Si tu negocio no está acá, lo
  acomodamos sobre lo existente + config", **nunca** un desarrollo a medida para uno solo.
- **Cómo se cobra:** **setup/implementación** (one-time, más alto cuanto más se
  customiza) + **suscripción** (recurrente). Express ~$0 de setup; Asistida cobra la
  implementación; Enterprise es proyecto. El **contador-socio** es canal: revende a su
  cartera, cobra la implementación, nosotros la suscripción, con ARCA de gancho.
  *(Planes/precios concretos: aún sin decidir.)*
- **Cómo funciona la personalización sin forkear:** todo es **config por tenant +
  módulos activables + plugins** sobre el mismo Core (nunca código por cliente). El
  script de alta ya toma rubro y marca; se extiende para tomar también módulos, plugins
  (ARCA/MP) y catálogo a medida desde la Tenant Spec — la misma alta, más parametrizada.
- **Primer día, según tier:** Express arranca con catálogo de ejemplo de su rubro y lo
  reemplaza; Asistida arranca con **su** catálogo/marca/módulos ya cargados; Enterprise
  con datos migrados. Nunca una pantalla vacía.
- **Para habilitarlo falta** (ninguno bloquea vender Asistida ya): aplicar RLS (gate del
  2º cliente, con tu OK), persistir módulos por tenant y filtrar pantallas por rubro
  (hoy la carnicería ve "Agenda" y el salón "Pedidos"), theming por tenant, plugin
  MercadoPago e import de catálogo. Cada uno es una sesión de trabajo aparte.
