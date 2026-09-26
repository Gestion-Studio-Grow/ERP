# Qué Bien Olés — el proceso de negocio y cómo lo lleva el panel

Fuente del proceso: lo que la marca publica (bio y posteos del 14, 15 y 17/09/2026 de `@quebienoles`,
ver `docs/preventa/analisis-redes-quebienoles.md`). Lo que no publica está marcado **[A VALIDAR]**.

## El recorrido de una venta

| # | Paso real | Qué dice la marca | Dónde queda registrado |
|---|---|---|---|
| 1 | **Consulta** | "💬 Escribinos y te enviamos catálogo" · "¿No sabés cuál elegir? Escribinos" | La tienda responde sola (vitrina, ficha olfativa, guía de 3 preguntas); la consulta humana sigue por Instagram. |
| 2 | **Pedido** | "📩 Pedidos y consultas por MD" | Web → entra solo a **Pedidos** (canal online). Por mensaje → se **carga en Pedidos** desde el panel, con el @ en la nota. |
| 3 | **Coordinar la entrega** | "📦 Entrega mediante envío o punto de encuentro" · "📍 Ezeiza" | Pedido **confirmado**: envío (con dirección) o punto de encuentro (lugar y horario en la nota / fecha pactada). |
| 4 | **Cobro** | "💳 Consultanos por medios de pago" | **Cobrar** el pedido con su medio (transferencia, efectivo, Mercado Pago…) **[A VALIDAR cuáles acepta]**. |
| 5 | **Entrega** | — | Pedido **entregado**: descuenta stock si se controla. |
| 6 | **Reposición** | "Stock disponible" · "mucho stock" | **Compras** a proveedor: entra el stock y el costo (margen por perfume). |

Estados del pedido tal como los muestra el panel: **Pendiente** (nuevo, sin coordinar) → **En preparación**
(botón *Preparar*) → **Listo** (botón *Marcar listo*) → **Entregado** (o **Entregado · a cobrar** si se lo llevó
sin pagar). **Confirmado** también existe (un pedido ya acordado) y **Anulado** saca el pedido de la bandeja.

## Cómo se hace cada paso en el panel (verificado en la demo local el 26/09/2026)

**Entrar:** `https://quebienoles-erp.vercel.app/admin/login`. El **Inicio** muestra ventas e ingresos del día y
**"Perfumes para reponer"** (los que están bajo el mínimo), con acceso directo a Compras.

1. **Un pedido llegó por Instagram** → **Pedidos** → arriba, **"Pedido (punto de encuentro / envío)"**. Buscá el
   perfume, cantidad, **Cliente** y **Teléfono / WhatsApp**, **Entrega** (*Punto de encuentro* o *Envío a
   domicilio* con la dirección), **Horario deseado** y una **Nota** (ej.: "Por Instagram @usuario · plaza de
   Ezeiza"). **Registrar pedido**. Los de la web entran solos a la misma bandeja.
2. **Coordinar** → en la bandeja cada pedido muestra su horario ("Encuentro mañana 19:00"). **Preparar** cuando lo
   separás; **Marcar listo** cuando está para entregar.
3. **Avisar** → en "Listo" aparece **"Avisar por WhatsApp"** con el mensaje armado: *"Hola Ana, tu pedido #7 de Qué
   Bien Olés ya está listo; coordinamos el punto de encuentro. Total a pagar: …"*.
4. **Entregar y cobrar** → **Entregar**: elegí cómo pagó (**Efectivo · Mercado Pago · Transferencia**) y
   **Cobrar y entregar**; o tildá **"Queda a cobrar"** si se lo lleva sin pagar y lo cobrás después con **Cobrar**
   (queda marcado "Entregado · a cobrar" hasta que entre la plata).
5. **Reponer** → **Compras** ("Recibir mercadería"): proveedor, perfumes, cantidades y costo. El stock sube y el
   costo alimenta el margen. **Inventario** ("Stock") muestra lo que hay.
6. **Catálogo** ("Las fragancias") → precios, control de stock y mínimo por perfume. Un perfume nuevo aparece
   en la tienda en "Más fragancias" hasta que se le cargue su ficha (familia, pirámide, foto: hoy en código,
   `src/app/tienda/quebienoles/perfumes.ts`).
7. **Números** → **Reportes** (ventas y margen) · **Caja** / **Libro de caja** / **Cierre del día** · **Clientes**
   (historial de cada uno).

**Probarlo sin tocar producción:** `npx next build` y después `npx tsx scripts/tenants/quebienoles-demo.mts --prod`
(base en memoria con los 25 perfumes, stock y pedidos de ejemplo; usuario de prueba en el propio script).

## Lo que el negocio necesita ver cada día

- Pedidos **nuevos** para contestar y coordinar.
- Pedidos **coordinados** para entregar (y por dónde: envío o punto de encuentro).
- Pedidos **entregados sin cobrar**.
- Perfumes con **stock bajo** (cuando se cargue el stock).
- Ventas y margen del mes; perfumes más pedidos.

— Elaborado por GSG
