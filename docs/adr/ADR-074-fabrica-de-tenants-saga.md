---
id: ADR-074
nivel: evolutiva
dominio: [Plataforma, Multi-tenant]
depends_on: [ADR-019, ADR-018, ADR-021, ADR-002, ADR-055]
---
# ADR-074: Fábrica de tenants — `provisionTenant` como saga (commit transaccional + efectos externos compensables)

**Estado:** Aceptado — **spec + scaffold** (esta iteración NO ejecuta provisioning real, NO toca prod, NO
llama Vercel/DNS/email). Todo efecto externo entra **stubbeado detrás de una interfaz**.
**Fecha:** 2026-07-10
**Depende de:** ADR-019 (alta de tenant / core transaccional idempotente), ADR-018 (gate RLS previo al 2º
tenant), ADR-021 (plano de operador / control-plane), ADR-002 (Core/Blueprint/Plugin — config sobre código),
ADR-055 (VARIANTE: el objeto se crea una vez y se reusa — acá reusamos el core, no lo reimplementamos)
**Relacionado:** ADR-065 (fundación — *fábrica de tenants + fábrica de módulos*): ADR-074 es la
**implementación concreta** (saga + máquina de estados + motor de dry-run) de la fábrica de tenants que
ADR-065 declara a nivel de fundamento. *(Renumerado desde ADR-061 al consolidar con la fundación 060–073.)*
**Relacionado:** RFC-003 (`docs/rfc/RFC-003-consola-alta-tenants.md` — la consola de operador que **consume**
este motor: el dry-run alimenta el wizard con preview en vivo) · ADR-040 (Gate) · ADR-030/041 (secretos los
pega el dueño) · el blueprint maestro Comercio/Empresa (`docs/estrategia/estructura-consolidada-producto.md`).

---

## Contexto

El rumbo de la Fase 2 es **la fábrica de tenants**: que dar de alta un cliente deje de ser artesanía. Hoy
existe **la mitad transaccional** de esa fábrica:

- **`provisionTenant(prisma, params)`** (`scripts/provision-tenant.ts`, **ADR-019**): el alta real. Es
  **idempotente por `slug`**, **transaccional** (todo-o-nada: Tenant + usuario OWNER + BusinessSettings +
  catálogo del blueprint, en una `$transaction`), **aditiva** (nunca borra), con el **gate RLS de ADR-018**
  antes de crear el 2º tenant. La envuelve la consola de operador (`provisionFromConsole`, ADR-021).

Lo que **no existe** todavía —y es lo que esta fase agrega— es la **orquestación alrededor** del commit de DB:

1. Un **contrato de entrada rico** (`ProvisionTenantInput`) que hoy está disperso entre el CLI, el form de la
   consola y `ProvisionParams`: sin `edicion` Comercio/Empresa (RFC-003 P1), sin `brandSheet`, sin `mode`
   dry-run/commit de primera clase, sin `idempotencyKey`.
2. Los **efectos externos** del alta (ligar host/DNS, invitar al admin) que el core de ADR-019 **no** cubre
   —y no debe: no son transaccionales con la DB—. Necesitan una **saga con compensación**.
3. Un **motor de dry-run estructurado** que resuelva el blueprint, **liste los objetos a crear**, detecte
   **colisiones de slug/host** y **advertencias de brand sheet**, **sin escribir** — el mismo motor que
   alimenta el wizard de la consola (RFC-003 §3.1) y el self-service futuro.

**Premisa que se corrigió en la Fase 0:** el mapa de terreno decía "greenfield, `provisionTenant` 0 hits".
**Es falso** — el core de ADR-019 y su consola ya existen. Este ADR **reusa** ese core (ADR-055: definir ≠
reinstanciar) y construye **encima**, no en lugar de.

---

## Decisión

La **fábrica de tenants** es una **saga** que envuelve el commit transaccional de ADR-019 y le suma los
efectos externos como pasos **compensables**. Se materializa como un módulo puro, testeable, con todo lo
externo detrás de **puertos** (interfaces) — para esta iteración, **stubs**.

### 1. Contrato de entrada — `ProvisionTenantInput`

Un único objeto de entrada, superset de `ProvisionParams` de ADR-019:

