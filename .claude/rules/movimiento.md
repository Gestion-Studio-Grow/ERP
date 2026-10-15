---
paths:
  - "**/*.{tsx,jsx,vue,svelte,astro}"
  - "**/*.{css,scss}"
---
# Movimiento (se carga al tocar UI)
- Antes de animar, preguntate: ¿esto se ve 100+ veces al día? Si sí, no se anima.
- **Por defecto, sólo `transform` y `opacity`.** Nunca width/height/top/left. Nunca `transition: all`.
- **Excepción de la casa (skill `vidriera-de-autor`, tabla de errores):** el titular que es candidato a LCP no entra desde `opacity: 0`, porque Chrome no lo cuenta hasta que se ve. Ahí se anima `transform`, `clip-path` o `filter`.
- Easings: los de DESIGN.md (`--ease-out`, `src/design/tokens.ts:252`). Nunca ease-in. Salidas más rápidas que entradas.
- Duraciones: los tokens `--dur-1/2/3` = 120 / 200 / 320 ms (`src/design/tokens.ts:248-251`). Entradas de hasta 500 ms. Más de 600 ms sólo en una pieza de autor y con la justificación escrita.
- `prefers-reduced-motion` siempre contemplado, con un estado final legible sin movimiento.
- **Librerías: hoy no hay ninguna de animación instalada** (ni GSAP ni Motion; ver package.json). Se anima con CSS y, en 3D, con `three`. Sumar una es dependencia nueva: se pregunta antes.
- Si algún día se suma: GSAP para scroll y timelines complejas, Motion o CSS para micro-interacciones, nunca dos librerías en el mismo componente; plugins registrados una vez y limpieza al desmontar.
- Stagger: 30–60 ms entre elementos; máximo 8 elementos escalonados.
- Performance: `will-change` sólo durante la animación; nada de animar en scroll sin `requestAnimationFrame`.
- **Excepción — revelar contenido:** un acordeón o desplegable puede animar `max-height` con tope, porque empujar lo de abajo no tiene equivalente con `transform`. Caso: `src/app/(site)/_ch/ServicesAccordion.tsx:149-159` (el propio código explica que `grid-template-rows` se traba a mitad de camino en WebKit/Chromium).
- **Excepción — pieza de autor:** en una vidriera hecha con la skill `vidriera-de-autor`, el momento protagonista puede pasar los 600 ms y usar un efecto propio, si no toca la opacidad del candidato a LCP y se mide. Caso: el titular de Qué Bien Olés, 1,2 s y 1,6 s (`src/app/tienda/quebienoles/estilos.ts:185-190`) y las puertas con `flex-grow` (`:222`).
- **Deuda anotada, sin deploy propio:** en ese mismo archivo, `top` del enlace de salto (`:105`) y `background-size` del subrayado (`:151`) se pasan a `transform` la próxima vez que alguien toque `estilos.ts`.
- Lo viejo que no cumple no se reescribe de paso: la guardia `design-lint` sólo juzga las líneas que tocás.
