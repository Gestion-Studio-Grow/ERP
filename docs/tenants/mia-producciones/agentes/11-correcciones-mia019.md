# Equipo de agentes de Administración · MIA — 11 · Correcciones de GSG-MIA-019 contra el dictamen de MIA-016

> 15/11/2026. Sólo documentos: sin código, sin `prisma`, sin Neon. Rama `agentes/mia-019-diseno-corregido`, desde
> `a07f5ff`. Vara: `desafio-mia016/dictamen-final.md`, `dictamen-07-08-10.md` (H1-H24), `dictamen-09.md` (X1-X16),
> `dictamen-p1-p12-canales.md`, `esquema-final-enmienda.md` y `lista-de-ataque-07-10.md` §A-§J (rama
> `agentes/diseno-ejecucion`, commit `1506c9c0`). Contratos de 1A: rama `agentes/tanda-1` (490d2048).

## 1. Veredicto de partida y qué se hizo

| Documento | Veredicto MIA-016 | Qué se hizo |
|---|---|---|
| `07` flujo | CUMPLE CON CAMBIOS | Corregido punto por punto (tabla §2) y §11 nueva (meta de lo que sale solo) |
| `08` funcional | NO CUMPLE | C4 reescrito (consume el movimiento); §4 autorización reescrita; §9 reescrita contra §J; criterios 32-40; guion en negocio de ensayo |
| `09` técnica | NO CUMPLE | X1-X16 aplicados; esquema = `esquema-final-enmienda.md`; §17 reescrita contra §J; §18 nueva (canales) |
| `10` plan v2 | NO CUMPLE | Reemplazado por `13-plan-de-tandas-v3.md`; `10` queda como historia con un aviso arriba |
| Canales `03` §19 | CUMPLE CON CAMBIOS | Resultado registrado: entran P1, P2 sin la FK y P6; lo demás espera, con las condiciones del dictamen |
| (nuevo) | — | `12-brief-enmienda-esquema.md`: la única enmienda y su brief |

## 2. Hallazgo → cambio → archivo y sección

### 2.1 `dictamen-07-08-10.md`

