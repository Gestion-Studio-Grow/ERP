---
id: ADR-021
nivel: evolutiva
dominio: [Plataforma]
depends_on: [ADR-001, ADR-006, ADR-015, ADR-017, ADR-018, ADR-019]
---
# ADR-021: Consola de operación / super-admin — plano de plataforma separado, scope y secuencia

**Estado:** Aceptado — pendiente de implementación (2026-07-04)
**Evolución de:** ADR-019 §2.a-B (el "panel super-admin dentro de `/admin`" que ADR-019 descartó por ahora y dejó diferido) y ADR-009 §5 (visión de onboarding/administración de plataforma).
**Depende de:** ADR-015 (resolución de tenant fail-closed — la consola es, por definición, la superficie que *no* resuelve un único tenant por request), ADR-018 (RLS — la consola es cross-tenant y por eso choca de frente con el backstop de aislamiento), ADR-019 (provisioning — la consola es, en su versión mínima, una envoltura del script), ADR-017 (RBAC — la pregunta central: ¿reusa el enum de roles o es un plano de autorización separado?), ADR-001 (multi-tenant), ADR-006 (Feature Flags — futuro: planes/pricing por tenant).
**No implementa código.** La salida es esta decisión; la implementación es una `/sesion-feature` posterior, atada al gate del 2º tenant (§4).

---

## 1. Problema

Hoy "administrar la plataforma" (no un tenant, sino **la plataforma entera**) es un conjunto de acciones sueltas contra dashboards de terceros y el repo:

- **Dar de alta un tenant** = correr un script a mano (ADR-019, aún sin implementar).
- **Ver salud/estado** = mirar el dashboard de Neon, los logs de Netlify, o abrir un cliente SQL a mano.
- **Verificar el gate de RLS** (¿está activo?, ¿cuántos tenants hay?) = leer código o correr un query suelto.
- **Soporte técnico sobre un tenant** = no existe superficie; sería tocar la base directo.

Ninguna de estas acciones tiene *hoy* un lugar propio, y ADR-019 explícitamente **difirió** el "panel super-admin" (su opción 2.a-B) por sobredimensionado para un ritmo de altas de ~1 cada muchos meses. Este ADR no reabre esa decisión: la respeta y la **scopea con precisión** — define *qué sería* esa consola, *de qué depende*, *dónde debe vivir por seguridad*, y *qué versión mínima (si alguna) tiene sentido hoy* — para que el día que se justifique no se improvise su forma más delicada: una superficie con privilegio sobre **todos** los tenants.

El problema forzante no es que falte la consola hoy (con un solo tenant, los dashboards de Neon/Netlify alcanzan). El problema es el mismo patrón de los ADR-015/018/019: **el día que haya varios tenants, alguien va a construir bajo presión una superficie con god-mode cross-tenant, probablemente pegada a la app del tenant, reusando su sesión y su rol de DB** — y eso, mal hecho, es el peor agujero de seguridad posible en un multi-tenant. Esta decisión existe para fijar el plano y la separación **antes**, con calma.

### Qué NO es (delimitación dura del alcance)

- **NO es el panel del tenant (`/admin`).** Ese ya existe y es del OWNER/RECEPTION/PROFESSIONAL de *un* tenant (ADR-017). La consola es de **nosotros, operadores de la plataforma**, y ve *a través* de los tenants. Son dos superficies con dos audiencias y dos planos de autorización distintos. Mezclarlas es el error que este ADR previene.
- **NO es un portal self-service de registro público.** ADR-019 §2.a-A lo descartó (superficie de ataque nueva, demanda inexistente). La consola es interna, operada por nosotros; no hay alta pública.
- **NO es gestión de planes/pricing/facturación de clientes** (suscripciones, límites por plan). Eso es trabajo futuro sobre Feature Flags (ADR-006) y se difiere hasta que exista un modelo de planes real.
- **NO se construye como UI completa hoy.** Como en los ADR hermanos, esto es diseño + secuencia; el código es una feature-session posterior, disparada por el 2º tenant.
- **NO adelanta el multi-tenant real ni RLS.** El diferimiento de ADR-010/018 sigue en pie; esta decisión solo fija dónde y cómo vivirá la consola el día del gate.

## 2. Alternativas evaluadas

### 2.a — Plano de autorización: ¿reusa el RBAC de ADR-017 o es un plano separado?

Ésta es la decisión de fondo, no un detalle de implementación.

