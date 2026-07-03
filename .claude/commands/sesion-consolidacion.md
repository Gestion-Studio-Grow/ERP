---
description: Sesión de consolidación — auditar que docs y código sigan coincidiendo, cerrar huecos
---

Sos la sesión de **CONSOLIDACIÓN** del tablero (`docs/TABLERO-SESIONES.md`). Tu trabajo es que el repo no mienta: cada punto del checklist se verifica **contra el código y el estado real**, nunca contra lo que dice otro documento.

## Checklist de auditoría (correr completo, en orden)

1. **BACKLOG vs código**: cada ítem "pendiente" de `BACKLOG.md`, ¿sigue realmente pendiente? Buscar en el código antes de confirmar (ya pasó que "turno manual" figuraba pendiente estando implementado). Ítems hechos que no figuran en "Hecho", agregarlos.
2. **ADRs referenciados vs escritos**: `grep -rn "ADR-0" src/ prisma/` — todo ADR citado en código debe existir en `docs/adr/`. (Ya pasó con ADR-013/014: citados en comentarios, nunca escritos.)
3. **INDEX.md al día**: la tabla incluye todos los ADRs del directorio; la sección "Estado del proyecto" refleja las decisiones más recientes, no una foto vieja.
4. **Código muerto o desconectado**: funciones exportadas que nadie usa (ya pasó con `getPublishedReviews()`, moderación sin salida pública). `grep` de exports sospechosos contra sus call sites.
5. **Higiene del repo**: `git status` limpio; sin `scripts/_*.ts` de un solo uso olvidados; sin datos de prueba en la base (buscar clientes/turnos/reseñas con nombres tipo "QA"/"Test" — la base es producción).
6. **Deploy real**: último commit de `main` == último deploy `ready` en Netlify (`npx netlify api listSiteDeploys --data '{"site_id":"1865126e-8dc2-4ce8-8377-74a669e89610","per_page":2}'`).
7. **Docs de negocio**: ¿algún doc de `docs/` afirma algo que el código ya contradice?
8. **El tablero mismo**: ¿la tabla de `docs/TABLERO-SESIONES.md` coincide con los comandos que existen en `.claude/commands/`?

## Reglas

- Cada hallazgo se corrige con un commit (o se anota como sesión pendiente del tipo correcto si excede esta sesión — no arregles features acá).
- Reportá al final: qué estaba bien, qué se corrigió, qué quedó anotado para otra sesión.

## Cierre

- [ ] Todos los commits correctivos pusheados.
- [ ] Volver a 0 el "Sesiones sin consolidar" de `docs/TABLERO-SESIONES.md`, en el mismo commit de cierre.
- [ ] Resumen final con los tres grupos (bien / corregido / anotado).

Arrancá por el punto 1.
