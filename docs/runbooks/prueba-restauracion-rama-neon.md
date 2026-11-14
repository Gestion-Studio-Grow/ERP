# Prueba de restauración en una rama temporal de Neon

> ## ⛔ NO EJECUTAR sin el visto bueno del dueño (§C)
>
> Este runbook se escribió para que lo pueda seguir un agente paso a paso, pero **correrlo es decisión del dueño**.
> Hasta que el dueño diga «dale» por escrito (§C), es sólo un plan.

Se trabaja **siempre sobre una rama temporal** de Neon. La rama de producción no se toca: ni `reset`, ni `restore`, ni
escrituras. La app **nunca** se apunta a la rama temporal.

Antecedente: me pidieron partir de `docs/runbooks/prueba-recuperacion-manual.md`, pero ese archivo **no existe en
ninguna rama** del repo (`git log --all -- docs/runbooks/prueba-recuperacion-manual.md` no devuelve nada). Este
runbook arranca de lo que sí existe: `docs/runbooks/copia-y-monitor.md` (sección «Restaurar una copia»).

---

## §A. Para qué sirve y qué demuestra

Hoy el repo **dice** que hay copia diaria (`.github/workflows/copia-diaria-base.yml`) y que se puede restaurar
(`docs/runbooks/copia-y-monitor.md`), pero **nadie midió cuánto tarda ni cuánto dato se pierde**. Esta prueba
convierte esas promesas en números:

- **RPO medido** (cuánto dato se pierde): la diferencia entre «ahora» y el dato más nuevo que aparece en la base
  restaurada.
- **RTO medido** (cuánto se tarda): desde «decidimos restaurar» hasta «la base restaurada pasó las verificaciones».

| Dato | Valor hoy |
|---|---|
| RPO del camino (a), punto en el tiempo | **NO MEDIDO** |
| RPO del camino (b), copia diaria | **NO MEDIDO** (en teoría hasta ~24 h, porque la copia corre una vez por día a las 06:17 UTC; sin medir) |
| RTO del camino (a) | **NO MEDIDO** |
| RTO del camino (b) | **NO MEDIDO** |
| Ventana de restauración a un punto en el tiempo que da el plan de Neon contratado | **NO MEDIDO** (no figura en el repo) |
| Si los secretos `NEON_BACKUP_DATABASE_URL` y `BACKUP_PASSPHRASE` están cargados (copia activa o «INACTIVA») | **NO MEDIDO** |
| Rol con el que corre el `pg_dump` de la copia diaria | **NO MEDIDO** (ver riesgo en §F.4) |
| Nombre del proyecto Neon y de la rama de producción | **NO MEDIDO**: usar los que muestre la consola; acá van como `$PROYECTO_NEON` y `$RAMA_PRODUCCION` |

**Qué NO demuestra:** que la app arranque contra la base restaurada (eso implicaría apuntarla a la rama temporal, y
está prohibido en §G). Tampoco prueba el monitor de caídas.

---

## §B. Precondiciones

Marcá cada una antes de empezar. Si alguna falla, **no se empieza**.

| # | Precondición | Cómo se comprueba | APROBADO si… |
|---|---|---|---|
| B1 | Visto bueno del dueño (§C) | Mensaje escrito del dueño con fecha | Existe y nombra qué camino(s) correr |
| B2 | Acceso a la consola de Neon del proyecto, con permiso para **crear y borrar ramas** | Entrar a Neon → proyecto → *Branches* | Se ve el botón *Create branch* |
| B3 | Cliente `psql` y `pg_restore` versión 17 (la base es Postgres 17, según el workflow) | `pg_restore --version` y `psql --version` | Ambos dicen `17.x` |
| B4 | Sólo camino (b): acceso a GitHub Actions del repo y la frase de `BACKUP_PASSPHRASE` (la tiene el dueño fuera de GitHub) | GitHub → *Actions* → `copia-diaria-base` | Hay una corrida verde **con artifact** `copia-base-<fecha>` (si dice «Copia diaria INACTIVA», el camino (b) no se puede correr: anotarlo como FALLA de la copia, no del runbook) |
| B5 | Una URL de **sólo lectura** de producción para los conteos de comparación | El dueño la provee como `$URL_PRODUCCION_LECTURA` | Rol sin permisos de escritura. Nunca la del dueño de las tablas si se puede evitar |
| B6 | Disco local cifrado o temporal para el `.dump` (tiene datos de clientes sin cifrar) | — | Se sabe dónde va y que se borra al final (§E) |
| B7 | Reloj: anotar la hora UTC de inicio | `date -u` | Anotada en la tabla de §D |

