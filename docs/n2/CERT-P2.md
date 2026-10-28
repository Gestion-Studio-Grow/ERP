Veredicto final: CON OBSERVACIONES (vuelta 6: F7 cerrada, O-v5-1…5 cerradas; O-v6-1 baja, la dedupe del lote sin N2_hub lee el outbox de todos los negocios; ver dictamen vuelta 6 al final)

# Dictamen de certificación — Tanda P2 (catálogo de eventos v1 y emisión desde el Core)

Diff: `5aed9fd..n2/p2-eventos` (base = `origin/main` 90297d9 + merge de `origin/n2/s2-paquete-gate2`; tip bad124a) ·
Riesgos: datos, plata · 3 vueltas de certificación (2 de corrección en Opus) · `escaladoAFable`: no · Fecha 2026-10-28.
Todo corrió en el Postgres 16 local efímero (localhost:5433). Ninguna migración aplicada fuera de él. Nada contra Neon.

## Resumen
- Verificación final: `tsc --noEmit` 0 errores · `src/eventos/*.test.ts` + `src/lib/*.test.ts` 1221/1221.
- Test Postgres (`src/eventos/emitir-postgres.test.ts`), con y sin `N2_hub.sql`, rol SIN bypass de RLS, dos negocios:
  el evento de A no se ve desde B, un rollback no deja fila, doble emisión del mismo hecho = 1 fila.
- Eventos emitidos en esta tanda: `pedido.creado@1`, `pedido.cobrado@1`, `pedido.cancelado@1`, `factura.autorizada@1`,
  `factura.rechazada@1` (más `InvoiceCreated` legado, sin cambios). El resto del catálogo queda declarado con su tanda.
- Fuera de la lista de archivos (a revisar por el dueño):
  - `prisma/pending-gate2/N2_hub.sql` (+7, sin aplicar): backfill `clave ← payload._clave` antes del UNIQUE, para que
    los eventos emitidos antes de la migración no se dupliquen después. Aditivo e idempotente; cambia el paquete Gate 2 de S2.
  - `src/lib/arca-envios-concurrencia-postgres.test.ts`: cuenta sólo `InvoiceCreated` como envío a ARCA.
- Fallas abiertas (todas bajas, redacción de texto libre en P2-C6): soft hyphen U+00AD, separadores de 4+ caracteres,
  DNI con comas, recorte antes de redactar, sobre-enmascarado de números largos.

---

# Respuesta del ingeniero — vuelta 6 · f152f46..eeceff7 (n2/p2-eventos)

Pide: CERTIFICA. F7 cerrada (eventos en lote en las operaciones masivas); O-v5-1…O-v5-4 corregidas; O-v5-5 queda
como nota para la PMO (el plan vive en `main`, que esta tanda no toca).
Base: PGlite (`scripts/qa/p2-pglite.mjs`, nunca Neon, sin `.env`). Fecha 2026-10-28. `prisma/pending-gate2/` y el
runbook **sin tocar**: lo pendiente para S2 sigue siendo lo de la vuelta 4 (ver dictamen vuelta 5).

## Commits
- `8d06014` feat · `emitirEventosEnLote` (`src/eventos/emitir.ts:290`): valida y redacta todo antes de escribir; un
  candado por clave distinta (el mismo `outbox:<negocio>:<clave>` de `emitirEvento`, en una sentencia y en orden del
  hash); dedupe del lote con `unnest` en los dos modos (también la fila con `clave` NULL); `INSERT … SELECT FROM unnest`
  con `ON CONFLICT` si hay columnas. Tres sentencias por lote. El sobre y el catálogo no cambian.
- `1ce74ec` fix · F7: `emitirProductosActualizados` en lote (`del-core.ts:511`: aumento, planilla, lista de la marca);
  `recordMovement` acepta `args.eventos` (`ledger.ts:113`, `:222`) y `ajustarEnTx` emite los `stock.*` del recuento en
  lote al final (`adjustment-insert.ts:227`). O-v5-3: `cruzaElMinimo` redondea `antes` al milésimo (`del-stock.ts:49`).
- `a47d822` fix · O-v5-1: importe con centavos sin miles = hasta 7 dígitos enteros (`esquema.ts:129`); después de «$»,
  cualquier largo. O-v5-2: email escrito con palabras («arroba», «[at]», «punto», «[dot]») → `[email]` (`esquema.ts:89`).
- `eeceff7` docs · O-v5-4: el `cuando` de `stock.ajustado` nombra alta, anulación, traslado y despiece; `eventos.md` regenerado.

## Verificación
- F7 (`vuelta6-postgres.test.ts`, PGlite, máquina sin otra carga): «Actualizar precios» de `MAX_FILAS` = 2000 productos,
  Serializable y con el tope por defecto: **724 ms sin N2_hub · 783 ms con N2_hub** (tope del test 1,5 s), 2000 eventos;
  el mismo lote otra vez 513/624 ms y 0 nuevos. El repro del certificador (`v5-precios-masivos`, 2000): 702/678 ms
  (antes 5,0 s y `expired transaction`). Más: rollback sin filas, clave repetida = 1 fila, suelta↔lote se atajan,
  evento inválido tira sin escribir, 3 candados para 3 claves, B con la clave de A escribe, fila con `clave` NULL ataja.
- Recuento: la emisión en lote de 499 `stock.ajustado` cuesta ~75 ms. Pero el ledger solo (`recordMovement`, ~8
  sentencias por línea, anterior a P2) lleva 500 líneas a ~4,2 s en PGlite: el test usa 300 (2,4/2,7 s). **No es de P2**
  y no lo toqué; con la latencia de Neon un recuento de cientos de líneas puede pasar el tope igual. A la PMO.
- PGlite `emitir-postgres`, `vuelta4-postgres`, `vuelta5-postgres`, `vuelta6-postgres`: 4/4. (`vuelta4` compara
  milisegundos y falla si la máquina está cargada: corrido solo, pasa.)
- Unitarios (`src/eventos`, `stock`, `caja`, `clientes`, `catalogo`, `supermercado`, `debts`, `multilocal`, `settlement`,
  `cierre*`, `order*`): 998 · 993 pasan · 5 salteados · 0 fallan. `tsc --noEmit`: 403, los mismos; 0 en los tocados.

## O-v5-5 (nota para la PMO, no se toca `main`)
- `order-actions.ts` (M8) y `clientes/fiado.ts` (M7) llevan líneas de emisión de P2: anotarlo para la consolidación.
- `caja.turno.cerrada` retail lo emite P2 desde `closeCashSession`; M1 no lo tiene que volver a emitir (si lo hace con
  `caja:turno:<id>:cerrada`, la dedupe lo ataja).
- La venta que nace entregada sigue con el paso a DELIVERED en una segunda transacción (de antes de P2).

## Lo que no se pudo verificar
- RLS con un rol sin BYPASSRLS (PGlite es superusuario), concurrencia real (dos lotes o lote + suelta a la vez; el
  orden de los candados está escrito, no probado en carrera), y los tiempos contra Neon (punto 4 de la verificación pendiente).
- Un lote de 2000 toma 2000 candados de aviso en la transacción: entra en la tabla de candados por defecto
  (`max_locks_per_transaction` 64 × conexiones), pero varios lotes de 2000 a la vez no se probaron.

---

# Respuesta del ingeniero — vuelta 5 · d6836e5..7685160 (n2/p2-eventos)

Pide: CERTIFICA. F6 cerrada instrumentando en P2 todo lo retail que el plan no da por ID y criterio a otra tanda; O-v4-1…O-v4-6 corregidas o fijadas con motivo.
Base: PGlite (`scripts/qa/p2-pglite.mjs`, nunca Neon, sin `.env`). Fecha 2026-10-28. `prisma/pending-gate2/` sin tocar.

## Commits
- `2e3cb09` fix · redacción: importes, fechas, emails mal escritos, separadores raros, sustitutos sueltos (O-v4-1…4).
- `cafe298` feat · ayudantes de emisión (`del-core.ts`, `del-stock.ts`) + regla cobrado/cancelado (O-v4-5).
- `972571d` feat · `pedido.confirmado/listo/entregado` · `fd86907` feat · `stock.bajo/ajustado` · `c86be88` feat · `producto.actualizado`.
- `4242bca` feat · `cliente.creado` · `67e6957` feat · `caja.abierta/turno.cerrada/cerrada`.
- `71763f6` docs · catálogo reetiquetado + `eventos.md` regenerado · `001807f` + `7685160` test · `vuelta5-postgres.test.ts`.


## Verificación
- `tsc --noEmit`: 403 errores, los mismos preexistentes (paquetes que faltan). En los 20 archivos tocados en `d6836e5..HEAD`: 0. [VERIFICADO]
- Unitarios de lo tocado (`src/eventos`, `stock`, `caja`, `clientes`, `catalogo`, `settlement`, `debts`, `supermercado`, `order*` y los 21 tests que leen el fuente de los archivos tocados): 1108 · 975 pasan · 133 salteados (de base, sin Postgres local) · 0 fallan. [VERIFICADO]
- `redaccion-v5.test.ts` 31/31 (incluye los textos de `cert-p2-v4/v4-redaccion.test.ts`). El archivo del certificador da 35/40: los 5 que fallan son los residuales aceptados de abajo. [VERIFICADO]
- PGlite: `vuelta5-postgres` 1/1 (sin y con N2_hub), `emitir-postgres` 1/1, `vuelta4-postgres` 1/1, `producto-de-otro-negocio-sin-rls-postgres` 1/1. `fiado-postgres` falla en «dos entregas a la vez» igual con y sin el cambio de `fiado.ts` (probado volviendo el archivo a HEAD): limitación de PGlite ya anotada en la vuelta 4. [VERIFICADO]
- El test discrimina: sin la regla del cancelado, `vuelta5-postgres` falla en X1 con `pedido.cancelado@1,pedido.cobrado@1`. [VERIFICADO]
- `guardia-bundle-cliente`: 19/21, las 2 fallas de Windows de siempre; el árbol real no suma violaciones (ledger.ts → del-stock.ts es puro). [VERIFICADO]

