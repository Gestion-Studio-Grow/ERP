# Monitor de caídas y copia diaria cifrada de la base

Dos workflows de GitHub Actions (tres chequeos), gratis, sin tocar Vercel ni Neon desde el código:

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `.github/workflows/monitor-caidas.yml` | cada hora + a mano | GET `<PROD_URL>/api/health` (3 intentos). Si falla abre el issue «🔴 Producción caída» (o comenta en el abierto); cuando vuelve comenta «resuelto» y lo cierra. |
| `.github/workflows/monitor-caidas.yml` (job `copia-reciente`) | 1 vez por día, 06:41 hora Argentina, + a mano | Busca la última corrida **exitosa** de `copia-diaria-base`. Si no hay o tiene más de 26 h, abre el issue «🔴 Sin copia de la base en 26 h» (o comenta) y queda en ROJO; cuando vuelve la copia, lo cierra. |
| `.github/workflows/copia-diaria-base.yml` | 03:17 hora Argentina + a mano | `pg_dump` 17 (formato custom, comprimido) → `gpg` AES256 → artifact `copia-base-<fecha>` por 30 días. |

## Lo que tiene que cargar el dueño (una sola vez)

GitHub → repo `Gestion-Studio-Grow/erp` → **Settings → Secrets and variables → Actions → Secrets → New repository secret**:

1. **`NEON_BACKUP_DATABASE_URL`**: URL de conexión de Neon de la base de producción, la **directa** (el host SIN
   `-pooler`), idealmente con un rol de sólo lectura. Termina en `?sslmode=require`.
2. **`BACKUP_PASSPHRASE`**: una frase larga (20+ caracteres). **Guardala también fuera de GitHub** (gestor de
   contraseñas): sin ella las copias no se pueden abrir y GitHub no deja volver a leerla.

Sin estos dos, la copia termina en **ROJO** (`exit 1`) y GitHub avisa por mail: una copia que no se hizo no puede
parecer hecha. Al día siguiente también salta la alerta «sin copia en 26 h».

Opcional: en la pestaña **Variables**, `PROD_URL` (por ejemplo `https://chestetica-erp.vercel.app`). Sin ella el
monitor usa ese dominio por defecto.

Para recibir el aviso de caída por mail: tener activadas las notificaciones del repo (Watch → All activity o
Participating) en la cuenta del dueño.

## Restaurar una copia (siempre a un branch NUEVO de Neon, nunca directo a main)

1. GitHub → **Actions → copia-diaria-base** → la corrida del día → sección *Artifacts* → descargar
   `copia-base-<fecha>` (baja un `.zip`). O por CLI: `gh run download <run-id> -n copia-base-<fecha>`.
2. Descomprimir el zip y descifrar (pide la frase de `BACKUP_PASSPHRASE`):
   ```bash
   unzip copia-base-<fecha>.zip
   gpg --output base.dump --decrypt base-<fecha>.dump.gpg
   ```
3. En Neon, crear un **branch nuevo** (por ejemplo `restaurado-<fecha>`) y copiar su URL directa. No usar la de main.
4. Restaurar con el cliente 17:
   ```bash
   pg_restore --no-owner --no-privileges --clean --if-exists --dbname="<URL del branch nuevo>" base.dump
   ```
   (Para mirar el contenido sin restaurar: `pg_restore --list base.dump` o `pg_restore -f base.sql base.dump`
   y abrirlo con `psql`.)
5. Verificar el branch restaurado. Pasar datos a producción es **decisión del dueño** (Gate 2), nunca automático.
6. Borrar `base.dump` y el `.sql` del disco al terminar: tienen datos de clientes sin cifrar.

## Si falta la copia (issue «🔴 Sin copia de la base en 26 h» o `copia-diaria-base` en rojo)

1. Abrir la última corrida de **Actions → copia-diaria-base** y leer el error:
   - «Faltan secrets de copia»: cargar los que nombra (sección de arriba) y correrla a mano (*Run workflow*).
   - «pg_dump falló»: casi siempre es la URL. Puede ser una contraseña rotada sin actualizar el secret, el host con
     `-pooler` o un rol sin permiso. Se corrige el secret, **nunca** se pega la URL en un issue ni en el chat.
   - Sin corridas recientes: mirar si Actions está pausado o sin minutos (**Settings → Billing → Actions**).
2. Correr la copia a mano. Con una copia verde, el issue se cierra solo en el chequeo del día siguiente, o antes
   con **monitor-caidas → Run workflow**.
3. Si pasan 48 h sin copia, se avisa a la orquestadora: Neon conserva su propia historia, pero la copia propia es la
   que cumple la condición de MIA.

## Prueba de recuperación

La primera, manual y anotada, sigue `docs/runbooks/prueba-recuperacion-manual.md`: restaura en una rama nueva de
Neon y compara las filas por tenant contra producción.

## Si el monitor abre «🔴 Producción caída»

1. Abrir la URL de `/api/health` en el navegador; si responde 200, fue un corte breve.
2. Si no responde: Vercel → proyecto `erp-ch` → último deploy y logs. Volver al deploy anterior es la salida rápida.
3. El issue se cierra solo cuando el chequeo vuelve a dar 200.

Notas: el cron horario de GitHub (horario para no pasar los 2.000 min/mes gratis; el aviso fino lo da UptimeRobot) puede atrasarse en horas de carga (monitor de mejor esfuerzo). Las copias
viven en GitHub 30 días; para algo más largo, bajar una por mes a Drive (sigue cifrada).
