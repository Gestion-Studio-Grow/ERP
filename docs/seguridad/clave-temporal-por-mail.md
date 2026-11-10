# Contraseña provisoria: sólo por mail al titular (GSG-SEG-014)

Orden del dueño (10/11/2026): cada alta que crea una contraseña provisoria la manda **sola** por mail, y los
reseteos se hacen sin que nadie intervenga en la consola de producción.

## La regla

- La provisoria se **genera en el servidor**. En la base se guarda **sólo su hash**.
- Sale **sólo en el cuerpo del mail** al titular. Ese mail lleva el link de ingreso y el aviso de que hay que cambiarla.
- La provisoria **no** va:
  - en el asunto;
  - en la pantalla ni el resultado de la acción;
  - en un log, la auditoría, una URL o un mensaje de WhatsApp.
- La pantalla y la auditoría muestran sólo el destino enmascarado (`c***@dominio.com`).
- Toda provisoria deja `mustChangePassword = true`. Si la columna no existe, la operación **falla cerrada** y no se toca nada.
- **Sin mail conectado** (`RESEND_API_KEY` y `RESEND_FROM_EMAIL`) no se crea ni se resetea nada. La pantalla
  dice «mail no conectado». No hay un camino alternativo que muestre la clave.

## Dónde y cómo

| Origen | Código | El mail va… | Si el mail falla |
|---|---|---|---|
| Reseteo del dueño (ficha del negocio) | `resetearClaveDelDuenioConMail` (`src/lib/clave-temporal-entrega.server.ts`) | último paso **dentro** de la transacción (flag → hash → auditoría → mail) | se deshace todo (hash anterior intacto). La falla queda en la auditoría (`clave_temporal.mail_fallido`, en otra transacción) y en pantalla. |
| Alta de una persona (consola) | `altaPersonaCore` (`src/lib/operador/alta-persona.ts`) | igual: último paso dentro de la transacción | el alta se deshace entera. Se audita y se avisa. |
| Alta de negocio (wizard) | `commitTenantAction` → `entregarClaveDeAlta` | **después** del commit: la saga de provisión no puede quedar abierta esperando la red. Sólo si ESTE alta creó al dueño, y al OWNER de la base con ese email. El cache de idempotencia de la saga guarda el resultado **sin** la clave (`sinClaveProvisoria`): repetir el alta no vuelve a mandar nada | el negocio queda creado con una clave que nadie tiene y el cambio obligatorio. La pantalla indica «Resetear y mandar por mail» en la ficha. |
| Configurador (pedido de alta) | `entregarClavesDelConfigurador` (`solicitudes/entrega-de-claves.ts`) | después del commit, una por titular, en su negocio | igual que el wizard. A la contadora le genera otra la dueña del estudio. |
| Reseteo pendiente (orden del dueño) | `RESETEOS_PENDIENTES` (`src/lib/claves-pendientes.ts`) + `/api/cron/claves-pendientes` | igual que el reseteo del dueño | queda en `fallo` y se reintenta en la corrida del día siguiente. |

`resetAllOwnerPasswords` (reseteo masivo) quedó **apagado**: devolvía las claves en pantalla. No vuelve sin un diseño propio.

`createUser` / `resetUserPassword` del panel del negocio **no aplican**: ahí la contraseña la escribe la dueña.
Ya llevan el cambio obligatorio.

## Reseteos pendientes declarados en código

Se usan cuando el dueño pide resetear a alguien y nadie debe tocar la consola de producción.

1. Se suma una entrada a `RESETEOS_PENDIENTES` con:
   - una `clave` **única** para siempre (fecha + negocio + quién);
   - el `slug` del negocio;
   - el `motivo`;
   - `vence` (AAAA-MM-DD), **a lo sumo 90 días** después de la fecha de la clave. Lo controla el propio ejecutor
     (`venceValido`): una fecha imposible, anterior a la clave o más lejana queda en `fallo` y no corre.
     Pasada esa fecha la entrada queda `vencida` y no hace nada. Motivo: la purga de auditoría
     (`audit-retention.ts`, 18 meses) borra la fila que prueba que el reseteo ya se hizo; sin vencimiento,
     una entrada olvidada volvería a resetear al dueño.
2. Se publica por PR. El cron diario de producción (`vercel.json`, `0 13 * * *` UTC = 10:00 Argentina) lo corre
   con los secretos del servidor (`CRON_SECRET`, Resend).
3. **Idempotente:**
   - dentro de la misma transacción del reseteo se toma `pg_advisory_xact_lock` sobre la clave;
   - después se busca en la auditoría un `owner.password.reset` con `changes.pendiente = clave`.
   - Si ya está, no se hace nada (`ya-estaba`). Dos corridas a la vez no resetean dos veces.
4. Sólo corre en producción: los cron de Vercel no corren en preview ni en local.
5. La respuesta del cron devuelve el estado por clave y el destino enmascarado. Nunca devuelve la clave.
6. Una entrada ya hecha puede quedar en la lista (no hace nada) o borrarse en un PR posterior. La clave **no se reutiliza**.

Para ver qué pasó: en la auditoría del negocio, `owner.password.reset` con `actor = system:claves-pendientes`
cuando salió bien, o `clave_temporal.mail_fallido` cuando no salió.

## Riesgos que quedan (aceptados)

- **Reseteo:** el mail sale pero el commit falla. La persona recibe una clave que no anda y la vieja sigue valiendo. Otro reseteo lo arregla.
- **Wizard / configurador:** el mail falla después del commit. La persona existe con una clave desconocida y el cambio obligatorio. Se recupera con el reseteo.
- **Pendiente con el mail caído:** queda una fila `clave_temporal.mail_fallido` por día hasta que el mail vuelva.
- **Latencia del cron:** el plan Hobby sólo permite cron diario, así que un pendiente tarda hasta 24 h.

## Tests

- `src/lib/clave-temporal-mail.test.ts`: armado del mail, la clave sólo en el cuerpo, mail caído o sin red o sin respuesta a tiempo, sin PII en logs.
- `src/lib/owner-password-reset.test.ts`, `src/lib/operador/alta-persona.test.ts`: mail OK y mail caído (se tira y se deshace).
- `src/lib/claves-pendientes.test.ts`, `src/lib/claves-pendientes-postgres.test.ts`: idempotencia, concurrencia, mail caído y reintento, y el portón del cambio obligatorio.
- `src/lib/operador/consola-bajo-rls-postgres.test.ts`: alta y reseteo bajo RLS con Resend simulado; con el mail caído no cambia nada.
- `solicitudes/entrega-de-claves.test.ts`: el configurador no devuelve ninguna clave.
- `src/lib/alta-negocio-clave-postgres.test.ts`: repetir el alta con el mismo nombre corto y otro email no manda ningún mail más (hallazgo del refutador).
