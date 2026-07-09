---
id: ADR-020
nivel: evolutiva
dominio: [Arquitectura]
depends_on: [ADR-002, ADR-003, ADR-005, ADR-006, ADR-017]
---
# ADR-020: Contrato de API pública del Core — qué comando/consulta expone cada Business Capability y dónde está su límite

**Estado:** Aceptado — describe el contrato vigente y fija la regla de límites hacia adelante (2026-07-04)
**Concretiza:** la línea *"Contrato de API pública del Core (qué comandos expone cada Business Capability)"* que el INDEX listaba como candidata. Baja la abstracción de ADR-002 (Core/Blueprint/Plugin) al set de operaciones que el repo **ya tiene**.
**Depende de:** ADR-002 (Plugins hablan por eventos/comandos, nunca acceso directo al Core), ADR-003 (qué capabilities tiene el piloto "Servicios"), ADR-006 (Integration Engine: cada Plugin declara manifiesto de eventos que consume y comandos que expone), ADR-005 (stack: monolito Next.js hasta que la escala duela), ADR-017 (`requireCapability(...)` es la puerta de autorización de toda operación).
**No implementa código.** La salida es esta decisión más una regla de diseño. Adopta como contrato los nombres de Server Actions **que ya existen**; no los renombra ni los refactoriza.

---

## 1. Problema

ADR-002 dijo que Plugins y Blueprints tocan el Core *solo* por su "API pública" (comandos y eventos), nunca por la base ni el código interno. ADR-006 dijo que cada Plugin declara qué comandos consume. Pero **ninguno enumeró qué es, en concreto, esa API pública**: qué operaciones expone cada capability, cuáles son de escritura y cuáles de lectura, qué tablas es dueña cada una, y —lo más importante— **qué le está permitido tocar a una capability de otra**.

Hoy eso no está escrito en ningún lado. Está *implícito* en el código: hay ~90 Server Actions repartidas en archivos por dominio (`actions.ts`, `catalog-actions.ts`, `client-actions.ts`, `coupon-actions.ts`, `reminders-actions.ts`, `reviews-actions.ts`, `user-actions.ts`, `auth-actions.ts`) que de facto **son** la API pública del Core. Funcionan, pero nadie fijó el contrato: qué convención de nombres marca comando vs. consulta, quién es dueño de qué tabla, y cuál es la regla cuando una operación de una capability necesita efecto sobre otra.

El costo de no fijarlo no es hoy —el sistema anda—; es el día que llegue el **primer Plugin** (ARCA es el candidato) y haya que decir "el Plugin llama a *este* comando y escucha *este* evento". Si para entonces el contrato nunca se explicitó, cada quien va a improvisar la puerta de entrada del Plugin contra un Core cuyos límites nadie escribió, y el "los Plugins nunca tocan la base directo" de ADR-002 se va a violar sin que nadie lo note.

Y hay un segundo costo, ya visible en el código: **sin una regla escrita, los límites entre capabilities se cruzan solos.** Ejemplo concreto y real (`src/lib/actions.ts`, `completeAppointment`): al completar un turno, Scheduling **escribe directo** `Product.stock` de la capability Producto, dentro de su propia transacción. Anda —es atómico— pero es exactamente el cruce de límites que un "contrato de API pública" existe para nombrar y encauzar.

**Restricción de la sesión (alineación explícita):** *simple-y-correcto-ahora* sobre *elegante-para-escala-que-no-existe*. Este ADR **no** introduce una capa de API nueva, ni un framework de CQRS, ni un bus de eventos interno, ni separa el monolito en servicios. Describe el contrato que ya existe, le pone convención y regla de límites, y reserva la parte event-driven (outbox) para el borde donde de verdad hace falta: el Plugin, que todavía no existe.

## 2. Qué se decide (y qué no)

Lo que **sí**: (a) nombrar las tres superficies de la "API pública del Core" y cuáles existen hoy; (b) fijar la convención comando/consulta; (c) declarar la propiedad de tablas por capability y la regla de cruce de límites; (d) enumerar el contrato vigente por capability; (e) decidir qué hacer con los cruces que ya existen en el código.

Lo que **no**: renombrar Server Actions, extraer módulos, montar un bus, materializar capabilities que el código todavía no tiene (Orden, Factura), ni construir nada. Es sesión de decisión.

