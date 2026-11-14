# 06 · Plan de tandas

> Una tanda = 1 o 2 constructores (`gsg-ingeniero`, Opus alto: es plata y fiscal). Cada brief mide ≤ 2 KB
> (medido con `wc -c` al escribirlo; ver el pie). Certificación adversarial (`gsg-certificador`) **sobre el diff**
> en las tandas 1, 2, 4 y 5. Ninguna tanda aplica la migración (Gate 2) ni toca ARCA real ni Neon.
> Las decisiones D0-D3 no frenan las tandas 1 y 2 (son núcleo y arreglos que sirven igual).

| Tanda | Qué | Depende de | Riesgo | Certifica |
|---|---|---|---|---|
| 1 | Núcleo determinista: conceptos y reglas (puro), clave con ordinal, prueba de saldos, migración aditiva escrita | — | plata | sí |
| 2a | Emisión del lote de Factoque con cupo, fecha y libro de cobros + tests de carrera | 1 | plata, concurrencia | sí |
| 2b | Arreglo de H2 en el producto A (`emitirPropuestas`, MP automático) | — | plata, concurrencia | sí |
| 3 | Pantallas de Factoque detrás de interruptor (conceptos, subir, «Para revisar», lote) en nivel 1 | 1, 2a, D0, D2 | visual | revisión liviana + QA clic por clic |
| 4 | Encaje en el motor: puesto, `emitir_por_regla`, topes, autorización (nivel 2) | 2a, enmienda del motor, MIA-019, D1, D5 | plata, seguridad | sí |
| 5 | IA: sugerencia en «Para revisar», mapeo asistido, redactar regla; batería de 300 casos con reservados | 4, D3 | datos | sí |

---

## Brief tanda 1 · núcleo determinista

```
Rol: gsg-ingeniero. Worktree nuevo desde main, rama factoque/agente-t1. Sin Neon, sin ARCA, sin aplicar migraciones.
Lee: docs/productos/factoque/agente/02-diseno.md §1.2, §2.3, §3, §7 (sólo esas secciones).
Hacé, en src/lib/factoque/agente/ (archivos *-core.ts, puros, sin Prisma):
1. reconocer-core.ts: dado un movimiento (crédito) y una lista de reglas activas, devuelve
   {tipo:"concepto",conceptoId,version} | {tipo:"sin_concepto"} | {tipo:"ambiguo",ids}. Todas las reglas se
   evalúan; nunca gana por orden. Validación de regla: rechaza regla vacía, sólo-importe "cualquiera" y débitos.
   Normalizá con normalizarTexto (src/plugins/bancos/domain/valores.ts:27). CUIT con dígito verificador (src/lib/cuit).
2. clave-core.ts: clave "mov:<cuenta>:<sha256>#n" con n = ocurrencia de la base en (cuenta, fecha) en orden
   del archivo; con referencia de MP, "mp:<id>". Importes en centavos (@/lib/dinero/redondeo).
3. saldos-core.ts: prueba saldo anterior + movimientos = saldo de cada renglón; tolerancia 0 centavos.
4. Migración aditiva SIN aplicar en prisma/migrations/<timestamp>_factoque_conceptos/ con las tablas de §7,
   RLS tenant_isolation, FK de dos columnas, únicos parciales. Revisá colisión de timestamp. Schema.prisma acorde.
Tests (node --import tsx --test): ambiguo, sin concepto, dos cobros iguales -> #1 y #2, mismo archivo -> mismas
claves, solape con día cortado -> sólo el nuevo, saldos que no cierran, regla inválida.
Verificación: npx tsc --noEmit y los tests, sólo el resumen n/n. Commit por pathspec, trailer GSG, sin push.
Informe ≤300 palabras: qué, n/n, archivo:línea, pendientes.
```

## Brief tanda 2a · emisión del lote de Factoque

```
Rol: gsg-ingeniero. Rama factoque/agente-t2a desde factoque/agente-t1. Sin Neon, sin ARCA real (outbox con stub).
Lee: docs/productos/factoque/agente/03-encaje-motor.md §5 y 04-plata-y-fiscal.md §1-§3.
Referencias: src/lib/bancos-glue.ts:672-800 (emitirPropuestas, el molde), src/lib/facturacion/cobros-facturados.ts:102-175,
src/lib/facturacion/emision-manual.server.ts:160-180 (candados), src/lib/facturacion/plan-factoque.server.ts:43.
Hacé src/lib/factoque/agente/emitir-lote.server.ts: por propuesta y en orden de fecha, UNA tenantTransaction:
candado facturita-cupo -> claves del cobro (tomarClaves) -> libro -> cupo contado EN la tx (planFactoqueEnTx) ->
claim lista->emitida -> facturarCobrosInTx con concepto/receptor/alícuota del concepto (no concepto fijo 1).
Fecha: la del cobro dentro de ventanaDeFechaArca; si no, la más vieja permitida y nunca anterior a la última
factura del punto de venta y tipo (marcá la regla "a verificar en homologación"). Despacho fuera de la tx.
Sin agentes todavía: el lote lo dispara una persona (nivel 1).
Tests *-postgres.test.ts con dos conexiones: C1-C7, C10, C11, C13-C16 de 04-plata-y-fiscal.md §3. Reloj inyectado,
sin sleep. Verificación: tsc + tests, sólo resumen n/n. Commit por pathspec, sin push. Informe ≤300 palabras.
```

## Brief tanda 2b · arreglo de H2 en el producto A

