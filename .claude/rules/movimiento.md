---
paths:
  - "**/*.{tsx,jsx,vue,svelte,astro}"
  - "**/*.{css,scss}"
---
# Movimiento (se carga al tocar UI)
- Antes de animar, preguntate: ¿esto se ve 100+ veces al día? Si sí, no se anima.
- Solo transform y opacity. Nunca width/height/top/left. Nunca transition: all.
- Easings: los de DESIGN.md. Nunca ease-in. Salidas más rápidas que entradas.
- Duraciones: micro 120–200 ms, entradas 300–500 ms, scroll con scrub. Más de 600 ms solo con justificación.
- prefers-reduced-motion siempre contemplado, con un estado final legible sin movimiento.
- Librerías: GSAP para scroll y timelines complejas; Motion o CSS para micro-interacciones. No mezclar dos librerías de animación en el mismo componente.
- GSAP: registrar plugins una vez; en React usar useGSAP o gsap.context con cleanup; matar ScrollTriggers al desmontar.
- Motion: no mezclar imports de "motion/react" y "framer-motion"; AnimatePresence para salidas.
- Stagger: 30–60 ms entre elementos; máximo 8 elementos escalonados.
- Performance: will-change solo durante la animación; nada de animar en scroll sin requestAnimationFrame o ScrollTrigger.