## 3. Las tres superficies de la "API pública del Core"

ADR-002 habló de "API pública" como si fuera una sola cosa. En realidad son tres superficies, y **solo una existe hoy**:

| # | Superficie | Quién la consume | Estado hoy | Forma |
|---|---|---|---|---|
| **I** | **UI → Core** (Server Actions) | El propio front de `/admin` y las páginas públicas de reserva | **Existe — es el 100% de la API pública real hoy** | Funciones `async` con `"use server"`, agrupadas por dominio. Comando o consulta. |
| **II** | **Plugin → Core** (comandos públicos) | Plugins externos (ARCA, MP, WhatsApp) — vía worker | **No existe** (no hay plugins). Reservada. | El *mismo* comando de la superficie I, invocable desde el worker del Plugin. Ej. futuro: `RegisterFiscalDocument(...)` de ADR-002. |
| **III** | **Core → Plugin** (eventos de dominio) | Plugins que escuchan (`InvoiceCreated`, `PaymentReceived`) | **No existe.** Reservada (outbox de ADR-002). | Evento en tabla `outbox` dentro de la transacción de negocio; worker lo despacha. |

**Decisión:** la API pública del Core = la unión de la superficie **I** hoy. Las superficies **II y III son la misma superficie I proyectada sobre el borde del Plugin** cuando ese borde exista — no una API distinta que haya que construir aparte. El día que llegue ARCA, sus comandos se **agregan al contrato de la capability que corresponda** (Factura/Pago) con la misma forma que una Server Action, y sus eventos se declaran en el manifiesto de ADR-006. No se construye una "capa de API" nueva: se extiende la que ya hay al nuevo consumidor.

Corolario: **no se construye outbox ni bus de eventos en esta etapa.** Adentro del Core, dos capabilities se coordinan por llamada de función en proceso dentro de una transacción (ver §5). La consistencia eventual (outbox/eventos) entra *solo* en el borde III, *solo* cuando haya un Plugin. Antes es infraestructura para un caso que no existe.

## 4. Convención comando / consulta (CQRS-lite, sin framework)

El código ya la sigue casi entera; este ADR la fija como contrato para que sea regla, no costumbre:

- **Comando** — muta estado. Empieza con `requireCapability("<recurso>:<acción>")` (ADR-017) como primera línea; corre dentro de `prisma.$transaction` cuando toca más de una fila o sostiene un invariante; escribe al audit; revalida paths. Se nombra por **verbo**: `create* / update* / delete* / toggle* / complete / cancel / confirm / mark* / set* / send* / broadcast*`.
- **Consulta** — solo lectura, cero efectos secundarios. Se nombra `get*`.

No es un framework ni una librería de CQRS: es una **convención de nombre y forma** sobre funciones normales. Adoptarla como contrato cuesta cero (ya está) y da la propiedad que importa: leer el nombre de una operación dice si muta o no, y toda mutación pasa sí o sí por la puerta de autorización.

## 5. Propiedad de tablas y regla de cruce de límites

**Regla de propiedad:** cada capability es **dueña de sus tablas**. Una capability solo lee/escribe sus propias tablas. La lista de dueños está en §6.

**Regla de cruce (el corazón de este ADR):** para producir un efecto sobre *otra* capability, una operación **no escribe la tabla ajena**: llama al **comando público** de esa otra capability (hoy: una llamada de función en proceso) o —en el borde del Plugin— emite un evento. La tabla ajena se toca solo a través de la puerta pública de su dueño.

**Por qué la llamada en proceso alcanza hoy (y no hace falta un bus interno):** somos un monolito con **un** cliente Prisma y **una** transacción de base. Cuando Scheduling necesita descontar stock al completar un turno, envolver "completar turno" + "descontar stock" en un `prisma.$transaction` da atomicidad fuerte y sincrónica: o pasan las dos o ninguna. Un bus de eventos interno daría consistencia *eventual* —peor, no mejor— para algo que hoy resolvemos con una transacción. La coordinación event-driven paga solo cuando cruza un límite de proceso (el Plugin), no adentro del monolito.

### 5.a — Qué hacer con los cruces que ya existen (decisión honesta)

