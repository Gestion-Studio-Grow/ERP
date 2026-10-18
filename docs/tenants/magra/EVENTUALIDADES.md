# MAGRA — Matriz de eventualidades

**Fecha:** 2026-10-18 · **Rama:** `claude/magra-nivel-bp` · **Formato modelo:** `docs/tenants/breakpoint/REINGENIERIA.md` §4
**Tenant:** `magra` (rubro `carniceria`) — boutique de carnes envasadas al vacío en Canning. Vende por kilo y por
unidad, por la tienda online (`/tienda`), por WhatsApp y en el mostrador.
**Etapa comercial:** preventa / demo. Nada de esto toca Neon, ni deploy, ni datos reales.

> **Qué es esto.** Las cosas que salen mal un sábado a la mañana en una carnicería boutique, y qué hace el sistema
> **hoy** con cada una. Cada afirmación sobre el sistema actual trae `archivo:línea`, y cada cita se verificó
> abriendo el archivo en esta rama, no de memoria. Lo que es dato del negocio y no tenemos (horarios, tolerancias,
> WhatsApp del local, zonas) dice **provisional a confirmar**.

---

## 0. Calibración (ADR-052)

- **Leído:** `CLAUDE.md`, `brain/20-lecciones/000-INDICE.md` (DB-4 unicidad en la base, DX-4 WhatsApp desde el
  helper único, MP-8 la lógica de plata va con tests), `docs/tenants/breakpoint/REINGENIERIA.md` §4,
  `docs/tenants/magra/` (BACKLOG, PROXIMOS-PASOS, pos-orden-capability, blueprint-y-vidriera) y
  `docs/ESTADO-ACTUAL.md` (Magra: alta hecha en Neon, falta deploy y datos reales; Gate de negocio: cobro MP,
  fotos, precios reales).
- **Principios de esta pasada:**
  1. El mostrador no sale a buscar problemas: **el sistema se los pone adelante**, con la acción en un toque.
  2. Toda regla de plata vive en una función pura con test; la pantalla sólo pinta (como hace hoy el código).
  3. Nada inventado: lo que no se sabe del negocio queda "provisional a confirmar".
  4. Argentina primero: WhatsApp 1 a 1 (el sistema no manda solo), efectivo/transferencia/MP, cortes de luz.
  5. Primero lo que se arregla **sin migración** (reversible, ADR-048); lo que pide columna o enum nuevo es Gate 2.
- **Zona de de-sesgo (ADR-046):** reglas y motor = **estándar**. Textos de pantalla y WhatsApp propuestos =
  **humana/criolla**.

**Lo que encontramos, en una línea:** el código de Magra ya resolvió bien lo más difícil (doble envío, peso real
con precio congelado, stock que no se sobrevende, cobro en duda sin cobrar dos veces). Los huecos que quedan son
de **visibilidad** (el pedido que entra y nadie mira, el que está listo y nadie retira, la clienta que pide dos
veces) y de **aviso** (precio que cambió en la cara de la clienta, caja de turno que cierra con diferencia sin
decir por qué). Casi todos se arreglan sin tocar la base.

---

## Estado después de esta rama (`claude/magra-nivel-bp`, 18/10/2026)

La columna «Hoy» de la matriz es la foto de **antes** del frente. Quedó hecho en la rama, sin migración y con test:

