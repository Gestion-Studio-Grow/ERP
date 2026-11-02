Veredicto final: CON OBSERVACIONES (vuelta 3, 444bd0b2)

# Dictamen — ronda 2 (`estetica/ronda2`, HEAD `fc0aec24`, contra `origin/main` `8d3057f5`)

Modo completo. Certificador independiente: no se corrigió nada.

**Motivo del rechazo:** un solo hallazgo ALTO de plata (F1): una seña deshecha o anulada y vuelta a cobrar no entra al libro, y la pantalla le dice a la recepción que quedó confirmado.

**Aclaración para decidir:** F1 no es una regresión. También está en `origin/main`, reproducido con el mismo caso. Rechazo igual porque está dentro de lo pedido (A1, anular y devolver seña) y CH lo recibe por primera vez con este pase, ya que hoy no está en producción. Lo que la rama trae nuevo aguantó todos los ataques de plata.

Etiquetas: `[VERIFICADO]` = ejecutado o leído en el código citado · `[POR LECTURA]` = leído, no ejecutado · `[A VALIDAR]` = con modo de cierre escrito.

---

## Hallazgos

### F1 · ALTO · plata · también en main — la seña vuelta a cobrar no entra al libro `[VERIFICADO]`

**Dónde**
- `src/lib/turnos/cobro-dividido.ts:133` `claveDeSenia(appointmentId)`: la clave depende sólo del turno.
- `src/lib/turnos/cobro-actions.ts:372`: el cobro usa esa clave fija.
- `src/lib/turnos/cobro-turno-repo.ts:201-206`: si la clave ya existe, devuelve `applied:false, reason:"duplicate"`, aunque ese cobro esté anulado.
- `src/lib/turnos/cobro-actions.ts:378-385` y `:434-440`: confirma el turno igual y avisa «La seña ya estaba cobrada: quedó confirmado.»
- `src/lib/turnos/cobro-actions.ts:683-779` `deshacerSenia`: vuelve el turno a PENDING.
- `src/app/admin/(dashboard)/turnos/agenda-core.ts:150-153` y `_agenda/TurnoCajon.tsx:310,413`: con el turno en PENDING reaparece «Llegó la seña».

**Caso ejecutado** (`adv-sena2`, Postgres efímero, acciones reales)
1. La dueña cobra una seña por Transferencia de $5.000.
2. La dueña toca Deshacer. El turno vuelve a PENDING y reaparece «Llegó la seña».
3. Llega de nuevo la seña, en efectivo, y se toca «Llegó la seña».
4. Respuesta: `{ok:true, cobroId:null, monto:0, confirmo:true, aviso:"La seña ya estaba cobrada: quedó confirmado."}`.
5. Resultado: turno CONFIRMED, filas +5.000 y −5.000, **0 asientos de efectivo**.

**Efecto:** la plata está en la mano, no está en el libro, el turno figura confirmado sin seña y el cajón va a dar sobrante.

**Otros caminos**
- `adv-anular`: lo mismo por recepción tras anular con código. Ahí el turno queda CONFIRMED y la pantalla no ofrece el botón, pero la acción sí lo permite.
- `[POR LECTURA]` También se llega en pantalla si la profesional cobró la seña sin confirmar (queda PENDING) y después se anula.

**Arreglo sugerido (no aplicado):** clave con número de intento, como `previos.length+1` de `cobrarVariosTurnos`, o ignorar las claves de cobros ya anulados. Además, no confirmar con `applied:false` si la seña sigue faltando.

### F2 · MEDIO · plata · preexistente — comisión ya pagada de un cobro que después se anula `[VERIFICADO]`

**Dónde:** `src/lib/turnos/anulacion.ts:369` `anularCobroTurnoInTx` no mira `commissionPayoutId` (grep sin resultados en `anulacion.ts`).

**Caso** (`adv-com2`): se liquida y paga la comisión, y después se anula el cobro. El pago de $9.000 sigue en pie, el `Payment` queda en 0/PENDING, y no hay aviso ni contrapartida.

**Efecto:** la profesional queda cobrada de más y nadie se entera.

**Arreglo sugerido:** avisar al anular o dejar un saldo a favor del negocio para la próxima liquidación.

### F3 · MEDIO · plata · preexistente, sólo Taller/AGR — Taller escribe dentro de un día cerrado `[VERIFICADO]`

**Dónde:** `src/lib/taller/caja.ts:50-76` `asentarCobroInTx` y `:79-105` `revertirCobroInTx` no tienen frontera de cierre y usan `occurredAt` = ahora. Los llaman `src/lib/taller/acciones.ts:388` y `:434`. El comentario de `caja.ts:9` dice que un día ya cerrado no se reescribe, y el código no lo cumple.

**Caso** (`adv-cuenta`): con el día de hoy cerrado, `registrarPago` y `anularPago` asientan VENTA 1.234 y EGRESO 7.000 dentro de ese día. Los turnos, en el mismo caso, rechazan.

**Efecto:** cambia lo que el libro dice de un día ya cerrado y mueve la apertura siguiente sin explicación.

**Arreglo sugerido:** la misma guarda de turnos.

### Observaciones BAJAS

| # | Qué | Dónde | Estado |
|---|---|---|---|
| B1 | Taller `registrarPago` sin clave: dos envíos simultáneos por servidor dan 2 cobros. La pantalla lo frena con `BotonEnviar`. | `src/lib/taller/acciones.ts:367` | `[VERIFICADO]` |
| B2 | «-100» en una columna sin contar, enviado directo al servidor, queda sin conciliar en silencio. La pantalla lo bloquea. Preexistente. | `src/lib/cierre-diario-actions.ts:651` | `[VERIFICADO]` |
| B3 | Modal de reserva: cualquier `res.ok===false` (también cupón, teléfono o error genérico) oculta esa hora libre hasta cambiar servicio o profesional. | `src/app/(site)/_ch/BookingModal.tsx:279,451,669` | `[POR LECTURA]` |
| B4 | EGRESO de Taller con `createdBy user:` probablemente figura «cargado a mano» en el CSV, aunque no se puede borrar. | `src/lib/caja/libro-caja.ts` | `[POR LECTURA]` |
| B5 | El libro selecciona `tallerPagoId` sin guarda de columna. Si faltara en producción, el libro entero falla. Cierre: consultar `_prisma_migrations` por `20261009120000_taller_caja`, por quien tenga acceso. | `src/lib/libro-caja-actions.ts:247` | `[A VALIDAR]` |