## F6 · P2-C2, evento por evento (retail §7.3)
| Evento | Destino | Dónde / criterio |
|---|---|---|
| `pedido.creado`, `pedido.cancelado`, `pedido.cobrado`, `factura.autorizada`, `factura.rechazada` | P2 (vueltas 1–4) | sin cambios |
| `pedido.confirmado`, `pedido.listo`, `pedido.entregado` | **P2** | `moverPedidoConEventoEnTx` (CAS + evento en una tx) desde `advanceOrderStatus`, `entregarPedido`, la entrega al fiado (`fiado.ts`) y la venta que nace entregada (`createOrder`, caja con lector). Comercio pasa PENDING→PREPARING: eso es «confirmado» |
| `stock.bajo`, `stock.ajustado` | **P2** | `recordMovement` (`stock/ledger.ts`, el único mutador; `inventario/*` sólo lee). `stock.bajo` sólo al CRUZAR el mínimo |
| `producto.actualizado` | **P2** | `registrarCambiosDePrecio` (todos los cambios de precio; `aumento-core.ts` es puro) y `toggleProductActive` |
| `cliente.creado` | **P2** | `crearFichaEnTx` (Clientes y Vender) |
| `caja.abierta`, `caja.cerrada` | **P2** | `openCashSession`, `cerrarDia`. Ningún criterio de M1 los nombra. Cubre el QA de P2 «cerrar el día → `caja.cerrada@1`» |
| `caja.turno.cerrada` (§4.1.2) | **P2** (retail) | `closeCashSession`; el del club queda en B1-C6 / B4-C8 |
| `pago.acreditado` / `pago.devuelto` | traspaso **P5-C5 / P5-C6** | ingesta MP (archivos de P5) |
| `deuda.vencida` | traspaso **M7-C6** | «`deuda.vencida@1` desde el barrido»; hoy no existe el barrido |
| `balanza.lectura` | no se emite | opcional por §7.3; ningún criterio lo pide |

Cada emisión nueva: en la transacción del hecho, clave por hecho, test de rollback y de dedupe en `vuelta5-postgres` (en los dos modos de la base).

**Fuera de la lista de archivos de P2 (sólo líneas de emisión):** `order-actions.ts` (sólo los pasos; el alta pública es de M8), `supermercado/caja-actions.ts`, `clientes/fiado.ts`, `clientes/crear-ficha.ts`, `stock/ledger.ts`, `catalogo/precios-auditoria.ts`, `catalog-actions.ts`. Cambio de forma: cinco `updateMany` sueltos (avanzar, entregar, nace entregada ×2, activar/pausar producto) pasan a una `tenantTransaction` con su evento; el compare-and-set es el mismo.

## Observaciones
| Punto | Destino | Evidencia |
|---|---|---|
| O-v4-2 · la coma tapaba importes (regresión) | **Corregido.** Una tirada con forma de plata (dos decimales al final, o después de `$`) y una fecha quedan; un DNI con comas se tapa. | «1.250,50», «125.000,50», «12500.00», «$ 125.000», «28/10/2026» intactos; «30,123,456» → `******3456` |
| O-v4-1 · emails mal escritos | **Corregido.** Sin TLD, «gmail. com», espacios alrededor de `@`, «(at)», «＠». Una `@` sin parte local pegada («@magra», «@ las 5») queda. | 11 casos + 5 de no sobre-enmascarar |
| O-v4-1 · separadores | **Corregido:** `_ ' ’ ´ ~ \| \ • ．` y dígitos `\p{Nd}` (ancho completo, arábigos, matemáticos). **Residual aceptado:** `· * : ;` (separan números en texto común: «18:30», «2*1500») y superíndices. | test fija el residual |
| O-v4-3 · sustituto suelto tumba la tx | **Corregido.** `bienFormado()` en la redacción y en TODO el sobre (ids, textos, clave). | X5: la anulación pasa y el motivo sale con U+FFFD |
| O-v4-4 · corte parte la máscara | **Corregido.** | barrido de 480–499 caracteres |
| O2 · lista «1042, 1043, 1044» | **Sigue aceptado:** tiene la misma forma que «5566, 7788». | test lo fija |
| O-v4-5 · cobrado después de cancelado | **Regla:** un pedido CANCELLED no emite `pedido.cobrado`; la plata que entra después por su deuda es un cobro de la cuenta corriente (se registra igual). Va en el `cuando` del catálogo. El arreglo de dominio (que la anulación cierre el fiado sin cuentas corrientes) sigue fuera de P2. | X1 en los dos modos |
| O-v4-6 · `cuando` con el camino ORDER | **Corregido el texto:** el camino vivo es la deuda (RECEIVABLE). | catálogo |

## Paquete de S2 (`N2_hub.sql`)
La vuelta 5 no cambia nada en `prisma/`. Sigue pendiente copiar al paquete de S2 lo de la vuelta 4: el `UPDATE … SET "clave" = "payload"->>'_clave'` antes del UNIQUE, el `CREATE INDEX "OutboxEvent_tenantId_payloadClave_sinClave_idx" … WHERE "clave" IS NULL`, el pie del PASO POSTERIOR, el `DROP INDEX` de la reversa, la fila 3 del README y el paso 3b del runbook. 🔴 Sin esto, D-01 deja el emisor sin backfill ni índice parcial.

## Huecos del plan para la PMO (no son traspasos firmados)
- Club: `turno.confirmado`, `clase.*`, `socio.*`, `credito.*` y `buffet.pedido.creado` → P2-C2 los manda a B1, pero ningún criterio de B1 los nombra.
- `mensaje.recibido` → P6 recibe el webhook (P6-C1), pero ningún criterio nombra el evento.
- `cliente.creado` desde turnos, reserva pública, pádel, taller, inmobiliaria y lista de espera: ningún criterio lo pide.
- De la vuelta 4: el límite de texto y renglones de la API pública como criterio nuevo de P4; qué hace P3 con lo acumulado; «no prender P2 sin N2_hub» en la ficha de D-01.

## Lo que NO se pudo verificar
- **RLS** y **concurrencia real** (PGlite: superusuario, una consulta por vez). En particular, emitir dentro de las transacciones Serializable de la caja y del ledger suma lecturas al outbox: más chances de 40001 y reintento con ventas en paralelo. [A VALIDAR en CI con `app_rls`]
- Las acciones de servidor no se corrieron de punta a punta (piden sesión): se probó la función del Core que cada una llama, más el test estático de `advanceOrderStatus`. Falta el QA clic por clic.
- Los milisegundos de Neon.

---

# Respuesta del ingeniero — vuelta 4 · e661a65..2df7dda (n2/p2-eventos)

Pide: CERTIFICA con 0 fallas. Todo lo abierto tras la vuelta 3 queda corregido acá o traspasado con motivo.
Base: PGlite (`scripts/qa/p2-pglite.mjs`, nunca Neon, sin `.env`). Fecha 2026-10-28.

## Commits
- `6442aa8` fix · redacción (F4, F5, O1) + adversariales reconstruidos.
- `70b3b92` perf · dedupe por índice con N2_hub (v2-d).
- `e47c2bf` feat · `pedido.cobrado` por cobranza y fiado; `factura.autorizada` con `clase`.
- `682416d` test · base efímera de la vuelta 4 sobre PGlite.
- `2df7dda` docs · reglas 6 y 7 de `eventos.md` (traspaso a P3, `externalRef`).