Marcadores que se usan (nunca pegar valores reales en este archivo ni en el chat):

- `$URL_RAMA_TEMPORAL`: URL **directa** (sin `-pooler`) de la rama temporal.
- `$URL_PRODUCCION_LECTURA`: URL de sólo lectura de producción.
- `$INSTANTE_OBJETIVO`: instante UTC al que se quiere volver, formato `2026-11-10T12:00:00Z`.

---

## §C. Visto bueno del dueño

Antes de ejecutar, el dueño confirma por escrito:

1. Qué camino se corre: (a), (b) o ambos.
2. Para el camino (a), qué `$INSTANTE_OBJETIVO` usar (sugerido: hace 1 hora, para medir algo realista).
3. Quién guarda la frase de `BACKUP_PASSPHRASE` y la tipea (el agente no la recibe por chat).
4. Que la rama temporal se borra al terminar, pase lo que pase.

Sin esto, parar acá.

---

## §D. Planilla de tiempos (RTO) y antigüedad del dato (RPO)

Completar en cada corrida. Horas siempre en UTC (`date -u '+%Y-%m-%dT%H:%M:%SZ'`).

| Hito | Camino (a) | Camino (b) |
|---|---|---|
| T0 — decisión de restaurar (inicio del reloj) | | |
| T1 — rama temporal creada y con URL | | |
| T2 — datos disponibles (rama lista en (a) / `pg_restore` terminado en (b)) | | |
| T3 — verificaciones de §E terminadas | | |
| **RTO = T3 − T0** | | |
| Dato más nuevo en la rama restaurada (consulta E6) | | |
| Instante de referencia (en (a): `$INSTANTE_OBJETIVO`; en (b): T0) | | |
| **RPO = referencia − dato más nuevo** | | |
| Resultado global (APROBADO / FALLA) | | |
| Quién ejecutó | | |

---

## §1. Camino (a) — restaurar a un punto en el tiempo en una rama nueva

Neon permite crear una rama **a partir del estado de otra en un instante pasado**. La rama nueva es independiente:
lo que se haga ahí no toca producción.

| Paso | Acción exacta | Qué se espera ver | APROBADO / FALLA |
|---|---|---|---|
| a1 | Anotar T0 en §D | — | — |
| a2 | Neon → proyecto `$PROYECTO_NEON` → *Branches* → *Create branch*. Padre: `$RAMA_PRODUCCION`. Elegir la opción de crear desde un **instante pasado** (en la consola figura como punto en el tiempo / *past data*; el rótulo exacto **NO MEDIDO**) y poner `$INSTANTE_OBJETIVO`. Nombre: `prueba-restauracion-AAAAMMDD`. **Sin** marcarla como rama por defecto | La rama nueva aparece en la lista con ese nombre y su padre es producción | APROBADO si se crea. FALLA si Neon dice que el instante está fuera de la ventana de historia: anotar la ventana real (cierra el «NO MEDIDO» de §A) y elegir un instante más reciente |
| a3 | En la rama nueva → *Connect* → copiar la URL **directa** (sin `-pooler`) y exportarla **sólo en la terminal**: `export URL_RAMA_TEMPORAL='…'` | — | APROBADO si `psql "$URL_RAMA_TEMPORAL" -c 'select 1'` devuelve `1` |
| a4 | Confirmar que es la rama correcta y no producción: `psql "$URL_RAMA_TEMPORAL" -Atc "select current_database(), now()"` y comparar el host de la URL con el que muestra la consola para la rama nueva | El host corresponde a la rama `prueba-restauracion-…` | FALLA y **parar** si hay la menor duda de que es producción |
| a5 | Anotar T1 y T2 (en este camino la rama ya trae los datos al crearse) | — | — |
| a6 | Correr las verificaciones de §E contra `$URL_RAMA_TEMPORAL` | Ver §E | Ver §E |
| a7 | Anotar T3 y calcular RTO y RPO en §D | — | APROBADO si §E pasó entera |
| a8 | Limpieza (§F) | — | — |

