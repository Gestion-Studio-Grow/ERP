NO SE PUDO RECORRER: (1) Autorizar hasta que no quede ningún pendiente. En modo prueba, el ARCA de laboratorio arma un contador nuevo en cada llamada (`lib/arca-dispatch.ts:132-133`, `plugins/arca/afip/stub.ts:61-69`). Desde la segunda tanda vuelve a pedir el número 1, que ya está guardado, y 19 envíos quedan trabados (P2002). «Queda autorizada» se vio en sólo 2 comprobantes, los dos con el número 1. (2) Volver a facturar un rechazado hasta el final: la venta sembrada no tiene cobro y la app frena con «Sólo se facturan las ventas cobradas o dejadas a cuenta» (`ventas/factura.ts:113`). (3) Mandar el link por WhatsApp, copiarlo o pagarlo (Mercado Pago en modo prueba). (4) CH con volumen: en erp_lab tiene 0 comprobantes y 0 links antes y después, y la regla prohíbe sembrarle datos. «Sin pérdida» es 0 = 0. (5) «Probar la conexión con ARCA». (6) La lista de links a escala en pantalla: hay 8 links; la escala de links sólo se midió en el test contra Postgres.

# QA vuelta 2 — Facturación a escala (26/09/2026)

- **Server propio:** `next start` de producción en :3212 (PID 25315; log `/tmp/fac-server-3212-2.log`). El de la vuelta 1 (PID 25792) se apagó por PID. Build `/tmp/fac-build-2.txt`: EXIT 0. Entorno `env-lab.sh` (rol con RLS, RLS prendido), base `erp_lab`.
- **Datos:** se deshizo la siembra de la vuelta 1 y se volvió a sembrar en Tornillo. La siembra es determinística y da las mismas cifras. **El deshacer de la vuelta 1 no andaba** (trigger de inmutabilidad del 25/09): se corrigió y se probó. Qué hay, qué cambió y cómo deshacerlo: `datos-lab.md`.
- **Evidencia en `qa-2/`:**
  - 98 capturas de página completa.
  - `pasos.jsonl`: 79 pasos, cada uno con consola, errores de JS y respuestas HTTP ≥ 400. En total, 1 error de consola y 1 HTTP 404: es el PDF de Tornillo pedido a propósito desde Don Tito.
  - Los CSV bajados.
  - `logs/`: resumen por recorrido (`res-*.txt`), tiempos y tests.
- **Scripts:** `recorrido.mjs`, `recorrido-2.mjs`, `extra-390.mjs`, `clientes-390.mjs`, `tiempos.mjs`, `aislamiento.mjs`, `ch.mjs` y `tactil.mjs`. Todos entran con usuario y clave; la clave va por variable y nunca se imprime (`correr.sh`).
- **Diseños:** viejo = interruptor apagado (como está Tornillo). Nuevo = «Renglón»: se prendió para recorrerlo y se volvió a apagar.
- **Resultado:** pasan 16 de 19 (15 pasos del viaje y 4 chequeos de código). Fallan el paso 10 (autorizar) y `npm test`; el paso 11 quedó incompleto.

## Chequeos de código
- `tsc`: 0 errores (`qa-2/logs/fac-tsc-2.txt`).
- `eslint --max-warnings=0` sobre los 41 archivos tocados o nuevos: 0 (`fac-eslint-2.txt`; la lista, en `fac-tocados-2.txt`).
- `next build`: EXIT 0.
- `npm test` (`/tmp/fac-npm-test-2.txt`; resumen en `qa-2/logs/npm-test-resumen.txt`): 4.301 tests, 4.293 pasan, **8 fallan**:
  - las 4 conocidas de XLSX;
  - **2 de ENG-012** (`src/lib/arca-envios-por-negocio-postgres.test.ts:72`), que corridas solas también fallan, 2 de 2 (`fac-npm-test-2-aislados.txt`);
  - «links de cobro y lista de clientes a escala… p95 < 300 ms»: dio 344,5 ms con la máquina cargada por el recorrido; sola pasa;
  - «Ingreso en el navegador»: inestable conocido; solo pasa, 5 de 5.

