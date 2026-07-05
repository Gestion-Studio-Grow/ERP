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

## Lo siguiente (en orden — hay orden forzado por el gate del tenant #2)

1. **OK del encuadre** — validar `blueprint-carniceria-brief.md` y formalizarlo como
   **ADR-024 (Blueprint Retail/Carnicería)** en una `/sesion-arquitectura`.
2. **Gate #0 — ADR-018**: RLS de Postgres + resolución de tenant por request. Sin
   esto, crear el tenant #2 rompe la app de Carolina (ADR-015 fail-closed). *En
   construcción en paralelo* (aparecieron `src/lib/rls.ts`, `tenant-context.ts`,
   `prisma/rls/` en el working tree). Confirmar que quede terminado antes del alta.
3. **ADR-019** — `scripts/provision-tenant.ts` **ya existe**; falta parametrizarlo
   por `--blueprint=carniceria` y sembrar cortes con precio/kg.
4. **Sistema de Blueprints en código** — `src/blueprints/carniceria/{manifest,seed-template}.ts`
   + registro de capabilities activas por tenant.
5. ~~Capabilities del Core: venta por kg + POS/Orden~~ **HECHO** este ciclo
   (`pos-orden-capability.md`). Falta aplicar la migración `20260704180000_add_pos_orders`
   con `migrate deploy` (Gate 2) cuando se dé el OK.
6. **Vidriera por tenant + theming** — generalizar `src/app/(site)/` para leer el
   catálogo del tenant y su marca (magra: oxblood/hueso/latón). La vidriera consume
   la misma `createOrder` de la capability POS ya hecha.
7. **Plugin `arca`** (ADR-022) — en paralelo.

## Demo a costo 0 (vigente)

Hasta que exista la vidriera del tenant, la carnicería se le muestra al cliente con
el **prototipo standalone** (`npm install && npm run dev` en la carpeta `/magra`,
corre sin DB). Es demo visual, no la arquitectura. Se borra al converger.

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
