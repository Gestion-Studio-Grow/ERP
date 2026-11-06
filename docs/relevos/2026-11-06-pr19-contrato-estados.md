# Relevo · PR #19 → contrato de estados v1.1 (06/11/2026)

**Quién lo deja:** sesión B del facturador (session_01BtqRUMEBydQsYUkz5gMmjG), al cerrar la tarea 1 (PR #21).
**Por qué:** cerca del techo de contexto; esta tarea se arranca en una sesión fresca.

## La tarea (brief de la orquestadora)
Conectar el PR #19 (rama `claude/factoque-mp-clasificacion`: bandeja, `PropuestaTresToques`,
`propuestas-adaptador.ts`, `/api/cron/mp-respaldo` en seco) al contrato de estados
(`src/lib/facturacion/estado-comprobante.ts`, rama `claude/motor-facturacion`).

## Datos confirmados (por mensajes de otras sesiones)
- El contrato pasó a **v1.1** (commit `1816127` de `claude/motor-facturacion`):
  `estadoDelComprobante(h, ahora, maxIntentos)` usa por defecto `POLITICA_DE_REINTENTOS.maxIntentos` (hoy 4,
  `arca-reintentos.ts`). **No pasar 8 de forma explícita.** Los 7 estados y sus campos no cambian.
- Las propuestas de MP se guardan en **`MovimientoImportado`**, con hash **`mp:payment:<id>`**, el mismo que
  `claveOrigen`. Los estados v1 rigen **a partir de «emitida»**. Antes de eso, lo que manda es el estado propio de la
  propuesta.
- Emitir desde la propuesta usa `emitirComprobanteManualAction` (idempotente por `claveEmision` → `claveOrigen`)
  detrás de un adaptador fino, con el patrón de `bancos/propuestas-adaptador.ts`.

## Plan sugerido (1 constructor, Opus alto: es plata y datos)
1. Partir de `claude/factoque-mp-clasificacion` y traer `estado-comprobante.ts` (+ `arca-reintentos.ts`) de
   `origin/claude/motor-facturacion` @1816127, con merge o cherry-pick. Revisar colisiones con
   `prisma/migrations` (**sin migración**: si hace falta una, frenar y avisar).
2. Adaptador: propuesta MP → `MovimientoImportado` (hash `mp:payment:<id>`) → al emitir, leer
   `HechosDelComprobante` (Invoice + OutboxEvent) → `estadoDelComprobante` → la bandeja muestra el estado v1.1.
3. `/api/cron/mp-respaldo` sigue en seco. Sólo cambia cómo arma las propuestas.
4. Tests: el adaptador puro (cada estado), una idempotencia en Postgres efímero (mismo `mp:payment:<id>` dos veces →
   una sola propuesta y un solo autorizado) y `tsc`.
5. Certificación adversarial sobre el diff (plata + concurrencia). Commit por pathspec y push a la rama del #19.

## Lo que NO se hizo
Nada de esta tarea: no se tocó la rama del #19.
