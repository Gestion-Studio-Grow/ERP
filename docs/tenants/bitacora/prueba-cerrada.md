# Bitácora Café · prueba cerrada en un preview (camino A, A LA ESPERA DEL OK DEL DUEÑO)

Pedido de la orquestadora (10/11/2026, tarjeta C14). **Nada de esto se ejecuta sin el OK del dueño.**
Esto no hace merge a main ni toca la rama `main` de Neon. Los textos legales siguen en BORRADOR.

## Qué ya está hecho (código, sin ejecutar)

- `src/lib/delivery-local/qa-seed.ts` carga los datos de ejemplo:
  - el negocio `bitacora` (rubro cafetería);
  - el dueño, con cambio de contraseña obligatorio;
  - 13 productos de ejemplo;
  - dos zonas de envío de ejemplo.

  Sólo agrega: no borra ni pisa nada. Se puede correr de nuevo sin duplicar datos.
- Antes de escribir pasa por dos frenos. Si cualquiera corta, no se escribe nada:
  1. **Por URL:** corta si la base es la de la rama `main` de Neon (endpoint `ep-little-credit-act3cxpe`, verificado contra Neon el 10/11, sólo lectura). Lo detecta en la conexión directa, en el pooler y en `options=endpoint=`.
  2. **Por contenido:** corta si la base tiene cualquier negocio que no sea `bitacora` (`beauty-spa`, `magra`, `magra-*` o cualquier otro).
- CLI: `scripts/tenants/bitacora-qa-seed.mts`.
  - Lee `QA_DATABASE_URL`, nunca `DATABASE_URL`.
  - Pide `--confirmo-rama-qa-pedi-local`.
  - La contraseña provisoria entra por `QA_OWNER_PASSWORD` y no se imprime.
- Tests: `qa-seed.test.ts`, con los frenos y la carga completa contra una base efímera de Postgres. Prueba los dos cortes y que correrlo dos veces no duplica ni pisa.

## Pasos, una vez que el dueño dé el OK

1. **Neon (la orquestadora):**
   - Rotación de respaldos (regla de 4): hoy hay 10 ramas, el tope del plan.
   - Crear `qa-pedi-local` **sólo con estructura** a partir de `main` (Console: «Schema only»; API: `init_source: "schema-only"`).
   - La documentación de Neon dice que es beta y que la rama nace como **rama raíz**: en el plan Free entran 3 por proyecto (`main` ya ocupa una) y comparte el GB de almacenamiento. Fuente: neon.com/docs/guides/branching-schema-only.
2. **No correr `prisma migrate deploy`** sobre esa rama. Copia la estructura pero no las filas, así que `_prisma_migrations` nace vacía y el deploy intentaría recrear todo. Esta rama no tiene migraciones nuevas, y la estructura de `main` es la que el código ya tolera.
   - A verificar al crearla: si el rol `app_rls` y las políticas RLS vienen copiados (inferido, no confirmado).
3. **Carga:** `QA_DATABASE_URL=<qa-pedi-local> QA_OWNER_PASSWORD=<provisoria> npx tsx scripts/tenants/bitacora-qa-seed.mts --owner-email <titular> --confirmo-rama-qa-pedi-local`
4. **Vercel:** variables de **Preview** limitadas a la rama del PR #115 (`gitBranch`). Pisan las de Preview general, que hoy son de producción.

   | Variable | Valor en la rama |
   |---|---|
   | `DATABASE_URL`, `OPERATOR_DATABASE_URL` | `qa-pedi-local` (rol `app_rls`) |
   | `FORCE_TENANT_SLUG` | `bitacora` |
   | `SITE_GATE_PASSWORD` | la carga el dueño en el panel o va por `request_credential`. **Nunca por el chat** |
   | `MP_ACCES_TOKEN`, `MP_WEBHOOK_SECRET` | apagado: sin cobro automático |
   | `ARCA_INVOICING_ENABLED` | `false` |
   | `ARCA_MODO`, `ARCA_CERT_PEM`, `ARCA_KEY_PEM`, `FISCAL_MASTER_KEY` | apagado: sin certificados ni clave fiscal reales en el preview |

   - **Mail:** Vercel no tiene `RESEND_API_KEY` en ningún entorno, así que `mailConectado()` da falso (`src/lib/notifications.ts:81`) y la app no manda mails. No se carga.
   - **WhatsApp:** `WHATSAPP_GSG` es sólo un número para el botón de contacto, no envía mensajes.
5. **Un build de preview** cuando haya cupo diario (redeploy desde Vercel, sin commit vacío).
6. **Acceso:**
   - El dueño entra con su login del equipo de Vercel.
   - El titular entra con un link compartible de ese deploy y la clave del portón, que le llega por mail aparte.
   - Al terminar se revocan el link y la clave, y se borra `qa-pedi-local`.

— Elaborado por GSG