Nota: en el camino (a), los conteos **no tienen que dar iguales** a producción de ahora: la rama está en
`$INSTANTE_OBJETIVO`. Se espera que sean **iguales o menores**, nunca mayores (§E2).

---

## §2. Camino (b) — restaurar desde la copia diaria a una rama temporal

Esto prueba la copia que arma `.github/workflows/copia-diaria-base.yml` (`pg_dump` 17, formato custom, cifrado con
`gpg` AES256, guardada 30 días como artifact `copia-base-<fecha>`). Los pasos siguen
`docs/runbooks/copia-y-monitor.md` («Restaurar una copia»), con mediciones agregadas.

| Paso | Acción exacta | Qué se espera ver | APROBADO / FALLA |
|---|---|---|---|
| b1 | Anotar T0 en §D | — | — |
| b2 | GitHub → *Actions* → `copia-diaria-base` → la corrida más reciente en verde → *Artifacts* → bajar `copia-base-<fecha>`. Por consola: `gh run download <run-id> -n copia-base-<fecha>` | Un `.zip` | FALLA si la corrida dice «Copia diaria INACTIVA» o no tiene artifact: **la copia no existe**, avisar al dueño (§H) |
| b3 | Anotar la `<fecha>` del artifact (es la hora Argentina del dump, `AAAA-MM-DD_HHMM`) | — | Sirve para el RPO |
| b4 | `unzip copia-base-<fecha>.zip` y después `gpg --output base.dump --decrypt base-<fecha>.dump.gpg` (la frase la tipea quien la tenga, §C.3) | Archivo `base.dump` | FALLA si `gpg` no descifra: la copia está pero **no sirve**. Es el hallazgo más grave posible: avisar (§H) |
| b5 | `pg_restore --list base.dump \| head -20` | Lista de objetos (tablas, índices, políticas) | FALLA si da error de formato |
| b6 | `pg_restore --list base.dump \| grep -c 'POLICY'` | Un número mayor que 0 | FALLA si es 0: la copia no trae las políticas RLS |
| b7 | Crear la rama temporal: Neon → *Branches* → *Create branch*, nombre `prueba-copia-AAAAMMDD`, padre `$RAMA_PRODUCCION`, desde el estado **actual**. (Una rama «vacía» de verdad depende de opciones de Neon que **NO MEDIDO**; por eso se usa `--clean --if-exists`, igual que `copia-y-monitor.md`, que borra y recrea cada objeto de la copia dentro de la rama temporal) | La rama aparece | APROBADO si se crea |
| b8 | URL directa de la rama nueva → `export URL_RAMA_TEMPORAL='…'`. Repetir el chequeo de a4 | Es la rama `prueba-copia-…`, no producción | FALLA y **parar** ante cualquier duda |
| b9 | Anotar T1. Restaurar: `time pg_restore --no-owner --no-privileges --clean --if-exists --dbname="$URL_RAMA_TEMPORAL" base.dump 2> restore.err` | Termina; `restore.err` puede traer avisos | APROBADO si `restore.err` no trae líneas `ERROR` sobre tablas o datos (`grep -c ERROR restore.err`). Avisos sobre roles/propietarios son esperables por `--no-owner` |
| b10 | Anotar T2 | — | — |
| b11 | Correr §E contra `$URL_RAMA_TEMPORAL` | Ver §E | Ver §E |
| b12 | Anotar T3 y calcular RTO y RPO en §D | — | APROBADO si §E pasó entera |
| b13 | Limpieza (§F), que **incluye** borrar `base.dump`, el `.zip`, el `.gpg` y `restore.err` | — | — |

Ojo con `--no-privileges` (b9): no restaura los `GRANT` al rol de la app `app_rls` (`prisma/rls/0002_app_role.sql`
líneas 57-66). En la rama temporal da igual porque nadie se conecta como la app. En una restauración **real** hay que
volver a correr esos `GRANT` o la app no podría leer nada.

---

## §E. Verificaciones de integridad (SOLO LECTURA)

