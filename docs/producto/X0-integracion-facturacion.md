# X0 — Integración de la suite de facturación con `main` · Dictamen

**Fecha:** 28/10/2026 · **Rama:** `integ-facturacion` (sin push) · **Plan:** `Factory-GSG/00-ESTADO/reingenieria-2026-10/PLAN-CONTADOR-FACTURITA.md`, tanda X0.
**Base:** `origin/main` `d4798012` + `origin/claude/facturacion-automatica-facturita` `e2543c41` (merge `82e1f8dd`, sin rebase).
**Nada llegó a `main`, a Neon ni a Vercel.** No se emitió ningún comprobante real (ARCA simulado, `ARCA_MODO` sin poner).
Las 3 migraciones (`20261022140000`, `…140100`, `…150000`) siguen **sin aplicar** y `prisma/lote-deploy.txt` no se tocó.

## Dictamen

**INTEGRABLE CON OBSERVACIONES.** El merge compila, arma el build y no suma ningún test rojo respecto de `main`.
Lo que esta máquina no puede probar, porque no tiene Postgres, queda **[A VALIDAR]** y se dice abajo: RLS y concurrencia real.
No hay ningún hallazgo alto.

## Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| **X0-C1** merge limpio y las tres entidades | ✅ | Un solo conflicto, `src/lib/audit-retention.ts`. `PURGE_EXEMPT_ENTITIES` conserva `ENTIDAD_CONFIG_ENVIOS`, `ENTIDAD_TECLAS_FIJADAS` y `ENTIDAD_RECEPTOR_DEL_COMPROBANTE`. `audit-retention*.test.ts` verde dentro de la suite. |
| **X0-C2** `tsc` y build | ✅ | `npx tsc --noEmit`: 0 errores. `next build`: verde; salen las 10 rutas `/facturita/**` y las 8 `/contador/**`. |
| **X0-C3** suite completa, cero rojos nuevos | ✅ con límite | Integración: 6936 tests, 6367 pasan, 34 fallan, 268 cancelados, 267 salteados. `main` en la misma máquina: 6768, 6214, 39, 268, 247. **Ningún archivo falla en la integración que no falle en `main`** (53 contra 57). Las causas preexistentes: el navegador de las pruebas de pantalla no arranca en Windows (`browserType.launch: spawn UNKNOWN`), rutas `C:\C:\…`, la guardia de redondeos sobre archivos de `club/`, el contrato de ARCA y otras. `src/tenants/breakpoint/turnero/demo-local.test.ts` se cuelga en las dos y se cortó a mano. Tests puros del frente (56 archivos) con `CI=1`: **605/605**. **Límite:** sin Postgres, los 267 tests de base se saltean; los del frente se corrieron aparte sobre PGlite (C4/C5). |
| **X0-C4** choque R3 | ✅ funcional · RLS [A VALIDAR] | En PGlite, importar dos veces el mismo «Mis Comprobantes Recibidos» desde la consola deja 8 compras y avisa «Ya estaba cargado» en las 8 (`recibidos-postgres.test.ts:132-155`). `compra-factura-postgres` 1/1. El test cae después, en la afirmación de RLS (`:164`), que PGlite no puede cumplir porque entra como superusuario. |
| **X0-C5** choque Serializable | ✅ resultado · carrera [A VALIDAR] | Por lectura: el lote usa `tenantTransaction` sin Serializable (`cartera-abonos.ts:260-275`) y el reintento de `003c27c1` sólo actúa con Serializable (`rls.ts:245-260`). El duplicado sigue llegando como P2002 y se traduce en «ya emitida». Corridas en PGlite: ver «Tres corridas» abajo. PGlite atiende de a una sesión: prueba que la dedupe da una sola factura, **no la carrera**. Sin `skip`. |
| **X0-C6** PDF común | ✅ por código y tests · captura de Magra pendiente | El diff de `comprobante-pdf-datos.ts` sólo agrega lecturas para comprobantes **sin** venta, turno ni movimiento (`!inv.order && !inv.appointment && !movimiento`). La descripción guardada entra sólo en esa rama, y la consulta extra tolera P2021/P2022. `comprobante-pdf.ts` sólo cambia el texto del CAE «STUB». Para una venta de Magra (con `order`), los datos impresos son los mismos de antes. `comprobante-pdf.test.ts` verde (`CI=1`); `comprobante-pdf-postgres` 2/3 en PGlite (falta la afirmación de RLS). **No corrí** el e2e de Magra que imprime ni la captura antes/después: necesitan Postgres y el arnés de Magra. |
| **X0-C7** QA clic por clic a 360 px | ✅ con observaciones | Ver «QA» abajo. Hecho con las 3 migraciones y sin ellas, sobre la app compilada con PGlite. |
| **X0-C8** Gates y HANDOFF | ✅ | `docs/producto/facturita/GATE.md` («Cierre de la vuelta 4 en X0»), `docs/producto/contador/GATE.md` («Nota de integración»), `docs/producto/HANDOFF-suite-facturacion.md` marcado SUPERSEDIDO. |
| **X0-C9** `npm run gates` y `gate:rls` | `gate:rls` ✅ · `gates` no corrido entero | `node prisma/rls/check-coverage.mjs`: 81 modelos protegidos, ninguna tabla nueva sin RLS. `npm run gates` no se corrió de punta a punta: su paso de tests se cuelga en `demo-local.test.ts` (igual en `main`) y los pasos visuales usan el navegador que no arranca. Sus pasos se corrieron sueltos: tsc, tests, rls-coverage, build, y eslint de lo tocado (0). |

