# Relevo · PR5 «automático» (06/11/2026)

**Quién lo deja:** el constructor del paso 1 (PR #19 → contrato v1.1), session_01BtqRUMV4Bs8j2kqxv4ERPq, cerca del techo de 100k.
**Estado:** el PR5 no se arrancó. No hay rama ni commits.

## La tarea (brief de la orquestadora)
Va en un PR aparte, con Opus en esfuerzo alto, porque es plata:
- **C1:** cablear la devolución y el contracargo a la ingesta de MP, más el reintento de `esperar_cae`.
- **C2:** una devolución que llega antes que la factura.
- **C3:** el tope de la NC por cobro (la suma de las NC no puede pasar el total facturado del cobro).
- **C4:** cargar `medioDePago`.
- **Decisión del dueño:** el contracargo va sin NC (sólo abre un caso). Si hace falta una tabla nueva, el SQL va a `prisma/pending-gate2/` sin aplicar.
- **Calidad:** certificación adversarial del diff, `tsc`, build, tests y `gate:rls` en verde. No se mergea ni se aplican migraciones.

## Base
- Partir de `claude/factoque-mp-clasificacion` @ el commit del paso 1, que ya trae #21 (`claude/facturador-guiado`) y #22 (`claude/motor-fiscal-pr3`, que contiene #13 y #20).
- La base del PR va a ser `claude/factoque-mp-clasificacion`, por el orden de merge #13 → #20 → #22 → #21 → #19 → PR5.

## Dónde mirar (para no explorar)
- La NC por devolución y el caso por contracargo de PR3 están en `src/lib/facturacion/devoluciones-mp.ts`, con su prueba en `devoluciones-mp-postgres.test.ts`, y en `nota-credito-core.ts`.
- La ingesta de MP: `src/lib/mercadopago-auto.ts`, `src/lib/invoice-from-mp.ts` y `src/plugins/mercadopago/` (normalizarPago en `http.ts`).
- La clave de una devolución es `mp:refund:<id>` (`clave-origen.ts`). El CHECK del libro ya la admite porque empieza con `mp:`.
- Los reintentos están en `src/lib/arca-reintentos.ts` (`POLITICA_DE_REINTENTOS`) y el contrato de estados en `estado-comprobante.ts`.
- Las propuestas de MP (paso 1) están en `src/lib/facturacion/propuesta-mp.ts`. El hash es `mp:<id>`, que es la forma guardada de `mp:payment:<id>`.

## Cuidados que dejó el paso 1
- En el libro, una propuesta de MP se factura con la clave `mp:<id>` (`bancos-glue.ts`, con `pagoDeLaPropuesta`). Con C3 hay que contar las NC contra la factura de esa clave.
- El cron `/api/cron/mp-respaldo` sigue en seco. `guardarPropuestaMP` existe pero todavía no está cableado. Cablearlo es decisión de la orquestadora.
- Para correr las pruebas de Postgres localmente: `initdb` + `pg_ctl` con `-p 5433 -k /tmp/pgrun` (ver `src/test/base-efimera.ts:91`).
- `tsc` necesita `NODE_OPTIONS=--max-old-space-size=6144`.
