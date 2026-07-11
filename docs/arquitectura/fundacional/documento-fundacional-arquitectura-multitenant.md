> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), documento fundacional del dueño. Incorporado a la rama fundacional sin alterar el contenido original.

---

# GSG — Documento Fundacional de Arquitectura Multi-Tenant

**Producto:** ERP vertical SaaS para micro-empresas / PyMEs argentinas
**Formato:** Documento de panel (arquitecto multi-tenant senior · arquitecto de seguridad · diseñador de onboarding/producto · challenger/red-team)
**Estado del stack:** Next.js 16 · Prisma 7 · PostgreSQL en Neon · Vercel · shared-schema con `tenantId` por fila · resolución de tenant por host
**Fecha:** 2026-07-09
**Naturaleza:** Decision-grade. Cada sección cierra con una recomendación firme, trade-offs honestos y `[SUPUESTO]` en lo no confirmado.

---

## 0. Tesis central del panel

El objetivo del dueño —"que dar de alta un tenant deje de parecer inventar la rueda por cada cliente"— **no es un problema de arquitectura de base de datos; es un problema de línea de producción.** El stack actual (shared-schema pooled) ya es la elección correcta para este segmento. Lo que falta no es cambiar el modelo de datos: es construir **una fábrica de tenants determinística** sobre una **capa de configuración versionada** (rubro → blueprint → edición → brand sheet), blindada por **aislamiento en la base de datos (RLS)**, y gobernada por **dos gates humanos que firman invariantes** mientras la IA construye y verifica dentro de esos límites.

Dicho de forma cruda: hoy cada alta es un acto de artesanía porque la configuración vive dispersa entre código, decisiones ad-hoc y pasos manuales. La solución es mover toda esa configuración a **dato curado y versionado**, y toda la ejecución a **un único procedimiento idempotente**. El resultado buscado es: **cero código por cliente, imposible que un alta quede a medias o colisione, imposible que un tenant vea datos de otro.**

Las tres decisiones que el dueño debe tomar están al final, en el Resumen Ejecutivo.

---

## 1. Modelo multi-tenant recomendado

### 1.1 Marco de referencia

Usamos la taxonomía canónica de AWS SaaS multi-tenancy, que es el vocabulario estándar de la industria:

- **Pool:** todos los tenants comparten la misma infraestructura y el mismo esquema; el aislamiento es lógico (una columna `tenantId` + control de acceso). Máxima eficiencia de costo, mínima fricción operativa, aislamiento más débil.
- **Silo:** cada tenant tiene infraestructura dedicada (su propia base de datos o su propio stack). Máximo aislamiento, máximo costo y complejidad operativa por tenant.
- **Bridge:** híbrido; se comparte parte de la pila y se aísla otra parte (p. ej. cómputo compartido pero base de datos por tenant, o esquema por tenant dentro de una base compartida).

### 1.2 Las opciones sobre la mesa

| Modelo | Aislamiento | Costo por tenant | Operabilidad (100%-IA) | Escala en nº de tenants | Veredicto para GSG |
|---|---|---|---|---|---|
| **Pooled shared-schema** (actual) | Lógico (RLS + app) | Muy bajo (marginal ~0) | Alta: un esquema, una migración, un deploy | Excelente (miles de tenants chicos) | **RECOMENDADO** |
| Schema-per-tenant | Medio (separación por schema) | Bajo-medio (overhead de catálogo por schema) | Baja: N schemas a migrar, riesgo de deriva | Se degrada tras cientos de schemas en Postgres | Solo como puente puntual |
| DB-per-tenant | Alto (base dedicada) | Alto (Neon cobra por base/cómputo) | Muy baja: N bases, N backups, N migraciones | Pobre para micro-empresas | Solo para tenant grande/regulado |
| Híbrido / "pods" (silo selectivo) | Alto para el aislado | Variable | Media (routing por tenant) | Bueno si es la excepción, no la regla | **Válvula de escape, no default** |

### 1.3 Recomendación

**Mantener y consolidar el modelo Pool (shared-schema, `tenantId` por fila), reforzado con Row-Level Security de Postgres.** Es la decisión correcta y ya está tomada implícitamente; el trabajo pendiente no es cambiarla sino **endurecerla** (ver Sección 3).

Justificación por eje:

- **Costo.** El segmento es micro-empresa: muchos tenants, ticket bajo, márgenes finos. El costo marginal de un tenant nuevo en pool es prácticamente cero (unas filas más). DB-per-tenant multiplicaría el gasto de Neon por la cantidad de clientes y haría inviable el precio.
- **Aislamiento.** El punto débil histórico del pool —"si me olvido un `WHERE tenantId` filtro datos"— se **resuelve moviendo el aislamiento a la base de datos con RLS**, no confiando solo en el filtro de aplicación. Con RLS bien configurada, el aislamiento del pool se acerca al del silo para la inmensa mayoría de amenazas realistas (ver 3.1).
- **Operabilidad con equipo 100%-IA.** Este es el factor decisivo. Un solo esquema significa **una sola migración, un solo deploy, un solo modelo mental** que la IA mantiene. Schema-per-tenant y DB-per-tenant multiplican por N la superficie de deriva ("un tenant quedó en una versión distinta de migración") —exactamente el tipo de trabajo manual que hay que eliminar.
- **Escala.** PostgreSQL en pool escala a decenas de miles de tenants pequeños sin problema. Los límites aparecen por tabla caliente (índices y particionado lo resuelven), no por cantidad de tenants.

### 1.4 Cuándo migrar un tenant a "pod" / silo

El pool es el default; el silo es la **excepción explícita y disparada por umbral**, no una decisión caso por caso. Un tenant se "gradúa" a pod (base dedicada o stack aislado) cuando cruza uno de estos gatillos —y todos deben quedar registrados como política, no como capricho:

1. **Volumen / vecino ruidoso:** el tenant genera carga que degrada a los demás (consultas pesadas, ingest alto) y el particionado por tenant ya no alcanza. `[SUPUESTO]` umbral inicial sugerido: cuando un solo tenant supera ~15-20% del cómputo o del almacenamiento del pool.
2. **Requisito de cumplimiento / contractual:** el cliente exige aislamiento físico de datos, residencia específica, o cláusulas de auditoría incompatibles con el pool.
3. **SLA diferenciado:** el cliente paga por un nivel de disponibilidad/soporte que requiere aislar el radio de impacto.
4. **Personalización profunda legítima:** el cliente necesita algo que no se puede expresar como configuración (caso que debe ser rarísimo si la Sección 4 se hace bien; si aparece seguido, es señal de que falta modelar un blueprint).

**Regla de oro:** graduar a pod debe ser también un procedimiento automatizado de la fábrica (Sección 2), no un proyecto manual. El modelo de datos es idéntico; cambia solo el destino de conexión (routing por tenant). Así el "bridge" nunca introduce código por cliente.

---

## 2. La fábrica de tenants (provisioning)

### 2.1 Principio

El alta de un tenant debe ser **una única función, invocable, determinística e idempotente**, que produce un tenant completo y operativo a partir de datos, sin intervención de código. Nombre de trabajo: `provisionTenant(input)`. Todo lo demás (consola de operador, self-service futuro, detección de marca por IA) son **disparadores** de esta misma función. Nunca debe existir un segundo camino de alta.

### 2.2 Contrato de la función

**Entrada (`ProvisionTenantInput`):**

- `slug` / subdominio deseado (validado y normalizado)
- `rubro` (clave del blueprint: `estetica`, `retail_velas`, `retail_padel`, `carniceria`, …)
- `edicion` (`comercio` | `empresa`)
- Datos de la empresa (razón social, CUIT, contacto)
- `brandSheet` (paleta/tipografía/densidad/layout como dato — puede venir de la detección por IA, ver 2.5)
- Usuario admin inicial (email, invitación)
- `mode`: `dry-run` | `commit`

**Garantías de salida (invariantes que la función SIEMPRE cumple):**

1. **Todo-o-nada (atomicidad):** o el tenant queda completo y utilizable, o no queda nada. Nunca a medias.
2. **Idempotencia:** re-ejecutar con el mismo `idempotencyKey` no crea duplicados ni corrompe estado; devuelve el resultado existente.
3. **Sin colisiones:** el `slug`/subdominio y el mapeo de host se reservan de forma atómica; imposible que dos tenants pisen el mismo host.
4. **Defaults sanos:** todo lo que el rubro necesita para operar (catálogo base, unidades, impuestos, roles, módulos habilitados según edición) queda sembrado desde el blueprint.
5. **Validado antes de escribir:** el `dry-run` corre todas las validaciones y devuelve el plan de creación sin efectos.

