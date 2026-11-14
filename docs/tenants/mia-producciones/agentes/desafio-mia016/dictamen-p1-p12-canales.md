# Dictamen · canales §19 (P1–P12) contra el motor 09 y el esquema unificado

Certificador GSG, 14/11/2026. Sólo lectura. Objeto: `a07f5ff:docs/productos/canales-y-bandeja/03-especificacion-tecnica.md`
§19 (l.637-664), con §3.2-3.3, §8, §10, §11; `46f5b52:…/09-tecnica-ejecucion.md` §2-§7, §10, §17.1;
`desafio-mia016/esquema-unificado.md`; `lista-de-ataque-07-10.md` §B-§J.

Evidencia ejecutada: `/tmp/claude-0/-home-user/1a9045e2-a9b1-59ab-b227-859db07fea0d/scratchpad/p19/ataque-p2.mjs`
(PGlite, local; sin Neon). Resultado: 7/12 ataques frenados por la base, 5 pasan (ver H1, H2, H3, H4).

## Veredicto de §19: CUMPLE CON CAMBIOS

Un solo camino de escritura del negocio: sí (`operar`; `CanalOferta` no escribe datos del negocio). Pero:
P2 tiene que entrar con un CHECK más completo y con un único parcial nuevo; la FK no puede entrar en 1A;
y el «cliente final como solicitante» necesita una decisión registrada del dueño, porque choca con la letra de
«un texto de un tercero nunca dispara una transacción».

## P1 a P12

| # | Veredicto | Columnas, CHECK o FK exactos | Porqué |
|---|---|---|---|
| P1 | **ENTRA** | `AgentePropuesta_origen_check`: `CHECK (origen IN ('RUTINA','PEDIDO','CANAL'))` (reemplaza al de H7 antes de aplicar) | Si espera, la migración de canales tiene que hacer `DROP CONSTRAINT` + re-crear: DDL bloqueado por norma y segundo Gate 2. Ningún código escribe `CANAL` antes de C3 (test estático) |
| P2 | **ENTRA en parte; la FK ESPERA** | Entran: `"canalOfertaId" TEXT NULL`, `"solicitanteContactoId" TEXT NULL`; `AgentePropuesta_origen_solicitante_check`: `CHECK ((origen='CANAL' AND "canalOfertaId" IS NOT NULL AND "solicitanteContactoId" IS NOT NULL AND "pedidoId" IS NULL AND "solicitadoPor" IS NULL) OR (origen='PEDIDO' AND "pedidoId" IS NOT NULL AND "solicitadoPor" IS NOT NULL AND "canalOfertaId" IS NULL AND "solicitanteContactoId" IS NULL) OR (origen='RUTINA' AND "pedidoId" IS NULL AND "solicitadoPor" IS NULL AND "canalOfertaId" IS NULL AND "solicitanteContactoId" IS NULL))`; único parcial `AgentePropuesta_tenantId_canalOfertaId_viva_key ("tenantId","canalOfertaId") WHERE "canalOfertaId" IS NOT NULL AND estado IN ('PENDIENTE','EJECUTADA','REVERTIDA')`; `origen`, `clave`, `pedidoId`, `solicitadoPor`, `canalOfertaId`, `solicitanteContactoId` fuera del `GRANT UPDATE` de columnas (patrón D1). Espera a la migración de canales: `AgentePropuesta_tenantId_canalOfertaId_solicitanteContactoId_fkey ("tenantId","canalOfertaId","solicitanteContactoId") → "CanalOferta"("tenantId","id","contactoId") ON DELETE RESTRICT` (ALTER aditivo; valida al instante: no hay filas CANAL) | La FK no puede apuntar a una tabla que no existe en 1A. Probado: la FK frena botón de otro contacto y oferta de otro negocio; el CHECK frena el hueco MATCH SIMPLE. Sin el CHECK ampliado y el único, pasan H1-H3 |
| P3 | ESPERA (sin migración, código 09) | `origenes` suma `"canal"`; no declarado ⇒ `RECHAZO("fuera_del_rol")` | Correcto y más estricto que `usar_lista`. Exigir por test: `canal` ⇒ `modo` `sola` con `deshacer` o `persona` |
| P4 | ESPERA (código 09) | `ctx.solicitante.tipo='cliente-final'` ⇔ origen `CANAL` (lo ata el CHECK de P2) | Vale con H6 y H7 |
| P5 | ESPERA (código 09) | Base del puesto declarada en código, techo `RECEPTION`, test que impide subirla | Si el puesto «declara» su rol sin trinquete, se puede declarar `OWNER` |
| P6 | **ENTRA (tipo y hash)** | `AgenteAutorizacion."datosSensibles" JSONB NOT NULL DEFAULT '[]'` (hoy sin tipo) y la definición de `textoHash` (H4 del esquema) pasa a cubrir `operaciones` + `topes` + `datosSensibles`. `canales: string[]` va dentro de `operaciones` (sin columna) | 09 §2.1 hashea sólo `operaciones`+`topes`: `datosSensibles` quedaría firmado sin hash. Entrada sin `canales` = ningún canal. No cubre Ley 25.326 (H9) |
| P7 | ESPERA (código; `sujeto` es texto) | `porContraparteDia.cantidad`; `sujeto` = `contraparte:cliente:<clientId>` si reconocido, `contraparte:contacto:<contactoId>` si visitante; «abiertos» por conteo en la transacción, no por contador | Ver H5 |
| P8 | ESPERA (código 09) | `PERSONA("fuera_de_horario")` sólo con origen `CANAL` | No abre vía: corre en el paso 9, después de 1-8, y deriva en vez de diferir (más estricto). Anotarlo como excepción a H15. Ver H7 |
| P9 | ESPERA (código 09) | `prepararOperacion` sin escritura; `CAMBIO` = rollback total | Vale sólo con H6 |
| P10 | ESPERA (código, sin migración) | `canales-ia` como base de `atencion.canales`; `equipo-agentes-ejecuta` igual | Consistente con 09 §2.3 si `canales-ia` lo escribe sólo la consola. No verificado: `canales-ia` no está en `src/cambios/interruptores.ts` de esta rama |
| P11 | ESPERA (código 09 §17.1) | Huella `canal` = 17.1 + modelo + hash de instrucciones + versión `TareaDeCanal` | Falta lo que §J.45 obliga: versión del armado de contexto (P12) y del camino de plata del ERP que toca la operación (H10) |
| P12 | ESPERA con condiciones (texto 09 §10.2) | Sólo `CanalMensaje` ENTRANTE, `origen='CLIENTE'`, mismo `contactoId`, sin `textoBorradoEl`, desde la última vuelta a `ASISTENTE`, máx. 5 | Sigue siendo texto del propio solicitante; sin el corte se cosechan mensajes dirigidos a una persona |