| Caso | Qué quedó hecho | Lo que falta |
|---|---|---|
| 1 · Pedido web que nadie vio | La bandeja dice «N de la tienda esperando · el más viejo hace X min», en alerta pasados 15 min (`pedidos-core.ts`, `pedidos/page.tsx`). | El contador en Vender y un aviso fuera del panel (mail: necesita `RESEND_API_KEY`, decisión del dueño). |
| 2 · Peso real distinto | «Pesar y ajustar» avisa, sin frenar, cuando el peso se aparta más de ±15 % de lo pedido (`pos-peso.ts`, `AjustarPedidoForm.tsx`). | La cantidad original no se guarda aparte: si ya se pesó una vez, se compara contra esa pesada. |
| 4 · Clienta que no retira | La bandeja cuenta «listos desde ayer sin retirar» y ofrece el recordatorio por WhatsApp 1 a 1 (`order-anulacion.ts`, `PedidoCajon.tsx`). | El estado «No retiró» (migración) y el motivo sugerido al anular. |
| 6 · Caja que no cuadra | Cerrar el turno con diferencia pide la nota, como el cierre del día (`caja-actions.ts`); el cierre del día ya no pinta la apertura como ingreso (D2 del UAT). | El bloque «antes de cerrar, mirá» con las causas típicas. |
| 7 · Precio viejo | La tienda avisa en la línea si el precio cambió mientras la clienta armaba la bolsa, sin perder la bolsa (`reglas-tienda.ts`, `MagraFront.tsx`). | El aviso de total mayor en el mostrador (Vender). |
| 8 · Doble pedido | La fila marca «Tiene otro pedido abierto (#N)» por teléfono (`pedidos-core.ts`). | Juntar los dos pedidos en uno (decisión del dueño). |
| 3, 5, 9, 10 | Sin cambios en esta rama. | Ver fichas. |

## 1. Matriz de eventualidades

Leyenda — **Hoy:** ✔ resuelto · ◐ a medias · ✘ no lo cubre. **Mig.:** ¿el arreglo necesita migración (Gate 2)?
**Frente:** ✅ = se puede arreglar sin migración en este frente.

| # | Eventualidad | Hoy | Qué debería hacer | Mig. | Tam. | Prio. | Frente |
|---|---|---|---|---|---|---|---|
| 1 | Pedido web que nadie vio | ◐ | Contar "N de la tienda esperando, el más viejo hace X min" en la bandeja **y** en Vender; aviso fuera del panel (decisión) | No | S + M | **P1** | ✅ |
| 2 | Peso real distinto del pedido | ◐ | Ya pesa y ajusta con el precio congelado; falta avisar cuando el desvío pasa una tolerancia ("avisale antes de cobrar") | No | S | P2 | ✅ |
| 3 | Producto sin stock | ◐ | Ya bloquea en la tienda y en el alta; falta el mensaje armado de faltante cuando se descubre al armar | No | S | P2 | ✅ |
| 4 | Clienta que no retira | ✘ | Rotular "listo desde ayer", recordatorio armado por WhatsApp; estado "No retiró" en la ficha | Parcial (el estado sí) | S / M | P2 | ✅ (rótulo + mensaje) |
| 5 | Corte de internet o de luz un sábado | ◐ | Cobro en duda ya resuelto; falta protocolo de papel, pausar la tienda y cargar lo del cuaderno | No (salvo decisión) | S doc · M pausa · L offline | P2 | ✅ (protocolo) |
| 6 | Caja que no cuadra | ◐ | Nota obligatoria con diferencia también en el turno; mostrar causas probables (entregados a cobrar, links MP sin asentar) | No | S + M | **P1** | ✅ |
| 7 | Precio viejo | ◐ | La tienda manda el precio que vio; si cambió, se avisa por línea sin perder la bolsa. Mostrador: avisar total distinto | No | S | **P1** | ✅ |
| 8 | Doble pedido | ◐ | Doble toque ya resuelto en la base; falta marcar "esta clienta tiene otro pedido abierto" | No | S | P2 | ✅ |
| 9 | Pedido que entra con el local cerrado | ✘ | Decir en Gracias cuándo se prepara (horario provisional a confirmar) | No | S | P3 | ✅ |
| 10 | La bolsa se pierde al recargar la tienda | ✘ | Guardar la bolsa en el navegador (conveniencia, con try/catch) | No | S | P3 | ✅ |
| 11 | La clienta suma algo después de enviar | ✔ | — (Pesar y ajustar suma el producto al precio de hoy) | — | — | — | — |

---

## 2. Fichas por caso — hoy, evidencia y arreglo

### 1. Pedido web que nadie vio — **P1**

**Hoy (◐):**
- El aviso de pedido nuevo (refresco cada 45 s + «bip») **sólo se monta en la bandeja**, y sólo en un comercio que
  vende por kilo: `src/app/admin/(dashboard)/pedidos/page.tsx:100-104`. No aparece en ninguna otra pantalla (el único
  import es ése; `layout.tsx:264` sólo lo menciona en un comentario).
- El refresco corre **sólo con la pestaña a la vista**, sin nadie escribiendo y sin diálogo abierto:
  `pedidos/pedidos-core.ts:364` (45 s) y `:391-393` (`puedeRefrescarLaBandeja`). Quien atiende el sábado en
  **Vender** o en **Caja**, o con la bandeja en otra pestaña, no se entera.
- La línea de estado de la bandeja cuenta abiertos, para hoy, listos sin avisar y por cobrar, pero **no cuánto hace
  que espera un pedido de la tienda**: `pedidos/pedidos-core.ts:335-349`. La fila sólo dice la hora de creación
  (`pedidos/tablero.server.ts:100-102`, `cuandoDelPedido` en `pedidos-core.ts:351-355`).
- Del lado de la clienta, el pedido queda registrado y ella ve sólo el número (`src/lib/order-actions.ts:637`,
  `src/app/tienda/MagraFront.tsx:618`). Nadie del local recibe nada fuera del panel.

**Debería:**
1. Sumar a la línea de estado "**3 de la tienda esperando · el más viejo hace 25 min**" (pedidos `ONLINE` en
   `PENDING`), con tono de alerta pasado un umbral (**provisional: 15 min, a confirmar con Magra**). Función pura en
   `pedidos-core.ts`, con `ahora` inyectado para el test. **S, sin migración.**
2. Mostrar el mismo contador (con link a la bandeja) en **Vender**. Hay que pasarle el dato desde el servidor; es
   una lectura chica (`count` por `tenantId`, `channel: ONLINE`, `status: PENDING`). **M, sin migración.**
3. Aviso fuera del panel (mail al dueño con `src/lib/notifications.ts` si se configura `RESEND_API_KEY`). **Decisión
   del dueño:** el secreto lo pega él (FASE 2) y es gasto/servicio externo.

### 2. Peso real distinto del pedido — P2

**Hoy (◐, lo central está):**
- «Pesar y ajustar» reescribe el pedido con el peso real: `src/lib/order-actions.ts:1045-1105`.
- **El precio es el del pedido, no el de hoy** (si la dueña aumentó entre el jueves y el sábado, la clienta no paga
  el aumento): `src/lib/order-anulacion.ts:697-735`, en particular `:712-715` (precio del pedido) y `:716-721` (producto nuevo, precio de hoy).
- Sólo se edita lo **no cobrado**; lo cobrado se anula y se rehace: `src/lib/order-anulacion.ts:612-627`.
- El aumento por peso puede dejar el stock en negativo (el paquete ya está pesado): `src/lib/stock/pos-stock-rules.ts:94-100`.
- Si se mandó un link de MP antes de pesar, la bandeja avisa que quedó desactualizado:
  `pedidos/LinkDePagoPedido.tsx:67-69`.
- Peso implausible (≥ 30 kg, el «1500» tipeado en gramos) pide confirmación: `src/lib/pos-peso.ts:191-203`.
- La tienda dice "Total estimado" cuando hay algo por kilo: `src/app/tienda/MagraFront.tsx:546`.

**Hueco:** no hay tolerancia contra **lo pedido**. Un pedido de 0,5 kg que pesa 0,9 kg (+80 %) se guarda sin
aviso, y la clienta no aceptó pagar casi el doble. El aviso de "listo" lleva el total nuevo pero no explica por qué
cambió (`src/lib/order-anulacion.ts:1313-1337`).

**Debería:** función pura `desvioDelPeso({ pedido, real })` en `src/lib/pos-peso.ts` que devuelva un aviso cuando
el desvío pasa la tolerancia (**provisional: ±15 %, a confirmar con Magra**), mostrado en la línea de
`pedidos/AjustarPedidoForm.tsx` (donde hoy se pinta `avisoDeCantidad`, `:158` y `:195`): «Pesó 0,9 kg y pidió 0,5:
avisale antes de cobrar». No frena: avisa. **S, sin migración.**

### 3. Producto sin stock — P2

**Hoy (◐):**
- La tienda no deja sumar lo que está sin stock: `src/app/tienda/MagraFront.tsx:119-121` y el botón `+`
  deshabilitado en `:309`. La etiqueta sale de `disponibilidadDe` sin publicar cuántos kilos hay:
  `src/app/tienda/reglas-tienda.ts:31-36`.
- Antes del alta, la bolsa se revisa línea por línea ("Se agotó", "No nos alcanza"): `reglas-tienda.ts:64-95`,
  llamado desde `src/lib/order-actions.ts:651-660`.
- El alta descuenta stock con guarda atómica (sin ventas parciales, sin negativo en la tienda):
  `src/lib/order-core.ts:641-651`. El pedido web **reserva** la mercadería desde que entra (descuenta en el alta).
- En el mostrador, el corte por peso **sí** puede quedar en negativo (`pos-stock-rules.ts:94-100`), y el inventario
  lo marca: "En negativo — hay que recontarlos" (`src/app/admin/(dashboard)/inventario/page.tsx:200`).

**Huecos:**
- `trackStock` es `false` por defecto (`prisma/schema.prisma:606`): un producto cargado sin control de stock se
  vende sin límite en la tienda. El seed retail lo prende (`src/blueprints/retail/index.ts:54` y `:58`), pero el
  catálogo **real** de Magra todavía no está cargado (M-3, Gate 2): hay que verificarlo al cargarlo.
- El faltante **físico** (el sistema dice que hay, la cámara no) aparece al armar. Hoy se saca la línea con
  «Pesar y ajustar» y se avisa escribiendo a mano: no hay mensaje armado.

**Debería:** mensaje armado (función pura junto a `avisoPedidoListo`, `src/lib/order-anulacion.ts:1313`):
«Hola Ana, del pedido #128 no nos quedó Vacío. ¿Te lo cambiamos por otro corte o lo sacamos? El resto sigue en
pie.» Se abre 1 a 1 por WhatsApp, como el aviso de listo. **S, sin migración.** Y en la checklist de carga del
catálogo real: `trackStock` prendido en todo lo que se vende online.

### 4. Clienta que no retira — P2

**Hoy (✘):**
- El pedido Listo queda abierto en la bandeja sin límite. La línea de estado cuenta "listos sin avisar"
  (`pedidos/pedidos-core.ts:345`), no "listos sin retirar".
- No existe el estado "no retiró": `OrderStatus` es PENDING/CONFIRMED/PREPARING/READY/DELIVERED/CANCELLED
  (`prisma/schema.prisma:109-116`). El único camino es **Anular** con motivo (`pedidos/AnularPedidoForm.tsx:114-119`;
  obligatorio para recepción, opcional para el dueño), que devuelve la carne al stock salvo que se tilde que no
  volvió (`src/lib/order-actions.ts:1027-1038`, `:1033`).
- Mientras tanto la mercadería queda reservada (el alta la descontó) y la tienda puede mostrarla agotada.

**Debería:**
1. Rotular y contar "**Listo desde ayer**" (READY creado antes de hoy) en la línea de estado. Pura, con `hoy`
   inyectado. **S, sin migración.**
2. Recordatorio armado: «Hola Ana, tu pedido #128 te sigue esperando. ¿Pasás hoy?» (mismo patrón que el aviso de
   listo). **S, sin migración.**