Todas son `SELECT`. Se corren **dos veces**: contra `$URL_RAMA_TEMPORAL` y contra `$URL_PRODUCCION_LECTURA`, y se
comparan. Envolver cada sesión así, para que la base rechace cualquier escritura por error:

```bash
psql "$URL" -v ON_ERROR_STOP=1 -X <<'SQL'
BEGIN;
SET TRANSACTION READ ONLY;
-- … consultas …
ROLLBACK;
SQL
```

La salida son sólo números y nombres de tablas: **ningún dato personal**.

### E1. Migraciones aplicadas

```sql
SELECT count(*) AS migraciones,
       max(finished_at) AS ultima_terminada,
       count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) AS a_medias
FROM _prisma_migrations;
```

APROBADO si `a_medias = 0` y `migraciones` es igual a producción (camino (b)) o igual/menor (camino (a), si hubo
migraciones después de `$INSTANTE_OBJETIVO`). FALLA si falta la tabla o hay migraciones a medias.

### E2. Conteo por tabla de negocio (todas las que tienen `tenantId`, sin listarlas a mano)

Mismo criterio data-driven que `prisma/rls/0001_enable_rls.sql` (recorre `information_schema` buscando la columna
`tenantId`), para no inventar nombres de tablas:

```sql
SELECT c.table_name,
       (xpath('/row/n/text()',
              query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.table_name), false, true, '')))[1]::text::bigint AS filas
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'
ORDER BY c.table_name;

SELECT count(*) AS negocios FROM "Tenant";
```

⚠️ Correr E2 conectado como el **dueño de las tablas** o con un rol con `BYPASSRLS`; con el rol de la app sin
negocio puesto, RLS devuelve 0 en todo (`prisma/rls/0001_enable_rls.sql` líneas 16-19) y la comparación no sirve.

APROBADO: camino (b) → cada tabla igual a producción, salvo las que crecieron después de la hora de la copia (anotar
cuáles); camino (a) → cada tabla igual o menor que producción. FALLA: una tabla que falta, o una tabla con **más**
filas en la restaurada que en producción, o `negocios` distinto.

### E3. Políticas RLS presentes

```sql
-- tablas con tenantId que NO tienen RLS o NO tienen política: tiene que dar 0 filas
SELECT c.table_name, cl.relrowsecurity,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.table_name) AS politicas
FROM information_schema.columns c
JOIN pg_class cl ON cl.relname = c.table_name
JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND cl.relkind = 'r'
  AND (NOT cl.relrowsecurity
       OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.table_name));

SELECT count(*) AS politicas_tenant_isolation FROM pg_policies
WHERE schemaname = 'public' AND policyname = 'tenant_isolation';
```

APROBADO si la primera da **0 filas** y la segunda da el mismo número que en producción. FALLA si no. (Lo mismo, más
completo, lo hace `prisma/rls/check-rls-live.mjs`; se puede usar con `RLS_AUDIT_DATABASE_URL="$URL_RAMA_TEMPORAL"`.)

### E4. Suma de caja por negocio (`CashMovement`)

`CashMovement.amount` es `Float` y siempre positivo; el signo lo pone el `type` (`prisma/schema.prisma` línea 1652 y
siguientes). Por eso se suma por tipo, sin interpretar:

```sql
SELECT "tenantId", "type", count(*) AS movimientos, round(sum(amount)::numeric, 2) AS total
FROM "CashMovement"
GROUP BY "tenantId", "type"
ORDER BY "tenantId", "type";
```

### E5. Suma de cobranzas por negocio (`Collection`)

`Collection.amount` es `Decimal(14,2)` (`prisma/schema.prisma` línea 1972 y siguientes):

```sql
SELECT "tenantId", count(*) AS cobranzas, sum(amount) AS total
FROM "Collection"
GROUP BY "tenantId"
ORDER BY "tenantId";
```

APROBADO (E4 y E5): camino (b) → iguales a producción salvo movimientos posteriores a la copia, que se explican con
E6; camino (a) → iguales o menores. FALLA: un negocio que falta, o un total distinto que no se explica por
movimientos nuevos.

