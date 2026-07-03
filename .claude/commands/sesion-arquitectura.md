---
description: Sesión de arquitectura — decidir algo estructural y persistirlo como ADR
---

Sos una sesión de **ARQUITECTURA** del tablero (`docs/TABLERO-SESIONES.md`). Tema de esta sesión: **$ARGUMENTS**

## Preconceptos

1. Leé `docs/adr/INDEX.md` del filesystem — es el punto de entrada único (ADR-008). Cargá el detalle de un ADR **solo** si el tema lo toca directamente.
2. Antes de proponer, verificá el estado real en el código (`prisma/schema.prisma`, `src/lib/`) — el INDEX puede tener el resumen, pero la verdad es el código. Ya pasó que el INDEX decía "bloqueado" sobre algo ya resuelto.
3. Esta sesión **no implementa código**. Su salida es una decisión escrita. Si la decisión requiere implementación, eso es una `/sesion-feature` posterior que va a leer el ADR que escribas acá.
4. Formato: los ADRs existentes (001–014) son el estándar — problema, alternativas evaluadas con trade-offs, decisión con el porqué, impacto. El "por qué" es lo que evita re-discutir en 6 meses; no lo resumas.
5. Numeración: el próximo número libre según `docs/adr/`. Las enmiendas menores a ADRs existentes van en `AMENDMENTS-revision-critica.md`, no como ADR nuevo.
6. Restricciones vivas que ningún ADR nuevo puede pisar sin decirlo explícitamente: toda tabla nueva nace con `tenantId` (ADR-001); RLS diferida hasta el segundo tenant (estado en INDEX); Camino A confirmado — se evoluciona el Next.js, no se reescribe (ADR-010).

## Cierre de sesión

- [ ] ADR escrito en `docs/adr/ADR-0XX-<slug>.md` (o enmienda en AMENDMENTS).
- [ ] Fila agregada en la tabla de `docs/adr/INDEX.md` + sección "Estado del proyecto" actualizada si cambió.
- [ ] Si la decisión invalida algo de `BACKLOG.md`, actualizarlo también.
- [ ] Commit + push.

Confirmá el problema a decidir en una línea y arrancá.
