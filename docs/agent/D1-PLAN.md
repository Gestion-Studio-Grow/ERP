# D1 · El dinero pasa a decimal con moneda: plan ejecutable

**Qué es.** El plan de ENG-011 (dinero en decimal y con moneda) y de ENG-109 (una sola regla de
redondeo), que ENG-011 necesita primero. **ADR:** `docs/adr/ADR-100-dinero-en-decimal.md`
(reemplaza a ADR-057). **Decisión del dueño:** D1 → A, 2026-09-24 (`DECISIONS.md` §5.0).
**Base medida:** commit `08b4563`. "Árbol" es el árbol de trabajo del 2026-09-25, con el
rediseño (ADR-099) sin commit. **Estado:** plan, revisión 2 (método de migración del dueño). Este archivo no toca código ni schema,
y no hay nada aplicado en ninguna base real.

**Revisión 1 (2026-09-25).** Dos revisiones refutaron la versión anterior y tenían razón en lo
central: la reversa devolvía el respaldo en filas que el sistema reescribió después de migrar (un
cobro de CH volvía a la seña: reproducido), los costos unitarios no vienen todos al centavo
(`stock/supplier-return.ts:102`), la verificación comparaba el redondeo contra sí mismo, y PF
frenaba la prueba de ARCA que el dueño ordenó. Lo que cambió lleva **(rev. 1)**. Qué dijo cada
revisión y dónde quedó está en §9.

**Revisión 2 (2026-09-25): expandir y contraer, el método del dueño.** `DECISIONS.md` §5.0
(`:201-203`) dice «expandir y contraer, con reversa probada»; la rev. 1 lo había reemplazado por un
cambio en el lugar, y el dueño aprobó el 25/09 mantener su método. La rev. 2 reescribe §0 y §5,
el criterio común de las porciones (§6), P0 (criterios 12 a 16), P1, P5 y el paso final (ahora
M-D1-C), y resuelve las siete objeciones abiertas de ENG-011 (`BACKLOG.md`). Prototipo medido en
Postgres local: `.qa/rec-2509/disenos-variantes-d1/`. Lo que cambió lleva **(rev. 2)**. En las
secciones sin esa marca, «respaldo `<campo>_float`» se lee como «la columna `Float` original, que
queda viva y al día hasta M-D1-C», y «cambio de tipo de la porción» como «expansión E + lectura L»
(§5.1).

---

## 0. El veredicto

**(rev. 2) Se puede pasar la plata a decimal sin cortar a CH por expandir y contraer, porción por
porción: una columna `numeric` nueva al lado de cada `Float`, un espejo en la base que mantiene
las dos iguales mientras conviven, un relleno que frena si una fila no entra y espera la decisión
del dueño, la lectura desde la nueva en un deploy de código aparte, y el borrado de las `Float` al
final, con su propio OK. Hasta ese borrado, volver atrás es sólo el código: la `Float` tiene todo lo
que CH cobró en el medio.**

La rev. 1 había descartado este método con tres mediciones ciertas del prototipo, no del método
(el `DEFAULT 0` de la columna nueva, `predeploy-check` sin `@map`, y que ninguna contracción deja
arrancar al código viejo). Cómo se resuelve cada una, con lo medido, está en §5.1.

**(rev. 1) Lo que cambió respecto de la versión anterior:**

1. **(reemplazado por la rev. 2, §5.1)** **La reversa** usaba el respaldo aunque la fila hubiera cambiado después de migrar. Ahora lo usa
   sólo si la fila sigue valiendo lo mismo; si no, se queda con el valor vigente. Medido con
   escrituras en el medio: la seña que pasó a cobro total queda en $12.000, el precio aumentado
   queda aumentado y las filas que nadie tocó vuelven bit por bit (§5.4). Y va como **migración
   nueva**, no como un SQL suelto, para que `_prisma_migrations` y `predeploy-check` sigan de
   acuerdo con la base.
2. **Los decimales.** Los importes van a `numeric(14,2)` y los **costos unitarios a
   `numeric(18,6)`**: `supplier-return.ts:102` guarda un costo promedio con 6 decimales y el
   reintegro al proveedor sale de él (§3.3, R2). Una fila con más decimales de los que entran
   **frena la migración** hasta que el dueño la autoriza por id (estándar §10); antes se
   redondeaba sin avisar.
3. **La verificación** compara cada fila contra su valor de antes (la Float leída como decimal),
   no contra su propio redondeo, y el bloque apaga `row_security`: si el rol que migra está sujeto
   a RLS, falla en vez de verificar sólo lo que ve y convertir la tabla entera (reproducido).
4. **ARCA.** La prueba en homologación que ordenó el dueño corre **ya**, con el formato de hoy: D1
   no la frena. PF vuelve a probar contra el simulador y en homologación cuando llegue, y el payload
   de la cola **sigue en números**, así que un *Instant Rollback* después de PF no rompe los envíos
   pendientes (§3.4).

---

## 1. Cómo se midió (y dónde está la evidencia)

`$D1` = `.qa/D1/medicion/` **(rev. 2)**: la evidencia se trajo del scratchpad de la sesión
(`/tmp/claude-0/…/scratchpad/d1`, temporal) al repo, sin `node_modules` ni las copias del árbol
(`.qa/D1/medicion/LEEME.txt`). P0 trae además como tests lo que sirve para medir (§6, P0).
Las bases locales de la medición (`erp_d1_*`, clones de `erp_perf` y `erp_lab` en el Postgres de
la máquina, puerto 5433) se borraron al terminar; los scripts las vuelven a crear.

| Qué | Cómo | Dónde |
|---|---|---|
| Lecturas de cada columna | 24 corridas de `tsc`: una por columna, con **sólo** esa columna en `Decimal @db.Decimal(14,2)` sobre una copia de `08b4563` (`git archive`). Cada error es un lugar que usa el importe como `number`. Más una corrida con todas a la vez en `08b4563` y otra en el árbol | `$D1/correr-col.sh`, `$D1/correr-wt.sh`, `$D1/runs/*.tsc.txt` |
| Escrituras | Recorrido del AST de TypeScript: toda llamada `*.<modelo>.create/update/upsert/createMany/…` y lo que hay en su `data`; los casos indirectos (`data` en una variable, `createMany` con `.map`) se resolvieron a mano | `$D1/escritores.cjs`, `$D1/escritores.tsv` |
| Redondeo | Barridos con el Decimal de Prisma contra `round2` (`src/lib/round.ts:18-20`) | `$D1/proto/medir-redondeo.mjs`, `$D1/proto/medir-round2-15.mjs` |
| Decimal hacia un Client Component | El serializador de React que trae Next 16.3.4 (`react-server-dom-webpack`), versiones de desarrollo y de producción | `$D1/proto/flight.cjs`, `$D1/proto/flight-dev.cjs` |
| Migraciones | Clones locales de `erp_perf` y `erp_lab` (Postgres 16.13): subir, bajar y volver a subir con huella de bits; `prisma migrate deploy` real sobre `erp_d1_migrate`, con una migración que falla a propósito | `$D1/proto/p*_*.sql`, `*.reversa.sql`, `m0-moneda*.sql`, `huella-bits.sql` |
| Código viejo y nuevo contra la misma base | Dos clientes de Prisma generados (schema de `08b4563` y schema con `Decimal`) escribiendo y leyendo la misma fila | `$D1/proto/compat-en-sitio.mts`, `en-sitio.mts`, `reversa-en-sitio.mts`, `clientes.mts` |
| Doble escritura (descartada) | Prototipo de expandir y contraer con trigger, probado con los dos clientes y bajo `app_rls` con RLS | `$D1/proto/m1-*.sql`, `expandir.sql`, `tras-contraer.mts` |
| Bundle | `esbuild --bundle --minify` del Decimal importado como lo importaría el módulo | `$D1/proto/entrada-cliente.ts`, `entrada2.ts` |
| **(rev. 1)** Plantilla revisada | Postgres 16.13 local: subir → escribir en el medio (filas viejas y nuevas) → bajar → comparar; la reversa anterior con la misma secuencia; fracción sin autorizar y autorizada; costo de 6 decimales; NaN; RLS forzado con un dueño sin `BYPASSRLS`. Y `prisma migrate deploy` en un proyecto mínimo: frena, se marca revertida, se autoriza el id y pasa; la reversa como migración nueva deja `migrate status` al día | `.qa/D1/rev1/probar.sh`, `.qa/D1/rev1/plantilla.sql.in`, `.qa/D1/rev1/reversa.sql.in`, `.qa/D1/rev1/probar-prisma.sh` |

---

## 2. (a) Inventario medido

### 2.1 Resumen

- **33 columnas de importe en `prisma/schema.prisma`: 24 `Float` y 9 `numeric(14,2)`.** 0 columnas
  de moneda. Hay 3 más en `prisma/pending-gate2/CarniceriaRubro.sql` (`:37` `Product.cost`, `:62`
  `ProductBatch.unitCost`, `:109` `ProcessingRun.inputCost`), en `DOUBLE PRECISION`. **(rev. 1)**
  Dos de las 24 son costos unitarios (`StockMovement.unitCost`, `StockPurchaseItem.unitCost`) y
  van a `numeric(18,6)`, igual que `Product.cost` y `ProductBatch.unitCost` (§3.3, R2). Y hay plata
  dentro de un JSON: `Invoice.ivaDesglose` (§2.3).
- **Lecturas que `tsc` encuentra:** 195 lugares en 74 archivos (unión de las 24 corridas, sobre
  `08b4563`). Con todas las columnas a la vez: 202 errores en 73 archivos en `08b4563` y 221 en 75
  en el árbol: el rediseño suma 19.
- **Escrituras:** 64 lugares en 26 archivos de `src`, más 38 en 9 seeds y scripts. **(rev. 1)** El
  recorrido del AST no vio tres: `scripts/fix-magra-mock-prices-2026-07-07.ts:101` (escribe
  `Product.price` o `pricePerKg` con una clave calculada, `{ [c.field]: c.to }`),
  `prisma/rls/aislamiento-capa-app.ts:360-361` (`Product.pricePerKg`) y el DDL propio de
  `prisma/rls/verify-async-tenant-isolation.mts:81-103` (§2.4). Las filas que se **reescriben**
  después de creadas están en §2.8.
- **Las 9 columnas decimales se leen como `number`:** 40 llamadas a `.toNumber()` (sin contar
  comentarios) en 18 archivos y 6 copias de un conversor tolerante (§2.3).
- **Redondeos a mano.** `grep -rnE '\*\s*100\)\s*/\s*100\b' src` (sin tests ni `round.ts`) da 26
  en `08b4563` y 37 en el árbol, **pero no los ve todos (rev. 1):** se le escapan
  `caja/import-caja.ts:247`, `catalogo/aumento-core.ts:160`, `catalogo/precios-auditoria.ts:127`,
  `stock/supplier-return.ts:102` (con `1e6`) y, sin commit, `fiscal/decidir-comprobante.ts:457` y
  `contador-wa/mensajes.ts:85`. Con un patrón amplio (`Math.round|floor|ceil|trunc(` con `* 100`,
  `* 1000` o `* 1eN`, `.toFixed(`, y divisiones por 100 o `1eN` al final de la línea) hay 91
  coincidencias en `08b4563` y 117 en el árbol; incluyen cantidades, porcentajes y minutos, que no
  son plata. Por eso el criterio de P0 deja de ser un número de `grep` (P0 c3). `round2` se llama
  224 veces en 45 archivos.
- **En pantalla:** 0 de los 125 Client Components de `08b4563` (0 de 156 en el árbol) importan
  tipos de `generated/prisma`. 50 nombran importes. Todo importe llega como `number` desde una
  página de servidor ([P] en las tablas).
- **Escritas y nunca leídas** (0 lecturas en su corrida de `tsc`): `Appointment.discountAmount`
  (se escribe en `actions.ts:364`) y `StockPurchaseItem.lineTotal` (`purchase-core.ts:422`). Es un
  dato, no un defecto de D1: se migran igual.

Leyenda de las tablas: **[P]** componente de servidor (página, *route handler* o `.tsx` sin
`"use client"`), que es donde el importe pasa a un Client Component o a la respuesta. **†** archivo con cambios sin commit en el árbol (el
rediseño u otro frente): sus líneas son las de `08b4563` y pueden moverse. Las líneas de las
lecturas son las que marca `tsc`: el primer lugar donde el tipo choca. Al arreglarlo pueden
aparecer usos más adentro.

### 2.2 Las 24 columnas `Float`, agrupadas por porción

**P1 · caja y cobros**

| Columna (schema) | Escriben en `src` | Escriben seeds y scripts | Lecturas | Dónde leen (`tsc`) |
|---|---|---|---|---|
| `CashMovement.amount` `:1304` | `src/lib/caja/cash-sale.ts:151`; `src/lib/caja/cobro-turno.ts:149`; `src/lib/caja-actions.ts:143,264`; `src/lib/commission-actions.ts:263`; `src/lib/libro-caja-actions.ts:407`; `src/lib/order-anulacion.ts:430`; `src/lib/settlement/collection-repo.ts:177`; `src/lib/stock/purchase-core.ts:519`; `src/lib/stock/supplier-return.ts:314`; `src/lib/turnos/anulacion.ts:483`; `src/lib/cierre-diario-actions.ts:454`† | `prisma/rls/aislamiento-capa-app.ts:240`; `scripts/corte-inicial.ts:312`; `scripts/import-caja-historica.ts:438` | 22 | `scripts/corte-inicial.ts:146,180`; `scripts/import-caja-historica.ts:221,266`; `src/app/admin/(dashboard)/caja/page.tsx:333`[P]†; `src/lib/caja-actions.ts:229`; `src/lib/cierre-diario-actions.ts:229,238,255,427,435`†; `src/lib/cierre-mes/paquete-lectura.ts:70,81`; `src/lib/libro-caja-actions.ts:173,244,495`; `src/lib/multilocal/multilocal-actions.ts:417`; `src/lib/multilocal/multilocal-core.ts:474,496,504`†; `src/lib/order-anulacion.ts:430,439` |
| `CashSession.openingFloat` `:1261` | `src/lib/caja-actions.ts:138` | — | 2 | `src/app/admin/(dashboard)/caja/page.tsx:333`[P]†; `src/lib/caja-actions.ts:234` |
| `CashSession.closingExpected` `:1269` | `src/lib/caja-actions.ts:241` | — | 1 | `src/app/admin/(dashboard)/caja/page.tsx:349`[P]† |
| `CashSession.closingCounted` `:1270` | `src/lib/caja-actions.ts:242` | — | 1 | `src/app/admin/(dashboard)/caja/page.tsx:350`[P]† |
| `CashSession.closingDiff` `:1271` | `src/lib/caja-actions.ts:243` | — | 3 | `src/app/admin/(dashboard)/caja/page.tsx:341,342,354`[P]† |
| `Payment.amount` `:713` | `src/lib/turnos/anulacion.ts:412`; `src/lib/turnos/cobro-turno-repo.ts:261,262` | — | 26 | `src/app/admin/(dashboard)/clientes/[id]/page.tsx:49`[P]; `src/app/admin/(dashboard)/turnos/lista/page.tsx:128,169,184,195`[P]; `src/app/admin/(dashboard)/turnos/page.tsx:165`[P]; `src/apps/kpis/finanzas.server.ts:268`; `src/lib/actions.ts:1450,1489,1546,1680,1856,2061`; `src/lib/cierre-diario-actions.ts:325`†; `src/lib/cierre-mes/lectura.ts:136`; `src/lib/commission-actions.ts:179,181`; `src/lib/crm/cargas.server.ts:146`; `src/lib/invoice-from-appointment.ts:43`; `src/lib/libros/libro-iva-loader.ts:134`; `src/lib/turnos/anulacion.ts:558`; `src/lib/turnos/cobro-turno-repo.ts:191,198,205,213,280` |
| `CommissionPayout.amount` `:675` | `src/lib/commission-actions.ts:196` | — | 1 | `src/lib/commission-actions.ts:114` |

**P2a · servicios y turnos**