3. Motivo de anulación sugerido "No retiró" (texto fijo, queda en auditoría) para poder contarlos después sin
   migración. **S.**
4. Estado `NO_SHOW` en pedidos o contador de faltas en la ficha de la clienta, y regla "la próxima, pago
   adelantado". **Migración (Gate 2), M.** Decisión del dueño (ver §5).

### 5. Corte de internet o de luz un sábado — P2

**Hoy (◐):**
- El cobro sin conexión **no duplica**: sin señal antes de mandar, no se manda; si se mandó y no volvió respuesta,
  se dice "no sabemos" y el reintento viaja con la misma clave
  (`src/app/admin/(dashboard)/vender/cobro-sin-conexion.ts:10-17`, tope de 25 s en `:52`, `antesDeCobrar` `:105`,
  `fallaDeRed` `:133`). El cobro en duda queda guardado en la pestaña hasta 12 h (`:449`, `:507`).
- **No hay modo offline:** sin internet no se vende por el sistema.
- La tienda vive en la nube y **sigue tomando pedidos durante el corte**; nadie del local los ve (se cruza con el
  caso 1). No existe un interruptor para pausar la tienda (búsqueda sin resultados en `src/`).
- Como contingencia, la planilla de precios se baja en CSV: `src/app/admin/(dashboard)/catalogo/planilla/route.ts:1-8`.
- Una venta cargada después entra con la **hora de carga**; si se carga otro día cae en otra caja, y si ese día ya
  se cerró, se rechaza (`src/lib/order-actions.ts:310-317`).