### 2.3 Cómo se logra la atomicidad (el detalle que evita "a medias")

El alta tiene dos clases de efectos:

- **Efectos transaccionales (dentro de Postgres):** filas de `Tenant`, `Membership`, catálogo sembrado, config. Todos se ejecutan **en una sola transacción de base de datos**. Si algo falla, `ROLLBACK` y no queda rastro.
- **Efectos externos no transaccionales:** mapeo de host/DNS/dominio en Vercel, envío de invitación al admin, provisión de secretos. Estos no participan de la transacción SQL, así que se manejan con un **patrón saga con compensación**: cada paso externo tiene su "deshacer", y el registro de provisioning lleva una **máquina de estados** (`PENDING → DB_COMMITTED → HOST_BOUND → INVITED → ACTIVE`, con `FAILED_COMPENSATED`). El `idempotencyKey` permite reanudar o revertir de forma segura.

Orden recomendado: primero la transacción de base de datos (lo reversible por rollback), luego los efectos externos idempotentes con compensación. Un tenant nunca se marca `ACTIVE` (ni resuelve por host) hasta que todos los pasos confirmaron.

### 2.4 Dry-run y validación

`dry-run` es obligatorio antes de todo `commit` en la consola de operador. Devuelve: el blueprint resuelto, la lista de objetos que se crearían, conflictos de slug/host, y advertencias de brand sheet (contraste de accesibilidad, tipografías faltantes). Es el mismo motor de validación que usará el self-service.

### 2.5 Detección de marca por IA

Flujo: el operador (o el futuro cliente) ingresa la web o redes del negocio → un paso de IA extrae **paleta dominante, logo, tipografías aparentes, tono visual** → se propone un `brandSheet` **como borrador editable**, nunca aplicado en crudo. El resultado pasa por las mismas validaciones (contraste WCAG, fallback de tipografías) antes de entrar al `provisionTenant`. La detección alimenta la fábrica; no la reemplaza. `[SUPUESTO]` la fuente de marca (web pública / Instagram / Google Business) y sus permisos de scraping deben confirmarse legalmente.

### 2.6 Disparadores: hoy y mañana

- **Hoy — consola de operador:** una pantalla interna que arma el `input`, corre `dry-run`, muestra el plan y ejecuta `commit`. Un humano aprieta el botón, pero **no escribe código ni toca la base**.
- **Mañana — self-service:** el mismo `provisionTenant` detrás de un formulario público con verificación de email/pago. El camino a self-service **no requiere reescribir la fábrica**, solo poner un front y un gate de pago delante. Que la consola y el self-service compartan la misma función es la prueba de que el diseño es correcto.

### 2.7 Recomendación

Construir `provisionTenant` como **la única puerta de alta**, transaccional + saga, con `dry-run` obligatorio, alimentada por blueprints (Sección 4) y validada por gates automáticos (Sección 6). Prohibir explícitamente cualquier alta manual por SQL o por script ad-hoc: si no pasó por la fábrica, no existe.

---

## 3. Línea base de seguridad (propiedad del analista de ciberseguridad)

Esta sección está redactada para que el **analista senior de ciberseguridad humano** la adopte como suya: define los invariantes que él firma y que la IA debe respetar y demostrar con evidencia automática.

### 3.1 Aislamiento defensa-en-profundidad: por qué el filtro de aplicación no alcanza

El filtro `WHERE tenantId = :actual` en el código es **una sola línea de defensa, y falla en abierto**: basta una consulta nueva sin el filtro, un `include` de Prisma mal armado, un endpoint olvidado o una inyección, para exponer datos de todos los tenants. En un equipo 100%-IA que genera queries a gran velocidad, **asumir que ninguna query jamás olvidará el filtro es una apuesta que se pierde eventualmente.**

La defensa correcta es en capas:

