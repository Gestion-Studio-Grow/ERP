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

## Modo de operación: SESIÓN ÚNICA en serie (2026-07-05, vigente)

**Regla vigente:** el owner **no quiere abrir sesiones nuevas ni frentes paralelos**. Se trabaja
**todo en una sola sesión reutilizada**, con los frentes **ejecutados en serie** (uno después del
otro). Esto **no rompe** ADR-008 ("un tema por thread"): la atomicidad baja del *thread* al
*commit* — **un tema por commit**, secuencial, cada uno con su `tsc`+build (+`npm test`) en verde y
su push.

**Cómo se opera:**
- **En serie, por palanca:** se toma el frente de mayor palanca del backlog (`docs/ESTADO-FRENTES.md`),
  se lleva hasta commit+push, y recién ahí se arranca el siguiente. Nunca dos a la vez.
- **Un tema por commit**, atómico, con el porqué; verde antes de cada uno; push al terminarlo.
- **Handoff vivo:** al cerrar cada tema se actualiza `## Sprint activo` (tildado + próximo bocado +
  timestamp), así "status"/"seguimos" desde el móvil retoman exacto aunque se corte la sesión.
- **Gates intactos:** deploy a prod/Netlify y `prisma migrate deploy` siguen siendo acción humana
  del owner; cualquier migración se deja como **carpeta nueva SIN aplicar**, marcada "pendiente
  acción humana" (`docs/METODOLOGIA-REPORTE-AVANCE.md`).

> **Nota (worktrees, descartado):** se evaluó y preparó paralelismo real por **git worktrees** (el
> repo es un subfolder del workspace → las sesiones paralelas compartían el mismo working tree y se
> pisaban). El terreno se creó y se **revirtió limpio** a pedido del owner (no quiere sesiones
> nuevas): worktrees removidos, ramas `frente/*` borradas, `main` intacto. Si algún día se retoma el
> paralelo, la vía correcta es un worktree por frente + merge-master en `main` — no abrir varias
> sesiones sobre el mismo subfolder.

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

**Sprint:** Sesión única en serie — frentes sin gate por palanca
**Iniciado:** 2026-07-05 · **Última actualización:** 2026-07-05 (worktrees revertidos; sesión única)
**Estado del bloque:** 🟢 en curso · **modo SESIÓN ÚNICA en serie** (el owner no quiere sesiones
nuevas). Los worktrees preparados para paralelo se **revirtieron limpio** (removidos, ramas
`frente/*` borradas, main intacto). Esta única sesión ejecuta los frentes en serie.
**Norte (5 frentes del mandato):** tenants preseteados por rubro · mejorar ARCA · mejorar
arquitecturas · performance basada en expertos · entrenamiento de agentes del equipo técnico.

**Objetivo:** seguir cerrando frentes avanzables sin gate, de mayor a menor palanca, en serie,
cada uno con `tsc`+build (+`npm test`) en verde, un tema por commit, pusheado.

**Alcance**
- **In:** UX/UI (barrido de adopción restante, por slices), POS caja/compras, reportes v2, adapters sin credencial (ARCA `soap.ts` / MP), nuevos presets de rubro.
- **Out:** RLS/2º tenant (Gate 2), WhatsApp/MP/ARCA vivo (credenciales), deploy a prod, abrir sesiones/frentes nuevos.

**Criterios de "hecho":** `tsc` + build en verde antes de cada commit · un tema por commit con
el porqué, pusheado a `origin/main` · handoff (`## Sprint activo`) al día tras cada ítem.

**Ya cerrado y en `main`:** Tests (harness ADR-026), POS/stock (`trackStock`, migración sin aplicar),
UX slice (tokens del turno público), protocolo de estados/metodología, protocolo de modo de operación.

**Checklist vivo (pendiente, por palanca)**
- [ ] **UX/UI restante** — barrido de adopción del design system por slices (público verificable primero; admin queda para cuando haya preview con auth).
- [ ] **POS — caja/compras** — profundidad de ERP retail (feature sizable).
- [ ] **Reportes v2** — no-show, retención, export (sobre `getReportData` ya acotado).
- [ ] **Adapters sin credencial** — ARCA `soap.ts` / adapter MP contra homologación (dev, no credencial).

**Próximo bocado (lo que ejecuta "seguimos"):** seguir el **barrido UX por slices** en pantallas
verificables por estructura (tokens semánticos), o —por palanca— **POS caja/compras**. Un frente
por vez, un tema por commit, en esta única sesión. Alternativas en `docs/ESTADO-FRENTES.md`.

**Esperando decisión del dueño (owner-level):** Gate 2 (activar RLS + alta del 2º tenant) y
las credenciales de WhatsApp/Mercado Pago/ARCA. En pausa a pedido de Maxi.