**A. Agregar `SUPERADMIN` al `enum UserRole` de ADR-017 (descartada — es el error de seguridad que el ADR previene)**
- **Costo aparente:** bajo (un valor más en el enum, un `requireRole("SUPERADMIN")`).
- **Por qué está mal:** `UserRole` es **tenant-scoped por diseño** (ADR-017 §2.a: cada `User` cuelga de un `tenantId`). Un super-admin *no pertenece a ningún tenant* — pertenece a la plataforma. Meterlo en el mismo enum significa que **una fila `User` de un tenant cualquiera podría escalar a god-mode cross-tenant**: el blast radius de una cuenta OWNER comprometida, de un `requireRole` mal escrito, o de un bug de autorización, pasa de "un tenant" a "toda la plataforma". Se estaría poniendo la llave maestra de la plataforma en el mismo llavero que la de cada negocio. Viola el principio de menor privilegio en el eje más caro.
- **Descartada sin ambigüedad.** El privilegio de plataforma y el privilegio de tenant son **ejes de autorización distintos** y no deben compartir tabla, enum, ni sesión.

**B. Plano de identidad/autorización separado para la consola *(elegida)***
- La consola tiene su **propia identidad de operador**, desacoplada de `User`/`UserRole`. Hoy, el "super-admin" somos literalmente **nosotros** (el equipo con autorización de deploy) — no hay un segundo operador. Así que la Fase mínima **no necesita una tabla nueva de admins**: alcanza una credencial de operador gestionada por entorno (secreto fuera del repo, patrón de bootstrap de ADR-017) + allowlist/gate de acceso. Una tabla `PlatformAdmin` propia se construye recién cuando haya más de un operador con necesidad de identidad y auditoría distinta — no antes (mismo criterio "simple y correcto ahora" de todo el proyecto).
- **A favor:** el privilegio de plataforma nunca es alcanzable desde la sesión de un tenant. Un OWNER comprometido no toca la consola. Los dos planos evolucionan por separado.
- **En contra:** dos mecanismos de auth conviviendo. Aceptable: son dos superficies con dos audiencias; que no compartan credencial es la propiedad de seguridad, no un costo accidental.

### 2.b — Separación arquitectónica: ¿dentro de la misma app (ruta protegida) o superficie separada?

**A. Ruta protegida dentro de la misma app Next (`/superadmin` junto a `/admin`)**
- **Costo:** bajo (una ruta más, un guard más).
- **Riesgo — y acá está el nudo:** la app del tenant, por ADR-018, se conecta a Postgres con un **rol sin `BYPASSRLS`** y resuelve un único tenant por request. La consola es lo **opuesto**: necesita ver *a través* de los tenants (listar todos, agregar métricas, tocar la tabla `Tenant`). Para eso necesita un camino de DB que **evada RLS** (o un rol con `BYPASSRLS`, o una conexión admin dedicada). Si ese camino vive en el **mismo proceso/misma app** que sirve al tenant, entonces el backstop de aislamiento de ADR-018 queda **derrotado desde adentro**: basta un bug de routing, una confusión de sesión, o un SSRF/path-traversal para que la superficie con `BYPASSRLS` quede expuesta al tráfico de tenant. Se estaría metiendo la única llave que saltea RLS en el mismo edificio que RLS protege.
- **Descartada como destino**, aunque ver §3 para el pragmatismo de la Fase mínima (con un solo tenant y sin RLS todavía, el `BYPASSRLS` ni existe).

**B. Superficie separada, con su propio camino de credenciales y su propia conexión de DB *(elegida como destino)***
- **Costo:** medio. Una superficie aparte (como mínimo un deploy/entrypoint distinto, o un binario/CLI operado; a lo sumo una app chica separada) con su propia credencial de operador (§2.a-B) y su **propia conexión/rol de DB** — el único lugar donde vive el acceso cross-tenant / `BYPASSRLS`, **físicamente separado** del Prisma Client que usa la app del tenant.
- **A favor:** el aislamiento de ADR-018 se mantiene íntegro — la app del tenant nunca tiene en su proceso el poder de saltear RLS. La superficie de ataque de la consola es chica y no comparte sesión, cookie ni cliente de DB con el tenant. Es la separación que convierte "god-mode cross-tenant" de riesgo latente en superficie contenida y auditada.
- **En contra:** más piezas operativas (un deploy/credencial/rol extra). Es el precio correcto de no derrotar el propio backstop.

### 2.c — Superficie de la consola: ¿UI web o CLI/script operado?