---

## A. Plata: lo que aguantó `[VERIFICADO]`

- **Cuenta a mano (A5)**, `adv-cuenta`, día con turnos, Taller, anulaciones, gastos a mano y comisión por Transferencia: EFECTIVO 8.000 · MP 8.500 · TRANSFERENCIA 19.900 · TARJETA 2.000. Da igual en hoja de cierre, `getLibroCajaData`, CSV (suma de filas y resumen) y `esperadoEnElCajon` (8.000).
- **Cierre (A3):** aviso «Lo contado coincidió con el libro. Sin conciliar: Mercado Pago ($8.500,00), Tarjeta ($2.000,00).». Anular un turno con el día cerrado rechaza. `cierre-aviso-sin-contar` pasa.
- **Anulaciones (A1):**
  - Carreras (turno y Taller): 1 solo egreso.
  - Roles: `anular-*-roles-postgres` y `devolucion-medio` pasan en la suite.
  - Ventas: puerta única por `anularVentaCore`. `anularRenglonDeCaja` es de ticket sin cobrar.
  - No se objetan, por decisión del dueño: inmobiliaria sin código y egreso a mano de recepción sin código.
- **Comisión (A2):** un parcial anulado espera. Al condonar da 10 % de lo cobrado real ($1.000), con egreso en TRANSFERENCIA. La segunda liquidación da `error_nada`. Recepción es redirigida. `comision-medio` pasa.
- **Taller (A4):** `metodoDeCaja` (`src/lib/taller/caja.ts:25-40`) manda Transferencia a su columna (`9e4e5ea8`). VENTA y EGRESO de Taller no se borran del libro y figuran `borrable:false` (`ca2e16a7`).

## B. Aislamiento `[VERIFICADO]`

`adv-rls` pasa. Con sesión del negocio B e ids del negocio A, ninguna acción escribe ni lee: anular, autorizar, cerrar, seña, deshacer, Taller, libro, comisión, `getClient`. Libro, hoja y espera de B quedan limpios. Contexto RLS de B mirando A: 0 filas.

- La cobertura cruzada de ventas la da el test del repo «otro negocio» de `anular-venta-roles-postgres`; en mi test ese caso cortó antes por un nombre de campo equivocado.
- Queries nuevas con `tenantId`, sin SQL crudo nuevo, `force-dynamic` en sitemap. Caché pública sólo en `/tenants`, `/team` y `/sin-negocio`.
- `gate:rls` OK.

## C. Modal y deslizar `[VERIFICADO salvo lo indicado]`

`reserva-modal-flujo` (jsdom, prendido y apagado: doble toque, respuesta vieja, rechazo, plazo) y `deslizar-tactil` (Chromium táctil real) pasan: 35/35. Ver B3.

Cierre de mes y bancos: **no recorridos en página real**. `ContarYCerrar.tsx:343`, `CongelarDeslizando.tsx:77` y `EmitirDeslizando.tsx:56` usan el mismo componente con `key={intento}`, verificado por lectura. `U4.5` figura SIN PROBAR en el UAT.

## D. Otros negocios `[POR LECTURA]`

- `4b2eb958` y `f4adf368` entran sólo por `esEstetica` (slug `beauty-spa`). Los demás rubros tienen textos idénticos.
- `chConDisenoNuevo` corta por slug.
- `textoDeEsperaPorSaldo(null)` da el texto de siempre.
- Inmobiliaria: sólo lectura de código, nada ejecutado sobre sus datos. `src/app/inmobiliaria/page.tsx:79` y `src/components/inmobiliaria/Recibo.tsx:16` sólo toleran el «+». `src/lib/inmobiliaria/acciones.ts` sin cambios de lógica salvo `29c260cf` (WhatsApp canónico).
- La orden del dueño de anular vale para todos los negocios a propósito.

## E. Compilación y suite `[VERIFICADO]`

| Control | Resultado |
|---|---|
| `git diff --name-only origin/main...HEAD -- prisma` | vacío, sin migraciones |
| `npx tsc --noEmit` | exit 0 |
| `next build` | exit 0, sin tocar `.next/cache` |
| `gate:rls` | OK |
| `npm test` completo, sin navegador disponible | 7675 tests · **pass 7320 · fail 60 · cancelled 293 · skipped 2** |
| Re-corrida de los 74 archivos con fallas, con `.efr/_pw-shell.mjs` | 639 tests · pass 576 · **fail 63** |
| Los 39 archivos que siguen fallando, en `8d3057f5` | 417 tests · pass 369 · **fail 48** |

**Comparación por test: 48 fallan en ambos, 15 sólo en la rama, 0 sólo en main.**

Límite: para los 48 quedó establecido que también fallan en main. No busqué la causa de cada uno, salvo los que se detallan.

Limitación: `facturar-turno-con-cobro-anulado`, `facturar-venta-anulada`, `cartera-abonos` y `lista-postgres` fallaron en la corrida completa y pasaron al re-correr sin carga. No establecí la causa de esa intermitencia.

### Las cinco pedidas