1. **Capa 1 — Postgres Row-Level Security (RLS):** política a nivel de tabla que fuerza `tenantId = current_setting('app.tenant_id')` en cada `SELECT/INSERT/UPDATE/DELETE`. La base **rechaza** el acceso cruzado aunque la aplicación se equivoque. Esta es la red de seguridad que convierte el pool en algo tan seguro como un silo para el 99% de los casos.
2. **Capa 2 — Rol de base de datos de mínimo privilegio:** la aplicación se conecta con un rol **no superusuario y sin `BYPASSRLS`**. Cada request setea `app.tenant_id` (vía `SET LOCAL` dentro de la transacción, atado a la sesión de conexión) tras autenticar. Un rol separado, con `BYPASSRLS`, se reserva **solo** para migraciones y para la fábrica de tenants, nunca para servir requests.
3. **Capa 3 — Filtro de aplicación (Prisma):** sigue existiendo como primera línea y para performance, pero deja de ser la *única* garantía.

**Punto crítico de implementación con Neon + Prisma:** el pooling de conexiones (PgBouncer/serverless) puede reutilizar conexiones entre requests. Hay que garantizar que `app.tenant_id` se setee **por transacción con `SET LOCAL`** y nunca "se filtre" a la request siguiente. Esto debe tener un test de aislamiento dedicado (Sección 6). `[SUPUESTO]` el modo de pooling exacto de Neon en uso debe confirmarse para elegir `SET LOCAL` vs. un esquema de conexión por-tenant.

### 3.2 Gestión de secretos

- Nada de secretos en el repo ni en el blueprint. Variables de entorno en Vercel + un gestor de secretos para credenciales sensibles.
- **Secreto por ámbito, no por cliente:** el diseño pool implica que **no debería haber un secreto por tenant**. Si aparece "necesito una API key distinta por cliente", va cifrada en tabla (con sobre-cifrado por KMS), no en variables de entorno ni en código.
- Rotación de credenciales de base de datos y de firma de sesión documentada y automatizable.

### 3.3 Hardening de autenticación

- Contraseñas con hashing moderno (`argon2id` o `bcrypt` con coste adecuado), MFA disponible para roles admin.
- Sesiones con expiración, rotación de token, y binding al tenant: **un token emitido para el tenant A no puede usarse contra el tenant B** aunque el usuario exista en ambos.
- Rate limiting y lockout en login para frenar fuerza bruta y enumeración.
- Autorización por rol dentro del tenant (RBAC) además del aislamiento entre tenants.

### 3.4 Seguridad del provisioning

- La fábrica corre con el rol privilegiado: es la superficie más sensible. Debe estar detrás de autenticación de operador fuerte y **auditada** (quién dio de alta qué y cuándo).
- Validación estricta del `slug`/subdominio para evitar secuestro de host o colisión.
- El brand sheet y la detección por IA no deben permitir inyección (SVG/logo con scripts, CSS malicioso): sanitización obligatoria de todo activo importado.

### 3.5 Ciclo de vida del dato por tenant

| Fase | Requisito |
|---|---|
| **Suspensión** | Flag `status=suspended` que corta el acceso (resolución de host devuelve bloqueo) sin borrar datos. Reversible. |
| **Offboarding** | Export de datos del tenant en formato portable + borrado verificable, con período de gracia. RLS garantiza que el export trae solo lo del tenant. |
| **Backup / restore** | Backups a nivel de base (Neon) con capacidad de **restore selectivo por tenant** (`[SUPUESTO]` a validar: restore parcial requiere export lógico filtrado por `tenantId`, ya que el backup físico es de toda la base). Documentar RPO/RTO. |
| **Retención** | Política de retención y de borrado definitivo tras offboarding, alineada a normativa argentina de datos personales. |

### 3.6 Threat model breve (mapeado a OWASP)

| Amenaza | Vector | OWASP | Mitigación primaria |
|---|---|---|---|
| **Cross-tenant data leak** | Query sin filtro de tenant, `include` mal armado, bug de IA | A01 Broken Access Control | **RLS + rol sin BYPASSRLS** (3.1) |
| **IDOR** (acceder a recurso de otro tenant por ID) | ID predecible en URL/API sin verificar pertenencia | A01 | RLS + verificación de pertenencia; IDs no adivinables (`[SUPUESTO]` usar UUID/cuid, no enteros secuenciales) |
| **Tenant enumeration** | Descubrir clientes por subdominios / mensajes de error | A01 / A05 Security Misconfiguration | Respuestas uniformes en login, sin revelar existencia de tenant; rate limiting |
| **Fuga por conexión reutilizada** | `app.tenant_id` que persiste entre requests en el pool | A01 / A05 | `SET LOCAL` por transacción + test de aislamiento (3.1) |
| **Privilege escalation** | Usuario que se auto-promueve de rol | A01 | RBAC server-side, nunca confiar en el cliente |
| **Inyección vía brand/import** | SVG/logo/CSS con payload | A03 Injection | Sanitización de activos (3.4) |
| **Secretos expuestos** | Credencial en repo/log/error | A02 Cryptographic Failures / A05 | Gestión de secretos (3.2), scrubbing de logs |
| **Provisioning abusado** | Alta masiva o secuestro de host | A01 / A04 Insecure Design | Auth de operador + auditoría + validación de slug (3.4) |

