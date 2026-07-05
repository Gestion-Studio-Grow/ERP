# Próximos pasos — Tenant `magra`

Para retomar rápido (incluso desde el móvil). Arriba = lo siguiente. Actualizar al
cerrar sesión. Ver `blueprint-carniceria-brief.md` (encuadre técnico) y `BACKLOG.md`
(alcance vs. Bistrosoft).

## Estado (2026-07-04, ciclo 2)

- Rumbo corregido: **magra NO es app/repo aparte**, es **tenant + Blueprint de
  carnicería** dentro del ERP (FUNDAMENTOS §2, ADR-002). El prototipo Next
  standalone (`../../../magra`, fuera del repo) queda **huérfano como demo visual
  desechable** a costo 0; su schema propio **no se migra**.
- Documentado dentro del erp: este archivo + `blueprint-carniceria-brief.md` +
  `BACKLOG.md` + `competencia-bistrosoft.md` (investigación con fuentes) +
  `pos-orden-capability.md` (registro de lo implementado).
- **AVANZADO este ciclo (código nuevo en el Core, type-clean, migración SIN aplicar):**
  Capability **POS/Orden** + **venta por kg** — el checkout/toma de pedidos que
  faltaba del MVP, construido como Capability del Core (no fork). Ver
  `pos-orden-capability.md`. Verificado con `tsc` sin tocar Neon.
- **OJO (working tree compartido):** otra línea de trabajo está construyendo en
  paralelo en el mismo repo (RLS `src/lib/rls.ts`/`tenant-context.ts`/`prisma/rls/`,
  plugin MercadoPago, `fiscal.ts`, ADR-024). El commit de este ciclo incluye **sólo
  los archivos de la capability POS/Orden**, para no entangar con ese trabajo a medio hacer.

- **CICLO 4 (2026-07-05):** el blueprint `carniceria` se **generalizó a una familia
  reutilizable "Retail/Mostrador"** (`src/blueprints/retail/`): carnicería es 1 rubro de 6
  (+ verdulería, dietética, kiosco, fiambrería, indumentaria), cambiando **config** (catálogo/
  wording/branding), no código. Vidriera `/carniceria` → `/tienda` **rubro-aware** (acento del
  tenant + wording del rubro). Ver `docs/blueprints/retail-mostrador.md`. El registro central de
  blueprints + el CLI de provisioning los edita otra sesión → integración documentada (2 líneas,
  sin commitear sus archivos).

## Lo siguiente (en orden — hay orden forzado por el gate del tenant #2)

1. **OK del encuadre** — validar `blueprint-carniceria-brief.md` y formalizarlo como
   **ADR-024 (Blueprint Retail/Carnicería)** en una `/sesion-arquitectura`.
2. **Gate #0 — ADR-018**: RLS de Postgres + resolución de tenant por request. Sin
   esto, crear el tenant #2 rompe la app de Carolina (ADR-015 fail-closed). *En
   construcción en paralelo* (aparecieron `src/lib/rls.ts`, `tenant-context.ts`,
   `prisma/rls/` en el working tree). Confirmar que quede terminado antes del alta.
3. ~~ADR-019 — parametrizar `provision-tenant.ts` por `--blueprint`~~ **HECHO ciclo 3**:
   `npm run provision -- --blueprint carniceria` siembra cortes con precio/kg. Ver
   `blueprint-y-vidriera.md`. Falta correrlo contra una DB real (tras RLS).
4. ~~Sistema de Blueprints en código~~ **HECHO ciclo 3**: `src/blueprints/`
   (`types.ts` + registry `index.ts` + `servicios.ts` + `carniceria.ts`). El seed de
   servicios se extrajo del provisioning (comportamiento idéntico).
5. ~~Capabilities del Core: venta por kg + POS/Orden~~ **HECHO** (`pos-orden-capability.md`).
   Falta aplicar la migración `20260704180000_add_pos_orders` con `migrate deploy`
   (Gate 2) cuando se dé el OK.
6. **Vidriera por tenant + theming** — **HECHA ciclo 3, GENERALIZADA ciclo 4**: la
   vidriera es ahora `/tienda` (`src/app/tienda/`, antes `/carniceria`), **rubro-aware**:
   consume `getStorefront` + `placeOnlineOrder`, toma el **acento del tenant**
   (`getTenantAccent`, magra=oxblood) y el **wording del rubro** (blueprint retail).
   *Falta:* resolución de tenant por request (ADR-018) para servirla por subdominio y
   el theming por tenant genérico por tokens (hoy la base premium es inline).
7. **Plugin `arca`** (ADR-022) — en paralelo.

## Demo a costo 0 (vigente)

**La arquitectura real ya tiene demo end-to-end en el ERP** (no depende más del
prototipo standalone): con una DB local (branch de Neon o Postgres local, NUNCA
prod) donde se aplique la migración POS y se corra
`npm run provision -- --name "magra" --slug magra --owner-email ... --blueprint carniceria`,
el flujo completo es **vidriera `/tienda` → pedido → bandeja `/admin/pedidos`**,
más el POS de mostrador con venta por kg. Ver `blueprint-y-vidriera.md` §"Cómo verlo".

Mientras no haya DB local con la migración aplicada, el prototipo standalone
(`/magra`, corre sin DB) sigue sirviendo como demo puramente visual, pero ya es
reemplazable: la vidriera del tenant existe.

## Preguntas abiertas (negocio / PO)

- ¿La carnicería trabaja con **mayoristas / cuenta corriente**? (define prioridad de esa feature).
- ¿Necesita **balanza de mostrador** integrada desde el arranque, o alcanza venta
  por kg en software para el MVP? (el diferencial #1 fuerte es la balanza física).
- ¿Delivery propio o apps (PedidosYa) desde el día 1?
- Datos reales del local (dirección, WhatsApp, handle de Instagram) para `StoreSettings`.

## Recordatorios de operación

- **Sin push** por ahora (auth se habilita mañana). Commits locales en el repo erp.
- **Nada a prod / Netlify**; **no** `migrate deploy` sin OK; **no** golpear la DB de Neon.
- Todo tenant nuevo pasa por el checklist de encuadre de FUNDAMENTOS §7.