**Debería:**
1. **Protocolo de contingencia** (doc + una tarjeta en el panel): planilla impresa el viernes, cuaderno con
   hora/cliente/corte/peso/medio, y cargar lo del cuaderno **el mismo día** al volver la señal (el flujo normal ya
   sirve). **S, sin migración, sin código.**
2. **Pausar la tienda** con un mensaje ("Hoy no tomamos pedidos web, escribinos por WhatsApp"). Sin migración si el
   valor se guarda en un lugar existente; si pide columna nueva, Gate 2. **M.** Decisión del dueño.
3. Cargar ventas con **fecha anterior** (el cuaderno de ayer): toca libro y cierres. **M-L, riesgo alto**; no lo
   recomendamos sin decisión.
4. Mostrador offline de verdad (cola local que sincroniza): **L**. Fuera de alcance hasta que haya venta.

### 6. Caja que no cuadra — **P1**

**Hoy (◐):**
- El cierre de **turno** arquea contra el libro, asienta la diferencia y no cierra si entró un movimiento mientras
  se contaba: `src/lib/caja-actions.ts:220-298`.
- El cierre del **día** exige nota si hay diferencia (`src/lib/caja/cierre-diario.ts:390-397`) y tiene confirmación
  en dos pasos (`caja/cierre/revisar-cierre.ts:1-17`).

