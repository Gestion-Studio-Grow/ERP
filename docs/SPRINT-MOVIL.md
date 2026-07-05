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

**Cómo se reportan estados y %:** un "status" usa los **estados canónicos** de
`docs/METODOLOGIA-REPORTE-AVANCE.md` — 🟢 Avanzable ya · ✅ Completado — pendiente acción humana ·
🔒 Gated. Lo que está terminado del lado dev y solo espera una acción tuya (credenciales, aplicar
migración, OK de gate) se reporta **"listo, esperando que hagas X"**, NO como "a medias". El mapa
vivo de todos los frentes bajo esa metodología es `docs/ESTADO-FRENTES.md`.

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

**Sprint:** Avanzamos todo — deuda técnica + equipo de élite (sin gates)
**Iniciado:** 2026-07-05 · **Última actualización:** 2026-07-05 (F3 + F8 + onboarding cerrados; ítem 4 evaluado)
**Estado del bloque:** ✅ **cerrado** — 3 de 3 ítems planificados hechos. Ítem 4 (mejora extra sin
gate) evaluado: **sin candidato que pase el filtro** calidad-vs-especulación (whereForTenant solo
paga post-RLS; test harness es decisión estructural → ADR aparte). Ambos anotados en
`PROXIMOS-PASOS.md`. Working tree limpio, todo en `origin/main`.
**Norte (5 frentes del mandato):** tenants preseteados por rubro · mejorar ARCA · mejorar
arquitecturas · performance basada en expertos · entrenamiento de agentes del equipo técnico.

**Objetivo:** cerrar la deuda de performance/arquitectura restante sin gates y **abrir el 5º
mandato** (equipo técnico de élite), todo verificado y pusheado.

**Alcance**
- **In:** F3 (reportes en DB), F8 (retención AuditLog), doc de onboarding del equipo/agentes, y mejoras de arq/perf sin gate de alta palanca.
- **Out:** RLS/2º tenant (Gate 2), WhatsApp/MP/ARCA vivo (credenciales), deploy a prod.

**Criterios de "hecho":** `tsc` + build en verde antes de cada commit · commits atómicos con
el porqué, pusheados a `origin/main` · docs y código coinciden · working tree limpio.

**Checklist vivo**
- [x] **F3 — reportes con agregación acotada** — rango obligatorio (default 90d, selector 30/90/180/365) + `tenantId` + `select` acotado; se acabó el escaneo de todo el histórico. *(este sprint, 2026-07-05)*
- [x] **F8 — retención de `AuditLog`** — política (18m) + purga (`purge-audit`, dry-run por default) listas; ADR-009/007 enmendados. Sin ejecutar contra prod. *(este sprint, 2026-07-05)*
- [x] **Onboarding equipo/agentes** — `docs/ONBOARDING-EQUIPO.md` (modelo mental, ruta de ramp, estándar de élite, cómo se entrena/mejora a los agentes); registrado en tablero + manual. *(este sprint, 2026-07-05)*
- [x] **Extra alta palanca sin gate** — evaluado, sin candidato válido (no se fabricó trabajo especulativo); dos follow-ups de arquitectura anotados (tests, whereByTenant). *(este sprint, 2026-07-05)*

**Próximo bocado (lo que ejecuta "seguimos"):** el pozo de deuda técnica *sin gate* quedó
drenado. Las siguientes palancas requieren una decisión o un gate tuyo, así que "seguimos"
arranca por lo de mayor valor que NO dependa de credenciales: **`/sesion-arquitectura adoptar un
harness de tests`** (el repo no tiene tests — gap real para un equipo de élite; empezar por la
lógica pura ya lista). Alternativas si preferís: retomar un frente de producto (POS: descontar
stock al vender) o esperar tu OK para los gates (RLS/2º tenant) y credenciales.

**Esperando decisión del dueño (owner-level):** Gate 2 (activar RLS + alta del 2º tenant) y
las credenciales de WhatsApp/Mercado Pago/ARCA. En pausa a pedido de Maxi.