| Id | Sev. | Cambio | Dónde |
|---|---|---|---|
| H1 | BLOQUEANTE | C4 consume el movimiento en la misma transacción (`updateMany … cuotaId null o = la cuota`, `count === 1`); acepta M atado por B2 a esa misma cuota (resuelve el paso 13 del guion); clave `C4:mov:<id>`; por cuota, el único de MIA-018 y `pagadoEl: null`; test «M usado por A → B va a persona» | `08` §2.2 (condiciones de C4), criterio 33, guion 13b · `09` §7 (tabla), §8, §14 · `13` brief 4B |
| H2 | BLOQUEANTE | La batería la escribe L1 antes de la implementación y la corre L2; sesiones distintas del constructor y entre sí; reservados fuera del repo, por hash | `08` §9 · `09` §17.3 · `13` §1, briefs L1 y L2 |
| H3 | ALTO | 4A y 4B dependen de GSG-MIA-018 integrado y certificado, con el único de `cuotaId` aplicado; constante `espera_mia018` en el código hasta entonces; test de carrera persona contra agente | `07` §2 · `08` §2.2, §2.4 · `09` §4 (paso 4), §8, §11 · `13` §1, briefs 2A, 4A, 4B |
| H4 | ALTO | La plata no corre como rutina: subir un extracto crea un `PEDIDO` a nombre de quien subió (permiso más chico); lo que va a una persona no lo aprueba quien subió (CHECK `no_aprueba_lo_propio`) | `07` §3 (fila 4), §6 · `08` §2.2, §2.4, criterio 36 · `09` §4, §5, §9 · `13` brief 3B |
| H5 | ALTO | `guardarDatoCuotaEnTx` sólo con `factura` y `comentario`; la rama `venceEl` queda en la acción manual; lista blanca `Operacion.campos`; test estático; «mover el vencimiento» a la lista de siempre-persona | `08` §2.2 (C5), §2.3 (P5), §3, criterio 37 · `09` §4 (contrato), §8 · `13` brief 3A |
| H6 | ALTO | Lo del código, 100 % por construcción y sin tasa; la batería mide sólo el juicio del modelo, con casos distintos | `08` §9 · `09` §17.2, §17.3 |
| H7 | ALTO | Lista completa de fallas críticas de §J.43 y graves ≤ 2 % | `08` §9 · `09` §17.4 |
| H8 | ALTO | Huella = hash de los archivos del camino de plata + contrato + batería + modelo y versión + instrucciones; autorización que amplía invalida; regresión nocturna y muestreo con alerta | `08` §9 · `09` §4 (`archivos`), §17.1, §17.5 · `13` brief 5 |
| H9 | ALTO | Quién firma = decisión del dueño (D1) **antes** de 2B; techo escrito (los topes de `08` §2, sólo se bajan); recomendada (c) | `08` §4 · `09` §2.3 · `13` brief 2B · §3 D1 |
| H10 | ALTO | Guion primero en un negocio de ensayo; en MIA sólo con su titular real; movimientos de prueba atados o excluidos por lote «PRUEBA GSG» | `08` §8 (encabezado, paso 21) · `09` §9 · §3 D5 |
| H11 | ALTO | Llave en el código: sin partes 1 y 5 no hay llamada al proveedor ni lectura de GSG; parte 6 con Legal antes de la IA con datos reales | `07` §3 (fila 2) · `08` §4, criterio 38 · `09` §3 (llave 5), §10 · `13` brief 1-AJ |
| H12 | ALTO | Brief propio de la enmienda, certificado antes del Gate 2; `07` y `13` dicen que 1A recibe la enmienda sin reabrirse; ajustes a 1B-1D | `12` · `07` encabezado · `13` §2 (brief 1-AJ) |
| H13 | ALTO | Meta provisional (70 % solas a 30 días), métrica del panel, conteo sobre un extracto real antes de la etapa 2, criterio de aceptación | `07` §11 · `08` criterio 32 · `13` briefs 2C y 5 |
| H14 | ALTO* | Deshacer C4 sin `regenerarCuotas` (leído: recalcula el plan con el tipo de cambio vigente, `gestion.server.ts:239`); ida y vuelta compara todas las cuotas del proyecto; enlace cuota–cobro también en `resultado` hasta la FK | `08` §2.2 (C4), criterio 35, guion 14 · `09` §8, §14 · `13` brief 4B |
| H15 | MEDIO | Plazo de 180 s condicionado y medido (p95); despertador por minuto requisito para la etapa 2 | `07` §3 (fila 8), §4 · `08` criterio 2 · `09` §9 |
| H16 | MEDIO | Vencimiento obligatorio (provisional 12 meses) y aviso 15 días antes | `08` §4 · `13` brief 2B |
| H17 | MEDIO | Una sola vía de lectura, la consola con registro; sin registro no hay lectura; revocación por parte | `07` §3 (fila 13), §7 · `08` §4 |
| H18 | MEDIO | Los 47 puntos asignados a una tanda | `13` §8 |
| H19 | MEDIO | Un pedido escrito no ejecuta nada que escriba: ofrece el pedido de la lista armado y la persona confirma | `07` §4 · `08` §2.2 («Dos reglas»), criterios 17 y 26 · `09` §4 (paso 5), §10 · `13` brief 2C |
| H20 | MEDIO | Expediente con quién corrió, reservados por hash, versión de autorización, hash de instrucciones y commit; la fila de liberación lleva su sha256 | `08` §9 · `09` §17.6 |
| H21 | MEDIO | Día y mes cerrados en toda escritura y en su deshacer; `periodoAbiertoTx` no existe hoy (verificado), se crea | `08` §2.2 · `09` §4 (paso 7), §8, §11 · `13` briefs 2A, 3A, 4A |
| H22 | BAJO | Etapa 0 «aviso interno», declarada como lo único que no se deshace | `07` §2 · `08` §1, §2.1, §2.5 |
| H23 | BAJO | Todos los briefs piden n/n con `scripts/ci/resumen-tests.mjs` y el formato fijo; la tanda 4 tiene briefs | `13` encabezado y §6 |
| H24 | BAJO | Calendario de feriados nacionales; la cláusula de responsabilidad también en los términos | `08` §2.2 (tope C4), §4 (parte 7), §6, §9 · `09` §6 |

### 2.2 `dictamen-09.md`