## Viaje: «el dueño de una ferretería con 5.000 comprobantes y 2.000 clientes entra a Facturación, encuentra, filtra, exporta, autoriza y cobra» (diseño viejo y nuevo, 1440 y 390)

| # | Paso | Qué esperaba | Qué pasó | Evidencia |
|---|---|---|---|---|
| 1 | Entrar y abrir Facturación. Viejo: menú lateral; a 390, «Abrir menú». Nuevo: menú a 1440; a 390, «Ver facturas emitidas» del Inicio | La lista del mes con los totales de todo el filtro | 943 comprobantes del 01/09 al 30/09 · 877 autorizados $329.658.447,34 · 47 pendientes $26.549.827,99 · 19 rechazados $13.028.609,29: igual a la siembra, al centavo. 50 renglones, «1–50 de 943». Del clic a la lista: 464–499 ms. Consola limpia, 0 px de desborde | `viejo-1440-01`, `viejo-390-01`, `nuevo-1440-01`, `nuevo-390-01` |
| 2 | Tiempo de la lista: 5 cargas con la máquina quieta | TTFB < 300 ms | TTFB mediana (máx.): mes 68–78 ms (87); rechazadas 78–100 (104); «monica perez» 52–97 (103); CUIT 63–72 (186); número 66–70 (85); página 15: 72–85 (102); rechazadas de todos los meses 76–93 (107). Carga completa ≤ 523 ms. Filtrar desde la pantalla (Enter → lista): mediana 579–725 ms, máx. 766 | `logs/tiempos-*.txt` |
| 3 | Buscar el número «0005-00001685», abrirlo y volver con Atrás | 1; al volver sigue la búsqueda | 1 en los 4 recorridos. Atrás deja la búsqueda y el renglón | `*-buscar-numero`, `*-detalle-por-numero` |
| 4 | Buscar el CUIT «30-71555888-9», «30715558889» y el nombre «Ñandú» | 21; el total por nombre, igual que por CUIT | 21 las tres veces: 19 autorizados, $32.989.085,50. En la vuelta 1, por nombre daba $33.255.368,85: **corregido** | `res-rec-*.txt` |
| 5 | Buscar «Mónica Pérez», «monica perez», el DNI «27888999» y «PERALTA CAROLINA» | 35 / 35 / 35 / 2 | 35 / 35 / 35 / 2 en los dos diseños y los dos anchos. En la vuelta 1, sin tildes daba 0: **corregido** | `*-buscar-monica-perez`, `res-rec-*.txt` |
| 6 | Rechazadas del mes (filtro «Ver» y atajo) y abrir una | La lista con su motivo; en el detalle, el motivo y qué hacer | 19 rechazadas; 33 después de autorizar: igual que la base. Detalle: «Comprobante rechazado por ARCA», «Por qué lo rechazó ARCA: 10242: …», «Cómo seguir», botones «Facturar» y «Ver los rechazados». En la vuelta 1 decía «autorizado por ARCA» y no tenía salida: **corregido** | `*-rechazada-detalle` |
| 7 | Página 2, página 3, Atrás, «Más nuevos», recargar y `?pagina=999` | Vuelve a la anterior; fuera de rango, la última | 51–100 y 101–150. Atrás → 51–100; durante 86–130 ms todavía se ve la 3. `?pagina=999` → «901–943 de 943» | `logs/tiempos-*`, `*-pagina-2` |
| 8 | Bajar el CSV del filtro y cotejarlo con la pantalla | La misma cantidad y el mismo total | Rechazadas: 19 filas / $13.028.609,29, y 33 / $23.442.345,22. Mes: 943 filas; cada estado igual a la pantalla al centavo; total $369.236.884,62; ningún total con formato raro | `*-rechazadas-mes.csv`, `viejo-1440-mes.csv` |
| 9 | Inicio: «Facturado del mes» | Igual a los autorizados de la lista | $329.658.447 en el viejo y $330.956.439 en el nuevo (ya con 2 autorizados más): los dos iguales a la lista. En la vuelta 1 sumaba las notas de crédito: **corregido** | `*-inicio` |
| 10 | Autorizar los pendientes (ARCA en prueba), con doble clic en el primer toque | Que un toque mande los N que dice el botón | 1.er toque, «Autorizar los 59 pendientes»: «Se mandaron 18 comprobantes a ARCA: 2 autorizados, 16 rechazados. ARCA no respondió a 2. Quedan 41 pendientes: probá de nuevo en unos minutos.»<br>2.º toque: «7… ARCA no respondió a 13. Quedan 34».<br>3.º: «3… no respondió a 17. Quedan 31».<br>Diseño nuevo a 390: «Se mandó 1… no respondió a 19. Quedan 30».<br>En la base, esos «no respondió» son 19 envíos con «La base de datos no aceptó la operación (código P2002)». El doble clic mandó una sola tanda (18 + 2 = 20) | `viejo-b-1440-*-autorizar-*`, `nuevo-b-390-*-autorizar-1`, `logs/res2-viejo-1440.txt` |
| 11 | Rechazado por la regla del inscripto → tocar «Facturar» | Que se vuelva a mandar, o que diga qué hacer | Motivo: «… Emitila desde ARCA o consultá a tu contador». «Cómo seguir»: «Corregí lo que marca ARCA … y volvé a facturar la venta con el botón de acá abajo». Al tocar «Facturar»: «Sin factura: Sólo se facturan las ventas cobradas o dejadas a cuenta» y aparece «Reintentar». La venta sembrada no tiene cobro | `nuevo-extra-390-03/04` |
| 12 | Cobrar con link: primero vacío, después «QA escala …» por $12.345,67 | Aviso si falta algo; el link aparece en la lista | Vacío: el viejo marca los 2 campos con el aviso del navegador; el nuevo, con un aviso propio. Con datos: «Link de cobro listo» en 178 ms, arriba de «Links generados» sin recargar; sigue al recargar y el buscador lo encuentra. Anduvo 4 de 4 | `*-link-*`, `res2-*` |
| 13 | Buscar un cliente entre 2.000 | La encuentra con y sin tildes | Viejo: «2.000 clientes registrados»; Mónica, «35 compras» (en la vuelta 1, «0 turnos»: **corregido**); TTFB 75–78 ms. Nuevo: «2000 fichas»; «Frecuente · 33 compras» (en la vuelta 1, «Nunca vino»: **corregido**). A 390, barra de abajo → hoja → «Clientes» → «monica perez»: 436 ms hasta ver la fila | `*-clientes*`, `nuevo-clientes-390-*` |
| 14 | Aislamiento: el dueño de Don Tito busca lo de Tornillo | Nada | Nombre, CUIT, banco, número e importe de Tornillo: 0. El comprobante de Tornillo por su id: «404»; su PDF: 404. CSV con «Ñandú»: sólo la cabecera; del año: sus 3. Links con «QA escala»: «No hay links que coincidan». Clientes: 0 | `aislamiento-B-1440-*`, `logs/aislamiento*.txt` |
| 15 | CH con la dueña, sólo mirar | Lo de siempre | Facturación abre en «Cobrar con link», como antes (0 links); la pestaña Comprobantes muestra 0. TTFB 38–110 ms; consola limpia; 0 px de desborde. En la base: 0 comprobantes y 0 links antes y después. En la vuelta 1 abría en la lista: **corregido** | `ch-1440-*`, `ch-390-*` |

