# 🔐 Análisis estratégico de seguridad — multi-tenant, base de datos, riesgos, costo por nivel y mercado

**Autor:** Célula de Seguridad (Opus 4.8, alto juicio) · **Fecha:** 2026-07-06
**Encargo:** analizar la seguridad del modelo multi-tenant, el uso de la base de datos, qué riesgos
tenemos, qué cuesta escalar según el nivel de seguridad exigido, cómo se vende esto en el mundo y si
conviene confiar en la seguridad de los proveedores de base de datos.
**Fuentes internas:** ADR-001 (estrategia multi-tenant), ADR-007 (financiero), ADR-018 (RLS), ADR-023
(performance + free plan), `docs/seguridad/PLAN-HARDENING-PRE-COBROS.md`, `docs/ESTADO-ACTUAL.md`,
`prisma/rls/`. **Fuentes externas:** ver §8.

---

## 0. Resumen ejecutivo (para el dueño, 8 líneas)

1. **El candado está puesto.** El aislamiento entre clientes ya no es una promesa de diseño: **RLS de
   Postgres está ACTIVO y enforced en producción** (rol `app_rls` sin `BYPASSRLS`), con un **2º tenant
   real (Magra) conviviendo con CH y aislamiento verificado en prod**. Estamos operando multi-tenant de
   verdad, no simulándolo.
2. **La arquitectura elegida es la correcta y la que usa el mundo:** *shared schema + `tenant_id` + RLS*,
   con **camino de escape a aislamiento dedicado para enterprise** (modelo híbrido "pool + silo"). Es
   exactamente lo que hacen las plataformas SaaS maduras y lo que permite **vender la seguridad como un
   tier de precio**.
3. **El eslabón débil hoy NO es la arquitectura: son los secretos y la recuperación.** Hay dos secretos
   a rotar (comprometidos) y **no tenemos point-in-time-recovery** (plan free de Neon). Con plata real de
   por medio, eso es lo primero a cerrar. Ambos ya están priorizados como bloqueantes pre-cobros.
4. **Neon es confiable como proveedor** (SOC 2 Type II, ISO 27001/27701, HIPAA, PCI-DSS, cifrado
   AES-256). El riesgo no está en Neon; está en **cómo lo usamos** (plan free sin PITR, secretos).
5. **Costo de subir el nivel de seguridad:** hoy ~$0 incremental por tenant (pool). El primer salto real
   (PITR + backups + monitoreo) es **~$19–25/mes de plataforma**, no por tenant. El silo dedicado por
   cliente enterprise recién se justifica **cobrándolo aparte**.

---

## 1. Postura actual — defensa en capas (lo que YA tenemos)

La seguridad multi-tenant no es un candado, son varios en serie. Estado real relevado hoy:

| Capa | Mecanismo | Estado |
|---|---|---|
| **1. Resolución de tenant fail-closed** | `getCurrentTenantId()` lanza error si hay ≠1 tenant resoluble, en vez de agarrar "el más viejo" (ADR-015) | ✅ vivo |
| **2. Filtro app-level** | `tenantId` en **toda** tabla de negocio; toda query pasa por el helper de tenant | ✅ vivo (110 usos de `tenantId` en el schema) |
| **3. RLS de Postgres (backstop del motor)** | `CREATE POLICY tenant_isolation` (USING + WITH CHECK) en **33/33** tablas con `tenantId`; `set_config('app.current_tenant_id', …, true)` por transacción, pooling-safe | ✅ **ACTIVO y enforced en prod** |
| **4. Rol de DB sin bypass** | App conecta como `app_rls` (`NOBYPASSRLS`, no-owner, solo DML). El `app_user` legacy con `BYPASSRLS` quedó inerte (nadie conecta con él) | ✅ vivo |
| **5. Rate limiting** | 5 fallos/15min en logins `/admin` y `/operador`; 60 req/min en API pública `/public/v1/*` (429 + Retry-After) | ✅ vivo |
| **6. Auth** | api-key por tenant (timing-safe, fail-closed) en API pública; HMAC edge-safe + cookie firmada en operador/admin | ✅ sólido |
| **7. Webhook de pagos** | Mercado Pago con firma HMAC-SHA256, fail-closed (sin secreto → 503; firma mala → 401) antes de tocar DB | ✅ código listo (falta secreto en prod) |
| **8. Cron** | `/api/cron/reminders` ahora fail-closed (503 sin `CRON_SECRET`) | ✅ vivo |
| **9. Gate estático anti-drift** | `npm run gate:rls` / `check-coverage.mjs` verifica en cada cambio que todo modelo de-tenant tenga columna y policy | ✅ vivo |

