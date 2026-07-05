# Sprint iniciado desde el móvil — protocolo de continuidad

**Qué es:** el protocolo corto para que un **sprint despachado desde el celular** (Claude
Dispatch) no pierda el hilo entre sesiones. Resuelve una sola cosa que faltaba: **dónde vive
el estado vivo del sprint**, para que desde el móvil Maxi pueda decir **"status"** y leer en
qué va, o **"seguimos"** y que la sesión retome exacto donde quedó — sin re-explicar nada.

No reemplaza nada del sistema; lo **ata**. Encaja sobre ADR-008 (el repo es la fuente de
verdad), los roles autónomos (`/sesion-movil`, `docs/METODO-ROLES.md`) y la cola de handoff
(`docs/PROXIMOS-PASOS.md`, ADR-016). La estrategia sigue viviendo en `docs/ROADMAP.md §3.4`.

> **Regla de oro:** el hilo del sprint **no vive en el chat** (la sesión siguiente no lo lee).
> Vive en este archivo. Si no está acá, no existe para la sesión que viene.

---

## Dónde vive cada cosa (mapa de una mirada)

| Necesito… | Vive en | Quién lo escribe |
|---|---|---|
| **El norte** (los 5 frentes, la visión) | `docs/FUNDAMENTOS-Y-VISION.md` + `docs/ROADMAP.md` | sesión de negocio/arquitectura |
| **El objetivo del sprint** (estratégico) | `docs/ROADMAP.md §3.4` (Sprint en curso) | quien abre el sprint |
| **El ESTADO VIVO del sprint** (qué se hizo, qué falta, próximo bocado) | **este archivo → `## Sprint activo`** | **cada sesión, al cerrar** |
| **El handoff concreto** (ítems accionables entre sesiones) | `docs/PROXIMOS-PASOS.md` | cada sesión |
| **Cómo se ejecuta** (bucle, definición de terminado, seguridad, reporte) | `docs/METODO-ROLES.md` | — (spec estable) |
| **Quién ejecuta** desde el móvil | `/sesion-movil` (rol PMO autónomo) | — (comando) |

**Para el móvil, la respuesta corta:** *el estado vivo del sprint está en `docs/SPRINT-MOVIL.md`,
sección `## Sprint activo`.* Ahí se lee "status" y desde ahí se retoma "seguimos".

---

## El ritual (3 momentos)

### 1. Iniciar un sprint (desde el móvil)
Maxi despacha el objetivo en una línea. La sesión:
1. Traduce el objetivo a un **bloque de sprint activo** (abajo): objetivo, alcance in/out,
   criterios de "hecho", checklist vivo, próximo bocado. Prioriza lo que **no depende de
   gates ni credenciales** (se puede avanzar dormido el dueño).
2. Lo registra en `## Sprint activo` de este archivo **y** en `ROADMAP.md §3.4` si toca la
   estrategia. Commit + push. A partir de acá, el sprint "existe" en el repo.
3. Empieza a ejecutar por el ítem de mayor palanca.

### 2. Pedir "status" (desde el móvil)
Al leer **"status"**, la sesión responde en **lenguaje de dueño** (producto/negocio, no
técnico — formato PMO de `METODO-ROLES.md §5`), leyendo el bloque `## Sprint activo`:
qué avanzó en términos de valor, qué está listo para mostrar/vender, qué está frenado y
**qué decisión de dueño lo destraba** (con recomendación). Nada de archivos/commits salvo
que los pida.

### 3. Decir "seguimos" (desde el móvil)
Al leer **"seguimos"**, la sesión lee `## Sprint activo → Próximo bocado`, lo ejecuta, y al
terminar actualiza el checklist. No re-pregunta el plan: el plan está escrito acá.

### 4. Cerrar cada sesión (deja el handoff listo)
No está cerrada hasta que:
- [ ] Código verificado (`tsc` + build, preview si aplica) y **commit + push a GitHub**.
- [ ] `## Sprint activo` actualizado: ítems hechos tildados, **próximo bocado** apuntando a
      lo siguiente, timestamp de "última actualización" al día.
- [ ] Follow-ups concretos anotados en `docs/PROXIMOS-PASOS.md`.
- [ ] Reporte en el formato fijo (ejecutivo · bajo nivel · estado).

**Gates que ninguna sesión cruza sola** (se reportan y esperan al dueño): deploy a
producción/Netlify y `prisma migrate deploy` (Gate 2). Todo lo demás avanza por criterio PMO.

---

## Sprint activo

> **Este bloque es la fuente de verdad del sprint en curso.** "status" lo lee; "seguimos"
> ejecuta el "Próximo bocado". Cada sesión lo deja al día antes de cerrar.

**Sprint:** Tablero honesto + deuda técnica sin gates
**Iniciado:** 2026-07-05 · **Última actualización:** 2026-07-05
**Norte (5 frentes del mandato):** tenants preseteados por rubro · mejorar ARCA · mejorar
arquitecturas · performance basada en expertos · entrenamiento de agentes del equipo técnico.

**Objetivo:** dejar el repo sin mentiras y cerrar deuda técnica de correctitud/performance
que **no depende de credenciales ni de gates** (avanzable con el dueño dormido).

**Alcance**
- **In:** consolidación del roadmap; fixes de ADR-023 sin gate (F2 ✅, F4/F5, F3); higiene del tablero.
- **Out:** RLS/2º tenant (Gate 2), WhatsApp/MP/ARCA vivo (credenciales), deploy a prod.

**Criterios de "hecho":** `tsc` + build en verde antes de cada commit · commits atómicos con
el porqué, pusheados a `origin/main` · docs y código coinciden · working tree limpio.

**Checklist vivo**
- [x] **Consolidación roadmap §3.1** — sincronizado con el registro real de blueprints (~24 presets / 4 arquetipos + comodín). *(commit `2755c72`)*
- [x] **Fix F2 — overbooking TOCTOU** — Serializable + retry (`bookingTransaction`) en las 4 rutas de reserva; ADR-004 enmendado, ADR-023 F2 resuelto. *(commit `5c63d6e`)*
- [x] **Protocolo de continuidad móvil** — este documento. *(en curso de commit)*
- [ ] **F4/F5 — limpiezas de queries** (N+1 de recursos en `assertSlotAvailable`; `_count` en `getClients`) — oportunista, bajo riesgo.
- [ ] **F3 — reportes con agregación en DB** (`getReportData` → `groupBy` con rango + `tenantId`).
- [ ] **F8 — retención de `AuditLog`** + vigilar % storage de Neon (más política que código).

**Próximo bocado (lo que ejecuta "seguimos"):** F4/F5 — colapsar el N+1 del loop de recursos
en `booking-core.ts` a una query `resourceId: { in: [...] }`, y pasar `getClients` a `_count`
en vez de traer todos los `appointments`. Cierra casi entera la ficha ADR-023 sin tocar schema.

**Esperando decisión del dueño (owner-level):** Gate 2 (activar RLS + alta del 2º tenant) y
las credenciales de WhatsApp/Mercado Pago/ARCA. En pausa a pedido de Maxi.
