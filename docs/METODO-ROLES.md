# Método de trabajo — roles autónomos

**Qué es:** el método común que siguen todos los roles autónomos del proyecto —los comandos `/rol`, `/rol-fullstack`, `/sesion-movil` y los agentes de `.claude/agents/`—. Un solo lugar para mejorar la forma de trabajar de todos a la vez. Cada rol define **quién** es; este archivo define **cómo** trabaja.

## 1. Anclaje de identidad
No "hacés" el rol: **sos** el rol. Pensás, priorizás y decidís como esa persona lo haría en serio. Antes de actuar, preguntate *"¿qué haría un [rol] senior con esta tarea?"* y actuá desde ahí. Mantené el personaje toda la sesión; si dudás, releé tu rol antes de seguir.

## 2. Bucle de trabajo (en TODA tarea)
1. **Entender** — leé los punteros que aplican (`docs/TABLERO-SESIONES.md`, `docs/adr/INDEX.md`, `docs/PROXIMOS-PASOS.md`, `BACKLOG.md`) y el **código real** antes de opinar. Nada de trabajar sobre suposiciones.
2. **Plan corto** — en 2-3 líneas: qué vas a hacer y por qué. Si la tarea es grande, partila.
3. **Hacer** — ejecutá con el criterio del rol. Cambios chicos, coherentes con el código que ya existe.
4. **Verificar** — probá tu trabajo (ver Definición de terminado). No entregás lo que no verificaste.
5. **Reportar** — el formato fijo de abajo. Anotá cualquier follow-up en `docs/PROXIMOS-PASOS.md`.

## 3. Definición de terminado (no está listo hasta que…)
- Si tocaste **código**: `tsc --noEmit` en verde **y** `npm run build` en verde (+ preview si cambió una pantalla).
- Si tomaste una **decisión estructural**: quedó un **ADR** con el porqué (no solo un comentario en el código).
- El repo quedó **limpio** (`git status`), sin datos de prueba en la base (es producción), sin scripts `_*.ts` de un solo uso olvidados.
- El trabajo quedó en un **commit local** con mensaje que explica el *porqué* (ver `CONTRIBUTING.md`).

## 4. Reglas de seguridad (innegociables)
- **NO deploy:** push a `main` deploya en Netlify y **gasta créditos** → commit local y "pendiente de deploy". Deploy **solo** cuando Maxi diga *"deployá"*.
- **Gate DB producción:** `prisma migrate deploy` se **pausa y se reporta**; no se corre solo.
- **Destructivo bloqueado** por config (force push, reset --hard, migrate reset, DROP, rm -rf).
- La base es **producción real** (Neon): borrá datos de prueba antes de cerrar.

## 5. Formato de reporte (Maxi es funcional, no técnico)
- **🟢 Ejecutivo:** en llano — qué se logró y qué significa para el negocio.
- **🔧 Bajo nivel:** archivos tocados, hash del commit, resultado `tsc`/build, ADR si hubo.
- **🚀 Estado de deploy:** siempre → *"commiteado local, NO deployado; decime 'deployá' para subir a producción"*.
- Si algo te **bloquea de verdad**: **una** pregunta concreta por notificación push, y esperás.

Idioma: **español rioplatense**, llano y directo.
