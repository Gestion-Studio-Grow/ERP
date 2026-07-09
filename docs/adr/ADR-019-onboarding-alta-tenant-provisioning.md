---
id: ADR-019
nivel: evolutiva
dominio: [Plataforma]
depends_on: [ADR-001, ADR-015, ADR-017, ADR-018]
---
# ADR-019: Onboarding / alta de tenant nuevo (provisioning) — script operado, no portal self-service

**Estado:** Aceptado — pendiente de implementación (2026-07-04)
**Concretiza:** ADR-009 §5 (onboarding / alta de tenant) para la arquitectura real del piloto (Camino A), bajando su visión self-service a la Fase 1 que el negocio hoy tiene.
**Depende de:** ADR-001 (multi-tenant: todo cuelga de un `tenant_id`), ADR-017 (bootstrap del OWNER — patrón de siembra de usuario), ADR-015 (resolución fail-closed — su throw es lo que fuerza el orden del alta), ADR-018 (RLS + resolución por request — **el alta del 2º tenant es su disparador**).
**No implementa código.** La salida es esta decisión; la implementación es una `/sesion-feature` posterior.

---

## 1. Problema

Hoy dar de alta un tenant es **editar `prisma/seed.ts` a mano y correrlo contra Neon** — el propio INDEX lo marca: *"provisioning — hoy no existe, cada tenant se crea a mano"*. Ese seed además está atado a los datos reales de Carolina (sus 5 servicios, sus 3 profesionales): no es un alta genérica, es la carga inicial de **un** negocio puntual mezclada con borrados de tablas (`deleteMany`) que en producción son una bomba.

El problema no es que falte hoy un 2º tenant (no lo hay, ni hay fecha). El problema es el mismo que resolvió ADR-018 para RLS: **el día que aparezca un 2º cliente, alguien va a improvisar el alta a mano, bajo presión, editando un seed destructivo contra una base que es producción real.** Y peor: el alta de un 2º tenant no es una operación aislada — en el instante en que exista una 2ª fila en `Tenant`, `getCurrentTenantId()` **lanza error para toda la app** (ADR-015, por diseño). Es decir: provisionar el tenant #2 y activar RLS + resolución por request (ADR-018) son **el mismo trabajo**, no dos tareas separadas.

Esta decisión existe para fijar *con qué forma* se da de alta un tenant, con calma y antes, en vez de descubrirlo en caliente. Es puro diseño (más un script versionado) y no toca al tenant vivo.

**Restricción dura (no negociable):** nada de lo que se decida acá puede tocar el tenant de Carolina. El alta de un tenant nuevo es aditiva; el tenant #1 sigue igual.

## 2. Alternativas evaluadas

### 2.a — Forma del provisioning

**A. Portal self-service público (registro + wizard de 4 pasos + importador CSV), como pinta ADR-009 §5**
- **Costo:** alto. Página de registro pública, flujo transaccional de alta, wizard de UI, importador CSV con vista previa y tolerancia a datos sucios, datos demo borrables. Todo eso a construir y mantener.
- **Riesgo:** un registro **público** es superficie de ataque nueva (alta masiva de tenants basura, spam, abuso de recursos) que hoy no existe y habría que blindar. Y encima resuelve una demanda que no existe: **un** cliente, cero en el horizonte.
- **Descartada por ahora:** es el ejemplo de manual de "elegante para una escala que no existe". ADR-009 §5 la describe como *objetivo* self-service pero aclara que *"Fase 1 puede ser semi-manual"* — este ADR toma esa Fase 1. El portal se revisita cuando las altas sean frecuentes y self-service sea una ventaja competitiva real, no antes.

**B. Panel super-admin dentro de `/admin` para crear tenants por UI**
- **Costo:** medio. Menos que el portal, pero igual hay UI que construir y mantener, y **autorización cross-tenant nueva**: hoy el OWNER es un rol *por-tenant* (ADR-017) — no existe el concepto de "super-admin que ve/crea todos los tenants", y meterlo abre una superficie de privilegio que hoy no hay.
- **Descartada por ahora:** sobredimensionada para un ritmo de altas que va a ser ~1 cada muchos meses. El concepto de super-admin es justamente lo que se difiere hasta tener varios tenants que administrar.