| Columna (schema) | Escriben en `src` | Escriben seeds y scripts | Lecturas | Dónde leen (`tsc`) |
|---|---|---|---|---|
| `Service.price` `:503` | `src/blueprints/agenda/index.ts:59`; `src/blueprints/generico.ts:38,41`; `src/blueprints/oficios/index.ts:51`; `src/blueprints/servicios.ts:26,35`; `src/lib/catalog-actions.ts:175,209` | `prisma/seed-qa-tenants.ts:142,143`; `prisma/seed.ts:50,53,56,59,62` | 28 | `scripts/test-public-scope.ts:78`; `src/app/(site)/page.tsx:108`[P]†; `src/app/(site)/reserva/page.tsx:25`[P]; `src/app/(site)/servicios/page.tsx:73`[P]; `src/app/admin/(dashboard)/catalogo/page.tsx:147`[P]; `src/app/admin/(dashboard)/pedidos/page.tsx:196`[P]†; `src/app/admin/(dashboard)/turnos/lista/page.tsx:126,153,169,184,195`[P]; `src/app/admin/(dashboard)/turnos/page.tsx:165`[P]; `src/app/admin/(dashboard)/vender/page.tsx:73`[P]†; `src/lib/actions.ts:324,1108,1227,1324,1680,1708,1856`; `src/lib/cierre-diario-actions.ts:323`†; `src/lib/cierre-mes/lectura.ts:136`; `src/lib/client-actions.ts:196`; `src/lib/commission-actions.ts:179`; `src/lib/crm/cargas.server.ts:146`; `src/lib/crm/lecturas.ts:71`; `src/lib/invoice-from-appointment.ts:43`; `src/lib/waitlist-actions.ts:288` |
| `Service.residentPrice` `:508` | `src/lib/catalog-actions.ts:176,209` | — | 10 | `src/app/(site)/page.tsx:109`[P]†; `src/app/(site)/reserva/page.tsx:25`[P]; `src/app/(site)/servicios/page.tsx:73`[P]; `src/app/admin/(dashboard)/catalogo/page.tsx:147`[P]; `src/app/admin/(dashboard)/pedidos/page.tsx:196`[P]†; `src/app/admin/(dashboard)/turnos/lista/page.tsx:153`[P]; `src/app/admin/(dashboard)/vender/page.tsx:73`[P]†; `src/lib/actions.ts:324`; `src/lib/client-actions.ts:196`; `src/lib/waitlist-actions.ts:288` |
| `Service.depositAmount` `:514` | `src/lib/catalog-actions.ts:177,209` | — | 10 | `src/app/(site)/reserva/page.tsx:25`[P]; `src/app/admin/(dashboard)/catalogo/page.tsx:147`[P]; `src/app/admin/(dashboard)/pedidos/page.tsx:196`[P]†; `src/app/admin/(dashboard)/turnos/lista/page.tsx:153,169,184,195`[P]; `src/app/admin/(dashboard)/turnos/page.tsx:165`[P]; `src/app/admin/(dashboard)/vender/page.tsx:73`[P]†; `src/lib/client-actions.ts:196` |
| `Appointment.priceAtBooking` `:628` | `src/lib/actions.ts:361`; `src/lib/waitlist-actions.ts:300` | `prisma/seed-qa-tenants.ts:154`; `scripts/test-public-scope.ts:78` | 19 | `src/app/admin/(dashboard)/turnos/lista/page.tsx:126,169,184,195`[P]; `src/app/admin/(dashboard)/turnos/page.tsx:165`[P]; `src/lib/actions.ts:377,382,1108,1227,1324,1680,1708,1856`; `src/lib/cierre-diario-actions.ts:323`†; `src/lib/cierre-mes/lectura.ts:136`; `src/lib/commission-actions.ts:179`; `src/lib/crm/cargas.server.ts:146`; `src/lib/crm/lecturas.ts:71`; `src/lib/invoice-from-appointment.ts:43` |
| `Appointment.discountAmount` `:636` | `src/lib/actions.ts:364` | — | 0 | — |

**P2b · mostrador y vidriera**

| Columna (schema) | Escriben en `src` | Escriben seeds y scripts | Lecturas | Dónde leen (`tsc`) |
|---|---|---|---|---|
| `Order.subtotal` `:1188` | `src/lib/order-anulacion.ts:913`; `src/lib/order-core.ts:690` | `prisma/seed-magra.ts:194,203`; `prisma/seed-qa-tenants.ts:114`; `scripts/demo.mts:239` | 7 | `src/app/admin/(dashboard)/pedidos/page.tsx:320`[P]†; `src/app/admin/(dashboard)/ventas/page.tsx:314,323`[P]†; `src/lib/order-actions.ts:511`; `src/lib/order-anulacion.ts:910`; `src/lib/order-core.ts:212`; `src/lib/respuesta-al-reintento.ts:60` |
| `Order.discount` `:1189` | `src/lib/order-anulacion.ts:913`; `src/lib/order-core.ts:691` | `prisma/seed-magra.ts:194,203`; `prisma/seed-qa-tenants.ts:114`; `scripts/demo.mts:240` | 12 | `src/app/admin/(dashboard)/pedidos/page.tsx:137,321`[P]†; `src/app/admin/(dashboard)/ventas/page.tsx:314,323`[P]†; `src/lib/order-actions.ts:511,679`; `src/lib/order-anulacion.ts:834,910,919`; `src/lib/order-core.ts:214`; `src/lib/respuesta-al-reintento.ts:60,78` |
| `Order.total` `:1190` | `src/lib/order-anulacion.ts:913`; `src/lib/order-core.ts:692` | `prisma/seed-magra.ts:194,203`; `prisma/seed-qa-tenants.ts:114`; `scripts/demo.mts:241` | 31 | `src/app/admin/(dashboard)/clientes/[id]/FichaUnica.tsx:247`[P]; `src/app/admin/(dashboard)/pedidos/page.tsx:237,301,346,365,405,421`[P]†; `src/app/admin/(dashboard)/ventas/page.tsx:165,166,314`[P]†; `src/apps/kpis/finanzas.server.ts:258`; `src/apps/kpis/logistica.server.ts:150`; `src/apps/kpis/mostrador.server.ts:120`; `src/lib/actions.ts:2101,2102`; `src/lib/cobros-actions.ts:158`; `src/lib/crm/cargas.server.ts:156`; `src/lib/crm/lecturas.ts:85`; `src/lib/invoice-from-order.ts:36`; `src/lib/libros/libro-iva-loader.ts:134`; `src/lib/order-actions.ts:511,680,1187`; `src/lib/order-anulacion.ts:918`; `src/lib/order-core.ts:213,1083,1086,1151`; `src/lib/respuesta-al-reintento.ts:60,78,87` |
| `OrderItem.unitPrice` `:1232` | `src/lib/order-core.ts:710,721,734`; `src/lib/order-anulacion.ts:892,902` | `prisma/seed-magra.ts:196,204`; `prisma/seed-qa-tenants.ts:115`; `scripts/demo.mts:244` | 6 | `src/app/admin/(dashboard)/pedidos/page.tsx:323`[P]†; `src/app/admin/(dashboard)/ventas/page.tsx:314`[P]†; `src/lib/order-actions.ts:511`; `src/lib/order-anulacion.ts:816`; `src/lib/respuesta-al-reintento.ts:60,78` |
| `OrderItem.lineTotal` `:1233` | `src/lib/order-core.ts:711,722,735`; `src/lib/order-anulacion.ts:893,903` | `prisma/seed-magra.ts:196,204`; `prisma/seed-qa-tenants.ts:115`; `scripts/demo.mts:244` | 8 | `src/app/admin/(dashboard)/pedidos/page.tsx:291,323`[P]†; `src/app/admin/(dashboard)/ventas/page.tsx:314`[P]†; `src/lib/order-actions.ts:511,678`; `src/lib/order-anulacion.ts:816`; `src/lib/respuesta-al-reintento.ts:60,78` |
| `Coupon.value` `:744` | `src/lib/coupon-actions.ts:67` | — | 13 | `src/app/admin/(dashboard)/catalogo/page.tsx:169`[P]; `src/app/admin/(dashboard)/promociones/page.tsx:50`[P]; `src/lib/actions.ts:342`; `src/lib/coupon-actions.ts:136,144,145,179,181,192,197,203`; `src/lib/order-core.ts:398,405` |
| `Product.price` `:556` | `src/blueprints/gastronomia/index.ts:35`; `src/blueprints/generico.ts:46,49`; `src/blueprints/retail/index.ts:35`; `src/lib/catalog-actions.ts:410,417`; `src/lib/catalogo/planilla-core.ts:604,617`; `src/lib/stock/alta-producto.ts:87` | `prisma/seed-magra.ts:127`; `prisma/seed-qa-tenants.ts:94`; `scripts/fix-magra-data-2026-07-07.ts:175,189`; `scripts/fix-magra-mock-prices-2026-07-07.ts:101` (rev. 1) | 34 | `prisma/seed-qa-tenants.ts:109,115`; `scripts/demo.mts:215`; `scripts/fix-magra-mock-prices-2026-07-07.ts:86`; `src/app/admin/(dashboard)/catalogo/page.tsx:49,73,153`[P]; `src/app/admin/(dashboard)/catalogo/planilla/route.ts:38`[P]; `src/app/admin/(dashboard)/despiece/page.tsx:62`[P]; `src/app/admin/(dashboard)/pedidos/page.tsx:194`[P]†; `src/app/admin/(dashboard)/vender/page.tsx:92`[P]†; `src/app/operador/(console)/cockpit/page.tsx:107`[P]; `src/app/operador/(console)/tenants/[id]/page.tsx:255`[P]; `src/app/tienda/page.tsx:104,121,152,161`[P]†; `src/apps/kpis/precios.server.ts:50,129`; `src/lib/carniceria/despiece-registro.ts:62`; `src/lib/catalog-actions.ts:420`; `src/lib/catalogo/planilla-actions.ts:71`; `src/lib/catalogo/planilla-core.ts:607`; `src/lib/catalogo/precios-actions.ts:129`; `src/lib/catalogo/precios-tx.ts:63`; `src/lib/multilocal/catalogo-marca-core.ts:166`; `src/lib/order-actions.ts:646`; `src/lib/order-anulacion.ts:817`; `src/lib/order-core.ts:463,502`; `src/lib/reports/margen-lectura.ts:77,78,80`; `src/lib/reports/margin-loader.ts:50` |
| `Product.pricePerKg` `:557` | `src/blueprints/gastronomia/index.ts:31`; `src/blueprints/retail/index.ts:31`; `src/lib/catalog-actions.ts:410,417`; `src/lib/catalogo/planilla-core.ts:604,617`; `src/lib/stock/alta-producto.ts:87` | `prisma/seed-magra.ts:126`; `prisma/seed-qa-tenants.ts:93`; `scripts/fix-magra-data-2026-07-07.ts:176,190`; `scripts/fix-magra-mock-prices-2026-07-07.ts:101`; `prisma/rls/aislamiento-capa-app.ts:360-361` (rev. 1) | 34 | `prisma/seed-qa-tenants.ts:109,115`; `scripts/demo.mts:215`; `scripts/fix-magra-mock-prices-2026-07-07.ts:86`; `src/app/admin/(dashboard)/catalogo/page.tsx:49,73,153`[P]; `src/app/admin/(dashboard)/catalogo/planilla/route.ts:38`[P]; `src/app/admin/(dashboard)/despiece/page.tsx:62`[P]; `src/app/admin/(dashboard)/pedidos/page.tsx:194`[P]†; `src/app/admin/(dashboard)/vender/page.tsx:92`[P]†; `src/app/operador/(console)/cockpit/page.tsx:107`[P]; `src/app/operador/(console)/tenants/[id]/page.tsx:255`[P]; `src/app/tienda/page.tsx:104,121,152,161`[P]†; `src/apps/kpis/precios.server.ts:50,129`; `src/lib/carniceria/despiece-registro.ts:62`; `src/lib/catalog-actions.ts:420`; `src/lib/catalogo/planilla-actions.ts:71`; `src/lib/catalogo/planilla-core.ts:607`; `src/lib/catalogo/precios-actions.ts:129`; `src/lib/catalogo/precios-tx.ts:63`; `src/lib/multilocal/catalogo-marca-core.ts:166`; `src/lib/order-actions.ts:646`; `src/lib/order-anulacion.ts:817`; `src/lib/order-core.ts:463,502`; `src/lib/reports/margen-lectura.ts:77,78,80`; `src/lib/reports/margin-loader.ts:50` |

**P3 · compras**

| Columna (schema) | Escriben en `src` | Escriben seeds y scripts | Lecturas | Dónde leen (`tsc`) |
|---|---|---|---|---|
| `StockPurchase.totalCost` `:1414` | `src/lib/stock/purchase-core.ts:412` | `prisma/seed-magra.ts:148,161`; `scripts/demo.mts:143` | 5 | `src/app/admin/(dashboard)/compras/page.tsx:135`[P]; `src/app/admin/(dashboard)/proveedores/[id]/page.tsx:124`[P]; `src/apps/kpis/logistica.server.ts:171`; `src/lib/libros/libro-iva-loader.ts:153`; `src/lib/suppliers/supplier-repo.ts:173` |
| `StockPurchaseItem.unitCost` `:1444` | `src/lib/stock/purchase-core.ts:421` | `prisma/seed-magra.ts:151,152,153,164,165` | 15 | `src/app/admin/(dashboard)/compras/page.tsx:145,147`[P]; `src/app/admin/(dashboard)/despiece/page.tsx:57`[P]; `src/apps/kpis/logistica.server.ts:64`; `src/apps/kpis/precios.server.ts:50`; `src/lib/catalogo/precios-lectura.ts:74`; `src/lib/devoluciones/loader.ts:43`; `src/lib/inventory/inventory-loader.ts:73,103`; `src/lib/reports/margen-lectura.ts:67`; `src/lib/reports/margin-loader.ts:45`; `src/lib/reports/resultado-lectura.ts:157`; `src/lib/stock/purchase-core.ts:385`; `src/lib/stock/supplier-return.ts:246`; `src/lib/suppliers/devoluciones.ts:83` |
| `StockPurchaseItem.lineTotal` `:1445` | `src/lib/stock/purchase-core.ts:422` | `prisma/seed-magra.ts:151,152,153,164,165` | 0 | — |

**P4 · stock**

| Columna (schema) | Escriben en `src` | Escriben seeds y scripts | Lecturas | Dónde leen (`tsc`) |
|---|---|---|---|---|
| `StockMovement.unitCost` `:1485` | `src/lib/stock/ledger.ts:193,228`, que guardan lo que les pasan. **(rev. 1)** Entre ellos `src/lib/stock/supplier-return.ts:102` → `:259`: un costo promedio con **6 decimales** (3 × $1.000 + 4 × $1.001 da 1000.571429), que `ledger.ts:183-193` no reemplaza porque no viene vacío | — | 18 | `prisma/rls/aislamiento-capa-app.ts:466`; `src/app/admin/(dashboard)/despiece/page.tsx:57`[P]; `src/app/admin/(dashboard)/inventario/movimientos/page.tsx:137`[P]; `src/app/admin/(dashboard)/proveedores/[id]/page.tsx:154`[P]; `src/apps/kpis/logistica.server.ts:64,146,222`; `src/apps/kpis/precios.server.ts:50`; `src/lib/catalogo/precios-lectura.ts:74`; `src/lib/inventario/merma-loader.ts:73`; `src/lib/inventory/inventory-loader.ts:73,103`; `src/lib/reports/margen-lectura.ts:67`; `src/lib/reports/margin-loader.ts:45`; `src/lib/reports/resultado-lectura.ts:157`; `src/lib/stock/supplier-return.ts:384,393`; `src/lib/suppliers/supplier-repo.ts:168` |

### 2.3 Las 9 columnas que ya son `numeric(14,2)`

La base guarda exacto; el código lo vuelve `number` al leer y sigue en float. Se pasan al módulo
en la porción que las usa (§6).

| Columna (schema) | Escriben | Leen |
|---|---|---|
| `Invoice.neto`, `iva`, `total` `:957-959` | `invoice-core.ts:149`, `:152` (`round2` de una suma en float), `:154` | `facturacion-actions.ts:111-113`, `libros/libro-iva-loader.ts:126-128`, `cartera-core.ts:371`, `cierre-mes/paquete-lectura.ts:154,162,169` (todos por un conversor tolerante); leen facturas además `ventas/page.tsx`†, `order-actions.ts`, `reports/resultado-lectura.ts`, `cierre-mes/lectura.ts`, `apps/kpis/finanzas.server.ts` |
| `MovimientoImportado.monto` `:1113` | `bancos-actions.ts:235`, `mercadopago-auto.ts:151` | `bancos-glue.ts:598,684` |
| `Collection.amount` `:1579` | `debts/payable-service.ts:218`, `settlement/collection-repo.ts:104`, `turnos/anulacion.ts:397,568`, `turnos/cobro-turno-repo.ts:205,223` | ver `.toNumber()` abajo |
| `AccountPayable.amount` `:1642` | `debts/payable-service.ts:45` | ídem |
| `PayableCheque.amount` `:1674` | `debts/payable-service.ts:122` | ídem |
| `AccountReceivable.amount` `:1701` | `debts/receivable-service.ts:51` | ídem |
| `Tenant.bancosUmbralIdentificacion` `:279` | `bancos-actions.ts:582` | `bancos-glue.ts:248`, `facturacion/bancos/configuracion/page.tsx:56` (`Number(...)`), `mercadopago-auto.ts:266` |

**(rev. 1) Plata dentro de un JSON: `Invoice.ivaDesglose`** (`schema.prisma:963`). Lo escribe
`invoice-core.ts:153` (copia de `input.iva`: base e importe por alícuota, ya redondeados por el
Core) y lo lee `libros/libro-iva.ts:237-238` con `Number()`, así que un Decimal o un texto no lo
rompen en silencio. Regla, igual que `AuditLog` y el payload de ARCA: en un JSON la plata va como
`number` de `aNumero` (§3.5).

**Las 40 llamadas a `.toNumber()`** (sin comentarios): `debts/payable-repo.ts:76,106,111,151,154,169,177,185`;
`debts/payable-service.ts:87,88,114,199,200,285`; `debts/receivable-repo.ts:59,80,117,120,138`;
`debts/receivable-service.ts:97`; `turnos/anulacion.ts:351,359,544,619`;
`settlement/collection-repo.ts:72,220`; `turnos/cobro-turno-repo.ts:154`;
`crm/cargas.server.ts:202,209,210`; `cierre-diario-actions.ts:306`†; `cierre-mes/lectura.ts:140`;
`commission-actions.ts:179`; `stock/supplier-return.ts:284`; y una dentro de cada conversor.
**Los 6 conversores** ("Decimal o number → number"): `facturacion-actions.ts:52`,
`libros/libro-iva-loader.ts:53`, `bancos-glue.ts:71`, `debts/resumen-cuentas.ts:99`,
`cartera-core.ts:251`, `cierre-mes/paquete-lectura.ts:44`. Ejemplo de la cuenta en float después
de leer exacto: `debts/payable-service.ts:88` suma los cheques con `reduce` sobre `.toNumber()`.