| Test | ¿En main? | Causa |
|---|---|---|
| `src/lib/caja/m1-caja-medios-postgres.test.ts` | Sí | Test viejo desde la migración `20261030120000_m1_enums_caja` («la base nace sin DEBITO» es true). Corta en la línea 75 y no ejecuta sus controles de plata. **Una copia adaptada (`EGRESO TRANSFERENCIA 500`) pasa entera: no es rechazo, es deuda de cobertura.** |
| `src/lib/caja/corte-inicial.test.ts` | Sí | Etiqueta vieja «MP / Transf.» contra «Mercado Pago». No es plata. |
| `src/lib/turnos/mi-turno.test.ts` | **No** | `leerMiTurno` agrega `service.depositAmount` y el test es viejo. No es fuga: es página de servidor. `[CONTRADICTORIO]` el TRASPASO lo daba por anterior a la rama; en `8d3057f5` pasa. |
| `src/lib/guardia-bundle-cliente.test.ts` | Sí | Separador `\` de Windows en la salida contra `/` en el test. |
| `src/app/admin/(dashboard)/armazon/armazon-ch.test.ts` (2) | **No** | Fixture vieja: las clases `lg:min-h-10` y `lg:py-[7px]` de `AdminShell.tsx:91` no están en `armazon-head.json`. Es la primera diferencia; no pude confirmar que sea la única. |

### Fallas sólo en la rama (15): ninguna es defecto de producto

| Test | Causa | Estado |
|---|---|---|
| `armazon-ch` (2), `mi-turno` (1) | Ver arriba. | `[VERIFICADO]` |
| `src/app/contador/MesDelEstudio.test.ts` (1) | Busca `/h-11 sm:h-9/`; la escala cambió. | `[VERIFICADO]` |
| `src/lib/pos-peso.test.ts` (1) | Busca el texto en `MagraTienda`; el contador se mudó a `magra/Etiqueta.tsx:26`, que sigue con `formatearCantidad`. | `[VERIFICADO]` |
| `src/lib/reserva-publica-postgres.test.ts` (1) | Test con franjas que se pisan: la 2.ª reserva da «Ese horario ya no está disponible». La primera guarda. **El caso «sin nota» no se ejercita.** | `[VERIFICADO]` |
| `src/lib/stock/alta-producto.test.ts` (1) | `9192396b` sacó la opción WEIGHT del alta, a sabiendas. | `[VERIFICADO]` |
| `src/apps/kpis/fila.test.ts` (1) | 46-47 ms contra tope de 45. La rama no toca `src/apps/kpis`. Tiempo de esta máquina. | `[VERIFICADO]` |
| `src/app/admin/(dashboard)/vender/vender-pantalla.test.ts` (1) | Pasa solo: intermitente. | `[VERIFICADO]`; causa no establecida |
| `src/app/tienda/magra-bolsa-navegador.test.ts` (1) | La rama agregó `scroll-behavior:smooth` (`magra/estilos.ts:350`) y el test mide durante el desplazamiento. Una copia con `behavior:'instant'` pasa 8/8: la barra no tapa el pie. | `[VERIFICADO]` |
| `src/app/tienda/tienda-nueva-entrega-navegador.test.ts` (5) | `w.__montar is not a function`: el arnés no tiene falso de `next/font`. Una copia con el falso pasa 5/5. **El test del repo sigue roto y MG-032/034/036 hoy no protegen nada en la suite.** | `[VERIFICADO]` |

### Fallas en ambas (48)

Las 5 de esta lista que coinciden con las pedidas ya se explicaron arriba.

- vercel-build 10
- acceso-comun-lab 4
- cuenta-y-buffet-pantalla 3
- demo-local 2, tenant 2, seed-postgres 2, guardia-bundle 2, design/hoja 2
- 1 cada uno: sitio-estatico, seguridad-hallazgos, reset-golive-postgres, rechazo-de-dominio (CRLF), facturacion/motor-postgres, ensayo-lote-neon, redondeos-locales, reminder-sweep-postgres, links-y-clientes-postgres (p95), club/estado-postgres, club/anonimizar, m1-caja-medios-postgres, corte-inicial, arca-procesador-sin-operador-postgres, integraciones/redaccion y contrato (ruta `C:\C:\`), eventos vuelta4, vuelta5 y emitir (`psql ENOENT`), vuelta6 (tiempo), cuaderno-postgres

---

## Lo que no pude probar

- Deslizar en la página real de cierre de mes y de bancos, en un celular.
- Recorrido en vivo de otros negocios. D es por lectura de código y suite.
- CI en Linux/LF: todo corrió en Windows con checkout CRLF, que explica parte de las 48.
- Columnas de producción (B5): sin acceso a Neon, por prohibición del brief.
- Causa de cada una de las 48 en ambas, y de las intermitencias bajo carga.

## Entorno

- `C:\r2` quedó limpio salvo este archivo. Los tests reescriben `.qa/facturacion-escala/rendimiento*.txt` (versionados): los restauré con `git checkout -- <ruta>` en `C:\r2` y `C:\reportes`.
- Para comparar contra main usé `C:\reportes` (limpio en `8d3057f5`) y reconstruí su `.next`, que está ignorado.
- Procesos ajenos colgados, no tocados: PID 25792/37676 (corrida con `--test-concurrency=2`, `demo-local`) y 19592/3708/39424/19968 (`reserva-modal-flujo`).
- Tests adversariales, fuera del repo: `C:\Users\MLLOVE~1\AppData\Local\Temp\claude\C--Users-mlloveras2-Documents-Claude\392f7e71-179a-4e6c-a710-485cda5528a4\scratchpad\certr2\` (`adv-sena2`, `adv-anular`, `adv-com2`, `adv-cuenta`, `adv-rls`, `m1-adaptado`, `tienda`, `mb`).

## Pendientes

- Arreglar F1 antes del pase de CH, o que el dueño acepte el riesgo por escrito. **Una vez en producción, las señas mal cobradas no se recuperan solas.**
- Decidir F2 y F3: preexistentes, se pueden tratar aparte.
- Reparar los tests rotos sin defecto de producto. Primero `tienda-nueva-entrega` y `m1-caja-medios-postgres`, que hoy dejan plata y envíos sin cobertura.
- Cerrar B5 contra `_prisma_migrations` de producción, por quien tenga acceso.
- Revisar los procesos ajenos colgados.

---

# Vuelta 2 — diff `05d1810e..3912555e` (HEAD `3912555e`, contra `origin/main` `8d3057f5`)

Modo completo sobre este diff. Certificador independiente: no se corrigió nada. Lo anterior de la rama no se repitió.

**Veredicto: CON OBSERVACIONES.** El ALTO de la vuelta 1 (F1) quedó cerrado y ningún ataque de plata lo rompió. Queda un MEDIO que entró con este diff (V2-1): recepción ve un dato de comisión que su rol no le da. No mueve plata, pero conviene arreglarlo antes del pase. Sigue habiendo 7 tests de navegador en rojo sólo en la rama.

## Hallazgos

### V2-1 · MEDIO · permisos, sin efecto en plata · nuevo en este diff — recepción ve el monto de la liquidación `[VERIFICADO]`

**Dónde:** `src/lib/actions.ts:1426` devuelve `avisoDeComisionYaPagada` sin mirar el rol. `src/lib/capabilities.ts:172-200`: RECEPTION no tiene `reports:read` ni `commissions:manage`.

**Caso** (`adv-v2`, test H, acción real y código real de la dueña): recepción anula un cobro de un turno ya liquidado y recibe «La comisión de este turno ya se pagó: Macarena cobró $14.400 el 01/11/2026 por 2 turnos, este entre ellos…». La misma recepción, en `getCommissionsOverview`, es redirigida.

**Efecto:** ve lo que cobró una compañera, y es el total de la liquidación, no sólo el de ese turno. Hace falta que la dueña le haya dado el código para ese cobro. Los importes no cambian.

**Arreglo sugerido:** dar el texto con nombre y monto sólo con `reports:read`. A los demás, «La comisión de este turno ya se pagó: avisale a la dueña».

### V2-2 · BAJO · estado, sin plata · código preexistente, ahora con seña en pie — un «Deshacer» viejo baja el turno a Reservado `[VERIFICADO]`

**Dónde:** `src/lib/turnos/cobro-actions.ts:737`. Cambia el estado sin mirar `anulacion.applied`. La misma condición está en `origin/main` (`:733`).

**Caso** (`adv-v2`, test E): seña 1, deshacer, seña 2 (turno CONFIRMED). Otro «Deshacer» de la seña 1 contesta `{ok:true}` y el turno queda PENDING con la seña 2 en pie. No queda auditoría. Libro y `Payment` no cambian (5.000).

**Cómo se llega desde la pantalla** `[POR LECTURA]`: la dueña en dos pestañas o equipos, con el aviso de la seña 1 todavía abierto en una y la anulación y el nuevo cobro hechos en la otra. Con un toque se vuelve a confirmar.

**Arreglo sugerido:** cambiar el estado sólo si `anulacion.applied`.

### V2-3 · BAJO · aviso incompleto — el corte de 50 puede esconder un caso real `[VERIFICADO]`

**Dónde:** `src/lib/reports/comision-ya-pagada.ts:88`. `take: 50` corta antes de filtrar en memoria, y sin decir que cortó.

**Caso** (`adv-v2b`, test K): 60 turnos recientes anulados y vueltos a cobrar, más uno anterior anulado de verdad. El aviso sale vacío. Sólo afecta al aviso, no a la plata.

**Arreglo sugerido:** filtrar antes de cortar, o decir «hay más».

## 1. Seña vuelta a cobrar: F1 cerrado

Todo con acciones reales, Postgres efímero y RLS. `senia-recobrada-postgres` pasó en la suite y 3 veces más: 8/8 cada vez.

| Ataque | Resultado |
|---|---|
| Devolver una seña recobrada (A) | Filas 5.000, −5.000, 5.000, −5.000. Neto del libro 0, `Payment` 0, un solo egreso por lo vigente. |
| Retener, deshacer la cancelación y tocar de nuevo (B) | No cobra. Libro 5.000, 3 asientos. |
| Recobrada, saldo dividido, comisión y factura (C1) | `senia:T:2`, `saldo:T:1`, `saldo:T:2`. Libro y `Payment` 18.000. Comisión 7.200 sobre 18.000. Factura 18.000. |
| Recobrada y `completeAppointment` (C2) | Clave `saldo:T`, libro 18.000, factura 18.000. Con factura autorizada, anular se rechaza. |
| Anular el saldo y volver a cobrar (C3) | Libro y `Payment` 18.000. |
| Carreras deshacer o anular contra cobrar (D, D2: 26 turnos con y sin desfase) | Siempre libro = filas = `Payment` ≤ 5.000. En 10 casos el toque quedó antes de la anulación: contesta «ya estaba cobrada», sin cobrar, y esa respuesta era cierta en ese orden. Después el turno se ve sin seña y se puede volver a tocar. No es falla. |
| Otro negocio con el id de un turno ajeno (F) | «Ese turno ya no existe». Nada escrito. |
| Día cerrado después de deshacer (I) | Rechaza con mensaje claro. No confirma ni escribe. |
| Cierre del día, doble toque, dos pestañas, varias vueltas | Cubiertos por `senia-recobrada-postgres`, y pasan. |

**Lectores de la clave** `[VERIFICADO por grep]`: el único que lee `Collection.idempotencyKey` por clave exacta es `cobro-turno-repo.ts:227`, que es el propio cobro. Facturación usa otra serie (`turno:<t>`, `mp:<pago>`). Reportes, comisión y cierre leen filas, `Payment` o libro. Ninguno busca `senia:<turno>`.

**Vecinos revisados:** `saldo:<turno>` no se reusa porque un turno COMPLETED no vuelve a terminarse. Los formularios de cobro regeneran su clave después de cada éxito (`AppointmentRow.tsx`, `CobrarTurno.tsx`).

## 2. Límites declarados por el ingeniero

| Límite | Dictamen | Por qué |
|---|---|---|
| Pestaña vieja tocada después de deshacer cobra de nuevo | **Aceptable** | Con el turno sin seña, una pantalla nueva ofrece el mismo botón con el mismo efecto. Queda un solo neto de 5.000 con su asiento, y el servidor no puede distinguir los dos casos. Con la seña vigente no cobra. |
| Seña subida con un cobro en pie: no cobra y confirma | **Aceptable, sólo a mano** | Reproducido con el pedido armado a mano (`amount=2000`, test G): no cobra, confirma y dice «ya estaba cobrada». **No se llega desde la pantalla:** `cobros.ts:98` sólo ofrece la seña con `cobrado === 0`, y una pestaña vieja con $5.000 se rechaza porque el monto no coincide (`cobro-dividido.ts:227`, `[POR LECTURA]`). |

## 3. Aviso de comisión

- **No toca plata** `[VERIFICADO]`: el módulo sólo lee. Liquidaciones iguales antes y después de anular (test H). `comision-ya-pagada-postgres` pasa, incluido el libro.
- **Escribe sólo auditoría:** `comisionYaPagada` en `void_collection`, fuera de la transacción. Si la lectura falla, la anulación ya quedó firme.
- **Textos:** no hay vocabulario de estética en el aviso ni en la pantalla (`[POR LECTURA]`; el test del aviso lo controla).
- **Costo:** con 10.000 turnos, 134 ms la primera lectura y 16 ms la segunda (test K). Liviano.
- **Permisos:** ver V2-1. Comisiones y Reportes siguen protegidos por `reports:read`.

## 4. Tests viejos: ninguno se aflojó `[VERIFICADO]`

| Test | Lectura del diff |
|---|---|
| `m1-caja-medios-postgres` | **Ejecuta de verdad:** una copia marcada pasó por los 11 tramos y llegó al final, incluidos cierre, doble envío, reabrir y aislamiento. El asiento pasa a `EGRESO TRANSFERENCIA 500`, igual que la copia adaptada de la vuelta 1. «Sin el valor del enum» ya no corre contra la base; la regla sigue en `m1-caja-medios.test.ts:44-51`. |
| `armazon-head.json` | Mismos enlaces y mismo texto en los 5 casos. Sólo cambian `lg:min-h-10`, `lg:py-[7px]` y la firma con su isotipo. |
| `mi-turno` | Sigue con `deepEqual` exacto y agrega `depositAmount`. El precio sigue sin viajar. |
| `corte-inicial`, `MesDelEstudio` | Cambio de etiqueta y de clase. Los montos y la tecla de 44 px en celular siguen controlados. |
| `guardia-bundle-cliente` | Sólo normaliza el separador de ruta. |
| `pos-peso` | Lee donde vive hoy el front. Sólo agrega tolerancia a un salto de línea. |
| `reserva-publica-postgres` | Mejora: el caso «sin nota» ahora se ejercita. No establecí por qué las franjas 8 y 10 se pisan en la rama y no chocaban antes. |

## 5. Corridas

| Corrida | Resultado |
|---|---|
| `npx tsc --noEmit` | Exit 0 |
| `next build` (con `DATABASE_URL` local, sin `.env`) | Exit 0. No hizo falta renombrar `.next/cache`. |
| Suite completa, 815 archivos, sin `demo-local` (excluido por precaución, sin comprobar que se cuelgue) | 7.597 tests: pass 7.546, **fail 49**, skip 2 |
| Zona de plata (caja, turnos, cobros, comisión, facturar, cierre, libro), 128 archivos, medida sobre la suite | pass 1.136, fail 1 (`links-y-clientes-postgres`, p95 de 367 ms contra 300; también falla en main) |
| Los 28 archivos con fallas, en `8d3057f5` | pass 174, fail 42 |

**Comparación por test: 42 fallan en ambas, 7 sólo en la rama, 0 sólo en main.**

Las 42 de ambas: `vercel-build` (10), `seed/acceso-comun-lab` (4), `club/cuenta-y-buffet-pantalla` (3), `design/hoja` (2), `seed/seed-postgres` (2), `tenant` (2), y 1 cada una: `cuaderno-postgres`, `eventos` emitir y vuelta 4, 5 y 6, `integraciones/contrato`, `integraciones/redaccion`, `arca-procesador-sin-operador-postgres`, `club/anonimizar`, `club/estado-postgres`, `links-y-clientes-postgres`, `reminder-sweep-postgres`, `redondeos-locales`, `ensayo-lote-neon`, `facturacion/motor-postgres`, `rechazo-de-dominio`, `reset-golive-postgres`, `seguridad-hallazgos`, `sitio-estatico`. No busqué la causa de cada una.

## 6. Navegador

Corrió con `.efr/_pw-shell.mjs` al primer intento, en la suite y otra vez sin carga. Las **7 fallan igual en las dos corridas**. Son las 7 únicas que fallan sólo en la rama:

| Test | Error | Causa |
|---|---|---|
| `tienda-nueva-entrega-navegador` (5) | `w.__montar is not a function` | La de la vuelta 1: el arnés no tiene falso de `next/font`. |
| `magra-bolsa-navegador` (1) | El pie termina en 5021 y la barra empieza en 780 | La de la vuelta 1: `scroll-behavior:smooth` (`magra/estilos.ts:350`). En main no hay un test con ese nombre. |
| `alta-producto` (1) | `selectOption` agota el tiempo | La de la vuelta 1: `9192396b` sacó la opción por peso. |

Este diff no toca `src/app/tienda` ni `src/lib/stock`. Son las mismas firmas de error, pero **no repetí las copias adaptadas de la vuelta 1**, que habían pasado 5/5 y 8/8. Los envíos de MG-032/034/036 siguen sin protección en la suite. `vender-pantalla` pasa: 99 tests, sin fallas.

## 7. Distancia con main

`git rev-list --count HEAD..origin/main` = **0**. A la rama no le falta nada, y lleva 223 commits propios.

## Lo que no probé

- El aviso de comisión en navegador: el dibujo en el cajón y en la lista lo leí y lo controla un test estático, pero no lo vi en pantalla. Tampoco recorrí la agenda clic por clic.
- MP real y ARCA real: se usó el stub de ARCA, y la seña por MP se probó como medio de cobro manual, sin aviso de Mercado Pago.
- El camino degradado (columna sin migrar) sólo por lectura: no se escribe clave ni libro.
- Una base migrada desde producción: B5 de la vuelta 1 sigue abierto.
- `src/tenants/breakpoint/turnero/demo-local.test.ts`, excluido de la suite.
- F3 (Taller en día cerrado) no estaba en este diff y sigue abierto.

## Entorno, vuelta 2

- `C:\r2` quedó limpio salvo este archivo. La suite reescribió `.qa/facturacion-escala/rendimiento*.txt`, y los restauré.
- Worktree temporal `C:\cr2m`, ya eliminado. No toqué `C:\pg16`, `C:\reportes` ni `C:\ch-uat`, y no maté procesos ajenos.
- Tests adversariales, fuera del repo: `C:\Users\MLLOVE~1\AppData\Local\Temp\claude\C--Users-mlloveras2-Documents-Claude\392f7e71-179a-4e6c-a710-485cda5528a4\scratchpad\adv\adv-v2.test.ts` y `adv-v2b.test.ts`.

## Pendientes, vuelta 2

- Arreglar V2-1 antes del pase de CH.
- Decidir V2-2 y V2-3: son bajos.
- Reparar los 7 tests de navegador. Primero `tienda-nueva-entrega`.
- Decidir F3 y cerrar B5, que siguen de la vuelta 1.

---

# Vuelta 3 — diff `bece4ef2..444bd0b2` (HEAD `444bd0b2`)

Modo completo sobre este diff: toca ventas, caja y facturación. Certificador independiente: no se corrigió nada. Hallazgos de origen leídos sólo en «Venta de productos, bece4ef2» del INFORME de UAT.

**Veredicto: CON OBSERVACIONES.** La plata aguantó todos los ataques: stock, libro, caja y reportes dan igual que el negocio de control, al vender y al anular. No hay ALTOS. Quedan dos MEDIOS: el silencio de la factura (V3-1) y que `main` avanzó durante esta corrida y la mezcla da conflictos (V3-2).

**Estado de `main`** `[VERIFICADO]`: al arrancar, `origin/main` era `bece4ef2`. **Durante la corrida avanzó 56 commits, hasta `63b4469c`.** Las comparaciones de esta vuelta son contra `bece4ef2`, la base pedida.

**Migraciones** `[VERIFICADO]`: `git diff --name-only bece4ef2..444bd0b2 -- prisma` da vacío. Este diff no tiene.

## Hallazgos

### V3-1 · MEDIO, y ALTO el día que un negocio pase a real sin arreglarlo · factura — un negocio que quiere facturar y tiene un dato mal queda sin factura y sin aviso `[VERIFICADO]`

**Dónde:** `src/lib/actions.ts:2247` y `src/lib/turnos/cobro-actions.ts:160`. Toda `PerfilFiscalIncompletoError` pasa a `sin-factura`. Ese error no sólo significa «todavía no factura»: cubre todos los casos de `src/lib/fiscal.ts:158-232`.

**Caso** (`adv-v3-perfil`): negocio con el módulo `arca`, ARCA en stub, 9 perfiles por los 3 caminos (`completeAppointment`, `terminarYCobrarDividido`, `cobrarVariosTurnos`). Perfiles: CUIT con dígito mal, CUIT placeholder, CUIT borrado, punto de venta borrado, punto de venta en cero, condición consumidor final, condición desconocida, ya en real sin condición, ya en real sin punto de venta.

**Resultado en los 27 casos:** turno COMPLETED, `aviso` null, 0 facturas y log de nivel `warn`. Antes del diff era `fallo`, con aviso y log `error`.

**¿Hay otro lugar donde lo vea la dueña?** Ninguno avisa. Lo que hay:

| Lugar | Qué muestra | Etiqueta |
|---|---|---|
| Facturación (`EstadoArca.tsx:22-28`) | CUIT y punto de venta en crudo. Con el dígito mal dice `CUIT 20-11111111-3`, sin advertencia. «Sin punto de venta» sí lo dice, si entra a mirar. La condición de IVA no aparece. | `[VERIFICADO]` el estado; `[POR LECTURA]` el dibujo |
| Inicio, «Para arrancar» (`facturacion-lista.server.ts:25`) | Sólo mientras nunca cerró un día. Mira 11 dígitos: el CUIT con dígito mal da «configurado». No mira la condición. | `[VERIFICADO]` |
| Inicio, Facturar (`InicioRenglon.tsx:330-338`) | Puede decir «Nada pendiente: 0 … sin rechazos». Tranquiliza de más. | `[POR LECTURA]` |
| Libro IVA | Cuenta «Turno cobrado» sin comprobante (32 en la prueba). **Una dueña como CH no lo ve:** pide `perfilMin` y el perfil es null (`visibles.ts:201`). | `[VERIFICADO]` |
| Monitor (`monitor-core.ts:234`) | Sólo para la cartera del contador, y no ve dígito mal, consumidor final, condición desconocida ni real sin condición. | `[VERIFICADO]` |
| Consola, pase a real (`pase-a-real.ts:258`) | Sí detecta todo, pero es del operador y hay que entrar a mirar. | `[POR LECTURA]` |

**Por qué MEDIO y no ALTO hoy:**
- Producción tiene ARCA en homologación: hoy nada tiene validez fiscal (dato del brief).
- `arcaHomologacion=false` sólo se escribe en el pase a real (`pase-a-real.server.ts:294`, encontrado por grep), que controla CUIT, punto de venta y condición.
- La consola rechaza un CUIT con dígito mal (`cuit-input.ts`).

**Cómo se llega igual a real con un dato mal:** el operador borra el CUIT o el punto de venta después del pase (`interpretarCuitInput` acepta «limpiar», `setTenantArcaPuntoVenta` acepta vacío). No probé esos botones; simulé el estado en la base. Desde ahí los turnos salen sin factura y nadie se entera.

**Lo que agrava:**
- No encontré forma de facturar después esos turnos: `facturarAppointment` sólo se llama al terminar el turno y desde Mercado Pago. Eso ya era así, pero antes se avisaba en el primer turno.
- `aviso-factura.ts:3-5` dice que el aviso nació porque recepción «se enteraba días después», y `operator-actions.ts:262` llama a este caso «el más caro». El diff vuelve a esa situación para esta clase de error.
- El test nuevo fija el silencio con `arcaHomologacion: false` (`factura-perfil-incompleto-postgres.test.ts`, `perfilIncompleto`). Ese estado es el de un negocio ya pasado a real, no el de «todavía no factura». `[A VALIDAR]` el estado real de CH en producción: se cierra leyendo su fila desde la consola; no toqué Neon.

**Lo pedido que sí cumple** `[VERIFICADO]`:
- `facturar` sigue en sí por defecto, y con `facturar=false` no hay factura en los dos caminos que lo leen. `cobrarVariosTurnos` no lee ese campo.
- Perfil completo: 1 factura sin aviso, en los 3 caminos.
- Otro error (corte simulado en la base): sigue el aviso y el log `error`, también en `cobrarVariosTurnos`, que no tenía prueba propia.

**Arreglo sugerido:** callar sólo cuando el dato está AUSENTE (no inválido), el negocio sigue en homologación y no tiene el módulo `arca`. En los demás casos, `fallo`. Si molesta repetirlo en cada turno, que lo vea la dueña una vez en el Inicio y no recepción. Decidirlo antes del primer pase a real.

### V3-2 · MEDIO · proceso, no defecto del diff — `main` avanzó y la mezcla tiene 2 conflictos `[VERIFICADO]`

`bece4ef2..origin/main` son 56 commits de MIA y Proyectos, con 4 migraciones nuevas. `git merge-tree` (sólo lectura) da conflicto en `caja/page.tsx` y `layout.tsx`, los dos tocados por esta rama. Se mezcla solo `src/apps/visibles.ts`.

**Riesgo:** al resolver `layout.tsx` hay que conservar `barraDeCH` junto con lo nuevo de la barra de `main`. **Este dictamen no cubre la mezcla.** No establecí si esas migraciones están aplicadas ni qué commit corre hoy en producción.

### V3-3 · BAJO · navegación, sin plata — «Pedido» con «Ya está cobrado»: el enlace lleva a Cerrados, donde no está `[VERIFICADO]`

**Dónde:** `nucleo-de-venta.tsx:1163` y `ventas/filtros.ts:29`. `nacioAbierta` sólo mira `aCuenta`.

**Caso** (navegador, `adv-v3-ui`): recepción, en el cajón, Pedido, «Ya está cobrado», Efectivo. La orden queda ONLINE, PENDING y cobrada. El enlace va a `?estado=cerrados#pedido-…`: 0 filas con esa venta, y el cajón se cerró. Está en Abiertos, a un toque.