**Huecos:**
- En el cierre de **turno** la nota es **opcional aunque haya diferencia**: `caja/CajaForms.tsx:299`
  («Nota (opcional)») y el servidor la acepta vacía, `src/lib/caja-actions.ts:231`. El faltante queda asentado pero
  sin un porqué, que es justo lo que el cierre del día no permite.
- Causas típicas de Magra que la pantalla de caja no muestra:
  - **Pagos por link de MP que no se asientan solos:** el webhook de producción todavía no conecta el cobro del
    pedido (`pedidos/link-de-pago.ts:9-16`); sólo el simulador lo hace (`src/lib/cobros-actions.ts:272`). Hasta que
    alguien toca «Cobrar», el MP del día no cuadra.
  - **Pedidos entregados "a cobrar":** siguen abiertos (`src/lib/order-anulacion.ts:1035` y `:1042`), pero no
    aparecen en la caja.
  - **Total distinto al de pantalla** en el mostrador (precio cambiado): sólo se avisa en el reintento tras un corte,
    `vender/VenderForm.tsx:829-833` (ver caso 7).

**Debería:**
1. Nota **obligatoria** cuando hay diferencia también en el turno, con el mismo texto del cierre del día. **S, sin
   migración.**
2. En la pantalla de cierre, un bloque "**Antes de cerrar, mirá**": N entregados a cobrar ($X) y N links de MP
   mandados sin cobrar ($Y). Son lecturas de cosas que ya existen (pedidos y auditoría del link). **M, sin migración.**
3. Conectar el aviso de MP al cobro del pedido: es tocar el webhook de producción. Lo eleva el Arquitecto, va con
   el Gate de negocio "cobro MP online" de Magra.

### 7. Precio viejo — **P1**

**Hoy (◐):**
- La tienda lee el precio fresco en cada carga (`src/app/tienda/page.tsx:38`, `force-dynamic`), y la bolsa vive sólo
  en memoria (`MagraFront.tsx:112`).
- Al enviar, el servidor **recalcula con el precio de la base** y no confía en lo que manda el navegador:
  `src/lib/order-core.ts:555-557` y `:582-586`. Bien.
- Pero **no compara con lo que vio la clienta.** Si la dueña sube el vacío con la pestaña abierta, el pedido se graba
  con el precio nuevo y la clienta no se entera: Gracias muestra sólo el número (`src/app/tienda/gracias/page.tsx:62-73`)
  y la confirmación por WhatsApp también (`MagraFront.tsx:618`). La línea de la bolsa manda producto y cantidad, no
  el precio (`MagraFront.tsx:515-516`). Se entera al pagar.
