---
description: Sesión de implementación — feature del BACKLOG o pedido del cliente
---

Sos una sesión **FEATURE** del tablero (`docs/TABLERO-SESIONES.md`). Tema de esta sesión: **$ARGUMENTS**

## Preconceptos (no re-descubrir nada de esto)

0. Leé `docs/PROXIMOS-PASOS.md` — la cola de handoff (ADR-016). Si hay ítems abiertos que se implementan (features, o follow-ups de un ADR), ofrecelos como arranque por defecto antes de preguntar en blanco. Si el tema de esta sesión ya está en la cola, ese es el ítem que vas a cerrar.
1. Leé `BACKLOG.md` del filesystem. Si el tema toca una decisión ya tomada, `docs/adr/INDEX.md` te dice en qué ADR está — leé solo ese ADR, no todos.
2. **Verificá contra el código, no contra supuestos**: si el BACKLOG dice "pendiente", confirmá en el código que realmente falta antes de implementar (ya pasó que estaba hecho y el doc estaba viejo).
3. Stack: Next.js 16 con APIs distintas a tu entrenamiento — **leé `node_modules/next/dist/docs/` antes de escribir código Next** (regla de `AGENTS.md`). Prisma + Postgres (Neon). Server Actions en `src/lib/*-actions.ts` con `"use server"`.
4. **La base es producción real.** El dev server y cualquier script pegan contra datos reales del cliente. Todo dato de prueba que crees, borralo antes de cerrar la sesión.
5. Autorización permanente del equipo: código→build→commit→push→deploy sin re-preguntar. Push a `main` deploya solo en Netlify (sitio `ch-estetica`).
6. Toda validación de negocio va **server-side** (dentro de la transacción si toca reservas) — nunca confiar en lo que calculó el navegador. Patrón ya establecido en `bookAppointment`.

## Cierre de sesión — no está "hecho" sin esto

- [ ] `npx tsc --noEmit` y `npm run build` limpios.
- [ ] Verificado en preview si el cambio es observable en el browser.
- [ ] Datos de prueba borrados de la base; scripts `scripts/_*.ts` de un solo uso, borrados.
- [ ] Commit que explica el porqué (ver `CONTRIBUTING.md`) + push.
- [ ] `BACKLOG.md` actualizado si cambió el estado de algún ítem.
- [ ] Si apareció una decisión de arquitectura nueva: **no la dejes solo en un comentario del código** — escribí el ADR en esta sesión o anotala explícitamente para `/sesion-arquitectura`.
- [ ] `docs/PROXIMOS-PASOS.md` actualizado (ADR-016): si cerraste un ítem de la cola, marcalo hecho; si esta sesión disparó un follow-up concreto (algo que otra sesión debe retomar), agregalo con el comando sugerido. En el mismo commit final.
- [ ] Sumar 1 al "Sesiones sin consolidar" de `docs/TABLERO-SESIONES.md`, en el mismo commit final.

Confirmá el alcance del tema en una línea y arrancá.
