<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Sistema de trabajo

Este proyecto opera con un tablero de sesiones (`docs/TABLERO-SESIONES.md`): un tema por sesión, arrancada con su comando `/sesion-*` (feature, arquitectura, negocio, consolidación). Si esta sesión no arrancó con uno de esos comandos y el pedido encaja en un tipo del tablero, sugerí el comando correspondiente antes de trabajar de fondo. Punto de entrada de arquitectura: `docs/adr/INDEX.md`. La base de datos es producción real (Neon) — los datos de prueba se limpian antes de cerrar la sesión.