- Ya tomado el pedido, el ajuste de peso respeta el precio congelado (caso 2, `order-anulacion.ts:712-715`). ✔
- En el mostrador, el aviso "quedó por otro total" existe **sólo en el reintento** (`VenderForm.tsx:829-833`); en el
  cobro normal, si el precio cambió desde que se abrió la pantalla, la cajera cobra lo de la tecla
  (`VenderForm.tsx:519`) y el sistema graba otra cifra: la caja descuadra (caso 6).

**Debería:**
1. La tienda manda el precio que mostró (`<input type="hidden" name="unitPrice">` junto a `MagraFront.tsx:516`). El
   servidor ya lee precio y precio por kilo para revisar la bolsa (`src/lib/order-actions.ts:657`): si difiere,
   devuelve aviso **por línea** por el canal que ya existe (`porLinea`): «El precio cambió: ahora $X el kilo. Revisá
   y mandalo de nuevo.» La bolsa no se pierde. Si el campo no viene (las otras vidrieras), no se compara.
   **S, sin migración.**
2. Mostrador: si el total grabado es **mayor** que el de la tecla, avisarlo igual que en el reintento. Sólo
   "mayor", porque una promo automática puede bajar el total con razón. **S, sin migración.**

### 8. Doble pedido — P2

**Hoy (◐, lo técnico está):**
- **Doble toque / reenvío:** la tienda manda una clave por bolsa (`MagraFront.tsx:74-79`, `:116`, se renueva al
  cambiar la bolsa `:124` y al registrar `:158`); el servidor la acepta sólo con la forma de la tienda y en su
  espacio `web:` (`src/lib/order-core.ts:1080-1084`), la busca **antes** de mirar la bolsa
  (`order-core.ts:1114-1124`) y la base tiene `@@unique([tenantId, idempotencyKey])` (`prisma/schema.prisma:1325`).
  Los dos botones se deshabilitan mientras envía (`MagraFront.tsx:636`, `:649`). Cumple DB-4.
- **Mostrador:** el reintento viaja con la misma clave del ticket (`cobro-sin-conexion.ts:13-15`).

**Hueco:** la **misma clienta con dos pedidos distintos** (manda por la web y además escribe por WhatsApp y el local
lo carga a mano; o pide de nuevo "para sumar algo"). Son dos claves distintas, dos pedidos abiertos, y la bandeja no
lo marca: el teléfono sólo sirve para buscar (`pedidos/pedidos-core.ts:224-233`).

