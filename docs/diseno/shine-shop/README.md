# Shop de Shine — lienzo de diseño

Diseño de la **tienda (shop) de Shine velas store**: catálogo por familia olfativa, ficha de
producto, versión de teléfono, quiz de aroma y carrito. **Elaborado por GSG.**

Lienzo publicado: https://claude.ai/code/artifact/1e9f7ed3-1564-4cbd-9769-7f0e4f7c74f3

## De dónde sale cada cosa

- **Marca:** `docs/diseno/marca-shine-spec.md` (manual oficial 2026, Cisterna Aylén). Paleta,
  tipografía e isotipo salen de ahí, sin agregados.
- **Tokens:** los mismos que ya corre `src/app/tienda/ShineFront.tsx` en producción
  (crema `#f3ebe1`, burdeos `#671128`, malva `#b88a89`/`#835c5b`, nude `#d0aeac`, blush
  `#e8d9d5`, tinta `#3a2429`; Cormorant Garamond + Kumbh Sans; radios 16/14/999; sombra cálida).
- **Copy y datos:** `src/tenants/storefront.ts → shinevelas` (envío $3.500, gratis desde
  $25.000, CABA y GBA, medios de pago, sets de regalo, aromas de temporada).
- **Fotos e isotipo:** `public/tenants/shinevelas/`.

## El fondo y dónde va la imagen

El primer corte tenía el fondo plano y la foto en el rectángulo de siempre (mitad texto,
mitad imagen). Los dos eran el molde previsible. Se rehicieron:

- **El papel (fondo).** Tres capas: un degradado tonal cálido con la luz entrando por arriba
  a la izquierda —la marca ES la luz—, un grano finísimo que le da tacto de papel, y la
  **trama oficial del manual (pág. 15)** redibujada en vector, al 7 %, sólo en los bordes de
  cada banda y **nunca detrás del texto**. La trama estaba en el manual y no se usaba.
- **La imagen vive DENTRO del isotipo.** La foto de apertura va recortada con la silueta de
  la llama de Shine, con un eco corrido detrás para dar profundidad. Es el recurso que
  ninguna otra tienda de velas puede copiar, porque la forma es de la marca. También se usa
  en el teléfono y en una miniatura de la ficha.
- **El resto de las imágenes salen de la grilla:** la fila de familias se escalona (alturas y
  desfases distintos), la foto de sets sangra por el borde izquierdo de la página, y la foto
  de la ficha sangra por el borde con las miniaturas en riel.
- **Cada tarjeta lleva el ícono oficial de SU formato** (vela, vela grande, difusor,
  sahumerio, textil) en vez de repetir la misma silueta doce veces. El baño de color dice la
  familia; el ícono dice el formato.

Todo esto se verificó renderizando en Chromium y mirando el resultado, no a ojo: se probaron
tres intensidades de grano, tres de trama y tres composiciones distintas del hero antes de
elegir.

## Qué resuelve

El problema del rubro es que **no se puede oler por pantalla**. Todo el diseño ataca eso:
familias olfativas como filtro (tintes de la propia paleta, no colores nuevos), notas visibles
en cada tarjeta, pirámide salida/corazón/fondo en la ficha, medidor de intensidad con el
isotipo, horas que dura, m² que ambienta y quiz de aroma de tres pasos.

## Datos de muestra a reemplazar

Reales: envío, umbral de envío gratis, zonas, medios de pago, los tres sets con su precio,
los siete aromas de temporada, todo el copy de marca.
**De muestra:** precios de las velas sueltas, horas de duración y m². WhatsApp quedó como
`[TU NÚMERO]`. El "Trío para descubrir · 3 minis" de la ficha va marcado *A proponer*: no
existe hoy, es una propuesta de producto.

## Cómo regenerar la página

Los `.dc.html` y `canvas.json` son la fuente. La página armada NO se versiona (~3 MB,
`.gitignore`): se rearma con el helper de la skill `design`, pasando los ocho artboards, el
`canvas.json` y las imágenes de `public/tenants/shinevelas/` (`logo.png`, `flame-mask.png`,
`hero.jpg`, `ambiance.jpg`, `gift.jpg`, `mundo-velas.jpg`, `mundo-aromas.jpg`,
`mundo-decoracion.jpg`), y se republica sobre la MISMA URL de arriba.
