# Monitor de caídas y copia diaria cifrada de la base

Dos workflows de GitHub Actions, gratis, sin tocar Vercel ni Neon desde el código:

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `.github/workflows/monitor-caidas.yml` | cada hora + a mano | GET `<PROD_URL>/api/health` (3 intentos). Si falla abre el issue «🔴 Producción caída» (o comenta en el abierto); cuando vuelve comenta «resuelto» y lo cierra. |
| `.github/workflows/copia-diaria-base.yml` | 03:17 hora Argentina + a mano | `pg_dump` 17 (formato custom, comprimido) → `gpg` AES256 → artifact `copia-base-<fecha>` por 30 días. |

## Lo que tiene que cargar el dueño (una sola vez)

GitHub → repo `Gestion-Studio-Grow/erp` → **Settings → Secrets and variables → Actions → Secrets → New repository secret**:

1. **`NEON_BACKUP_DATABASE_URL`**: URL de conexión de Neon de la base de producción, la **directa** (el host SIN
   `-pooler`), idealmente con un rol de sólo lectura. Termina en `?sslmode=require`.
2. **`BACKUP_PASSPHRASE`**: una frase larga (20+ caracteres). **Guardala también fuera de GitHub** (gestor de
   contraseñas): sin ella las copias no se pueden abrir y GitHub no deja volver a leerla.

Sin estos dos, la copia corre igual pero termina en verde con un aviso «Copia diaria INACTIVA».

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

## Si el monitor abre «🔴 Producción caída»

1. Abrir la URL de `/api/health` en el navegador; si responde 200, fue un corte breve.
2. Si no responde: Vercel → proyecto `erp-ch` → último deploy y logs. Volver al deploy anterior es la salida rápida.
3. El issue se cierra solo cuando el chequeo vuelve a dar 200.

Notas: el cron horario de GitHub (horario para no pasar los 2.000 min/mes gratis; el aviso fino lo da UptimeRobot) puede atrasarse en horas de carga (monitor de mejor esfuerzo). Las copias
viven en GitHub 30 días; para algo más largo, bajar una por mes a Drive (sigue cifrada).