| Id | Sev. | Cambio | Dónde |
|---|---|---|---|
| X1 | BLOQUEANTE | Disparador `_irreversible` sobre `revocadaEl` **y** `reemplazadaEl` (en la enmienda); test «retirar un reemplazo: rechazado» | `09` §2.1, §14 · `12` · `08` criterio 40 |
| X2 | BLOQUEANTE | `AgentePropuesta_origen_solicitante_check` de tres orígenes (cierra el nulo de MATCH SIMPLE) | `09` §2.1, §14 · `12` |
| X3 | BLOQUEANTE | B2 y C4 sin liberar hasta GSG-MIA-018; `conciliarEnTx` es la de MIA-018 con `FOR UPDATE`; el único de `cuotaId` es de MIA-018 | `09` §4, §8, §11 · `13` §1, briefs 4A y 4B |
| X4 | ALTO | C4 exige `pendiente == monto` y ningún cobro suelto por el mismo importe en 10 días | `08` §2.2, criterio 34 · `09` §8 · `13` brief 4B |
| X5 | ALTO | `metodo_check`; ampliar con 24 h, confirmación y aviso a todos los OWNER; reset del OWNER revoca; decisión D1 | `08` §4 · `09` §2.1, §2.3 · `13` brief 2B |
| X6 | ALTO | `RECHAZADA` ocupa la clave; rehacer con `:rehecha:<n>` sólo por una persona | `08` §2.2 · `09` §2.1, §4 (paso 6), §7 |
| X7 | ALTO | CHECK de dominio de `modo`, `fuenteId` no vacío, FK a la versión de la autorización | `09` §2.1, §2.2 · `12` |
| X8 | ALTO | REVOKE/GRANT repetidos en `0002`, aserción `DO … RAISE EXCEPTION`, los 4 scripts corren `0002`; `data-dba` verifica el rol de producción | `09` §2.2, §15 · `12` |
| X9 | MEDIO | Paso 3 recalcula con `tx` monto, moneda, pendiente, unicidad y tipo de cambio; si difiere, persona | `08` §2.2 · `09` §4 (tabla de `operar`) · `13` briefs 2A y 4B |
| X10 | MEDIO | Sólo ARS en la base (`monto_check`); otra moneda, decisión D6 y diseño propio | `08` §2.2 · `09` §2.1, §6 · §3 D6 |
| X11 | MEDIO | Respaldo exacto en las dos direcciones también en B2 | `08` §2.4 · `09` §8 · `13` brief 4A |
| X12 | MEDIO | Expediente fuera de la purga: tabla propia recomendada (D2-b) o exención en `PURGE_EXEMPT_ENTITIES` | `09` §17.6 · `13` brief LT · §3 D2 |
| X13 | MEDIO | `origenPedidoId` + FK con el mismo `userId` | `09` §2.1, §4 · `12` · `13` brief 3A |
| X14 | BAJO | `no_aprueba_lo_propio_check` en la base | `09` §2.1 · `12` |
| X15 | BAJO | La comprobación del día cerrado toma el candado del cierre, o la etapa 2 corre antes de la hora de cierre | `09` §8 |
| X16 | BAJO | Aserción en tiempo de ejecución en el envoltorio de la llamada | `09` §10 · `13` brief 1-AJ |

### 2.3 Canales (`dictamen-p1-p12-canales.md`)

| Id | Cambio | Dónde |
|---|---|---|
| P1 | Entra en la enmienda | `09` §18 · `03` §19 (resultado) · `12` |
| P2 | Entra sin la FK (columnas, CHECK, único por oferta, fuera del GRANT); la FK va en la migración de canales | `09` §18 · `03` §19 · `12` |
| P6 | Entra (`datosSensibles` Json, `textoHash` ampliado) | `09` §2.1, §18 · `03` §19 · `12` |
| P3-P5, P7-P12 | Esperan a C3, sin esquema | `09` §18 · `03` §19 |
| H1-H3 | Cerrados por el CHECK de tres orígenes y el único por oferta | `12` |
| H4 | Decisión del dueño D4 | §3 · `03` §19 |
| H5, H6, H10 | Condiciones para C3: web sin tareas que escriben y cupo de visitantes; el motor compara contra la `CanalOferta` leída con `tx`; link de MP por pedido | `09` §18 · `03` §19 |
| H7-H9 | Quedan en el diseño de canales para C3 (no tocan el esquema de esta enmienda) | `03` §19 (remite al dictamen) |

### 2.4 «Antes de construir» de `dictamen-final.md`