En el código hay hoy **un** cruce claro: `completeAppointment` (Scheduling) escribe `Product.stock` (Producto) directo. Decisión: **se adopta la regla para trabajo nuevo y el cruce existente se deja como está (grandfathering), no se reescribe ahora.**

El razonamiento es el de la sesión: en un monolito de un proceso, con una transacción de base, escribir la tabla vecina **no es un bug de correctitud** —la atomicidad ya está garantizada—. Extraerlo a un comando `Producto.consumeStock(...)` es una mejora de **acoplamiento y legibilidad**, no de correctitud. Reescribirlo hoy, sin que la capability Stock exista de verdad (ADR-003 la difiere hasta que se vendan productos físicos), sería refactor por el refactor: *elegante para una separación que todavía no rinde*. 

Entonces: el cruce queda **anotado como ítem de convergencia**, a plegar cuando la capability Stock se construya en serio (Fase 2 de ADR-003) o cuando aparezca un segundo consumidor de "descontar stock" que justifique la puerta única. Mientras haya **un** solo cruce y **un** solo consumidor, la regla vive como norma para lo nuevo, no como orden de reescribir lo que anda.

## 6. Contrato vigente por Business Capability

Capabilities de **negocio** del Blueprint "Servicios" (las que un Plugin o Blueprint podría tocar). Los nombres son los de las Server Actions **que ya existen** — este ADR los adopta, no los inventa.

| Capability | Dueña de (tablas) | Comandos públicos (mutan) | Consultas (`get*`) | Evento que emitiría (futuro, borde III) | Límite — qué NO hace |
|---|---|---|---|---|---|
| **Scheduling / Agenda** | `Appointment`, `WorkingHours`, `ProfessionalBlock`, `BoxBlock` | `createAppointment`, `createManualAppointment`, `createBookingFromModal`, `cancelAppointment`, `cancelMyAppointment`, `completeAppointment`, `markNoShow`, `setWorkingHours`, `createProfessionalBlock`, `deleteProfessionalBlock`, `createBoxBlock`, `deleteBoxBlock` | `getAgendaDay`, `getAppointments`, `getAvailableSlots`, `getMyAppointment`, `getDashboardData`, `getPublicBookingData` | `AppointmentBooked`, `AppointmentCompleted`, `AppointmentCancelled`, `NoShowMarked` | No emite factura ni cobra: al completar dispara el efecto de Pago/Stock por comando (hoy: cruce a Stock grandfathered, §5.a). No es dueña de Producto ni Cliente. |
| **Party — Cliente** | `Client` | (alta implícita hoy dentro de la reserva) | `getClients`, `getClient` | `ClientRegistered` | No agenda ni cobra. Cliente y Profesional son Party con distinto rol (ADR-003); no se fusionan con `User` (ADR-003 §Profesional≠Usuario). |
| **Party — Profesional** | `Professional`, `ProfessionalServiceCommission`, `ProfessionalNews` | `createProfessional`, `updateProfessional`, `deleteProfessional`, `toggleProfessionalActive`, `setProfessionalServiceCommission`, `createProfessionalNews`, `broadcastProfessionalNews` | `getProfessionalsWithServices`, `getPublicNews` | `ProfessionalCreated` | Un Profesional **no** es un Usuario (0..1, ADR-003). No maneja login ni permisos (eso es Users/Auth, §7). |
| **Producto / Catálogo** | `Service`, `ServiceCategory`, `Product`, `ServiceProduct`, `Resource`, `ServiceResource`, `Box`, `BoxBlock`(config) | `createService`/`updateService`/`deleteService`/`toggleServiceActive`, `createProduct`/`updateProduct`/`deleteProduct`/`toggleProductActive`, `createResource`/`updateResource`/`deleteResource`, `setServiceProducts`, `setServiceResources`, `createBox`/`updateBox`/`deleteBox`/`toggleBoxActive` | `getCatalog` | `ProductStockChanged` (futuro, cuando Stock sea capability propia) | `Product.stock` es suyo: la baja de stock **debería** entrar por un comando de Producto (hoy Scheduling lo escribe directo — cruce grandfathered, §5.a). |
| **Pago** | `Payment` | `confirmPayment` | (se lee vía la Agenda / el Cliente) | `PaymentReceived` | Registro **manual** en Fase 1 (ADR-003). No integra Mercado Pago (Plugin, Fase 2). Hoy `Payment` cuelga directo de `Appointment` (ver §6.a). |
| **Cupones** | `Coupon` | `createCoupon`, `deleteCoupon`, `toggleCouponActive` | `checkCoupon`, `getCoupons` | `CouponRedeemed` | Se valida y consume **server-side dentro de la transacción de reserva** (ADR-014). No descuenta por su cuenta fuera de esa puerta. |