**Observación:** es el mismo defecto que `444bd0b2` arregló para la venta a cuenta, y esa venta no se ofrece en una CH de perfil null: sólo la pude probar prendiendo `PROFILES_ENABLED` en el test.

**Arreglo sugerido:** decidir por el estado de la venta y no por `aCuenta`.

### V3-4 · BAJO · corrección — la venta más vieja que las últimas 20 no se puede anular desde ninguna pantalla `[VERIFICADO]`

**Dónde:** `order-actions.ts:152` y `:199`. El tope cuenta también las anuladas.

**Caso** (`adv-v3-venta`, V): con 21 ventas posteriores, la venta no está en Cerrados ni en Abiertos. CH no tiene Ventas del día, y no encontré otra pantalla con «Anular». El servidor la anula igual si recibe el id.

**Cuán grave:**
- Sólo afecta a la dueña: recepción anula sólo lo de hoy, y necesitaría más de 20 ventas cerradas en un día.
- Sin plata perdida. La salida es un egreso a mano y un ajuste de stock, pero la venta sigue contando en los reportes.
- Antes del diff la venta seguía abierta y anulable, así que para este caso es un retroceso.
- Con el volumen que el propio código atribuye a una estética (un puñado por día), son unos días de margen. `[A VALIDAR]` con el volumen real de CH.

