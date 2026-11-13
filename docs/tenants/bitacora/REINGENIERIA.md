# Pedí Local · delivery propio para comercios del barrio (piloto Bitácora Café, Monte Grande)

> Frente GSG-DELIV-001 · 10/11/2026 · rama `claude/gcg-local-delivery-platform-xv9pd1`.
> Método: skill `ingenieria-reversa`. Fuentes y límites legales: [investigacion-referentes-y-legal.md](investigacion-referentes-y-legal.md).
> «Pedí Local» es un nombre **provisional a confirmar** (falta búsqueda en el INPI).

## 1. El problema

Las apps de delivery le cobran al comercio **hasta ~35 %** del pedido, sumando comisión, promociones y
publicidad (cámara de hamburgueseros de Rosario, iProfesional 2026; el «40 %» no tiene fuente, así que no
lo usamos). El comercio lo traslada al precio, el vecino deja de pedir y el repartidor trabaja bajo reglas
que no controla. En Monte Grande, el comercio ya tiene repartidor propio o conocido. Lo que le falta es la
**toma de pedidos ordenada**: una carta online, la dirección y la ubicación bien tomadas, saber quién pagó
y un mensaje claro al repartidor.

## 2. Principios de la pasada

1. **GSG provee software, no intermedia la venta.** No cobra el pedido, no contrata repartidores y no cobra
   comisión por pedido: cobra un abono fijo. Eso baja el costo y, sobre todo, la exposición legal y laboral.
2. **Cero migración.** Se monta sobre lo que el ERP ya tiene: el pedido online (`placeOnlineOrder`), los
   estados, las zonas de envío, la bandeja, el link de MP y la auditoría. Lo nuevo viaja en la nota del
   pedido y en `AuditLog`.
3. **WhatsApp primero.** El comercio y el repartidor se coordinan por WhatsApp con mensajes ya armados. No
   hay una app del repartidor que instalar.
4. **La plata, a la cuenta del comercio.** Transferencia, efectivo o link de MP. La conciliación es manual
   y en un toque: el local ve la plata y pasa el pedido de «Pedido» a «Confirmado».
5. **Motor puro con tests**, criollo claro en pantalla y marca GSG. La marca del local, sólo con
   autorización registrada.

## 3. Referentes y qué tomamos (ficha completa en la investigación)

| | PedidosYa / Rappi | Uber Eats (afuera) | Pedix y similares (0 % con abono) | **Pedí Local** |
|---|---|---|---|---|
| Quién cobra | la app | la app | el comercio | **el comercio** |
| Repartidor | de la app (con asignación algorítmica) | de la app | del comercio | **del comercio** |
| Comisión | hasta ~35 % con promos | % | abono | **abono fijo, 0 %** |
| Si el local no confirma | la app cancela (Uber: 11,5 min, [fuente]) | idem | manual | **30 min y el cliente puede bajarlo sin costo** |
| Seguimiento | app | app | variable | **link firmado, sin app** |

- **Esencia** (todos lo hacen igual, va al motor): carta con precio final, envío visible antes de
  confirmar, estados Recibido → Confirmado → En preparación → En camino → Entregado, y cancelación con
  devolución si el local no confirma.
- **Accidente de mercado** (se reemplaza): la tarjeta en la app por transferencia, efectivo con vuelto o
  link de MP; la app del cliente por un link y WhatsApp; el repartidor de la plataforma por el del
  comercio; la comisión por un abono.

## 4. El modelo (sin tablas nuevas)

| Capa | Dónde vive |
|---|---|
| Objetos | `Tenant` (el comercio), `Product` (la carta), zonas de envío (`src/lib/envios`, en AuditLog) y la configuración del delivery (`src/lib/delivery-local/config.ts`, por slug: alias, radio, horario y medios) |
| Asignación | `Order` + `OrderItem` (canal ONLINE, DELIVERY o PICKUP) |
| Ciclo de vida | `OrderStatus`: PENDING (Recibido) → CONFIRMED → PREPARING → READY → DELIVERED / CANCELLED. «En camino» es la marca `delivery-local:salio` en AuditLog |
| Datos nuevos | ubicación y forma de pago → renglones de la nota del pedido, más `entregaLocal` en la auditoría del alta |
| Roles | cliente (vidriera y seguimiento), local (bandeja con `orders:manage`), repartidor (WhatsApp; sin acceso al sistema) |
| Plata | `paid:false` al nacer; `cobrarPedido` con el medio real (las reglas de caja de siempre); MP con `link-de-pago.ts` y su webhook |