**Los 7 bloqueantes de la vuelta 1:** 6 corregidos y recorridos (detalle del rechazado, tildes, nombre en la nota de crédito, CH, «Facturado del mes», visitas en Clientes). Autorizar sigue roto, ahora por otra causa.

## Rompe el viaje
1. **Autorizar los pendientes nunca termina, y la pantalla culpa a ARCA de un error nuestro.**
   - Qué se vio: 59 → 41 → 34 → 31 → 30 pendientes. 19 envíos se traban con P2002: la base rechaza el número fiscal repetido, porque el índice único es `(tenantId, puntoVenta, tipoComprobante, numero)`. Van hasta 4 intentos, y los autorizados de prueba tienen el número 1 en cada punto de venta.
   - Causa del choque: es previa al slice. En modo prueba se crea un ARCA simulado en cada llamada (`lib/arca-dispatch.ts:132-133`) con el contador en memoria (`plugins/arca/afip/stub.ts:61-69`).
   - Lo que es del slice: el aviso llama «ARCA no respondió a N… probá de nuevo en unos minutos» a cualquier falla (`lib/facturacion/autorizar-en-tandas.ts:58` y `:80`), y corta la tanda. El dueño reintenta un error que reintentar no arregla, y nunca llega a «Nada pendiente de autorizar».
   - Evidencia: pasos «autorizar» en `pasos.jsonl`; en la base, `OutboxEvent.lastError` de los envíos `qavol-ob-*`.