### 3.7 Recomendación

**RLS no es opcional: es el corazón de la línea base.** Sin RLS, el pool es una filtración esperando ocurrir en un equipo 100%-IA. Con RLS + rol de mínimo privilegio + los gates automáticos de la Sección 6, el analista de ciber tiene una base defendible y auditable que puede firmar.

---

## 4. Catálogo config-sobre-código

### 4.1 Principio

La diferencia entre "escalable" y "artesanal" es **dónde vive la variación entre clientes**. Regla: **la variación entre tenants vive como DATO versionado; la mecánica común vive como CÓDIGO compartido.** La brand sheet que ya construyeron es exactamente el patrón correcto; hay que extenderlo a todo lo que hoy varía por cliente.

### 4.2 Qué es dato y qué es código

| Concepto | Dónde vive | Por qué |
|---|---|---|
| **Rubro** | Pack curado en código (versionado en repo) | Es una plantilla base madura, revisada por el consultor; no la edita el operador en caliente |
| **Blueprint de rubro** (defaults: catálogo semilla, unidades, impuestos, roles, módulos on/off) | Pack curado en código, **materializado como dato al provisionar** | El blueprint es la fuente; al dar de alta, se "hornea" en filas del tenant |
| **Módulos / features** | Tabla de flags por tenant + definición en código | La *existencia* del módulo es código; el *estar activo* para un tenant es dato |
| **Edición (Comercio / Empresa)** | Definición en código (qué incluye cada una) + asignación por tenant en dato | La política de edición es curada; la pertenencia es dato |
| **Brand sheet** (paleta/tipografía/densidad/layout) | **Dato por tenant en tabla** (ya implementado) | Varía por cliente, se edita sin deploy, detrás de flag |
| **Overrides puntuales de un tenant** | Tabla de config por tenant | Ajustes finos sin tocar el blueprint |

### 4.3 Versionado del catálogo

- **Los blueprints se versionan** (`carniceria@3`). Un tenant creado con `carniceria@2` queda registrado con esa versión. Nuevas altas usan la versión vigente. **No se re-hornean tenants existentes automáticamente**: migrar un tenant de `v2` a `v3` es una operación explícita y opcional, con su propio dry-run.
- Esto da lo mejor de dos mundos: los tenants nuevos heredan mejoras, y los existentes no se rompen por un cambio de plantilla.
- La curaduría de blueprints es propiedad del **consultor funcional** (Sección 6): él aprueba qué entra en `carniceria@3`.

### 4.4 La prueba de fuego

Si para incorporar un nuevo rubro (digamos "pastelería") hace falta **escribir código nuevo por cliente**, el modelo falló. Lo correcto: crear un nuevo blueprint (dato curado), validarlo con el consultor, y que la fábrica lo consuma. Código nuevo solo se justifica cuando aparece una **mecánica** genuinamente nueva (p. ej. un motor de reservas que ningún rubro tenía), y esa mecánica se construye como **capacidad compartida activable por flag**, no como rama por cliente.

### 4.5 Recomendación

Formalizar la jerarquía **Rubro → Blueprint (versionado) → Edición → Brand sheet → Overrides**, con una frontera explícita: packs curados en código (revisados por el consultor), instancia y variación en tablas. Todo lo que hoy es "decisión ad-hoc al dar de alta" debe encontrar su lugar en esta jerarquía como dato.

---

## 5. Disciplina de deploy / release

### 5.1 Principio

