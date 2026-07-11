# 🔒 Runbook — Fase 1 ops/seguridad contra PROD (para Facundo)

**Objetivo:** dos verificaciones/acciones que necesitan credenciales de prod (Neon) que
**esta sesión no maneja**. Ambas son de bajo riesgo (una es 100% solo-lectura; la otra
es reversible y no toca ninguna tabla de negocio), pero requieren la connection string
real — por eso las corre **Facundo** (gate de seguridad), no la sesión de plataforma.

- **Autor:** Sesión de plataforma (fix de aislamiento async + este runbook) · **Fecha:** 2026-07-10
- **Rama:** `claude/sprint-startup-generic-rf6x0m`
- **Contexto:** parte de la Fase 1 (async fix + ops) autorizada por el dueño. No requiere
  que se corra en el mismo momento que el resto de la Fase 1 — son verificaciones
  independientes que se pueden hacer cuando Facundo tenga la ventana.
- **Nunca se pega la connection string acá ni en ningún commit/log/chat.** Todos los
  comandos de abajo la reciben por variable de entorno en la terminal de quien los corre.

---

## (a) Confirmar RLS enforced en las 38 tablas de prod

### Qué hace

`prisma/rls/check-rls-live.mjs` es una auditoría **SOLO LECTURA** (consulta
`information_schema` / `pg_class` / `pg_policies` / `pg_roles` — nunca escribe nada).
Es segura de correr contra prod. Complementa a `check-coverage.mjs` (que es estático,
sobre `schema.prisma`, y no prueba nada sobre el estado real de la DB).

### Comando exacto

```bash
RLS_AUDIT_DATABASE_URL="<connection string de prod, rol neondb_owner o app_rls>" \
  node prisma/rls/check-rls-live.mjs
```

- La variable es **`RLS_AUDIT_DATABASE_URL`** (no `DATABASE_URL` — así no hay riesgo de
  confundirla con la del `.env` de la app).
- Sirve tanto con el rol dueño (`neondb_owner`) como con `app_rls`: el script solo lee.

### Qué output confirma "enforced" (sin drift)

```
Tablas de-tenant (con columna tenantId): 38
  con RLS habilitado:            38/38
  con policy tenant_isolation:   38/38

✅ app_rls existe y NO evade RLS (bypassrls=false, super=false).

RESULTADO: SIN DRIFT — cobertura RLS completa ✅
```

Exit code `0` = sin drift. Si el script termina distinto a esto (cualquier `❌` en la
salida, o exit code `1`), **hay drift** — ver abajo.

### Si faltan tablas (típicamente las 5 nuevas: `Supplier`, `Collection`, `AccountPayable`,
`AccountReceivable`, `PayableCheque` — agregadas 2026-07-08, después del último
`0001_enable_rls.sql` corrido en prod)

El script te lo va a decir explícito, por ejemplo:

```
❌ SIN RLS habilitado (5): Supplier, Collection, AccountPayable, AccountReceivable, PayableCheque
❌ SIN policy tenant_isolation (5): Supplier, Collection, AccountPayable, AccountReceivable, PayableCheque

   → drift: estas tablas filtrarían datos entre tenants. Re-correr
     prisma/rls/0001_enable_rls.sql (data-driven → las cubre todas).
```

**Fix — re-correr `0001` (es idempotente: `DROP POLICY IF EXISTS` + `CREATE`, y
`ENABLE ROW LEVEL SECURITY` no falla si ya estaba habilitado). Cubre TODAS las tablas
con `tenantId` que existan en ese momento — las 33 viejas no se tocan, solo agrega lo
que falta:**

```bash
psql "<connection string de prod, rol neondb_owner — necesita ser el dueño de las tablas>" \
  -f prisma/rls/0001_enable_rls.sql
```

Después, **volvé a correr el audit** para confirmar que cerró (mismo comando de arriba)
— tiene que dar `38/38` y `SIN DRIFT ✅`. No hace falta tocar `0002_app_role.sql` de
nuevo (el rol `app_rls` ya existe; `0001` no lo toca).

> ⚠️ Si el audit ya reporta 33/38 o similar (drift parcial) es esperable y NO es un
> síntoma de que algo se rompió — es exactamente lo que pasa cuando se agregan tablas
> de tenant nuevas a `schema.prisma` sin re-aplicar `0001` a prod. La disciplina a
> partir de ahora: **toda migración que agregue un modelo con `tenantId` debería
> re-correr `0001` contra prod en el mismo release** (queda anotado como ítem de
> checklist, no está automatizado todavía).

---

## (b) Revocar/inutilizar de forma segura el rol legacy `app_user` (BYPASSRLS)

### Contexto (por qué existe este rol y por qué no se lo puede "arreglar")