### Tres corridas (X0-C5, PGlite)

| Corrida | `cartera-abonos-postgres` (dos lotes a la vez → 1 factura) | `una-factura-por-cobro-postgres` |
|---|---|---|
| 1 | 1/1 | 5/5 |
| 2 | 1/1 | 5/5 |
| 3 | 1/1 | 5/5 |

En la corrida de los 22 archivos, una por una, también dieron verde. **[CONTRADICTORIO]** El plan (X0-C5) dice que `cartera-abonos-postgres` fallaba con carga y cita `docs/producto/contador/GATE.md:84-85`, pero ese Gate dice «61 verdes, 0 rojos» con Postgres 16 (`GATE.md:89-94`) y no menciona ninguna falla con carga. Sea como sea, PGlite no tiene carrera: **[A VALIDAR] con Postgres 16 y la suite completa.**

## QA clic por clic (360 px, app compilada, PGlite, ARCA simulado)

Negocios de prueba sembrados en una base local: `facturita-demo` (monotributo), `facturita-ri` (responsable inscripto) y `estudio-norte` con una cartera de 3 (monotributo, inscripto y exento).

**Facturita, con migraciones**
- Monotributo → inscripto, por servicios con fechas: Factura C 00002-00000001 «Autorizada de prueba». En la base: tipo 11, sin IVA, descripción guardada.
- PDF con CAE simulado: 409 con una página clara («En modo de prueba el PDF no sale…» + faltan datos para facturas).
- Anular: el foco va al motivo, «Cancelar» lo devuelve a «Anular» y el resultado se anuncia en `role="status"`. La nota sale con su propio número y la factura queda «Anulada con nota de crédito». La nota ocupa cupo (2 de 5): es lo que decide D-03.
- Cupo en 5 de 5: aparece el aviso de tope y no deja anular. Explica qué hacer en `role="alert"` y no crea ninguna nota.
- Inscripto, 10,5 % a consumidor final: Factura B, neto 10.000, IVA 1.050, total 11.050 (alícuota 4).
- Inscripto → inscripto: el domicilio pasa a obligatorio y el botón no se habilita sin él.

**Facturita, sin migraciones:** «Mis facturas» sale sin descripciones y sin error.

**Consola, con migraciones:** cartera (avisa que ARCA está en modo simulado) → Abonos (alta) → Lote (pide confirmación; «1 autorizado»; repetir no emite) → Comprobantes → nota de crédito por $100.000 sobre $80.000 (rechazada con el saldo) → nota parcial de −$30.000 → Exportar (CSV del mes con la nota en negativo).

**Consola, sin migraciones:** todas las pantallas responden 200; Abonos muestra «Los abonos necesitan un último paso de base de datos…».

## Hallazgos