2. **`npm test` tiene 2 fallas fuera de las 4 aceptadas: ENG-012, el test de aislamiento de «Autorizar».**
   - La acción ahora devuelve `quedan` (`lib/facturacion-actions.ts:175-181`), y el test compara la forma exacta (`src/lib/arca-envios-por-negocio-postgres.test.ts:72`; el archivo no se tocó).
   - El comportamiento aislado sigue bien: A procesa 1 y B queda intacto. Pero la guarda de aislamiento de esta acción está en rojo.
   - Evidencia: `logs/npm-test-resumen.txt` y `logs/fac-npm-test-2-aislados.txt`, 2 de 2 corriéndolas solas.
3. **La consulta nueva `quedan` cuenta pendientes sin negocio explícito** (`lib/facturacion-actions.ts:179`: `prisma.invoice.count({ where: { status: "PENDING" } })`).
   - Depende sólo del interruptor de RLS: `prisma` es el cliente con RLS únicamente si `RLS_ENFORCEMENT` está prendido (`lib/db.ts:29`). Con RLS apagado, suma los pendientes de todos los negocios y se los muestra al dueño, que así infiere el volumen de otros.
   - Con RLS prendido no vi fuga: en el test ENG-012, A ve `quedan: 0` con 1 pendiente de B. En el laboratorio no se puede probar ni descartar desde la pantalla: sólo Tornillo tiene pendientes (30 en total = 30 de Tornillo).
   - Criterio incumplido: ni negocio explícito ni `tenantTransaction`, y su único test de aislamiento está en rojo (punto 2).

## Molesta pero se puede seguir
- **Rechazado por la regla del inscripto (ENG-024):** «Cómo seguir» dice «volvé a facturar la venta con el botón» (`lib/facturacion/detalle-core.ts:59`), pero el motivo dice «Emitila desde ARCA o consultá a tu contador». Volver a facturar da el mismo rechazo.
- **Clientes, dos números para la misma clienta:** 35 compras en el diseño viejo (y 35 pedidos entregados en la base), 33 en el nuevo, bajo el mismo encabezado «compras».
  - El nuevo cuenta sólo dentro de la ventana de historial del CRM (`clientes/page.tsx:74`, `lib/crm/lecturas.ts:40-41`).
  - El viejo cuenta todas (`lib/clientes/lista-fichas.server.ts:76`).