```
ProvisionTenantInput {
  slug            // normalizado y validado (kebab URL-safe); NO se auto-corrige en silencio (ADR-019)
  name            // razón visible del negocio
  rubro           // texto libre del descubrimiento → clave de blueprint (resolveBlueprint, ADR-002)
  blueprint?      // clave explícita; si viene, gana sobre `rubro`
  edicion         // "comercio" (lite) | "empresa" (enterprise) — el eje GROW-AR; nunca lite/enterprise al cliente
  empresa         // datos del negocio (timezone, contacto/localización → BusinessSettings)
  brandSheet?     // acento, tema, monograma, subdominio/host propuesto — la "hoja de marca"
  admin           // usuario OWNER inicial (nombre, email) — la membresía raíz (User rol OWNER)
  mode            // "dry-run" | "commit"
  idempotencyKey  // clave de idempotencia de la ORQUESTACIÓN (ver §4) — distinta del slug
}
```

`edicion` mapea a `Tenant.profile` (`lite`/`enterprise`, ya en el schema). Su **persistencia** requiere una
extensión aditiva mínima del core de ADR-019 (RFC-003 P1: "agregar `profile` a `provisionTenant`"), que este
ADR **especifica pero difiere** a la iteración de wiring (definir ≠ construir). El motor la transporta en el
plan y el committer la recibe; el adaptador default la anota como intención hasta que el core la persista.

### 2. Máquina de estados

```
  PENDING ──commit(tx ADR-019)──▶ DB_COMMITTED ──bindHost──▶ HOST_BOUND ──invite──▶ INVITED ──activate──▶ ACTIVE
     │                                │                          │                      │
     └────────────────────────────── cualquier fallo en un paso externo ───────────────┘
                                              │
                                              ▼
                                     FAILED_COMPENSATED   (se deshacen los efectos externos ya aplicados;
                                                            el commit de DB es aditivo e idempotente → NO se borra)
```

- **`PENDING → DB_COMMITTED`** es el **único paso transaccional** y es **exactamente** el core de ADR-019
  (todo-o-nada; si falla, no hay nada que compensar: la transacción no dejó rastro).
- **`DB_COMMITTED → HOST_BOUND → INVITED → ACTIVE`** son **efectos externos** (host/DNS, email de invitación,
  marca de activación). Cada uno es **compensable**.
- **`FAILED_COMPENSATED`** es el estado terminal de fallo: se ejecutan las compensaciones **en orden inverso**
  de los pasos externos ya completados. **El tenant en DB NO se borra** — es aditivo/idempotente (ADR-019): un
  reintento con el mismo `idempotencyKey` retoma desde `DB_COMMITTED` sin duplicar.

En esta iteración la máquina de estados es un **tipo + reducer puro** (`state-machine.ts`), no una tabla.
**Persistirla como tabla `ProvisioningRun`** (para reanudar sagas entre procesos y auditar el alta) es
**trabajo de la próxima iteración** — es una migración, y por tanto **Gate 2** (no se toca el schema acá).

### 3. Esqueleto `provisionTenant(input)` (orquestador)

Para no colisionar con el `provisionTenant` de ADR-019 (mismo nombre, otra capa), el orquestador se llama
**`runTenantProvisioning(input, deps)`**. Estructura:

- **Parte transaccional** (`PENDING → DB_COMMITTED`): delega en un **puerto `TenantCommitter`**. El adaptador
  default (`adr019Committer`) mapea `ProvisionTenantInput → ProvisionParams` y llama al core de ADR-019
  (Tenant + OWNER + catálogo del blueprint, en una sola transacción). **Reuso, no reimplementación.**
- **Parte saga** (efectos externos): puertos **`HostBinder`** (ligar subdominio/DNS) e **`Inviter`** (invitar
  al admin), con sus **compensaciones** (`unbindHost`, `revokeInvite`). **Todos stubbeados** en esta iteración.
- **Idempotencia por `idempotencyKey`** (§4).

### 4. Idempotencia — dos niveles, a propósito

- **Nivel DB (ADR-019): por `slug`.** Re-correr el commit con el mismo slug no duplica ni pisa (upsert).
- **Nivel orquestación (nuevo): por `idempotencyKey`.** Cubre **toda** la saga, no solo el commit: si el proceso
  muere entre `HOST_BOUND` e `INVITED`, reintentar con la misma `idempotencyKey` **no re-liga el host ni re-crea
  el tenant** — retoma. En esta iteración es un puerto **`IdempotencyStore`** (in-memory para tests); su
  persistencia real va junto con la tabla `ProvisioningRun` (Gate 2, próxima iteración).

