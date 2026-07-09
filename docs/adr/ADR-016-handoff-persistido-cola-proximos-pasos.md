---
id: ADR-016
nivel: evolutiva
dominio: [Operaciones]
depends_on: [ADR-008]
---
# ADR-016: El handoff entre sesiones se persiste en una cola, no en el chat

**Estado:** Aceptado — implementado (2026-07-03)
**Enmienda operativa de:** ADR-008 (un thread por tema; el repo es la única fuente de verdad; la sesión siguiente no re-lee threads viejos, lee el repo).
**No cambia:** ninguna decisión de producto. Cambia el protocolo de trabajo del tablero de sesiones.

---

## 1. Problema

El sistema de sesiones (ADR-008, operacionalizado en `docs/TABLERO-SESIONES.md`) persiste bien dos de las tres cosas que produce una sesión:
- Las **decisiones** persisten como ADR.
- Las **features** persisten en `BACKLOG.md`.
- El **handoff** — "qué sigue concretamente después de cerrar esto" — vivía **en el chat**.

Y el chat es exactamente lo único que la sesión siguiente **no** lee (ADR-008, regla 4). Resultado observado y repetido: al cerrar una sesión se enunciaba el próximo paso en un mensaje ("implementar ADR-015 en `tenant.ts`"), ese mensaje se evaporaba, y al abrir la sesión siguiente había que **re-tener la conversación** de "¿qué abro / qué sigue?". El comando leía BACKLOG e INDEX, pero el follow-up puntual no estaba en ninguno con la forma accionable "hacé esto ahora".

Dicho crudo: el handoff no estaba persistido, así que se re-generaba a mano cada vez. Es un incumplimiento de ADR-008 en el único eslabón que había quedado sin cubrir.

## 2. Alternativas evaluadas

### A. Statu quo — el próximo paso se dice en el chat al cerrar
- **Costo:** cero.
- **Problema:** el que describe §1 — la charla de handoff se repite en cada apertura de sesión, y depende de que un humano se acuerde de lo que dijo el thread anterior. Contradice ADR-008.
- **Descartada:** es justamente el costo recurrente que motivó este ADR.

### B. Reusar `BACKLOG.md` e INDEX "próximos pasos" para los follow-ups
- **Costo:** bajo, no hay archivo nuevo.
- **Problema:** BACKLOG es la lista de *deseos de negocio*; meterle tareas derivadas ("implementar tal ADR") lo ensucia y mezcla dos naturalezas distintas. El INDEX "próximos pasos" es solo para candidatos de arquitectura y nadie lo lee-y-ofrece al abrir. Ninguno de los dos cubre los cuatro tipos de sesión ni se *surface-a* solo.
- **Descartada:** obliga a elegir el archivo equivocado según el tipo de follow-up y no resuelve el "se ofrece solo al abrir".

### C. Una cola de handoff dedicada, enganchada al ciclo de vida de los comandos *(elegida)*
- **Costo:** bajo — un archivo (`docs/PROXIMOS-PASOS.md`) y tres ganchos en los comandos (ya versionados).
- **Qué hace:** el comando **lee** la cola al abrir y ofrece los ítems que le tocan; **escribe** el follow-up al cerrar; `/sesion-consolidacion` **poda**. El handoff pasa de vivir en el chat a vivir en el repo.

## 3. Decisión

Se adopta **C**. El handoff entre sesiones se persiste en `docs/PROXIMOS-PASOS.md`, una cola enganchada al ciclo de vida de todos los `/sesion-*`:

1. **Al abrir** (preconcepto de cada comando): leer la cola y ofrecer los ítems abiertos que le tocan a ese tipo de sesión como arranque por defecto, antes de preguntar en blanco.
2. **Al cerrar** (checklist de cierre de cada comando): si la sesión disparó un follow-up concreto, anotarlo en la cola con el comando sugerido, en el mismo commit final; si completó un ítem de la cola, marcarlo hecho.
3. **Al consolidar** (`/sesion-consolidacion`): podar la cola — sacar lo hecho, revalidar lo abierto contra el código.

El porqué que se lee en 6 meses: **una sesión produce tres cosas — decisiones, features y follow-ups — y las tres tienen que persistir en el repo para cumplir ADR-008.** Las dos primeras ya tenían su lugar (ADR / BACKLOG); esta es la tercera. Poner el handoff en un archivo no es burocracia: es lo que borra la conversación repetida de "¿qué abro?" — el repo se pasa el trabajo a sí mismo y el humano elige de una lista corta en vez de reconstruirla de memoria.

## 4. Impacto

- **ADR que toca:** enmienda operativa de ADR-008 (no lo reemplaza; cubre su eslabón faltante). Sin impacto en ADRs de producto.
- **Archivos de workflow (implementados en esta misma sesión, excepción de construcción autorizada por ser meta-workflow, no código de producto):**
  - Nuevo: `docs/PROXIMOS-PASOS.md` (la cola, sembrada con el follow-up de ADR-015).
  - Editados: los 5 comandos `.claude/commands/sesion-*.md` — read al abrir, write al cerrar; `sesion-consolidacion` suma el punto de poda.
  - `docs/TABLERO-SESIONES.md` y `docs/MANUAL-SESIONES.md`: documentan la cola.
- **Migración / código de producto / BACKLOG:** ninguno.

## 5. Decisión final

Se acepta C: el handoff se persiste como cola de próximos pasos, leída al abrir y escrita al cerrar por cada comando, podada por consolidación. Cierra el último eslabón de ADR-008 que seguía viviendo en el chat.