**Lectura:** para que se filtre un dato entre tenants tienen que **fallar simultáneamente la capa 2 y la
capa 3** — un olvido de `where tenantId` *y* que el motor no aplique la policy. Con RLS enforced, un query
sin contexto de tenant devuelve **0 filas** (fail-closed), no la base entera. Ese es el estándar de la
industria y lo tenemos puesto.

---

## 2. El modelo multi-tenant: seguridad real

**Estrategia (ADR-001, opción D):** *shared schema + `tenant_id` + RLS*, con **híbrido**: la escotilla de
escape a schema/DB dedicado queda disponible para el enterprise que lo exija. Es la decisión correcta y la
más vendida del mundo (§7).

**Por qué es segura de verdad, no "segura si nadie se equivoca":**
- El aislamiento lo aplica **el motor de Postgres**, no la disciplina del programador. Un query mal escrito
  no filtra: la policy lo recorta.
- **Fail-closed por diseño:** sin `app.current_tenant_id` seteado, `current_setting(name, true)` es `NULL`
  y `"tenantId" = NULL` da 0 filas. El WITH CHECK además impide **escribir** con tenant ajeno.
- **A prueba de drift:** las policies se generan recorriendo `information_schema`, no una lista a mano →
  una tabla nueva sin policy la caza el gate estático (`gate:rls`) antes de mergear.

**Dónde está el filo (lo que hay que cuidar):**
- **El plano super-admin / operador cross-tenant** (ADR-021, ADR-027) es el único que legítimamente cruza
  tenants. Por diseño vive en **conexión y rol separados** (`operator-db.ts`) y, con RLS, necesitará un rol
  con bypass **exclusivo** de ese plano. Es el punto más sensible: una fuga ahí es fuga total. Hoy está
  scopeado en ADR pero **su implementación es una sesión aparte**, atada a cuando exista panel real.
- **Analytics cross-tenant** (benchmarking por rubro, ADR-027): NUNCA lee otro tenant desde el plano del
  tenant; se hace por pipeline de agregación separado con **k-anonymity k≥5** y opt-in. Bien encaminado,
  gate de masa a ≥5 tenants.

**Veredicto:** el modelo es sólido y estándar. La deuda no es de aislamiento, es de **gobierno del plano
de plataforma** (super-admin) el día que exista, y de **operar el free tier** (§4).

---

## 3. Uso de la base de datos

**Stack:** Prisma 7.8 + `@prisma/adapter-pg` contra **Neon** (pooler, transaction mode). El diseño de RLS
es **pooling-safe** a propósito: usa `set_config(..., true)` (local a la transacción) en vez de `SET` de
sesión, porque el pooler de Neon en modo transacción no preserva estado de sesión (ADR-018 §2.a).

**Consumo — el driver #1 es `force-dynamic`:** casi todo el sitio y todo `/admin` renderizan dinámico →
cada visita = 1 función + 1 hit a Neon, sin cache de CDN. Esto maximiza tres consumos (funciones,
compute Neon, wakes que impiden el scale-to-zero). Es la primera palanca de ahorro (ADR-023 §7).