## Verificación
- `tsc --noEmit`: 403 errores, todos preexistentes por paquetes que faltan (playwright y otros), en `src/app/**` y tests de navegador. En archivos de P2: 0. [VERIFICADO]
- `src/eventos/*.test.ts` + `src/lib/*.test.ts` + `settlement` + `debts` + `fiado.test.ts`: 1279 tests, 1161 pasan, 106 salteados (de base, sin Postgres local) y 12 fallan.
  - Las 12 fallas están en 7 archivos ajenos a P2: comprobante-pdf, ensayo-lote-neon, guardia-bundle-cliente, rechazo-de-dominio, seguridad-hallazgos, sitio-estatico y vercel-build.
  - Las causas son de Windows: rutas con `\`, CRLF y paquetes que faltan. Ninguno de esos archivos importa código tocado en P2 (verificado con grep), y ninguno cambió en `5aed9fd..HEAD`. [VERIFICADO]
- Los adversariales `v2-redaccion.test.ts` y `v3-raya.test.ts` no estaban ni en la rama ni en el disco. Se reconstruyeron en `src/eventos/redaccion-adversarial.test.ts`, con los mismos ids y textos del dictamen: 9/9. Con el `esquema.ts` de la vuelta 3, 6 de esos 9 fallan, así que los tests discriminan. [VERIFICADO]
- Sobre PGlite, `emitir-postgres.test.ts` da 1/1 con y sin N2_hub, y `src/eventos/vuelta4-postgres.test.ts` da 1/1. [VERIFICADO]

## Destino de cada punto
| Punto | Destino | Evidencia |
|---|---|---|
| F4 · DNI con comas, separadores de 4+ | **Corregido.** Entre dígitos va cualquier cantidad de espacios (también `\n`), `.` `,` `/` `()`, rayas `\p{Pd}`, `−` e invisibles `\p{Cf}`. `$ # ·` y las letras cortan la tirada (`esquema.ts`, `RE_DIGITOS`). | C6-f, C6-g |
| F5 · recorte antes de redactar | **Corregido.** Primero se redacta y después se recorta a 500. Un texto de más de 4000 se mira hasta ahí y descarta la cola partida (email o tirada). | C6-h, obs-largo, «borde >4000» |
| O1 · guion blando U+00AD | **Corregido** (lo cubre `\p{Cf}`, junto con U+200B, las marcas bidi, U+2060 y U+FEFF). | v3-obs |
| O2 · sobre-enmascarado | **Aceptado por diseño.** «1042 – 12500» y un teléfono tienen la misma forma: gana el dato personal. Se pierde un dato, pero no se filtra nada. | v3-obs2 fija el comportamiento |
| Nuevo, encontrado acá: emoji partido por el corte | **Corregido.** `slice(0,500)` dejaba un sustituto suelto, que jsonb rechaza, y eso tumbaba la venta o la anulación. | vuelta4 §4: jsonb rechaza `"a\ud83d"`; con el arreglo, la emisión pasa |
| v2-d · costo de la dedupe con N2_hub | **Corregido.** Ahora busca `clave = $3 OR (clave IS NULL AND payload->>'clave' = $3)` y N2_hub crea el índice parcial `(tenantId, payload->>'clave') WHERE clave IS NULL`. El plan es BitmapOr de los dos índices, sin Seq Scan. | `scripts/qa/p2-costo-dedupe-pglite.mjs`, 200k filas: 75,98 ms → 0,567 ms. Con 20k: 8,10 ms → 0,546 ms (plano) |
| v2-d · costo sin N2_hub (Neon hoy) | **Traspasado a Q3 / Gate 2 (D-01).** Sin la migración no hay índice posible. El costo es lineal: 7,95 ms con 20k filas del negocio y 73,35 ms con 200k (WASM). Recomendación: no prender P2 en producción sin N2_hub, o hacerlo sabiendo que crece unos 0,37 ms cada 1k filas. | mismo script |
| Filas con clave NULL tras N2_hub (probe viejo) | **Corregido.** La dedupe las ve por el índice parcial. N2_hub trae un PASO POSTERIOR (re-backfill a los 2 minutos, `NOT EXISTS` por el UNIQUE, idempotente); está en el README del paquete. El backfill principal queda sin `NOT EXISTS` porque sin el UNIQUE sería cuadrático. | vuelta4: fila tardía vista; paso posterior 1 → 0 filas; el duplicado queda NULL sin chocar |
| `pedido.cobrado` · `collection-repo.ts:118` | **Corregido.** Emite en la tx del cobro cuando ESE cobro pasa el pedido a pago (CAS `paid:false→true`), con monto = total del pedido y medio = el del cobro que cierra el saldo. | vuelta4 a–e: parcial no emite; botón y cobranza dan 1 fila; rollback no deja fila |
| `pedido.cobrado` · `clientes/fiado.ts:130` | **Corregido con criterio.** Entregar al fiado NO emite: no entró plata, igual que la venta a cuenta de `insertOrder`. Emite el cobro que salda la deuda de ese pedido (`applyCollectionInTx`, origen RECEIVABLE con `orderId`). Una deuda sin pedido no emite. El catálogo lo dice en `cuando`. | vuelta4 f |
| `factura.autorizada` sin NC | **Corregido en parte.** Se agrega `clase` (FACTURA/NOTA_DEBITO/NOTA_CREDITO/OTRO) por el tipo de ARCA, con la tabla de `contador/recibidos-formato.ts`. El comprobante asociado queda **traspasado a M4** (M4-C6: «`factura.*` para la NC»); hoy no se emiten NC. | test de clase; `emitir-postgres` con tipo 11 → FACTURA |
| `processedAt` NULL hasta P3 | **Traspaso a P3 confirmado y documentado.** Va como regla 6 de `eventos.md`. ARCA sólo toma `InvoiceCreated` (`arca-reserva.ts:111`). El monitor cuenta `attempts ≥ umbral` y estos eventos tienen 0. Para P3 queda decidir qué hace con lo acumulado. `reset-golive` los avisa como pendientes y los borra, que es lo correcto antes de un go-live. | `arca-reserva.ts:107-115`, `cartera-core.ts:375`, `reset-golive.ts:425` |
| `texto/id ≤ 2000`, `lista ≤ 1000` | **Traspasado a P4.** El POS ya tope a 300 renglones (`supermercado/ticket-caja.ts:128`). Sólo la API pública (`external-orders`) no tiene tope de renglones ni de largo de `externalRef`, y validar esa entrada es de P4 (archivos `src/app/api/public/v1/**`, P4-C3). Antes de P2, un `externalRef` de más de 2700 bytes ya fallaba en el índice btree. | — |
| `externalRef` no se redacta | **Por diseño.** Es la referencia del integrador para cruzar con su sistema: redactarla le saca el uso. Está documentado como regla 7 de `eventos.md`. | — |
| `.qa/facturacion-escala/*.txt` | No son de P2. Hoy el worktree está limpio. | — |

Archivos fuera de la lista del plan (sólo líneas de emisión o documentación): `src/lib/settlement/collection-repo.ts`, `prisma/pending-gate2/README.md` y `prisma/schema.prisma` (comentario `// N2:`). Además `N2_hub.sql` suma un índice: el paquete de S2 cambia, sin aplicar.

## Lo que NO se pudo verificar
- **RLS:** PGlite corre como superusuario. Las aserciones de aislamiento de `emitir-postgres` se saltean en PGlite (el test lo dice) y valen sólo contra el Postgres del arnés o CI. [A VALIDAR: correr `emitir-postgres` y `vuelta4-postgres` en CI]
- **Concurrencia real:** PGlite atiende una consulta por vez. No se probó la carrera botón «Cobrar» contra cobranza Serializable sobre el mismo pedido (se espera 40001 y reintento por el UPDATE del pedido), ni la de dos procesos durante la ventana del probe. `fiado-postgres.test.ts` falla igual con y sin estos cambios en «dos entregas a la vez» por la misma limitación. [A VALIDAR en CI]
- **Tiempos de Neon:** los ms son de WASM y sirven para comparar entre sí. Las 200k filas se midieron fuera del arnés porque PGlite se traba armando índices sobre tablas de más de unas 40k filas; en el arnés N2_hub se aplicó sobre 20k.

## Fuera de esta vuelta (no observado por el certificador)
- P2-C2: `pedido.confirmado/listo/entregado`, `stock.*`, `producto.actualizado`, `cliente.creado`, `deuda.vencida`, `caja.*` figuran «pendiente · tanda de …» sin un ID de tanda del plan, aunque sus archivos están en la lista de P2. Lo tiene que decidir el certificador o la PMO.

---

# Dictamen · vuelta 3 · P2 eventos · 3398b52..bad124a (n2/p2-eventos)

Veredicto: CON OBSERVACIONES. F3' (raya del autocorrector) quedó cerrada. No hay fallas alta ni media en lo corregido.