| # | Dónde quedó |
|---|---|
| 1 Brief de la enmienda, certificado antes del Gate 2, con el rol de producción verificado | `12` |
| 2 GSG-MIA-018 antes de B2 y C4 | `13` §1; `09` §4 y §8 |
| 3 C4 consume el movimiento; deshacer deja todo como estaba, `regenerar` incluido | `08` §2.2; `09` §8 |
| 4 Reescribir `08` §9 y `09` §17 contra §J.41-47 | `08` §9; `09` §17 |
| 5 Rutina por evento hereda a quien subió | `09` §9 |
| 6 3A sin la rama del vencimiento | `13` brief 3A |
| 7 Sin IA ni lectura sin partes 1 y 5 | `08` §4; `09` §3 |
| 8 Canales: link por pedido, motor compara contra la oferta, web sin escribir y cupo de visitantes | `09` §18; `03` §19 |
| «Qué cambia en 1B, 1C y 1D» | `13` §2, brief 1-AJ |

## 3. Decisiones del dueño (opciones y recomendada)

El diseño está escrito con la recomendada, marcada provisional. Lo que cada una frena está en `13` §1.

| # | Tema | Opciones | Recomendada y por qué |
|---|---|---|---|
| D1 | Quién firma la autorización | (a) El titular en la app con su sesión. (b) Alta por OPS de GSG con evidencia, sin `INSERT` para `app_rls` (cumple la letra de §F.26). (c) (a) con **segundo factor** (código al mail), y ampliar pide segunda confirmación por mail y entra a las 24 h, con aviso a todos los OWNER y a GSG; el reset de la clave del OWNER revoca | **(c).** Con (a) sola, ampliar topes queda en una mano (X5). (c) es excepción declarada a §F.26: la segunda mano es el interruptor de GSG más la espera con aviso. **Frena 2B** |
| D2 | Dónde vive el expediente y la fila de liberación | (a) `AuditLog` con exención de la purga. (b) Tabla propia `AgenteLiberacion` que no se purga, escrita sólo por operaciones de GSG | **(b).** Es la prueba de la garantía de GSG; tiene que durar lo que los registros contables (plazo a confirmar con la contadora) y no la puede forjar `app_rls`. Migración aditiva propia (brief LT). **Frena L2** |
| D3 | Umbral de liberación | (a) 3 × 50 sobre los mismos casos. (b) Casos distintos: 150 con 0 críticas (R2), 300 para plata sin respaldo; graves ≤ 2 %; lo del código al 100 % determinista | **(b).** Con 0 de 150 la cota superior de falla es de alrededor de 2 %; 3 × 50 iguales mide estabilidad, no cobertura (§J.42). **Frena L2** |
| D4 | El cliente final como solicitante (canales) | (a) Aceptarlo: confirma con un botón y la operación sale de la oferta, no de su texto. (b) Prohibirlo | **(a)**, registrada como excepción explícita a «un texto de un tercero no dispara una transacción». **Frena C3 de canales** |
| D5 | Dónde corre el guion de prueba | (a) En MIA real, con el dueño de GSG firmando como titular. (b) Primero en un negocio de ensayo; en MIA sólo con su titular real | **(b).** MIA empieza el 18/11 y en (a) GSG firma por el cliente y deja movimientos de prueba que B2 podría atar a cuotas reales (H10). **Frena el QA desde 2B** |
| D6 | Moneda | (a) Sólo ARS hasta que haya topes en USD (el CHECK lo limita). (b) Abrir USD ya | **(a).** `cobrarCuota` asienta en pesos con el tipo de cambio y el cupo contaría en la moneda de la cuota (X10): abrir USD pide diseño propio |

**Tema cerrado, no se reabre:** la IA corre con el plan de Claude en prueba (orden del dueño).
**Siguen abiertas sin cambio:** el despertador por minuto (gasto), los topes de `08` §2, el texto legal de la
autorización y de los términos, el plazo de conservación con la contadora, y cada Gate 2.

## 4. Lo que no se pudo verificar en esta sesión

- Con qué rol se aplica la migración en producción (lo verifica `data-dba` antes del Gate 2: `12`).
- Si el ERP ya trae un calendario de feriados nacionales.
- Que `auditAdmin` de `importarExtracto` no haga falta: el diseño toma al usuario de la sesión `a`
  (`acciones-empresa.ts:207`), que sí está.
- Ley 25.326 en la fuente: va al frente legal.
- Ventana de compactación: en esta sesión, `CLAUDE_CODE_AUTO_COMPACT_WINDOW=400000` (MIA-016 había visto 500000).