Para la comparación ad hoc con producción alcanza restringir a lo anterior al corte:
`WHERE "occurredAt" <= '<corte>'` en `CashMovement` y `WHERE "createdAt" <= '<corte>'` en `Collection`. Con ese
filtro los totales tienen que dar **exactamente iguales**.

### E6. Dato más nuevo (para el RPO)

```sql
SELECT greatest(
  (SELECT max("occurredAt") FROM "CashMovement"),
  (SELECT max("createdAt")  FROM "Collection")
) AS dato_mas_nuevo;
```

Anotar en §D. Esto es lo que vuelve el RPO **medido**.

---

## §F. Limpieza (con verificación)

| Paso | Acción | Verificación | APROBADO si… |
|---|---|---|---|
| F1 | Neon → *Branches* → la rama `prueba-restauracion-…` / `prueba-copia-…` → *Delete*. **Leer dos veces el nombre antes de confirmar** | La rama ya no figura en la lista | No figura, y la de producción sigue ahí con su nombre de siempre |
| F2 | `unset URL_RAMA_TEMPORAL URL_PRODUCCION_LECTURA` | `echo "${URL_RAMA_TEMPORAL:-vacío}"` → `vacío` | Vacío |
| F3 | Sólo camino (b): `shred -u base.dump base-*.dump.gpg restore.err 2>/dev/null; rm -f copia-base-*.zip` | `ls base.dump` → «No such file» | Ningún archivo de la copia en disco |
| F4 | Confirmar que producción sigue sana: `curl -s <PROD_URL>/api/ready` (`src/app/api/ready/route.ts`, hace un `SELECT 1`) | `200` con `ready` verdadero | 200. Si da 503, **no es por esta prueba** (no se tocó producción), pero avisar igual |
| F5 | Pegar la planilla de §D completa en el issue o canal que indique el dueño | — | Planilla publicada |

### F.4 Riesgo detectado leyendo el repo (no medido)

`copia-diaria-base.yml` recomienda un rol **de sólo lectura** para el `pg_dump`. Si ese rol no es dueño de las tablas
y no tiene `BYPASSRLS`, RLS se le aplica: por defecto `pg_dump` **corta con error** («query would be affected by
row-level security policy») o, si alguien le agrega `--enable-row-security`, **guarda las tablas vacías** (sin
negocio puesto no se ve nada). El paso b6 + E2 lo detectan. Qué rol usa hoy la copia: **NO MEDIDO**.

---

## §H. Si algo falla

1. **No arreglar en caliente** y **nunca** tocar producción para «emparejar».
2. Anotar en §D qué paso falló, con la salida del comando **sin URLs** (taparlas como hace el workflow:
   `sed -E 's#postgres(ql)?://[^ "]*#postgresql://***#g'`).
3. Hacer la limpieza (§F) igual: la rama temporal no queda viva.
4. Avisar al dueño. Gravedad:
   - **Crítico** (avisar en el día): la copia no existe (b2), no se descifra (b4), no trae políticas (b6) o viene vacía
     (E2 en 0).
   - **Alto**: conteos o sumas que no cierran (E2, E4, E5) sin explicación.
   - **Medio**: RTO o RPO peores de lo que el dueño considera aceptable (el objetivo **NO MEDIDO**: lo fija el dueño).

---

## §G. Qué NO hacer, nunca

- **Nunca** `reset`, `restore` ni «Restore to point in time» sobre la rama de producción. La restauración se hace
  **creando una rama nueva**, no pisando la existente.
- **Nunca** apuntar la app (Vercel, `DATABASE_URL`, `OPERATOR_DATABASE_URL`) a la rama temporal, ni «para probar un
  ratito».
- **Nunca** `pg_restore` con la URL de producción. Antes de cada `pg_restore`, repetir el chequeo de a4.
- **Nunca** correr `npm run seed` ni `prisma db seed` contra ninguna rama con datos reales: empieza con `deleteMany()`
  de todas las tablas (`docs/runbooks/recuperar-chestetica.md`, «Regla de oro»).
- **Nunca** marcar la rama temporal como rama por defecto del proyecto.
- **Nunca** pegar URLs, contraseñas ni la frase de la copia en el chat, en un issue ni en este archivo.
- **Nunca** dejar la rama temporal ni el `.dump` descifrado después de terminar.

— Elaborado por GSG