### 2.4 Lo que `tsc` no ve: la segunda escritura y la lectura silenciosa

**Escrituras por otro camino:**
- **SQL crudo.** `src/lib/catalogo/planilla-core.ts:617-624` escribe `Product.price` y
  `pricePerKg` con `${precios}::double precision[]`. Por ahí pasan la planilla
  (`catalogo/planilla-actions.ts:123`), el aumento de precios (`catalogo/precios-tx.ts:106`) y el
  catálogo de la marca hacia los locales (`multilocal/catalogo-marca-core.ts:227`). Con la
  columna en `numeric` sigue andando (Postgres convierte al asignar, por 15 cifras), pero el
  precio pasa por float: en P2b cambia a `::numeric[]` con el texto de `aBase`.
- **Alta de negocio.** Los blueprints escriben precios al provisionar: `src/blueprints/agenda/index.ts:59`,
  `oficios/index.ts:51`, `servicios.ts:26,35`, `generico.ts:38,41,46,49`, `retail/index.ts:31,35`,
  `gastronomia/index.ts:31,35`.
- **Scripts y seeds** (38 escrituras en 9 archivos, en las tablas de §2.2). Escriben `number` y la
  base lo guarda al centavo, así que no se rompen. Los que además leen y suman
  (`scripts/corte-inicial.ts:146,180`, `scripts/import-caja-historica.ts:221,266`) pasan al módulo
  en P1.
- **SQL fuera de las migraciones:** `prisma/pending-gate2/CarniceriaRubro.sql` (§5.5) y los seeds
  de medición que va a juntar ENG-201 (`$AUD/seed-perf.sql`, `$AUD/stock-compras/seed-volumen.sql`).
- **(rev. 1) DDL propio de un test.** `prisma/rls/verify-async-tenant-isolation.mts:81-103` crea
  `Service` y `Appointment` con `double precision`: si P2a no lo pasa a `numeric`, ese test sigue
  probando el tipo viejo.

**Lecturas que compilan y se equivocan:**
- **SQL crudo.** `src/lib/stock/costo.ts:147-157` lee `m."unitCost"` e `i."unitCost"`. Con la
  columna en `numeric`, `$queryRaw` devuelve un **Decimal de Prisma** (medido: `typeof` da
  `object`), no un número ni un texto. `numeroONull` (`costo.ts:169-173`) lo convierte bien porque
  usa `Number(v)`; cualquier lector escrito a mano que haga `typeof v === "number"` o `v + x` se
  rompe en silencio. `carniceria/lotes-loader.ts:42` lee `b."unitCost"` sin castear y lo declara
  `number | null` (`:29`). `carniceria/product-extras.ts:36`, `inventory/inventory-loader.ts:43` y
  `costo.ts:147` castean a `::float8`: no se rompen, pero vuelven a float.
- **(rev. 1) La decisión del comprobante copia el formato de ARCA.** `fiscal/decidir-comprobante.ts:457`
  (frente D4, sin commit) cuenta centavos con `toFixed(2)` "redondeado como viaja a ARCA". Cuando
  PF cambie `soap.ts`, tiene que contar con el mismo módulo en el mismo commit, o la decisión y el
  XML dejan de ver el mismo importe (un 1,005 da 100 centavos con `toFixed` y 101 con R1).
- **JSON de `AuditLog`.** `src/app/admin/(dashboard)/auditoria/frase.ts:43` acepta sólo
  `typeof x === "number"`: un Decimal o un texto en una fila nueva borra el monto de la frase sin
  error. La regla del cupón vive en `AuditLog` (`order-core.ts:429-444`) y el ajuste y la
  anulación la leen para calcular plata (`order-anulacion.ts:489`, `:833-841`). Regla: en
  `AuditLog` la plata se guarda con `aNumero`, igual que las filas viejas.
- **Conversiones que compilan con un Decimal:** template strings (`${pedido.total}` da "1234.5",
  sin formato), `String()`, `Number()`, `.toLocaleString()` (Decimal no lo redefine: sale sin
  separador de miles) y `JSON.stringify`. En cada porción se buscan con
  `grep -nE '\$\{[^}]*\.(amount|total|subtotal|discount|price|pricePerKg|unitPrice|lineTotal|unitCost|totalCost|value)\b|String\(|Number\(|toLocaleString'`
  sobre los archivos de la porción, y se revisan una por una.
