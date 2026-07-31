---
tipo: indice
generado: true
tags: [brain/indice, brain/decisiones]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🏛️ Decisiones — índice fino

> 87 decisiones. Esto es el **mapa** (1 línea por ADR); el razonamiento completo vive
> en `docs/adr/ADR-NNN-*.md` y **no se resume** (ADR-008: el *porqué* es lo que evita rediscutir).
> Para armar una lista de lectura acotada por tema: `npm run adr:context -- <keywords>`.

## 🏛️ Fundacionales (20) — lo no negociable

- **[ADR-001](../../docs/adr/ADR-001-multi-tenant-strategy.md)** 🏛️ — Estrategia de Aislamiento Multi-Tenant _(19 dependientes)_
- **[ADR-002](../../docs/adr/ADR-002-core-blueprints-plugins.md)** 🏛️ — Estructura Core / Business Capabilities / Blueprints / Plugins _(20 dependientes)_
- **[ADR-005](../../docs/adr/ADR-005-stack-tecnico.md)** 🏛️ — Stack Técnico _(7 dependientes)_
- **[ADR-008](../../docs/adr/ADR-008-optimizacion-tokens-claude.md)** 🏛️ — Estrategia de Optimización de Costo de Tokens (Claude) Durante el Desarrollo _(8 dependientes)_
- **[ADR-017](../../docs/adr/ADR-017-usuarios-roles-rbac.md)** 🏛️ — Modelo de usuarios, roles y autorización (RBAC) para el piloto _(3 dependientes)_
- **[ADR-018](../../docs/adr/ADR-018-activacion-rls-postgres.md)** 🏛️ — Activación de RLS de Postgres — mecanismo y momento (gate del 2º tenant) _(10 dependientes)_
- **[ADR-044](../../docs/adr/ADR-044-argentinizar-sap.md)** 🏛️ — Argentinizar SAP — lo mejor de SAP, adaptado a la realidad de la pyme argentina (principio transversal de auditoría) _(6 dependientes)_
- **[ADR-058](../../docs/adr/ADR-058-filosofia-grow-ar-crece-sin-migrar.md)** 🏛️ — Filosofía de producto GROW-AR — un Core, dos motores, crecé sin migrar _(6 dependientes)_
- **[ADR-060](../../docs/adr/ADR-060-segmentacion-dos-productos-bases-separadas.md)** 🏛️ — Segmentación en DOS productos — "Comercio Micro" y "PyME/Empresa" — con bases de datos separadas _(2 dependientes)_
- **[ADR-061](../../docs/adr/ADR-061-plataforma-motor-invisible-compartido.md)** 🏛️ — Plataforma / motor invisible compartido entre productos (config-sobre-código) _(1 dependientes)_
- **[ADR-062](../../docs/adr/ADR-062-rls-pool-shared-schema-linea-base.md)** 🏛️ — Multi-tenant Pool shared-schema + RLS como línea base NO negociable (+ realidad y gaps)
- **[ADR-063](../../docs/adr/ADR-063-refactorizar-endurecer-no-reconstruir.md)** 🏛️ — Refactorizar y endurecer, NO reconstruir de cero (decidido con evidencia del ground-truth)
- **[ADR-064](../../docs/adr/ADR-064-nucleo-transaccional-ledger-invariantes.md)** 🏛️ — Núcleo transaccional — ledger append-only + calculadoras puras en Decimal + invariantes I1–I7
- **[ADR-065](../../docs/adr/ADR-065-fabrica-de-tenants-y-fabrica-de-modulos.md)** 🏛️ — Fábrica de tenants (provisioning) + fábrica de módulos (método repetible)
- **[ADR-066](../../docs/adr/ADR-066-credenciales-fiscales-por-tenant.md)** 🏛️ — Credenciales fiscales POR TENANT (CUIT + certificado ARCA) — corrige "secreto por ámbito, no por cliente" _(1 dependientes)_
- **[ADR-067](../../docs/adr/ADR-067-neon-plan-pago-cumplimiento-y-dr.md)** 🏛️ — Neon plan pago + cumplimiento Ley 25.326 + DR con RPO/RTO y PITR
- **[ADR-068](../../docs/adr/ADR-068-gobernanza-100-ia-dos-gates-humanos.md)** 🏛️ — Gobernanza 100%-IA con DOS gates humanos — consultor funcional y ciberseguridad (fundadores)
- **[ADR-069](../../docs/adr/ADR-069-norte-diseno-apple-por-sap-ux-pilar.md)** 🏛️ — Norte de diseño "un SAP que diseñó Apple" — Apple×SAP y la arquitectura UX/UI como pilar _(2 dependientes)_
- **[ADR-070](../../docs/adr/ADR-070-disciplina-de-release-un-deploy-para-todos.md)** 🏛️ — Disciplina de release — un solo deploy para todos los tenants, pipeline preview→prod con gates, fix del mapeo rama→entorno
- **[ADR-071](../../docs/adr/ADR-071-metodo-de-conocimiento-adrs-y-gep.md)** 🏛️ — Método de conocimiento — ADRs + GEP como memoria organizacional ("nada listo sin artefacto + evidencia")