## Verificación
- tsc --noEmit: exit 0.
- src/eventos/*.test.ts: 17/17.
- v3-raya.test.ts: 5/5 en la rama corregida (v3-a..e). Fallan las 2 observaciones (v3-obs, v3-obs2).
- v2-redaccion.test.ts: C6-d y C6-e (F3') pasan ahora. Siguen fallando C6-f, C6-g, C6-h y la obs de largo, o sea F4 y F5 (bajas de la vuelta 2, que no estaban en esta corrección).

## Cerrada (con evidencia)
- F3' · esquema.ts:58 `RE_DIGITOS = /\+?\d(?:[\s.\/()\p{Pd}−]{0,3}\d){5,}/gu`.
  - «11 – 5566 – 7788» y «11 5566 – 7788» salen como «******7788» (v3-a).
  - También se enmascaran con em dash, figure dash, horizontal bar, U+2010, U+2011 (el guion de WhatsApp), fullwidth, small hyphen, ⸺ y el signo menos, juntos o con espacios (v3-b).
  - Lo mismo con NBSP, narrow NBSP y thin space, y con el número copiado de WhatsApp entre U+202A y U+202C (v3-c).
  - En factura.rechazada, el DocNro/CUIT escrito con rayas sale enmascarado (v3-d).
  - Regresión: los textos cortos, las rayas sueltas, los emojis y el email quedan bien (v3-e).

## Observaciones (bajas, no bloquean)
- O1 · el soft hyphen U+00AD entre dígitos («11­5566­7788», pegado desde Word) sale en claro. Repro: v3-raya.test.ts › v3-obs.
  Arreglo: usar como separador `[^\p{L}\p{N}\n]` (lo sugerido en la vuelta 2), o sumar `­​` a la clase.
- O2 · sobre-enmascarado: «pedido 1042 – 12500 pesos» sale como «pedido ******2500 pesos». Pasaba igual antes con «-»; la raya sólo lo extiende.
  Se pierde dato, pero no se filtra nada. Repro: v3-obs2.
- F4 y F5 (vuelta 2, bajas) siguen abiertas: los separadores de 4 o más caracteres, la coma en el DNI y el recorte antes de redactar. Repro: v2-redaccion.test.ts › C6-f/g/h/obs.
- Los cambios en .qa/facturacion-escala/*.txt del worktree no son del certificador (ya estaban en la vuelta 2).


---

# Dictamen · vuelta 2 · P2 eventos · 77c3315..3398b52 (n2/p2-eventos)

Veredicto: NO CERTIFICA (1 media, 2 bajas). F1 (fiscal) y F2 (dedupe en la transición) quedan cerradas. F3 (redacción) está cerrada a medias.

## Verificación
- tsc --noEmit: exit 0.
- Suites del diff + adversariales de la vuelta 1: 27/27 (las 3 fallas de la vuelta 1 ya no se reproducen).
- v2-postgres.test.ts: v2-a, v2-b, v2-c ok. v2-d (costo) falla y queda como observación.
- v2-redaccion.test.ts: 2/7 (la regresión pasa; fallan C6-d/e/f/g/h y la obs de largo).

## Cerradas (con evidencia)
- F1: markInvoiceRejected con un motivo de más de 3000 caracteres deja la factura REJECTED, y el evento sale recortado.
  registerFiscalDocument con caeVencimiento "2026-11-07" deja la factura AUTHORIZED con su CAE, sin evento, y no toca InvoiceCreated (v2-c).
- F2: probe en false cacheado + N2_hub aplicada → el proceso viejo escribe clave NULL. Las 3 reemisiones simultáneas con
  columnas dan 1 fila, y B no ve la fila de A (v2-a). Al revés, un proceso ciego ante una fila escrita con columnas no la duplica (v2-b).

## Fallas
### F3' · media · P2-C6: la redacción sigue dejando teléfonos en claro con la raya «–»
- Dónde: src/eventos/esquema.ts:58 (RE_DIGITOS `[\s.\-/()]{0,3}`).
- Qué: «11 – 5566 – 7788» sale entero, y «11 5566 – 7788» sale como «******5566 – 7788». La raya la pone el autocorrector del teclado. Es la misma rama que F3.
- Repro: v2-redaccion.test.ts › C6-d, C6-e.
- Arreglo: tomar como separador cualquier carácter que no sea letra ni dígito (`/\+?\d(?:[^\p{L}\p{N}\n]{0,3}\d){5,}/gu`) y agregar estos casos a catalogo.test.ts.

### F4 · baja · P2-C6: DNI con comas y separadores de 4 o más caracteres
- «DNI 30,123,456» y «11  -  5566  -  7788» salen enteros. Repro: C6-f, C6-g. El arreglo de F3' cubre la coma; para el segundo caso, `{0,4}`.

### F5 · baja · P2-C6: se recorta antes de redactar
- esquema.ts:69: con slice(0,500) antes del replace, un DNI que cae en el corte deja 5 dígitos en claro («…30123»). Además, el resultado puede pasar de 500 caracteres (748).
- Repro: C6-h y «obs · el texto redactado puede pasar de 500». Arreglo: redactar primero y recortar después: `redactar(texto.slice(0, 2000)).slice(0, 500)`.

## Observaciones
- Regresión de costo: el chequeo `payload->>'clave'` ahora corre también con N2_hub y hace un Seq Scan del outbox del negocio. Con 200k
  filas, cada emisión tarda 46.9 ms dentro de la transacción de la venta, con el candado tomado (v2-d). Sugerencia: en modo columnas,
  `clave = $3 OR (clave IS NULL AND payload->>'clave' = $3)`, más un índice parcial en N2_hub `("tenantId", (payload->>'clave')) WHERE clave IS NULL`.
- Las filas que escribe un proceso con el probe viejo después de N2_hub quedan con clave NULL: el backfill corrió antes. El código las ve, pero el UNIQUE no.
- Los cambios en .qa/facturacion-escala/*.txt del worktree son de las 03:18, de antes de esta vuelta: no son del certificador.


---

# Dictamen · certificación adversarial P2 (eventos) · 5aed9fd..n2/p2-eventos (77c3315)

Veredicto: NO CERTIFICA (3 fallas media). Riesgos atacados: datos y plata.

## Verificación
- tsc --noEmit: exit 0.
- Suites del diff (catalogo, emitir-postgres, arca-envios-concurrencia-postgres): 16/16.
- npm test completo: 6809/6816; 6 fallas FUERA del diff (Playwright club «Lucas Fernández» x4, pie-pegado-zona-segura,
  cron recordatorios por RESEND/WhatsApp sin configurar, redondeos-locales con 50 líneas de club/pedidos; ninguna en los 13 archivos).
- Adversariales: redaccion-y-limites.test.ts 0/4 (4 fallas reproducidas); adversarial-postgres.test.ts: ataque 1 ok, ataques 2 y 3 fallan.

## Fallas

### F1 · media · plata/fiscal: un motivo de rechazo de ARCA > 2000 caracteres deja la factura PENDING para siempre
- Dónde: src/eventos/esquema.ts (textoLibre valida `length <= 2000` ANTES de recortar a 500 en redactarTextoLibre);
  src/eventos/del-core.ts emitirFacturaRechazada; src/lib/invoice-core.ts:489-497; el motivo lo arma arca-dispatch.ts:399 sin recortar.
- Qué: EventoInvalido tumba la transacción de markInvoiceRejected: la factura no pasa a REJECTED, el envío queda abierto, se
  reintenta contra ARCA hasta morir y la venta no se puede refacturar (reabrirSiRechazada pide REJECTED). Antes del diff se grababa.
  Mismo patrón en registerFiscalDocument: una validación del evento puede impedir guardar un CAE ya otorgado.
- Reproducción: adversarial-postgres.test.ts › «ataque 2» (EventoInvalido, factura PENDING); redaccion-y-limites.test.ts › «límite · factura.rechazada…».
- Arreglo: textoLibre acepta cualquier string y recorta al redactar (o recortar motivo/nombre a 500 en del-core antes de emitir);
  test con motivo de 3000 caracteres en markInvoiceRejected.

### F2 · media · datos: la dedupe (P2-C4) no sobrevive la transición sin→con N2_hub
- Dónde: src/eventos/emitir.ts (SQL_INSERTAR_CON_COLUMNAS / SQL_YA_ESTA); prisma/pending-gate2/N2_hub.sql:176-179 (sin backfill).
- Qué: lo emitido sin columnas queda con clave NULL; aplicada N2_hub, reemitir el mismo hecho escribe otra fila (ON CONFLICT no ve
  el NULL). Al revés, un proceso con el probe en false (TTL 60 s) busca `payload._clave`, que las filas en modo columnas no tienen.
  Pega a los emisores futuros que reintentan (aviso de MP repetido → pago.acreditado doble).
- Reproducción: adversarial-postgres.test.ts › «ataque 3» (2 filas; r2 = escrito/columnas).
- Arreglo: en N2_hub, backfill `UPDATE "OutboxEvent" SET "clave" = "payload"->>'_clave' WHERE "clave" IS NULL AND "payload" ? '_clave'`
  antes del UNIQUE; en los dos modos, candado + chequeo por `payload->>'clave'` (el sobre lo trae siempre).

### F3 · media · datos personales (P2-C6): la redacción deja teléfonos/DNI en claro
- Dónde: src/eventos/esquema.ts RE_DIGITOS (`[\s.\-/]?` = un solo separador entre dígitos).
- Qué: «11 - 5566 - 7788» sale entero; «11 5566 - 7788» → «******5566 - 7788»; «DNI 30  123  456» sale entero. Va al webhook de terceros.
- Reproducción: redaccion-y-limites.test.ts › C6-a, C6-b, C6-c.
- Arreglo: separadores de hasta 3 caracteres (`[\s.\-/()]{0,3}`), con esos casos en catalogo.test.ts.

## Observaciones (no bloquean)
- Ataque 1 superado: probe en frío y 6 transacciones simultáneas de dos negocios con 2 conexiones: sin bloqueo, cada evento en su negocio.
- pedido.cobrado no sale por collection-repo.ts:118 (cobro parcial que salda) ni por clientes/fiado.ts:130, y el catálogo no lo anota como pendiente.
- factura.autorizada no distingue nota de crédito (no trae clase ni asociado): un suscriptor contable la sumaría como venta.
- Sin columnas, SQL_YA_ESTA recorre el outbox del negocio por JSON sin índice: 2 veces por venta dentro de la transacción. Los eventos
  quedan processedAt NULL hasta P3 (reset-golive los avisa como pendientes).
- texto/id ≤ 2000 y lista ≤ 1000 renglones pueden rechazar una venta legítima; externalRef no se redacta (si fuera un teléfono de WhatsApp).


---


# Dictamen · vuelta 4 · P2 eventos · e661a65..827a55d (n2/p2-eventos)

Veredicto final: NO CERTIFICA

Una falla media, de alcance (P2-C2). El código de la vuelta 4 está bien: no encontré fallas de plata, de datos ni de concurrencia
que se puedan reproducir con PGlite. Cuando la PMO decida qué pasa con P2-C2, la vuelta 5 sólo tiene que revisar eso y la
verificación con Postgres real de abajo.
Base: PGlite (nunca Neon, sin `.env`). Fecha 2026-10-28. Tests del certificador en el scratchpad de la sesión (no van al repo):
`…/scratchpad/cert-p2-v4/v4-redaccion.test.ts` y `…/scratchpad/cert-p2-v4/v4-cobrado-postgres.test.ts`.

## Verificación
- `tsc --noEmit`: 403 errores, ninguno en los 15 archivos `.ts` tocados en `5aed9fd..HEAD`. Son 103 TS2307 (faltan `playwright`, `three`, `qrcode` y `pdf-lib`) y los TS7006/TS7031 que salen de esos mismos paquetes. [VERIFICADO]
- `catalogo.test.ts` + `redaccion-adversarial.test.ts`: 26/26. Con PGlite, `emitir-postgres` dio 1/1 y `vuelta4-postgres` 1/1. [VERIFICADO]
- **Integración con S2.** Uní P2 a la punta de S2 (`1485e30`) en un worktree descartable, que ya borré.
  - `N2_hub.sql` y `schema.prisma` se unen solos. `README.md` choca sólo en la tabla del paquete: la fila 2 se queda con la de S2 (DEBITO/CREDITO) y la fila 3 con la de P2.
  - Sobre el árbol unido: el estático de S2 + probe + catálogo dieron 41/41, el paquete Gate 2 en PGlite (`gate2-pglite.mjs`) 14/14 y los dos tests de base de P2 1/1 y 1/1. El plan nuevo de la dedupe es BitmapOr (UNIQUE + parcial) y no recorre la tabla. [VERIFICADO]

## Intentos de refutación
**Redacción (F4/F5/O1).** Cerradas.
- Corrí un barrido de 3000 textos al azar (de 450 a 4650 caracteres, con teléfonos, DNI, emails, emojis, ZWJ y guion blando).
- Ningún resultado pasa de 500 caracteres ni deja un sustituto suelto, y ningún teléfono ni DNI queda con 6 dígitos seguidos en claro. [VERIFICADO]

Lo que quedó (bajas, no bloquean):
- **O-v4-1 · fugas residuales en el texto libre.**
  - Separadores que no están en la clase: `_ * : ; | ~ \ • ’ '` y `·`. Lo de `·` es por diseño. Ejemplo: «11_5566_7788» y «30'123'456» salen enteros.
  - Dígitos que no son ASCII: el `\d` de JS sin la bandera `v` sólo toma 0-9, así que «１１５５６６７７８８» sale entero.
  - Emails que no tienen la forma completa: «juan.perez@gmail. com» (el espacio que mete el autocorrector), «juan.perez @ gmail.com» y «juan.perez@hotmail» (sin TLD) salen enteros.
  - Ninguno es el formato habitual; el de email es el más probable.
  - Arreglo sugerido: para las tiradas, separador = `[^\p{L}\p{N}\n]` y `\p{Nd}` con normalización NFKC antes de redactar; para el email, enmascarar la parte local antes de una `@` aunque no haya TLD.
- **O-v4-2 · sobre-enmascarado nuevo por la coma.** Lo agregó F4.
  - Un precio con centavos en formato argentino ahora se pierde: «reintegro de $ 1.250,50» sale «$ ******5050» (en v3 salía intacto) y «se cobró 1.500,75 de más» sale «******0075».
  - Una lista de códigos también: «pedido 1042, 1043, 1044 y 1045» sale «pedido ******1044 y 1045».
  - No filtra nada, pero el `motivo` de `pedido.cancelado` pierde montos. Es el mismo criterio que O2, aceptado por diseño, ahora más amplio.
  - Para pensar: la coma separa sólo si después vienen exactamente 3 dígitos.
- **O-v4-3 · un sustituto suelto en la ENTRADA sigue tumbando la transacción.**
  - `redactarTextoLibre("cliente \ud83d se fue")` lo devuelve igual.
  - En la base, la emisión de `pedido.cancelado` falla con `22P02` (jsonb) en los dos modos y la anulación vuelve atrás.
  - El arreglo de la vuelta 4 cubre el corte, no la entrada.
  - Arreglo: `.toWellFormed()` en `redactarTextoLibre` y en `e.texto()`/`e.id()` antes de serializar.
  - Repro: `v4-cobrado-postgres` › X5.
- **O-v4-4 · el corte parte una máscara o un `[email]`.** «… ****», «… [em». Es cosmético: no filtra.

**`pedido.cobrado`.** Cerrado.
- Sale una vez, en la transacción del cobro y junto con su asiento cuando hay libro (X4: 1 evento y 1 asiento).
- No se duplica por dos caminos:
  - botón + cobranza;
  - cobranza + botón;
  - venta a cuenta saldada y después el botón («ya-cobrado»), en X2;
  - sobrepago sobre una deuda ya saldada, en X3.
- La decisión del fiado es coherente con el catálogo. Entregar al fiado y la venta a cuenta no emiten; el cobro que salda la deuda del pedido sí (X2 y vuelta4 f). [VERIFICADO con PGlite, sin carreras]
- **O-v4-5 · fiado → anulación → pago de la deuda: `pedido.cancelado@1` y DESPUÉS `pedido.cobrado@1`.** Repro: X1, en los dos modos.
  - La causa es anterior a P2: `anularVentaInTx` no anula la `AccountReceivable` del fiado (queda OPEN y se puede cobrar). P2 sólo lo hace visible hacia afuera.
  - Arreglo de dominio (fuera de P2): que la anulación cierre la deuda del fiado. Si no se hace, `emitirPedidoCobradoAlSaldarFiado` no debería emitir para un pedido CANCELLED.
- **O-v4-6 · el `cuando` del catálogo nombra un camino que en producción no se usa.** «Cobro parcial que salda el pedido» por `applyCollectionInTx` con origen ORDER. `recordCollection` no tiene llamadores fuera de los tests, y el pago mixto escribe el `Collection` directo. El camino vivo es la deuda (RECEIVABLE), así que es un tema de texto.

**`factura.autorizada.clase`.** Bien: probé 44 tipos de ARCA y salen 1/6/11/51/201 → FACTURA, 2/7/12/52/202 → NOTA_DEBITO y 3/8/13/53/203 → NOTA_CREDITO. Dos menores: los tiques 83 y 109 salen OTRO, y el ERP no los emite. Pasar el comprobante asociado a M4 está bien (M4-C6), y es un campo opcional: no sube la versión.

## Índice parcial y paquete de S2
- **Dónde quedó.** En `prisma/pending-gate2/N2_hub.sql` de la rama P2, y el README y el comentario de `schema.prisma` lo acompañan. Además del índice, P2 sumó el backfill de `clave`, el PASO POSTERIOR y la línea de la reversa.
- **Sí, P2 divergió el paquete, por dos lados:**
  - P2 parte de S2 en `ab84360` (vuelta 1 de S2), así que le faltan 9 commits de S2: FK CASCADE, D-C01 DEBITO/CREDITO, arreglos del probe y el test estático. Esa parte se resuelve sola al unir: git toma la versión de S2.
  - El paquete de S2 que va al día D **no tiene** lo de P2. Si D-01 se aplica desde `n2/s2-paquete-gate2` tal como está:
    - sin backfill, vuelve F2 (los eventos emitidos antes de la migración se duplican después);
    - sin el índice parcial, vuelve v2-d (la rama `clave IS NULL` del OR recorre la tabla en cada venta).
- **Qué hacer.** No es una migración propia de P2 sino cambios al mismo archivo, así que se **copian al paquete de S2** antes del día D:
  - En `N2_hub.sql`: el `UPDATE … SET "clave" = "payload"->>'_clave'` antes del UNIQUE, el `CREATE INDEX … "OutboxEvent_tenantId_payloadClave_sinClave_idx" … WHERE "clave" IS NULL`, el pie del PASO POSTERIOR y el `DROP INDEX` de la reversa.
  - En el README, la fila 3.
  - En `docs/runbooks/gate2-nivel2.md`, dos cosas que hoy no están: el paso 3b (re-backfill a los 2 minutos, que depende de `TTL_NEGATIVO_MS` = 60 s, igual en las dos ramas) y la tabla de reversa, que pasa a «3 `DROP INDEX`».
  - Después, volver a correr `gate2-pglite.mjs` y el estático de S2.
  - El resultado de la unión, ya probado, quedó en `…/scratchpad/cert-p2-v4/integ-s2+p2/` (N2_hub.sql y README.md).
  - 🔴 Sin esto, D-01 deja el emisor de P2 sin las dos protecciones que se le pidieron.

## Traspasos (contra PLAN-REINGENIERIA-N2.md)
- **v2-d sin N2_hub → Q3 / D-01:** válido sólo como condición escrita. El plan publica la fase 1 «en modo tolerante hasta D-01» (§9, fila 5), y «no prender P2 sin N2_hub» contradice ese orden. Es una decisión del dueño (D-01/D-02), así que tiene que entrar en la ficha de D-01 o de Q3-C2, no quedar sólo en este dictamen.
- **`processedAt` NULL → P3:** correcto (§4.1.3, P3 es el despachante). Falta que P3 lo reciba: hoy ninguno de P3-C1…C7 dice qué hacer con lo acumulado.
- **Límites de texto y de renglones → P4:** el destino está bien, porque `src/app/api/public/v1/**` es de P4. La cita está mal: P4-C3 es `Idempotency-Key`, no validar la entrada. Hay que sumarlo como criterio de P4.
- **Comprobante asociado de la NC → M4:** correcto (M4-C6).

## Falla
### F6 · media · alcance · P2-C2 no se cumple y lo pendiente no tiene destino en el plan
- **Qué pide P2-C2:** «Están instrumentados los 18 eventos retail … (los del club se emiten en B1)». No pide un ID, pide instrumentarlos. Un «pendiente» sólo vale como traspaso a una tanda que exista.
- **Lo que hay:** se emiten 5 de los 18. `pago.*` → P5 está respaldado (P5-C5) y `balanza.lectura` es opcional en §7.3. Quedan **10 eventos retail**, y los archivos de 9 de ellos están en la lista propia de P2:
  - `pedido.confirmado`, `pedido.listo`, `pedido.entregado` → «tanda de avanzar-pedido». No existe. Además, el punto de emisión (`order-actions.ts`) no está en la lista de P2.
  - `stock.bajo` y `stock.ajustado` → «tanda de inventario». No existe, y `src/lib/inventario/*` es de P2.
  - `producto.actualizado` → «tanda de catálogo». No existe, y el plan lo pone en **P2** (§2, fila 15).
  - `cliente.creado` → «tanda de client-actions». No existe, y `client-actions.ts` es de P2.
  - `deuda.vencida` → «tanda de debts». No existe. El plan lo nombra en M7-C6.
  - `caja.cerrada` y `caja.abierta` → «M1». Ningún criterio de M1 los nombra, y el QA de P2 pide «cerrar el día → `caja.cerrada@1`».
- **Club:** `socio.*`, `cuota.*`, `credito.*` y `buffet.pedido.creado` dicen «módulo club». P2-C2 los manda a B1, pero B1-C6 no los incluye. Es un hueco del plan; hay que anotarlo.
- **Impacto:** P8-C1 (n8n: stock bajo, deuda vencida, caja cerrada) depende de eventos que hoy ninguna tanda tiene que emitir.
- **Cierre, una de dos:**
  - (a) instrumentarlos en P2: son líneas de emisión en archivos de P2, cada una con su test;
  - (b) que la PMO firme el traspaso evento por evento a tandas con ID y criterio. Por ejemplo, `deuda.vencida` → M7-C6, `caja.*` → un criterio nuevo en M1 que también corrija el QA de P2, y `pedido.confirmado/listo/entregado` → la tanda que tenga `order-actions.ts`. Después, el catálogo se re-rotula con esos IDs.

## Verificación pendiente con Postgres real (CI o arnés en localhost:5433, rol `app_rls` sin BYPASSRLS)
1. `node --import tsx --test src/eventos/emitir-postgres.test.ts`: aislamiento por RLS entre A y B, con y sin N2_hub. PGlite lo saltea.
2. `node --import tsx --test src/eventos/vuelta4-postgres.test.ts`, con `psql -f N2_hub.sql`.
3. Concurrencia (test nuevo): dos `cobrarFiadoInTx` en paralelo sobre la misma deuda, cada uno por el saldo entero, en Serializable. Esperado: un cobro, un `pedido.cobrado@1` y el otro con 40001 o rechazo de saldo.
4. Concurrencia sin N2_hub (test nuevo): `cobrarFiadoInTx` (Serializable) que salda la deuda, en paralelo con `emitirPedidoCobradoAlSaldar` en READ COMMITTED sobre el mismo pedido. Esperado: 1 fila. Es el caso que `emitir.ts` admite que el chequeo no cubre con aislamientos mezclados.
5. `src/lib/schema-probe/paquete-gate2.test.ts` (S2) con los cambios de P2 ya copiados, más el PASO POSTERIOR. Una fila escrita con el probe viejo después de N2_hub tiene que quedar con clave, y un duplicado tardío tiene que quedar en NULL sin abortar.
6. `node scripts/qa/p2-costo-dedupe-pglite.mjs` repetido contra Postgres real (200k filas): los milisegundos de Neon para la ficha de D-01.

---

# Dictamen · vuelta 5 · P2 eventos · d6836e5..e594be7 (n2/p2-eventos)

Veredicto final: NO CERTIFICA

Una falla media y nueva de la vuelta 5: emitir un evento POR FILA dentro de las transacciones masivas hace que
«Actualizar precios», la planilla, la lista de la marca y un recuento grande pasen el tope de 5 s de Prisma y se
caigan enteros. Lo demás está bien:
- F6 queda cerrada: 14 eventos retail emitidos, 3 traspasos válidos y `balanza.lectura`, que es opcional.
- Los eventos salen una vez, en la transacción del hecho, con dedupe y sin cruzarse de negocio.
- La redacción no tira.

Quedan 5 observaciones bajas.

Base: PGlite (nunca Neon, sin `.env`). Fecha 2026-10-28. Los tests del certificador están en el scratchpad de la sesión y no van al repo:
- `…/scratchpad/cert-p2-v5/v5-redaccion.test.ts`
- `v5-eventos-postgres.test.ts`
- `v5-precios-masivos-postgres.test.ts`
- `v5-recuento-postgres.test.ts`

## Verificación
- `tsc --noEmit`: 403 errores, los mismos de antes (paquetes que faltan); 0 en los `.ts` tocados en `d6836e5..HEAD`. [VERIFICADO]
- Unitarios de `src/eventos`, `stock`, `caja`, `clientes`, `catalogo`, `supermercado`, `order*`, `cierre*`, `settlement`,
  `debts` y `multilocal`: 967 · 962 pasan · 5 salteados · 0 fallan. [VERIFICADO]
- PGlite del repo (`node scripts/qa/p2-pglite.mjs`): `emitir-postgres` 1/1, `vuelta4-postgres` 1/1, `vuelta5-postgres` 1/1. [VERIFICADO]
- Mis tests:
  - `v5-eventos-postgres`: 1/1 en los dos modos de la base.
  - `v5-redaccion`: 16/28. Las 12 que fallan son O-v5-1, O-v5-2, O-v5-3 y los residuales aceptados.
  - Mi archivo de la vuelta 4: 35/40, igual que dice el ingeniero. [VERIFICADO]

## Falla
### F7 · media · un evento por fila en una transacción masiva la pasa del tope de 5 s
- **Dónde.** `registrarCambiosDePrecio` (`catalogo/precios-auditoria.ts:99`) llama a `emitirProductosActualizados`
  (`del-core.ts:499`), y ésta emite un `producto.actualizado@1` por producto. Cada emisión son tres viajes a la base:
  el candado, la dedupe y el INSERT. Antes de P2, el aumento escribía todo en dos sentencias: un `UPDATE … FROM unnest`
  y un `createMany`. Lo mismo pasa con `stock.ajustado@1` en cada línea de un recuento (`stock/ledger.ts:212`).
- **Quién la usa.** «Actualizar precios» (`aplicarAumentoEnTx`, Serializable), la planilla (`planilla-actions.ts`) y el
  empuje de la lista de la marca (`catalogo-marca-core.ts:232`). Las tres aceptan hasta `MAX_FILAS` = 2000 productos y
  corren con el tope por defecto de Prisma (5 s). El recuento (`insertStockAdjustment`) no tiene tope de líneas y usa el
  mismo límite.
- **Repro** (PGlite, en la misma máquina, sin la red de por medio):
  `node scripts/qa/p2-pglite.mjs …/cert-p2-v5/v5-precios-masivos-postgres.test.ts`

  | Productos | Sin N2_hub | Con N2_hub | Resultado |
  |---|---|---|---|
  | 300 | 1,4 s | 1,4 s | bien |
  | 700 | 3,1 s | 2,8 s | bien |
  | 1300 | 5,0 s | 4,1 s | bien, al borde |
  | 2000 | 5,0 s | 5,0 s | `expired transaction. The timeout for this transaction was 5000 ms`: se deshace entero y no queda ningún precio cambiado |

  Las 2000 filas de auditoría solas, sin eventos, tardan 0,4 s. En el recuento, 400 líneas tardan 2,2 s sin evento y
  4,1 s con `stock.ajustado`: la emisión casi duplica el costo.
- **Impacto.**
  - En Neon cada viaje suma la latencia de la red, así que el corte llega bastante antes de los ~1200 productos de PGlite.
  - Sin N2_hub, que es como está hoy en producción, cada dedupe además recorre el outbox del negocio (v2-d: 46,9 ms con
    200k filas). Ahí alcanzan unas decenas o cientos de productos para pasarse.
  - No se pierden datos. El negocio ve «No se pudieron cambiar los precios» y no puede hacer el aumento general, subir
    la planilla ni hacer el recuento completo sin partirlo en tandas.
- **Arreglo sugerido.**
  - Emitir en lote dentro de la misma transacción, con un `emitirEventosEnLote(tx, eventos[])` que haga un candado por
    lote, una dedupe con `clave = ANY($1)` y un `INSERT … SELECT FROM unnest(…)`.
  - Usarlo en `emitirProductosActualizados` y, en el recuento, juntar los `stock.ajustado` de `ajustarEnTx`.
  - Sumar un test: `MAX_FILAS` productos dentro del tope por defecto con margen (≤ 1,5 s en PGlite), en los dos modos.
  - No subir `timeoutMs`: alarga una transacción Serializable con filas bloqueadas.

## Intentos de refutación (cerrados)
- **Una vez, en la transacción del hecho, con dedupe.** Cumplen los ocho eventos nuevos:
  - `pedido.confirmado`, `pedido.listo` y `pedido.entregado` (compare-and-set + evento en una transacción);
  - `stock.*`, `producto.actualizado` y `cliente.creado`;
  - `caja.abierta`, `caja.turno.cerrada` y `caja.cerrada`.

  Si la transacción vuelve atrás, no queda la fila. Volver a emitir el mismo paso devuelve `duplicado` (Y4), y un producto repetido en la lista da un solo evento. [VERIFICADO, PGlite, los dos modos]
- **Otro negocio (Y1).** B no puede:
  - mover ni emitir el paso de un pedido de A;
  - emitir `producto.actualizado` de un producto de A;
  - mover el stock de A (sale `RechazoDelStock`).

  B no recibe ningún evento con ids de A.
  - Una salvedad: `emitirCajaTurnoCerrada(B, sesión de A)` escribe en B con el id de la sesión de A, porque no filtra la sesión.
  - No es alcanzable: `closeCashSession` lee la sesión con `tenantId` (`caja-actions.ts:300`). [VERIFICADO]
- **Datos de borde (Y2).** Ninguno de estos casos tira ni tumba el hecho:
  - un producto de peso con el nombre roto (un sustituto suelto) y `codigo` nulo;
  - una venta que deja el stock en negativo;
  - un precio por kg con 3 decimales;
  - un producto sin precio;
  - fichas con teléfono vacío, «abc», «123» o con dígitos de ancho completo: sale `******7788`, nunca en claro;
  - una caja con montos en coma flotante (`0.1+0.2`).

  `caja.cerrada` usa las claves EFECTIVO, MP y TARJETA de `CashMethod`, que son las del catálogo. [VERIFICADO]
- **Orden después de la anulación (Y3).** Con el pedido anulado:
  - no se mueve de READY;
  - la entrega al fiado devuelve `entregado: false`;
  - `cobrarPedidoEnTx` tira `CobroDePedidoAnulado`;
  - `emitirPedidoCobradoAlSaldar` no emite.

  El último evento del pedido es `pedido.cancelado@1`, y `pedido.confirmado` sólo sale desde PENDING. O-v4-5 queda cerrada. [VERIFICADO]
- **La redacción no tira ni tarda.**
  - Probé 4000 textos al azar (con sustitutos sueltos, `＠`, `(at)`, dígitos de otros sistemas y guion blando) y 12
    entradas armadas para trabar las regex. Todas tardan menos de 200 ms.
  - Ningún resultado pasa de 500 caracteres ni sale mal formado.
  - Los importes quedan intactos: «$ 1.250,50», «1.500,75», «125.000,50», «12500.00», «$12500000» y «1,250,000.00».
  - O-v4-2, O-v4-3 y O-v4-4 quedan cerradas. [VERIFICADO]
- **RLS en los caminos nuevos.**
  - Todas las emisiones van por `tenantTransaction` o por las fases del traslado, que ponen el GUC del negocio de la fila.
  - Ningún llamador de los mutadores usa un `$transaction` crudo sin GUC; los de operador no los llaman.
  - Lo revisé leyendo el código. Con un rol sin BYPASSRLS queda [A VALIDAR].

## Observaciones (bajas, no bloquean)
- **O-v5-1 · la excepción del importe abre una fuga nueva.**
  - `RE_IMPORTE_CON_CENTAVOS` (`esquema.ts:112`) acepta `\d+[.,]\d{2}` sin tope de dígitos. Cualquier tirada pegada a
    «,NN» o «.NN» pasa como plata y sale en claro. Por ejemplo: «llamar al 1155667788,15hs», «tel 1155667788.30 min
    antes», «DNI 30123456,12 cuotas», «CUIT 20301234567,50» y «DNI 30.123.456,50».
  - En la vuelta 4 esos casos salían tapados.
  - Arreglo: sin separador de miles, que la parte entera tenga 7 dígitos como máximo, salvo que venga después de `$`.
    Un teléfono (10 dígitos) y un CUIT (11) no entran. El DNI con miles y centavos es ambiguo y puede quedar como
    residual escrito.
- **O-v5-2 · email escrito con palabras.**
  - «juan.perez arroba gmail punto com» y «juan.perez [at] gmail [dot] com» salen enteros.
  - Es poco probable en un motivo. Anotarlo como residual o taparlo.
- **O-v5-3 · `stock.bajo` se repite por coma flotante.**
  - `cruzaElMinimo` (`del-stock.ts:38`) calcula `antes = saldo − delta` sin redondear.
  - Con el stock justo en el mínimo, a veces da `5.000000000000001 > 5` y vuelve a avisar.
  - Con un mínimo entero, sólo pasa cuando la venta deja el stock en negativo (mínimo 5, venta de 8,002 kg). Con un
    mínimo fraccionario pasa en más casos (0,102).
  - Arreglo: `round3(saldo - delta) > minimo`.
- **O-v5-4 · el `cuando` de `stock.ajustado` está incompleto.**
  - Dice «recuento, merma», pero también lo emiten la devolución de stock de la anulación (`order-anulacion.ts:519`),
    el traslado entre locales (`traslado-core.ts:544`) y el despiece (`despiece-registro.ts:93`).
  - Corregir el texto del catálogo y `eventos.md`.
- **O-v5-5 · líneas de emisión en archivos de otras tandas.**
  - `order-actions.ts` es de M8 y `clientes/fiado.ts` es de M7. Anotarlo en el plan para que no choquen al consolidar.
  - `caja.turno.cerrada` retail: §4.1.2 lo asigna a M1, y ahora lo emite P2 desde `closeCashSession`. M1 no lo tiene que
    volver a emitir; si lo hace con la misma clave `caja:turno:<id>:cerrada`, la dedupe lo ataja.
  - La venta que nace entregada sigue siendo una segunda transacción después del alta (ya era así). Si esa transacción
    falla, la venta queda CONFIRMED sin `pedido.entregado`.

## Residuales aceptados por el ingeniero (mi juicio)
- **`· * : ;` y superíndices dentro de un número.** Son aceptables: están escritos en `esquema.ts:83-100` y fijados
  como residual en `redaccion-v5.test.ts:67-94`.
  - En Argentina nadie escribe así un teléfono, un DNI ni un CUIT.
  - Lo más que filtra es parcial y con el mismo formato raro: «tel 11 5566:7788» → «******5566:7788».
- **Lista de códigos con coma.** También es aceptable: se pierde un dato, no se filtra nada.
- La fuga real de esta vuelta no es ninguno de estos residuales: es O-v5-1.

## Traspasos (contra PLAN-REINGENIERIA-N2.md, origin/main 7157018)
- **`pago.acreditado@1` → P5-C5** (línea 509): «`pago.acreditado@1` al outbox; `aplicar-pago.ts` cobra pedido…». Válido.
- **`pago.devuelto@1` → P5-C6** (línea 510): «`refunded`/contracargo → `pago.devuelto@1`…». Válido.
- **`deuda.vencida@1` → M7-C6** (línea 732): «…`deuda.vencida@1` desde el barrido». Válido; lo repite §3.1 (línea 110).
- **Cuenta de P2-C2 retail (18):**
  - 5 eventos de las vueltas 1–4;
  - 9 nuevos: `pedido.confirmado`, `pedido.listo` y `pedido.entregado`, `stock.bajo` y `stock.ajustado`,
    `producto.actualizado`, `cliente.creado`, `caja.abierta` y `caja.cerrada`;
  - 3 traspasos;
  - `balanza.lectura`, que es opcional.

  Además se emite `caja.turno.cerrada`, de §4.1.2. **F6 cerrada.** Los huecos del club y de `mensaje.recibido` quedan
  para la PMO y están bien escritos en el catálogo.

## Para sincronizar con el paquete de S2 (`origin/n2/s2-paquete-gate2` @ 1485e30 todavía no lo tiene)
La vuelta 5 no tocó `prisma/`, así que sigue pendiente lo de la vuelta 4. Se copia **sobre** la versión de S2, sin
traer las líneas viejas de P2 (FK RESTRICT, TARJETA):
1. `prisma/pending-gate2/N2_hub.sql`:
   - el `UPDATE "OutboxEvent" SET "clave" = "payload"->>'_clave' WHERE "clave" IS NULL AND "payload" ? '_clave';`,
     **antes** del `CREATE UNIQUE INDEX … (tenantId, clave)` (en P2, líneas 179–188);
   - `CREATE INDEX IF NOT EXISTS "OutboxEvent_tenantId_payloadClave_sinClave_idx" ON "OutboxEvent"("tenantId", ("payload"->>'clave')) WHERE "clave" IS NULL;` (en P2, 190–195);
   - el pie «PASO POSTERIOR», con el re-backfill y su `NOT EXISTS` (en P2, 222–234);
   - en la reversa, `DROP INDEX IF EXISTS "OutboxEvent_tenantId_payloadClave_sinClave_idx";` (en P2, 239).
2. `prisma/pending-gate2/README.md`, fila 3: «+ índice parcial `(tenantId, payload->>'clave') WHERE clave IS NULL`
   (dedupe de P2) · **paso posterior**: re-correr el backfill de `clave` a los 2 minutos». La fila 2 queda como la
   tiene S2 (DEBITO/CREDITO).
3. `docs/runbooks/gate2-nivel2.md`:
   - en §2, un paso **3b**: a los 2 minutos de aplicar N2_hub, con la app corriendo, re-correr el backfill del pie
     (depende de `TTL_NEGATIVO_MS` = 60 s);
   - en §5, la fila 3 de la reversa pasa de «2 `DROP INDEX`» a «3 `DROP INDEX`».
4. Después, correr `node scripts/qa/gate2-pglite.mjs` y el test estático de S2 sobre el paquete unido.

🔴 Sin esto, D-01 deja el emisor sin backfill ni índice parcial. Y con F7, cada dedupe sin índice recorre el outbox
**una vez por producto**.

## Verificación pendiente con Postgres real (CI o arnés en localhost:5433, rol `app_rls` sin BYPASSRLS)
1. Los 6 puntos de la vuelta 4 siguen abiertos:
   - el aislamiento por RLS de `emitir-postgres`;
   - `vuelta4-postgres` con `psql`;
   - las dos carreras de `cobrarFiadoInTx`;
   - `paquete-gate2.test.ts` con lo de P2 ya copiado;
   - los milisegundos de la dedupe en Neon.
2. `vuelta5-postgres.test.ts` y mi `v5-eventos-postgres.test.ts` con `app_rls`: cada emisión nueva tiene que pasar la
   política del outbox en su transacción, también en las dos fases de `trasladoTransaction`.
3. Concurrencia Serializable (test nuevo): `closeCashSession` o `cerrarDia` en paralelo con `cobrarVentaDeCaja` del
   mismo negocio, sin y con N2_hub.
   - Las dos leen y escriben el outbox, así que hay que esperar 40001 y reintento.
   - Medir cuántas llegan al usuario después de los 3 reintentos.
4. F7 contra Postgres real con la latencia de Neon: el aumento con `MAX_FILAS` productos y un recuento de 500 líneas,
   dentro del tope de 5 s, después del arreglo.
5. QA clic por clic en `magra`: avanzar, entregar, abrir y cerrar caja, cerrar el día, cambiar un precio, crear una
   ficha y ajustar stock. Tiene que quedar una fila por hecho en `OutboxEvent`.

---

# Vuelta 6 · certificador · f152f46..55ce45a (n2/p2-eventos)

Alcance: sólo lo que pidió la vuelta 5. Es decir, F7 (`emitirEventosEnLote` y sus usos en `del-core.ts`, `ledger.ts` y
`adjustment-insert.ts`) y O-v5-1…O-v5-5. Base: PGlite (nunca Neon, sin `.env`). Fecha 2026-10-28.
Mis tests están en el scratchpad de la sesión (`…/scratchpad/cert-p2-v6/`) y no van al repo:
- `v6-lote-postgres.test.ts`
- `v6-redaccion.test.ts`
- `dedupe-medida.mjs` (PGlite en el mismo proceso, sin Prisma)

`git diff` quedó limpio: no se tocó código.

## Verificación
- `tsc --noEmit`: 403 errores, los mismos de antes. Ninguno está en los `.ts` tocados en `f152f46..HEAD`. [VERIFICADO]
- Unitarios de `src/eventos`, `stock`, `caja`, `clientes`, `catalogo`, `supermercado`, `debts`, `multilocal`,
  `settlement`, `cierre*` y `order*`: 998 tests, 993 pasan, 5 salteados, 0 fallan. Coincide con lo que dice el
  ingeniero. [VERIFICADO]
- PGlite del repo (`emitir`, `vuelta4`, `vuelta5` y `vuelta6-postgres`): 4 de 4 pasan. En `vuelta6`, el aumento de 2000
  productos tardó 776 ms sin N2_hub y 704 ms con N2_hub. Antes de la corrección eran 5,0 s y la transacción vencía
  (`expired transaction`). [VERIFICADO]
- Regla vigente «un pedido cancelado no emite `pedido.cobrado`»: corrí de nuevo mi `v5-eventos-postgres` y pasa 1 de 1
  en los dos modos. Después de anular el pedido:
  - el fiado devuelve `entregado: false`;
  - el cobro tira `CobroDePedidoAnulado`;
  - el último evento del pedido es `pedido.cancelado@1`. [VERIFICADO]

## Intentos de refutación (cerrados)
- **El lote contra el camino uno por uno** (`v6-lote-postgres`, en los dos modos de la base). Probé los mismos 4 eventos
  por los dos caminos: `producto.actualizado` ×2, `stock.ajustado` con teléfono y email en palabras dentro del motivo,
  y `stock.bajo` con un sustituto suelto en el nombre.
  - **Mismo sobre.** Sacando `id` y `ocurridoEn`, el sobre es igual por los dos caminos: los mismos tipos, `version`,
    `clave` y `_clave` sin columnas, la misma redacción y el mismo saneo.
  - **Mismo orden de entrada.** Cada resultado del lote lleva el `id` de la fila escrita para ese evento.
  - **Sin duplicados.**
    - Reemitir los 8 eventos (4 de cada camino) en un lote da 8 `duplicado` y ninguna fila nueva.
    - Una emisión suelta después del lote también da `duplicado`.
    - Un lote con el mismo evento 500 veces escribe 1 fila.
  - **Dos negocios en el mismo lote** con la misma clave escriben una fila cada uno.
  - **No queda nada a medias.**
    - Si la transacción vuelve atrás después del lote, no queda ninguna fila.
    - Si la base da un error después del lote (`1/0`), tampoco queda ninguna.
  - **Lote vacío:** devuelve `[]`. [VERIFICADO]
- **El orden entre filas no es un contrato en ninguno de los dos caminos.** Todas las filas de la transacción tienen el
  mismo `createdAt` (`now()`), y el `id` es aleatorio. Con N2_hub, la posición física (`ctid`) del lote sale distinta de
  la de entrada, porque reusa el espacio que liberó el backfill. Por eso no hay orden que perder.
- **Ningún camino masivo sigue emitiendo por fila.** Revisé con `grep` todos los `emitir*` y `recordMovement` que están
  dentro de un bucle:
  - Aumento, planilla y lista de la marca: emiten **una vez** por llamada, por `emitirProductosActualizados` en lote.
  - Recuento y merma (`ajustarEnTx`): juntan los eventos y los emiten en lote al final (`adjustment-insert.ts:227`).
  - Compras (`COMPRA`) y la entrada del traslado (`REPOSICION`) no generan eventos ni consultas: el lote vacío vuelve
    antes de tocar la base.
  - Quedan por línea, pero acotados y no masivos:
    - la anulación (`order-anulacion.ts:515`), una venta;
    - el traslado (`MAX_LINEAS_TRASLADO` = 20);
    - el despiece, el consumo de insumos de un turno, la venta y la devolución al proveedor. Éstos emiten sólo
      `stock.bajo`, cuando la línea cruza el mínimo. [VERIFICADO]
- **Tiempos.**
  - El aumento de `MAX_FILAS` = 2000 productos en una transacción Serializable, con el tope por defecto, tardó 645 a
    752 ms en los dos modos, con el outbox del negocio en 0, 20.000 y 50.000 filas. Repetir el mismo lote tardó 470 a
    670 ms y no escribió ninguna fila nueva.
  - 2000 candados en una sentencia: 11 a 19 ms.
  - Medí la dedupe sola, en PGlite en el mismo proceso:

    | Outbox | Lote (2000 claves) | Uno por uno |
    |---|---|---|
    | 200.000 filas del negocio, sin N2_hub | 350 ms | 74 ms por clave, ≈ 148 s en total |

    [VERIFICADO]
- **O-v5-3 cerrada.** Recorrí todo mínimo entre 0,001 y 20 contra ventas de 0,001 a 8,002, con el stock justo en el
  mínimo, y no se repitió ningún aviso. El cruce real sigue avisando (de 5,1 a 4,9). [VERIFICADO]
- **O-v5-4 cerrada.** `alta-producto.ts:78`, `order-anulacion.ts:519`, `traslado-core.ts:544` y
  `despiece-registro.ts:93` son `AJUSTE`, como dice el `cuando`. El test P2-C7, que compara `eventos.md` con el
  catálogo, pasa. [VERIFICADO]
- **O-v5-5.** Queda como nota para la PMO, fuera de esta rama, que no toca `main`. Lo acepto.
- **O-v5-1 y O-v5-2 cerradas** (`v6-redaccion`: 42 de 58; las 16 que fallan son las de la lista que sigue y la de un
  error de mi test).
  - Ahora se tapan:
    - «1155667788,15hs», «1155667788.30», «1155667788.00» y «1155667788,5»;
    - «DNI 30123456,12 cuotas» y «CUIT 20301234567,50»;
    - «45678901,15hs» y «155667788,30»;
    - «11 5566 7788,15hs» y «11-5566-7788,15hs»;
    - «+5491155667788,15», «(011) 4567-8901,30» y «CUIL 20-30123456-7,50».
  - Los importes siguen intactos, también «9999999,99», «1250000,00» y «$ 12500000,50».
  - Los emails en palabras que pedía la vuelta 5 se tapan, con estas variantes:
    - «[at]/[dot]», «(arroba)/(punto)», en mayúsculas, con «.com.ar» y con un punto real o «gmail. com»;
    - «juan.perez@gmail punto com».
  - «la arroba de la planilla» y «vendí 2 arroba y media» quedan como están.
  - Las entradas armadas para trabar la regex nueva tardan menos de 200 ms.

## Residuales (mi juicio: aceptables, no bloquean)
- **«DNI 30.123.456,50» (residual declarado).** Lo acepto.
  - Tiene la forma exacta de $ 30.123.456,50. Para taparlo habría que destapar importes reales, o mirar la palabra de
    adelante.
  - Además, sólo pasa con la coma y los centavos pegados, sin espacio, cosa improbable en un motivo.
  - La misma clase cubre «DNI 7.123.456,50», «DNI 7123456,50» y «tel 4567890,15hs»: 7 dígitos entran en el tope del
    importe. También «DNI 30,123,456,50» y «tel 1.155.667.788,15», que nadie escribe así.
  - Mejora opcional, no exigida: si la tirada viene después de «DNI», «CUIT», «CUIL» o «tel», taparla siempre.
- **Emails ofuscados que siguen en claro:**
  - «juan.perez @ gmail punto com» (arroba real con espacios y «punto» en palabra);
  - «juan.perez at gmail dot com» y «{at}/{dot}»;
  - «juan.perez arroba gmail» y «juan.perez arroba gmail com», sin «punto»;
  - tres o más espacios, guiones en lugar de espacios, «c o m» y «a r r o b a».

  Son ofuscaciones deliberadas o formas a medias, no lo que escribe un empleado en un motivo. Lo acepto como residual.

## Observación
### O-v6-1 · baja · sin N2_hub (producción hoy), la dedupe del lote lee el outbox de TODOS los negocios
- **Dónde.**
  - `SQL_YA_ESTAN_DEL_LOTE` (`src/eventos/emitir.ts:268`) compara `o."tenantId" = p."t"` como columna del `unnest`, sin
    ninguna constante.
  - Desde unas ~50 claves, el planificador deja el índice de `tenantId` y hace un `Seq Scan on "OutboxEvent"` de la
    tabla entera con Hash o Merge Semi Join.
  - El outbox no tiene purga: no hay `deleteMany` fuera de `reset-golive-db.ts`. Así que el costo crece con lo que
    emiten todos los negocios, no con lo del que opera.
- **Repro.** `node …/cert-p2-v6/dedupe-medida.mjs 2000 500000`: el negocio A tiene 2000 filas y otros 50 negocios
  suman 500.000.

  | Lote | Plan | Tiempo |
  |---|---|---|
  | 1 a 10 claves | por índice | 3 a 8 ms |
  | 50 claves | `Seq Scan` | 467 a 486 ms |
  | 2000 claves | `Seq Scan` | 478 a 583 ms |

  Con otros 100.000: 83 ms (lineal). Así, un recuento de 50 líneas de un negocio chico paga una lectura completa del
  outbox ajeno. Uno por uno eran 50 × ~2 ms.
- **Impacto.**
  - Hoy no tumba nada: en Postgres nativo es varias veces más rápido que en WASM.
  - Pero el costo de cada operación masiva crece sin techo con el uso de la plataforma, y así vuelve F7 por otro lado.
  - Con RLS sigue leyendo todas las filas: la política filtra después.
  - Con N2_hub el plan cambia, pero tampoco usa una constante de negocio. Con el outbox casi vacío, el `EXISTS` por
    `clave` sale como *hashed SubPlan* con `Seq Scan` de la tabla entera. Con un outbox grande, el plan con N2_hub
    queda [A VALIDAR] en Postgres real: en PGlite, aplicar N2_hub sobre 20.000 a 100.000 filas no terminó.
- **Arreglo sugerido.**
  - En la práctica, el lote siempre es de un negocio (lo arman `emitirProductosActualizados` y
    `emitirEventosDeMovimientos`).
  - Agrupar por `tenantId` y sumar a las dos consultas `AND o."tenantId" = $4`, o validar que el lote sea de un solo
    negocio y pasarlo como escalar. Así el plan va por el índice de `tenantId`, o por el UNIQUE con N2_hub, y lee sólo
    las filas de ese negocio, una vez.
  - Fijarlo con un test: 2000 filas de A y 100.000 de otros; el lote de 50 no puede tener `Seq Scan`.

## Fuera de alcance (lo declaró el ingeniero; no es falla de P2)
- **Costo del recuento grande, anterior a P2.**
  - Con los eventos ya en lote, `ajustarEnTx` tarda 2,0 a 2,3 s con 300 líneas. Con 1000 líneas pasa el tope:
    «5004 ms passed since the start of the transaction», sin N2_hub, en PGlite.
  - El lote de eventos pesa unos 75 ms de eso. El resto es `recordMovement`, unas 8 sentencias por línea, que ya estaba
    antes de P2.
  - No hay tope de líneas en `stock-adjustment-actions.ts`.
  - Mi juicio: es un riesgo real para un supermercado que recuenta toda la góndola. Lo tiene que tomar la PMO como
    tarea propia: un tope de líneas con aviso para partir en tandas, o un ledger en lote como el de los precios.
  - Con la latencia de Neon, el corte llega bastante antes de las ~700 líneas de PGlite.
- **Arnés.** En PGlite, una transacción de Prisma que vence por tiempo, o un archivo SQL grande aplicado por `pg`
  (N2_hub con más de 20.000 filas en el outbox), deja el servidor de PGlite ocupado sin terminar. Por eso medí la
  dedupe con PGlite en el mismo proceso. Las cifras con más de 50.000 filas pasando por Prisma quedan [A VALIDAR] en
  Postgres real.

## Lo que no pude verificar
- RLS con `app_rls` (PGlite es superusuario).
- Concurrencia real: dos lotes, o un lote y una emisión suelta a la vez, y el orden de los candados en carrera.
- Varios lotes de 2000 candados en simultáneo contra `max_locks_per_transaction`.
- El plan con N2_hub y un outbox grande.
- Los tiempos contra Neon.

Siguen abiertos todos los puntos de «Verificación pendiente con Postgres real» de la vuelta 5. Sumo el plan de la
dedupe del lote con N2_hub y 1 millón de filas de otros negocios.

Veredicto final: CON OBSERVACIONES — F7 cerrada (2000 productos en ≈0,7 s, el lote ≡ uno por uno en sobre, dedupe y rollback) y O-v5-1…O-v5-5 cerradas; queda O-v6-1 baja: sin N2_hub, la dedupe del lote lee el outbox de todos los negocios desde ~50 claves (`emitir.ts:268`; arreglo: filtrar por la constante del negocio). El recuento de más de ~700 líneas, anterior a P2, pasa a la PMO.
