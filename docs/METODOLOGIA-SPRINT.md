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
funcional + PMO— y **abre 5 sesiones = 5 equipos**, todos sobre `estetica-erp`, **cada uno con su
worktree aislado** (salvo el 5º, que trabaja sobre `main`). Cada equipo es dueño de su dominio,
decide con criterio experto, y entrega en su rama.

> **Por qué worktrees:** el repo git es un **subfolder** del workspace; varias sesiones sobre la
> misma carpeta comparten el working tree y se pisan los archivos sin commitear. Un **worktree por
> equipo** (directorio + rama propios) es el aislamiento real. No era problema de aprobación: las
> sesiones nuevas corren sobre el workspace ya confiado.

---

## Los 5 equipos

| # | Equipo | Rol | Dueño de | Worktree / rama |
|---|---|---|---|---|
| **1** | **Plataforma & Arquitectura** | Staff engineer / arquitecto multi-tenant | arquitectura, RLS/aislamiento, performance, tenants/blueprints, escalabilidad | `estetica-erp-plataforma` · `frente/plataforma` |
| **2** | **Producto & Verticales** | Product engineer, verticales ERP (retail/POS, agenda&servicios, oficios, gastronomía) | features de producto, profundidad por rubro, UX de negocio | `estetica-erp-producto` · `frente/producto` |
| **3** | **Fiscal & Pagos** | Especialista en integraciones fiscales/pagos LATAM | ARCA/AFIP, Mercado Pago, facturación, checkout/seña, conciliación (mucho queda ✅ **completado — pendiente acción humana / credenciales**) | `estetica-erp-fiscal` · `frente/fiscal` |
| **4** | **Calidad & Confiabilidad** | SDET / reliability engineer | harness de tests, cobertura, CI, observabilidad, seguridad, retención de datos | `estetica-erp-calidad` · `frente/calidad` |
| **5** | **Ejecutivo / PMO** (comodín — cualquier tema) | Socio gerente ejecutivo | estrategia, priorización, roadmap, tablero de estados, coordinación y **MERGE-MASTER a main** | **`main`** (esta sesión) |

El Equipo 5 no tiene worktree propio: **trabaja sobre `main`**, orquesta y es el único que
integra. Puede además encarar cualquier tema que no tenga dueño claro.

### Rutas absolutas de los worktrees (setup vigente)
```
Equipo 5 (PMO/main)  C:/Users/mlloveras2/Documents/Claude/estetica-erp
Equipo 1 Plataforma  C:/Users/mlloveras2/Documents/Claude/estetica-erp-plataforma   [frente/plataforma]
Equipo 2 Producto    C:/Users/mlloveras2/Documents/Claude/estetica-erp-producto     [frente/producto]
Equipo 3 Fiscal      C:/Users/mlloveras2/Documents/Claude/estetica-erp-fiscal       [frente/fiscal]
Equipo 4 Calidad     C:/Users/mlloveras2/Documents/Claude/estetica-erp-calidad      [frente/calidad]
```

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
| **`sprint`** | El PMO toma el rol de socio gerente ejecutivo y **abre los 5 equipos** (worktrees ya creados). Asigna el bocado de mayor palanca a cada uno y arranca. |
| **`status`** | Estado **real del repo** (no de memoria): lee `docs/ESTADO-FRENTES.md` + `## Sprint activo` de `SPRINT-MOVIL.md` + `git log`, y responde en lenguaje de dueño con los estados canónicos. |
| **`seguimos`** | Retoma desde el handoff vivo (`## Sprint activo → Próximo bocado` de cada frente) sin re-preguntar el plan. |
| **`pausa`** | Frena, **consolida** (main limpio y pusheado, ramas integradas o anotadas, handoff al día) y queda a la espera. |

**El repo es la memoria.** Cada equipo deja su estado en el repo (rama + `## Sprint activo` +
`ESTADO-FRENTES.md`), así "status"/"seguimos" reconstruyen todo sin leer el chat. **Sin laptop /
si no se pueden abrir sesiones nuevas:** se degrada a **una sola sesión reutilizada, en serie** (un
tema por commit), que es el fallback documentado en `docs/SPRINT-MOVIL.md`.

---

## Ciclo de un sprint (de principio a fin)

1. **`sprint`** → PMO abre los 5 equipos, cada uno arranca su bocado de mayor palanca en su worktree.
2. Cada equipo trabaja en su rama: un tema por commit, verde antes de cada uno, push de su rama.
3. **PMO integra** las ramas a `main` en orden (rebase + verificación + push), mantiene el tablero.
4. **`status`** en cualquier momento → foto real. **`seguimos`** → retoma. **`pausa`** → consolida.
5. Al cerrar: `main` limpio y pusheado, ramas integradas o su estado anotado, `ESTADO-FRENTES.md`
   y `## Sprint activo` al día. Los gates quedan listos para el "sí" del owner.

---

## Mantener esto honesto
Documento vivo. Si cambia el modelo de sprint (equipos, worktrees, protocolo), este doc y
`.claude/commands/sprint.md` se actualizan en el mismo commit; si divergen, es un hallazgo para
`/sesion-consolidacion`. La mecánica canónica de sesiones sigue en `docs/TABLERO-SESIONES.md`.
