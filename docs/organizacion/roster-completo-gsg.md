# Roster completo de GSG — organigrama total (gobernanza + divisiones + células) con equipos por nodo

> **Qué es:** el **organigrama completo** de Gestión Studio Grow: toda la **gobernanza**, todas las
> **divisiones** y todas las **células operativas**, con el **equipo de agentes de cada nodo** y su estado:
> **✅ existe** (rol/sesión ya operando), **📐 definido** (rol/charter escrito, sesión aún no instanciada),
> **🟡 parcial** (existe pero incompleto), **🆕 propuesto** (agente faltante, pendiente de OK del dueño).
> Fija la estructura estándar (ADR-051); los agentes faltantes están en §4. Diagrama:
> `docs/organizacion/estructura-gsg.mermaid`. No instancia nada — es doc de gobernanza.

**Leyenda de modelo:** Opus = alto juicio · Sonnet = ejecución (ADR-032). **Todo agente calibra antes de
actuar** (ADR-052).

---

## 1. Gobernanza (transversal, sobre todas las divisiones)

| Agente | Rol (1 línea) | Modelo | Estado |
|---|---|---|---|
| **Dueño (Maxi)** | APRUEBA planes e irreversibles; decide adopción de fundamentos | humano | ✅ |
| **Dispatch** | conductor / canal único con el dueño; releva status; eleva | — (canal) | ✅ |
| **PMO puro** | AUTOR de planes (backlog · roadmap · metodología · ADRs); propone | Opus | ✅ |
| **Arquitecto de Solución** | EJECUTOR: ejecuta lo reversible del plan aprobado; eleva lo irreversible | Sonnet/Opus | 📐 (rol ADR-048, sesión no instanciada) |
| **Advisory Board** | panel de asesores que PROPONE estrategia con rigor | Sonnet | 🆕 (sin roster — §4) |
| **Challenger (contrarian)** | red-team: DESAFÍA cada propuesta del Advisory (tesis/antítesis) | Sonnet | 📐 (rol ADR-045) |
| **QA / Probador** | prueba como usuario real; repro de bugs; verifica antes de cerrar | Sonnet | ✅ |
| **Seguridad** | RLS/aislamiento/auth/secretos; on-call + parte del Gate | Opus | ✅ |
| **Auditoría GSG (el Gate)** | corre el Gate de Excelencia antes de CADA merge | Opus (siempre) | ✅ |

## 2. Divisiones y sus células

### 2.1 · ERP multi-tenant (producto SaaS core)
| Célula | Rol | Modelo | Estado |
|---|---|---|---|
| **Pagos** | gateway de cobros (Mercado Pago, checkout/seña, webhooks, conciliación) | Sonnet→Opus (plata) | ✅ |
| **Caja** | caja del POS (apertura/cierre/arqueo/movimientos) | Sonnet | ✅ |
| **Inventario/POS** | stock, productos, compras/reposición, proveedores | Sonnet | ✅ |
| **Fiscal (ARCA)** | facturación electrónica WSFEv1, certs, Invoice/Outbox | Sonnet→Opus (plata) | ✅ |
| **Plataforma/Deploy/Infra** | RLS/tenancy, perf, observabilidad, reporting, tren de deploy | Sonnet→Opus (seguridad) | ✅ |
| **Diseño** | design system, tokens, primitivos, branding por tenant, vidrieras | Sonnet | ✅ |
| **Reliability/SRE** | hardening, vallas, rate-limit, firma de webhooks | Sonnet→Opus | 🟡 (existe; falta SRE on-call/SLOs → §4) |
| **Data / DBA** | dueño del ciclo de datos, migraciones Neon, integridad, RLS | Opus | 🆕 (§4) |

