# Metodología de SPRINT — 5 equipos disparados desde el móvil

**Qué es:** el modelo canónico con el que Maxi dispara un sprint desde el móvil (Dispatch/Cowork)
y el frente de IA lo ejecuta como **5 equipos en paralelo**, cada uno en su **git worktree
aislado**, todos sobre **Gestión Studio Grow (`estetica-erp`)**. El repo es la memoria; el owner
coordina por 4 palabras: **`sprint` · `status` · `seguimos` · `pausa`**.

Encaja sobre lo existente: ADR-008 (un tema por thread, el repo es la fuente de verdad),
`docs/METODO-ROLES.md` (cómo trabaja un rol autónomo), `docs/SPRINT-MOVIL.md` (continuidad y estado
vivo), `docs/ESTADO-FRENTES.md` (mapa de frentes + %), `docs/METODOLOGIA-REPORTE-AVANCE.md`
(estados canónicos de avance). Esta es la capa que orquesta **varios frentes a la vez**.

---

## El trigger `sprint` (desde el móvil)

Cuando Maxi escribe **`sprint`** (o invoca `/sprint`), el orquestador **toma el rol de SOCIO
GERENTE EJECUTIVO del frente de IA** —experto en ERPs multi-tenant, background técnico +
funcional + PMO— y **abre tantas sesiones/worktrees como haga falta** para encarar **varios
desarrollos y varios tenants EN PARALELO**, todos sobre `estetica-erp`. Cada squad decide con
criterio experto y entrega en su rama; el Ejecutivo/PMO asigna, coordina e integra.

> **Por qué worktrees:** el repo git es un **subfolder** del workspace; varias sesiones sobre la
> misma carpeta comparten el working tree y se pisan los archivos sin commitear. Un **worktree por
> squad/desarrollo/tenant** (directorio + rama propios) es el aislamiento real, y es lo que permite
> correr N cosas a la vez sin colisión. No era problema de aprobación: las sesiones nuevas corren
> sobre el workspace ya confiado.

---

## Los squads son CROSS-FUNCIONALES (no lanes por disciplina)

Los 5 squads base **no** son silos: cada uno puede **tomar un desarrollo o un tenant completo de
punta a punta** (arquitectura + producto + fiscal + tests + entrega), con una **especialidad-líder**
que orienta pero **no lo limita**. La especialidad es el sesgo del squad, no su jaula.

| # | Squad (especialidad-líder) | Sesgo experto | Worktree base / rama |
|---|---|---|---|
| **1** | **Plataforma & Arquitectura** | staff/arquitecto multi-tenant: RLS/aislamiento, performance, tenants/blueprints, escalabilidad | `estetica-erp-plataforma` · `frente/plataforma` |
| **2** | **Producto & Verticales** | product engineer ERP: features, profundidad por rubro (retail/POS, agenda&servicios, oficios, gastronomía), UX de negocio | `estetica-erp-producto` · `frente/producto` |
| **3** | **Fiscal & Pagos** | integraciones fiscales/pagos LATAM: ARCA/AFIP, Mercado Pago, facturación, checkout/seña, conciliación | `estetica-erp-fiscal` · `frente/fiscal` |
| **4** | **Calidad & Confiabilidad** | SDET/reliability: tests, cobertura, CI, observabilidad, seguridad, retención | `estetica-erp-calidad` · `frente/calidad` |
| **5** | **Ejecutivo / PMO** (comodín) | socio gerente ejecutivo: estrategia, priorización, roadmap, tablero, **asigna desarrollos/tenants a squads** y **MERGE-MASTER a main** | **`main`** (esta sesión) |

El Equipo 5 no tiene worktree propio: **trabaja sobre `main`**, orquesta, **asigna cada desarrollo/
tenant activo a un squad+worktree**, y es el único que integra.

### Worktrees base (setup vigente)
```
Equipo 5 (PMO/main)  C:/Users/mlloveras2/Documents/Claude/estetica-erp
Squad 1 Plataforma   C:/Users/mlloveras2/Documents/Claude/estetica-erp-plataforma   [frente/plataforma]
Squad 2 Producto     C:/Users/mlloveras2/Documents/Claude/estetica-erp-producto     [frente/producto]
Squad 3 Fiscal       C:/Users/mlloveras2/Documents/Claude/estetica-erp-fiscal       [frente/fiscal]
Squad 4 Calidad      C:/Users/mlloveras2/Documents/Claude/estetica-erp-calidad      [frente/calidad]
```

---

## Escalado: varios desarrollos / tenants en paralelo

El sprint **escala con la demanda**, no está fijo en 5. Si hay **N desarrollos o N tenants
activos** a la vez, se abren **tantos worktrees/sesiones como haga falta — uno por desarrollo o por
tenant** — y el PMO le asigna a cada uno un squad (por afinidad de especialidad, pero cualquier
squad puede con cualquier cosa).

- **Un worktree por unidad de trabajo paralela:** un desarrollo grande, o un tenant completo, tiene
  su propio worktree aislado → corren a la vez sin pisarse.
- **Nombrado:** `estetica-erp-<frente-o-tenant>`. Ej. por frente: `estetica-erp-fiscal`; por tenant:
  `estetica-erp-magra`, `estetica-erp-<slug-del-tenant>`. La rama espeja el nombre
  (`frente/<x>` o `tenant/<slug>`).
