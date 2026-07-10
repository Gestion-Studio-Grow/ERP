# 🏛️ Índice maestro de la FUNDACIÓN estratégica (ADR 060-071)

> **Qué es:** el mapa navegable de la **fundación estratégica** landeada el **2026-07-10** — las 12 decisiones
> que ordenan producto, arquitectura y gobernanza para escalar a dos productos. Cada una vive como **ADR en
> prosa** (Contexto/Decisión/Consecuencias/Alternativas), con ID inmutable, en el **grafo** (`docs/adr/graph.json`)
> y citada en el **[INDEX de ADRs](../adr/INDEX.md)**. Este índice **enlaza**, no reemplaza (índice-puntero,
> ADR-008/H1). Complementa la **Constitución** (`docs/constitucion/`, C-001…C-005, Nivel 0).
>
> **Nivel:** todas **fundacional**. **Alcance:** doc-only, aditivo, reversible; lo irreversible (separación de
> bases, plan pago, DR, custodia de certificados) queda **elevado al dueño** (Gate 1/2, ADR-041/048).

---

## Las 12 decisiones (por eje)

### 🧭 Producto y segmentación
| ADR | Decisión | Enlace |
|---|---|---|
| **060** | Segmentación en DOS productos ("Comercio Micro" / "PyME-Empresa") con **bases separadas** | [ADR-060](../adr/ADR-060-segmentacion-dos-productos-bases-separadas.md) |
| **061** | Plataforma / **motor invisible compartido** (config-sobre-código): qué se comparte vs. qué difiere 100% | [ADR-061](../adr/ADR-061-plataforma-motor-invisible-compartido.md) |
| **069** | Norte de diseño **Apple×SAP** ("un SAP que diseñó Apple") + UX/UI como **pilar** (puntero §11) | [ADR-069](../adr/ADR-069-norte-diseno-apple-por-sap-ux-pilar.md) |

### 🏗️ Arquitectura y núcleo técnico
| ADR | Decisión | Enlace |
|---|---|---|
| **062** | **RLS pool shared-schema** como línea base NO negociable (+ 3 gaps de realidad) | [ADR-062](../adr/ADR-062-rls-pool-shared-schema-linea-base.md) |
| **063** | **Refactorizar/endurecer, NO reconstruir** (evidencia ~65% de madurez) | [ADR-063](../adr/ADR-063-refactorizar-endurecer-no-reconstruir.md) |
| **064** | **Núcleo transaccional**: ledger append-only + calculadoras Decimal + invariantes **I1–I7** | [ADR-064](../adr/ADR-064-nucleo-transaccional-ledger-invariantes.md) |
| **065** | **Fábrica de tenants** (provisioning + saga + dry-run) + **fábrica de módulos** (método repetible) | [ADR-065](../adr/ADR-065-fabrica-de-tenants-y-fabrica-de-modulos.md) |

### 🔒 Seguridad, datos y cumplimiento
| ADR | Decisión | Enlace |
|---|---|---|
| **066** | **Credenciales fiscales POR TENANT** (CUIT + certificado ARCA) — corrige "secreto por ámbito" | [ADR-066](../adr/ADR-066-credenciales-fiscales-por-tenant.md) |
| **067** | **Neon plan pago** + cumplimiento **Ley 25.326** + **DR** (RPO/RTO + PITR) | [ADR-067](../adr/ADR-067-neon-plan-pago-cumplimiento-y-dr.md) |

### 🏛️ Gobernanza, release y método
| ADR | Decisión | Enlace |
|---|---|---|
| **068** | Gobernanza **100%-IA con DOS gates humanos** (consultor funcional + Facundo/ciberseguridad) | [ADR-068](../adr/ADR-068-gobernanza-100-ia-dos-gates-humanos.md) |
| **070** | Disciplina de **release**: un deploy para todos + preview→prod con gates + fix rama→entorno | [ADR-070](../adr/ADR-070-disciplina-de-release-un-deploy-para-todos.md) |
| **071** | **Método de conocimiento**: ADRs + GEP como memoria organizacional ("nada listo sin artefacto+evidencia") | [ADR-071](../adr/ADR-071-metodo-de-conocimiento-adrs-y-gep.md) |

---

## 📎 Addenda y documentos de terreno enlazados
Los ADRs **apuntan** a estos documentos de detalle (fuente de verdad fina, ADR-008/H1):

- **Núcleo transaccional** — [`addendum-nucleo-transaccional.md`](addendum-nucleo-transaccional.md): diseño
  decision-grade de las 4 capas + invariantes I1–I7 con su test. **Referenciado por ADR-064** (su detalle vive acá).
- **Arquitectura UX/UI (§11)** — [`addendum-arquitectura-ux-ui.md`](addendum-arquitectura-ux-ui.md): Apple como
  referencia primaria, SAP como profundidad adaptada; design system, densidades, primitivos. **Referenciado por
  ADR-069** (su detalle lo cierra la sesión de diseño).
- **Verdad de terreno del repo** — [`mapa-grounded-sistema-2026-07-09.md`](mapa-grounded-sistema-2026-07-09.md):
  el mapa GROUNDED del sistema (estado real medido, ~65% de madurez). **Evidencia de ADR-063** (refactor no
  reconstruir) **y ADR-062** (RLS cableado + gaps).
- **Economía por segmento** — [`costos-por-segmento.md`](costos-por-segmento.md): los tres segmentos cierran en
  pesos; el cuello es la mano de obra. **Sustento de ADR-060/065/067** (self-serve, por producto).

---

## 🔗 Cómo se relacionan (dependencias clave)
- **060** (dos productos/bases) se apoya en **061** (motor compartido) y **058** (GROW-AR); su DR/cumplimiento
  lo da **067**; su aislamiento interno, **062**.
- **064** (núcleo) baja **057** (dinero) y alimenta las firmas de **068** (invariantes I1–I7).
- **065** (fábricas) siembra por tenant las credenciales de **066** y respeta **062** (RLS) sobre **061** (motor).
- **070** (release) deriva de **061** (un artefacto) + **029** (hostname) + **040** (Gate).
- **071** (método) es el paraguas: **todo** lo anterior vive como ADR en el grafo, y **068** firma sobre su
  evidencia.

> Consultá el grafo completo con `node scripts/adr-context.mjs <ADR-ID>` (qué depende de qué) o
> `node scripts/adr-graph.mjs` para regenerarlo. El linkcheck (`node scripts/adr-linkcheck.mjs`) garantiza que
> ninguna cita quede colgada.

— Elaborado por GSG (S5 · Juicio Crítico / Arquitecto de Solución) · fundación landeada 2026-07-10 · doc-only, aditivo