- **Dos cifras de pendientes que no coinciden:** el botón dice «Autorizar los 59 pendientes» y el total del mes, «47 pendientes». Es ESC-07, abierto.
- **Inicio, «Facturas emitidas 910 / 159 · 0 disponibles este mes»:** cuenta los pendientes como emitidas (879 autorizados + 31 pendientes). El cupo del plan lo decide el dueño.
- **Diseño nuevo a 390:**
  - «Facturas» no está en la barra de abajo.
  - «Clientes» abre una hoja (un toque más) cuyas descripciones hablan de «turnos» y de «avisos de turno por WhatsApp» en una ferretería (`apps/catalogo/comercial.ts:61` y `:155`).
  - `/admin/clientes?q=…` abierta directo tiene dos `<main>`, uno dentro del otro (`logs/tiempos-nuevo-390-b.txt`). Entrando por la hoja, tiene uno.
- **Diseño nuevo, consola:** advertencia «archivo-latin.woff2 was preloaded … but not used» en Facturación y Clientes. Es una advertencia, no un error.
- **Diseño nuevo, Clientes con resultados:** la red no queda en reposo en 30 s (31,5 s con «Mónica Pérez» contra 2,4 s con «Ñandú»). La fila aparece en 436 ms, así que el usuario no lo nota. No se midió qué es lo que sigue pidiendo.
- **Textos de otro rubro:** el vacío de Clientes en Don Tito dice «Las fichas se crean solas cuando alguien reserva un turno…».
- **CSV:** se llama igual filtres lo que filtres: «comprobantes-2026-09-01_a_2026-09-30.csv» para las rechazadas y para el mes entero.
- **Detalle:** dice «Documento 33700425148» en vez de «CUIT 33-70042514-8».
- **Links:** el estado de los links con monto a mano se llama «Ver en Mercado Pago» (ESC-02, abierto).
- **Toque chico a 390:** el enlace «Facturación automática» del pie de Facturación mide 154×18 (diseño viejo). Fuera de eso, 0 toques de menos de 44 px en la lista, en Cobrar con link y en Clientes.
- **Herramienta de QA:** el deshacer de la vuelta 1 no andaba desde el trigger de inmutabilidad del 25/09. Se corrigió en `sembrar-volumen.mjs` y se probó.

## Anduvo (exactamente lo que se probó)
- **La lista del mes, a 1440 y 390, en los dos diseños:** cantidades y sumas por estado iguales a la siembra al centavo, 50 por página, sin desborde, consola limpia. TTFB ≤ 107 ms (≤ 186 ms en el peor caso aislado) y lista pintada ≤ 766 ms después de filtrar.
- **Buscar:** por número con punto de venta; por CUIT con y sin guiones; por DNI; por nombre con y sin tildes; por el nombre que trae el banco. El total por nombre es igual al total por CUIT.
- **Rechazadas del mes:** por el filtro y por el atajo; el motivo en la lista y en el detalle, con salida («Facturar», «Ver los rechazados», «Volver a Facturación»).
- **CSV:** el de las rechazadas (19 y 33 filas) y el del mes (943) coinciden con la pantalla al centavo y por estado.
- **Paginación:** enlaces, Atrás del navegador, recargar y página fuera de rango.
- **Autorizar, sólo la mecánica:** el doble clic manda una sola tanda; los conteos y el botón se actualizan sin recargar; el ARCA de prueba autorizó 2 y rechazó 27 con su motivo (regla del inscripto, fecha fuera de los 5 días, falta el régimen de Factura A).
- **Cobrar con link:** en los dos diseños y anchos; el aviso si falta algo; el link aparece arriba sin recargar, sigue al recargar y el buscador lo encuentra.
- **Clientes entre 2.000:** con y sin tildes y por nombre de empresa, en los dos diseños. A 390, desde la barra de abajo del diseño nuevo.
- **Inicio:** «Facturado del mes» igual a la lista en los dos diseños.
- **Aislamiento desde Don Tito:** ni búsqueda, ni id, ni PDF, ni CSV, ni links, ni clientes dejan ver o inferir nada de Tornillo.
- **CH con la dueña:** Facturación abre en cobros como antes; las dos pestañas, sin errores y sin desborde a 390; 0 comprobantes y 0 links antes y después.
