# 🧭 Plan del próximo tramo — a encadenar tras publicar el incremento Empresa base

**Qué es:** el plan priorizado y accionable de lo que sigue **después de PR-2/M2**, para arrancarlo apenas
se publique el **incremento Empresa base** (perfil encendible + naming "Empresa" + piso Comercio visible en
Empresa + esqueleto de nav enterprise, todo ya en la rama, default OFF). Prioriza **P1 = demos/venta
primero**.

**Autor:** Analista de mercado local (Consultores) · **Fecha:** 2026-07-08 · **Rama:**
`claude/sprint-startup-generic-rf6x0m` (sprint) · **Naming:** Comercio/Empresa · **Sin Neon, sin merge a
main.** Para validación de S5/Opus antes de ejecutar.

---

## 0. Dónde estamos (para no duplicar M2)

**Ya landeó en la rama (NO re-hacer):** motor de perfiles (`perfil.ts`, `perfilGateAllows`,
`PROFILES_ENABLED`, `visibleNavItems` + property-test) · nav agrupada 5 grupos + `NAV_ITEM_GROUPS` ·
primitivos `PageHeader`/`SectionGroup`/`ProfileBadge` · tokens `--density` · candados/flags default OFF ·
**esqueleto de nav Empresa** (`ENTERPRISE_NAV_ITEMS`: cuentas-a-pagar / contabilidad / devoluciones,
default OFF, **rutas = stubs pendientes**) · fix oversell (I6 cerrado, ya en rama).

**Decidido y respetado acá:** **J59 diferido** hasta lead Empresa real · **demo Empresa en dev** (no prod) ·
**persistencia `Tenant.profile` en curso** (§C, otra sesión). El tramo NO construye pantallas enterprise
especulativas (ADR-030).

**El hueco que este tramo llena:** hoy "Empresa" = Comercio con otro label. Falta que Empresa **se vea más
que Comercio** (profundización aditiva, sin pantallas nuevas), **se pueda mostrar** (demo Empresa vendible)
y que la base **no se caiga** (hardening $0). Eso es P1 puro y es ejecutable **sin** tocar lo diferido.

## 1. Hito y entregables que siguen

Por roadmap (`roadmap-dos-modelos.md`), lo que queda vivo y ejecutable sin lo §C:

- **M2 (cierre) + M3 (parcial, solo lo aditivo-sin-pantalla):** que Empresa sea demostrablemente más que
  Comercio con lo que **ya tiene pantalla**: Compras → órdenes formales; Reportes → rentabilidad/margen;
  home analítico por rol. (P1.a/b/c del `set-minimo-empresa-2026-07-08.md`.)
- **M5 (arranca en paralelo desde M2):** hardening por código ($0) — el 90% de "no nos caemos".
- **Vehículo de venta:** demo Empresa en dev (rubro+marca) — sin esto no hay qué mostrar (ADR-059 D8).
- **Diferido a §C / lead:** J59 (pantalla), persistencia de perfil (migración), upgrade real sin migrar
  (M4 real), Neon pago, deploy público, pricing aprobado.

## 2. Ola 1 — "Empresa vendible y mostrable" (ejecutable YA, P1) · pool S1–S5, carriles separados

Todos en paralelo; **carriles de archivo disjuntos** (working tree compartido → pathspec, nunca `-A`).

| Sesión | Carril (archivos) | Entregable | Prio | §C? |
|---|---|---|---|---|
| **S1** (Analista/docs) | `docs/estrategia/*` · `docs/**/fixtures-demo-empresa.md` | Spec del **tenant demo Empresa** (rubro+marca provisional, fixtures) + **tabla de ediciones Comercio/Empresa** (copy de venta, naming neutro) + criterios de aceptación de la ola | P1 | no |
| **S2** (Primitivos/UI) | `src/components/ui/*` · `src/app/admin/(dashboard)/page.tsx` (home) | `KpiTile` + `EmptyState` (los 2 primitivos que faltan de ADR-059 D6) + **home analítico por rol** (Empresa) vs. home de una acción (Comercio) | P1 | no |
| **S3** (Comercio lite/rubro) | `src/blueprints/*` · defaults por rubro | **Set lite por rubro** (servicios/carnicería/genérico) + UI Comercio limpia (PR-3 de ADR-059) — lo vendible HOY a los 4 tenants reales | P1 | no |
| **S4** (Profundización Empresa) | `src/app/admin/(dashboard)/compras/*` · `.../reportes/*` | **Compras → órdenes formales** (razón social/CUIT/N° orden, aditivo) + **Reportes → rentabilidad por producto** (16T, aditivo). Mismo href, sin ítem nuevo → **cero callejón sin salida** | P1 | no |
| **S5** (Confiabilidad + Gate) | `src/lib/db*` · `src/app/api/**` (webhook/cron/ready) | **Hardening $0** (`connection_limit`, idempotencia webhook MP, cron con dead-letter, `/api/ready`) **+ corre el Gate Opus de la ola** | P1-ady. | Neon pago = §C |