## Hallazgos

| # | Sev. | Hallazgo | Reproducción | Arreglo |
|---|---|---|---|---|
| H1 | **Alta** | La FK de H6 es MATCH SIMPLE: `PEDIDO` con `solicitadoPor` nulo o `RUTINA` con `pedidoId` pasan sin atadura (un pedido se hace pasar por rutina, lista §B.8). Defecto del esquema certificado, no de canales | `ataque-p2.mjs`: casos «RUTINA haciéndose pasar» y «PEDIDO sin solicitadoPor» aceptados | CHECK unificado de P2 |
| H2 | **Alta** | Uso único de la oferta no lo sostiene la base: con clave reutilizada (C3, §10) una oferta da dos propuestas vivas | caso «MISMA oferta, otra clave» aceptado; con el único parcial se rechaza | `AgentePropuesta_tenantId_canalOfertaId_viva_key` |
| H3 | Media | `app_rls` puede reatar una propuesta a otra oferta del mismo contacto; el REVOKE de columna no sirve (confirma D1 de 09 en Postgres) | casos «reatar» y «D1» aceptados | REVOKE UPDATE de tabla + GRANT de columnas que cambian |
| H4 | Alta (decisión) | El cliente final pasa a ser solicitante: operación y argumentos nacen de su texto leído por un modelo; sólo el disparo es un botón. Contradice la letra de la regla del dueño (09 §10, lista §G.31) | Lectura: §19 P3 la reinterpreta sin cita del dueño | Decisión del dueño registrada: «para sí, por botón, dentro de lo que ya hace la página pública». Sin eso, C3 queda frenado (§19 último párrafo) |
| H5 | Alta | Tope por contraparte = contacto: un visitante hace contactos nuevos (en web, sin costo: el canal no certifica identidad) y agota `porDia` (60 turnos/pedidos falsos): agenda tomada y cupo del negocio ocupado | §8 (web = visitante) + §10 tabla | Web sin tareas que escriben; cupo diario aparte y menor para visitantes; reconocido por `clientId` |
| H6 | Alta (plata) | `CAMBIO` depende de una huella que arma cada tarea: si omite un dato del precio, el monto o la contraparte cambian después de confirmado sin `CAMBIO` | §10 paso 1 | El motor compara siempre `operacion`, `version`, args, `montoCentavos`, `moneda`, `contraparte`, `fuente` contra la fila `CanalOferta` leída con `tx` (nunca contra `ctx`) |
| H7 | Media | `permisoDeCanalVivo` exige oferta «sin vencer»: una propuesta CANAL que pasa a PERSONA no se puede aprobar después de 15 min. Y si la aprobación no lo llama, no se revisa si el permiso sigue igual (ficha que cambió de teléfono) | §3.2 vs §10 paso 7 | Al aprobar una persona: revisar grado y `clientId` sin el vencimiento |
| H8 | Media | Confirmación y `operar` son dos transacciones; «Tomar la conversación» entre medio no se traba (lectura sin candado, mismo defecto que H1 del esquema) | §10 pasos 4-5 | `permisoDeCanalVivo` hace una escritura real sobre la conversación (`estado='ASISTENTE'`) y sobre la oferta (`CONFIRMADA`, `agentePropuestaId IS NULL`); entropía de `opcion` ≥128 bits |
| H9 | Media (legal) | `datosSensibles` firmado por el negocio no cubre a los titulares de los datos (Ley 25.326 arts. 5, 7, 12, 25: **sin leer en la fuente**). La FK RESTRICT frena borrar `CanalOferta` (pedido de supresión) | caso «borrar la oferta» rechazado | Base legal y aviso por contacto (§12 del módulo), revisión legal; supresión = anonimizar `argumentos`/`resumen` |
| H10 | Alta (plata, §10) | `ventas.link_de_pago` con clave por oferta: `armarLinkDePagoDePedido` (`src/lib/cobros/link-de-pedido.server.ts:30-48`) crea una preferencia nueva de MP por llamada, 48 h de vida: hasta 3 links vivos por pedido ⇒ doble cobro. Además es un efecto externo que el rollback no deshace | lectura del código | Clave por pedido e importe; `modo: "persona"` hasta que se pueda anular |