**Un solo artefacto de deploy sirve a todos los tenants.** No hay build por cliente, no hay rama por cliente, no hay entorno por cliente. La variación entre clientes es dato (Sección 4), no despliegue. Esto es lo que hace que 5 tenants o 5.000 tengan el mismo costo de release.

### 5.2 El pipeline

```
feature/sprint branch → Preview (Vercel) → [GATE] → Producción (una sola)
```

- **Preview por rama:** cada rama de trabajo genera un entorno de preview aislado con datos de prueba (no producción).
- **Gate antes de prod:** ningún merge a producción pasa sin cumplir los gates automáticos (tests de aislamiento por tenant, checks de RLS, migración validada — Sección 6) **más** la firma del gate correspondiente cuando toca invariantes.
- **Migraciones hacia adelante:** el esquema compartido se migra una vez, para todos. Migraciones compatibles hacia atrás (expand/contract) para no romper tenants en caliente.

### 5.3 Ejemplo real de por qué hace falta disciplina (el problema actual)

Hoy existe un problema concreto: **la rama de producción del proyecto de staging apunta a `main` y no a la rama del sprint.** Esto es exactamente el tipo de deriva que la disciplina de release debe eliminar. Consecuencias:

- Se puede promover a "producción" (aunque sea de staging) código que **no es el que se está probando en el sprint**, o viceversa, generando divergencia entre lo revisado y lo desplegado.
- En un equipo 100%-IA, donde nadie "recuerda" configuraciones de rama, esta clase de desalineación pasa desapercibida hasta que causa un incidente.

**Corrección:** cada proyecto (staging y prod) debe tener **una asociación de rama explícita, documentada y verificada por un check automático** que falle el pipeline si el mapeo rama→entorno no es el esperado. La rama de producción de staging debe apuntar a la rama del sprint que se está validando, no a `main` por inercia. `[SUPUESTO]` la topología exacta de proyectos Vercel (staging vs prod) debe confirmarse para escribir ese check.

### 5.4 Recomendación

Prohibir todo deploy por cliente. Instituir el pipeline preview→prod con gate, migraciones expand/contract, y un **check de mapeo rama→entorno** que convierta el problema actual de staging en un fallo de build ruidoso en lugar de una deriva silenciosa.

---

## 6. Modelo de gobernanza 100%-IA

### 6.1 Principio

Con cero desarrolladores humanos, la seguridad y la corrección **no pueden depender de que "alguien revise el código a mano".** El modelo es: **dos humanos firman invariantes; la IA construye y verifica dentro de esos invariantes; los gates automáticos producen la evidencia que respalda cada firma.** El humano no lee cada línea: aprueba una propiedad y confía en la evidencia mecánica de que se cumple.

### 6.2 Los dos gates humanos

| Gate | Humano | De qué es dueño | Qué firma |
|---|---|---|---|
| **Gate funcional** | Consultor funcional | Catálogo de rubros/blueprints, edición, flujo de alta | "El blueprint `carniceria@3` produce un tenant correcto y operable para el rubro" |
| **Gate de seguridad** | Analista senior de ciber | Aislamiento, RLS, auth, ciclo de vida del dato | "El aislamiento entre tenants se mantiene; RLS y roles cumplen la línea base" |

La IA no puede promover a producción un cambio que toque el dominio de un gate sin la evidencia que ese gate exige. La IA **propone**; el gate **firma sobre evidencia**.

### 6.3 Evidencia automática que respalda cada firma

Cada firma humana se apoya en gates automáticos que la IA debe hacer pasar y adjuntar como evidencia:

**Respaldo del gate de seguridad:**

- **Test de aislamiento por tenant:** suite que crea ≥2 tenants, siembra datos, y prueba exhaustivamente que ninguna operación de la app (queries, endpoints, exports) devuelve datos cruzados. Debe incluir el caso de **conexión reutilizada** (3.1).
- **Check de RLS:** verifica que toda tabla con `tenantId` tiene RLS habilitada y forzada (`FORCE ROW LEVEL SECURITY`), y que el rol de aplicación no tiene `BYPASSRLS`. Falla el build si aparece una tabla nueva sin política.
- **Check de rol/privilegios:** confirma que la conexión de runtime usa el rol de mínimo privilegio.
- **Escaneo de secretos** en el repo y en logs.
- **Prueba de negativos IDOR/enumeración:** requests cross-tenant que deben devolver 404/403 uniforme.