## Vistas por dominio

_Solo los IDs: buscá el detalle en la lista completa de abajo (no se repite el título)._

- **Producto** (25) — ADR-003, ADR-004, ADR-009, ADR-011, ADR-012, ADR-013, ADR-014, ADR-022, ADR-024, ADR-025, ADR-027, ADR-030, ADR-031, ADR-034, ADR-035, ADR-036, ADR-037, ADR-044, ADR-056, ADR-058, ADR-059, ADR-060, ADR-061, ADR-066, ADR-069
- **Operaciones** (20) — ADR-016, ADR-026, ADR-032, ADR-033, ADR-038, ADR-039, ADR-040, ADR-045, ADR-046, ADR-047, ADR-048, ADR-049, ADR-050, ADR-051, ADR-052, ADR-053, ADR-063, ADR-068, ADR-070, ADR-071
- **Arquitectura** (16) — ADR-001, ADR-002, ADR-005, ADR-006, ADR-010, ADR-020, ADR-022, ADR-054, ADR-055, ADR-057, ADR-058, ADR-060, ADR-061, ADR-063, ADR-064, ADR-065
- **Plataforma** (11) — ADR-010, ADR-015, ADR-019, ADR-021, ADR-023, ADR-028, ADR-029, ADR-056, ADR-065, ADR-067, ADR-070
- **Seguridad** (10) — ADR-015, ADR-017, ADR-018, ADR-041, ADR-042, ADR-043, ADR-062, ADR-066, ADR-067, ADR-068
- **(sin clasificar)** (10) — ADR-072, ADR-073, ADR-074, ADR-075, ADR-076, ADR-077, ADR-078, ADR-079, ADR-080, ADR-089
- **Datos** (9) — ADR-001, ADR-004, ADR-018, ADR-023, ADR-027, ADR-057, ADR-062, ADR-064, ADR-067
- **Negocio** (7) — ADR-007, ADR-008, ADR-030, ADR-032, ADR-038, ADR-044, ADR-060
- **Enmienda** (6) — AMD, AMD-001, AMD-003, AMD-004, AMD-005, AMD-007
- **UX** (5) — ADR-009, ADR-042, ADR-043, ADR-059, ADR-069
- **IA** (4) — ADR-006, ADR-008, ADR-034, ADR-071

## Todas (87)