```
Rol: gsg-ingeniero. Rama arreglo/h2-cupo-automatico desde main. Sin Neon.
Problema (docs/productos/factoque/agente/01-relevamiento.md §6, H2): emitirPropuestas cuenta las facturas del mes
una vez y fuera de candado (src/lib/bancos-glue.ts:686, :711-715) y mercadopago-auto.ts:284 igual. Dos lotes, o un
lote y una manual, pasan el tope del plan.
Hacé: en cada emisión automática, dentro de la tenantTransaction de la factura, tomar facturita-cupo:<tenant>
ANTES de cualquier cobro-facturado:<clave>, y recontar el cupo ahí (mismo where que contarFacturasDelMes). Si no
entra, la propuesta queda en revisión con el motivo del tope de hoy. No cambies textos ni pantallas.
Revisá que ningún camino tome cobro-facturado antes que facturita-cupo (lista los llamadores de tomarClaves).
Tests Postgres con dos conexiones: dos emitirPropuestas a la vez en tope-1; emitirPropuestas + emitirComprobanteManual
en tope-1; aviso MP + lote sin abrazo mortal. Verificación: tsc + tests resumen n/n + suites de bancos y MP existentes.
Commit por pathspec, sin push. Informe ≤300 palabras.
```

## Brief tanda 3 · pantallas de Factoque (nivel 1)

```
Rol: gsg-ingeniero. Rama factoque/agente-t3 desde factoque/agente-t2a. Sin Neon. Lee AGENTS.md (Next distinto).
Lee: docs/productos/factoque/agente/02-diseno.md §5 y §6; decisiones D0 y D2 de 05-decisiones.md (lo que diga el dueño).
Kit: DESIGN.md, .claude/rules/, estilos de src/app/facturita/estilos.ts; textos con ADR-080. Sin dependencias nuevas.
Hacé, en src/app/facturita/app/, detrás de un interruptor en src/cambios/interruptores.ts (apagado por defecto):
1. Conceptos: lista y alta desde «Mis productos» (src/app/facturita/app/MisProductos.tsx); reglas con ejemplo en
   vivo sobre el último extracto. 2. Subir extracto (reusá src/plugins/bancos/handler.ts:97). 3. «Para revisar»:
   tarjetas de a una, tres toques (molde src/app/admin/(dashboard)/facturacion/bancos/PropuestaTresToques.tsx).
4. Lote: «Facturar N por $X», llama a emitir-lote.server.ts. Server components por defecto; acciones con
   requireTenantFacturita (src/lib/facturita-actions.ts).
Verificación: tsc + tests de lógica de pantalla (patrón *-pantalla.test.ts) resumen n/n; QA clic por clic escrito
(celular 390 px y compu) en el informe; capturas con visual-verifier al scratchpad, nada binario en Git.
Commit por pathspec, sin push. Informe ≤300 palabras.
```

## Brief tanda 4 · encaje en el motor (nivel 2)

```
Rol: gsg-ingeniero. Rama factoque/agente-t4 desde factoque/agente-t2a + la rama del motor con la enmienda y MIA-019
(la que indique la orquestadora). Sin Neon, sin aplicar migraciones, sin llamar a la IA.
Lee: docs/productos/factoque/agente/03-encaje-motor.md §2, §3, §5, §6. Del motor, sólo tipos.ts y permisos-core.ts.
Hacé: puesto facturacion.factoque (src/lib/agentes/puestos/factoque.ts) con las tareas y techos de §2; operación
factoque.emitir_por_regla; topes facturas_auto_por_dia, facturas_auto_por_mes (min con el cupo del plan),
importe_max_por_factura, importe_auto_por_mes (contador monto, atómico). En emitir-lote: con nivel 2 y
autorización viva leída EN la tx, crea AgentePropuesta modo REGLA con autorizacionId+version, fuenteTipo
'movimiento', fuenteId = clave. Ampliar un concepto lo baja a nivel 1 hasta la firma nueva; achicar rige ya.
Origen PEDIDO toma el permiso menor entre persona y autorización.
Tests Postgres dos conexiones: C8, C9, C12 de 04-plata-y-fiscal.md §3; nivel guardado > techo se ignora.
Verificación: tsc + tests resumen n/n. Commit por pathspec, sin push. Informe ≤300 palabras.
```

## Brief tanda 5 · IA en «Para revisar» y batería

```
Rol: gsg-ingeniero. Rama factoque/agente-t5 desde factoque/agente-t4. IA con el plan de Claude en prueba; ninguna
clave en el repo ni en logs. Sin Neon.
Lee: docs/productos/factoque/agente/03-encaje-motor.md §4 (sólo esa sección).
Hacé: herramienta factoque.sugerir_concepto (clase prepara, techo 1) que devuelve SOLO {conceptoId, regla?, porque}
validado por esquema; el motor revalida que conceptoId sea del negocio y activo. Recorte mínimo: leyenda,
contraparte, importe y fecha del movimiento + nombres y reglas de conceptos; nunca el archivo. Mapeo asistido:
implementá MapeadorAsistido (src/plugins/bancos/domain/mapeador.ts:384); el mapeo propuesto pasa por la prueba de
saldos y lo confirma una persona. Sin autorización con proveedorIa y partes 1 y 5 firmadas: no llama.
Batería: arnés para 300 casos distintos (movimiento -> resultado esperado); escribí 100 de ejemplo; los reservados
los guarda la certificación (no los escribas). Críticas = cualquier emisión sin regla, importe distinto, concepto de
otro negocio. Verificación: tsc + tests resumen n/n. Commit por pathspec, sin push. Informe ≤300 palabras.
```

---

Medición de los briefs (bytes, `wc -c` de cada bloque): ver `README.md`.