**No frena el pase.** **Arreglo sugerido:** «Ver más» o buscar por número en Cerrados.

### V3-5 · BAJO · textos `[POR LECTURA]`

- **Otros rubros:** `vocabulario-negocio.ts:37` da `conVentasDelDia=false` a todo negocio sin rubro de comercio, no sólo a CH. Si uno de ellos tiene el módulo `pos`, lee «esta pantalla» en vez de «Ventas del día o Pedidos». Lo mismo pasa con «Anular la venta» en el título. Sólo cambia el texto. No establecí si hoy existe un negocio así.
- **Resto de «pedido» en CH:** `TableroPedidos.tsx:1100` («Pedidos cerrados recientes»), `:1117` («Entregado y cobrado») y el título de la pestaña («Pedidos»).
- **Cajón:** `MostradorEnCajon.tsx` también se cierra con los enlaces que abren otra pestaña («Abrir las ventas cerradas»). No pierde nada: el cajón queda montado.

## 1. Venta cobrada que nace cerrada: aguantó `[VERIFICADO]`

Todo con acciones reales, Postgres efímero y RLS, CH contra un negocio de control (`adv-v3-venta`: 9/9).

| Ataque | Resultado |
|---|---|
| Efectivo, Mercado Pago, Transferencia | CH DELIVERED, control CONFIRMED. Libro igual en cada medio: `VENTA EFECTIVO`, `VENTA MP`, `VENTA TRANSFERENCIA`. |
| Reporte de ventas y cierre del día completo | Iguales en los dos negocios. |
| Doble envío, seguido y 5 simultáneos | Una venta, un asiento, stock −1, DELIVERED. Un solo evento de cada tipo. |
| Venta a cuenta (con `PROFILES_ENABLED` en el test) | CONFIRMED en los dos, en Abiertos. Anular saca la deuda: queda `VOID` por $12.000. |
| Recepción sin código, con el código de otra venta, o de otro día con código | Rechazado. |
| Dueña de otro negocio, anular o autorizar con el id | Rechazado, y la venta sigue igual. |
| 3 anulaciones simultáneas | Un egreso, stock +1, las otras dos contestan «ya estaba anulada». |
| Egreso cargado a mano y después anular | Avisa la doble salida y pide confirmar (probado en CH; `doble-salida.ts:60` sólo distingue CANCELLED). |
| Avanzar, cobrar, entregar o editar una venta ya cerrada | No cobra dos veces ni cambia el estado. Libro igual. |
| Sin stock | No nace nada. |
| Sin cobrar, o con envío | No nace cerrada. |
| Facturar y luego anular (stub) | Igual que el control: factura y anular rechazado por la factura autorizada. |