### 2.2 · Agencia Digital (satélite del ERP: lo vende + suma features)
| Célula | Rol | Modelo | Estado |
|---|---|---|---|
| **Consultores / Análisis de mercado** | inteligencia de mercado, estado del arte, diferencial con evidencia | Sonnet→Opus (estrategia) | ✅ |
| **Desarrolladores** | construyen lo que los consultores validan (apalancando ERP) | Sonnet | ✅ |
| **PMO proactivo (Agencia)** | avance + búsqueda proactiva de innovación del sector | Sonnet | ✅ |
| **Growth** | métricas de conversión/activación/retención por vidriera/tenant | Sonnet→Opus (estrategia) | 🟡 (gap G2, parcial) |
| **WhatsApp** | canal WhatsApp-first (wa-intent/provider/dispatch) | Sonnet | 🟡 (capas listas; falta handler HTTP + ADR proveedor) |
| **Soporte / Customer Success** | soporte y éxito del cliente post-venta | Sonnet | 🆕 (§4) |

### 2.3 · Agencia Grow (negocios propios del grupo)
| Célula | Rol | Modelo | Estado |
|---|---|---|---|
| **Panel del Dueño** | analytics single-tenant (owner-insights / owner-trends) | Sonnet | ✅ (cableado en /admin/reportes) |
| **Gestión de cartera propia** | conduce los negocios propios del grupo | Sonnet | 🆕 (§4) |
| **Pricing & Packaging** | precios/planes por tier (low/mid/big), márgenes, unit economics | Opus (plata) | 🆕 (§4) |

### 2.4 · Preset IA (motor de onboarding — transversal)
| Célula | Rol | Modelo | Estado |
|---|---|---|---|
| **Ingesta / Extracción** | lee el render del cliente y extrae marca/catálogo (con autorización) | Opus | ✅ |
| **Adaptación / Calidad** | arma el preset (tenant+blueprint+branding+demo) y pasa el Gate | Opus | ✅ |

### 2.5 · Importaciones (trigger propio `impo` — todo Opus)
| Célula | Rol | Modelo | Estado |
|---|---|---|---|
| **PMO Importaciones** | coordina + tesis + carrito curado (aprobación del dueño) | Opus | 📐 (ADR-038, no abierto) |
| **Analista de oportunidades** | qué importar con demanda y margen en AR | Opus | 📐 |
| **Proveedores China** | sourcing, MOQ, muestras, Alibaba/1688 | Opus | 📐 |
| **Costos/Logística/Aduana** | régimen AR, landed cost, aranceles | Opus | 📐 |
| **Mercado/Pricing** | demanda, competencia, canales, margen | Opus | 📐 |
| **Logística/Fulfillment** | logística propia vs 3PL | Opus | 📐 |

### 2.6 · Transversales de ejecución
| Célula | Rol | Modelo | Estado |
|---|---|---|---|
| **Producto por rubro** | features y branding por tenant/rubro | Sonnet | ✅ |
| **Adaptador / Delivery por cliente** | onboarding/config/datos de un cliente (`tenant/<slug>`) | Sonnet | ✅ |
| **Docs / Índice vivo** | mantiene TABLERO/ADR-INDEX/ESTADO-ACTUAL sincronizados | Sonnet | 🆕 (§4; hoy lo hace el PMO) |
| **FinOps / Costo-Uso** | telemetría de costo/uso de la factory (serie temporal + tablero) | Sonnet (+Opus revisa) | 🆕 (§4; gap G3) |
| **Release Manager** | orquesta el tren de releases (batch→build→Gate→deploy con OK) | Opus coord | 🆕 (§4; gap G8) |
| **Legal / Compliance** | autorización de marca, datos personales, términos | Opus | 🆕 (§4) |

## 3. Flujo canónico (RACI)
**PMO propone plan → Dueño aprueba → Arquitecto ejecuta reversible / eleva irreversible → Dispatch releva
status.** Advisory+Challenger **tensionan** antes de adoptar fundamento (ADR-045); el **Gate GSG** corre en
cada merge; la **retro** (ADR-047) cierra cada sprint y alimenta la memoria de lecciones. Detalle en
ADR-049 (RACI) y ADR-050 (roster de sprint).

## 4. Agentes faltantes (🆕 PROPUESTOS — pendientes de OK del dueño, NO instanciados)

Formato: **nombre** — misión (1 línea) · **entradas → salidas** · **modelo** · **división**.

1. **Data / DBA (dueño de datos)** — dueño del ciclo de datos y migraciones de prod; único que propone
   tocar Neon. · *in:* cambios de schema de los cores · *out:* plan de migración + verificación de
   aislamiento + propuesta de `migrate deploy` (Gate 2, elevada). · **Opus** · **ERP/Plataforma**. (gap G7)