## 5. Matriz de eventualidades

| Eventualidad | Regla | Qué ve el local | Función | Test (`delivery-local.test.ts`) |
|---|---|---|---|---|
| El cliente no comparte la ubicación | alcanza con la dirección | nada raro | `leerUbicacion` → vacía | «ubicación vacía no es error» |
| El GPS manda basura o queda a medias | se descarta y no frena el pedido | sin renglón de ubicación | `leerUbicacion` → inválida | «ubicación a medias…», «fuera de la Argentina» |
| GPS impreciso (> 150 m) | se guarda con aviso | «aprox. N m, confirmar» | `renglonDeUbicacion` | «el renglón lleva…» |
| El cliente queda fuera del radio | se toma, pero marcado | «FUERA DEL RADIO» y los km | `chequearRadio` | «radio: dentro, fuera y sin dato» |
| Paga en efectivo con un billete grande | el repartidor lleva el vuelto | «paga con $X, llevar $Y» | `leerPago`, `vueltoALlevar` | «efectivo…», «vuelto…» |
| «Paga con» con un disparate | se rechaza con un mensaje claro | — | `leerPago` | «efectivo: …disparate» |
| Medio que el local no acepta | se rechaza | — | `leerPago` | «medio inventado…» |
| Transferencia sin ver | queda en Recibido; el cliente ve «mandá el comprobante» | «confirmar al ver la plata» | `vistaDelSeguimiento` | «transferencia pendiente…» |
| El repartidor sale | el cliente ve «En camino» | botón «Mandar al repartidor» | marca `salio` | «el camino completo…» |
| Ya pagó por transferencia o MP | el repartidor no cobra | «YA PAGÓ — no cobrar» | `cobroParaElRepartidor` | «el repartidor lee qué cobrar» |
| Doble toque en «Pedir» | un solo pedido | — | `idempotencyKey` (existente) | tests de `placeOnlineOrder` |
| Link de seguimiento reenviado o adivinado | no muestra dirección, teléfono ni ubicación; otro id no pasa la firma | — | `verificarToken` | «token: vale para su pedido…» |
| Link de seguimiento en el host de otro negocio | no abre | — | firma con `tenantId` | idem |
| Cancelado después de pagar | «te devuelven por el mismo medio» | anulación de siempre | `vistaDelSeguimiento` | «retiro y cancelación» |
| El local no confirma en 30 min | el cliente puede bajarlo sin costo (términos) | — | **fuera de alcance v1**: aviso automático a 20 min (deuda) | — |
| Tienda pausada (lluvia, falta de repartidor) | no toma pedidos y muestra el mensaje | Envíos → Pausar | `motivoTiendaPausada` (existente) | tests de envíos |
| Mínimo de compra por zona | «te faltan $X» | Envíos | `cotizarEnvio` (existente) | tests de envíos |
| Un negocio sin delivery local | todo igual que antes | — | `configDeliveryLocal` = null | «config: sólo los negocios cargados» |

## 6. Innovaciones (donde el referente es débil)

1. **Comisión cero y la plata directa al comercio.** Con un ticket de $15.000, la app se queda con hasta
   ~$5.250; acá, $0 por pedido.
2. **«Paga con» y el vuelto en el mensaje al repartidor.** Las apps con efectivo lo dejan a criterio de
   cada uno. Se termina el «no tengo cambio» en la puerta.
3. **Ubicación + dirección + distancia en un solo renglón**, con el link al mapa, los km y el aviso si
   queda fuera del radio. El repartidor no llama para preguntar dónde es.
4. **Seguimiento sin app ni cuenta**: un link firmado que no expone datos aunque se reenvíe.
5. **Repartidor sin alta en el sistema**: un WhatsApp armado. Nada que instalar, nada que GSG controle.
   Eso es lo que evita el problema laboral de las plataformas (ver §B de la investigación).

## 7. Qué se construyó

