# Relevamiento de la referencia — picsel.app

Fecha: 08/10/2026. Recorrido hecho con Chromium sin interfaz desde un sandbox remoto (el contenedor de
trabajo tiene picsel.app bloqueado por la red). Se relevó **qué hace y cómo está organizada**. No se copió
ningún texto, logo, nombre ni foto: lo de buscatufoto es propio.

Páginas recorridas: `/`, `/features`, `/calculator`, `/faq`, el perfil público
`/user/valentinalopez-ph` (link que pasó el dueño) y uno de sus álbumes (`/event/…`).

## Estructura medida

| Elemento | Referencia | buscatufoto |
|---|---|---|
| Barra superior | `nav` fija; logo, tema, idioma, "How it works", "Pricing", "Blog", "I am a Photographer" | igual, 64 px, en rioplatense |
| Fondo | `div` fijo con `/hero.webp` detrás de toda la página | foto propia B/N fija (`public/fondo/pista.webp`) |
| Titulares | Grotesca (TeX Gyre Heros), 60 px, peso 300, interletrado −3 px (−0,05em) | Hanken Grotesk 300, −0,05em, 30 px móvil / 48–60 px escritorio |
| Botones | 14 px, peso 500, radio 10 px | igual |
| Inicio | héroe → 3 pasos numerados → 6 tarjetas de funciones con tinte (degradé a la esquina) → 2 planes → pie | igual orden |
| Funciones | 15 funciones, algunas marcadas PRO | página `/funciones` con las nuestras, sin inventar las que no hacemos |
| Calculadora | ventas/mes + moneda, fotos/mes, videos/mes, GB, ciclo mensual/anual → total de cada plan y cuál conviene, con el desglose de créditos | `/calculadora`, pesos argentinos |
| Preguntas | qué es, cómo se usa, costos, comisión del procesador, límites, búsqueda facial, país, contenido permitido, carga lenta, contacto | `/preguntas` con las nuestras |
| Perfil público | foto, @usuario, bio, red social, grilla de álbumes con nombre y fecha, paginado, QR | `/f/[usuario]` |
| Álbum | portada, nombre, fecha, deporte, fotógrafo, instrucciones, precio por foto, "Paquete disponible", "Encontrá tus fotos" (rostro y/o número), grilla de filas de 300 px con "Agregar", barra "Comprar" | `/a/[album]` |
| Paquete | "5 fotos a precio de paquete; se aplica solo en el checkout" con el ahorro | paquetes + escalones por cantidad |
| Búsqueda | diálogo: selfie (JPG/PNG ≤ 5 MB, "se usa solo para la búsqueda") y número | número; selfie "próximamente" |

## Panel interno (captura del panel de la fotógrafa que mandó el dueño, móvil, tema oscuro)

Menú hamburguesa a la derecha: Blog · Crear álbum · Mi perfil · Ventas · Descuentos y paquetes · Cupones ·
Colaboradores · Facturación · Referidos · Studio · Cerrar sesión. La pantalla "Facturación" muestra "Plan
actual" con una etiqueta del plan, y "Planes disponibles" en tarjetas apiladas con precio, límites y un
alternador mensual/anual en botones.

En buscatufoto el panel replica esa organización (sin Referidos ni Studio, fuera de alcance). Diferencia de
diseño: descuentos, paquetes y cupones se configuran **por álbum** (lo pide el encargo); las secciones del menú
los muestran agrupados por álbum.

## Modelo de negocio observado (para no copiarlo, sólo entenderlo)

- Plan sin costo fijo: comisión porcentual por venta, almacenamiento con tope.
- Plan pago por créditos: 0 % de comisión, 1 foto = 1 crédito, 1 video = 10, 1 GB guardado = 4/mes; los
  créditos no usados pasan al ciclo siguiente; el excedente se cobra en la renovación; anual más barato.
- Cobro: Mercado Pago en Argentina, Stripe para el resto.

Los números de buscatufoto son **propios y provisionales a confirmar** (ver `src/lib/planes.ts`).

— Elaborado por GSG