**Techos del plan free de Neon (relevantes a seguridad, no solo a costo):**
- **Storage ~0.5 GB:** cuando se llena, **Postgres deja de aceptar escrituras** → incidente de
  *disponibilidad*. Llega por acumulación (tablas append-only como `AuditLog`), aunque el tráfico sea
  chico. Mitigación puesta: retención de `AuditLog` (`src/lib/audit-retention.ts`) + vigilar el % de
  storage como métrica de gate.
- **Sin PITR (point-in-time recovery):** en free no hay recuperación a un instante. **Con datos reales y
  plata, esto es el hueco más caro:** un `UPDATE`/`DELETE` malo (bug o mano) no se deshace. Es bloqueante
  antes de cobros.

---

## 4. ¿Conviene confiar en la seguridad del proveedor de base de datos? (Neon)

**Respuesta corta: sí, Neon es confiable como proveedor; el riesgo está en cómo lo usamos, no en Neon.**

**Lo que Neon certifica** (fuente: neon.com/security, docs de compliance — §8):
- **SOC 2 Type II** (auditoría anual por tercero acreditado), **ISO/IEC 27001:2022** e **ISO/IEC
  27701:2019** (privacidad), **HIPAA**, **PCI-DSS**, alineación **GDPR / CCPA / CPRA**.
- **Cifrado:** AES-256 en reposo (SSE), TLS en tránsito, IP allowlisting disponible.
- **Aislamiento:** soporta los dos patrones que nos importan — (a) shared + `tenant_id` + RLS (el nuestro)
  y (b) **branch/proyecto por tenant** (la escotilla de silo del §6).
- **Auditoría:** accesos logueados vía CloudTrail/Azure Monitor centralizados.

**Marco de confianza — el modelo de responsabilidad compartida:** el proveedor asegura la *infraestructura*
(cifrado, parches, aislamiento físico, certificaciones); **nosotros seguimos siendo dueños de lo de arriba**:
las policies RLS, la gestión de secretos, quién tiene qué rol, los backups fuera del proveedor, y la
recuperación. Un SOC 2 de Neon **no** cubre que nosotros dejemos una `NEON_API_KEY` filtrada. Por eso:

- **Confiamos en Neon para:** cifrado, certificaciones, aislamiento de infraestructura, disponibilidad
  base. No necesitamos re-implementar nada de eso.
- **No delegamos en Neon:** la rotación de secretos, el PITR (hay que estar en plan pago), un backup
  cifrado propio fuera de Neon (`pg_dump`), y el monitoreo. Eso es **nuestro**.

**Riesgos específicos del proveedor a tener en cuenta** (de la evaluación externa de Neon, §8): el modelo
de **branching** puede clonar datos productivos a una branch de dev con menos control — hay que tratar las
branches con datos reales con el mismo cuidado que prod; y las **connection strings** son credenciales de
DB completas: filtrarlas es filtrar la base. Ambos ya están contemplados (branches de ensayo se borran;
secretos a rotar).

**Conclusión:** no hace falta desconfiar de Neon ni migrar de proveedor por seguridad. Sí hace falta
**subir NUESTRA mitad**: PITR (plan pago) + rotación de secretos + backup propio. Está todo priorizado.

---

## 5. Registro de riesgos priorizado

| # | Riesgo | Prob. | Impacto | Estado / mitigación |
|---|---|---|---|---|
| R1 | **Secretos comprometidos** (`NEON_API_KEY`, password `app_rls`) | Alta si no se rota | **Crítico** (acceso a la DB) | 🔴 **Rotar YA** — runbook `RUNBOOK-ROTACION-SECRETOS.md` (acción del dueño) |
| R2 | **Sin PITR** — borrado/UPDATE malo de datos reales irrecuperable | Media | **Crítico** con plata | 🔴 Plan pago Neon (bloqueante pre-cobros) + `pg_dump` cifrado interino |
| R3 | **Fuga cross-tenant por plano super-admin** (rol con bypass) | Baja hoy (no existe panel) | Crítico | 🟡 Diseñar rol-bypass exclusivo cuando se implemente (ADR-021) |
| R4 | **Storage free se llena → DB rechaza escrituras** | Media a plazo | Alto (disponibilidad) | 🟡 Retención `AuditLog` puesta + vigilar % storage |
| R5 | **Idempotencia webhook MP** — reenvío duplica factura/pago | Media al activar MP | Alto (plata/fiscal) | 🟡 Verificar dedupe por `payment_id` en outbox (pre-cobros) |
| R6 | **Timeouts a APIs externas** (MP/WhatsApp/ARCA) cuelgan request y agotan conexiones Neon | Media | Medio | 🟡 `AbortController` ~8s (célula Reliability) |
| R7 | **Sin CI real** — el gate anti-drift depende de disciplina manual | Media | Medio | 🟡 GitHub Action `on: push/PR` con `npm run gates` |
| R8 | **Sin monitoreo/alertas de caída** | Media | Medio | 🟡 UptimeRobot (free) → Telegram sobre `/api/health` |

