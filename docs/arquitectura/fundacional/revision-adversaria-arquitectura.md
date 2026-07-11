> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), documento fundacional del dueño. Incorporado a la rama fundacional sin alterar el contenido original.

---

# GSG — Revisión adversaria del Documento Fundacional de Arquitectura Multi-Tenant

**Rol:** Revisor independiente y escéptico (senior). No autor.
**Fecha:** 2026-07-10
**Alcance:** Revisión crítica del documento fundacional de arquitectura multi-tenant de GSG (ERP SaaS, micro-empresas AR; Next.js 16 + Prisma 7 + PostgreSQL en Neon + Vercel; equipo 100%-IA con gates humanos funcional y de ciberseguridad).

**Aviso previo:** No es posible verificar comportamientos específicos de Next.js 16 ni Prisma 7 (posteriores al conocimiento base del revisor). Donde eso importa, se marca como supuesto a confirmar antes de comprometer la Fase 1.

---

## CRÍTICO

### 1. Trabajos en background / colas / webhooks sin contexto de tenant — el hueco de RLS más grande y no está mencionado
Todo lo que corre fuera de una request (cron de Vercel, workers async, webhooks de pago, el propio provisioning) no tiene sesión autenticada, así que si olvida el `SET LOCAL` o usa el rol privilegiado, RLS queda bypasseada en silencio. En la práctica es donde más se filtran datos cross-tenant.

**Corrección:** cada job abre su transacción y hace `set_config('app.tenant_id', ...)` explícito; prohibir el rol con BYPASSRLS en cualquier ruta async; gate que detecte uso del connection string privilegiado fuera de migraciones/fábrica.

### 2. La saga no tiene motor de ejecución durable, y en Vercel serverless las funciones son efímeras
Una función puede morir a mitad de saga (timeout, reciclado de instancia) y dejar el tenant colgado en `DB_COMMITTED` sin nada que reintente ni compense — la "atomicidad" orquestada dentro de la función es ilusoria.

**Corrección:** outbox table + reconciler/cron que reanude sagas, o un motor de workflows durable (Inngest/Temporal); nunca orquestar los efectos externos dentro del ciclo de vida de una sola función.

### 3. `SET LOCAL` como se describe tiene dos trampas concretas que el doc no explicita: inyección y obligación de transacción interactiva
`SET LOCAL app.tenant_id = <valor>` construido por interpolación es un vector de inyección, y además sólo aplica dentro de un `BEGIN`, lo que fuerza a envolver *toda* operación tenant-scoped en `prisma.$transaction` interactiva usando el MISMO `tx`.

**Corrección:** `SELECT set_config('app.tenant_id', $1, true)` parametrizado dentro de la transacción interactiva; políticas que lean `current_setting('app.tenant_id', true)` y **denieguen cuando es NULL** (fail-closed).

**Matiz clave:** el riesgo catastrófico real no es la reutilización aleatoria de conexión — `SET LOCAL` dentro de transacción es correcto y seguro con PgBouncer en modo transacción — sino usar `SET` de sesión en vez de `SET LOCAL`, u operar fuera de la `tx`: eso sí persiste en la conexión pooleada y filtra al siguiente tenant. El doc identifica el riesgo pero subestima que la mitigación exacta es la parte difícil.

### 4. Caché por tenant no existe en el documento, y Next.js 16 cachea de forma agresiva
Cualquier clave de cache (data cache de Next, `React.cache`, Redis, memoización a nivel módulo en una instancia serverless caliente) sin `tenant_id` es una fuga cross-tenant directa, y RLS no protege nada que viva fuera de Postgres.

**Corrección:** `tenant_id` obligatorio en toda clave de cache; prohibir estado a nivel módulo/global entre requests; incluir esto como invariante con gate.

---

## IMPORTANTE

### 5. "Costo marginal ~0" mezcla dos cosas
El marginal por tenant en shared-schema sí es bajo, pero eso no implica que el plan Neon actual alcance. El tier Hobby/serverless tiene auto-suspend (scale-to-zero) con cold start de cientos de ms a segundos en la primera request tras inactividad, más límites de compute y conexiones — inviable para tenants pagos reales.

**Corrección:** separar la afirmación de marginal-por-tenant de la adecuación del plan; presupuestar un plan pago (Launch/Scale) con autoscaling y sin suspend agresivo antes de onboardear.

### 6. El doc no dimensiona el costo de performance de envolver todo en transacciones interactivas
Cada operación suma BEGIN/SET/COMMIT (round-trips), retiene la conexión más tiempo (peor presión sobre el pooler y los límites de Neon) y queda expuesta al timeout de transacción interactiva de Prisma, que en serverless con cold start + wake de Neon puede dispararse.

**Corrección:** medirlo explícitamente, ajustar timeouts/`maxWait`, y confirmar que Prisma 7 soporta transacciones interactivas sobre el endpoint pooled de Neon (`pgbouncer=true`) — supuesto a verificar, no darlo por hecho.

### 7. Blast radius de la base única: un solo Postgres = todos los tenants
Una migración con lock sobre una tabla compartida grande, una query pesada de un tenant, o el techo de storage/IOPS del proyecto Neon afectan a todos a la vez; la graduación a "pod" sólo cubre vecino ruidoso, no el radio de impacto ni un camino de sharding.

**Corrección:** definir umbrales de tamaño/carga que disparen partición y una estrategia de sharding antes de llegar a decenas de miles de tenants activos.

