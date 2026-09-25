---
id: ADR-100
nivel: fundacional
dominio: [Arquitectura, Datos, Fiscal]
depends_on: [ADR-022, ADR-064]
---

# ADR-100 — El dinero se guarda y se calcula en decimal, con moneda: `numeric(14,2)` en la base y el Decimal de Prisma en el código

**Estado:** Aceptado, fondo y método (revisión 2, 2026-09-25). El método de migración es el del
dueño, **expandir y contraer con reversa probada** (`docs/agent/DECISIONS.md` §5.0, `:201-203`); el
dueño aprobó mantenerlo el 25/09. La revisión 1 lo había reemplazado por un cambio de tipo en el
lugar; la revisión 2 vuelve al método del dueño y responde las objeciones que la rev. 1 le hacía
(punto 6 y «Sub-decisión de migración»). Las siete objeciones abiertas de ENG-011 quedan
respondidas en `BACKLOG.md`. Nada aplicado en ninguna base real: cada expansión y la contracción
llevan su OK del dueño en el momento.
**Revisión 1 (2026-09-25)**. La decisión de fondo la tomó el
dueño el 2026-09-24 (D1 → A, `docs/agent/DECISIONS.md` §5.0); este ADR fija el cómo. Dos
revisiones refutaron la primera versión: la reversa de la migración deshacía cobros hechos
después de migrar, afirmaba que los costos unitarios ya vienen al centavo (falso:
`src/lib/stock/supplier-return.ts:102`), la verificación comparaba el redondeo contra sí mismo y
el plan frenaba la prueba de ARCA que ordenó el dueño. Los puntos 1, 3, 4, 5 y 6 y las
consecuencias se corrigieron; el detalle está en `D1-PLAN.md` §9. · **Reemplaza:** ADR-057 entero. ·
**Depende de:** ADR-022 (plugin ARCA), ADR-064 (invariantes del núcleo transaccional). ·
**Relacionados:** ADR-014 (cupones: la unidad del descuento la decide el dueño), ADR-099 (rediseño: fija el
orden de las porciones). · **Plan ejecutable:** `docs/agent/D1-PLAN.md`. ·
**Slices:** ENG-011 y ENG-109 de `docs/agent/BACKLOG.md`.

> Numeración: el 100 no aparece en ningún archivo de `docs/adr` de las ramas remotas del repo
> (medido el 2026-09-25 con `git ls-tree` de `docs/adr` en cada rama de `origin`: la más alta es
> ADR-098; ADR-099 existe sólo sin commit en el árbol de trabajo). Si al mergear ya está tomado,
> se renumera antes de llegar a `main`.

## Contexto

Todo medido sobre el commit `08b4563` (salvo donde dice "árbol de trabajo") y la base local
Postgres 16.13. Los scripts están en el scratchpad de la sesión; `D1-PLAN.md` §1 dice cuáles son
y ENG-203 los trae al repo.

1. **24 de las 33 columnas de importe son `Float`** (double de 8 bytes) y 9 son `numeric(14,2)`;
   0 columnas de moneda (`prisma/schema.prisma`, detalle por columna en `D1-PLAN.md` §2).
   `prisma/pending-gate2/CarniceriaRubro.sql:37`, `:62` y `:109` agregan tres más en
   `DOUBLE PRECISION`.
2. **Las 9 que ya son decimales se vuelven `number` al leerlas:** 40 llamadas a `.toNumber()`
   (sin contar comentarios) en 18 archivos y 6 copias de un conversor tolerante (`facturacion-actions.ts:52`,
   `libro-iva-loader.ts:53`, `bancos-glue.ts:71`, `resumen-cuentas.ts:99`, `cartera-core.ts:251`,
   `paquete-lectura.ts:44`). La cuenta que sigue se hace en float.
3. **El redondeo único de ADR-057 es el que falla.** `round2` (`src/lib/round.ts:18-20`,
   `Math.round((n + Number.EPSILON) * 100) / 100`) baja 587.189 de los 10.000.000 de importes
   x,xx5 entre $0 y $100.000 (5,87 %; mismo número que la auditoría de ENG-109). Un renglón de
   precio con centavos por cantidad con tres decimales da un centavo distinto del exacto en
   2.711 de 3.300.066 casos (0,08 %; ej. 2,250 × $1,90 = 4,275 → `round2` da 4,27).