**Los dos únicos rojos (R1, R2) son acciones del dueño / plan pago, no de código.** El código de
aislamiento ya está.

---

## 6. Niveles de seguridad como PRODUCTO — y su costo

La clave comercial: **la seguridad no es binaria, es un espectro que se vende por tier.** El modelo
híbrido de ADR-001 permite ofrecer tres niveles sobre la MISMA base de código.

| Nivel | Aislamiento | Para quién | Costo incremental (orden de magnitud) | Estado |
|---|---|---|---|---|
| **T1 — Pool (Estándar)** | Shared schema + `tenant_id` + **RLS enforced** + cifrado en reposo/tránsito del proveedor | 95% de los clientes (PyMEs, comercios) | **~$0 por tenant** (comparten instancia) | ✅ **operativo hoy** |
| **T2 — Business/Pro** | Pool + **PITR**, backups gestionados, **retención de auditoría extendida**, monitoreo, SLA básico | Clientes con datos sensibles / que cobran online | **~$19–25/mes de plataforma** (plan pago Neon, no por-tenant) *(provisional, a confirmar vs pricing vigente)* | 🟡 a habilitar (bloqueante pre-cobros) |
| **T3 — Silo (Enterprise)** | **Branch/proyecto Neon dedicado** por cliente (o DB/instancia dedicada), datos separados físicamente, opción de región propia / claves propias (BYOK) / VPC | Enterprise por política, compliance duro, o argumento comercial ("tu empresa tiene su propia base") | **~$15–50+/mes POR tenant** de infra dedicada *(provisional)* — se **cobra aparte**, no se absorbe | 🟢 escotilla de diseño lista (ADR-001 D), implementación on-demand |

**Principios de costeo (para no perder plata):**
- **T1 es casi gratis y ya escala** hasta cientos de tenants con connection pooling. El salto duro no es
  gradual: es pasar de "una instancia" a "réplicas/particionado", que ADR-007 ubica entre **500–2.000
  tenants activos** (un ERP transacciona mucho por tenant). Recién ahí se revisa.
- **T2 es un costo de PLATAFORMA, no por-tenant.** Un solo plan pago de Neon cubre PITR + backups para
  toda la base pool. Se prorratea entre todos; el margen mejora con cada tenant.
- **T3 sólo se ofrece cobrándolo.** Una DB dedicada por cliente multiplica infra y operación; si no se
  cobra como SKU enterprise, destruye el margen. La regla: **el silo lo paga quien lo pide.**

**Proyección de infra total (ADR-007, órdenes de magnitud):** ~$5/mes a 1 cliente · ~$40 a 10 · ~$300 a
100 · ~$1.500–2.700 a 1.000 · ~$7.000–14.000 a 10.000. La seguridad "estándar" (T1) está incluida en esos
números; T3 se suma por-cliente y se factura.

---

## 7. Cómo se vende esto en el mundo (benchmark)

Lo que hacen las plataformas SaaS maduras coincide con nuestra decisión:

- **El estándar de facto es el híbrido "pool + silo":** clientes chicos/self-serve en infraestructura
  **compartida** (pool con RLS); cuentas enterprise de alto valor en silos **dedicados**, ruteados por
  tier de precio. Es exactamente ADR-001 opción D.