### 5. Motor de dry-run (`planProvision`)

Mismo motor que usarán la **consola de operador** (RFC-003) y el **self-service** futuro. `mode: "dry-run"`
(o `planProvision(input)` directo) **no escribe**: 

1. **Normaliza y valida** slug y host (kebab URL-safe; no auto-corrige — ADR-019).
2. **Resuelve el blueprint** (`resolveBlueprint`/`getBlueprint`, ADR-002) y **reporta cómo se decidió**
   (explícito / rubro→vertical / comodín genérico).
3. **Deriva los módulos** de la edición (base del rubro + módulos Empresa si `edicion="empresa"`, respetando
   el invariante `enterprise ⊇ lite`).
4. **Lista los objetos a crear** (Tenant, usuario OWNER, BusinessSettings, catálogo del blueprint) — coarse,
   honesto: el catálogo se describe como "sembrado por el blueprint `<id>` si el tenant está vacío".
5. **Detecta colisiones**: slug ya usado, host/subdominio ya usado (vía puerto `CollisionChecker`).
6. **Advertencias de brand sheet**: acento desconocido, falta subdominio, monograma vacío, etc.

Devuelve un **`ProvisionPlan`** (objetos + resolución de blueprint + colisiones [error] + warnings). El wizard
lo pinta como preview en vivo; el commit sólo procede si no hay colisiones.

---

## Garantías (el contrato de la fábrica)

1. **Atomicidad del núcleo de datos:** Tenant + OWNER + catálogo se crean **todo-o-nada** (transacción ADR-019).
2. **Compensación de lo externo:** todo efecto externo aplicado se **deshace** ante un fallo posterior; el
   estado terminal de error es `FAILED_COMPENSATED`, nunca un alta a medio ligar.
3. **Idempotencia doble:** por `slug` (DB) y por `idempotencyKey` (saga). Reintentar es seguro.
4. **Aislamiento preservado:** el gate RLS de ADR-018 (2º tenant) sigue **dentro** del commit — la saga no lo
   evade. El motor corre sobre `operatorPrisma` (control-plane, ADR-021), nunca sobre `getCurrentTenantId()`.
5. **Config sobre código:** el vertical y su catálogo salen del blueprint (ADR-002); cero schema por rubro.
6. **Reuso, no fork:** el commit ES el core de ADR-019 (ADR-055). La saga es una capa nueva encima.

## Qué NO hace esta iteración (límites duros)

- **No** da de alta un tenant real, **no** toca Neon/prod, **no** llama Vercel/DNS/email — todo stub tras puerto.
- **No** modifica `schema.prisma` ni agrega migración (la tabla `ProvisioningRun` y la persistencia de
  `Tenant.profile` desde el alta son **Gate 2**, próxima iteración).
- **No** modifica el core de ADR-019 (`scripts/provision-tenant.ts`) — el adaptador lo consume tal cual.

## Consecuencias

**A favor:** la fábrica queda con un **contrato y un motor testeables sin DB**; la consola (RFC-003) y el
self-service tienen **un solo motor** de validación/preview; el día del wiring real sólo se cambian los stubs
por adaptadores (Vercel/DNS/email) y se agrega la tabla de sagas — sin re-arquitectura.

**En contra / deuda anotada:** la idempotencia por `idempotencyKey` y la reanudación de sagas son **in-memory**
hasta que exista `ProvisioningRun` (Gate 2); la persistencia de `edicion`/`profile` en el alta espera la
extensión aditiva del core. Ambas están especificadas acá para que la próxima iteración sea wiring, no diseño.

## Próxima iteración (no en este ADR)

1. **Consola de operador** sobre el motor (wizard RFC-003 §3, preview en vivo desde `planProvision`).
2. **Blueprints reales por rubro** (nutrir el catálogo Comercio/Empresa) + persistir `edicion→profile`.
3. **Wiring de efectos externos**: adaptadores reales `HostBinder` (Vercel/DNS) e `Inviter` (email) + tabla
   `ProvisioningRun` (migración = Gate 2) para reanudar y auditar.

— Elaborado por GSG (Arquitecto de Solución)
