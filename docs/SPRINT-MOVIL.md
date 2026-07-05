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

## Modo de operación: PARALELO por git worktrees (2026-07-05, vigente)

**Diagnóstico que lo motivó:** las sesiones paralelas se pisaban porque el repo git
(`estetica-erp`) es un **subfolder** del workspace, no la raíz — todas las sesiones abrían sobre el
**mismo working tree** y se sobrescribían los archivos sin commitear. **No era un problema de
aprobación** (las sesiones nuevas corren sobre el workspace ya confiado): era falta de aislamiento.

**Solución — un git worktree por frente.** Cada frente trabaja en **su propio directorio + su
propia rama**, aislado; el merge a `main` lo hace el coordinador de forma ordenada. Así el paralelo
es real y no hay colisión de working tree.

### Worktrees activos (rutas absolutas)
| Frente | Rama | Ruta (worktree) |
|---|---|---|
| **Coordinador / merge-master** | `main` | `C:/Users/mlloveras2/Documents/Claude/estetica-erp` |
| Frente Tests | `frente/tests` | `C:/Users/mlloveras2/Documents/Claude/estetica-erp-tests` |
| Frente Blueprints | `frente/blueprints` | `C:/Users/mlloveras2/Documents/Claude/estetica-erp-blueprints` |

*(worktrees viejos `estetica-erp-uxui` y `estetica-erp-waitlist` = features ya mergeadas, no se usan.)*

### Reglas del modo paralelo
- **Cada frente en SU worktree/rama.** Nadie edita `main` salvo el coordinador. Un tema por commit,
  `tsc`+build (+`npm test`) en verde antes de cada commit, en su propia rama.
- **⚠️ `node_modules` no viaja al worktree** (es gitignore; `git worktree add` solo saca lo
  versionado). Cada worktree necesita **`npm install`** (corre `prisma generate`) una vez antes de
  poder correr tsc/build/test. No copiar `node_modules` a mano — instalar limpio.
- **Merge-master (coordinador, en `main`):** cuando un frente termina su rama y la pushea, el
  coordinador la integra a `main` (merge o rebase) **de a una, en orden**, resolviendo conflictos,
  y pushea. Los frentes **no** mergean a main solos.
- **Handoff vivo:** el coordinador mantiene `## Sprint activo` + `docs/ESTADO-FRENTES.md` al día
  para "status"/"seguimos" desde el móvil.
- **Gates intactos:** deploy a prod/Netlify y `prisma migrate deploy` siguen siendo acción humana
  del owner; cualquier migración se deja como **carpeta nueva SIN aplicar**, marcada "pendiente
  acción humana" (`docs/METODOLOGIA-REPORTE-AVANCE.md`).

> **Fallback — sesión única en serie:** si por algún motivo no se usan worktrees, se vuelve a
> trabajar **todo en una sola sesión reutilizada, en serie** (un tema por commit), que era el modo
> interino mientras el working tree era compartido. Con worktrees ese fallback ya no hace falta.

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

**Sprint:** Paralelo por worktrees — coordinación (frente D)
**Iniciado:** 2026-07-05 · **Última actualización:** 2026-07-05 (worktrees preparados; rol coordinador)
**Estado del bloque:** 🟢 **modo PARALELO por worktrees** (ver "Modo de operación"). Terreno listo:
2 worktrees aislados creados (`frente/tests`, `frente/blueprints`), ambos desde main @ `1fa7e6a`.
Esta sesión = **coordinador / merge-master en `main`**: no ejecuta trabajo de frentes, integra sus
ramas en orden. **Ya cerrado y en main:** Tests (harness ADR-026), POS/stock (trackStock), UX slice
(tokens del turno). ⚠️ los worktrees nuevos necesitan `npm install` antes de correr tsc/build/test.
**Norte (5 frentes del mandato):** tenants preseteados por rubro · mejorar ARCA · mejorar
arquitecturas · performance basada en expertos · entrenamiento de agentes del equipo técnico.

**Objetivo:** ejecutar en serie los 3 frentes avanzables sin gate, de mayor a menor palanca,
cada uno con `tsc`+build en verde, un tema por commit, pusheado.

**Alcance**
- **In:** (a) Tests/QA — harness + ADR corto + pruebas de lógica pura ya shippeada; (b) POS/stock —
  descuento de stock al vender transaccional (sin oversell), migración como carpeta SIN aplicar;
  (c) UX/UI — completar adopción del design system en pantallas que falten.
- **Out:** RLS/2º tenant (Gate 2), WhatsApp/MP/ARCA vivo (credenciales), deploy a prod.

**Criterios de "hecho":** `tsc` + build en verde antes de cada commit · un tema por commit con
el porqué, pusheado a `origin/main` · handoff (`## Sprint activo`) al día tras cada ítem.

**Checklist vivo (coordinación)**
- [x] **main limpio y pusheado** — nada sin commitear; `origin/main` @ `1fa7e6a`. *(2026-07-05)*
- [x] **Worktrees preparados** — `frente/tests` → `../estetica-erp-tests`, `frente/blueprints` → `../estetica-erp-blueprints`, ambos desde main. *(2026-07-05)*
- [ ] **Integrar `frente/tests`** a main cuando la sesión de Tests termine y pushee su rama (merge/rebase ordenado, resolver conflictos, push).
- [ ] **Integrar `frente/blueprints`** a main ídem.
- [ ] **UX/UI restante** — barrido admin por slices (queda para un frente propio o para cuando haya preview con auth). Ya hecho: slice de tokens del turno público.

**Ya cerrado y en main (pases previos):** Tests (harness ADR-026), POS/stock (`trackStock`), UX slice
(tokens del turno), protocolo de estados/metodología, protocolo de modo de operación.

**Próximo bocado (lo que ejecuta "seguimos"):** como coordinador — **esperar a que los frentes
pusheen sus ramas e integrarlas a `main` en orden** (una por vez, tsc+build+test verde tras cada
merge, push). Si no hay ramas listas aún: mantener el tablero al día y/o tomar yo mismo un frente
del backlog (`docs/ESTADO-FRENTES.md`) en un worktree. Los merges no los hacen los frentes: los hago
yo en `main`.

**Esperando decisión del dueño (owner-level):** Gate 2 (activar RLS + alta del 2º tenant) y
las credenciales de WhatsApp/Mercado Pago/ARCA. En pausa a pedido de Maxi.