- **Otros rubros:** `ventaNaceEntregada` exige `esEstetica` o `isRetail` (`venta-reglas.ts:631-641`). El control de servicios sigue CONFIRMED. El comercio lo cubre la prueba pura del ingeniero y `vender` en la suite.
- **Reportes que filtran por estado** `[POR LECTURA, por grep]`: ninguna lectura de reportes filtra `Order` por CONFIRMED. Las que miran «en curso» son la bandeja, el Inicio y el reparto.
- **Evento nuevo:** CH emite ahora `pedido.entregado@1` al vender. No encontré quién lo consuma fuera del catálogo. `[POR LECTURA]`
- **Punto nuevo de falla** `[POR LECTURA]`: `order-actions.ts:611` está fuera de `try`. Si ese paso fallara, la venta queda cobrada y CONFIRMED, y el reintento la encuentra sin cobrar dos veces. No lo provoqué.

## 2. Anular por enlace

- **`?anular=` en Pedidos salió** `[VERIFICADO por grep]`: lo único que queda es `ventas/TablaDeVentas.tsx:64`, que es Ventas del día y sigue en uso en los otros rubros.
- **Cerrados y Abiertos:** venta cobrada a Cerrados y a cuenta a Abiertos, bien. El caso que falla es V3-3.
- **Muestra de congelamiento sobre `444bd0b2`** (build propio, `.efr/_medir-anular.mjs` con `_pw-shell`): **34 corridas, 0 congeladas.** 24 mezcladas (diseño nuevo y de siempre, las dos personas, 1366 y 390) y 10 más en el diseño de siempre con recepción. 32 anuladas bien en la base.
- **2 recorridos cortados, ninguno congelado:** el resumen del arnés los cuenta como 1/3 y 1/10. Fue en la pestaña de la dueña: el código de «Autorizar anulación» no apareció, y la pantalla de recepción siguió viva. Con una prueba aparte (`adv-v3-autorizar`): tocando apenas carga, 1 de 15 se pierde y el segundo toque lo saca; esperando a que termine de cargar, 0 de 15. Mi lectura es que el toque llegó antes de que la pantalla estuviera lista: no lo demostré más allá de eso. No frena nada.