**Respaldo del gate funcional:**

- **Dry-run del blueprint:** el plan de creación se genera y valida sin efectos.
- **Test de alta end-to-end:** `provisionTenant` en modo test crea un tenant completo del rubro, verifica defaults sanos, idempotencia (doble ejecución) y atomicidad (fallo inyectado ⇒ rollback total).
- **Validación de brand sheet:** contraste WCAG, tipografías con fallback.
- **Snapshot del catálogo:** diff legible de qué cambia entre `carniceria@2` y `@3` para que el consultor apruebe con contexto.

### 6.4 Cómo se ve el flujo

1. La IA propone un cambio (nuevo blueprint, nueva query, migración).
2. El pipeline corre todos los gates automáticos y adjunta la evidencia.
3. Si el cambio toca un dominio firmado, el gate humano correspondiente revisa **la evidencia y el diff de alto nivel** (no cada línea) y firma o rechaza.
4. Solo con evidencia verde + firma requerida, la IA promueve a producción.

### 6.5 Recomendación

Codificar los invariantes de cada gate como **checks ejecutables** (no como documento aspiracional). La firma humana debe ser barata y frecuente porque descansa sobre evidencia mecánica sólida. Si un gate automático no existe todavía para un invariante, ese invariante **no está gobernado** y es deuda de seguridad prioritaria.

---

## 7. Checklists accionables

### 7.1 Checklist FUNCIONAL (consultor funcional) — aprobar antes de onboardear clientes reales

- [ ] Existe un **blueprint versionado** para cada rubro que se va a vender (estética, retail-velas, retail-pádel, carnicería).
- [ ] Cada blueprint produce, vía `dry-run`, un tenant con **catálogo semilla, unidades, impuestos, roles y módulos** correctos para el rubro.
- [ ] La **edición** (Comercio/Empresa) activa exactamente los módulos previstos, ni más ni menos.
- [ ] El **flujo de alta** en la consola de operador funciona end-to-end sin intervención de código.
- [ ] El **brand sheet** por defecto de cada rubro es usable y accesible; la detección por IA produce un borrador razonable y editable.
- [ ] La **idempotencia** está probada: re-ejecutar un alta no duplica ni corrompe.
- [ ] La **atomicidad** está probada: un alta fallida no deja tenant a medias.
- [ ] No existe **ningún paso manual** en el alta que requiera SQL, script o edición de código por cliente.
- [ ] Migrar un tenant de una versión de blueprint a otra es una operación explícita con dry-run (no automática, no destructiva).
- [ ] El diff entre versiones de blueprint es legible y aprobable.

### 7.2 Checklist de SEGURIDAD (analista de ciber) — aprobar antes de onboardear clientes reales

- [ ] **RLS habilitada y forzada** (`FORCE ROW LEVEL SECURITY`) en **todas** las tablas con `tenantId`.
- [ ] La aplicación se conecta con un **rol de mínimo privilegio sin `BYPASSRLS`**; el rol privilegiado se usa solo en migraciones y fábrica.
- [ ] `app.tenant_id` se setea **por transacción con `SET LOCAL`**; test de conexión reutilizada en verde.
- [ ] **Test de aislamiento cross-tenant** cubre queries, endpoints y exports; en verde.
- [ ] IDs de recursos **no adivinables** (UUID/cuid); pruebas IDOR devuelven 403/404 uniforme.
- [ ] Login **no revela existencia de tenant/usuario**; rate limiting y lockout activos.
- [ ] Passwords con **hashing moderno**; MFA disponible para admin; tokens ligados al tenant.
- [ ] **Secretos** fuera del repo; escaneo automático en verde; logs sin credenciales.
- [ ] **Provisioning** autenticado, auditado, con validación de slug/host y sanitización de activos de marca.
- [ ] Ciclo de vida por tenant definido: **suspensión, offboarding con export+borrado, backup/restore** documentados con RPO/RTO.
- [ ] Threat model (3.6) revisado; cada fila tiene mitigación implementada **y** evidencia automática.
- [ ] El **mapeo rama→entorno** tiene check automático (Sección 5.3).

---

## 8. Roadmap y "qué dejar de hacer"

### 8.1 Roadmap por fases