4. **Hay 26 redondeos a mano** con la forma `Math.round(x * 100) / 100` fuera de `round.ts`; en
   el árbol de trabajo, con el rediseño sin commit, 37. Con un patrón que ve también las otras
   formas (`* 1e6`, `Number(x.toFixed(2))`, centavos con `Math.round(x * 100)`), 59 y 80 (rev. 1;
   el patrón está en `D1-PLAN.md` P0 criterio 3).
5. **La suma en float se desvía:** 100.000 sumas de $1.234,56 dan 123.456.000,0001577.
6. **El borde fiscal formatea con `toFixed` de un double** (`src/plugins/arca/afip/soap.ts:389-390`):
   1,005 sale "1.00" y 2,675 sale "2.67". Hoy no llega un medio centavo porque todo pasa antes por
   `round2`, pero la exactitud depende de eso y no del tipo. ARCA recibe `MonId` fijo `PES` y
   `MonCotiz` 1 (`soap.ts:367-368`).
7. **El estándar lo exige** (`Factory-GSG/.claude/rules/engineering.md` §2: "Dinero: tipo
   decimal en DB y en código, nunca float. Moneda explícita en cada importe. Reglas de redondeo
   escritas en un solo lugar y testeadas"; §11: "Prohibido: float para dinero").

ADR-057 sostenía que "el riesgo real del number no es guardar sino acumular, y redondear
distinto en dos caminos", y que un redondeo único lo resolvía. El punto 3 muestra que ese
redondeo único falla por sí solo, y los puntos 2 y 4 que la regla no está en un solo lugar.

## Decisión

1. **En la base, todo importe es `numeric(14,2)` y todo costo unitario `numeric(18,6)`** (rev. 1).
   Un costo unitario es una tasa que sale de dividir, no un precio de lista: la devolución a
   proveedor guarda un costo promedio con 6 decimales (`src/lib/stock/supplier-return.ts:102` →
   `:259` → `stock/ledger.ts:187-193`; 3 × $1.000 + 4 × $1.001 da 1000,571429), y con 2 decimales
   devolver las 7 unidades reintegraría $7.003,99 en vez de $7.004,00. Son
   `StockMovement.unitCost`, `StockPurchaseItem.unitCost` y, en `CarniceriaRubro.sql`,
   `Product.cost` y `ProductBatch.unitCost`. La primera versión decía que el código ya los
   redondeaba al centavo: era falso. Rango de los dos tipos: menos de $1.000.000.000.000 (12
   enteros). ARCA acepta 13 enteros y 2 decimales, así que un importe entra.
2. **En el código, el tipo es el Decimal que ya trae Prisma** (decimal.js 10.5, dentro de
   `@prisma/client-runtime-utils` 7.8.0), detrás de un módulo de dominio: `src/lib/dinero/`. Se
   importa por `@/generated/prisma/browser`, que es la entrada que Prisma declara apta para el
   navegador: servidor y Client Components hacen la misma cuenta con la misma clase. **No se
   agrega ninguna dependencia.** El módulo usa un clon con 34 cifras de precisión y
   `ROUND_HALF_UP`, y nunca opera sobre los Decimal que devuelve Prisma sin envolverlos.
3. **Una sola regla de redondeo, en `src/lib/dinero/redondeo.ts`:** medio hacia arriba (lejos del
   cero, igual que `round()` de Postgres), al centavo, por renglón; IVA incluido por residuo
   (`neto = centavo(total / (1 + alícuota))`, `iva = total − neto`, así ImpNeto + ImpIVA =
   ImpTotal exacto); prorrateo por mayor resto; un `number` entra por 15 cifras significativas
   (lo mismo que hace Postgres al pasar `float8` a `numeric`); un costo unitario se redondea a 6
   decimales con la misma regla. Medido: 0 errores en los 10 M de x,xx5, en los 3,3 M de
   renglones y en 1 M de sumas. **La unidad del descuento de un cupón porcentual (peso entero o
   centavo) la decide el dueño** (rev. 1): cambia lo que pagan las clientas. Mientras no decida,
   peso entero, que es lo que hoy ven las clientas de CH en los turnos; se cambia en un solo
   lugar. Percepciones y otros tributos quedan fuera: hoy `ImpTrib` va en 0 (`soap.ts:365`).
4. **Bordes con tipo fijo:**
   - A un Client Component, a una Server Action que responde y al JSON de `AuditLog` viaja
     `number`. Es sin pérdida para `numeric(14,2)`: 10.000.000 de importes al azar ida y vuelta,
     0 distintos. Un Decimal que llega crudo a un Client Component da un error en consola en
     desarrollo y, **en producción, llega como texto sin avisar** ("1234.5"), donde un `+`
     concatena: medido con el serializador de React que trae Next 16.3.4.
   - A Prisma se escribe el texto canónico `"1234.56"`: la base nunca redondea (medido: si le
     llega "99999.995", `numeric(14,2)` guarda 100000.00 sin avisar).
   - A ARCA van textos `"1234.56"` hechos por el módulo, nunca `toFixed` de un double.
   - **El payload de la cola de ARCA sigue en `number`** (rev. 1), y `moneda` y `cotizacion` se
     suman como opcionales. Así el código de antes procesa lo que encola el nuevo y al revés: se
     puede volver atrás el código después del cambio fiscal sin romper los envíos pendientes. El
     plugin convierte al entrar.
5. **Moneda explícita.** Enum `Moneda { ARS USD }`. Las 11 tablas que registran un hecho de plata
   (Order, Payment, Collection, CashSession, CashMovement, CommissionPayout, StockPurchase,
   AccountPayable, PayableCheque, AccountReceivable, Invoice) llevan su columna `moneda`, por
   defecto `ARS`, con un `CHECK (moneda = 'ARS')`. Mientras exista el CHECK, el código que todavía
   no mira la moneda es correcto; sacarlo es decidir operar otra moneda, con su ADR.
   `Invoice.cotizacion numeric(10,6)` (MonCotiz de WSFEv1: 4 enteros y 6 decimales; 1 para pesos)
   llega a `MonId`/`MonCotiz` por el mapeo del plugin (ARS → PES, USD → DOL); para otra moneda
   sale de `FEParamGetCotizacion` para la fecha del comprobante y nunca se tipea. **(rev. 1) No
   llevan moneda** `Tenant` (nadie la usaba y sin CHECK permitía leer precios en dólares contra
   hechos en pesos; en Argentina la moneda es de la lista de precios, no del negocio) ni
   `MovimientoImportado` (el importador no sabe la moneda de la cuenta: un `DEFAULT 'ARS'`
   rotularía pesos un extracto en dólares). Las dos van al ADR que habilite otra moneda, igual que
   la conversión en el libro IVA, que hoy lee los importes de `Invoice` sin convertir.
6. **(rev. 2) Migración: expandir y contraer, por porción.** Antes de cada porción, un chequeo de
   sólo lectura en Neon es obligatorio. **E (expandir):** una migración aditiva por porción agrega
   `<campo>_num numeric(14,2)` (`numeric(18,6)` los costos unitarios), **nula y sin valor por
   defecto**, y un trigger `d1_espejo` que mantiene las dos columnas iguales mientras conviven
   (alta del código nuevo: la `Float` copia la nueva; alta o cambio del código viejo: la nueva es el
   redondeo de la `Float`; NaN o infinito: error). En el mismo bloque rellena la nueva sin tocar la
   `Float` (bit por bit), verifica cada fila contra su valor de antes y la vuelve obligatoria. **Una
   fila con más decimales de los que entran frena la expansión** hasta que el dueño autoriza su
   valor (tabla, columna, id, valor). El bloque apaga `row_security`: un rol sujeto a RLS falla en
   vez de rellenar sólo lo que ve. **L (leer desde la nueva):** el código de la porción, en un PR
   aparte y después de E, usa `Decimal @map("<campo>_num")`; la `Float` sale del schema y el espejo
   la mantiene al día. **Vuelta atrás hasta la contracción: sólo el código** (revertir L o *Instant
   Rollback*); la reversa de E, si hace falta, borra la columna nueva y el espejo y no reescribe
   ningún importe. **C (contraer):** al final, con su propio OK, se borran el espejo y las 24 `Float`.
   Detalle y prototipo medido: `D1-PLAN.md` §5 y `.qa/rec-2509/disenos-variantes-d1/`.
7. **Fuera de este ADR:** las 9 columnas `Float` que no son plata (cantidades, kilos y
   porcentajes) siguen `Float` y entran al módulo por la regla de las 15 cifras.

## Alternativas descartadas

**A · Float con redondeo único (ADR-057).** Es lo que hay y lo que se midió fallando (Contexto
3 a 6). Además, una suma hecha por la base (`aggregate`, `SUM`) sobre `float8` arrastra el error
aunque el código redondee bien. Contradice §2 y §11 del estándar, y el dueño eligió D1-A.

**B · Enteros en centavos** (`Int`/`BigInt` en la base, `number` entero en el código). Es exacto
para sumar y restar, pero no ahorra redondeos: precio × kilos, porcentajes e IVA dan fracciones
de centavo igual que con Decimal. Lo que agrega es un cambio de unidad en cada borde (pantallas,
formularios, ARCA, Mercado Pago, extractos bancarios y reportes trabajan en pesos) y la clase de
error "pasé pesos donde iban centavos", que se equivoca por 100 veces y el tipo no la detecta:
`number` es `number`. `Int` de Postgres se queda corto ($21.474.836,47) y `BigInt` no pasa por
`JSON.stringify`, que usa `AuditLog`. El radio medido del cambio (195 lecturas en 74 archivos,
64 escrituras, 224 llamadas a `round2`, 50 Client Components que nombran importes) se pagaría
dos veces, una para el tipo y otra para la unidad. ADR-057 la descartó por lo mismo.

**C · Decimal (`numeric` + el Decimal de Prisma). Elegida.** Es exacto, no cambia la unidad
(pesos), es el mismo tipo que Prisma ya devuelve para las 9 columnas decimales y el que ARCA
entiende (texto decimal). El precio asumido está abajo.

**Sub-decisión de migración (rev. 2) · cambio de tipo en el lugar, con respaldo aditivo.** Lo
propuso la rev. 1 y se probó en local (`.qa/D1/rev1/`, `.qa/D1/medicion/proto/p*_*.sql`): el código
viejo y el nuevo leen y escriben la misma columna aunque cambie de tipo. Se descarta:
- **Contradice la decisión del dueño** (`DECISIONS.md` §5.0) y el estándar (§2: «aditivas primero,
  destructivas después»): el cambio de tipo reescribe la columna viva en el mismo paso.
- **Su reversa reescribe importes:** tiene que decidir fila por fila si devuelve el respaldo o se
  queda con el valor vigente. La primera versión se equivocó (devolvía la seña de $3.000 de un turno
  cobrado por $12.000, reproducido). Con expandir y contraer, la reversa no reescribe nada: la
  `Float` quedó al día.
- Las tres razones con que la rev. 1 descartó expandir y contraer eran defectos del prototipo: la
  columna nueva con `DEFAULT 0` (el alta de $100 que quedaba en $0; ahora nace sin default y queda
  $100, medido), `predeploy-check` sin `@map` (se corrige en P0, criterio 12) y que el código viejo
  no arranca después de contraer (cierto de toda contracción: por eso va última y con su OK).
- El precio asumido de expandir y contraer: 13 triggers y una función durante la transición, un
  deploy de código más por porción (E y L separados) y un `@map` permanente por columna.

## Consecuencias

- **(+)** La base guarda exacto y suma exacto. Pantalla y servidor calculan con la misma regla y
  la misma clase: desaparecen los 2.711 renglones de 3,3 M que hoy difieren en un centavo entre
  lo que muestra el mostrador y lo que se graba.
- **(+)** Una sola regla, con test que barre los casos. Los redondeos a mano y las 6 copias
  del conversor dejan de existir (criterio medible con `grep`, `D1-PLAN.md` P0 criterio 3 y P5).
- **(+)** La moneda queda escrita en cada hecho de plata y el camino a `MonId`/`MonCotiz` existe
  y se prueba contra el simulador, aunque hoy todo sea ARS.
- **(−) Asumido: el Decimal no se puede usar con `+`, `*` ni `>`.** Cada lectura se reescribe
  con el módulo. `tsc` encuentra las que son de tipo (195 sitios en `08b4563`, unión de una corrida
  por columna; con todas a la vez, 202 errores en `08b4563` y 221 en el árbol de trabajo con el
  rediseño), pero no las silenciosas: template strings, `String()`,
  `Number()`, JSON. Esas se buscan a mano en cada porción (`D1-PLAN.md` §2.4).
- **(−) Asumido: +17,8 KB gzip** en las rutas cuyo código de cliente hace cuentas de plata
  (Vender, Caja, Pedidos, Compras, las tiendas), por traer el Decimal al navegador. El tope por
  ruta es 200 KB (DECISIONS P6a) y el tamaño real de las rutas todavía no está medido (ENG-202).
  Si una ruta se pasa, se importa el Decimal desde `@prisma/client-runtime-utils` declarado en
  `package.json` (13,9 KB), con una enmienda a este ADR.
- **(−) Asumido: un cambio visible en uno de los dos caminos del cupón.** El descuento de un
  cupón porcentual hoy se redondea a pesos enteros en los turnos (`src/lib/actions.ts:342`) y en
  la vista previa del cupón (`coupon-actions.ts:144`), y al centavo en la venta
  (`venta-reglas.ts:455`). Una sola regla cambia uno de los dos lados. Es una decisión comercial
  del dueño (rev. 1); mientras no decida, peso entero: los turnos de CH no cambian, el campo de
  cobro de los turnos no acepta centavos (`step="1"`) y el mostrador pasa a pesos enteros (menos
  de $0,50 por venta).
- **(−) Asumido: una migración puede frenar por un dato de un cliente** (una fila con más
  decimales de los que entran, NaN o fuera de rango) y esperar a que el dueño decida esa fila.
  Es el precio de no redondear datos ajenos sin avisar (rev. 1).
- **(−) Asumido: el despiece sigue sin cerrar al centavo en kilos × costo unitario.** Lo exacto
  es el costo total prorrateado; con el costo unitario a 6 decimales el desvío baja de 1 o 2
  centavos a menos de kilos × $0,0000005 por renglón.
- **(+) La prueba de ARCA en homologación no espera a D1** (rev. 1). Corre con el formato de hoy
  y el cambio fiscal de D1 la repite antes de publicarse.
- **(−) Asumido: el tipo `Float` de Prisma deja de existir para plata**, y un Client Component
  nunca recibe un tipo de Prisma: recibe números. Es la regla que hoy se cumple (0 de 125
  Client Components importan `generated/prisma` en `08b4563`, 0 de 156 en el árbol de trabajo) y
  pasa a ser obligatoria.
- **(−) Asumido (rev. 2): cada expansión toma la tabla en exclusiva** mientras agrega, rellena y
  verifica. Con el cambio en el lugar se midió 1,5 s para las 5 porciones juntas en local; con el
  espejo no está medido (criterio M7 de cada porción, sobre el seed de 50.000). En Neon no está
  medido: se aplica con el local cerrado.
- **(−) Asumido (rev. 2): durante la transición hay una segunda escritura en la base** (el espejo),
  una sola función con tests (`D1-PLAN.md` P0 criterio 16), que se borra en la contracción. Es el
  costo de que el código viejo y el nuevo convivan durante cada deploy sin buscar a mano los 64
  escritores de las 24 columnas.
- **(−) Asumido: durante la transición conviven tipos.** Un camino que lee una columna ya
  convertida y otra todavía `Float` convierte en el borde, con `desdeNumero`. Se termina cuando
  cierra la última porción.
- **Reemplazo de ADR-057:** su §2 (redondeo EPSILON) queda derogado por el punto 3 de este ADR;
  su §3 (Decimal sólo en el borde de `Invoice`) por los puntos 1 y 2; su §1 (rechazo de
  centavos enteros) se confirma por otras razones (alternativa B).