### 6.a — Capabilities de ADR-003 que el código todavía NO materializó

ADR-003 modeló la cadena **Turno → Orden → Pago → Factura** para un ERP genérico. La realidad del repo es más simple y hay que decirlo: **no existen los modelos `Order` ni `Invoice`.** `Payment` cuelga **directo** de `Appointment` (1:1). Es decir, el camino de ingreso real hoy es **Scheduling → Pago**, sin Orden intermedia ni Factura.

**Decisión:** no se materializan Orden ni Factura de forma especulativa. Su contrato queda **reservado y descrito, pero vacío**, hasta que un need real lo fuerce:
- **Orden** entra cuando haga falta una venta multi-línea (varios servicios/productos en un mismo comprobante) que el 1:1 `Appointment↔Payment` no cubre.
- **Factura** entra con el **Plugin ARCA** (ADR-002/003 Fase 2): ahí nace el comando público `RegisterFiscalDocument(...)` y el evento `InvoiceCreated`, y recién ahí la capability Factura tiene contrato real.

Esto **no es una omisión**: es la simplificación correcta del vertical. ADR-003 las asumió por analogía con SAP; el negocio de Carolina todavía no las necesita. Cuando las necesite, este ADR ya dice dónde enchufan.

## 7. Capabilities transversales de plataforma (rol distinto)

No son capabilities de negocio que otras invoquen para operar: son **infraestructura del Core**. Se documentan aparte porque su contrato es de otra naturaleza.

- **Users / Auth / RBAC** (ADR-017) — dueña de `User`. Comandos: `login`, `logout`, `createUser`, `resetUserPassword`, `setUserActive`. Consulta: `getUsers`. **Rol:** es el **portero**, no un servicio que otras capabilities llamen para hacer negocio. Toda operación de las demás empieza con `requireCapability(...)`, que vive acá. Nadie más escribe `User`.
- **Notificaciones / Recordatorios** (ADR-012) — dueña de `MessageTemplate`. Comandos: `sendAppointmentReminder`, `broadcastProfessionalNews`. Consulta: `getReminderPanelData`. Punto de envío único con degradación elegante (EMAIL real / WHATSAPP simulado). Escucharía eventos de Scheduling en el borde III cuando exista.
- **Reviews** (reseñas) — dueña de `Review`. Comandos: `createReview`, `deleteReview`, `togglePublished`. Consultas: `getReviews`, `getPublishedReviews`.
- **Audit** (ADR-009/017) — dueña de `AuditLog`. **No expone comando público de escritura**: es un **sumidero** al que todo comando escribe vía `auditAdmin/auditPublic`. Consulta: `getAuditLog`. Nadie "llama" a Audit como negocio; toda mutación lo alimenta.

## 8. Regla de diseño (el porqué que se lee en 6 meses)

**La API pública del Core es el conjunto de Server Actions que ya existen, organizadas por capability, con una convención comando/consulta y una regla de propiedad: cada capability es dueña de sus tablas y solo afecta a otra por su comando público (llamada en proceso hoy; evento en el borde del Plugin mañana). No se construye una capa de API, ni CQRS con framework, ni un bus de eventos interno: el monolito con una transacción de base da la consistencia que un bus interno solo empeoraría. El outbox y los eventos de dominio (ADR-002) se reservan para el único borde donde la consistencia eventual paga —el Plugin—, y ese borde todavía no existe. Orden y Factura de ADR-003 quedan descritas pero vacías hasta que una venta multi-línea o el Plugin ARCA las fuercen.**

Los cruces de límite que ya están en el código (Scheduling→Stock) se encauzan como norma para lo nuevo y se dejan andar donde ya funcionan: en un solo proceso con una transacción, escribir la tabla vecina no rompe correctitud, y reescribirlo sin una segunda razón es refactor por el refactor.