**Debería:** marca en la fila «**Ana tiene otro pedido abierto (#127)**», agrupando por teléfono normalizado entre
los abiertos. Función pura en `pedidos-core.ts`. **S, sin migración.** Juntar los dos pedidos en uno: M, decisión.

### 9. Pedido que entra con el local cerrado — P3

**Hoy (✘):** la tienda toma el pedido a cualquier hora, sin horario pedido (`src/lib/order-actions.ts:598`,
`scheduledFor: null`), y Gracias promete «Te lo llevamos o lo retirás» (`src/app/tienda/gracias/page.tsx:58`).

**Debería:** si entra fuera de horario, Gracias dice "Lo preparamos [próximo día hábil] desde las [hora]". El horario
de Magra es **provisional a confirmar** (M-2 en ESTADO-ACTUAL: dirección/horario sin cargar). **S, sin migración**,
una vez cargado el horario.

### 10. La bolsa se pierde al recargar — P3

**Hoy (✘):** `useState` puro (`MagraFront.tsx:112`). Recargar o volver desde WhatsApp vacía la bolsa.
**Debería:** guardar la bolsa en `localStorage` con try/catch, como conveniencia (si falla, todo sigue igual). Al
restaurarla, con el arreglo del caso 7 el precio se vuelve a controlar al enviar. **S, sin migración.**

### 11. La clienta suma algo después de enviar — ✔

«Pesar y ajustar» acepta un producto que no estaba en el pedido, con el precio de hoy y sólo si hoy se vende:
`src/lib/order-anulacion.ts:716-721`.

---

## 3. Tabla resumen

| # | Caso | Hoy | Mig. | Tam. | Prio. | Sin migración en este frente |
|---|---|---|---|---|---|---|
| 1 | Pedido web que nadie vio | ◐ | No | S (+M en Vender) | **P1** | ✅ contador + antigüedad |
| 2 | Peso real distinto | ◐ | No | S | P2 | ✅ aviso de desvío |
| 3 | Sin stock | ◐ | No | S | P2 | ✅ mensaje de faltante |
| 4 | No retira | ✘ | Sólo el estado `NO_SHOW` | S / M | P2 | ✅ rótulo + recordatorio + motivo |
| 5 | Corte de internet/luz | ◐ | No (pausa: según dónde se guarde) | S / M / L | P2 | ✅ protocolo |
| 6 | Caja que no cuadra | ◐ | No | S (+M causas) | **P1** | ✅ nota obligatoria en turno |
| 7 | Precio viejo | ◐ | No | S | **P1** | ✅ precio visto por línea + aviso mostrador |
| 8 | Doble pedido | ◐ | No | S | P2 | ✅ marca de pedido abierto |
| 9 | Local cerrado | ✘ | No | S | P3 | ✅ (falta el horario real) |
| 10 | Bolsa perdida | ✘ | No | S | P3 | ✅ |
| 11 | Suma después de enviar | ✔ | — | — | — | — |

**Cuenta:** 10 casos con trabajo, **ninguno exige migración para su arreglo principal**. Lo único que pide Gate 2 es
el estado "No retiró" (caso 4.4), y eventualmente la pausa de la tienda (caso 5.2) según dónde se guarde.

---

## 4. Orden recomendado para este frente (todo sin migración)

1. **Caso 7** precio visto por línea (tienda) + aviso de total mayor (mostrador). P1, S.
2. **Caso 6** nota obligatoria con diferencia en el cierre de turno. P1, S.
3. **Caso 1** contador "esperando · el más viejo hace X min" en la bandeja. P1, S.
4. **Caso 8** marca "tiene otro pedido abierto". P2, S.
5. **Caso 2** aviso de desvío de peso. P2, S.
6. **Caso 4** "listo desde ayer" + recordatorio + motivo "No retiró". P2, S.
7. **Caso 3** mensaje de faltante. P2, S.

Cada uno con su función pura y su test (MP-8), y el Gate de Excelencia antes de integrar. Los casos 1-M (contador en
Vender), 6-M (causas en el cierre), 5 (protocolo), 9 y 10 quedan para la vuelta siguiente.

---

## 5. Decisiones del dueño

1. **Tolerancia del peso real** (caso 2): ¿desde qué desvío hay que avisarle a la clienta antes de cobrar?
   Provisional: ±15 %.
2. **Umbral de "pedido esperando"** (caso 1): ¿a los cuántos minutos un pedido web sin mirar es alarma? Provisional:
   15 min.
3. **Aviso fuera del panel** (caso 1): ¿mail al dueño por cada pedido web? Necesita `RESEND_API_KEY`, que pega el
   dueño (FASE 2), y es un servicio externo.
4. **"No retiró"** (caso 4): ¿se lleva la cuenta en la ficha de la clienta y se pide pago adelantado a quien falló?
   Si sí, es migración (Gate 2). ¿Cuánto tiempo se guarda un pedido listo antes de anularlo y devolver la carne al
   stock? Provisional a confirmar (depende de cadena de frío y vencimiento del envasado).
5. **Pausar la tienda** (caso 5): ¿lo quiere, y quién puede tocarlo (dueño / mostrador)?
6. **Carga de ventas con fecha anterior** (caso 5.3): ¿se habilita? Nuestro consejo: no; cargar el cuaderno el mismo día.
7. **Conectar el aviso de Mercado Pago al cobro del pedido** (caso 6): va con el Gate de negocio "cobro MP online"
   que ya está pendiente (ESTADO-ACTUAL).
8. **Juntar dos pedidos de la misma clienta** (caso 8): ¿se juntan en uno o alcanza con la marca?

## 6. Provisional a confirmar con Magra

Horario de atención y días (caso 9) · WhatsApp del local (lo toma de Datos del negocio; sin cargar, la tienda no
abre chat: `src/lib/order-actions.ts:684`) · tolerancia de peso · umbral de espera · plazo para retirar ·
zonas y costo de envío (hoy sin tarifa, la tienda dice "Gratis": `MagraFront.tsx:146-148` y `:542`) · que todo lo que se
vende online tenga `trackStock` prendido al cargar el catálogo real.

---

— Elaborado por GSG