**Nota de no-colisión:** ningún carril toca `nav-groups.ts`/`AdminShell.tsx`/`perfil.ts`/`flags.ts` (ya
cerrados en M2). S4 profundiza pantallas existentes; S2 crea primitivos nuevos + home; no se pisan.

## 3. Dependencias y orden

- **Ola 1 es casi-toda-paralela.** Única dependencia interna: el **home analítico (S2)** consume `KpiTile`
  → S2 lo construye en su propio carril (self-contained, sin bloqueo cruzado).
- **Demo Empresa (S1 spec → ejecución de seed en dev)**: el spec no bloquea; la **materialización del seed**
  espera la decisión de rubro/marca (ver §5 ELEVAR) — se arranca con **placeholder provisional marcado**,
  no frena la ola.
- **Ola 2 depende de Ola 1** (necesita Empresa "más que Comercio" + demo para mostrar el salto) **y de §C**
  (persistencia de perfil) para la parte real del upgrade.

## 4. Ola 2 — "Crecé sin migrar (demo) + salida a vender" (tras Ola 1; parte real en §C)

| Sesión | Entregable | Naturaleza | §C? |
|---|---|---|---|
| S-A | **Upgrade Comercio→Empresa en DEMO** (perfil en memoria → enciende Empresa, mismo tenant) — M4 demo | Reversible (demo) | Persistencia + switch real = §C |
| S-B | **Demo pública de los dos modelos** (costo cero, ADR-030) — navegable Comercio y Empresa | Reversible | Deploy público = Gate 1 (§C) |
| S-C | **Tabla de planes/pricing** por edición (pasa por Advisory+Challenger) | Doc reversible | Aprobación del dueño (§C) |
| S-D | **Válvula de capacidad** (ADR-059 D8 fix #7): cada Empresa atraída dispara la advertencia de horas del equipo (`costos §4`) | Doc/proceso | — |

Ola 2 es más chica y varias piezas son §C → se planifica pero **no se ejecuta entera** hasta el OK.

## 5. §C — se ELEVA al dueño (no se ejecuta)

| # | Qué | Gate | Desbloquea |
|---|---|---|---|
| C1 | **Persistencia `Tenant.profile`** (columna enum + migración aditiva) — en curso otra sesión | Gate 2 | upgrade real sin migrar (M4 real), perfil que sobrevive al reload |
| C2 | **J59 Cuentas a pagar** (construir pantalla) | gated por **lead Empresa real** | el ancla enterprise-only; hasta el lead, NO se construye (ADR-030) |
| C3 | **Rubro + marca del tenant demo Empresa** | decisión del dueño | vehículo de venta de Empresa (hoy placeholder provisional) |
| C4 | **Deploy demo público** + **Neon plan pago** (réplica) | Gate 1 / gasto | demo pública + "no nos caemos ni ahí" (M5 real) |
| C5 | **Pricing por edición aprobado** | decisión del dueño | califica leads, cierra ROI (tensión #1 del Challenger) |

## 6. Criterios de aceptación y Gate por ola

**Ola 1 — se acepta cuando:**
- Empresa muestra **≥2 diferencias reales** sobre Comercio **sin ningún callejón sin salida** (Compras
  formal + Reportes rentabilidad operan de punta a punta; home analítico renderiza por rol).
- Set lite por rubro funciona en los 3 rubros (servicios/carnicería/genérico) sin pantallas que el rubro no
  usa.
- Hardening: `/api/ready` responde, webhook MP idempotente (test), cron con dead-letter (test).
- Verde: `tsc` + `build` + suite de tests + `gate:rls` 33/33 + lint. **Invariante `enterprise ⊇ lite`**
  sigue en verde (property-test).
- **QA end-to-end** (recorrido clic-por-clic, no solo "carga"): Comercio y Empresa navegables, cero dead
  end, demo Empresa (aunque con datos provisionales) recorrible.
- **Punto de Gate:** **S5 corre el Gate de Excelencia en Opus** (ADR-040) al cierre de la ola → recién ahí
  el PMO evalúa merge (que sigue pasando por el Gate final del sprint, no en esta rama).

**Ola 2 — se acepta cuando:** el upgrade demo enciende Empresa sobre el mismo tenant sin perder un dato
(verificado por entidad, no en agregado — lección DX-7); la demo pública es navegable en ambos modelos; la
tabla de pricing pasó Advisory+Challenger. **Gate Opus** al cierre; lo §C queda listo para el "1 clic" del
dueño, no ejecutado.

## 7. En una línea

> **Próximo tramo = hacer que Empresa VALGA más que Comercio con lo que ya tiene pantalla (Ola 1, P1,
> ejecutable ya) + poder MOSTRARLA (demo) + que no se caiga (hardening $0), dejando lo caro/irreversible
> (J59, persistencia, deploy, Neon pago, pricing) elevado al dueño.** Cero duplicación de M2, cero
> pantallas enterprise especulativas, cero callejones sin salida.

— Elaborado por GSG (Analista de mercado local — célula Consultores), 2026-07-08 · para validación S5/Opus
