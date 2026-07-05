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
(`servicios.ts`, `carniceria.ts`, registro en `index.ts`). Hoy hay **dos**.

### 2.1 Comparación estética/salón vs carnicería/retail

| Dimensión | `servicios` (estética / spa / salón) ✅ | `carniceria` (carnicería / retail) ✅ |
|---|---|---|
| **Flujo de negocio núcleo** | Agenda de **turnos** por profesional | **Mostrador / POS**: venta y pedidos, sin turnos |
| **Catálogo base sembrado** | 1 box, 1 categoría "General", 2 **servicios** de ejemplo (con duración y precio), 1 **profesional** de ejemplo | ~14 **cortes** de ejemplo (lomo, asado, picada, pollo, cerdo…) |
| **Unidad de venta** | Servicio con `durationMin` + `price` | **Por kg** (`saleUnit=WEIGHT`, `pricePerKg`) y **por unidad** (`saleUnit=UNIT`, `price`) — venta por peso es el diferencial del rubro |
| **Horarios** | WorkingHours **Lun–Sáb 9–19** por profesional + leyenda pública | Sin horario por profesional; leyenda pública **Mar–Dom 9–20** |
| **Stock** | No central (se descuenta al completar turno) | `stock` + `lowStockAt` por corte (aviso de bajo stock) |
| **Capabilities centrales** (declaradas) | `agenda:manage`, `clients:manage`, `catalog:manage`, `reports:read` | `catalog:manage`, `orders:manage`, `clients:manage`, `reports:read` |
| **Branding por defecto** | Genérico (horarios spa); se completa desde el panel | Marca **magra** premium: `shortLabel "magra · Canning"`, horarios, nota "cortes seleccionados, retiro y envío" *(dirección/WhatsApp/IG son placeholders provisionales)* |
| **Roles** | OWNER / RECEPTION / **PROFESSIONAL** (la agenda por profesional tiene sentido) | OWNER / RECEPTION (mostrador); PROFESSIONAL casi no aplica *(Supuesto: a futuro convendría un rol "Cajero", §2.3)* |

> Los precios, stock y datos de contacto del blueprint de carnicería son
> **provisionales a confirmar** (valores de referencia AR mediados-2026 para que la
> vidriera y el POS se vean poblados en la demo). No son la lista real de magra: el
> negocio los edita en su catálogo.

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

---

## 3. Cómo sería la VENTA / onboarding comercial (propuesta de producto)

> **Estado: PROPUESTA 🔜.** No hay decisión tomada de planes/precios: ADR-021 §1
> difiere explícitamente "planes/pricing/facturación de clientes" a trabajo futuro
> (Feature Flags, ADR-006). Todo lo de esta sección es criterio propio para discutir,
> marcado **(Supuesto)** donde corresponde.

### 3.1 Dos formas de vender, no una

| Escenario | Quién provisiona | Cuándo conviene | Estado |
|---|---|---|---|
| **Asistido** | Nosotros (o un socio-canal) corremos el alta | Pocas altas, cliente que quiere "que se lo dejen andando" | ✅ Soportado hoy (el script) |
| **Auto-servicio** | El sistema solo, tras registro + pago | Altas frecuentes; el self-service pasa a ser ventaja competitiva | 🔜 Diferido (portal + facturación + modelo de planes) |

**(a) Asistido — lo que funciona hoy.** El cliente cierra por venta directa; nosotros
tomamos 3 datos (nombre, rubro, email del dueño) y corremos el alta. El negocio abre
el sistema ya poblado con el catálogo de su rubro y solo reemplaza por lo suyo.