- **La seguridad se empaqueta como palanca de upsell:** el SKU enterprise "compra" aislamiento dedicado,
  SSO, logs de auditoría, residencia de datos y SLA. El self-serve comparte el pool. La isolation es
  **feature de pricing**, no solo detalle técnico.
- **RLS de Postgres es la mitigación estándar** para el modelo shared-schema en toda la industria (empuja
  el filtro al motor para que un WHERE olvidado falle cerrado). No estamos inventando: estamos aplicando
  el patrón canónico.
- **Enterprise regulado (salud/finanzas/gobierno) suele exigir aislamiento por política** — ahí el silo
  dedicado (T3) no es lujo, es requisito para cerrar el trato. Tenerlo como escotilla lista es lo que
  permite decir "sí" a esos clientes sin rediseñar.
- **La confianza se vende con certificaciones heredadas del proveedor:** montar sobre Neon (SOC 2, ISO
  27001, HIPAA, PCI-DSS) nos deja **heredar** ese piso de compliance para el discurso comercial, sin
  auditar infraestructura nosotros. El diferencial que agregamos arriba es RLS + gobierno de secretos.

**Traducción a nuestro pitch:** *"Cada cliente aislado a nivel motor de base de datos (RLS de Postgres),
sobre infraestructura certificada SOC 2 / ISO 27001, con opción de base dedicada para tu empresa."* Es
verdadero hoy y es exactamente como lo cuenta el mercado.

---

## 8. Recomendaciones del frente (qué hacer, en orden)

**Bloqueante antes de cobros online (los dos rojos):**
1. **Rotar `NEON_API_KEY` + password de `app_rls`** (dueño; runbook listo).
2. **Plan pago de Neon → PITR** + `pg_dump` cifrado interino (T2 mínimo).

**Fuerte recomendación antes de escalar tráfico/plata:**
3. **`MP_WEBHOOK_SECRET` en prod** + verificar **idempotencia** del webhook MP (dedupe por `payment_id`).
4. **Timeouts (`AbortController`)** en MP/WhatsApp/ARCA (célula Reliability).
5. **CI real** (`npm run gates` en GitHub Action) → el gate anti-drift deja de depender de disciplina.
6. **Monitoreo:** UptimeRobot → Telegram sobre `/api/health` + alertas de uso de Neon.

**Estratégico (producto):**
7. **Formalizar los tres tiers de seguridad como SKU** con su pricing, ahora que T1 es real. T2 se
   habilita con el mismo plan pago que resuelve R2. T3 queda on-demand, siempre cobrado.
8. **Diseñar el gobierno del plano super-admin** (rol-bypass exclusivo) *antes* de construir el panel
   cross-tenant — es la única superficie con fuga total posible.

---

## Fuentes externas

- [Neon — Security & Compliance](https://neon.com/security)
- [Neon — Security overview (docs)](https://neon.com/docs/security/security-overview)
- [Neon — Compliance (docs)](https://neon.com/docs/security/compliance)
- [Neon — HIPAA, multi-tenancy & scaling for B2B SaaS](https://neon.com/blog/hipaa-multitenancy-b2b-saas)
- [Is Neon Safe? RLS, Branching & Connection Risks (2026)](https://vibe-eval.com/safety/neon/)
- [WorkOS — Developer's guide to SaaS multi-tenant architecture](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)
- [Auth0 — Demystifying multi-tenancy in B2B SaaS](https://auth0.com/blog/demystifying-multi-tenancy-in-b2b-saas/)
- [Clerk — Multi-tenant vs single-tenant SaaS architecture](https://clerk.com/blog/multi-tenant-vs-single-tenant)
- [B2B Opus — Optimizing multi-tenant architecture governance](https://b2bopus.com/optimizing-multi-tenant-architecture-governance/)

---

*— Elaborado por Gestión Studio Grow · Célula de Seguridad (Opus 4.8, alto juicio)*