2. **Release Manager** — orquesta el tren de releases de punta a punta. · *in:* ramas con Gate verde ·
   *out:* checklist de release + propuesta de deploy (Gate 1, elevada). · **Opus coord / Sonnet ejecuta** ·
   **Gobernanza**. (gap G8)
3. **FinOps / Costo-Uso** — telemetría de costo/uso de la factory (serie temporal, tablero por
   célula/modelo). · *in:* logs de uso Claude · *out:* reporte semanal + alertas de gasto. · **Sonnet
   (+Opus revisa)** · **Gobernanza/PMO**. (gap G3)
4. **Pricing & Packaging** — define precios/planes por **tier (low/mid/big)**, márgenes y unit economics. ·
   *in:* análisis de mercado + costos (FinOps) · *out:* tabla de planes por tier + modelo de márgenes
   (pasa por Advisory+Challenger). · **Opus** · **Agencia Grow/Gobernanza**.
5. **Soporte / Customer Success** — soporte y éxito del cliente **post-venta** (incidencias, retención). ·
   *in:* consultas/tickets de tenants vivos · *out:* resoluciones + feedback a producto + casos a la retro.
   · **Sonnet** (zona humana/criolla, de-sesgo) · **Agencia Digital/Delivery**.
6. **SRE on-call / SLOs** — formaliza guardia, SLOs y runbook de incidentes (hoy el hardening es ad-hoc). ·
   *in:* señales de prod/observabilidad · *out:* SLOs + runbook + acciones de resiliencia. · **Opus decide /
   Sonnet ejecuta** · **ERP/Plataforma**. (gap G6)
7. **Docs / Índice vivo** — mantiene `TABLERO-SESIONES` + índices ADR + `ESTADO-ACTUAL` sincronizados. ·
   *in:* cambios de canon · *out:* docs al día. · **Sonnet** · **Gobernanza/PMO**. (gap G9)
8. **Advisory Board (roster)** — define el **panel de asesores** (personas/perfiles) que propone estrategia.
   · *in:* preguntas estratégicas del dueño · *out:* propuestas fundadas (que el Challenger desafía). ·
   **Sonnet** · **Gobernanza**.
9. **Legal / Compliance** — cumplimiento legal (marca/consentimiento, datos personales, términos), más allá
   de lo fiscal. · *in:* flujos nuevos que tocan datos/marca · *out:* checklist legal + riesgos. · **Opus**
   · **Gobernanza**. (complementa ADR-042)
10. **Product Owner del Catálogo/Plugins** — dueño del **repositorio de módulos**: prioriza el backlog de
    plugins, define el **set mínimo vendible** por rubro/tier y mantiene el **registry** de madurez. · *in:*
    gap de módulos (roadmap §6.1) + necesidades de venta · *out:* backlog priorizado + gate de venta por
    rubro. · **Opus** (prioriza) / **Sonnet** (registry) · **ERP core / Gobernanza**. (ADR-054; **arranque
    posible sin sumar agente:** PMO + Producto por rubro + Arquitecto)

> **Cómo se activan:** el dueño elige cuáles aprobar; cada uno aprobado se graba con su charter y entra al
> roster con su modelo. Prioridad sugerida por riesgo/palanca: **Data/DBA** y **Release Manager**
> (protegen lo irreversible) → **FinOps** y **Pricing** (plata) → **Soporte** y **SRE** (operación) →
> **Docs**, **Advisory roster**, **Legal** (orden/escala).

## 5. Agentización de sesiones (roles recurrentes → agentes ; tareas one-off → plantillas)

Revisión de las sesiones/comandos actuales. **Todo agente permanente se estandariza sobre el charter
genérico** (`docs/organizacion/charter-generico-agente.md`) y **calibra** (ADR-052).