## 3. Retoques `[VERIFICADO en navegador, salvo lo indicado]`

| Punto | Resultado |
|---|---|
| «Cobrar una venta» | En Agenda y Caja para dueña y recepción. La profesional no lo ve y Caja la manda a no disponible. |
| «Sumar un producto» | Con `?cobrar=1&turno=`: abre el cajón con nombre y teléfono, la venta queda en la ficha de esa clienta, y el formulario se limpia al cobrar. Entré por la URL; el botón del turno lo controla un test estático. |
| `leerClientaDelTurno` | Es un endpoint nuevo. Otro negocio o id raro da null. Quien tiene `orders:manage` ya tiene `clients:read`: no abre una lectura nueva. |
| Menú | Diseño nuevo y de siempre: dueña con Comisiones y Vender, recepción con Vender y sin Comisiones. Ninguna ve Campañas ni Recordatorios en la barra. |
| Otros rubros | La barra pasa por `esEstetica`. `[POR LECTURA + barra-de-ch]` |
| Permisos | Sin cambios. `requireApp("comisiones")` sigue en la página (`[POR LECTURA]`): mi navegación sólo confirmó que abre sin error, no el rechazo. |

## 4. Tests: ninguno se aflojó `[VERIFICADO]`

Sólo se modificó `cuaderno-postgres`; los otros 8 del diff son nuevos. No se borró ninguno y no cambió ningún archivo de datos.