**A. UI web rica desde el día uno (dashboard, tablas, botones)** — sobredimensionada para operar 1–2 tenants; es la trampa de "elegante para la escala que no existe". **Descartada por ahora.**

**B. Envoltura fina sobre el script de provisioning + vistas read-only *(elegida para la Fase mínima)*** — la consola arranca siendo, en lo esencial, (i) el script de ADR-019 con un entrypoint operado y (ii) lecturas de salud/estado. Cero o casi cero mutación por UI. La UI rica se construye cuando haya varios tenants que administrar seguido. Coherente con ADR-019 (que ya eligió "script operado" sobre "panel/portal").

## 3. Decisión

Se adopta **2.a-B (plano de autorización separado) + 2.b-B (superficie separada como destino) + 2.c-B (envoltura fina para la versión mínima)**.

- **Plano separado:** la consola de operación es un **plano de plataforma distinto del RBAC de tenant (ADR-017)**. **No** se agrega `SUPERADMIN` a `UserRole`. Su identidad es una credencial de operador gestionada por entorno mientras el operador seamos nosotros; una tabla `PlatformAdmin` propia espera a que haya más de un operador.
- **Superficie y DB separadas (destino):** el acceso cross-tenant / que evade RLS vive en una **superficie separada con su propia conexión de DB**, nunca en el proceso ni el Prisma Client de la app del tenant. Ésta es la propiedad de seguridad central: la app que sirve tenants jamás tiene, en su proceso, el poder de saltear el aislamiento que ADR-018 construye.
- **Versión mínima = envoltura del provisioning + salud read-only**, no UI rica.

**Regla de diseño (el porqué que se lee en 6 meses):** **la administración de la plataforma y la administración de un tenant son dos planos de privilegio distintos, y se mantienen físicamente separados — distinta identidad, distinta sesión, distinta conexión de DB — porque la consola es la única superficie que legítimamente evade el aislamiento multi-tenant, y meter esa llave en el mismo proceso que sirve a los tenants derrota el backstop (RLS, ADR-018) desde adentro.** El super-admin no es "un rol más" del enum de tenant: es un eje de autorización aparte, y por eso no comparte llavero con el OWNER de ningún negocio.

**Aclaración explícita (restricción viva de la sesión de arquitectura):** este ADR **no** construye la consola ni adelanta RLS/multi-tenant. Respeta el diferimiento de ADR-019 (el panel super-admin sigue diferido) y de ADR-010/018 (RLS sigue diferida). Lo único que cambia es que el "cómo y dónde vivirá la consola" deja de ser una improvisación futura: queda decidido el plano y la separación, listos para el día del gate.

## 4. Fases recomendadas (qué hoy, qué al 2º tenant, qué diferido)

El acople con el 2º tenant es el mismo que ata ADR-015/018/019: **la consola tiene sentido real recién cuando hay más de un tenant que administrar**, porque su razón de ser es ver *a través* de tenants — y eso es exactamente lo que hoy no existe.

- **Fase 0 — hoy (con 1 tenant): casi nada, y a propósito.**
  - El provisioning sigue siendo el **script** de ADR-019 (ya decidido). No se construye consola.
  - *Opcional, solo si la fricción operativa es real:* una vista/CLI **read-only** de salud de plataforma (conteo de tenants, ¿RLS activo?, estado del gate del 2º tenant, último deploy). **Advertencia honesta:** con un solo tenant, los dashboards de Neon y Netlify ya cubren esto; construir la vista propia hoy es duplicar lo que ya se ve gratis. Solo vale si operar aún un tenant genera fricción medible — si no, es "elegante para la escala que no existe" y se difiere. **Recomendación por defecto: no construir Fase 0**; anotarla como semilla y seguir.
- **Fase 1 — disparada por el 2º tenant (junto a ADR-018 + ADR-019, mismo trabajo):** consola mínima como **superficie separada** con credencial de operador propia y **conexión de DB propia** (el único camino con acceso cross-tenant / `BYPASSRLS`). Contenido mínimo: (i) **listar tenants + salud** (read-heavy), (ii) **ejecutar el provisioning** envolviendo el script de ADR-019, (iii) **ver/operar el gate de RLS** (estado, disparo del ensayo en branch de Neon). Pocas mutaciones, todas auditadas.
- **Fase 2 — diferida (varios tenants, cuando duela):** operaciones ricas — acceso de soporte/impersonation controlado y auditado a un tenant, suspender/dar de baja un tenant, planes/feature flags por tenant (ADR-006), métricas agregadas, UI web propiamente dicha. Se difiere hasta que el volumen lo justifique; anotado, no cerrado.