**Fase 0 — Estado actual (línea de base).**
Shared-schema pooled, resolución por host, ediciones, brand sheet recién construida detrás de flag. Aislamiento solo por filtro de aplicación. Alta artesanal. Deriva de rama en staging.

**Fase 1 — Blindar el aislamiento (prioridad máxima, propiedad del gate de seguridad).**
Activar RLS forzada en todas las tablas con `tenantId`. Introducir el rol de mínimo privilegio y el seteo `SET LOCAL app.tenant_id` por transacción. Escribir el test de aislamiento cross-tenant y el check de RLS como gates de build. *Sin esto, no se onboardean clientes reales.*

**Fase 2 — Formalizar el catálogo config-sobre-código.**
Extraer toda la variación por cliente a la jerarquía Rubro→Blueprint(versionado)→Edición→Brand sheet→Overrides. Definir la frontera dato/código. Versionar blueprints. Dar al consultor la propiedad curatorial.

**Fase 3 — Construir la fábrica de tenants.**
`provisionTenant` único, transaccional + saga, idempotente, con `dry-run` obligatorio, alimentado por blueprints. Consola de operador encima. Migrar el alta existente a la fábrica y **prohibir el camino viejo**.

**Fase 4 — Disciplina de release.**
Pipeline preview→prod con gates. Corregir el mapeo rama→entorno de staging y agregar el check que lo protege. Migraciones expand/contract.

**Fase 5 — Gobernanza 100%-IA completa.**
Codificar todos los invariantes como checks ejecutables; conectar firmas de los dos gates a la evidencia automática. Onboarding de clientes reales solo cuando ambas checklists (7.1 y 7.2) estén en verde.

**Fase 6 — Detección de marca por IA y camino a self-service.**
Pulir la detección de marca como borrador editable. Poner formulario público + gate de pago delante de la misma fábrica. Definir umbrales de graduación a pod (1.4) y automatizar esa graduación.

### 8.2 Qué DEJAR DE HACER (anti-patrones que generan trabajo por cliente)

- **Dejar de** dar de alta tenants con SQL manual, scripts ad-hoc o pasos fuera de la fábrica. *Un alta que no pasó por `provisionTenant` no existe.*
- **Dejar de** escribir código específico por cliente. Si un cliente "necesita algo distinto", eso es un blueprint nuevo (dato) o una capacidad compartida activable por flag — nunca una rama por cliente.
- **Dejar de** confiar el aislamiento únicamente al filtro de aplicación. RLS o nada.
- **Dejar de** crear ramas, entornos o deploys por cliente.
- **Dejar de** tratar la brand sheet como excepción: es el patrón, hay que replicarlo a toda la configuración.
- **Dejar de** tolerar la deriva de rama→entorno (el problema de staging apuntando a `main`): convertirla en un fallo de build.
- **Dejar de** re-hornear tenants existentes en caliente al cambiar un blueprint. Migración explícita con dry-run.
- **Dejar de** aprobar cambios sensibles "a ojo": toda firma humana descansa sobre evidencia automática.
- **Dejar de** meter secretos o lógica por cliente en variables de entorno o código.

---

## Apéndice — Estándares y patrones citados

- **AWS SaaS multi-tenancy** — modelos Pool / Silo / Bridge (base de la Sección 1).
- **OWASP Top 10** — A01 Broken Access Control (cross-tenant leak, IDOR, privilege escalation), A02 Cryptographic Failures, A03 Injection, A04 Insecure Design, A05 Security Misconfiguration (Sección 3.6).
- **PostgreSQL Row-Level Security** — `ROW LEVEL SECURITY` / `FORCE ROW LEVEL SECURITY` y roles sin `BYPASSRLS` (Sección 3.1).
- **Patrón Saga con compensación** — para efectos externos no transaccionales del provisioning (Sección 2.3).
- **Migraciones expand/contract** — compatibilidad hacia atrás en esquema compartido (Sección 5.2).
- **WCAG** — contraste mínimo para validación de brand sheet (Secciones 2.5, 6.3).

---

*Marcas `[SUPUESTO]` en el documento señalan puntos a confirmar con el equipo (modo de pooling de Neon, topología de proyectos Vercel, fuentes legales de detección de marca, umbrales exactos de graduación a pod, mecánica de restore selectivo por tenant). Ninguno bloquea las recomendaciones; todos afinan la implementación.*