- **[ADR-001](../../docs/adr/ADR-001-multi-tenant-strategy.md)** 🏛️ — Estrategia de Aislamiento Multi-Tenant _(19 dependientes)_
- **[ADR-002](../../docs/adr/ADR-002-core-blueprints-plugins.md)** 🏛️ — Estructura Core / Business Capabilities / Blueprints / Plugins _(20 dependientes)_
- **[ADR-003](../../docs/adr/ADR-003-servicios-business-capabilities.md)** — Business Capabilities — MVP Blueprint "Servicios" _(7 dependientes)_
- **[ADR-004](../../docs/adr/ADR-004-scheduling-overbooking.md)** — Scheduling — Modelo de Datos y Prevención de Overbooking _(2 dependientes)_
- **[ADR-005](../../docs/adr/ADR-005-stack-tecnico.md)** 🏛️ — Stack Técnico _(7 dependientes)_
- **[ADR-006](../../docs/adr/ADR-006-motores-plataforma.md)** — Motores de Plataforma (Metadata, Workflow, Rules, Tax, Integration, AI, Feature Flags, Marketplace) _(12 dependientes)_
- **[ADR-007](../../docs/adr/ADR-007-analisis-financiero.md)** — Análisis Financiero por Escenario de Crecimiento _(4 dependientes)_
- **[ADR-008](../../docs/adr/ADR-008-optimizacion-tokens-claude.md)** 🏛️ — Estrategia de Optimización de Costo de Tokens (Claude) Durante el Desarrollo _(8 dependientes)_
- **[ADR-009](../../docs/adr/ADR-009-ux-rbac-onboarding.md)** — Experiencia de Usuario, UI Metadata-Driven, Permisos y Onboarding _(6 dependientes)_
- **[ADR-010](../../docs/adr/ADR-010-convergencia-piloto-plataforma.md)** — Convergencia del piloto Beauty & Spa hacia la plataforma de los ADR _(5 dependientes)_
- **[ADR-011](../../docs/adr/ADR-011-relevamiento-cliente-nuevas-capacidades.md)** — Relevamiento con el cliente — nuevas capacidades del piloto _(2 dependientes)_
- **[ADR-012](../../docs/adr/ADR-012-panel-recordatorios-plantillas.md)** — Panel central de recordatorios y notificaciones (plantillas editables por canal)
- **[ADR-013](../../docs/adr/ADR-013-precio-diferencial-vecino.md)** — Precio diferencial "vecino/a" por servicio
- **[ADR-014](../../docs/adr/ADR-014-sena-obligatoria-y-cupones.md)** — Seña obligatoria por servicio y cupones de descuento _(1 dependientes)_
- **[ADR-015](../../docs/adr/ADR-015-resolucion-tenant-fail-closed.md)** — Resolución de tenant fail-closed (blindar G1 antes del 2º tenant) _(8 dependientes)_
- **[ADR-016](../../docs/adr/ADR-016-handoff-persistido-cola-proximos-pasos.md)** — El handoff entre sesiones se persiste en una cola, no en el chat _(2 dependientes)_
- **[ADR-017](../../docs/adr/ADR-017-usuarios-roles-rbac.md)** 🏛️ — Modelo de usuarios, roles y autorización (RBAC) para el piloto _(3 dependientes)_
- **[ADR-018](../../docs/adr/ADR-018-activacion-rls-postgres.md)** 🏛️ — Activación de RLS de Postgres — mecanismo y momento (gate del 2º tenant) _(10 dependientes)_
- **[ADR-019](../../docs/adr/ADR-019-onboarding-alta-tenant-provisioning.md)** — Onboarding / alta de tenant nuevo (provisioning) — script operado, no portal self-service _(6 dependientes)_
- **[ADR-020](../../docs/adr/ADR-020-contrato-api-publica-core.md)** — Contrato de API pública del Core — qué comando/consulta expone cada Business Capability y dónde está su límite _(2 dependientes)_
- **[ADR-021](../../docs/adr/ADR-021-consola-operacion-super-admin.md)** — Consola de operación / super-admin — plano de plataforma separado, scope y secuencia _(3 dependientes)_
- **[ADR-022](../../docs/adr/ADR-022-plugin-arca-facturacion-electronica.md)** — Plugin ARCA — facturación electrónica como primer Plugin del Core _(6 dependientes)_
- **[ADR-023](../../docs/adr/ADR-023-performance-multitenant.md)** — ADR-023 — Check de performance multi-tenant y restricciones de free plan _(2 dependientes)_
- **[ADR-024](../../docs/adr/ADR-024-disparadores-facturacion-toggle-mercadopago.md)** — Disparadores de facturación, toggle "facturar sí/no" y Plugin Mercado Pago _(3 dependientes)_
- **[ADR-025](../../docs/adr/ADR-025-ingesta-mercadopago-facturacion-masiva.md)** — Ingesta de Mercado Pago + facturación automática masiva (producto monotributista) _(2 dependientes)_
- **[ADR-026](../../docs/adr/ADR-026-harness-de-tests.md)** — Harness de tests — `node:test` + `tsx`
- **[ADR-027](../../docs/adr/ADR-027-analytics-cross-tenant-benchmarking.md)** — ADR-027 — Analytics cross-tenant: benchmarking anónimo por rubro sobre el dato del ERP
- **[ADR-028](../../docs/adr/ADR-028-modelo-de-entrega-tenant-real-vs-demo-del-flujo.md)** — Modelo de entrega — cliente consolidado = tenant real en su URL; demo = app del flujo; fin de los previews estáticos _(2 dependientes)_
- **[ADR-029](../../docs/adr/ADR-029-ruteo-multitenant-por-hostname-tenant-host-map.md)** — Ruteo multi-tenant por hostname (`TENANT_HOST_MAP`) para URLs `.vercel.app` gratis por tenant _(3 dependientes)_
- **[ADR-030](../../docs/adr/ADR-030-ciclo-demo-venta-inversion.md)** — Ciclo DEMO → VENTA → INVERSIÓN — no se invierte hasta vender _(3 dependientes)_
- **[ADR-031](../../docs/adr/ADR-031-demo-navegable-backoffice-sin-password-toggle-persistencia.md)** — Demo navegable — backoffice sin password + datos ficticios + toggle de persistencia (dos fases de credenciales) _(1 dependientes)_
- **[ADR-032](../../docs/adr/ADR-032-economia-de-modelos-gate-opus-concurrencia-prioridades.md)** — Economía de modelos + Gate GSG siempre en Opus + tope de concurrencia + prioridades P1/P2/P3 (factory de dos capas) _(9 dependientes)_
- **[ADR-033](../../docs/adr/ADR-033-regla-de-copia-exacta-vs-auditoria-gate-gsg.md)** — Regla de copia exacta ↔ auditoría — el front replicado se respeta; el backoffice pasa el Gate GSG completo _(1 dependientes)_
- **[ADR-034](../../docs/adr/ADR-034-generador-de-preset-por-ia-autorizacion-copiar-exacto.md)** — Generador de preset por IA — onboarding por ingesta, con autorización obligatoria del cliente y método "copiar exacto" (leer el render, no el fetch) _(4 dependientes)_
- **[ADR-035](../../docs/adr/ADR-035-consultor-precede-y-determina-el-backoffice-por-rubro.md)** — Consultor → Backoffice — la recomendación del consultor precede y determina el backoffice adaptado por rubro
- **[ADR-036](../../docs/adr/ADR-036-rubro-retail-padel-y-conversion-segura-de-blueprint-en-prod.md)** — Rubro retail `padel`/deportes + conversión segura de blueprint de un tenant en prod
- **[ADR-037](../../docs/adr/ADR-037-whatsapp-cta-sin-placeholder-prompt-just-in-time-helper-unico.md)** — WhatsApp CTA sin placeholder — prompt just-in-time + helper único `whatsapp-cta`
- **[ADR-038](../../docs/adr/ADR-038-estructura-de-importaciones-impo-ciclo-end-to-end.md)** — Estructura de Importaciones (`impo`) — ciclo end-to-end de importación desde China
- **[ADR-039](../../docs/adr/ADR-039-metodologia-del-sprint.md)** — Metodología del `sprint` — FASE 0 obligatoria, estructura por core/frente, PMO merge-master, cierre/backup _(1 dependientes)_
- **[ADR-040](../../docs/adr/ADR-040-gate-de-excelencia-obligatorio.md)** — Gate de Excelencia obligatorio — SAP Fiori (todos los ángulos) + sello GSG + arquitectura + confiabilidad, auditado en Opus _(9 dependientes)_
- **[ADR-041](../../docs/adr/ADR-041-dos-fases-de-credenciales.md)** — Dos fases de credenciales — demo sin secretos → datos reales con secretos que carga el dueño _(2 dependientes)_
- **[ADR-042](../../docs/adr/ADR-042-autorizacion-del-cliente-antes-de-replicar-su-marca.md)** — Autorización del cliente antes de replicar su marca (consentimiento registrado, paso obligatorio) _(1 dependientes)_
- **[ADR-043](../../docs/adr/ADR-043-estandar-de-marca-gsg.md)** — Estándar de marca GSG — sello de calidad en todo entregable, sin pisar la marca del cliente _(3 dependientes)_
- **[ADR-044](../../docs/adr/ADR-044-argentinizar-sap.md)** 🏛️ — Argentinizar SAP — lo mejor de SAP, adaptado a la realidad de la pyme argentina (principio transversal de auditoría) _(6 dependientes)_
- **[ADR-045](../../docs/adr/ADR-045-advisory-board-challenger-contrarian.md)** — Advisory Board + Challenger (contrarian) — tensión productiva tesis/antítesis antes de adoptar un fundamento _(3 dependientes)_
- **[ADR-046](../../docs/adr/ADR-046-de-sesgo-comportamiento-humano-por-sector.md)** — De-sesgo / comportamiento humano por sector — humano donde conviene, estándar donde no _(2 dependientes)_
- **[ADR-047](../../docs/adr/ADR-047-rutina-de-retroalimentacion.md)** — Rutina obligatoria de retroalimentación — 3 palancas (memoria · casos · skills/briefs) + 2 cadencias _(2 dependientes)_
- **[ADR-048](../../docs/adr/ADR-048-arquitecto-de-solucion.md)** — Arquitecto de Solución — autoridad sobre decisiones REVERSIBLES; las IRREVERSIBLES se elevan al dueño _(2 dependientes)_
- **[ADR-049](../../docs/adr/ADR-049-split-de-roles-raci.md)** — Split de roles (RACI) — PMO autor de planes · Dueño aprueba · Arquitecto ejecuta · Dispatch canal · Advisory+Challenger tensionan _(3 dependientes)_
- **[ADR-050](../../docs/adr/ADR-050-roster-fijo-de-sprint.md)** — Roster fijo de sprint — estructura estándar de convocatoria (núcleo-siempre + frentes por sprint) _(1 dependientes)_
- **[ADR-051](../../docs/adr/ADR-051-roster-completo-de-gsg.md)** — Roster completo de GSG — organigrama total (gobernanza + divisiones + células) como estructura estándar _(1 dependientes)_
- **[ADR-052](../../docs/adr/ADR-052-protocolo-de-calibracion-universal.md)** — Protocolo de Calibración Universal — todo agente calibra (lee el corpus + declara sus principios) antes de actuar _(1 dependientes)_
- **[ADR-053](../../docs/adr/ADR-053-pool-compartido-de-agentes-cross-training.md)** — Pool compartido de agentes + entrenamiento cross-estructura — los agentes se prestan, no se duplican
- **[ADR-054](../../docs/adr/ADR-054-repositorio-de-plugins-catalogo-de-modulos.md)** — Repositorio de plugins / catálogo de módulos — arquitectura _(8 dependientes)_
- **[ADR-055](../../docs/adr/ADR-055-principio-de-variante-objeto-maestro-asignacion.md)** — Principio de VARIANTE — el objeto se crea una vez (dato maestro) y se ASIGNA (SAP argentinizado) _(9 dependientes)_
- **[ADR-056](../../docs/adr/ADR-056-panel-direccion-producto-mesa-de-direccion.md)** — ADR-056 — Panel de Dirección: producto ejecutivo para la mesa de dirección
- **[ADR-057](../../docs/adr/ADR-057-representacion-de-dinero-decimal-vs-float-y-redondeo.md)** — Representación de dinero — `number`/Float con redondeo único, `Decimal(14,2)` en el borde fiscal _(1 dependientes)_
- **[ADR-058](../../docs/adr/ADR-058-filosofia-grow-ar-crece-sin-migrar.md)** 🏛️ — Filosofía de producto GROW-AR — un Core, dos motores, crecé sin migrar _(6 dependientes)_
- **[ADR-059](../../docs/adr/ADR-059-reingenieria-de-interfaz-backoffice-grow-ar.md)** — Reingeniería de interfaz del backoffice — GROW-AR (perfil, densidad, "crecé sin migrar") _(3 dependientes)_
- **[ADR-060](../../docs/adr/ADR-060-segmentacion-dos-productos-bases-separadas.md)** 🏛️ — Segmentación en DOS productos — "Comercio Micro" y "PyME/Empresa" — con bases de datos separadas _(2 dependientes)_
- **[ADR-061](../../docs/adr/ADR-061-plataforma-motor-invisible-compartido.md)** 🏛️ — Plataforma / motor invisible compartido entre productos (config-sobre-código) _(1 dependientes)_
- **[ADR-062](../../docs/adr/ADR-062-rls-pool-shared-schema-linea-base.md)** 🏛️ — Multi-tenant Pool shared-schema + RLS como línea base NO negociable (+ realidad y gaps)
- **[ADR-063](../../docs/adr/ADR-063-refactorizar-endurecer-no-reconstruir.md)** 🏛️ — Refactorizar y endurecer, NO reconstruir de cero (decidido con evidencia del ground-truth)
- **[ADR-064](../../docs/adr/ADR-064-nucleo-transaccional-ledger-invariantes.md)** 🏛️ — Núcleo transaccional — ledger append-only + calculadoras puras en Decimal + invariantes I1–I7
- **[ADR-065](../../docs/adr/ADR-065-fabrica-de-tenants-y-fabrica-de-modulos.md)** 🏛️ — Fábrica de tenants (provisioning) + fábrica de módulos (método repetible)
- **[ADR-066](../../docs/adr/ADR-066-credenciales-fiscales-por-tenant.md)** 🏛️ — Credenciales fiscales POR TENANT (CUIT + certificado ARCA) — corrige "secreto por ámbito, no por cliente" _(1 dependientes)_
- **[ADR-067](../../docs/adr/ADR-067-neon-plan-pago-cumplimiento-y-dr.md)** 🏛️ — Neon plan pago + cumplimiento Ley 25.326 + DR con RPO/RTO y PITR
- **[ADR-068](../../docs/adr/ADR-068-gobernanza-100-ia-dos-gates-humanos.md)** 🏛️ — Gobernanza 100%-IA con DOS gates humanos — consultor funcional y ciberseguridad (fundadores)
- **[ADR-069](../../docs/adr/ADR-069-norte-diseno-apple-por-sap-ux-pilar.md)** 🏛️ — Norte de diseño "un SAP que diseñó Apple" — Apple×SAP y la arquitectura UX/UI como pilar _(2 dependientes)_
- **[ADR-070](../../docs/adr/ADR-070-disciplina-de-release-un-deploy-para-todos.md)** 🏛️ — Disciplina de release — un solo deploy para todos los tenants, pipeline preview→prod con gates, fix del mapeo rama→entorno
- **[ADR-071](../../docs/adr/ADR-071-metodo-de-conocimiento-adrs-y-gep.md)** 🏛️ — Método de conocimiento — ADRs + GEP como memoria organizacional ("nada listo sin artefacto + evidencia")
- **[ADR-072](../../docs/adr/ADR-072-enfoque-de-diseno.md)** — Enfoque de diseño — la filosofía del front (Apple×SAP), el sistema tematizable y el backoffice "Fable" congelado _(2 dependientes)_
- **[ADR-073](../../docs/adr/ADR-073-personalizacion-diseno-por-tenant.md)** — Personalización de diseño por tenant — SOLO configuración, nunca fork (+ "Creative Grow")
- **[ADR-074](../../docs/adr/ADR-074-fabrica-de-tenants-saga.md)** — Fábrica de tenants — `provisionTenant` como saga (commit transaccional + efectos externos compensables) _(1 dependientes)_
- **[ADR-075](../../docs/adr/ADR-075-producto-facturacion-bancaria-modulo-bancos.md)** — Producto Facturación Bancaria — módulo `bancos` (extracto → clasificación → factura)
- **[ADR-076](../../docs/adr/ADR-076-suite-facturacion-un-motor-tres-productos.md)** — Suite de facturación — UN motor, TRES productos empaquetados (A·Comerciante / B·Contador / C·Facturita) _(3 dependientes)_
- **[ADR-077](../../docs/adr/ADR-077-producto-b-contador-cartera-multi-cliente.md)** — Producto B·Contador — cartera multi-cliente (cada cliente ES un tenant + delegación ARCA)
- **[ADR-078](../../docs/adr/ADR-078-pricing-unit-economics-suite-facturacion.md)** — Pricing y unit economics de la suite de facturación (lista 2026-07-11, revisión trimestral)
- **[ADR-079](../../docs/adr/ADR-079-gate-ux-ui-craft-mundial.md)** — Gate UX/UI de craft mundial — las 7 lentes (permanente, se suma al Gate de Excelencia) _(1 dependientes)_
- **[ADR-080](../../docs/adr/ADR-080-guia-de-estilo-textos-producto.md)** — Guía de estilo de textos del producto (permanente — sale de la auditoría del editor 2026-07-11) _(1 dependientes)_
- **[ADR-089](../../docs/adr/ADR-089-nucleo-mas-modulos-instalables-por-producto.md)** — ADR-089 — Núcleo mínimo + módulos instalables (App Store por tenant) para productos de facturación
- **AMD** — Enmiendas a ADR 001-008 (paraguas) _(1 dependientes)_
- **AMD-001** — Soft-delete (deleted_at)
- **AMD-003** — Precio congelado + notas libres en el Turno _(1 dependientes)_
- **AMD-004** — Zona horaria explícita (UTC en DB) + bloqueo/ausencias por profesional
- **AMD-005** — MFA (TOTP) + rate limit en login
- **AMD-007** — Email transaccional vía proveedor (Plugin) _(1 dependientes)_

---

Fuente: `docs/adr/graph.json` (`npm run adr:graph`) · Detalle: `docs/adr/INDEX.md`.