- **Está OK abrir de más.** Si se crean más worktrees/sesiones de los que se terminan usando, no
  pasa nada: los que sobran quedan ociosos (no molestan, se remueven en la consolidación). Preferir
  capacidad de sobra a quedarse corto.
- **Crear un worktree nuevo en caliente:**
  `git worktree add ../estetica-erp-<nombre> -b <frente/x|tenant/slug>` desde `main` (el PMO lo
  hace al asignar). Recordá `npm install` en el worktree nuevo antes de correr tsc/build/test.

> **Regla:** el paralelismo lo habilita el **aislamiento por worktree**, no la cantidad de squads.
> 5 squads son la base de especialidades; la cantidad de *worktrees activos* la fija cuántos
> desarrollos/tenants estén corriendo en simultáneo.

---

## Reglas de operación (innegociables)

- **Cada equipo en SU worktree/zona.** Nadie edita fuera de su dominio ni toca `main` salvo el
  Ejecutivo/PMO. El aislamiento por worktree hace el paralelo seguro.
- **Un tema por commit**, atómico, con el *porqué* en el mensaje.
- **Verde antes de commitear:** `tsc --noEmit` + `npm run build` (+ `npm test` si el equipo tocó
  lógica cubierta) en verde **antes** de cada commit.
- **`git pull --rebase` antes de mergear/integrar.** El Ejecutivo/PMO integra cada rama a `main`
  **de a una, en orden**, resolviendo conflictos, re-verificando (tsc+build+test) y pusheando. Los
  equipos **no** mergean a `main` solos.
- **⚠️ `node_modules` no viaja al worktree** (gitignore; `git worktree add` solo saca lo
  versionado). Cada worktree necesita **`npm install`** (corre `prisma generate`) una vez antes de
  poder correr tsc/build/test. No copiar `node_modules` a mano — instalar limpio.
- **Gates intactos:** deploy a prod/Netlify y `prisma migrate deploy` son **acción humana del
  owner**. Cualquier migración se deja como **carpeta nueva SIN aplicar**, marcada "pendiente
  acción humana" (`docs/METODOLOGIA-REPORTE-AVANCE.md`).
- **Estados canónicos de avance** (`docs/METODOLOGIA-REPORTE-AVANCE.md`): 🟢 Avanzable ya · ✅
  Completado — pendiente acción humana · 🔒 Gated. El % mide **lo nuestro**; la ejecución con datos
  reales (ARCA/MP/WhatsApp/RLS) es acción humana, no deuda.

---

## Protocolo móvil (las 4 palabras)

| Palabra | Qué hace |
|---|---|
| **`sprint`** | El PMO toma el rol de socio gerente ejecutivo, **releva cuántos desarrollos/tenants hay activos** y **abre tantos worktrees/sesiones como haga falta** (los 4 base + los que sumen por desarrollo/tenant). Asigna cada unidad de trabajo a un squad y arranca. Está OK abrir de más. |
| **`status`** | Estado **real del repo** (no de memoria): lee `docs/ESTADO-FRENTES.md` + `## Sprint activo` de `SPRINT-MOVIL.md` + `git log`, y responde en lenguaje de dueño con los estados canónicos. |
| **`seguimos`** | Retoma desde el handoff vivo (`## Sprint activo → Próximo bocado` de cada frente) sin re-preguntar el plan. |
| **`pausa`** | Frena, **consolida** (main limpio y pusheado, ramas integradas o anotadas, handoff al día) y queda a la espera. |

**El repo es la memoria.** Cada equipo deja su estado en el repo (rama + `## Sprint activo` +
`ESTADO-FRENTES.md`), así "status"/"seguimos" reconstruyen todo sin leer el chat. **Sin laptop /
si no se pueden abrir sesiones nuevas:** se degrada a **una sola sesión reutilizada, en serie** (un
tema por commit), que es el fallback documentado en `docs/SPRINT-MOVIL.md`.

---

## Ciclo de un sprint (de principio a fin)

1. **`sprint`** → PMO releva los desarrollos/tenants activos y abre un worktree por cada uno
   (más los squads base que hagan falta); asigna cada unidad a un squad y arranca.
2. Cada squad trabaja en su rama, sobre su desarrollo/tenant de punta a punta: un tema por commit,
   verde antes de cada uno, push de su rama.
3. **PMO integra** las ramas a `main` en orden (rebase + verificación + push), mantiene el tablero.
4. **`status`** en cualquier momento → foto real. **`seguimos`** → retoma. **`pausa`** → consolida.
5. Al cerrar: `main` limpio y pusheado, ramas integradas o su estado anotado, worktrees ociosos
   removidos, `ESTADO-FRENTES.md` y `## Sprint activo` al día. Los gates quedan listos para el "sí".

---

## Mantener esto honesto
Documento vivo. Si cambia el modelo de sprint (equipos, worktrees, protocolo), este doc y
`.claude/commands/sprint.md` se actualizan en el mismo commit; si divergen, es un hallazgo para
`/sesion-consolidacion`. La mecánica canónica de sesiones sigue en `docs/TABLERO-SESIONES.md`.
