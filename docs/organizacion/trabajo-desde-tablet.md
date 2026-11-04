# Trabajar GSG 100 % desde la tablet (sin PC)

> Decisión del dueño, 2026-11-04. Equipo: Galaxy Tab S6 Lite 2022 (SM-P613, 4 GB RAM, One UI 6.1) + teclado
> Bluetooth. Apps: Claude (sesiones en la nube), GitHub Mobile y Chrome (Vercel y Neon por web).
> Diseño consultado con Fable (planificación), ejecución en Opus.

## Principio
La tablet es una **pantalla con teclado**: no compila ni corre el ERP. Todo el trabajo corre en sesiones de Claude
Code en la nube, y **la orden del dueño es un Merge en GitHub Mobile**. Nada depende de la PC (Remote Control).

## Las 5 reglas de operación
1. **Toda entrega termina en un PR** a `main` titulado `[PUBLICAR] …`, o `[PUBLICAR + MIGRACIÓN] …` si toca
   `prisma/migrations/`. Merge = deploy de Vercel `erp-ch`. Con `MIGRATE_DATABASE_URL` en Vercel, el merge además
   aplica la migración en Neon (`scripts/vercel-build.mjs:63`): eso es Gate 2 y se decide con ese merge.
2. **Pedido de decisión en una línea:** `DECISIÓN · frente · qué · PR #n · Recomiendo: X · Respondé: SÍ / NO`.
   Nada de preguntas abiertas ni de «aprobar Bash» (`.claude/commands/sesion-movil.md`).
3. **Una sesión = un frente.** Se sigue una sesión viva sólo para el próximo bocado del mismo frente. Para otra
   tarea se abre una sesión nueva con un brief de 2 KB o menos: releer el contexto es el 97 % del gasto.
4. **Máximo 3 sesiones vivas.** Una sesión trabada se cierra con PR + relevo de 1 página. No queda abierta esperando.
5. **Bandeja diaria:** la tarea programada «Bandeja de decisiones GSG» corre de lunes a viernes a las 7:47 (hora
   argentina) y avisa al celular. Lee la lista de sesiones y los commits de `main`, y devuelve: decisiones tuyas,
   lo publicado ayer y lo listo para revisar.

## GitHub Mobile: publicar en 5 toques
1. Notificación del PR, o *Inicio → Pull requests*.
2. Abrís el PR y leés el título: si dice `+ MIGRACIÓN`, ese merge toca la base de producción.
3. *Checks*: tienen que estar todos en verde (`gates.yml`). Si hay uno rojo, no se mergea: respondé en la sesión «arreglá los checks».
4. Botón **Merge pull request → Confirm merge**.
5. Vercel construye solo. A los 2 o 3 minutos, abrí `/api/health` del sitio en Chrome. Si algo salió mal:
   *Vercel → Deployments → el deploy anterior → Promote to Production* (vuelta atrás sin tocar código).

Variables de Vercel: *vercel.com → proyecto → Settings → Environment Variables*, desde Chrome con «Sitio de
escritorio». Los secretos los pega el dueño ahí, nunca en el chat.

## No hacer desde la tablet
- Usar el SQL Editor de Neon, borrar datos o hacer un `migrate deploy` a mano.
- Mergear dos PRs con migración el mismo día. Antes de uno, crear un branch de respaldo en Neon.
- Hacer force push o tocar el freeze de `circuito-wpe`.
- Pegar secretos en una sesión.

## Configuración de la tablet (resumen)
- Animaciones en 0.5x y apps de fábrica desactivadas por ADB (una vez, desde cualquier PC).
- Protección de batería en 85 %.
- *Batería → Límites de uso en segundo plano*: Claude, GitHub y WhatsApp Business en «Nunca se suspenden».
- Barra de tareas, y par de apps Claude + Chrome guardado.
- Chrome sin precarga y con 5 pestañas como máximo.
- Atajos de texto: `xsm` → `/sesion-movil`, `xst` → `status`, `xsg` → `seguimos`.
- Rutina de *Modos y rutinas*: al conectar el teclado se activa el modo Trabajo.
