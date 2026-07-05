# Tablero — Agencia Grow

Foto viva del sector (análogo a `ESTADO-FRENTES.md` del ERP). El PMO lo mantiene al día en la Fase 0.

## Frentes del sector (1 frente = 1 sesión aislada)

| Frente | Rol | Estado | Próximo bocado |
|---|---|---|---|
| **Consultores / Análisis de mercado** | inteligencia + diferencial con evidencia | 🟢 activo | relevamiento de campo Canning + short-list de 10 prospectos |
| **Performance / Ads** | campañas paid (Meta/Google) | ⚪ por arrancar | plan de captación de comercios a digitalizar |
| **Contenido** | social/copy/calendario | ⚪ por arrancar | calendario editorial go-to-market del ERP |
| **Front / Consola Grow** | diseño de producto (cockpit + storefronts) | 🟢 prototipo v2 | pasar la Consola a la pantalla real del Panel del Dueño |
| **Producto / Software** | construir lo validado, apalancando ERP/ARCA/storefront | 🟢 con backlog | `/sesion-feature` Panel del Dueño (motor listo) |
| **Delivery / Cuentas** | entregables por cliente | ⚪ on-demand | onboarding del próximo tenant |
| **PMO (Agencia)** | orquesta + innovación proactiva | 🟢 activo | bajar la misión a backlog de negocios automatizados |

## Productos del sector (fichas — el código vive en el Core o su propio repo)

| Producto | Qué es | Estado | Referencia |
|---|---|---|---|
| **Panel del Dueño** | insights automáticos single-tenant (tier Premium) | motor construido + testeado; falta pantalla | `owner-insights.ts` · propuesta-producto #1 · Consola Grow |
| **Benchmarking por rubro** | "vos vs. tu cohorte" anónimo | mecanismo listo; gated ≥5 tenants | ADR-027 |
| **arca standalone** | facturación automática monotributistas | diseño cerrado; núcleo con stubs | ADR-025 (repo `arca`) |
| **ERP self-serve** | vender el ERP online (go-to-market) | gate del 2º tenant (RLS/onboarding) | charter §5 P2 |

## Pricing
Modelo en **ADR-029** (dos motores, 3 planes por Feature Flags). **Montos = gate de dueño.**

> Nota: mientras el repo `agencia-grow` no exista, este tablero es la semilla; el estado autoritativo del
> lado software vive en `estetica-erp` (`docs/ESTADO-ACTUAL.md`, `docs/PROXIMOS-PASOS.md`, ADRs).