**C. Script de provisioning idempotente, operado por nosotros (`scripts/provision-tenant.ts`) *(elegida)***
- **Costo:** bajo. Reusa el patrón `upsert`-by-`slug` ya probado en `seed.ts`, versionado en el repo, corrido contra Neon con la misma autorización permanente de deploy del equipo. Cero UI, cero superficie pública nueva.
- **A favor:** el alta queda **repetible y auditable en git** (no un seed editado a mano y perdido); es **idempotente por `slug`** (correrlo dos veces no duplica); es **transaccional** (todo-o-nada: o el tenant queda completo o no queda nada); y no comparte código con el `seed.ts` de demo de Carolina (que tiene `deleteMany` destructivos) — son dos cosas distintas y se separan.
- **En contra:** no es self-service; cada alta la corremos nosotros. Es exactamente lo aceptable para la Fase 1 semi-manual de ADR-009 §5. Cuando duela (varios clientes, altas seguidas), se sube a B o A — anotado, no cerrado.

### 2.b — Con qué queda poblado un tenant recién creado

**Vacío (descartada):** contradice ADR-009 §5 (*"nunca una pantalla vacía"*). Un tenant sin nada es una mala primera impresión y deja al negocio frente a un formulario en blanco.

**Copiar el seed de Carolina (descartada):** son **sus** servicios y **sus** precios, no una plantilla neutra. Clonarlos mete datos de un negocio en otro.

**Catálogo blueprint mínimo y editable *(elegida)*:** el alta siembra el andamiaje mínimo del Blueprint "Servicios" — el `Tenant` (con `name`, `slug`, `timezone`), el `User` OWNER (patrón ADR-017), horarios de atención por defecto (Lun–Sáb 9–19, como ya hace el seed) y un puñado de categorías/servicios de ejemplo **marcados como plantilla editable/borrable**. Es "nunca vacío" (espíritu de ADR-009 §5) sin ser los datos de nadie en particular. La carga real la hace el negocio después, desde el panel.

### 2.c — Importador de datos (CSV de clientes)

**Diferido.** El importador CSV que pide ADR-009 §5 es una **feature de migración de datos**, no parte del alta en sí: un tenant queda operativo sin él. Se construye cuando exista un cliente concreto con una lista real que importar (ahí se diseña contra sus datos sucios de verdad, no contra supuestos). Queda anotado en la cola de handoff, fuera del camino crítico del provisioning.

### 2.d — Momento

Igual que ADR-018: **se decide la forma ahora, se ejecuta el alta real recién cuando haya un 2º cliente.** Escribir el script y esta decisión es riesgo cero sobre el tenant vivo (idempotente por `slug`, aditivo, no toca a Carolina). El alta real del tenant #2 **arrastra ADR-018** — no se puede correr el provisioning para un tenant nuevo sin haber activado antes RLS + resolución por request, porque `getCurrentTenantId()` rompe la app en cuanto hay 2 filas. Ese acople es la garantía, no un bug.

## 3. Decisión

Se adopta **C + catálogo blueprint mínimo (2.b) + importador diferido (2.c) + momento diferido (2.d)**.

- **Forma:** un script `scripts/provision-tenant.ts`, versionado, idempotente por `slug`, transaccional (todo-o-nada), parametrizado (nombre del negocio, `slug`, email del OWNER). Crea el `Tenant`, siembra el `User` OWNER con contraseña de bootstrap comunicada por canal seguro (**nunca en el repo**, patrón ADR-017), y puebla el catálogo blueprint mínimo editable (horarios por defecto + categorías/servicios de ejemplo borrables). **No** comparte código con `prisma/seed.ts` (el seed de demo de Carolina, con sus `deleteMany`).
- **Gate compuesto:** correr este script para un tenant que **no** sea el #1 exige que ADR-018 (RLS + resolución de tenant por request) esté aplicado primero. El script mismo debe **negarse a correr** (o al menos frenar con un error explícito) si detecta que va a crear una 2ª fila en `Tenant` sin RLS activo — así el fail-closed de ADR-015 no queda como única red.

Regla de diseño (el porqué que se lee en 6 meses): **el alta de tenant de un SaaS con un solo cliente se resuelve con un script operado, idempotente y versionado — no con un portal self-service — y el provisioning del 2º tenant es inseparable de activar el aislamiento de DB (RLS). El self-service se construye cuando las altas frecuentes lo justifiquen, no antes.** ADR-015 detiene (throw si aparece un 2º tenant), ADR-018 dice cómo aislar, ADR-019 dice cómo dar de alta: los tres describen un mismo momento —el del 2º tenant— desde tres ángulos.

