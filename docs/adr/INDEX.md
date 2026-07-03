# INDEX — ADRs del ERP SaaS Multi-Tenant

Punto de entrada para cualquier sesión nueva con Claude. Pegá este índice primero; el detalle completo de cada ADR se carga solo si hace falta.

| ADR | Decisión | Resumen en una línea |
|---|---|---|
| 001 | Multi-tenant | Shared schema + `tenant_id` + Row-Level Security de Postgres. Camino de escape a schema/DB dedicado solo para enterprise puntuales. |
| 002 | Core / Blueprint / Plugin | Blueprints = configuración pura, cero schema propio. Plugins se comunican por eventos asíncronos con outbox pattern, nunca acceso directo a datos del Core. |
| 003 | Business Capabilities del piloto "Servicios" | Solo Scheduling es capability nueva; todo el resto (Party, Producto, Orden, Pago, Factura) es Core reutilizado. Profesional ≠ Usuario. |
| 004 | Modelo de datos de Scheduling | Overbooking se previene con `EXCLUDE USING GIST` de Postgres, no con lógica de aplicación. |
| 005 | Stack técnico | Postgres (Neon/Supabase → RDS) + NestJS/TypeScript + Next.js + pg-boss + Redis (Upstash) + R2 + Railway/Render → AWS Fargate a escala. Auth propio, no vendor. |
| 006 | Motores de plataforma | De 8 motores propuestos, 4 se construyen para el MVP (Metadata, Workflow básico, Feature Flags, Integration/Plugin) y 4 se difieren o simplifican (Rules como config plana, Tax sobre Rules, AI como capa delgada, Marketplace afuera). |
| 007 | Análisis financiero | ~$5/mes a 1 cliente, ~$300/mes a 100, ~$1.500-2.700/mes a 1.000. Punto de decisión de réplicas/particionado entre 500-2.000 tenants activos. |
| 008 | Costo de tokens de Claude | Un thread por tema, decisiones persistidas como ADR, índice liviano como entrada, modelo barato para tareas mecánicas, Claude Code para trabajar sobre el repo real. |
| 009 | UX, UI metadata-driven, RBAC, onboarding | Diseño para la recepcionista, no para el ERP: agenda como home, turno en <30 seg, mobile-first operativo. DynamicForm renderiza campos de extensión. RBAC de 3 roles por Blueprint. Audit trail desde Fase 1. Onboarding con wizard + importador CSV. |
| AMD | Enmiendas a 001-008 | Restore por tenant probado, soft-delete, versionado+idempotencia de eventos, notas y precio congelado en Turno, horarios/ausencias de profesional, MFA+rate limit en login, costo de email transaccional. |
| 010 | Convergencia piloto → plataforma | El piloto Beauty & Spa (Next.js, mono-tenant) se declara Fase 1 y debe evolucionar hacia los ADR. **Camino A confirmado** (evolucionar Next.js). Ola 1 (cimientos de datos) casi cerrada: G5/G3/G6/G4 ✅, G1 (tenant_id) en curso. |
| 011 | Relevamiento con el cliente | Cinco capacidades relevadas con Carolina: G16 categorías de servicios (+ Ducha escocesa/Pileta), G9 novedades/disponibilidad por profesional, G17 recursos con capacidad (máquinas/gabinetes, atado a G2), G18 comisión por (profesional, servicio). Se implementan como Ola 2, después de G1. Toda tabla nueva nace con `tenant_id`. |

## Estado del proyecto
- **Piloto vivo:** `estetica-erp` (este repo) — Beauty & Spa de Carolina Haponiuk, desplegado en Netlify + Postgres (Neon). Es la Fase 1 del blueprint "Servicios".
- **Decisión de convergencia:** ver ADR-010. Bloqueada esperando confirmación de Camino A vs. B.

## Próximos pasos sugeridos (no son ADRs todavía, son candidatos para la próxima sesión)
- **Confirmar Camino A vs. B de ADR-010** (gatea todo lo demás).
- Diseño detallado del Plugin ARCA (contrato de eventos/comandos concreto).
- Contrato de API pública del Core (qué comandos expone cada Business Capability).
- Diseño de onboarding/alta de tenant nuevo (provisioning).
- Definición de planes/pricing y cómo se mapean a Feature Flags (ADR-006).