| # | Gravedad | Hallazgo | Qué se hace |
|---|---|---|---|
| H-1 | media | **Facturita no tiene dónde cargar el régimen de Factura A.** Esa regla viene de `main` (`fiscal/regimen-factura-a.ts`); el dato sólo se carga desde la consola del operador y desde Libros del admin. Un inscripto en Facturita que factura a otro inscripto queda «Frenada antes de ARCA», y el aviso lo manda a «tus datos fiscales», que en Facturita no existen. | Va a **X1** (Factura A completa): pantalla en «Mi cuenta» o texto que mande a Soporte. No entra en el tope de 10 líneas de X0. |
| H-2 | media · [A VALIDAR] | **Emitir en Facturita sin la migración `20261022140000`:** la emisión falló en el QA («No se pudo emitir la factura»). Aislado con un script: el primer intento da P2022 como se espera; el reintento sin `descripcion` vuelve vacío **sólo si sale enseguida**. Con 2 segundos de pausa, o con otro cliente de base, crea la factura. Apunta a PGlite (una sola sesión compartida), pero ningún test cubre este camino. | Agregar un test «emitir sin la migración» con Postgres real, en X2 o al cerrar D-01. Si las migraciones se aplican antes de publicar (D-01), el camino no se usa. |
| H-3 | baja | La tabla de «Mis facturas» y la de la cartera desbordaban la página a 360 px. | **Arreglado** en `f0ad761f`. |
| H-4 | baja | Textos: «Antes de tu primera factura» sigue después de emitir varias; la nota dice «Anula la factura 2-1» en vez de 00002-00000001; la consola usa 4 cifras de punto de venta («0002-…») y Facturita 5; «1 comprobantes» en el lote; el CSV muestra el CUIT como receptor (X2 lo prevé); a 360 px el CUIT del abono se parte en dos renglones; tras un rechazo de la nota de crédito se borra el motivo escrito. | Al backlog de K2/K3/F1, sin tanda propia. |
| H-5 | baja | `arca-reserva.ts:247` guarda `now() + espera` en una columna `TIMESTAMP` sin zona: depende de que la sesión de la base esté en UTC (lo está en Neon y en el CI). PGlite toma la zona de la máquina y adelanta 3 h el próximo intento. Código de `main`. | Anotado. Sólo hay que mirarlo si alguna vez cambia la zona de la base. |

## Qué no se pudo verificar en esta máquina

- **RLS de punta a punta y concurrencia real.** No hay Postgres instalado. PGlite corre como superusuario, en una sola sesión y con la zona de la máquina. De los 22 tests de base del frente, 13 pasan enteros; los otros 9 fallan sólo en afirmaciones de RLS (7), en el protocolo de PGlite (`arca-envios-concurrencia`: «unnamed prepared statement does not exist») o en la zona horaria (`arca-procesador-sin-operador`, `motor`: «espera su próximo intento»). Ninguno falla en una afirmación funcional del frente.
- **El e2e de Magra que imprime** y la captura antes/después del PDF.
- **`npm run gates` de punta a punta** y sus pasos visuales.

Para cerrarlos hace falta un Postgres 16 real: el de la otra máquina (puerto 5434), uno portable bajado con OK del dueño, o el job `tests` del CI (necesita push de la rama, que hoy no está autorizado).

## X0 bis (29/10/2026) — sobre `origin/main` `e57651d2` (pase N2 en producción)

- **Merge `b5af86b2`.** Tres conflictos, resueltos sumando los dos lados:
  - `invoice-core.ts`: importaciones.
  - `mercadopago-auto.ts`: `configCobrosPorDefecto` + `estadoCobrosMP`.
  - `mercadopago-dispatch.ts`: el gateway con el pago ya leído y la facturación apagable de `main`, más R1 de la rama: con el pago, se factura ese cobro del turno.