### 5.a · AGENTES permanentes (rol recurrente — ya en el roster de arriba)
| Sesión/comando | Rol recurrente | Agente permanente | Estado |
|---|---|---|---|
| `sesion-seguridad` | auditoría de seguridad | **Seguridad** (gobernanza) | ✅ ya agente |
| `sesion-arquitectura` | arquitectura/gobierno | **PMO puro** (autor) + **Arquitecto de Solución** (ejecutor) | ✅ ya agentes (ADR-048/049) |
| `remoto` / `sesion-movil` | conducción desde el móvil | **Dispatch** (conductor) | ✅ ya agente |
| `sesion-consolidacion` | consolidación/cierre (main limpio, tags, handoff) | **Arquitecto** (ejecuta lo reversible) + **Docs/Índice vivo** (🆕) | 🟡 responsabilidad estandarizada (ADR-039 backup + ADR-047 retro); dueño formal = Docs cuando se active |
| `impo` | importaciones | **Estructura Importaciones** (6 células) | 📐 ya agente (ADR-038) |
| frentes: `calidad·diseno·pagos·plataforma·growth·producto·reliability·whatsapp·importaciones` | cores/células | células del §2 (QA·Diseño·Pagos·Plataforma·Growth·Producto·Reliability·WhatsApp·impo) | ✅ ya agentes |

### 5.b · TAREAS one-off (NO agente permanente — plantilla ejecutada por la célula que corresponda)
| Sesión/comando | Por qué one-off | Quién la ejecuta |
|---|---|---|
| `sesion-feature` | una feature acotada = **tarea**, no un rol permanente | el core/célula dueño del dominio |
| `sesion-negocio` | análisis de negocio puntual = tarea | Consultores (Agencia) o PMO |
| `rol` / `rol-fullstack` | plantillas genéricas de rol (utilitarias) | quedan como template, no como agente |
| `manual` | utilitaria/manual | one-off |
| `sprint` · `economia` · `boost` | **meta-comandos** (orquestan/switch de modelo), no roles | los usa cualquier sesión |

> **Conclusión:** casi todos los roles recurrentes **ya estaban agentizados** (fruto de ADR-045…051); esta
> sección lo **formaliza** y deja el mapeo explícito. El único hueco recurrente sin dueño formal es
> **consolidación** → queda estandarizada como paso de cierre del Arquitecto + la célula **Docs/Índice vivo**
> (🆕, §4). Nada nuevo se instancia sin OK del dueño.

---

## 6 · Roles agentizados nuevos (2026-07 — definidos en `.claude/agents/`)
Sumados como subagentes reutilizables, consistentes con el flujo RACI (ADR-049) y el Gate (ADR-040). Se
convocan del pool (ADR-053); definir ≠ instanciar.

| Rol (slug) | Capa | Qué hace | Qué decide / eleva |
|---|---|---|---|
| **Analista de Funcionalidad de Backoffice** (`backoffice-producto`) | Sonnet→Opus | Define/diseña una funcionalidad de backoffice desde la necesidad del negocio (flujos, RBAC, criterios de aceptación) | Decide la spec funcional; eleva migración/§C. Dupla con `backoffice-ingenieria` |
| **Ingeniero de Backoffice** (`backoffice-ingenieria`) | Sonnet→Opus | Construye e integra la funcionalidad al backoffice (server actions, `/admin`, RBAC, tests) | Ejecuta código reversible; **eleva** migraciones/secretos/§C; **pasa el Gate antes de integrar** |
| **Especialista en Matrices RACI** (`raci-matriz`) | Sonnet→Opus | Diseña/mantiene la RACI por frente/tarea; detecta huecos y solapes; alinea con ADR-049 y el roster | Produce la matriz (reversible); eleva si falta dueño de algo irreversible o hay que crear rol |
| **Guardián del Sello GSG** (`sello-marca-gsg`) | Opus | Dentro de Auditoría GSG: aporta filosofía/visión de marca a TODOS los productos (identidad, tono, valores) | Veta coherencia de marca junto al Gate (ADR-043/044/046); no pisa la marca del cliente |

> **Equipo de funcionalidades de backoffice** = `backoffice-producto` + `backoffice-ingenieria` (proponen →
> Gate ADR-040 → merge). **Equipo de Auditoría GSG** = `auditoria-gsg-gate` (Gate técnico) + `sello-marca-gsg`
> (alma de marca). Ambos corren en Opus.

---

*Doc de organización/gobernanza (ADR-051). Todo agente calibra antes de actuar (ADR-052). No toca prod ni deploy.*
