---
tipo: roster
generado: true
tags: [brain/calibracion, brain/roster]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 👥 Agentes materializados — derivado de `.claude/agents/`

> 25 agentes con charter real. Esta tabla **se deriva de los archivos**, no se
> mantiene a mano: el roster narrado (`docs/organizacion/roster-completo-gsg.md`) quedó viejo
> respecto del repo, que es la enfermedad que el vault existe para curar.

> 🚨 **25 de 25 agentes NO declaran `model:` en su frontmatter.**
> La capa que ves abajo es **prosa del encabezado**, no una instrucción que el harness honre:
> al despachar, el subagente **hereda el modelo del padre**. Es la causa exacta de la lección
> **MP-4** (Opus por herencia) y **MP-9** (modelo mal etiquetado), y deja sin red la regla de
> `CLAUDE.md` §3 de que el Gate **nunca** se degrada de modelo. **Se eleva al dueño.**

| Agente | Capa declarada (prosa) | `model:` | Qué hace |
|---|---|:---:|---|
| [advisory](../../.claude/agents/advisory.md) | Sonnet (escala a Opus a pedido) | ❌ | Advisory Board de GSG — propone estrategia con rigor (la TESIS) antes de adoptar un fundamento (bases, roadmap, […] |
| [arquitecto-solucion](../../.claude/agents/arquitecto-solucion.md) | Opus/Sonnet | ❌ | Arquitecto de Solución de GSG — separa lo reversible de lo irreversible, ejecuta lo reversible de forma autónoma y […] |
| [auditoria-gsg-gate](../../.claude/agents/auditoria-gsg-gate.md) | Opus SIEMPRE | ❌ | Auditoría GSG (el Gate de Excelencia) — corre SIEMPRE en Opus antes de cada merge a main. Audita SAP Fiori 7 ángulos + […] |
| [backoffice-ingenieria](../../.claude/agents/backoffice-ingenieria.md) | Sonnet→Opus (override según Plan de Ventana) | ❌ | Ingeniero de Backoffice del ERP — construye e integra al backoffice del ERP la funcionalidad que definió […] |
| [backoffice-producto](../../.claude/agents/backoffice-producto.md) | Sonnet→Opus (juicio de producto) | ❌ | Analista/PO de Funcionalidad de Backoffice del ERP — define y diseña una funcionalidad nueva del backoffice desde la […] |
| [challenger](../../.claude/agents/challenger.md) | Sonnet | ❌ | Challenger / red-team de GSG — desafía con rigor toda propuesta estratégica (la ANTÍTESIS): riesgos, supuestos débiles, […] |
| [cobro-fiscal](../../.claude/agents/cobro-fiscal.md) | Sonnet → Opus (plata) | ❌ | Cobro & Fiscal de GSG — Mercado Pago, ARCA/AFIP (facturación electrónica), checkout, seña y conciliación. Úsalo para el […] |
| [constructor](../../.claude/agents/constructor.md) | Sonnet | ❌ | Constructor de GSG — construye los MVP validados en carpetas aisladas (productos/<slug>/). Úsalo para levantar el […] |
| [data-dba](../../.claude/agents/data-dba.md) | Opus (irreversible) | ❌ | Data / DBA de GSG — dueño del ciclo de datos y las migraciones de Neon; único que propone tocar la DB de producción. […] |
| [diseno-marca](../../.claude/agents/diseno-marca.md) | Sonnet | ❌ | Diseño & Marca de GSG — identidad visual, design tokens, branding por tenant y vidriera pública. Úsalo para el […] |
| [finops-costo-uso](../../.claude/agents/finops-costo-uso.md) | Sonnet (+Opus revisa) | ❌ | FinOps / Costo-Uso de GSG — telemetría de costo y uso de la factory (gasto por célula/modelo, serie temporal, alertas). […] |
| [growth](../../.claude/agents/growth.md) | Sonnet → Opus (estrategia) | ❌ | Growth / Go-to-market de GSG — adquisición, canal, CAC/ROAS, funnel, retención y posicionamiento, con evidencia real y […] |
| [operaciones](../../.claude/agents/operaciones.md) | Sonnet | ❌ | Operaciones de GSG — puesta en marcha end-to-end de un negocio, runbooks, onboarding operativo y soporte. Úsalo para […] |
| [plataforma-deploy](../../.claude/agents/plataforma-deploy.md) | Sonnet → Opus (seguridad) | ❌ | Plataforma / Deploy / Infra de GSG — RLS/tenancy, performance multi-tenant, observabilidad, health y el tren de deploy. […] |
| [pmo](../../.claude/agents/pmo.md) | Opus | ❌ | PMO de GSG — genera/actualiza el plan del sprint sobre el roadmap del repo, lo presenta al dueño, consolida y releva […] |
| [po-catalogo-plugins](../../.claude/agents/po-catalogo-plugins.md) | Opus prioriza / Sonnet registry | ❌ | Product Owner del Catálogo / Plugins de GSG — dueño del repositorio de módulos: prioriza el backlog de plugins, define […] |
| [preset-ia](../../.claude/agents/preset-ia.md) | Opus | ❌ | Preset IA de GSG — motor de onboarding: ingesta de marca/artefacto (web/RRSS del cliente o prototipo) + adaptación → […] |
| [pricing-packaging](../../.claude/agents/pricing-packaging.md) | Opus (plata) | ❌ | Pricing & Packaging de GSG — define precios y planes por perfil (lite/enterprise) y por segmento […] |
| [qa](../../.claude/agents/qa.md) | Sonnet | ❌ | QA / Probador interactivo de GSG — prueba como usuario real end-to-end (entrar, navegar, backoffice, carrito, WhatsApp) […] |
| [raci-matriz](../../.claude/agents/raci-matriz.md) | Sonnet→Opus (juicio de gobernanza) | ❌ | Especialista en Matrices RACI de GSG — diseña y mantiene la matriz RACI (Responsible/Accountable/Consulted/Informed) […] |
| [release-manager](../../.claude/agents/release-manager.md) | Opus coord / Sonnet ejecuta | ❌ | Release Manager de GSG — orquesta el tren de releases de punta a punta (batch → build → Gate → deploy con OK del […] |
| [seguridad](../../.claude/agents/seguridad.md) | Opus | ❌ | Seguridad de GSG — audita y endurece RLS, auth, secretos y aislamiento multi-tenant. Úsalo antes de tocar áreas de […] |
| [sello-marca-gsg](../../.claude/agents/sello-marca-gsg.md) | Opus | ❌ | Guardián del Sello GSG — dentro del equipo de Auditoría GSG, aporta la FILOSOFÍA y VISIÓN de marca a TODOS los […] |
| [soporte-customer-success](../../.claude/agents/soporte-customer-success.md) | Sonnet (zona humana) | ❌ | Soporte / Customer Success de GSG — soporte y éxito del cliente post-venta (incidencias, adopción, retención) en voz […] |
| [sre-oncall](../../.claude/agents/sre-oncall.md) | Opus decide / Sonnet ejecuta | ❌ | SRE on-call / SLOs de GSG — formaliza SLOs, guardia y runbook de incidentes; sostiene el "no nos caemos" con código, no […] |

---

Derivado de `.claude/agents/` por `npm run brain`. Organigrama y células propuestas:
[roster-completo-gsg.md](../../docs/organizacion/roster-completo-gsg.md).
