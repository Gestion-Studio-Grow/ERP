# Unboxing Fest · cómo se publica

Los juegos (HTML de un solo archivo con la marca de Farmaonline) **no están en este repo** a propósito: no hay
autorización registrada de Farmaonline/MIA para usar su marca, y cada push a una rama arma un preview en Vercel.
Viven en el Drive de GSG (carpeta de entregables de Unboxing Fest).

Cuando estén la autorización y la orden del dueño:
1. Copiar `index.html`, `sw.js` y los 3 `farmaonline-*.html` del Drive a `public/juegos/unboxingfest/`.
2. Completar en cada juego `endpoint`, `endpointToken`, `waMarca`, `pin` y `codeSalt` (ver `GUIA-OPERACION.md` § 5).
3. Agregar el dominio `unboxingfest.gsgapp.com.ar` al proyecto de Vercel (la ruta ya está en `src/lib/producto-host.ts`).
4. Publicar en una tanda (reglas de `Factory-GSG/10-GOBIERNO/despliegues-vercel.md`).