`app_user` es un rol **preexistente** de antes del go-live de RLS, con `BYPASSRLS=true`
— si la app se conectara con él, **evadiría todas las policies** (cero aislamiento, en
silencio). `neondb_owner` **no puede** quitarle el `BYPASSRLS` (`ALTER ROLE app_user
NOBYPASSRLS` → `ERROR 42501 permission denied`; ese atributo es superuser-only y Neon no
da superuser). Por eso el go-live usó un rol **nuevo**, `app_rls` (nace `NOBYPASSRLS`),
y dejó a `app_user` **inofensivo mientras nadie se conecte con él** — pero "inofensivo
mientras nadie lo use" no es lo mismo que "neutralizado", y es exactamente el tipo de
rol que un día alguien reactiva por error. Esta acción lo neutraliza de forma explícita
y reversible, sin necesitar el permiso de superusuario que Neon no otorga.

### Paso 0 — Verificación PREVIA (obligatoria antes de tocar nada)

Dos chequeos, ambos solo-lectura, **sin exponer ningún secreto**:

**1. Confirmar que la app hoy se conecta como `app_rls`, no como `app_user`** — no hace
falta mirar el valor de `DATABASE_URL` (que tiene el password); alcanza con preguntarle
a la conexión misma quién es:

```sql
SELECT current_user;
-- Esperado: app_rls
```

Corré esto **con la misma `DATABASE_URL` que usa la app en prod** (Vercel). Si devuelve
`app_rls` → seguí. Si devuelve `app_user` (o `neondb_owner`) → **PARÁ** y avisá antes de
continuar — significa que la rotación de credenciales del go-live no se completó como
se pensaba, y revocar `app_user` ahora rompería la app en producción.

**2. Confirmar que NADIE está conectado con `app_user` en este momento** (más fuerte que
el paso 1: chequea la realidad de TODAS las conexiones activas, no solo la de la app):

```sql
SELECT usename, count(*) AS conexiones
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY usename
ORDER BY usename;
```

Esperado: **cero filas con `usename = 'app_user'`** (vas a ver `app_rls` con N
conexiones — esas son las de la app real; y capaz tu propia sesión con `neondb_owner`
mientras corrés esto). Si aparece `app_user` con conexiones activas → **PARÁ** y
averiguá qué proceso/script sigue usándolo antes de revocar nada.

Con los dos pasos en verde (`app_rls` conectado, `app_user` en cero), seguí.

### El SQL exacto (reversible — NO es `DROP ROLE`)

```sql
-- Corrido como neondb_owner (el dueño; SET/ALTER ROLE en atributos que SÍ puede tocar).

-- 1. Que no pueda autenticar NUNCA MÁS (no toca BYPASSRLS, que es superuser-only —
--    esto sí lo puede hacer neondb_owner: LOGIN/NOLOGIN no está restringido a superuser).
ALTER ROLE app_user NOLOGIN;

-- 2. Sin contraseña — belt-and-suspenders con el NOLOGIN de arriba (si alguna vez se
--    revierte el NOLOGIN por error, sin password tampoco puede autenticar).
ALTER ROLE app_user PASSWORD NULL;

-- 3. Le saca los privilegios de DML — aunque alguien lograra conectar con él (no
--    debería, por 1 y 2), no podría leer ni escribir nada.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_user;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM app_user;
REVOKE USAGE ON SCHEMA public FROM app_user;
```

**Por qué NO `DROP ROLE app_user`:** es irreversible, puede fallar si el rol es dueño de
algo (poco probable acá, pero no vale la pena arriesgar), y no aporta nada que `NOLOGIN`
+ `PASSWORD NULL` + `REVOKE` no den ya. Si en unas semanas nadie lo extraña, `DROP ROLE`
es una decisión aparte, deliberada, no parte de este runbook.

### Verificación POSTERIOR

```sql
SELECT rolname, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = 'app_user';
-- Esperado: rolcanlogin = false (rolbypassrls sigue en true — eso es esperado y
-- ya no importa: sin LOGIN, ese atributo es inerte).
```

Y confirmá que la app sigue funcionando normal (un request cualquiera al backoffice) —
no debería notarse NADA, porque la app nunca usó `app_user`.

### Rollback (si hiciera falta revertir)

```sql
ALTER ROLE app_user LOGIN;
ALTER ROLE app_user PASSWORD '<nueva password, la pone el dueño>';
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

No debería hacer falta — el objetivo de este runbook es justamente que `app_user` quede
retirado para siempre — pero queda documentado por si acaso.

---

## Checklist para Facundo

- [ ] (a) Correr `check-rls-live.mjs` contra prod. Si falta cobertura → re-correr `0001` → re-auditar hasta `38/38 SIN DRIFT`.
- [ ] (b) Paso 0: confirmar `current_user = app_rls` y cero conexiones activas de `app_user`.
- [ ] (b) Correr el `ALTER ROLE`/`REVOKE` de arriba.
- [ ] (b) Verificar `rolcanlogin = false` en `app_user` + que la app siga funcionando normal.
- [ ] Avisar a la sesión de plataforma / al dueño el resultado de ambas (para actualizar `docs/ESTADO-ACTUAL.md` con la fecha real de esta verificación — reconciliar la ambigüedad de fechas que señaló el addendum de arquitectura).

— Elaborado por GSG (sesión de plataforma — fix async + runbook, Fase 1)
