# Primera prueba de recuperación (manual)

Objetivo: demostrar que una copia diaria cifrada **se puede abrir y restaurar entera**.
Se restaura en una **rama NUEVA** de Neon y se compara, tabla por tabla y tenant por tenant, contra la base de
producción **en el mismo minuto** de la copia.
Diseño: Factory-GSG `00-ESTADO/DISENO-BASE-DATOS-2026-11-10.md` §3.2 y §7.1. La versión automática mensual
(`prueba-restauracion.yml`) viene después y sigue estos mismos pasos.

> **Nunca** se escribe en la rama `main` de Neon (`br-floral-thunder-actj830m`). La rama de prueba es de tirar.
> Ninguna URL de conexión, contraseña ni frase de cifrado se imprime, se pega en el chat ni se anota. Si algo no
> coincide, **se frena y se avisa**: no se arregla a mano sobre ninguna base.

## 0. Condiciones antes de empezar (todas)

- [ ] **Cambio de claves hecho** (diseño §4): `neondb_owner` rotada y `NEON_API_KEY` nueva.
- [ ] El dueño cargó los secrets de GitHub (lista: Factory-GSG `00-ESTADO/SECRETS-GITHUB-DUENO-2026-11-10.md`).
- [ ] `copia-diaria-base` tiene **al menos 1 corrida verde** después de la carga.
- [ ] OK de la orquestadora o del dueño para crear la rama de prueba (suma 1 rama; el tope del plan es 10).
- [ ] Lo corre **el dueño, o una sesión con el dueño presente**: hace falta la frase `BACKUP_PASSPHRASE`, que
      tipea el dueño y no viaja por el chat.
- [ ] En la máquina, **cliente de Postgres 17** (`pg_restore --version` ≥ 17; el 16 no lee copias del 17), además de
      `gpg`, `gh` y `unzip`. Se baja el artifact en la máquina del dueño: desde una sesión en la nube, el proxy
      puede bloquear la descarga.
- [ ] Una carpeta de trabajo nueva y vacía (`umask 077`), fuera de cualquier repo y de carpetas sincronizadas.

Tiempo estimado: 30 a 45 minutos.

## 1. Sacar una copia fresca

Así la diferencia con producción es de minutos y entra seguro en la ventana de historia (PITR) del plan.

1. GitHub → **Actions → copia-diaria-base → Run workflow**. Esperar el verde.
2. Anotar el número de corrida (`run-id`) y el nombre del artifact, `copia-base-AAAA-MM-DD_HHMM`.

## 2. Bajar y descifrar

```bash
umask 077
gh run download <run-id> -R Gestion-Studio-Grow/erp -n copia-base-<fecha>
gpg --output base.dump --decrypt base-<fecha>.dump.gpg     # pide la frase: la tipea el dueño
pg_restore --list base.dump | sed -n '1,12p'                # encabezado: sin datos de clientes
```

Del encabezado se anota la línea **«Archive created at …»**, que es la hora exacta de la foto de `pg_dump`, y la
versión de la base.
Si `gpg` falla, la prueba **falló**: la frase guardada fuera de GitHub no abre la copia. Se frena y se avisa.

## 3. Crear la rama de prueba (Neon, proyecto `old-frost-91078346`)

- Nombre: **`prueba-restauracion-AAAAMMDD`**. No empieza con `respaldo-`, así que la rotación de 4 no la toca.
- Padre: `main`. **Punto en el tiempo:** la hora de «Archive created at» (en UTC). Si queda fuera de la ventana de
  historia del plan, la rama sale de *ahora* y el resultado se anota como «comparado contra ahora» (ver §6).
- Vencimiento: **24 h**, si la consola lo ofrece. Así se borra sola aunque la prueba quede a medias.
- En **Connect** de esa rama: rol `neondb_owner`, base `neondb`, conexión **directa** (sin `-pooler`).

Cargar las URL sin que queden en la pantalla ni en el historial:

```bash
read -rs -p 'URL directa de la rama, base neondb: ' URL_PITR; echo; export URL_PITR
read -rs -p 'Endpoint de main (ep-…, desde la consola): ' EP_MAIN; echo
case "$URL_PITR" in *"$EP_MAIN"*) echo 'FRENAR: es el endpoint de main' ;; *) echo 'ok: no es main' ;; esac
```

Con `FRENAR`, no se sigue. Se revisa en la consola qué endpoint se copió.

## 4. Restaurar en una base vacía, dentro de la rama