### 8. La máquina de estados de la saga tiene estados de falla no cubiertos
Falta: compensación-que-falla (borrar el dominio en Vercel falla → no hay estado ni alerta), verificación asíncrona de DNS/SSL (Vercel emite el cert de forma diferida y puede fallar por CAA, así que `HOST_BOUND` no significa que el host resuelva), reaping de sagas atascadas, idempotencia por paso externo (no sólo por `idempotencyKey` global), y colisión de slug bajo concurrencia.

**Corrección:** agregar estados `COMPENSATION_FAILED` con alerta, un estado `VERIFYING/CERT_PENDING` con polling, y una **unique constraint a nivel DB** sobre slug/host para evitar la carrera TOCTOU que "sin colisiones" no resuelve por sí solo.

### 9. Gobernanza: el invariante más importante NO es automatizable de forma sólida
"El rol BYPASSRLS sólo se usa en migraciones/fábrica, jamás en una ruta de request" es una propiedad de flujo de datos que un check simple no prueba; y firmar sobre evidencia verde no captura los unknown-unknowns (una tabla nueva sin FORCE RLS, un path raw que saltea la `tx`). Sumado a eso, evidencia siempre-verde produce fatiga de firma / sellado automático, y un equipo 100%-IA no tiene owner humano definido para depurar un incidente de fuga en producción.

**Corrección:** lint/dataflow que prohíba importar el connection string privilegiado en código de request; inyección periódica de fallas/red-team para que las firmas signifiquen algo; y un humano de guardia nombrado para incidentes.

### 10. Rate limiting/cuotas por tenant a nivel aplicación no están — sólo se menciona rate limit de auth
Sin cuotas por tenant, un solo cliente puede saturar CPU/DB y degradar a todos (vecino ruidoso en la capa app, que la graduación basada en recursos de DB no atrapa a tiempo).

**Corrección:** cuotas y rate limits por tenant en la capa de aplicación, con métricas por tenant.

### 11. Billing/metering/entitlements ausente pese a que se promete self-service con pago
No hay modelo de medición de uso por tenant ni enforcement de límites de plan, que es núcleo de un ERP SaaS.

**Corrección:** agregar metering por tenant y una capa de entitlements ligada a la edición/plan.

### 12. Migración de tenants existentes al modelo RLS/fábrica no está en el roadmap
GSG ya tiene altas ("cada alta parece inventar la rueda"), así que hay un backfill de `tenantId`, activación de FORCE RLS sobre tablas con datos, y migración de tenants provisionados a mano — un workstream entero omitido.

**Corrección:** incorporar una fase de migración de datos legacy con dry-run y verificación antes de activar FORCE RLS en producción.

### 13. Integración fiscal AFIP/ARCA por tenant falta y contradice "secreto por ámbito, no por cliente"
Un ERP argentino casi seguro necesita facturación electrónica con certificado/CUIT/clave fiscal por empresa — eso es secreto y credencial *por tenant*, invalidando el principio tal como está escrito.

**Corrección:** modelar credenciales fiscales por tenant en un gestor de secretos, y reformular el principio para admitir el caso legítimo per-tenant.

### 14. Disaster recovery es hand-wavy
"Restore selectivo por tenant vía export lógico" es operacionalmente difícil y propenso a error (restaurar filas de un tenant en una DB compartida sin pisar a los demás), y no hay RPO/RTO, PITR, ni drills de restore.

**Corrección:** definir RPO/RTO, apoyarse en PITR de Neon para recuperación total, y probar el restore selectivo como procedimiento ensayado, no como idea.

### 15. Observabilidad tenant-aware / logging no está
Falta `tenant_id` en logs/trazas/métricas (necesario para depurar fugas y como evidencia de gobernanza) y una regla de no loguear PII.

**Corrección:** propagar `tenant_id` en toda telemetría con logging PII-safe.

---

## MENOR

### 16. Cumplimiento AR (Ley 25.326) sólo aparece de pasada
Falta residencia de datos (¿en qué región está el Neon? implica transferencia internacional bajo la ley AR), derechos ARCO por sujeto de datos y notificación de brechas; además la ley está en proceso de reforma — conviene verificar el estado actual antes de fijar la política.

**Corrección:** sección de cumplimiento con región de datos, derechos del titular y borrado verificable por tenant.

### 17. Sanitización de brand SVG/CSS está bien planteada pero el XSS vía SVG es profundo
**Corrección:** nombrar el sanitizador concreto y respaldar con CSP estricta, no confiar sólo en el filtrado.

---

## Lo que está genuinamente bien (confirmación breve)
- La decisión de mantener Pool shared-schema para decenas de miles de micro-tenants es correcta.
- `SET LOCAL` dentro de transacción es el primitivo adecuado para PgBouncer en modo transacción (no es un error).
- La defensa en profundidad en capas es correcta.
- Marcar `ACTIVE` recién al final de la saga es correcto.
- Expand/contract en migraciones es correcto.
- El principio "si un invariante no tiene gate, no está gobernado" es sano.

---

## Veredicto
Base conceptual sólida y la prioridad correcta (RLS primero), pero hay cuatro correcciones bloqueantes antes de onboardear clientes reales: **contexto de tenant en jobs/colas, durabilidad de la saga en serverless, el wiring exacto de `set_config`/fail-closed, y caché por tenant** — resolverlas dentro o alrededor de la Fase 1.