- **H-1 cerrado (`768d2a5e`).** El aviso `REGIMEN_A_A_CONFIRMAR` ahora manda a «pedile a Soporte GSG que lo cargue». Sólo cambia el texto; código y gravedad del motivo siguen iguales.
- **Test de R1 adaptado (`77df04c8`).** Desde P1-C4, Mercado Pago es una conexión del negocio. El test la crea con `crearConexion`; en PGlite da 5/5.
- **Verificación:**
  - `tsc` 0 errores; build verde con 18 rutas del frente.
  - Suite: 7219 tests, 6614 pasan, 33 fallan, 273 cancelados, 299 salteados. Los 53 archivos con fallas también fallan en la línea de base de `main` del 28/10 (`d4798012`); no se volvió a medir `e57651d2`.
  - Tests de la zona MP y motor con `CI=1`: 195/195.
  - PGlite: `mercadopago-doble-factura` 2/2 y `facturita-emision` 5/5.
- **Recorrido de punta a punta con `next start`** (PGlite, ARCA simulado, 360 px):
  - Factura B 00003-00000002 autorizada: neto 20.000 + IVA 4.200 = 24.200, numeración correlativa.
  - La Factura A sin régimen muestra el texto nuevo.
  - «Mis facturas» mide 368 px (antes 648-660).
- **H-2:** sigue [A VALIDAR]. Deja de importar si las 3 migraciones se aplican antes del deploy, que es lo que exige `vercel-build.mjs:173-181`.

### Certificación completa de la resolución de Mercado Pago (refutador, 29/10)

La resolución del merge **se sostiene**: no hay doble factura nueva y los eventos del Core salen en los mismos lugares que en `main`. Lo que encontró en el código de R1 y en la convivencia con N2:

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| C-1 | **media-alta · fiscal** | Carrera seña/cierre: si el aviso de MP de la seña y el cierre del turno corren a la vez, la seña se factura dos veces. `facturarCobroMPDelTurno` mira si el turno ya tiene factura en una transacción y factura en otra (`invoice-from-appointment.ts:208-217`). `facturarAppointment` lee lo facturado por MP fuera de su transacción (`:127-135`). Las claves son distintas (`mp:` y `turno:`) y el índice único no los frena. Viene de R1, no del merge. | **Abierto.** El arreglo es bloquear la fila del turno en los dos caminos y volver a leer dentro de la transacción. Se certifica sólo con concurrencia real (Postgres). |
| C-2 | baja | Con N2, la configuración de MP no trae `collectorId`: las «cuentas propias» de R1 quedan vacías y una transferencia del propio dueño va a revisión (no se factura) (`mercadopago-auto.ts:324`). | Deuda: definir de dónde sale `collectorId` en la conexión. |
| C-3 | baja | `crearEntornoReal` lee la configuración dos veces; en modo legado deja dos AuditLog `mp-modo-legado` (`mercadopago-auto.ts:291,301`). | Deuda. |
| C-4 | baja | Ningún test recorre `manejarNotificacionMP` con la resolución nueva (el de R1 copia la función, `una-factura-por-cobro-postgres.test.ts:112`), y el comentario de `mercadopago-doble-factura-postgres.test.ts:132-134` quedó viejo. | Deuda. |
| C-5 | baja | Un pago de MP que llega con el turno ya facturado se anota contra esa factura y no se emite otra, aunque sea un saldo (`invoice-from-appointment.ts:216-217`). `main` tenía el mismo hueco por otro camino. | Deuda. |

## D-02 (dónde viven las migraciones)

Se aplica la recomendación (a): las tres quedan en `prisma/migrations/`, fuera de `prisma/lote-deploy.txt`. **No se tocó** `prisma/pending-gate2/README.md` porque lo edita la rama `n2/s2-paquete-gate2`. Cuando S2 cierre, su README y el anexo del runbook tienen que listar:

| Migración | Qué agrega | Quién la usa | Irreversible |
|---|---|---|---|
| `20261022140000_invoice_abono_descripcion` | `Invoice.abonoClave`, `Invoice.descripcion` + índice único `(tenantId, abonoClave)` | lote de abonos (idempotencia), descripción en lista, PDF y CSV (consola y Facturita) | 🔴 el índice único |
| `20261022140100_regla_facturacion` | tabla `ReglaFacturacion` con RLS y CHECKs | abonos de la consola | tabla nueva |
| `20261022150000_cobro_facturado` | tabla `CobroFacturado` con RLS | R1 «una factura por cobro» (MP, turno, banco) | tabla nueva |

— Elaborado por GSG