```bash
psql "$URL_PITR" -X -q -v ON_ERROR_STOP=1 -c 'CREATE DATABASE prueba_restauracion'
URL_COPIA=$(printf '%s' "$URL_PITR" | sed -E 's#/neondb([?]|$)#/prueba_restauracion\1#'); export URL_COPIA
case "$URL_COPIA" in */prueba_restauracion*) echo 'ok: apunta a prueba_restauracion' ;; *) echo 'FRENAR' ;; esac
date -u +%H:%M:%S; pg_restore --no-owner --no-privileges --dbname="$URL_COPIA" base.dump 2> restore.err; echo "exit=$?"; date -u +%H:%M:%S
grep -c '^pg_restore: error' restore.err
```

- Se anota la **duración** y el `exit`. Si hay errores, se leen.
- Sólo se toleran errores sobre el *schema* `public` o su comentario, que son propiedad de otro rol en Neon.
- Cualquier error sobre una tabla, sus datos, un índice o una restricción hace que la prueba **falle**.
- `restore.err` puede traer nombres de host: no se pega en ningún lado.

## 5. Contar y comparar (sólo lectura)

`scripts/restauracion/conteo-por-tenant.sql` corre dentro de `BEGIN TRANSACTION READ ONLY`, o sea, sólo `SELECT`.
Da el control de rol y RLS, la última migración, las filas de cada tabla y las filas por tenant, con su slug.

```bash
ERP=<ruta al repo del ERP>
psql "$URL_PITR"  -X -q -At -F '|' -v ON_ERROR_STOP=1 -f "$ERP/scripts/restauracion/conteo-por-tenant.sql" > conteo-produccion.txt
psql "$URL_COPIA" -X -q -At -F '|' -v ON_ERROR_STOP=1 -f "$ERP/scripts/restauracion/conteo-por-tenant.sql" > conteo-copia.txt
grep '^control' conteo-produccion.txt
diff conteo-produccion.txt conteo-copia.txt && echo 'IGUALES'
grep '^tenant' conteo-copia.txt
```

**Antes de leer el diff**, mirar las líneas `control`:

- `rls_forzado` tiene que dar `0`, o bien `rol_bypassrls` tiene que dar `true`. Si no se cumple ninguna, RLS esconde
  filas y el conteo no vale: **se frena y se avisa**. No se desactiva RLS a mano.
- `tablas_public` y `ultima_migracion` tienen que coincidir con las del repo en `main`.

**Criterio de la prueba:**

| Resultado | Cuándo |
|---|---|
| ✅ **OK** | `diff` vacío (`IGUALES`). |
| ⚠️ **OK con diferencia explicada** | Sólo cuando la rama salió de *ahora*: hay filas de más en producción, en tablas con actividad desde la hora de la copia, y ninguna tabla tiene **menos** filas en producción que en la copia. |
| ❌ **Falla** | Cualquier otra diferencia, faltan tablas, falló `gpg` o hubo errores de `pg_restore` fuera de lo tolerado. |

## 6. Anotar el resultado

Se crea Factory-GSG `00-ESTADO/PRUEBA-RECUPERACION-AAAA-MM-DD.md` (lo pasa la orquestadora para el informe a MIA)
con estos datos:

- Fecha, quién la corrió y quién estuvo presente.
- La corrida de la copia (`run-id` y nombre del artifact) y la hora de «Archive created at».
- La rama de prueba, su punto en el tiempo (exacto o *ahora*) y la versión de la base.
- La duración del `pg_restore`, su `exit` y la cantidad de errores, con el tipo de cada uno, sin hosts.
- Las líneas `control` y las líneas `tenant|<slug>|<filas>` de las dos bases.
- El resultado (✅, ⚠️ o ❌) y, si no es ✅, las tablas distintas y la explicación.
- **No se anota nada más:** ni URL, ni frase, ni host, ni datos de clientes.

## 7. Limpiar (siempre, aunque la prueba falle)

1. En la consola de Neon, borrar la rama `prueba-restauracion-AAAAMMDD`, si no venció sola. Se borra **sólo
   esa**, nunca `main` ni una `respaldo-*`.
2. En la máquina:
   ```bash
   shred -u base.dump base-*.dump.gpg *.zip restore.err conteo-*.txt
   unset URL_PITR URL_COPIA EP_MAIN
   ```
3. Si la sesión de terminal guardó historial, revisar que no haya quedado ninguna URL (con `read -rs` no queda).