## 9. Impacto

- **ADRs que toca:** concretiza ADR-002 (le pone nombres a "la API pública" y a "el comando público" que un Plugin llama) y ADR-006 (los comandos de §6 son los que un manifiesto de Plugin declararía consumir; los eventos de la columna 5 son los que declararía escuchar). Respeta ADR-003 pero **corrige su modelo contra el código** (no hay Orden ni Factura hoy; Pago cuelga de Turno). Reusa ADR-017 (`requireCapability` como puerta de todo comando) y ADR-005 (monolito, no servicios).
- **Código:** **cero cambios en esta sesión.** El ADR adopta los nombres existentes. Los ítems de convergencia (cruce Scheduling→Stock; nacimiento de Orden/Factura) quedan en la cola de handoff, disparados por un need real, no por este ADR.
- **Cuándo se vuelve a tocar:** (a) al llegar el primer Plugin (ARCA) — ahí se instancian las superficies II y III y nacen `RegisterFiscalDocument` + `InvoiceCreated` + el outbox; (b) cuando se construya la capability Stock — ahí se pliega el cruce grandfathered a un comando `Producto.consumeStock`.

## 10. Supuestos tomados (modo autónomo — el usuario está desde el móvil, no pudo confirmar en vivo)

Anotados para que la próxima sesión los valide o corrija sin re-descubrirlos:

1. **"API pública del Core" se leyó en sentido amplio y útil:** la superficie que existe hoy (UI→Core, Server Actions), porque es el único consumidor real. Si la intención era *solo* la API externa hacia Plugins (superficies II/III), el alcance se reduce a algo que **hoy está vacío** (no hay plugins) y el ADR sería prematuro. Tomé la lectura amplia: describir el contrato que ya opera y proyectarlo al borde del Plugin cuando exista.
2. **El contrato se describe a la granularidad de las capabilities tal como están en el código** (archivos de Server Actions + modelos Prisma), no a la lista idealizada de ADR-003. Donde divergen (no hay `Order`/`Invoice`), seguí el código y lo marqué (§6.a). Si se prefiere que el ADR fije el modelo *objetivo* de ADR-003 por encima del código actual, es una corrección para la próxima sesión.
3. **No se renombra ni refactoriza ninguna Server Action.** Es sesión de decisión (cero código) y renombrar 90 funciones sería churn sin retorno. El ADR adopta los nombres vigentes como contrato en vez de imponer un esquema nuevo.
4. **Users/Auth y Audit se clasificaron como transversales** (portero + sumidero), no como capabilities de negocio que otras invocan. Si se quiere tratarlas como capabilities de pleno derecho en el contrato, es un ajuste menor de §7.
5. **La regla de límites es "módulos lógicos en un monolito", no servicios físicos** — consistente con ADR-005/007 (monolito hasta 500–2000 tenants). Ninguna parte de este ADR adelanta la separación en servicios.
6. **El grandfathering del cruce Scheduling→Stock es la decisión, no un pendiente urgente.** Asumí que *simple-y-correcto-ahora* manda: con un solo cruce y un solo consumidor, la transacción ya da correctitud y la puerta única se construye cuando haya segundo consumidor. Si se prefiere pagar el refactor ya, es un `/sesion-feature` chico y aislado.

## 11. Decisión final

Se acepta el **contrato de API pública del Core** como: (1) tres superficies —UI→Core (existe), Plugin→Core y Core→Plugin (reservadas al borde del Plugin, hoy vacías)—; (2) convención comando/consulta sobre las Server Actions existentes, sin framework; (3) propiedad de tablas por capability y regla de cruce por comando público (llamada en proceso hoy, evento mañana); (4) el contrato por capability de §6, con Orden y Factura descritas pero **no materializadas** hasta que un need real las fuerce; (5) grandfathering del único cruce existente (Scheduling→Stock), encauzando la regla para lo nuevo sin reescribir lo que anda. Cero código y cero riesgo sobre producción hoy; lo que se gana es que el día del primer Plugin la puerta de entrada al Core ya está escrita, en vez de improvisarla contra un límite que nadie definió.