`cuaderno-postgres` queda más estricto: cada medio tiene su columna, y `TRANSFERENCIA` se espera en `TRANSFERENCIA`. Antes esperaba `MP`, por eso fallaba: en `bece4ef2` falla y en la rama pasa.

## 5. Corridas `[VERIFICADO]`

| Corrida | Resultado |
|---|---|
| `npx tsc --noEmit` | Exit 0 |
| `next build` (`DATABASE_URL` local, sin `.env`) | Exit 0. No hizo falta renombrar `.next/cache`. |
| Suite completa, 824 archivos, excluye `src/tenants/breakpoint/turnero/demo-local.test.ts` | pass 7.574, **fail 45**, skip 2 |
| Zona (ventas, stock, caja, anulación, reportes, facturación, turnos, menú), medida sobre la suite | pass 2.818, fail 6 |
| Los 28 archivos con fallas, en `bece4ef2` y otra vez en la rama sin carga | pass 171, fail 45 en cada uno |
| 8 archivos nuevos del diff | Todos pasan |

**Comparación por test contra `bece4ef2`: 45 fallan en ambas, 0 sólo en la rama, 0 sólo en main.**

- **Las 6 de la zona:** `piel-de-la-bandeja`, `arca-procesador-sin-operador-postgres`, `m1-caja-medios-postgres`, `caja/medio-cobro`, `facturacion/lista-postgres` (p95 de 332 ms contra 300), `facturacion/motor-postgres`. No busqué la causa de cada una, salvo la siguiente.
- **`piel-de-la-bandeja` es CRLF, confirmado:** falla en `C:\r2`, con finales CRLF, y pasa 3/3 en una copia del mismo commit sin conversión.
- **Las 7 de navegador de la vuelta 2** ya no fallan.

## Lo que no probé

- La mezcla con `63b4469c` (V3-2).
- ARCA y Mercado Pago reales: ARCA en stub y nada emitido. Tampoco probé una base de producción ni el estado real de CH.
- Día cerrado contra esta venta: no cerré un día en mis pruebas. `[POR LECTURA]` la frontera no mira el estado.
- Pago mixto por pedido armado a mano: la pantalla no lo ofrece.
- «Sumar un producto» en el diseño de siempre y en celular, y el fallo del paso a Entregado.
- Las ventas CONFIRMED anteriores al pase: siguen abiertas, porque no hay migración. No medí cuántas son.
- `mostrador-ch.e2e` y `uat-ch.e2e`: no están en la suite y no los corrí. `demo-local`, excluido.

## Entorno, vuelta 3

- `C:\r2` quedó limpio salvo este archivo. La suite reescribió `.qa/facturacion-escala/rendimiento*.txt`, y los restauré. Se regeneró `.next`, que está ignorado.
- Worktrees temporales `C:\cr2m3` y `C:\cr2lf`: saqué las junctions primero y los eliminé con `git worktree remove`. `node_modules` y `src/generated` siguen en su lugar.
- No toqué `C:\pg16`, `C:\reportes`, `C:\ch-uat` ni la base e interruptores de `.efr`. No maté procesos.
- Pruebas fuera del repo, en `C:\Users\MLLOVE~1\AppData\Local\Temp\claude\C--Users-mlloveras2-Documents-Claude\392f7e71-179a-4e6c-a710-485cda5528a4\scratchpad\adv\`: `adv-v3-venta.test.ts`, `adv-v3-perfil.test.ts`, `adv-v3-ui.mjs`, `adv-v3-menu.mjs`, `adv-v3-autorizar.mjs`.

## Pendientes, vuelta 3

- Decidir V3-1 antes del primer pase a real; pasado eso es irreversible para los turnos que salgan sin factura.
- Mezclar con `main` y volver a correr esta zona antes de publicar. Push a `main` es deploy.
- Arreglar V3-3 (una línea) y decidir V3-4.
- Confirmar el perfil fiscal real de CH.
- Siguen abiertos V2-2, V2-3, F3 y B5. V2-1 no se miró en esta vuelta.