## 5. Supuestos tomados (modo autónomo — el usuario no pudo confirmar en vivo)

Anotados para que la próxima sesión los valide o corrija sin re-descubrirlos:

1. **El operador de plataforma somos nosotros** (el equipo con autorización de deploy), y **hay uno solo hoy**. Por eso la identidad de la consola arranca como credencial de entorno, no como tabla `PlatformAdmin`. Si mañana hay operadores distintos con necesidad de auditar quién-hizo-qué a nivel plataforma, sube a tabla propia.
2. **No hay 2º cliente firmado ni fecha** (consistente con ADR-018/019). La consola se scopea ahora, se construye recién en el gate del 2º tenant. Si hubiera un 2º cliente inminente, la Fase 1 de este ADR entra junto a ADR-018/019 como un solo trabajo.
3. **"For me" = interno, no self-service.** Interpreté el pedido (consola técnica "estilo panel for me") como superficie de operador **interna**, no un portal de cliente. El self-service sigue descartado/diferido por ADR-019.
4. **La separación de DB (conexión/rol propios que evaden RLS) es real recién cuando RLS exista** (ADR-018, gate del 2º tenant). Hoy, sin RLS y con un tenant, el `BYPASSRLS` ni aplica; el supuesto es que el **destino** es superficie separada, y la Fase mínima ya nace de ese lado para no tener que "despegarla" después bajo presión.
5. **Planes/pricing quedan fuera** de este ADR y se atan a ADR-006 (Feature Flags) cuando exista un modelo de planes — no se scopean acá para no arrastrar una decisión de negocio que hoy no está tomada.

## 6. Impacto

- **ADRs que toca:** concretiza y scopea el "panel super-admin" que **ADR-019 §2.a-B** dejó diferido (de "diferido, sin forma" a "diferido, con plano/separación/fases decididos"). Refuerza **ADR-018** (nombra explícitamente que la consola es la superficie que evade RLS y por eso debe estar separada — el backstop no se derrota desde adentro). Se apoya en **ADR-015** (la consola es, por definición, lo que rompe el supuesto "un tenant" del fail-closed: vive fuera de la resolución por request). Marca un **límite explícito con ADR-017** (el privilegio de plataforma NO entra en `UserRole`). No pisa ningún diferimiento (ADR-010/018/019 siguen en pie).
- **Código (implementación en `/sesion-feature` posterior, no en esta sesión, disparo: 2º tenant):**
  - Superficie separada de operador con credencial propia (entorno) + su propia conexión/rol de DB (cross-tenant / `BYPASSRLS`), aislada del Prisma Client del tenant.
  - Envoltura operada del script de provisioning de ADR-019.
  - Vistas read-only de salud + estado del gate de RLS.
  - **Nada** de `SUPERADMIN` en `UserRole`; **nada** de acceso cross-tenant en el proceso de la app del tenant.
- **Migración:** ninguna por este ADR. Una eventual tabla `PlatformAdmin` es trabajo de Fase 2, condicionado a >1 operador.
- **BACKLOG:** sin ítems de negocio invalidados. La consola es infra/operación, no feature de negocio del tenant.
- **Cola de handoff (ADR-016):** se agrega `/sesion-feature consola de operación / super-admin (ADR-021)` atada al gate del 2º tenant (junto a ADR-018/019), y se anota la Fase 0 opcional como "no construir por defecto".

## 7. Decisión final

Se acepta: la **consola de operación / super-admin es un plano de plataforma separado del RBAC de tenant** (no se agrega `SUPERADMIN` a `UserRole`), vive en una **superficie separada con su propia identidad de operador y su propia conexión de DB** —el único camino que evade RLS—, y su versión mínima es una **envoltura del script de provisioning (ADR-019) + salud read-only**, no una UI rica. **Fase 0 (hoy): no construir por defecto** —con un solo tenant los dashboards de Neon/Netlify alcanzan—; **Fase 1: al 2º tenant, como el mismo trabajo que ADR-018 + ADR-019**; **Fase 2: diferida** (impersonation de soporte, baja de tenant, planes/flags, UI rica). Cero código y cero riesgo sobre producción hoy; lo que se gana es que la superficie más peligrosa de un multi-tenant —una con god-mode sobre todos los tenants— queda con su plano y su separación decididos con calma, en vez de improvisados pegados a la app del tenant bajo presión. La implementación es una `/sesion-feature` que leerá este ADR el día que aparezca el 2º cliente.