**Aclaración explícita (restricción viva de la sesión de arquitectura):** este ADR **no** adelanta el multi-tenant real ni construye nada hoy. El diferimiento de RLS (ADR-010/018) sigue en pie. Lo único que cambia es que el "cómo se da de alta un tenant" deja de ser "editar el seed a mano bajo presión": queda decidido, listo para el día del 2º cliente.

## 4. Impacto

- **ADRs que toca:** concretiza ADR-009 §5 (de "objetivo self-service" a "Fase 1 = script operado", con portal, panel super-admin e importador CSV diferidos y anotados). Acopla de forma explícita con ADR-018 (el alta del 2º tenant es su disparador y su gate) y con ADR-015 (su throw fuerza el orden). Reusa el bootstrap de OWNER de ADR-017. Respeta la válvula de escape de ADR-001 (schema/DB dedicado sigue reservada a enterprise, fuera de este flujo). No pisa ningún diferimiento.
- **Código (implementación en `/sesion-feature` posterior, no en esta sesión):**
  - `scripts/provision-tenant.ts` idempotente/transaccional/parametrizado: `Tenant` + `User` OWNER (scrypt, patrón ADR-017) + catálogo blueprint mínimo editable + horarios por defecto.
  - Guard en el script que rechaza crear un 2º tenant si RLS (ADR-018) no está aplicado.
  - Separar conceptualmente del `prisma/seed.ts` de demo (que conserva sus `deleteMany` y los datos de Carolina, y **no** se usa para altas reales).
- **Migración:** ninguna nueva por este ADR (el modelo `Tenant` ya existe y alcanza).
- **BACKLOG:** ítem nuevo de negocio — "importador CSV de clientes" — diferido, para cuando haya un cliente con lista real.
- **Cola de handoff (ADR-016):** se agrega `/sesion-feature implementar script de provisioning (ADR-019)` y se ata al gate de ADR-018.

## 5. Supuestos tomados (modo autónomo — el usuario no pudo confirmar en vivo)

Anotados acá para que la próxima sesión los valide o corrija sin re-descubrirlos:

1. **No hay un 2º cliente firmado ni fecha.** Asumí que el objetivo es decidir la *forma* del alta, no dar de alta a nadie hoy (consistente con "cada tenant se crea a mano" del INDEX). Si ya hubiera un 2º cliente inminente, esto sube de prioridad y arrastra ADR-018 ya.
2. **El direccionamiento del tenant** (subdominio vs. path vs. sesión) es parte del trabajo de *resolución por request* de ADR-018, **no** de este ADR. Acá el identificador es el `slug` único que ya existe en el modelo `Tenant`; lo provee el operador al correr el script. Si se prefiere fijar el esquema de URL antes, es una sub-decisión para la sesión de ADR-018.
3. **El provisioning lo corremos nosotros** (operador), no el cliente — Fase 1 semi-manual de ADR-009 §5. Ningún registro público en esta fase.
4. **Bootstrap del OWNER** reusa el patrón de ADR-017: contraseña de bootstrap por canal seguro, retirada del entorno una vez sembrado el usuario; email del OWNER como identificador de login.
5. **Idempotencia por `slug`** como el `upsert` actual del seed. Correr el script dos veces con el mismo `slug` no duplica ni pisa datos ya cargados por el negocio.

## 6. Decisión final

Se acepta **C**: alta de tenant como script operado (`scripts/provision-tenant.ts`), idempotente por `slug`, transaccional, que siembra tenant + OWNER (patrón ADR-017) + catálogo blueprint mínimo editable, con portal self-service, panel super-admin e importador CSV **diferidos** hasta que las altas frecuentes los justifiquen. El alta del 2º tenant queda como gate compuesto con ADR-018 (RLS + resolución por request): son el mismo trabajo. Cero código y cero riesgo sobre producción hoy; lo que se gana es que el alta más delicada —crear el 2º tenant en una base de producción— queda decidida con calma en vez de improvisada bajo presión. La implementación es una `/sesion-feature` que leerá este ADR el día que aparezca el 2º cliente.
