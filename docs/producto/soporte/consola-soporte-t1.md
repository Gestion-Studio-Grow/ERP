# Consola de soporte GSG — tanda 1

Rama `claude/consola-soporte-t1` (PR #36). Tickets con prioridad, historial y borrador de IA en
`/operador/soporte`. La migración `20261106120000_support_ticket` es aditiva y **no está aplicada**
en ningún lado (Gate 2): sin la tabla, el pedido de la contadora sigue quedando en AuditLog.

## Decisiones de acceso (certificación T1)

- **Los operadores leen los tickets de todos los negocios (hallazgo 3).** La lista y la ficha
  (`listarTickets`, `fichaDeTicket` en `src/lib/soporte/tickets.server.ts`) muestran asunto, detalle e
  historial de todos los negocios, CH incluido, a cualquier operador con sesión. La guardia por
  negocio (CH sólo el dueño de GSG) se aplica a lo que se **escribe**: cambiar estado, prioridad,
  nota o respuesta, tomar, pedir la sugerencia de IA y traer pedidos. Si hace falta que la lectura de
  un negocio también quede reservada, se filtra en `listarTickets`/`fichaDeTicket` con la misma
  guardia.
- **`traerPedidosAction` está exenta de la guardia de entrada (hallazgo 5).** No recibe un negocio
  del formulario: recorre todos los estudios con módulo cartera. La guardia va adentro, negocio por
  negocio (`puedeTocar` → `decidirOperadorParaNegocios`): se saltea el estudio que el operador no
  puede tocar. Está registrada en `EXENTAS` de `src/lib/operador/guardia-negocio.test.ts` y medida en
  `src/lib/soporte/tickets-postgres.test.ts`.

## Otras garantías

- **Alta detrás de un SAVEPOINT** (`crearTicketSinRomperElPedido`, `alta.server.ts`): sólo se tolera
  la tabla ausente (P2021 / 42P01), que deshace el ticket y deja guardado el pedido. Cualquier otro
  error se loguea con su código y se relanza.
- **Un evento no puede colgar de un ticket de otro negocio:** la llave foránea de
  `SupportTicketEvento` es compuesta, `(tenantId, ticketId)` → `SupportTicket(tenantId, id)`, además
  de RLS.
- **A la IA viaja lo mínimo** (`datosParaLaIa`): tipo, asunto y detalle pasados por
  `redactarTextoLibre` (la redacción del sobre de eventos). Se tapan los CUIT con cualquier
  separador, los DNI, los teléfonos y los emails. La IA sólo deja un borrador y nunca responde sola.