- **Un Decimal que llega a un Client Component.** En desarrollo React avisa en consola ("Only plain
  objects can be passed to Client Components from Server Components. Decimal objects are not
  supported."). **En producción pasa sin error, convertido a texto**: `{"total":"1234.5"}`
  (medido con el serializador de Next 16.3.4). En el cliente, `"1234.5" + 100` da `"1234.5100"`.
  La suite E2E corre contra `next start` (DECISIONS §3) y no lo vería. Por eso el borde tiene un
  tipo fijo (§3.5) y cada cargador que toca una porción lleva un test `sinDecimales`.

### 2.5 Cuentas del lado del cliente y lo que viaja a las pantallas

Lo que viaja: cada lectura marcada [P] en §2.2 es un componente de servidor que arma los datos de
un Client Component. Todas pasan `number` y las piezas nuevas del rediseño también lo esperan
(`components/ui/Plata.tsx:19`, `valor: number`). Las cuentas que se hacen en el navegador:

| Client Component | Líneas en `08b4563` | Qué calcula |
|---|---|---|
| `vender/VenderForm.tsx`† | 366, 378-379, 393, 691, 743 (en el árbol: 399, 411-412, 426, 724, 777) | renglón `round2(cantidad × precio)`, subtotal, cupón, vuelto; compara el total mandado con el grabado |
| `pedidos/PosForm.tsx` | 186-189, 334 | subtotal sin redondear por renglón |
| `pedidos/AjustarPedidoForm.tsx` | 87-101 | renglón, subtotal y total con `round2` |
| `compras/ComprasForm.tsx` | 175-177, 380 | total de la compra |
| `caja/CajaForms.tsx` | 130, 271 | diferencia del arqueo |
| `devoluciones-proveedor/DevolucionForm.tsx` | 76 | total de la devolución, sin redondear |
| `turnos/NewAppointmentForm.tsx` | 440 | precarga el monto a cobrar redondeado a **pesos enteros** (`Math.round`) |
| `turnos/AppointmentRow.tsx` | 135 | ídem |
| `clientes/duplicadas/UnificarGrupo.tsx` | 38 | suma el fiado de las fichas |
| `tienda/MagraFront.tsx`, `ShineFront.tsx`, `SiteReplica.tsx`, `Storefront.tsx` | 130-133; 181-184; 94-95; 172-176 | carrito: cantidad × precio y suma, sin redondear por renglón |
| Rediseño, sin commit: `caja/cierre/ContarYCerrar.tsx`, `tienda/vidriera/Ficha.tsx`, `tienda/vidriera/catalogo-core.ts` | 79; 64; 292, 300 | arqueo por medio de pago; renglón y subtotal de la vidriera nueva |

Hoy pantalla y servidor pueden diferir en un centavo en 2.711 de 3.300.066 renglones con precio
con centavos (medido, §3.3). Con el módulo en los dos lados, 0.

### 2.6 Lo que agrega el rediseño sin commit

- **19 errores de tipo más** con todas las columnas en `Decimal` (221 contra 202):
  `caja/CajaRenglon.tsx:188,194,201,241,249,250` (página de servidor que lee `CashMovement` y
  `CashSession` directo de Prisma), `inicio/pedidos-bandeja.server.ts:87`, y lugares nuevos en
  `pedidos/page.tsx` (+4), `ventas/page.tsx` (+2), `vender/page.tsx` (+1), `(site)/page.tsx` (+1) y
  `tienda/page.tsx` (+1).
- **9 redondeos a mano nuevos en 6 archivos:** `tienda/vidriera/catalogo-core.ts:54,292,300`,
  `caja/cierre/comprobante.ts:40,48`, `tienda/vidriera/Ficha.tsx:64`,
  `pedidos/pedidos-core.ts:347`, `cuentas-a-cobrar/bandeja-cuentas.ts:83`,
  `caja/cierre/ContarYCerrar.tsx:79`. Si usaran `round2` de `@/lib/round`, P0 los arreglaría sin
  tocarlos.
- **(rev. 1) Más archivos del rediseño que leen plata y no estaban en la lista.** La agenda nueva de
  Turnos, sin commit y en edición mientras se escribe esto: `turnos/agenda.server.ts` lee
  `priceAtBooking`, `Service.price`, `depositAmount` y `Payment.amount` (hoy `:70-78`),
  `turnos/agenda-core.ts` los tipa `number`, y `turnos/_agenda/CobrarTurno.tsx` cobra con decimales
  (`inputMode="decimal"`). Y `cuentas-a-pagar/[id]/page.tsx:70` hace la cuenta en float sobre
  `AccountPayable`: `round2(d.balance - committedChequeTotal(d.cheques))`. P1, P2a y P3 esperan su
  corte (§6.0).

### 2.7 Columnas `Float` que no son plata: siguen `Float`

Porcentajes: `Professional.commissionPercent` `:447`, `ProfessionalServiceCommission.commissionPercent`
`:805`. Cantidades: `Product.stock` `:544`, `Product.lowStockAt` `:545`,
`ServiceProduct.quantity` `:583`, `OrderItem.quantity` `:1231`, `StockPurchaseItem.quantity`
`:1443`, `StockMovement.qty` `:1484`, `StockMovement.balanceAfter` `:1486`. Y los kilos de
`CarniceriaRubro.sql` (`:60`, `:108`, `:131`). No son plata: entran al módulo por la regla R7
(15 cifras), que es exacta para lo que se puede tipear (tres decimales en kilos, dos en
porcentajes). La deriva de las cantidades sumadas en float (`Product.stock` con `increment`,
`ledger.ts:153,163`) **no se midió**: queda propuesta como slice aparte (ver `afuera`).

### 2.8 (rev. 1) Filas que el sistema reescribe después de crearlas

Es lo que la reversa tiene que respetar (§5.4). La versión anterior del plan suponía que después
de migrar sólo se crean filas; éstas se reescriben:

| Columna | Dónde se reescribe | Qué es |
|---|---|---|
| `Payment.amount` | `turnos/cobro-turno-repo.ts:257-262` (upsert: primero la seña, después la suma de los cobros); `turnos/anulacion.ts:409-412` | lo cobrado de un turno |
| `CashSession.closingExpected`, `closingCounted`, `closingDiff` | `caja-actions.ts:236-243` | el cierre de un turno de caja que estaba abierto |
| `Service.price`, `residentPrice`, `depositAmount` | `catalog-actions.ts:207-210` | la edición del servicio |
| `Product.price`, `pricePerKg` | `catalog-actions.ts:410,417`; `catalogo/planilla-core.ts:617-624` (la planilla, el aumento de precios y el catálogo de la marca) | un cambio de precio |
| `Order.subtotal`, `discount`, `total`; `OrderItem` | `order-anulacion.ts:885,895,911-913` | el ajuste de un pedido |

Qué costaba en plata la reversa anterior: `invoice-from-appointment.ts:77-80` factura
`payment.amount` primero, así que un turno de $12.000 con seña de $5.000 cobrada antes de migrar se
le informaba a ARCA por $5.000; de la misma columna salen la base de la comisión
(`commission-actions.ts:181`) y "ventas sin comprobante" del libro IVA
(`libros/libro-iva-loader.ts:149`).

### 2.9 (rev. 1) De dónde puede venir un importe con más decimales de los que entran

- `StockMovement.unitCost`: `stock/supplier-return.ts:102`, 6 decimales a propósito. Entra en
  `numeric(18,6)`.
- `CommissionPayout.amount`: antes del arreglo de `comision-liquidacion.ts:22-23` se congeló un
  1851,8505 en un comprobante. Si quedó en Neon, P1 frena hasta que el dueño decida esa fila.
- `Coupon.value` de tipo porcentaje: hasta `5b84826` (2026-09-23) el formulario leía con
  `Number()`; desde entonces `leerImporte` rechaza un tercer decimal (`pos-peso.ts:221`,
  `coupon-actions.ts:47`). Un 12,345 % viejo frena P2b.
- Cualquier importe grabado antes de que su camino pasara por `round2`.

En los clones locales (`erp_lab`, `erp_perf`) hay 0 en las 24 columnas, y la revisión encontró 0
costos con fracción en 35 bases locales: el camino existe en el código, pero ningún dato de
prueba lo recorre. En Neon no está medido: lo mide el chequeo previo de §5.7.

---

## 3. (b) El tipo en código: `src/lib/dinero/`

### 3.1 Archivos

| Archivo | Qué tiene | Por qué así |
|---|---|---|
| `decimal.ts` | La **única** importación del Decimal: `import { Prisma } from "@/generated/prisma/browser"` y un clon `Prisma.Decimal.clone({ precision: 34, rounding: ROUND_HALF_UP })` | Es la entrada que Prisma declara apta para el navegador, así que servidor y Client Components usan la misma clase. Cinco líneas: es el único archivo del módulo que queda fuera de la lista de dominio (DEC-009 excluye a quien importa `generated/prisma`); el resto importa `./decimal` y cuenta para la cobertura |
| `redondeo.ts` | Las reglas R1 a R8 de §3.3 y sus constantes (`CENTAVOS = 2`, `DECIMALES_DE_COSTO = 6`, `TOPE = 1e12`) | ENG-109: la regla en un solo lugar |
| `dinero.ts` | El tipo `Dinero` y las operaciones | |
| `leer.ts` | `leerImporte(texto)`: lo que hoy hace `pos-peso.ts:229`, pero de texto a Decimal sin pasar por `number` | Un solo lector de formularios |
| `bordes.ts` | `aNumero`, `aBase`, `aBaseCosto` (rev. 1), `deBase`, `aArca`, `aArcaCotizacion` (rev. 1) | Los tipos que cruzan cada borde, fijos |
| `sin-decimales.ts` | `sinDecimales(valor)`: recorre un objeto y dice si hay un Decimal adentro | Para los tests de los cargadores |
| `*.test.ts` | Unitarios y los barridos de §3.3 | |

### 3.2 La interfaz

```ts
export type Moneda = "ARS" | "USD";                 // el enum Moneda de Prisma (§4)
export interface Dinero { readonly monto: Dec; readonly moneda: Moneda }

// Construir
dinero(valor: Dec | Prisma.Decimal | string, moneda?: Moneda): Dinero   // texto canónico "1234.56" o un Decimal
desdeNumero(n: number, moneda?: Moneda): Dinero                          // R7: entra por 15 cifras
deBase(v: Prisma.Decimal | null, moneda?: Moneda): Dinero | null         // lo que devuelve Prisma, envuelto

// Operar (misma moneda o error; nunca se opera sobre el Decimal crudo de Prisma, que tiene 20 cifras)
sumar(...xs: Dinero[]): Dinero                       // exacta: no redondea
restar(a: Dinero, b: Dinero): Dinero
porCantidad(precio: Dinero, cantidad: number | string): Dinero          // R3: al centavo
porcentaje(base: Dinero, pct: number | string): Dinero                 // R4. pct es el % (cupón PERCENT, comisión): nunca un Dinero
prorratear(total: Dinero, pesos: readonly (number | Dinero)[]): Dinero[]   // R6: la suma da el total
separarIvaIncluido(total: Dinero, alicuota: "0" | "2.5" | "5" | "10.5" | "21" | "27"): { neto: Dinero; iva: Dinero }  // R5
alCentavo(d: Dinero): Dinero                         // R1 y R2
alCostoUnitario(d: Dinero): Dinero                   // R2 (rev. 1): a 6 decimales
comparar(a: Dinero, b: Dinero): -1 | 0 | 1;  esCero(d);  esPositivo(d);  esNegativo(d)

// Bordes
aNumero(d: Dinero): number    // a Client Components, respuestas de Server Actions y AuditLog
aBase(d: Dinero): string      // a Prisma: "1234.56". Tira si tiene más de 2 decimales o |x| ≥ 1e12
aBaseCosto(d: Dinero): string // (rev. 1) a Prisma, costo unitario: tira si tiene más de 6 decimales o |x| ≥ 1e12
aArca(d: Dinero): string      // a WSFEv1: "1234.56". Tira si tiene más de 2 decimales: el borde nunca redondea
aArcaCotizacion(c: string | number): string  // (rev. 1) MonCotiz: hasta 4 enteros y 6 decimales
leerImporte(texto: string): { estado: "ok"; valor: Dinero } | { estado: "vacio" } | { estado: "invalida" }
```

`round2(n: number): number` (`src/lib/round.ts:18-20`) queda con la misma firma y pasa a ser
`aNumero(alCentavo(desdeNumero(n)))`. Las 224 llamadas en 45 archivos no se tocan en P0 y ya
redondean bien; se van reemplazando por el módulo en cada porción.

### 3.3 La regla de redondeo, en un lugar (ENG-109)

| # | Regla | Evidencia |
|---|---|---|
| R1 | **Medio hacia arriba, lejos del cero** (`ROUND_HALF_UP` de decimal.js): 2,675 → 2,68 y −2,675 → −2,68. Es lo mismo que hace `round()` de Postgres y lo que se usa en comercio | medido con el clon y con Postgres 16.13 |
| R2 | **Importes con dos decimales; costos unitarios con seis** (rev. 1). El código redondea antes de guardar y la base nunca redondea: `aBase` y `aBaseCosto` tiran si sobran decimales. No es cierto que hoy todo llegue al centavo (lo afirmaba la versión anterior): `stock/supplier-return.ts:102` guarda un costo promedio con 6 decimales y el reintegro sale de él (`:165-166`). Un costo unitario es una tasa que sale de dividir (promedio, costo por kilo del despiece), no un precio de lista: `StockMovement.unitCost`, `StockPurchaseItem.unitCost`, `Product.cost` y `ProductBatch.unitCost` van a `numeric(18,6)`; los precios de venta, al centavo | `numeric(14,2)` redondea sin avisar: "99999.995" se guardó como 100000.00. Con el costo a 2 decimales, 3 × $1.000 + 4 × $1.001 devuelto entero reintegraría 7 × 1000,57 = $7.003,99 en vez de $7.004,00. `numeric(18,6)` tiene los mismos 12 enteros que `numeric(14,2)` |
| R3 | **Por renglón:** precio × cantidad se redondea en cada renglón; el total es la suma exacta de los renglones y no se vuelve a redondear | hoy las vidrieras suman sin redondear por renglón (§2.5) |
| R4 | **Comisión:** se redondea la comisión al centavo, como hoy (`comision-liquidacion.ts`). **Descuento porcentual de un cupón:** una sola regla para los tres caminos, redondeando el descuento y no el total (total = subtotal − descuento). **La unidad, peso entero o centavo, la decide el dueño** (rev. 1): cambia lo que pagan las clientas de CH o lo que cobran los mostradores. Opciones y recomendación en §7 | el mismo cupón se calcula en 3 lugares con 2 redondeos (ENG-109): los turnos (`actions.ts:342`) y la vista previa del cupón (`coupon-actions.ts:144`) lo redondean a **pesos enteros** con `Math.round`; la venta (`venta-reglas.ts:455`), al centavo. Al centavo, 10 % de $12.345 pasa de $1.235 a $1.234,50 en los turnos, y el campo de cobro de los turnos no acepta centavos (`step="1"`: `turnos/AppointmentRow.tsx:134`, `NewAppointmentForm.tsx:437`) |
| R5 | **IVA incluido, por residuo:** `neto = alCentavo(total ÷ (1 + alícuota))` e `iva = total − neto`. ImpNeto + ImpIVA = ImpTotal siempre, exacto. Con varias alícuotas, por grupo; ImpIVA = Σ importes e ImpNeto = Σ bases | todos los totales de $0,01 a $100.000,00 (10.000.000): el neto en float y en decimal dan igual en los 10 M. **(rev. 1)** Y el empate no existe para **ningún** total: en centavos, neto = 100T/121; para caer en medio centavo, 121 tendría que dividir a T, y entonces el cociente es entero (igual con 1,025, 1,05, 1,105 y 1,27). No cambia ningún comprobante de hoy: saca la dependencia del float. Un cupón de monto fijo sobre un pedido con varias alícuotas se reparte primero por grupo (R6) y después se separa el IVA de cada grupo. Una nota de crédito toma los importes de la `Invoice` que anula, nunca los recalcula |
| R6 | **Prorrateo por mayor resto:** se reparte redondeando hacia abajo y los centavos que faltan van a las partes con mayor resto (empate: el orden de entrada). Σ partes = total | despiece (`carniceria/despiece.ts:395-400`), cupón fijo entre renglones |
| R7 | **Un `number` entra por 15 cifras significativas** (`n.toPrecision(15)` y recién ahí Decimal). Es lo que hace Postgres al pasar `float8` a `numeric` (medido: `(0.1+0.2)::float8::numeric` da 0,3; `1234.5650000000001` da 1234,565) | con esta regla, **0 errores** en los 10.000.000 de x,xx5 entre $0 y $100.000, en 3.300.066 renglones precio × cantidad y en 1.000.000 de sumas de 2 a 20 importes. `round2` de hoy: 587.189, 2.711 y 0 |
| R8 | **Rango:** \|importe\| < $1.000.000.000.000 (`numeric(14,2)`). Fuera de rango es un error del dominio con mensaje, antes de la base | Postgres responde "numeric field overflow". Hoy una compra de 99.999.999 × $99.999.999 pagada se graba como 1e+41 y a cuenta corriente falla (ENG-011) |

**(rev. 1) Fuera de D1: percepciones y otros tributos.** Hoy `ImpTrib` va fijo en 0 y no se mandan
`Tributos` (`soap.ts:365`), y no está medido que algún negocio sea agente de percepción. Cuando se
construya, en su propio slice: percepción = `alCentavo(base × alícuota)`, por comprobante y por
tributo; la base es el neto gravado, nunca el total con IVA incluido; ImpTrib = Σ Tributo.Importe;
ImpTotal = ImpNeto + ImpIVA + ImpTrib + ImpOpEx + ImpTotConc. La base de cada régimen de Ingresos
Brutos se confirma por jurisdicción antes de construirlo.

Números de apoyo, todos medidos: 100.000 sumas de $1.234,56 en float dan 123.456.000,0001577;
en Decimal, 123.456.000,00. Un importe de `numeric(14,2)` que va y vuelve por `number` no pierde
nada (10.000.000 al azar entre −1e12 y 1e12: 0 distintos, y `toFixed(2)` da el mismo texto): por
eso `aNumero` es un borde seguro, siempre que no se haga una cuenta del otro lado. Costo medido:
las cuentas de una venta de 10 renglones (cada renglón al centavo, suma, descuento del 10 % y
total) tardan 13,8 µs con Decimal en local; el presupuesto de una escritura es 300 ms
(DECISIONS P2).

### 3.4 Relación con ARCA (WSFEv1)

- **Lo que se manda:** `ImpTotal`, `ImpNeto`, `ImpIVA`, `ImpTrib`, `ImpOpEx`, `ImpTotConc`,
  `AlicIva.BaseImp` y `AlicIva.Importe` salen de `aArca(d)`: el texto con dos decimales de un
  Decimal que ya está al centavo (si no lo está, tira: el borde no redondea). Nunca `toFixed` de un
  double: `soap.ts:389-390` hoy convierte 1,005 en "1.00" y 2,675 en "2.67".
- **Formato:** ARCA acepta 13 enteros y 2 decimales en esos campos; `numeric(14,2)` llega a 12 y
  entra. `MonCotiz` acepta 4 enteros y 6 decimales: `Invoice.cotizacion numeric(10,6)` (§4).
- **Cuadre:** ImpTotal = ImpNeto + ImpIVA + ImpTrib + ImpOpEx + ImpTotConc, Σ `AlicIva.Importe` =
  ImpIVA y Σ `BaseImp` = ImpNeto, exactos por R5. Hoy `validacion.ts:30` tolera 0,01 en las sumas
  (`:99`, `:102`): deja pasar un centavo de descuadre que ARCA puede rechazar. Con decimales la
  tolerancia queda sólo para el importe de IVA contra base × alícuota (`:89`). Por R5 ese desvío es
  a lo sumo 1,21 × 0,005 = $0,00605 (0,00635 al 27 %), dentro de la tolerancia del error 10051
  (≤ $0,01 o ≤ 0,01 %, dato de la revisión; no se leyó del manual, §8).
- **(rev. 1) El contrato del plugin sigue en números.** La versión anterior pasaba los importes del
  payload a texto; así, un *Instant Rollback* después de PF dejaba al código de antes leyendo
  textos, y `fmt(n){return n.toFixed(2)}` (`soap.ts:389-390`) tira sobre un string, igual que
  `aEventoPlugin` (`arca-dispatch.ts:146-167`) los pasa sin convertir. No hace falta: un importe de
  `numeric(14,2)` va y vuelve por `number` sin pérdida (10 M, §3.3) y una cotización de 4 enteros
  y 6 decimales también (10 cifras, debajo de las 15 de R7). El plugin convierte al entrar con
  `desdeNumero` y sale con `aArca`. `InvoiceCreatedEvent` (`core-contract.ts:43`) y el payload de
  `OutboxEvent` no cambian de tipo; `moneda` y `cotizacion` se suman como campos **opcionales**
  (ausentes = ARS y 1): el código de antes los ignora y, con el CHECK, todo es ARS. Los envíos que
  ya están en la cola no necesitan conversión.
- **(rev. 1) Antes de publicar PF**, en Neon y sólo lectura, los envíos pendientes contra el cuadre
  sin tolerancia. Un rechazo local deja la factura `REJECTED` para siempre sin llegar a ARCA
  (`arca-dispatch.ts:221-228`), así que ninguno puede quedar afuera por el cambio. Tiene que dar 0
  filas:
  ```sql
  SELECT e.id, e.payload->>'invoiceId' AS factura
    FROM "OutboxEvent" e
   WHERE e."processedAt" IS NULL AND e.type = 'InvoiceCreated'
     AND ( (e.payload->>'total')::numeric <> (e.payload->>'neto')::numeric
             + (SELECT coalesce(sum((x->>'importe')::numeric), 0) FROM jsonb_array_elements(e.payload->'iva') x)
        OR (e.payload->>'neto')::numeric
             <> (SELECT coalesce(sum((x->>'base')::numeric), 0) FROM jsonb_array_elements(e.payload->'iva') x) );
  ```
- **(rev. 1) La decisión del comprobante** (`fiscal/decidir-comprobante.ts:457`, frente D4) pasa a
  contar centavos con el módulo en el mismo commit que `soap.ts` (§2.4).
- **(rev. 1) Homologación.** La prueba que ordenó el dueño con el CUIT homologado (DECISIONS §5.0)
  corre **ya**, con el formato de hoy, desde el banco de pruebas en Vercel: D1 no la frena. Valida
  el formato viejo; por eso PF, cuando llegue, se prueba contra el simulador y **repite en
  homologación** su criterio 1 antes de publicarse.
- **La cuenta que decide los importes** es `fiscal.ts:281-300` (`calcularImpuestos`): pasa a
  `separarIvaIncluido`. `invoice-core.ts:152` deja de hacer `round2` de una suma en float.

### 3.5 Los bordes y su tipo

| Borde | Tipo que cruza | Por qué |
|---|---|---|
| Base → código (Prisma) | `Prisma.Decimal`, que se envuelve de inmediato con `deBase` | el clon del módulo tiene 34 cifras; el Decimal de Prisma, 20 |
| Código → base (Prisma) | texto `"1234.56"` de `aBase`; un costo unitario, de `aBaseCosto` (hasta 6 decimales) | Prisma acepta texto para `Decimal` (medido) y la base no redondea nada |
| SQL crudo | parámetros como texto con `::numeric`; lo que vuelve (un Decimal, medido) pasa por `deBase` | §2.4 |
| Servidor → Client Component, respuesta de Server Action | `number` de `aNumero` | sin pérdida para `numeric(14,2)`; un Decimal crudo llega como texto en producción (§2.4) |
| Formulario → servidor | texto, leído con `leerImporte` | el formulario manda texto; hoy 5 lugares lo leen con `Number(...)` y "12.500" termina en 12,5 (`actions.ts:738`, `:1058`, ENG-109) |
| Client Component → cuentas en pantalla | `desdeNumero(n)` y el mismo módulo | misma regla, mismo resultado que el servidor |
| `AuditLog.changes` | `number` de `aNumero` | las filas viejas son números y `frase.ts:43` sólo lee números |
| Payload de la cola de ARCA (`OutboxEvent.payload`) | `number` de `aNumero`, como hoy (rev. 1) | sin pérdida; el código de antes y el nuevo leen el mismo payload (§3.4) |
| JSON con plata (`Invoice.ivaDesglose`) | `number` de `aNumero` (rev. 1) | §2.3 |
| ARCA (el XML de WSFEv1) | texto de `aArca` | §3.4 |

Regla de pantalla, obligatoria desde P1: **un Client Component nunca recibe un tipo de Prisma
ni un objeto que salga de una consulta sin pasar por un cargador que devuelva números.** Hoy se
cumple (0 importaciones de `generated/prisma` en Client Components). `CajaRenglon.tsx` del
rediseño lee de Prisma en la página de servidor y pasa números: cumple, pero obliga a tocarla en
P1 (§6.0).

### 3.6 Qué pasa con lo que ya existe

- `src/lib/round.ts:18-20`: delega (§3.2). ADR-057 §2 queda derogado.
- `src/lib/fiscal.ts:19` (`import { round2 as redondear }`): pasa al módulo.
- `src/lib/pos-peso.ts:227-229` (`redondearCentavos` local y `leerImporte`) y `:323`
  (`importeDelFormulario`): delegan en `dinero/leer.ts`. `parseAmount` (`caja-actions.ts:60`,
  `libro-caja-actions.ts:94`) y `leerMonto` (`debts/formularios.ts:30`) ya delegan en
  `leerImporte`: no cambian.
- Las 5 lecturas a mano de formularios (`actions.ts:738`, `:1058`; `cobros-actions.ts:63`;
  `catalog-actions.ts:164`, `:199`) pasan a `leerImporte`.
- Los redondeos a mano (§2.1, con la lista de P0 c3) pasan al módulo; los que son de cantidades (los pasos del carrito
  en `tienda/MagraFront.tsx:119`, `SiteReplica.tsx:88`, `Storefront.tsx:165`) pasan a
  `redondearCantidad` (`pos-peso.ts:72`).
- `src/plugins/bancos/domain/valores.ts:18-19` (`redondear2`) y los redondeos de Mercado Pago
  (`plugins/mercadopago/stub.ts:44`, `http.ts:219`, `cobros/http.ts:92`) pasan al módulo, con el
  mismo criterio que ya usa `bancos/domain/reglas.ts:21`. `parsearNumeroAR` (`valores.ts:43`) lee
  extractos, no formularios: se queda, y devuelve `Dinero`.
- Los 6 conversores y las 40 llamadas a `.toNumber()`: se borran en P5 (criterio con `grep`).

---

## 4. (c) Moneda explícita

**Dónde va.** Un enum `Moneda { ARS USD }` y:

| Dónde | Columna | Por qué |
|---|---|---|
| Los **11** hechos de plata que el sistema origina: `Order`, `Payment`, `Collection`, `CashSession`, `CashMovement`, `CommissionPayout`, `StockPurchase`, `AccountPayable`, `PayableCheque`, `AccountReceivable`, `Invoice` | `moneda Moneda @default(ARS)` y `CHECK (moneda = 'ARS')` | Cada fila que registra plata dice en qué moneda está. El CHECK hace que el código que todavía no mira la moneda sea correcto; sacarlo es decidir operar otra moneda, con su ADR. Los renglones (`OrderItem`, `StockPurchaseItem`) heredan la de su cabecera |
| `Invoice` | `cotizacion Decimal @default(1) @db.Decimal(10, 6)` y `CHECK (moneda <> 'ARS' OR cotizacion = 1)` | `MonCotiz` de WSFEv1: 4 enteros y 6 decimales; para pesos, 1 |

**(rev. 1) Qué no lleva moneda, y por qué.**
- **`Tenant`.** La versión anterior le ponía `moneda` como "la de las cuentas del negocio", sin
  CHECK y sin nadie que la leyera: alguien podía ponerla en USD y los precios de los maestros se
  leerían en dólares contra hechos que sólo aceptan ARS. Y el caso real en Argentina no es un
  negocio en dólares sino una **lista** en dólares facturada en pesos a la cotización del día
  (adosmanos, palas importadas): la moneda es de la lista de precios. Los importes de maestros
  (precios, costos, cupones de monto fijo) son ARS mientras los hechos tengan el CHECK, y
  `Dinero` se arma con `"ARS"` para ellos. Dónde va la moneda de una lista lo decide el ADR que
  habilite otra moneda.
- **`MovimientoImportado`.** Es la copia de un extracto bancario; el importador no sabe en qué
  moneda está la cuenta (`ImportacionBancaria`, `schema.prisma:1078-1093`, no la registra), así
  que un `DEFAULT 'ARS'` rotularía en pesos un extracto de una cuenta en dólares sin que nadie lo
  haya medido. Su plata se vuelve hecho cuando se concilia en un `Collection` o un
  `CashMovement`, que sí llevan moneda. Que hoy un extracto en dólares se concilie como pesos sin
  aviso no lo crea D1: va como slice aparte en `BACKLOG.md` (pedido en el reporte de D1).
- `Tenant.bancosUmbralIdentificacion`: es un umbral legal en pesos.

**La migración** es M-D1-0 (§5.3): `ADD COLUMN … NOT NULL DEFAULT 'ARS'` con valor constante no
reescribe la tabla. Medido con la versión anterior (13 tablas) en clones de `erp_lab` y
`erp_perf`: 46 ms; sube, baja y vuelve a subir sin error; un alta en USD rebota con `violates
check constraint "CashMovement_moneda_ars"`. La versión de 11 tablas es un subconjunto y no se
volvió a medir (§8).

**En el código.** `Dinero` lleva la moneda (§3.2). Se construye con la de la fila cuando la fila
la tiene (`deBase(fila.total, fila.moneda)`) y con `"ARS"` en los maestros. `sumar` y `restar` con
monedas distintas tiran un error de dominio: mezclar pesos con dólares no puede compilar a una
suma.

**Cómo llega a ARCA.** Hoy `soap.ts:367-368` manda `MonId` fijo (`MONEDA_PESOS`,
`catalogos.ts:98`) y `MonCotiz` 1, y el QR fija `moneda: 'PES'` y `ctz: 1` (`qr-afip.ts:74-75`).
Queda así:
1. `InvoiceCreatedEvent` (`core-contract.ts:43`) suma `moneda?: "ARS" | "USD"` y `cotizacion?:
   number` (opcionales, ausentes = ARS y 1), leídos de `Invoice.moneda` e `Invoice.cotizacion`.
2. El plugin mapea el código ISO al de ARCA en su catálogo (`catalogos.ts`, al lado de
   `MONEDA_PESOS`): ARS → `PES`, USD → `DOL`. Los códigos son conocimiento de ARCA y viven en el
   plugin.
3. `MonId` = el mapeo; `MonCotiz` = `aArcaCotizacion(cotizacion)`. Con `PES` tiene que ser 1: si
   no, rechazo local antes de llamar a ARCA.
4. Con una moneda que no es `PES`, el manual de WSFEv1 v4.0 pide `CanMisMonExt` (S/N: si se cobra
   en esa misma moneda). El plugin lo manda y el valor sale del evento.
5. El QR toma `moneda` y `ctz` del comprobante.

**(rev. 1) De dónde sale la cotización.** Para ARS es 1 (CHECK). Para otra moneda, de
`FEParamGetCotizacion` para la fecha del comprobante, **nunca tipeada**: con `CanMisMonExt = S`,
ARCA exige que `MonCotiz` coincida exactamente con la que tiene registrada para el día hábil
anterior a la fecha del comprobante (manual WSFEv1 RG 4291; se leyó por resultados de búsqueda,
no el documento, §8). El "1234.567891" de PF c2 es sólo para el test puro.

**(rev. 1) El libro IVA** lee los importes de `Invoice` sin convertir
(`libros/libro-iva-loader.ts:126-128`): una factura en dólares entraría como pesos, y el Libro IVA
Digital pide moneda y tipo de cambio por comprobante. Con el CHECK no puede pasar; lo resuelve el
ADR que lo saque.

Con el CHECK puesto, una factura en dólares no se puede guardar: el camino USD se prueba sólo en
los tests puros del plugin y contra el simulador. Emitir en dólares de verdad es otro slice (y
sacar el CHECK de `Invoice`, con su ADR).

---

## 5. (d) La migración

### 5.1 (rev. 2) El método: expandir y contraer, como decidió el dueño

La rev. 1 cambiaba el tipo en el lugar y descartaba el método del dueño (`DECISIONS.md` §5.0,
`:201-203`). El dueño aprobó el 25/09 mantener su método. Las tres razones de la rev. 1 eran
defectos del prototipo, no del método, y se resuelven así (medido en Postgres 16.13 local,
`.qa/rec-2509/disenos-variantes-d1/d1-expandir-contraer.sql` y su `.salida.txt`):

| Razón de la rev. 1 | Qué era en realidad | Cómo queda |
|---|---|---|
| Un alta de $100 del código viejo quedaba en $0 en las dos columnas | La columna nueva tenía `DEFAULT 0` y el espejo le daba prioridad a la nueva cuando venía cargada (`.qa/D1/medicion/proto/m1-expandir.sql:23`) | La nueva nace **nula y sin valor por defecto**: el alta del código viejo la trae vacía y el espejo la llena desde la `Float`. Medido: $100 queda $100 en las dos (T1); un alta sin importe queda 0 en las dos (T2) |
| `@map` frenaría el build | `scripts/predeploy-check.mts:95-116` (`parseExpectedColumns`) toma el nombre del campo e ignora `@map` | Se corrige en P0 (criterio 12): lee `@map`. Hoy hay 0 `@map` en el schema, así que el arreglo no cambia nada de lo que ya pasa |
| Después del borrado final el código viejo no arranca | Es cierto de toda contracción | El borrado (M-D1-C) va último, con su OK, y sólo cuando el deploy publicado ya no nombra ninguna `Float`: el *Instant Rollback* desde ahí vuelve a un código que anda |

Y el método del dueño es **más simple de volver atrás** que el de la rev. 1: hasta M-D1-C la
`Float` sigue al día con todo lo que se escribió (el espejo la mantiene), así que la reversa de la
base no reescribe ningún importe: borra la columna nueva y el espejo. Desaparece la lógica «usar
el respaldo sólo si la fila sigue valiendo lo mismo» que la rev. 1 tuvo que corregir.

**Tres fases por porción:**

| Fase | Qué hace | Con qué viaja | Vuelta atrás | OK del dueño |
|---|---|---|---|---|
| **E · Expandir** (M-D1-1 a M-D1-5) | Un bloque `DO`: agrega `<campo>_num numeric(14,2)` (`numeric(18,6)` los costos unitarios), nula y sin default; crea el espejo; chequea que todo entre; rellena la nueva sin tocar la `Float`; verifica fila por fila contra el valor de antes; `SET NOT NULL` | **PR propio**, sin código de la porción: el código de hoy no ve la columna nueva (Prisma ignora columnas que no conoce, y `predeploy-check` sólo exige las del schema) | Migración nueva: `DROP TRIGGER` + `DROP COLUMN <campo>_num`. No reescribe nada (medido: la `Float` tiene lo escrito en el medio por los dos códigos) | Sí, una por porción |
| **L · Leer desde la nueva** (el código de P1 a P4) | `schema.prisma`: `amount Decimal @db.Decimal(14, 2) @map("amount_num")`; la `Float` sale del schema. Todo el código lee y escribe `Decimal` | El deploy de la porción, **después** de que E esté aplicada (si no, `predeploy-check` frena: falta la columna) | Revertir el commit o *Instant Rollback*: el código de antes lee la `Float`, que el espejo mantuvo al día (T5: la seña de $3.000 cobrada entera deja $12.000 en las dos) | No (es código) |
| **C · Contraer** (M-D1-C, una sola al final) | `DROP TRIGGER` y `DROP FUNCTION d1_espejo`, `DROP COLUMN` de las 24 `Float`, `SET DEFAULT` en las nuevas cuya `Float` lo tenía | Sin código: el schema no nombra las `Float` desde L | Re-expandir: agrega la `Float` desde la `numeric` (exacta al centavo, no al bit) y el espejo | Sí, aparte, destructiva |

El `@map` queda para siempre: renombrar `amount_num` a `amount` sería otro expandir y contraer sin
ninguna ganancia.

**La doble escritura vive en la base, no en el código, y es una sola función.** Un trigger
`BEFORE INSERT OR UPDATE` por tabla, todos con la misma función `d1_espejo(float, numeric, escala,
…)`. En la base cubre a todo escritor: los 64 que encontró el recorrido del AST
(`.qa/D1/medicion/escritores.tsv`), los scripts, el SQL crudo y el que nadie encontró, y a los dos
códigos mientras conviven durante un deploy. Escribir las dos columnas desde el código obligaría a
encontrar cada escritor de las 24 columnas: es la «segunda escritura» que esta casa aprendió a
buscar. La regla, entera:

| Qué llega | Qué hace el espejo | Medido |
|---|---|---|
| Alta con la nueva cargada (código nuevo) | `Float := nueva` | T3 |
| Alta con la nueva vacía (código viejo) | `nueva := round(Float::numeric, escala)` | T1, T2 |
| Modificación que cambió la nueva | `Float := nueva` (también un `increment`) | T5 |
| Modificación que cambió sólo la `Float` | `nueva := round(Float::numeric, escala)` | T4 |
| Modificación que no toca plata | nada | T6 |
| NaN o infinito | error «D1: <tabla>.<campo> no es un importe»: la operación entera falla (hoy se guardaría NaN) | T7 |
| Durante el relleno (`d1.relleno = on`, sólo dentro de la migración) | nada: el relleno escribe la nueva y la `Float` queda bit por bit | huella igual |
| Como un rol sin `BYPASSRLS` bajo RLS | anda igual: la función no lee tablas | T9 |

`round(float8::numeric, 2)` es la regla de `centavosDe` (`src/lib/dinero/redondeo.ts:40-42`):
Postgres pasa la `float8` a `numeric` con 15 cifras (0,1 + 0,2 en float da 0,30, no
0,30000000000000004) y redondea el medio hacia afuera. Medido: 0 de 1.000.000 de importes x,xx5
entre $0 y $10.000 redondean hacia abajo. Una fracción de centavo que el código viejo escriba en
vivo (T8: 10,005) queda en la `Float` y la nueva guarda 10,01; el informe previo a L la lista
(§5.7). Después de P0 no debería aparecer ninguna: la regla única redondea antes de escribir.

### 5.2 (rev. 2) Compatibilidad: quién escribe y quién lee, en cada fase

| | Después de E | Después de L | Después de C |
|---|---|---|---|
| **Código viejo** (schema `Float`) | Escribe la `Float`; el espejo llena la nueva (T1, T2, T4, T9) | Si vuelve (*Instant Rollback*), lee la `Float` al día | No arranca. Por eso C exige que el deploy publicado, y el anterior a él, ya sean L |
| **Código nuevo** (`@map` a la nueva) | Se puede publicar | Escribe la nueva; el espejo llena la `Float` (T3, T5) | Lo buscado |

El orden es obligatorio y lo hace cumplir el build: E antes que L (`predeploy-check` frena si falta
la columna, con el arreglo de P0 criterio 12), L antes que C (C sólo con OK del dueño y con L
publicado y estable). **Durante un deploy los dos códigos corren a la vez** (Vercel mantiene
instancias viejas hasta que terminan): por eso el espejo es en los dos sentidos.

### 5.3 Los pasos

| Paso | Qué hace | Con qué código viaja | Reversa | Cómo se prueba |
|---|---|---|---|---|
| **M-D1-0 · moneda** (aditiva) | `enum "Moneda"`, `moneda` + CHECK en los 11 hechos de plata e `Invoice.cotizacion` (§4) | la primera porción que lee la moneda: PF o P1 | `DROP COLUMN` de las 12 y `DROP TYPE` (todas dicen ARS) | subir/bajar/subir; como `app_rls`, `moneda = 'USD'` rebota. Si toca `Invoice`, el trigger de ENG-022 protege `moneda` y `cotizacion` en la misma migración |
| **M-D1-1 · E de P1 caja y cobros** | `CashMovement.amount`, `CashSession.openingFloat`, `closingExpected`, `closingCounted`, `closingDiff`, `Payment.amount`, `CommissionPayout.amount` → `<campo>_num numeric(14,2)` + espejo | PR propio; L de P1 después | migración nueva (§5.4) | criterio E/C (§6) |
| **M-D1-2 · E de P2a servicios y turnos** | `Service.price`, `residentPrice`, `depositAmount`, `Appointment.priceAtBooking`, `discountAmount` | ídem | ídem | ídem |
| **M-D1-3 · E de P2b mostrador y vidriera** | `Order.subtotal`, `discount`, `total`, `OrderItem.unitPrice`, `lineTotal`, `Coupon.value`, `Product.price`, `pricePerKg` | ídem | ídem | ídem |
| **M-D1-4 · E de P3 compras** | `StockPurchase.totalCost`, `StockPurchaseItem.lineTotal` (14,2); `StockPurchaseItem.unitCost` (18,6) | ídem | ídem | ídem; un NaN o un 1e41 frenan sin dejar nada hecho |
| **M-D1-5 · E de P4 stock** | `StockMovement.unitCost` (18,6) | ídem | ídem | ídem, con un costo de 6 decimales |
| **M-D1-C · contraer** (destructiva, OK aparte) | `DROP TRIGGER` ×13, `DROP FUNCTION d1_espejo`, `DROP COLUMN` de las 24 `Float`, `SET DEFAULT` donde la `Float` lo tenía | ninguno | re-expandir desde la `numeric` (al centavo) | ENG-011 criterio 2 da 0; `prisma migrate diff` vacío |

Ninguna de las 24 columnas es de `Invoice`, así que el trigger de ENG-022
(`20260925150000_comprobante_autorizado_inmutable`) no choca con el relleno. No hay otros triggers
en esas tablas (`grep -rn "CREATE TRIGGER" prisma/migrations prisma/rls`: sólo ese).

**Una fila con más decimales de los que entran frena la expansión** con «D1: <tabla>.<campo> tiene
importes que no entran sin autorización del dueño (ids: …)» y la base queda igual (medido, E1).
**(rev. 2)** La autorización es por **(tabla, columna, id, valor)**, no sólo por id: el dueño decide
el valor, y el chequeo previo (§5.7, consulta 2) le propone el ya facturado o cobrado. La `Float`
de esa fila no se toca (bit por bit); la nueva guarda el valor autorizado (medido, E2).

**Qué frena la expansión, sin dejar nada hecho:** NaN, infinito o un valor de un billón o más; un
importe con más decimales que la columna nueva sin autorización; un rol que migra sujeto a RLS
(`SET LOCAL row_security = off` hace que falle en vez de rellenar sólo lo que ve); la tabla tomada
más de 5 s (`lock_timeout`); y cualquier fila cuya nueva no valga lo mismo que la `Float` leída como
decimal (o que el valor autorizado). La expansión toma la tabla en exclusiva durante todo el bloque
(`ADD COLUMN`, relleno y `SET NOT NULL`): **sin medir con el espejo sobre el seed de 50.000**; es el
criterio M7 de cada porción.

### 5.4 (rev. 2) Plantilla de la expansión y su reversa

Prototipo medido: `.qa/rec-2509/disenos-variantes-d1/d1-expandir-bloque.sql` (el bloque, sobre una
tabla de la forma de `Order`) y la función `d1_espejo` en `d1-expandir-contraer.sql`. La migración
real de cada porción es el mismo bloque armado desde su lista `pares` (tabla, columna, escala),
como en la rev. 1: los `ALTER`, el trigger, el chequeo, el relleno y la verificación se generan de
la lista, no se escriben a mano. `d1_espejo` se crea con `CREATE OR REPLACE` en la primera
expansión que se aplique y se borra en M-D1-C. La lista `d1_autorizadas` (tabla, columna, id,
valor) va literal en el archivo de la migración, con la fecha y el texto del OK del dueño en un
comentario.

La reversa de una expansión es una migración nueva, después de volver el código a antes de L:

```sql
DROP TRIGGER IF EXISTS d1_espejo ON "CashMovement";
ALTER TABLE "CashMovement" DROP COLUMN IF EXISTS "amount_num";
-- … una por tabla de la porción; la función se borra sólo si ya no la usa ninguna tabla
```

Casi nunca hace falta: una columna de más no molesta al código viejo. Se usa si hay que volver a
expandir con otra escala o si el dueño decide cerrar D1 sin terminar.

El prototipo de la rev. 1 (cambio en el lugar, `.qa/D1/rev1/` y `.qa/D1/medicion/proto/p*_*.sql`) y el
de expandir y contraer descartado (`.qa/D1/medicion/proto/m1-*.sql`) quedan como historia.

### 5.5 `prisma/pending-gate2/CarniceriaRubro.sql`

Según su cabecera no está aplicado en ningún lado real (en Neon no se pudo verificar). Se
corrige **antes** de aplicarse (ENG-011 criterio 4), así nace en decimal y no necesita porción:

- `:37` `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "cost" NUMERIC(18,6);` (rev. 1: es un
  costo unitario, $/kg o $/u)
- `:62` `"unitCost" NUMERIC(18,6),` en `ProductBatch` (rev. 1: costo $/kg del lote)
- `:109` `"inputCost" NUMERIC(14,2) NOT NULL DEFAULT 0,` en `ProcessingRun` (es un importe: el
  costo total de la pieza)
- El snippet de `schema.prisma` del final del archivo: `cost Decimal? @db.Decimal(18, 6)`,
  `unitCost Decimal? @db.Decimal(18, 6)` e `inputCost Decimal @default(0) @db.Decimal(14, 2)`.
- Los kilos (`:60` `netWeightKg`, `:108` `inputWeightKg`, `:131` `weightKg`) quedan
  `DOUBLE PRECISION`, como el resto de las cantidades (§2.7).
- La demo local lo corre sobre PGlite, que tiene `NUMERIC`.

El código que lee esas columnas por SQL crudo cambia en P4 (§6): `carniceria/product-extras.ts:36`
y `:79`, `inventory/inventory-loader.ts:43`, `stock/costo.ts:147`, `carniceria/lotes-loader.ts:42`
(la declara `number | null` en `:29`), `carniceria/lotes-registro.ts:50-53`,
`carniceria/despiece-loader.ts:35` y `carniceria/despiece-registro.ts:79-81`. Si al medir Neon
(D2) resulta que ya está aplicado, esas tres columnas entran en M-D1-5 con la misma plantilla.

### 5.6 Cómo se aplica en Neon (lo único que hace el dueño)

Es el camino A del runbook (`docs/runbooks/migracion-caja-neon.md` §"A · Desde el deploy de
Vercel"), que el build ya lleva adentro (`scripts/vercel-build.mjs`):

0. **(rev. 1) El chequeo previo de §5.7, obligatorio**, con el mismo rol que va a migrar, guardado
   en `.qa/D1/<porción>/`. Si lista filas que no entran o con más decimales, **decide el dueño**
   fila por fila antes de agendar (sus ids van a `autorizadas`). Si alguna tabla de la porción
   tiene FORCE y el rol no tiene `BYPASSRLS`, la migración frenaría: esa porción agrega
   `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` al empezar y `FORCE` al terminar, dentro del mismo
   bloque (el cambio no se ve fuera de la transacción, y FORCE no afecta a `app_rls`, que no es
   dueño de la tabla).
1. **Antes de tocar nada:** las 4 migraciones que `prisma/lote-deploy.txt` lista como pendientes
   en Neon (medido por el build del 2026-09-23) van primero. Una de D1 se suma al lote recién
   después, o en el mismo lote si el dueño lo decide así.
2. **Respaldo:** Neon → Branches → *Create branch*. Opcional y recomendable: ensayo de la
   migración en ese branch desde el SQL Editor (runbook §0).
3. **(rev. 2) La expansión entra a `prisma/migrations/` y a `prisma/lote-deploy.txt` en un PR
   propio, sin el código de la porción**; el PR de L va después, con E ya aplicada. Así revertir L
   nunca saca la migración del repo, y `scripts/predeploy-check.mts:223-231` (que rechaza una
   migración aplicada que el repo no tiene) no frena la vuelta atrás. Antes de la autorización no está en `main`: si estuviera, cada build de producción
   frenaría ("la base está ATRÁS de este código", `vercel-build.mjs`) y trabaría todos los
   deploys, incluido el rediseño.
4. `MIGRATE_DATABASE_URL` (rol `neondb_owner`, sin pooler) sólo en Production, con el local de CH
   cerrado; merge; el build migra, verifica y publica. Si la migración frena, el log dice
   "D1: …" y la base quedó igual: se sigue el runbook para P3009 ("la migración no llegó a cambiar
   nada").
5. **(rev. 2)** Sacar `MIGRATE_DATABASE_URL` de Vercel apenas termina el build que aplicó E, antes
   de publicar L: L no migra nada.
6. **(rev. 2) Si hay que volver atrás:** el código (revertir el commit de L; *Instant Rollback*
   sólo si es el deploy inmediatamente anterior). La base no hace falta tocarla: la `Float` está al
   día y la columna nueva no molesta. Si igual se quiere sacar, la reversa de E entra por este
   mismo camino como migración nueva (§5.4), con su OK.

### 5.7 Chequeo previo e informe (sólo lectura, obligatorio antes de cada porción; rev. 1)

La versión anterior lo dejaba como opcional ("se puede correr"). Es obligatorio porque es lo que
le da al dueño la lista para decidir; la migración igual frena si él no lo corrió. Se corre en el
SQL Editor de Neon con el rol que va a migrar (o dentro de D2/ENG-204), y la salida se guarda en
`.qa/D1/<porción>/`. Son tres consultas por porción; acá, las de P1.

```sql
-- 1) Resumen por columna y negocio (una línea por columna de la porción, con su escala).
SELECT 'CashMovement.amount' AS columna, "tenantId" AS negocio, count("amount") AS filas,
       count(*) FILTER (WHERE "amount" = 'NaN'::float8 OR "amount" IN ('Infinity'::float8, '-Infinity'::float8)
                          OR abs("amount") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "amount" <> 'NaN'::float8 AND abs("amount") < 1e12
                          AND "amount"::numeric <> round("amount"::numeric, 2)) AS con_mas_decimales
  FROM "CashMovement" GROUP BY "tenantId"
-- UNION ALL … (una por columna; 6 en vez de 2 en los costos unitarios)
ORDER BY no_entran DESC, con_mas_decimales DESC, columna, negocio;

-- 2) (rev. 2) Cada fila con más decimales, con lo que ya se facturó y se cobró, y el valor que se
--    propone. Ejemplo de Payment.amount (cobro de turno); cada columna trae lo suyo: CashMovement
--    su día (cerrado o no), Order.total su factura por orderId.
SELECT 'Payment.amount' AS columna, p.id, p."tenantId" AS negocio, to_char(p."createdAt", 'YYYY-MM') AS mes,
       p."amount" AS antes, round(p."amount"::numeric, 2) AS al_centavo,
       i.id AS factura, i."total" AS facturado, (i."cae" IS NOT NULL) AS con_cae,
       (SELECT sum(cm."amount")::numeric FROM "CashMovement" cm WHERE cm."paymentId" = p.id) AS en_caja,
       COALESCE(CASE WHEN i."cae" IS NOT NULL THEN i."total" END,
                (SELECT round(sum(cm."amount")::numeric, 2) FROM "CashMovement" cm WHERE cm."paymentId" = p.id),
                round(p."amount"::numeric, 2)) AS propuesto
  FROM "Payment" p LEFT JOIN "Invoice" i ON i."appointmentId" = p."appointmentId" AND i."status" <> 'REJECTED'
 WHERE p."amount" <> 'NaN'::float8 AND abs(p."amount") < 1e12 AND p."amount"::numeric <> round(p."amount"::numeric, 2)
-- UNION ALL … CashMovement: día = to_char("occurredAt" en la zona del negocio), cerrado = día ≤ la
--    frontera de caja/frontera-cierre.ts:48 (último corte o cierre en AuditLog); propuesto = el
--    importe del cobro o de la factura con CAE que lo originó.
ORDER BY columna, negocio, mes;

-- 3) ¿El rol que migra ve todas las filas? (FORCE y BYPASSRLS)
SELECT c.relname AS tabla, c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
       r.rolbypassrls OR r.rolsuper AS salta_rls, pg_get_userbyid(c.relowner) = current_user AS soy_duenio
  FROM pg_class c JOIN pg_roles r ON r.rolname = current_user
 WHERE c.relname IN ('CashMovement', 'CashSession', 'Payment', 'CommissionPayout');
```

Cómo se lee (rev. 2): `propuesto` es el valor que ya vio alguien: el de la factura con CAE si la
hay (redondear distinto dejaría la base 1 centavo lejos de lo que ARCA autorizó, `fiscal.ts:286-291`),
si no el que entró a la caja, y si no el redondeo al centavo. El dueño autoriza (tabla, columna,
id, valor) con ese valor o con otro. `no_entran` > 0 es un dato de un cliente y lo decide el dueño (§7).
`con_mas_decimales` > 0 también, con la lista de la consulta 2. Si alguna es de un mes que ya se
pudo haber exportado (`Payment.amount` y `Order.total` en "ventas sin comprobante" del libro IVA,
`StockPurchase.totalCost` en compras) o de un día de caja ya cerrado, el informe lo dice por fila:
redondearla cambia un número que alguien ya vio. En la consulta 3, el rol está sujeto a RLS (y
la migración frenaría) si `rls` es verdadero, `salta_rls` es falso, y además no es dueño o la
tabla tiene `force`: en ese caso se agrega el paso de §5.6.0 (o se migra con un rol dueño sin
FORCE).

**(rev. 2) Antes de publicar L, y otra vez antes de M-D1-C**, el informe de lo que la nueva no
guarda igual que la `Float`, por negocio: `SELECT "tenantId", count(*), sum("amount"::numeric -
"amount_num") FROM "CashMovement" WHERE "amount"::numeric <> "amount_num" GROUP BY 1;`. Trae las
filas autorizadas y las fracciones que el código viejo haya escrito en vivo (T8); se guarda en
`.qa/D1/<porción>/`. Es lo que se pierde en M-D1-C.

---

## 6. (e) Porciones verticales

Cada porción es una columna o un grupo de columnas **de punta a punta**: su expansión (E, en un PR
propio), el campo `Decimal` con `@map` a la columna nueva en `schema.prisma` (L), todos los que la escriben y la leen (`tsc` los obliga), las cuentas del
cliente que la usan, y sus tests. No hay porción "de reportes" para una columna: cuando una
columna pasa a `Decimal`, sus lecturas en reportes se arreglan en esa porción. P5 limpia lo que
queda en float después de leer.

Todo criterio "de integración" corre en `npm test` contra la base efímera de ENG-000, con
`app_rls` y `RLS_ENFORCEMENT=on` (convención de `BACKLOG.md`). **Sin ENG-000 una porción con
migración no cierra** (estándar §3). P0 no lo necesita: es dominio puro.

**(rev. 2) Criterio común a toda porción con migración** (se cita como "criterio M" abajo). Corre
en la base efímera (`src/test/base-efimera.ts`), como test, a partir del prototipo de
`.qa/rec-2509/disenos-variantes-d1/`:

- **M1 · Escrituras en el medio.** E → el cliente de Prisma de antes (schema `Float`) y el nuevo
  (`Decimal` con `@map`) crean filas y **reescriben filas que ya existían**, por los caminos reales
  de §2.8 que toquen la porción → en cada fila la `Float` y la nueva valen lo mismo al centavo →
  reversa de E → la `Float` tiene todo lo escrito por los dos → E de nuevo pasa.
- **M2 · Fracciones.** Una fila con más decimales de los que entran frena E sin dejar nada hecho;
  con (tabla, columna, id, valor) autorizado pasa, la nueva guarda ese valor y la `Float` queda bit
  por bit (huella `float8send` igual antes y después).
- **M3 · RLS.** Con un rol que migra sujeto a RLS (tabla en FORCE, rol sin `BYPASSRLS`), E falla en
  vez de rellenar a ciegas; y como `app_rls` el espejo anda (T9).
- **M4 · Prisma y la vuelta atrás del código** (objeción 1 de ENG-011). En una base propia:
  `prisma migrate deploy` de E → publicar L → revertir L (el repo conserva la migración y su línea
  de `lote-deploy.txt`) → `scripts/predeploy-check.mts` en modo lote pasa (0 migraciones
  desconocidas, `:223-231`) y `prisma migrate status` da "up to date". Se suma a
  `.qa/D1/rev1/probar-prisma.sh`.
- **M5 · Convivencia**, una vez por porción antes de pedir el OK: los dos clientes contra la base
  expandida, en simultáneo, escriben y leen la misma fila con el mismo valor al centavo (lo que pasa
  durante un deploy, cuando Vercel tiene las dos versiones vivas).
- **M6 · Chequeo previo** (§5.7) corrido en Neon con el rol que migra y guardado en
  `.qa/D1/<porción>/` antes de pedir el OK.
- **M7 · Tabla tomada.** E sobre el seed de 50.000 comprobantes (ENG-201) con el espejo: menos de
  5 s por tabla (`lock_timeout`). Si no da, esa tabla se expande en un bloque propio.

### 6.0 El corte del rediseño: qué va antes y qué después

El rediseño (ADR-099) edita sin commit las pantallas de Caja, Vender, Pedidos, Ventas, Inicio, la
tienda y cuentas a pagar. **"El corte" de una pantalla es el commit que deja en `origin/main` sus
archivos sin cambios pendientes**; se verifica con `git status --porcelain -- <archivos>` vacío.

| Porción | Archivos de otra sesión que toca | Cuándo |
|---|---|---|
| **P0** módulo y regla | ninguno: los redondeos que corrige están en archivos limpios; los del rediseño y los sin commit de otros frentes (`contador-wa/mensajes.ts`, `fiscal/decidir-comprobante.ts`) se cuentan aparte (criterio 3) | **antes del corte**, ya |
| **PF** borde fiscal + M-D1-0 | ninguno del rediseño. Con D4 comparte `soap.ts` y `fiscal/decidir-comprobante.ts` (sin commit, del frente D4) | en la tanda de D4, después de ENG-020 y ENG-021. **No va antes de la prueba de homologación del dueño: esa prueba corre ya y no espera a D1** (rev. 1) |
| **P3** compras | ninguno, **si el cargador de cuentas a pagar sigue devolviendo `number`** (criterio 5). La cuenta en float de `cuentas-a-pagar/[id]/page.tsx:70` (rediseño, sin commit) va a P5 (rev. 1) | **antes del corte** si hace falta (regla de abajo) |
| **P4** stock | ninguno (`stock/supplier-return.ts` y `stock/ledger.ts` están limpios) | **antes del corte** si hace falta |
| **P1** caja y cobros | `caja/page.tsx`, `caja/CajaRenglon.tsx`, `cierre-diario-actions.ts`, `multilocal/multilocal-core.ts` | **después del corte de Caja** |
| **P2a** servicios y turnos | `(site)/page.tsx`, `vender/page.tsx`, `pedidos/page.tsx`, `cierre-diario-actions.ts` | **después del corte de Vender** |
| **P2b** mostrador y vidriera | `vender/VenderForm.tsx`, `vender/page.tsx`, `pedidos/page.tsx`, `ventas/page.tsx`, `tienda/page.tsx`, `tienda/vidriera/*`, `inicio/pedidos-bandeja.server.ts` | **después del corte de Vender** |
| **P5** reportes y limpieza | los que queden, incluido `cuentas-a-pagar/[id]/page.tsx:70` | al final, después de todos los cortes |

**Orden:** P0 → PF → P1 → P2a → P2b → P3 → P4 → P5 → M-D1-C. Es el orden de riesgo (caja y
cobros primero; CH vive de caja y turnos). **Una sola excepción:** si cuando P0 y PF terminan el
corte de Caja todavía no está, se hace P3 y después P4 (no chocan), y P1 entra apenas llegue el
corte. PF puede atrasarse sin frenar a nadie (P1 no lo necesita: M-D1-0 viaja con la primera de
las dos que salga). Nunca se commitea sobre un archivo con cambios de otra sesión.

### P0 · El módulo de plata y la regla única (ENG-109 entero) · M · sin migración

**Qué.** `src/lib/dinero/` (§3.1 y §3.2). `round.ts:18-20` delega. `fiscal.ts:19` pasa al módulo.
`pos-peso.ts:227-229` y `:323` delegan en `dinero/leer.ts`. Las 5 lecturas a mano de formularios
(§3.6) pasan a `leerImporte`. Los redondeos a mano de archivos limpios pasan al módulo (o a
`redondearCantidad` los de cantidades), incluidos los que el patrón anterior no veía:
`caja/import-caja.ts:247`, `catalogo/aumento-core.ts:160`, `catalogo/precios-auditoria.ts:127`.
`stock/supplier-return.ts:102` pasa a `alCostoUnitario` en P4, porque su columna recién admite 6
decimales con M-D1-5. El cupón se calcula en un solo lugar (R4). No cambia ninguna columna.

**Criterios de aceptación.**
1. `redondeo.test.ts` barre todos los x,xx5 de [$0; $1.000.000): ninguno hacia abajo. Hoy
   `round2` baja 4.697.605 de 100.000.000 (ENG-109). Si en CI tarda más de 60 s (a escala 1/10
   tardó menos de 45 s en local, junto con otros barridos), corre como paso propio de `verify`;
   no se saltea.
2. Los 3.300.066 renglones precio con centavos × cantidad con 3 decimales de §3.3 dan 0 distintos
   del cálculo exacto (hoy 2.711).
3. **(rev. 1) El patrón se amplió**, porque el anterior (`\*\s*100\)\s*/\s*100`) daba 0 con
   redondeos vivos:
   `grep -rnE 'Math\.(round|floor|ceil|trunc)\([^;]*\*\s*(100|1e2|1e4|1e6)\b|\*\s*100\)\s*/\s*100\b|Number\([^)]*\.toFixed\(2\)\)' src --include=*.ts --include=*.tsx | grep -v '\.test\.' | grep -v 'src/lib/dinero/'`
   da 0, salvo las líneas marcadas `// no-es-plata: <por qué>` (cada marca se revisa en el PR) y
   los archivos con cambios sin commit de otra sesión, que se listan aparte hasta su corte. Hoy da
   59 en `08b4563` y 80 en el árbol (medido 2026-09-25).
4. **(rev. 1)** El mismo cupón con el mismo precio da el mismo descuento en `actions.ts:342`,
   `coupon-actions.ts:144` y `venta-reglas.ts:455` (test que llama a los tres), **en la unidad
   que decida el dueño (§7)**. Mientras no decida, peso entero (*provisional a confirmar*): 10 %
   de $12.345 da $1.235 en los tres. Si elige centavo, $1.234,50, y se cambia una constante del
   módulo.
5. "12.500" se lee 12.500 y "1.234,56" se lee 1.234,56 en cada uno de los 5 lugares que hoy leen a
   mano (un test por lugar).
6. `sumar` con monedas distintas tira; `aBase` tira con 3 decimales y con \|x\| ≥ 1e12;
   `aBaseCosto` acepta 6 decimales y tira con 7.
7. `prorratear`: 1.000.000 de repartos al azar, la suma de las partes es el total exacto.
8. `separarIvaIncluido`: los 10.000.000 de totales de $0,01 a $100.000,00 cumplen
   neto + iva = total exacto, y \|iva − alCentavo(neto × 0,21)\| ≤ $0,01.
9. Ida y vuelta: 10.000.000 de importes al azar de `numeric(14,2)` pasan por `aNumero` y
   `desdeNumero` sin cambiar (se trae el barrido de §3.3 como test); lo mismo con costos de
   `numeric(18,6)` debajo de 1e9 (15 cifras).
10. Cobertura de funciones de `src/lib/dinero/` ≥ 90 % (es dominio, §3 del estándar).
11. `next build`: cada ruta que importa el módulo del lado del cliente crece ≤ 18 KB gzip (el
    Decimal solo, aislado, pesa 17,8 KB). Si ENG-202 todavía no mide rutas, se deja escrito
    "sin medir" en HEALTH y no se declara cumplido.
12. **(rev. 2)** `scripts/predeploy-check.mts` lee `@map`: `parseExpectedColumns` (`:95-116`) espera
    la columna mapeada y no el nombre del campo, y lo mismo las `@@unique`/`@@index` que nombran un
    campo mapeado. Test con un schema de juguete (`total Decimal @map("total_num")` espera
    `total_num`); sin `@map` la salida es la de hoy (0 `@map` en el schema).
13. **(rev. 2) Guarda de escritura** (objeción 2 de ENG-011): Prisma acepta `number` en un campo
    `Decimal` (`src/generated/prisma/models/Invoice.ts:525-527`) y la base lo redondearía sin avisar.
    Una extensión de Prisma en la misma cadena que `tenant-scope` recorre `data` (anidadas,
    `createMany`, `upsert` incluidas) y rechaza, con un error tipado, un `number` que la columna
    redondearía (más decimales que su escala, a 15 cifras), NaN o infinito, en todo campo `Decimal`
    del DMMF. En test y desarrollo frena; en producción avisa (log estructurado con negocio, modelo
    y campo, sin importes) hasta P5, que la pasa a frenar con 2 semanas de 0 avisos. Tests: un
    `payment.create({ data: { amount: 0.125 } })` y un `order.create` con renglones anidados
    frenan; `amount: 10.5` pasa.
14. **(rev. 2) Cerrojo de sumas en float** (objeción 4): un test lista las sumas con `reduce` de `src`
    (patrón `reduce\(\s*\(\s*\w+\s*,\s*\w+\s*\)\s*=>\s*\w+\s*\+`, 100 líneas medidas el
    2026-09-25; la revisión contó 72 con otro patrón) contra una lista `PENDIENTES` por archivo, como
    `src/lib/dinero/redondeos-locales.test.ts`: una suma nueva fuera de la lista falla; las que no son
    plata se marcan `// no-es-plata: <por qué>`; cada porción saca sus archivos, y P5 deja la lista
    vacía. Quedan adentro las de la revisión: `libros/LibrosClient.tsx:110`,
    `caja/libro/LibroRenglon.tsx:241-242`, `inicio/InicioRenglon.tsx:260`,
    `facturacion/bancos/page.tsx:135`, `reportes/margen/page.tsx:77-78`.
15. **(rev. 2) Evidencia en el repo** (objeción 3): `.qa/D1/medicion/` (hecho el 2026-09-25) y §1 la
    cita. Nada del plan se apoya en el scratchpad.
16. **(rev. 2) El espejo y el bloque E, como test** en la base efímera
    (`src/lib/dinero/d1-espejo-postgres.test.ts`): los casos E1, E2 y T1 a T9 del prototipo, más T3b: un
    alta del código nuevo en una tabla cuya `Float` es NOT NULL sin default pasa, porque Postgres
    controla el NOT NULL después del trigger `BEFORE` (medido en el prototipo). Es lo que hace barata cada porción: P1 sólo cambia la
    lista `pares`.

**(rev. 2) P0 está listo para arrancar.** No tiene migración ni toca la base de nadie; las siete
objeciones de ENG-011 tienen respuesta (en este plan y en `BACKLOG.md`); la unidad del cupón usa
el valor provisional (peso entero) hasta que el dueño decida (§7). Lo único que CH ve de P0 es lo que
ENG-109 ya midió y declaró (el medio peso del cupón en turnos sube, `.qa/ENG-109/`); los criterios
12 a 16 no cambian nada visible: 12 es del build, 13 frena sólo en test y desarrollo, 14 y 16 son
tests, 15 es evidencia. Orden sugerido: 16 y 12 primero (habilitan P1), después 13 y 14, y el resto
de ENG-109 según `.qa/ENG-109/traspaso-3.md`.

### PF · El borde fiscal y la moneda (con la tanda de D4) · M · M-D1-0

**Qué.** §3.4 y §4: el plugin convierte al entrar (`desdeNumero`) y sale con `aArca`; el payload
de la cola **sigue en números** y suma `moneda` y `cotizacion` como opcionales (rev. 1);
`soap.ts:318`, `:360-368` y `:389-390`; `validacion.ts:30`, `:89-104`; `qr-afip.ts:73-75`;
`fiscal.ts:281-300` a `separarIvaIncluido`; `invoice-core.ts:149-154` con `aBase`;
`fiscal/decidir-comprobante.ts:457` cuenta centavos con el módulo (rev. 1); los lectores de
`Invoice` de §2.3 dejan el conversor tolerante. Migración M-D1-0 y en `schema.prisma` el enum y
los campos `moneda`. **(rev. 1) No frena la prueba de homologación que ordenó el dueño**: esa
prueba corre ya, con el formato de hoy; PF repite su criterio 1 en homologación antes de
publicarse.

**Criterios de aceptación.**
1. Contra el simulador de ARCA: una factura B de un responsable inscripto por $1.000,00 manda
   `ImpTotal` 1000.00, `ImpNeto` 826.45, `ImpIVA` 173.55, una `AlicIva` con esos mismos importes,
   `MonId` PES y `MonCotiz` 1.
2. Test puro del plugin con moneda USD y cotización "1234.567891": `MonId` DOL, `MonCotiz` con
   los 6 decimales y `CanMisMonExt` presente. Es sólo un test: guardar una factura USD lo impide
   el CHECK, y en producción la cotización saldrá de `FEParamGetCotizacion`, nunca tipeada (§4).
3. `validacion.ts` rechaza un comprobante con ImpTotal distinto de ImpNeto + ImpIVA por $0,01
   (hoy pasa por la tolerancia).
4. **(rev. 1) Compatible en las dos direcciones:** (a) un envío encolado antes de PF se procesa
   después con los mismos importes; (b) un envío encolado por PF lo procesa el código de
   `08b4563` (`aEventoPlugin` y `soap.ts` de antes sobre el payload nuevo, con `moneda` y
   `cotizacion` presentes) sin error y con los mismos importes. Es lo que deja volver atrás el
   código después de PF.
5. `grep -n "toFixed\|MONEDA_PESOS}</ar:MonId>\|<ar:MonCotiz>1<" src/plugins/arca/afip/soap.ts` da 0.
6. `decidir-comprobante.ts`: 1,005 da los mismos centavos en la decisión y en lo que viaja a ARCA
   (hoy 100 contra 101 después de PF, si no se cambia) (rev. 1).
7. M-D1-0: subir, bajar y volver a subir en el clon del seed; como `app_rls`, un alta con
   `moneda = 'USD'` rebota.
8. **(rev. 1)** La consulta de §3.4 sobre los envíos pendientes en Neon da 0 filas, guardada en
   `.qa/D1/PF/` antes de publicar.
9. **(rev. 1)** Después del simulador, el criterio 1 se repite en homologación con el CUIT de
   prueba, desde el banco de pruebas en Vercel, antes de publicar PF.
10. Si ENG-022 (factura inmutable) ya está hecho, su trigger incluye `moneda` y `cotizacion` entre
    las columnas que no se pueden cambiar con CAE.

### P1 · Caja y cobros · M · M-D1-1 · después del corte de Caja

**Qué.** `CashMovement.amount`, `CashSession.openingFloat`, `closingExpected`, `closingCounted`,
`closingDiff`, `Payment.amount`, `CommissionPayout.amount` (20 escrituras y 51 lecturas en 25
archivos de `src`, §2.2), más el código de `Collection.amount` que ya es decimal (§2.3) y el saldo
de clientas de `debts/receivable-repo.ts:59,80,117-120` (rev. 1), los scripts `corte-inicial.ts` e
`import-caja-historica.ts`, y `caja/CajaForms.tsx:130,271` y `caja/cierre/ContarYCerrar.tsx:79`
del lado del cliente.

**Criterios de aceptación.**
1. Una venta de $0,10 + $0,20 deja exactamente 0.30 en `CashMovement.amount` (ENG-011 criterio 3,
   parte caja).
2. Arqueo: turno con esperado $1.000,00 y contado $1.000,10 → `closingDiff` 0.10 exacto y el ajuste
   asentado en el libro por 0.10 (invariante 3; junto con ENG-002).
3. Cierre diario de un día con 1.000 movimientos: la suma del módulo es igual a `SUM(amount)` de
   Postgres, al centavo.
4. `sinDecimales(await getCajaData())` y el mismo test en los cargadores del cierre diario, el
   libro de caja y la caja del rediseño: verdadero.
5. Una fila nueva de `AuditLog` de un movimiento y una vieja arman la misma frase en
   `auditoria/frase.ts` (la plata sigue siendo `number` en el JSON).
6. **(rev. 2)** Criterio M completo. En M1, las reescrituras son las de CH: un turno con seña de
   $3.000 al que después se le cobra el saldo (`turnos/cobro-turno-repo.ts:259-262`) y una
   anulación (`turnos/anulacion.ts:409-412`), con el código nuevo. Después de volver al código de
   antes (y otra vez después de la reversa de E), la `Float` de `Payment.amount` = Σ
   `Collection` = lo que entró a la caja ($12.000, no $3.000), y la factura que arma
   `invoice-from-appointment.ts:77-79` sale por ese mismo monto.
7. **(rev. 1)** Saldo de una clienta con fiados de $0,10, $0,20 y $1.000,00 y un cobro de $500,15:
   $500,15 exacto (hoy `receivable-repo.ts` suma en float).
8. Sentencias por cobro (DECISIONS P2): las mismas que antes. El cambio no agrega ninguna.
9. `tsc` 0 errores y `npm test` verde.

### P2a · Servicios y turnos · M · M-D1-2 · después del corte de Vender

**Qué.** `Service.price`, `residentPrice`, `depositAmount`, `Appointment.priceAtBooking`,
`discountAmount` (13 escrituras, 30 lecturas, 22 archivos), incluidos los blueprints del alta de
negocio y la vidriera de CH. Del lado del cliente, `turnos/NewAppointmentForm.tsx:440` y
`turnos/AppointmentRow.tsx:135`, que hoy precargan el monto redondeado a pesos enteros, y sus
campos con `step="1"` (`:437` y `:134`), que rechazan centavos.

**Criterios de aceptación.**
1. **(rev. 1)** Turno de $12.500,50 con un cupón del 10 % (ADR-014), en la unidad que decidió el
   dueño (R4): con peso entero, `discountAmount` 1250 y `priceAtBooking` 11250.50, igual que hoy;
   con centavo, 1250.05 y 11250.45, y un residuo cobrado en efectivo se asienta como descuento por
   redondeo, nunca como saldo pendiente de la clienta. Con precio de vecino (ADR-013) se congela
   `residentPrice` exacto.
2. **(rev. 1)** El monto precargado es el saldo exacto y el campo lo acepta: `step="0.01"` en los
   dos campos (hoy un precio con centavos no se puede cobrar exacto).
3. Seña más saldo cobrados por partes (`Collection`) suman exactamente `priceAtBooking`.
4. La comisión de un turno es `porcentaje(precio, %)` al centavo, y la suma de las comisiones del
   período es igual a `CommissionPayout.amount`.
5. La vidriera de CH (`(site)/page.tsx`, `reserva`, `servicios`) muestra los mismos precios que
   antes (test de render contra el HTML de hoy).
6. Un negocio nuevo creado con cada blueprint tiene sus servicios con precio `numeric` correcto.
7. Criterio M; en M1, un aumento del precio de un servicio (`catalog-actions.ts:207`) y un cambio
   de seña entre subir y bajar se conservan. `sinDecimales` en los cargadores de turnos.

### P2b · Mostrador y vidriera · L · M-D1-3 · después del corte de Vender

**Qué.** `Order.subtotal`, `discount`, `total`, `OrderItem.unitPrice`, `lineTotal`, `Coupon.value`,
`Product.price`, `pricePerKg` (26 escrituras, 88 lecturas, 39 archivos), el SQL crudo de
`planilla-core.ts:617-624` a `::numeric[]`, y las cuentas del cliente de `VenderForm`, `PosForm`,
`AjustarPedidoForm` y las tiendas (§2.5).

**Criterios de aceptación.**
1. Una venta de $0,10 + $0,20 deja exactamente 0.30 en `Order.total` (ENG-011 criterio 3).
2. Pantalla y servidor calculan igual: la firma del reintento (`firmaDelCobro`,
   `vender-pantalla.test.ts`) no cambia, y el total de renglón de `VenderForm` es igual al de
   `order-core` en los 3.300.066 renglones de §3.3.
3. Planilla, aumento de precios y catálogo de la marca: un precio de $1.234,56 queda 1234.56; el
   aumento de 7 % con redondeo al paso da lo mismo que hoy para precios enteros.
4. Carrito de cada tienda: el subtotal es la suma de los renglones ya redondeados (R3).
5. El mismo cupón da el mismo descuento en los 3 caminos, ahora con Decimal y en la unidad de R4.
6. **(rev. 1) `Coupon.value`:** el alta de un cupón rechaza más de 2 decimales, sea porcentaje o
   monto (`numeric(14,2)` redondearía sin avisar), y un cupón de porcentaje entra a las cuentas
   como porcentaje (`porcentaje(base, pct)`), nunca como `Dinero`.
7. Ajuste y anulación (`order-anulacion.ts:816-919`): el total del pedido sigue igual a VENTA −
   EGRESO del libro (junto con ENG-004).
8. `next build`: `/admin/vender` y `/tienda` crecen ≤ 18 KB gzip respecto de antes.
9. Criterio M; en M1, un aumento de precios por la planilla (`planilla-core.ts:617-624`) y un
   ajuste de pedido (`order-anulacion.ts:911-913`) entre subir y bajar se conservan.

### P3 · Compras · S · M-D1-4 · no choca con el rediseño

**Qué.** `StockPurchase.totalCost`, `StockPurchaseItem.lineTotal` → `numeric(14,2)`;
`StockPurchaseItem.unitCost` → `numeric(18,6)` con `aBaseCosto` (rev. 1) (3 escrituras, 20
lecturas, 16 archivos); el código de `AccountPayable` y `PayableCheque` (§2.3); `ComprasForm` y
`DevolucionForm`.

**Criterios de aceptación.**
1. Una compra de 1,5 kg a $1,01 graba 1.52 en `StockPurchase.totalCost` y en
   `AccountPayable.amount`, y el formulario muestra $1,52 (hoy muestra $1,51 y graba $1,50,
   ENG-109).
2. 99.999.999 × $99.999.999 se rechaza con el mismo mensaje pagada y a cuenta corriente (hoy
   pagada se graba 1e+41 y a cuenta corriente falla).
3. Saldo de un proveedor = total − pagos − cheques sin debitar, exacto
   (`debts/payable-service.ts:87-88`).
4. Criterio M.
5. **(rev. 1)** El cargador de cuentas a pagar sigue devolviendo `number` a las páginas, así P3 no
   toca `cuentas-a-pagar/[id]/page.tsx` (rediseño, sin commit); su cuenta de `:70` queda para P5.

### P4 · Stock y costos · M · M-D1-5 · no choca con el rediseño

**Qué.** `StockMovement.unitCost` → `numeric(18,6)` (2 escrituras, 17 lecturas, 14 archivos);
**(rev. 1)** sus escritores `stock/ledger.ts:193,228` con `aBaseCosto`, y el que faltaba en la
versión anterior, `stock/supplier-return.ts:102` → `:259`, con `alCostoUnitario`; el SQL crudo de
`stock/costo.ts:147-157`; valuación, merma, recuento y ajustes; el despiece con `prorratear`
(`carniceria/despiece.ts:37` tiene su propio `round2`); `CarniceriaRubro.sql` y sus lectores
crudos (§5.5).

**Criterios de aceptación.**
1. **(rev. 1)** Despiece: la suma del **costo total** de los cortes más la merma es el costo total
   de la pieza, exacto (`prorratear` sobre el total). No se promete lo mismo para kilos × costo
   unitario: con 6 decimales el desvío por renglón es menor que kilos × $0,0000005, y hoy, con
   2 decimales, ya es de 1 o 2 centavos (`carniceria/despiece.ts:98-101`, `:144`, `:400`).
2. **(rev. 1)** Devolución a proveedor de un producto que entró en dos renglones, 3 × $1.000 y
   4 × $1.001: guarda `unitCost` 1000.571429 sin error (`aBaseCosto`) y devolver las 7 reintegra
   $7.004,00. Con el costo a 2 decimales reintegraría $7.003,99, y con `aBase` tiraría.
3. La valuación del stock es la misma en Inventario, en la ficha del proveedor y en el Inicio
   (`apps/kpis/logistica.server.ts`), al centavo.
4. Cada lector de SQL crudo de una columna `numeric` recibe lo que declara (test con base que
   mira el `typeof` de cada campo): es la clase de error que `tsc` no ve.
5. `CarniceriaRubro.sql` con `:37` y `:62` en `NUMERIC(18,6)` y `:109` en `NUMERIC(14,2)` (§5.5;
   ENG-011 criterio 4, que decía `NUMERIC(14,2)` para las tres, se enmienda).
6. Criterio M, con un costo de 6 decimales en el clon que pasa **sin** autorización (entra en
   `numeric(18,6)`) y uno de 7 que frena.

### P5 · Reportes, libros, cierre de mes y limpieza · M · sin migración

**Qué.** `apps/kpis/*`, `reports/*`, `libros/*` (`csv-ar.ts:85`), `cierre-mes/*`,
`cartera-core.ts`, `crm/*`, `cuentas-a-pagar/[id]/page.tsx:70` (rev. 1): lo que todavía suma en
float después de leer. Se borran los 6 conversores.

**Criterios de aceptación.**
1. `grep -rn '\.toNumber()' src --include=*.ts --include=*.tsx | grep -v '\.test\.' | grep -v 'src/lib/dinero/'`
   da 0 (hoy 40 sin comentarios).
2. Los 6 conversores no existen (`grep` de sus nombres en los 6 archivos da 0).
3. **(rev. 2, objeción 6)** Libro IVA del mes = suma de las facturas por alícuota, exacto. El
   resultado del mes **no** es la caja (`src/lib/reports/resultado.ts:6-32` separa lo que es
   resultado de lo que es plata que se movió): (a) cada movimiento del libro de caja del mes cae en
   una sola categoría del resultado (gasto, no-gasto o venta) y la suma de las categorías da el neto
   del libro, al centavo; (b) las ventas del resultado = `Order.total` + `Payment.amount` del mes con
   el mismo reloj que Reportes (la fecha del cobro), al centavo.
4. El patrón de P0 criterio 3 da 0 en todo `src`, rediseño incluido (rev. 1).
5. P3 de DECISIONS (reportes < 1 s) sin regresión.
6. **(rev. 2)** La guarda de escritura de P0 (criterio 13) frena también en producción, con 2
   semanas de 0 avisos en los logs; el cerrojo de sumas (criterio 14) tiene la lista vacía.

### M-D1-C · Contraer: borrar el espejo y las `Float` · S · destructiva, con su propio OK (rev. 2)

**Cuándo.** Con P5 cerrada, después de un cierre de mes completo sin volver atrás ninguna porción,
y con el deploy publicado **y el anterior** (el destino del *Instant Rollback*) ya en L para las 24
columnas: ningún código que pueda volver nombra una `Float` de D1. Después de M-D1-C, volver a un
código anterior a L exige re-expandir.

**Criterios de aceptación.**
1. El informe de §5.7 («lo que la nueva no guarda igual que la `Float`») guardado en `.qa/D1/`: es
   lo único que se pierde.
2. ENG-011 criterio 2: `SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
   AND data_type = 'double precision' AND (table_name, column_name) IN (<las 24 de §2.2>)` da 0.
3. `SELECT count(*) FROM pg_trigger WHERE tgname = 'd1_espejo'` y `pg_proc` de `d1_espejo` dan 0.
4. Las columnas nuevas cuya `Float` tenía default lo tienen (`SET DEFAULT`), y `prisma migrate diff`
   contra la base da una migración vacía.
5. Re-expandir probado en la base efímera: agrega la `Float` desde la `numeric` y el espejo, y el
   código de antes de L vuelve a andar (exacto al centavo, no al bit).

---

## 7. (f) Riesgos, qué hacer si pasan, y qué necesita el dueño

| Riesgo | Cómo se nota | Qué hacer |
|---|---|---|
| **Una fila en Neon no entra en su columna** (NaN, infinito, un billón o más) | El build frena con "D1: N filas de X no entran…"; la base queda igual (medido) | Es un dato de un cliente: se muestra la fila y **decide el dueño** qué valor corresponde. Después, runbook §P3009 "no llegó a cambiar nada" y *Redeploy*. El chequeo previo (§5.7) lo anticipa |
| **(rev. 1) Una fila tiene más decimales de los que entran** (una comisión de 1851,8505, un costo de 7 decimales) | El build frena con "D1: X tiene importes con más de N decimales sin autorización del dueño (ids: …)"; la base queda igual (medido) | El chequeo previo la lista con su negocio, su mes, su día y medio de caja, y si cae en un mes ya exportado o un día ya cerrado. **Decide el dueño** por id; si autoriza, el id va a `autorizadas` y vuelve a pasar (medido con `prisma migrate deploy`) |
| **La verificación no coincide** en algún negocio | "D1: X no coincide …"; la base queda igual | (rev. 1) Compara cada fila con su valor de antes, no con su propio redondeo: si frena, algo cambió un importe. Se investiga con el ensayo en un branch de Neon; no se reintenta a ciegas |
| **(rev. 1) El rol que migra está sujeto a RLS** | "query would be affected by row-level security policy" (medido); la base queda igual | El chequeo previo (consulta 3) lo anticipa; §5.6 paso 0 |
| **La tabla está tomada** (CH cobrando) | Frena a los 5 s (`lock_timeout`); la base queda igual | Reintentar con el local cerrado |
| **Un lector silencioso** recibe un Decimal (template string, `String()`, `Number()`, SQL crudo tipado a mano, JSON de `AuditLog`) | Un total mal mostrado o concatenado ("1234.5100") en una pantalla o un reporte; la base guarda bien | Se corrige para adelante: el dato está bien. Si es grave, se vuelve al código de antes (anda con la columna `numeric`, medido). Prevención: la búsqueda de §2.4 y los tests `sinDecimales` y de `typeof` en cada porción |
| **Un Decimal llega a un Client Component** | En producción, sin error, como texto (medido) | Idem. Prevención: la regla de §3.5 y `sinDecimales` en cada cargador |
| **Una ruta pasa de 200 KB gzip** por traer el Decimal al navegador | `next build` (cuando ENG-202 mida rutas) | Importar el Decimal desde `@prisma/client-runtime-utils` declarado en `package.json` (13,9 KB en vez de 17,8), con una enmienda a ADR-100 |
| **Choque con el rediseño** | Una porción necesita un archivo con cambios sin commit de otra sesión | Se frena esa porción y se sigue con la de la excepción de §6.0. Nunca se commitea encima |
| **Una migración de D1 llega a `main` antes del OK del dueño** | Todos los builds de producción frenan (la base está atrás); nada se rompe, pero no sale ningún deploy, tampoco el del rediseño | Las migraciones de D1 viven en la rama de su porción hasta la autorización (§5.6) |
| **Hay que volver atrás una porción** | — | (rev. 2) Sólo el código: revertir el commit de L, o *Instant Rollback* si es el deploy inmediatamente anterior (en Hobby no llega más atrás). La `Float` está al día con todo lo que CH cobró en el medio, porque el espejo la mantuvo (medido, T5). La base no se toca; si igual se quiere sacar la columna nueva, la reversa de E entra como migración nueva con el OK del dueño y no reescribe ningún importe. **No hace falta restaurar el branch de Neon**, que sí borraría lo cobrado |
| **Neon se comporta distinto que el Postgres local** (conversión `float8` → `numeric`, tiempos de bloqueo) | Diferencias en el ensayo | Ensayo en un branch de Neon antes de cada porción (runbook §0): un clic del dueño |
| **ARCA rechaza el formato nuevo** | Rechazo en el simulador o en homologación | (rev. 1) PF se prueba contra el simulador y **repite en homologación** su criterio 1 antes de publicarse. La prueba de homologación que ordenó el dueño corre ya con el formato de hoy y no espera a D1 |
| **(rev. 1) Se vuelve al código de antes después de PF** | — | El payload de la cola sigue en números: el código de antes procesa lo que encoló PF (PF criterio 4b) |
| **La cola de ARCA tiene envíos pendientes** al publicar PF | Un envío que el validador nuevo rechaza queda `REJECTED` para siempre sin llegar a ARCA (`arca-dispatch.ts:221-228`) | (rev. 1) La consulta de §3.4 da 0 filas antes de publicar (PF criterio 8) |

**Qué necesita del dueño (rev. 1: son cuatro cosas, no una).**

| Qué | Opciones y recomendación | Cuándo |
|---|---|---|
| **Aplicar cada migración en Neon**, por el camino de §5.6 | M-D1-0 (moneda, aditiva) con PF o P1, la que salga primero; M-D1-1 a M-D1-5, una por porción, con el local de CH cerrado. Recomendación: autorizarlas de a una | con el código de su porción |
| **M-D1-C**, destructiva (rev. 2): borra el espejo y las 24 `Float`. Después, volver a un código anterior a L exige re-expandir (exacto al centavo, no al bit) | Recomendación: autorizarla recién después de P5, de un cierre de mes completo sin volver atrás, y con el deploy publicado y el anterior ya en L | con su propio OK |
| **Filas con más decimales de los que entran, o que no entran** (sólo si el chequeo previo las encuentra) | Redondearla (el id va a `autorizadas`) o corregir el dato antes de migrar. El informe dice si cae en un día de caja cerrado o en un mes ya exportado al contador: redondearla cambia un número que alguien ya vio | antes de agendar la porción |
| **Unidad del descuento de un cupón porcentual** (R4): cambia lo que pagan las clientas | (a) **Peso entero, recomendado** y provisional mientras no decida: es lo que ven hoy las clientas de CH en turnos, el campo de cobro no acepta centavos y el efectivo no se da en centavos; cambia sólo el mostrador (hoy al centavo), por menos de $0,50 por venta. (b) Centavo: cambia el precio de los turnos de CH por menos de $0,50, pide `step="0.01"` en el cobro y asentar el residuo en efectivo como descuento por redondeo. Se cambia en un solo lugar | antes de cerrar P0; no frena nada |

Todo lo demás (diseño, código, tests, orden) no necesita al dueño.

---

## 8. Qué NO se pudo verificar, y por qué

- **Neon.** Esta máquina no llega a Neon, y medirlo es D2 (ENG-204), pendiente. No se sabe: el
  volumen de cada tabla, si hay NaN, valores fuera de rango o fracciones de centavo (en los clones
  de `erp_lab` y `erp_perf` hay 0 en las 24 columnas, y la revisión encontró 0 costos con
  fracción en 35 bases locales), en qué meses caerían (y si ya se exportaron), si alguna tabla
  tiene FORCE, si `neondb_owner` tiene `BYPASSRLS`, la versión de Postgres, cuánto dura el
  bloqueo, si las 4 migraciones de `lote-deploy.txt` ya se aplicaron, ni si `CarniceriaRubro.sql`
  se aplicó. La conversión `float8` → `numeric` por 15 cifras se midió en Postgres 16.13.
- **(rev. 1) Si CH usa el mostrador con cupones.** Define a quién le cambia el precio la decisión
  de R4; sin Neon no se puede contar.
- **El tamaño real de las rutas.** Sólo se midió el Decimal aislado (17,8 KB gzip importado como
  lo haría el módulo; 13,9 KB desde `@prisma/client-runtime-utils`). El bundle de cada ruta es
  ENG-202.
- **El serializador de React** se probó aislado (`react-server-dom-webpack` de Next 16.3.4, en
  desarrollo y en producción), no renderizando una página real.
- **El inventario de lecturas es el de primer nivel** que marca `tsc`. Al arreglar un borde pueden
  aparecer usos más adentro, y las lecturas que compilan igual (§2.4) se buscaron con patrones, no
  exhaustivamente. La primera versión se equivocó así con `supplier-return.ts:102` (rev. 1).
- **ARCA real.** La política de red rechaza `*.afip.gov.ar` y `arca.gob.ar` desde acá. Los
  formatos de `MonCotiz` (4 + 6) y `CanMisMonExt` (S/N) los confirmó una revisión contra el manual
  de WSFEv1 v4.0; la tolerancia del error 10051 (≤ $0,01 o ≤ 0,01 %) y que la cotización tenga
  que ser la del BNA del día hábil anterior salen de la otra revisión, por fuentes secundarias.
  Nada de esto se probó con una llamada. Se cierra con la prueba de homologación (DECISIONS §5.0)
  y con PF criterio 9.
- **(rev. 1) Lo legal y lo impositivo de cada negocio:** si sigue vigente el art. 9 bis de la
  Ley 22.802 (vuelto menor a 5 centavos a favor del consumidor; sólo importa si el dueño elige
  centavo en R4), la condición frente al IVA de CH y si algún negocio es agente de percepción
  (percepciones, fuera de D1, §3.3).
- **Los tests de integración de los criterios** no existen todavía: dependen de ENG-000. Lo medido
  acá corrió con `psql`, `prisma migrate deploy` y scripts contra clones locales, fuera de
  `npm test`. **(rev. 1)** La plantilla revisada se midió con tablas mínimas
  (`.qa/D1/rev1/probar.sh`, casos A a G, re-corrido el 2026-09-25) y con un proyecto Prisma mínimo
  (`.qa/D1/rev1/probar-prisma.sh`), no sobre el clon completo de `erp_perf`: eso es M1 a M4 de cada porción.
- **El seed P7** (ENG-201) no existe: subir, bajar y volver a subir con la plantilla anterior se
  midió sobre un clon de `erp_perf` (38.284 importes) y una tabla sintética de 120.000 filas.
- **La deriva de las cantidades en float** (§2.7) no se midió.
- **El costo del Decimal en el camino de una request** no se midió: sólo aislado (13,8 µs las
  cuentas de una venta de 10 renglones, `$D1/proto/costo-decimal.mjs`).

---

**(rev. 2) Lo que el prototipo de expandir y contraer no midió:**
- El espejo con Prisma: el prototipo es SQL puro sobre una tabla de la forma de `Order`. Qué manda
  el cliente nuevo cuando omite un campo con `@default(0)` y la columna nueva no tiene default en la
  base (el espejo da 0 en los dos casos, pero no se corrió): M1 y M5 lo miden.
- El tiempo con la tabla tomada, con el espejo, sobre el seed de 50.000 (M7) y en Neon.
- La guarda de escritura (P0 criterio 13) en escrituras anidadas de Prisma 7: diseño, sin prototipo.
- Las 13 tablas reales: el prototipo cubre dos columnas de una tabla; la plantilla por lista `pares`
  no se corrió todavía.

## 9. (rev. 1) Qué dijo cada revisión y dónde quedó

**(rev. 2, 2026-09-25)** El método vuelve a ser el del dueño (expandir y contraer, §5.1). Las siete
objeciones abiertas de ENG-011 quedan respondidas: (a) método → §5.1-§5.4; 1 reversa bloqueada por
`predeploy-check` → §5.6 paso 3 y M4; 2 guarda de escritura → P0 criterio 13; 3 evidencia en el
scratchpad → `.qa/D1/medicion/`, P0 criterio 15; 4 sumas en float → P0 criterio 14 y P5 criterio
6; 5 consulta 2 → §5.7 con factura, caja y valor propuesto, autorización por valor; 6 resultado ≠
caja → P5 criterio 3. La tabla de abajo es la de la rev. 1; donde dice «§5.4» o «respaldo», rige
§5 de la rev. 2.


Las dos revisiones refutaron la versión anterior. Todo lo que afirmaban con archivo y línea se
verificó contra el código (`08b4563` y el árbol) y se sostiene; las dos reproducciones de la
reversa se repitieron con la plantilla nueva.

| Revisión | Punto | Veredicto | Dónde quedó |
|---|---|---|---|
| 1 y 2 | La reversa (`coalesce`) devuelve el respaldo en filas reescritas después de migrar | **Cierto**, reproducido (caso B: la seña de $3.000 con la caja en $12.000; el precio de $13.500 vuelve a $12.000) | §5.4: usa el respaldo sólo si la fila sigue valiendo lo mismo; criterio M1 en cada porción |
| 1 | Los costos unitarios no vienen al centavo; falta `supplier-return.ts:102` en el inventario | **Cierto** (6 decimales; `ledger.ts:111-113` no lo reemplaza) | §2.2, §2.9, R2: costos a `numeric(18,6)`; P4 criterio 2 |
| 1 | PF frenaba la prueba de homologación que ordenó el dueño | **Cierto** | §3.4, §6.0, PF: la prueba corre ya; PF la repite (criterio 9) |
| 1 y 2 | La verificación compara el redondeo contra sí mismo; el chequeo previo era opcional | **Cierto** | §5.4: fila por fila contra el valor de antes; §5.7 obligatorio; una fracción frena y decide el dueño |
| 2 | Sumar por negocio y medio Σ float = Σ numeric en caja | **Innecesario como control aparte**: la verificación fila por fila es más estricta (si una fila cambia, frena); una suma sólo puede diferir por filas que el dueño autorizó, y el informe las da por día y medio | §5.7 |
| 1 | RLS forzado: la migración convertía la tabla viendo 0 filas | **Cierto**, reproducido | `row_security = off` en el bloque (caso G); M3; §5.6 paso 0 |
| 1 | La reversa no dice qué hacer con `_prisma_migrations` ni con los `@ignore` | **Cierto** | La reversa es una migración nueva con su commit de schema; medido que `migrate status` queda al día (M4) |
| 1 | PF no era compatible hacia atrás (textos en el payload) | **Cierto** | §3.4: el payload sigue en números; PF criterio 4b |
| 1 | En Hobby el *Instant Rollback* sólo llega al deploy anterior | **Cierto** (`migracion-caja-neon.md:153-154`) | §0, §5.1, §5.6, §7 y M5 |
| 1 | El patrón de P0 no ve redondeos vivos; `decidir-comprobante.ts:457` | **Cierto**: con el patrón ampliado, 59 en `08b4563` y 80 en el árbol | P0 criterio 3; PF criterio 6 |
| 1 | Escritores y JSON que faltaban (`fix-magra-mock-prices`, `aislamiento-capa-app`, `verify-async-tenant-isolation`, `Invoice.ivaDesglose`) | **Cierto** | §2.2, §2.3, §2.4 |
| 1 | P3 toca `cuentas-a-pagar/[id]/page.tsx:70` (rediseño) | **Cierto** (el archivo tiene cambios sin commit) | P3 mantiene `number` en su cargador (criterio 5); la línea va a P5 |
| 2 | R4 en turnos es una decisión comercial del dueño; `step="1"` | **Cierto**. Cambia la recomendación: peso entero | §3.3 R4, §7, P0 criterio 4, P2a criterios 1 y 2 |
| 2 | Percepciones sin regla | **Cierto** | §3.3: fuera de D1, con la regla escrita para cuando se construya |
| 2 | Cupón de monto fijo con varias alícuotas; nota de crédito | Aporte, sin error en el plan | §3.3 R5 |
| 2 | De dónde sale la cotización; el libro IVA no convierte | **Cierto** | §4 |
| 2 | `Tenant.moneda` sin CHECK y sin uso; `MovimientoImportado` rotularía ARS un extracto en dólares | **Cierto** | §4: las dos salen de M-D1-0 |
| 2 | Costos unitarios con 2 decimales; P4 "exacto" | **Cierto** | R2; P4 criterio 1 dice qué es exacto y qué no |
| 2 | `Coupon.value` mezcla porcentaje y monto | **Cierto** | §2.9, §5.7 consulta 2, P2b criterio 6 |
| 2 | Saldo de clientas sin criterio | **Cierto** | P1 criterio 7 |
| 2 | Homologación: repetir PF-1; la cola contra el validador nuevo | **Cierto** | PF criterios 8 y 9 |