- **Variante socio-canal (Supuesto):** un **contador o consultor** revende la
  plataforma **a su cartera** de clientes y opera las altas por ellos. Encaja natural
  con el Plugin **ARCA** de facturación (ADR-022) como gancho ("te lo dejo facturando
  legal"). Requeriría más adelante la consola super-admin (ADR-021) para que el socio
  gestione sus tenants sin tocar los de otros.

**(b) Auto-servicio — el futuro.** Registro público → elige **rubro** (servicios /
carnicería / …) y **plan** → paga → el sistema corre `provisionTenant()` solo y lo
manda a su panel ya poblado. Necesita, además del portal: modelo de **planes**,
**cobro de la suscripción**, y límites por plan. Todo diferido y encuadrado.

### 3.2 Qué definiría el plan / precio (Supuesto)

Ejes candidatos para armar planes (a decidir, no decididos):

- **Por rubro/tamaño:** un salón chico y una carnicería con sucursales no valen igual.
- **Por capacidades activas:** plan base (catálogo + agenda/POS + clientes) vs plan
  con **reportes avanzados**, **WhatsApp real**, **cobro online (MercadoPago)**.
- **Por plugins:** **ARCA** (facturación electrónica) como add-on de mayor valor.
- **Por volumen:** cantidad de turnos/pedidos, usuarios, o profesionales.

**Prueba gratis (Supuesto):** trial de ~14–30 días con el tenant ya provisionado y su
catálogo de ejemplo — el cliente "juega" con datos realistas de su rubro desde el
minuto uno; al vencer, paga o se pausa el tenant (nunca se borra dato).

### 3.3 El "primer día" del cliente

**Qué ve al entrar** (gracias al blueprint, nunca una pantalla vacía):

- Login con su email + la contraseña de bootstrap (que cambia ahí mismo).
- Un panel con su **catálogo de rubro ya cargado** (servicios de ejemplo o cortes de
  ejemplo), su **marca por defecto** y sus **horarios** puestos.

**Qué configura, en orden sugerido (Supuesto):**

1. **Su marca y contacto** (módulo Localización): nombre público, WhatsApp, dirección,
   Instagram, horarios reales.
2. **Su catálogo real**: reemplaza los ejemplos por sus servicios/cortes y precios.
3. **Su equipo**: da de alta profesionales (servicios) o cajeros/recepción, con sus
   roles (ADR-017).
4. **Sus horarios de atención** por profesional (servicios).
5. *(Opcional, según plan)* conecta cobro online, WhatsApp, o factura con ARCA.

**Meta de la experiencia:** que del alta al "estoy usándolo con mis datos" pasen
**minutos, no días** — el catálogo de ejemplo es el andamio para que el negocio no
arranque frente a un vacío.

### 3.4 Faltantes para habilitar el auto-servicio (checklist 🔜)

Para pasar de asistido a self-service hace falta, en orden: RLS aplicado (ADR-018) ·
portal de registro + selección de rubro/plan · modelo de **planes** y **cobro de
suscripción** · consola super-admin para soporte (ADR-021) · filtrado de pantallas
por vertical (§2.3). Cada uno es su propia `/sesion-feature`; ninguno bloquea seguir
vendiendo **asistido** mientras tanto.

---

## Resumen para el dueño

- **Cómo se da de alta hoy:** un comando (`npm run provision`) crea el negocio
  completo —tenant + usuario dueño + marca + catálogo de ejemplo— en minutos,
  idempotente y sin tocar a los demás clientes. Pedimos solo 3 datos: nombre, rubro y
  email del dueño.
- **El próximo cliente tiene un gate:** al ser el 2º tenant, primero hay que encender
  el aislamiento de base de datos (RLS, ya escrito y probado, falta aplicarlo con tu
  OK) — el alta y el aislamiento son el mismo trabajo, por seguridad.
- **Qué viene predefinido por rubro:** cada negocio nace usable, nunca vacío. Estética
  arranca con agenda de turnos, box, servicios y un profesional de ejemplo; carnicería
  arranca con catálogo de cortes con venta **por kg**, POS/pedidos y marca premium — el
  mismo sistema, distinta configuración, cero código duplicado.
- **Cómo venderlo:** hoy ya podemos vender **asistido** (lo damos de alta nosotros, o
  un contador-socio para su cartera). El **auto-servicio** (se registra, elige plan y
  se provisiona solo) es el futuro y necesita definir planes/precios —hoy sin decidir—.
- **Primer día del cliente:** entra, ve su catálogo de rubro ya cargado, cambia la
  contraseña, reemplaza los ejemplos por lo suyo y configura marca/equipo. De cero a
  "usándolo con mis datos" en minutos.
- **Gap a cerrar pronto:** las pantallas todavía se muestran por rol y no por rubro
  (la carnicería ve "Agenda", el salón ve "Pedidos"). Cambio chico, alta mejora en la
  primera impresión — próximo paso propuesto.
