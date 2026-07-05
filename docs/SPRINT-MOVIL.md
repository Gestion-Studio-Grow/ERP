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

## Modo de operación: SPRINT de 5 equipos (2026-07-05, vigente)

**Modelo vigente:** el owner dispara un **sprint** desde el móvil y el frente de IA lo ejecuta como
**5 equipos en paralelo, cada uno en su git worktree aislado** (el 5º = Ejecutivo/PMO trabaja sobre
`main` y es el merge-master). La **metodología canónica completa** —los 5 roles, las reglas, el
protocolo de las 4 palabras (`sprint`/`status`/`seguimos`/`pausa`)— está en
**`docs/METODOLOGIA-SPRINT.md`** y en el comando **`/sprint`**. Resumen operativo:

- **Un worktree por equipo** (aislamiento real; el repo es subfolder → sin worktree las sesiones se
  pisan el working tree). Rutas y ramas en `docs/METODOLOGIA-SPRINT.md`.
- **Un tema por commit**, `tsc`+build (+`npm test`) en verde antes de cada uno.
- **`git pull --rebase` antes de integrar; solo el PMO mergea a `main`**, de a una rama, en orden.
- **⚠️ cada worktree necesita `npm install`** una vez (no viaja `node_modules`).
- **Gates = acción humana del owner** (deploy/Netlify, `migrate deploy`); migraciones como carpeta
  SIN aplicar, marcadas "pendiente acción humana".

> **Fallback — SESIÓN ÚNICA en serie:** cuando el owner **no puede abrir sesiones nuevas** (sin
> laptop), se degrada a **una sola sesión reutilizada, en serie** (un tema por commit, mismos
> criterios de verde y push). Es el modo con el que ya se cerró Tests, POS/stock y el barrido UX
> público. El repo es la memoria en ambos modos.

---

## Dónde vive cada cosa (mapa de una mirada)

| Necesito… | Vive en | Quién lo escribe |
|---|---|---|
| **El norte** (los 5 frentes, la visión) | `docs/FUNDAMENTOS-Y-VISION.md` + `docs/ROADMAP.md` | sesión de negocio/arquitectura |
| **El objetivo del sprint** (estratégico) | `docs/ROADMAP.md §3.4` (Sprint en curso) | quien abre el sprint |
| **El ESTADO VIVO del sprint** (qué se hizo, qué falta, próximo bocado) | **este archivo → `## Sprint activo`** | **cada sesión, al cerrar** |
| **El handoff concreto** (ítems accionables entre sesiones) | `docs/PROXIMOS-PASOS.md` | cada sesión |
| **Cómo se ejecuta** (bucle, definición de terminado, seguridad, reporte) | `docs/METODO-ROLES.md` | — (spec estable) |
| **El modelo de SPRINT** (5 equipos, worktrees, protocolo de 4 palabras) | `docs/METODOLOGIA-SPRINT.md` + `/sprint` | — (spec estable) |
| **Quién ejecuta** desde el móvil | `/sprint` (5 equipos) · `/sesion-movil` (PMO autónomo) | — (comando) |

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

**Sprint:** Setup del modelo de 5 equipos — EN PAUSA, esperando `sprint`
**Iniciado:** 2026-07-05 · **Última actualización:** 2026-07-05 (metodología + 4 worktrees listos; PAUSA)
**Estado del bloque:** ⏸️ **PAUSA / consolidado.** Terreno listo para el modelo de sprint de 5
equipos (`docs/METODOLOGIA-SPRINT.md` + `/sprint`): 4 worktrees aislados creados + el 5º (PMO) sobre
`main`. `main` limpio y pusheado. **No hay trabajo de frentes en curso** — se espera que el owner
tipee **`sprint`** para arrancar.
**Norte (5 frentes del mandato):** tenants preseteados por rubro · mejorar ARCA · mejorar
arquitecturas · performance basada en expertos · entrenamiento de agentes del equipo técnico.

**Worktrees listos (asignación de equipos):**
- Equipo 1 Plataforma → `../estetica-erp-plataforma` [`frente/plataforma`]
- Equipo 2 Producto → `../estetica-erp-producto` [`frente/producto`]
- Equipo 3 Fiscal → `../estetica-erp-fiscal` [`frente/fiscal`]
- Equipo 4 Calidad → `../estetica-erp-calidad` [`frente/calidad`]
- Equipo 5 Ejecutivo/PMO → `main` (esta sesión, merge-master)

**Ya cerrado y en `main`:** Tests (harness ADR-026), POS/stock (`trackStock`, migración sin aplicar),
UX (sitio público 100% en tokens), protocolos de estados/metodología/modo, metodología de sprint.

**Próximo bocado (lo que ejecuta `sprint`/`seguimos`):** al recibir **`sprint`**, tomar el rol de
socio gerente ejecutivo y asignar a cada equipo su bocado de mayor palanca (candidatos por frente en
`docs/ESTADO-FRENTES.md`): Plataforma→RLS/perf pre-gate; Producto→POS caja/compras + UX admin;
Fiscal→adapters sin credencial (ARCA `soap.ts`/MP); Calidad→cobertura de tests + seguridad. Cada
equipo en su worktree (recordar `npm install`), PMO integra en orden.

**Esperando decisión del dueño (owner-level):** Gate 2 (activar RLS + alta del 2º tenant) y
las credenciales de WhatsApp/Mercado Pago/ARCA. En pausa a pedido de Maxi.