- `src/lib/delivery-local/`: el motor puro (ubicación, pago, seguimiento, mensajes, alta, config y legales) y sus tests.
- La vidriera `src/app/tienda/local/` (sólo para negocios con config) y las páginas legales `/tienda/{terminos,privacidad,arrepentimiento}`.
- En el alta: `placeOnlineOrder` suma la ubicación y el pago a la nota y a la auditoría, y redirige a `/tienda/pedido/<token>`.
- En la bandeja: «Mandar al repartidor» (marca «En camino») y «Mandar seguimiento al cliente».
- Vidriera de autor (skill `vidriera-de-autor`): portada en capas con parallax en CSS, índice fijo de la carta,
  microinteracciones con `prefers-reduced-motion`, y piel del local (`marca.ts`, contraste AA garantizado).
- «Mi cuenta» (`/tienda/mi-cuenta`): historial, direcciones y «repetir pedido» guardados en el dispositivo;
  el servidor no guarda nada nuevo (`mi-cuenta.ts`).
- Certificación adversarial de seguridad y datos con 4 observaciones cerradas: mensaje al repartidor sin
  renglones falsos (`enUnaLinea`), alias provisorio nunca visible (`transferenciaPublicable`), coordenadas fuera del
  AuditLog y falta de secreto sin 500.
- QA: 30 capturas a 390, 768 y 1280 px, 0 errores de consola, 0 scroll horizontal y 0 callejones (PR #115).

## 8. Camino a producción (qué es reversible y qué es §C)

| Paso | Tipo | Quién |
|---|---|---|
| Código en la rama, tests y tsc | reversible | esta sesión |
| PR → CI → merge a `main` (deploy de Vercel) | Gate 1: autorizado con respaldo Neon, CI sin rojos nuevos, Vercel READY y un PR a la vez | orquestadora |
| Alta del negocio: `npm run soporte:alta -- --nombre "Bitácora Café" --slug bitacora --blueprint cafeteria --produccion` | escribe en Neon: necesita la orden del dueño (la autorización de alta automática hoy es sólo de Factoque) | dueño u orquestadora |
| Subdominio `bitacora.<APP_BASE_DOMAIN>` | sale del `Tenant.subdomain` del alta, sin DNS nuevo si hay comodín (a verificar) | orquestadora |
| Cargar la carta real, las zonas y los costos de envío (Ajustes → Envíos) | dato del cliente | el local, con soporte GSG |
| Alias, titular, CUIT, dirección y coordenadas reales (`config.ts`) | dato del cliente | el local confirma → PR chico |
| Revisión legal de los textos | antes de salir con clientes reales | abogado |
| MP automático (link y webhook) | ya existe; requiere el token del local (secreto, lo pega el dueño) y hoy hay **un token por despliegue** | fase 2 |
| Usar la marca de Bitácora (logo, colores) | autorización registrada del cliente | dueño |

**No hace falta migración.** Gate 2 no aplica.

## 9. Provisional a confirmar

Nombre del producto · alias, titular, CUIT, razón social, dirección, coordenadas, horario y radio de
Bitácora · carta y precios reales · zonas y costos de envío · el plazo de confirmación (30 min) · el abono
mensual de GSG (propuesta en Factory-GSG) · la revisión legal.

## 10. Deuda anotada

- Config por slug en código → pantalla de Ajustes en AuditLog cuando haya un segundo comercio.
- Aviso automático al local si un pedido lleva 20 minutos en Recibido.
- Directorio «comercios de Monte Grande» (varias vidrieras en una página) cuando haya 3 o más.
- Reparto por franjas (`pedidos/reparto`) para gastronomía: hoy exige un rubro retail.
- Un token de MP por negocio (hoy hay uno por despliegue).
- Lighthouse móvil, CLS y fps del parallax sin medir.
- «Mi cuenta» asocia el pedido recién mandado por una ventana de 30 min: dos pedidos seguidos desde el
  mismo teléfono pueden cruzarse.
- La carta se agrupa por palabras del nombre (no hay campo de categoría).
- Asignar repartidor con mapa, pantalla de horario y de zona: hoy el botón de WhatsApp con mapa y Ajustes → Envíos.

— Elaborado por GSG
