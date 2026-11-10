# Bitácora Café · datos que le pedimos al local (BORRADOR, no enviado)

Pedido de la orquestadora (10/11/2026): lista simple para mandarle al local. **No se envía** hasta que el
dueño decida D-DELIV-1 a 4 (tarjeta C13 del tablero). Cada dato reemplaza un «provisional a confirmar» de
`src/lib/delivery-local/config.ts` o de `REINGENIERIA.md` § 9.

## Para mandar (copiar y pegar en WhatsApp o mail)

> Hola! Para dejar lista la tienda de pedidos de Bitácora necesitamos estos datos. Podés mandarlos de a poco, por acá mismo:
>
> **1. Marca**
> - Logo en la mejor calidad que tengas (ideal PNG o SVG con fondo transparente).
> - Los colores de la marca, si los tenés anotados (si no, los sacamos del logo).
> - 3 a 6 fotos del local o de los productos que te gusten para la portada.
>
> **2. Carta**
> - La carta actual con precios (foto, PDF o planilla, como la tengas).
> - Foto de cada producto, si tenés. Si falta alguna, la tienda la muestra sin foto.
> - Lo que hoy no sale por delivery (para no ofrecerlo).
>
> **3. Cobro**
> - Alias de Mercado Pago (o CBU/CVU) donde querés recibir las transferencias.
> - Nombre del titular de esa cuenta, tal como figura.
> - ¿Aceptás efectivo contra entrega? ¿Con cuánto vuelto como máximo sale el repartidor?
>
> **4. Datos del comercio** (van en las condiciones de venta de la tienda)
> - Razón social o nombre del titular.
> - CUIT.
> - Dirección exacta del local.
>
> **5. Reparto**
> - Ubicación del local en Google Maps (mandá la ubicación por WhatsApp o el link).
> - Hasta dónde llevan (barrios o cuadras) y cuánto cobran el envío en cada zona.
> - Si hay un mínimo de compra para el envío.
> - Días y horario en que toman pedidos de delivery.
> - Nombre y WhatsApp del repartidor o los repartidores (para mandarles el pedido con el mapa).
>
> **6. Pedidos**
> - El WhatsApp donde querés recibir los pedidos.
> - ¿En cuánto tiempo podés confirmar un pedido? (propusimos 30 minutos).
>
> Gracias!

## Dónde va cada dato (para quien lo cargue)

| Dato | Dónde se carga | Nota |
|---|---|---|
| Logo, colores, fotos | carpeta de Drive «Bitácora Café · material de marca (logo, fotos, carta)» → `marca` en `config.ts` y fotos de producto | nada binario en Git |
| Carta y precios | productos del tenant (backoffice) | la agrupación sale del nombre: no hay campo de categoría (deuda) |
| Alias, titular | `transferencia` en `config.ts` | |
| Razón social, CUIT, dirección | `razonSocial`, `cuit`, `direccion` en `config.ts` | van a las condiciones de venta (`legales.ts`), que siguen en BORRADOR |
| Ubicación del local | `ubicacionDelLocal` en `config.ts` | hoy apunta a la plaza de Monte Grande |
| Zonas, costos, mínimo | Ajustes → Envíos (`src/lib/envios`) | |
| Radio | `radioKm` en `config.ts` | hoy 4 km |
| Horario | `horario` en `config.ts` | |
| Repartidores | los arregla el local; el botón de WhatsApp con mapa ya existe | |
| Plazo de confirmación | términos (`legales.ts`) y `REINGENIERIA.md` | hoy 30 min |

Con todos los datos confirmados, `provisional` pasa a `false` en `config.ts`. Cargar datos en producción
(Neon) es parte de D-DELIV y no se hace sin la decisión del dueño.

— Elaborado por GSG
