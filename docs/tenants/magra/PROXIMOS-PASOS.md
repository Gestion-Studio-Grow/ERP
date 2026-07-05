# Próximos pasos — Tenant `magra`

Para retomar rápido (incluso desde el móvil). Arriba = lo siguiente. Actualizar al
cerrar sesión. Ver `blueprint-carniceria-brief.md` (encuadre técnico) y `BACKLOG.md`
(alcance vs. Bistrosoft).

## Estado (2026-07-04)

- Rumbo corregido: **magra NO es app/repo aparte**, es **tenant + Blueprint de
  carnicería** dentro del ERP (FUNDAMENTOS §2, ADR-002). El prototipo Next
  standalone (`../../../magra`, fuera del repo) queda **huérfano como demo visual
  desechable** a costo 0; su schema propio **no se migra**.
- Documentado dentro del erp: este archivo + `blueprint-carniceria-brief.md` +
  `BACKLOG.md` (mapa comparativo Bistrosoft + alcance superador MVP→v1+).
- **Sin código nuevo en el Core todavía** — a la espera de OK y de la versión final
  de `FUNDAMENTOS-Y-VISION.md`.

## Lo siguiente (en orden — hay orden forzado por el gate del tenant #2)

1. **OK del encuadre** — validar `blueprint-carniceria-brief.md` y formalizarlo como
   **ADR-024 (Blueprint Retail/Carnicería)** en una `/sesion-arquitectura`.
2. **Gate #0 — ADR-018**: implementar RLS de Postgres + resolución de tenant por
   request. Sin esto, crear el tenant #2 rompe la app de Carolina (ADR-015 fail-closed).
   Es una `/sesion-feature` grande y previa a todo.
3. **ADR-019** — script `scripts/provision-tenant.ts` idempotente/transaccional,
   parametrizado por `--blueprint`.
4. **Sistema de Blueprints en código** — `src/blueprints/carniceria/{manifest,seed-template}.ts`
   + registro de capabilities activas por tenant.
5. **Capabilities del Core que faltan**:
   - Venta por kg (campo de extensión sobre `Product`).
   - POS/Orden (`Order`/`OrderItem` genéricos, ADR-003 Fase 2).
6. **Vidriera por tenant + theming** — generalizar `src/app/(site)/` para leer el
   catálogo del tenant y su marca (magra: oxblood/hueso/latón).
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
