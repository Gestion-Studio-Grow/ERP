# Sector — Agencia Digital Creativa

**Qué es este documento:** el *charter* del segundo sector de la compañía —una **agencia digital
creativa de publicidad digital** con un frente propio de **software que genera ganancias**—. Fija
qué es el sector, cómo se organiza como *core/sector*, qué frentes tiene, cómo aplica la metodología
del repo y cómo convive con el sector ya existente (el ERP SaaS multi-tenant). Es un doc de encuadre,
no de implementación: nada de lo de acá toca prod, Neon ni deploys. La ratificación estructural queda
como **ADR-027** (ver §7).

> **Entrada del sector:** si abrís una sesión para trabajar acá, **leé primero
> `docs/sectores/agencia-digital/FUNDAMENTO.md`** (quién sos, qué hacés, método, objetivo — enganchado
> desde `CLAUDE.md` como Fase 0 del sector). Este charter es la **estrategia**; el sector se organiza en
> **dos equipos** —**Consultores Expertos** (inteligencia de mercado + diferencial) y **Desarrolladores**
> (construyen lo validado)— con un **PMO proactivo** por encima. El primer análisis de mercado ya está
> en `docs/sectores/agencia-digital/analisis-mercado/`.

> **Regla de una línea:** misma **metodología** y mismo **PMO** para los dos sectores; **repos y
> deploys separados por sector**; el software de la agencia que apalanca el ERP se trata como
> **PRODUCTO** (capability/Blueprint/Plugin o standalone con su ADR), **nunca** como trabajo a medida
> metido en el Core (guardrail anti-consultora, `FUNDAMENTOS-Y-VISION.md` §2).

---

## 1. Qué es el sector

La **Agencia Digital** es una unidad de negocio de **servicios creativos + performance de publicidad
digital** que, además, incuba **productos de software propios** con ingresos recurrentes. Dos motores
en un mismo sector:

- **Motor de servicios (agencia):** identidad y diseño, campañas paid (Meta/Google/TikTok),
  contenido y social. Ingreso por **fee mensual / proyecto / % de inversión gestionada**.
- **Motor de producto (software-para-ganancias):** SaaS y herramientas que apalancan lo que la
  compañía **ya construyó** (ERP multi-tenant, Plugin ARCA, storefront brandeable). Ingreso
  **recurrente por suscripción**, con la economía SaaS del sector ERP (`FUNDAMENTOS §1`: se paga una
  vez, lo reciben todos los clientes).

**Por qué los dos juntos y no dos sectores:** el motor de servicios es el **canal de distribución**
del motor de producto. La agencia consigue clientes (una marca que necesita ads y una landing que
convierta); esos clientes se resuelven **dando de alta un tenant del ERP / un storefront**, no
armando software a medida. La agencia vende, el producto entrega y factura recurrente.

---

## 2. El sector como *core/sector* (encaje con el modelo de la compañía)

La compañía tiene **dos sectores**, un **solo PMO** y una **sola metodología**:

| Sector | Qué produce | Naturaleza del "core" | Repo / deploy |
|---|---|---|---|
| **ERP SaaS multi-tenant** (existente) | Un Core único, N tenants | Core de **producto** (código compartido, deploy único, DB prod) | `estetica-erp` (actual) |
| **Agencia Digital** (nuevo) | Servicios creativos + productos SaaS propios | Sector de **servicios** con frente de **producto** incubado | **repo/espacio propio** (`agencia-digital`) + productos con repo/plugin propio |

El sector Agencia **no** es un tenant del ERP ni un Blueprint: es una **unidad de negocio hermana**.
Lo que sí puede ser tenant del ERP es **cada cliente de la agencia** que necesite el producto.

---

## 3. Frentes del sector (eje de paralelización)

Mismo principio que el sprint del ERP: **se paraleliza por disciplina/dominio (core), NUNCA por
cliente** (`METODOLOGIA-SPRINT.md`, reglas 2–3). El cliente se atiende en el frente de **Delivery/
Cuentas** (equivalente a la "regla 4: delivery/operación por cliente SÍ puede tener su propia
sesión", porque no toca el core compartido).

| Frente (sesión dueña) | Alcance | Análogo en el ERP |
|---|---|---|
| **Creativo / Diseño** | identidad, dirección de arte, piezas, branding, sistema visual por marca | Diseño/UX transversal |
| **Performance / Ads** | campañas paid (Meta/Google/TikTok), tracking, medición, optimización de inversión | un "core" de dominio |
| **Contenido** | social, copy, calendario editorial, video/foto, community | un "core" de dominio |
| **Producto / Software** (software-para-ganancias) | SaaS y herramientas que apalancan el ERP/ARCA/storefront (ver §5) | frente de **producto** — el que construye código que factura recurrente |
| **Delivery / Cuentas** (cross-cutting, por cliente) | onboarding, config, ejecución y entregables **de un cliente** puntual | "delivery por cliente" (regla 4) |
| **PMO** (por encima) | estrategia, tablero, asigna frentes, **secuencia lo compartido** e **integra** | PMO merge-master (sobre la rama principal del sector) |

**Cross-cutting (no son frentes-core):** Calidad (cada frente entrega verificado/verde), y el
**puente con el ERP** (cuando un cliente se resuelve como tenant, lo dispara Delivery contra el
producto ERP, sin forkear — `FUNDAMENTOS §3`).

### Worktrees / sesiones del sector (mismo contrato que el ERP)
`1 frente = 1 worktree = 1 sesión aislada`. El PMO orquesta sobre la rama principal del repo del
sector; cada frente entrega en su rama; el PMO es el **único que integra**. Delivery puede abrir una
sesión **por cliente** (no choca con el core porque produce entregables, no código base).

---

## 4. Cómo aplica la metodología del repo

El sector corre sobre **el mismo sistema operativo de trabajo** que el ERP —no se inventa un método
nuevo—:

1. **Fase 0 — exploración obligatoria.** Toda sesión arranca leyendo su bocado del repo (este
   charter, el tablero del sector, `docs/METODO-ROLES.md`) y el material real (brief del cliente,
   cuentas de ads, marca) **antes** de proponer. Nada sobre suposiciones.
2. **1 frente = 1 worktree = 1 sesión.** Paralelización por disciplina, no por cliente
   (`METODOLOGIA-SPRINT.md`). El PMO **secuencia en serie** lo compartido (identidad de marca,
   esquema de datos de un producto, credenciales).
3. **Coordinación por el REPO, no por el chat.** Cada sesión deja su resultado en el repo (rama +
   estado en el tablero del sector). El repo es la memoria compartida (ADR-008).
4. **Decisión estructural → ADR.** Lo estructural del sector (elegir un producto, su modelo de datos,
   su pricing) se persiste como ADR con su porqué, no como comentario suelto. Este charter se ratifica
   como **ADR-027**.
5. **Definición de terminado + verificación.** Si es código: `tsc`/build en verde (+ preview si hay
   pantalla). Si es entregable de servicio: revisado contra el brief. No se entrega lo que no se
   verificó (`METODO-ROLES.md` §3).
6. **Backup al cierre.** Todo trabajo termina en **commit + push a GitHub** con mensaje que explica el
   *porqué*. **Gate de deploy** y **gate de DB de producción** siguen vigentes para el frente de
   producto (`METODO-ROLES.md` §4/§6): publicar y migrar prod requieren OK explícito.
7. **Reporte ejecutivo + bajo nivel** (Maxi es funcional): qué se logró y qué significa para el
   negocio, más el detalle técnico.

---

## 5. Frente de Software-para-Ganancias — productos candidatos (priorizados)

Regla del frente: **apalancar lo que YA existe** antes de construir de cero. Cada producto reusa un
activo ya pago (Core ERP, Plugin ARCA, storefront), tiene su **ADR** y su **modelo de ingreso
recurrente**. Prioridad = (activo ya construido) × (ingreso recurrente) × (mercado claro) ÷ (trabajo
para llegar a cobrar).

### P1 — **ARCA Facturador automático para monotributistas** (arca *standalone*)
- **Qué es:** ingesta automática de **todo lo que le entra a un comerciante por Mercado Pago** y se lo
  factura solo (Factura C por operación), con modelo **"contador socio"** (un contador administra la
  cartera de monotributistas, cada cliente un tenant aislado).
- **Qué apalanca:** el **Plugin ARCA** ya scaffolded (`src/plugins/arca/`, ADR-022) y el diseño ya
  cerrado en **ADR-025** (dos fuentes convergentes, idempotencia por `payment_id`, OAuth de MP,
  clasificador de ingresos, panel del contador). Núcleo con stubs y smoke tests ya existe.
- **Por qué genera ingresos:** suscripción mensual por comercio + **revenue-share con contadores**
  (canal). Mercado enorme (monotributistas AR con muchas operaciones por MP) y **diferencial ya
  analizado** vs Facturitas (manual) / Facturante (solo posnet) / TusFacturasApp·iFactura (cobro de
  facturas): nadie ingesta **todo el feed de MP + multi-cliente por el contador**.
- **Por qué P1:** activo más maduro (código + ADR + diferencial listos), ingreso recurrente puro,
  mercado masivo. **Menor distancia entre lo que hay y el primer peso facturado.**

### P2 — **ERP multi-tenant como SaaS self-serve** (el producto actual, empaquetado para vender)
- **Qué es:** vender el ERP a otros negocios (estética, retail/mostrador, carnicería) como SaaS por
  suscripción, con alta self-serve.
- **Qué apalanca:** el Core ya es multi-tenant, con **Blueprints** de estética/retail/carnicería,
  storefront público y **provisioning por script** (ADR-019). El activo más grande de la compañía.
- **Por qué genera ingresos:** suscripción mensual por tenant con economía SaaS (cada mejora se paga
  una vez, la reciben todos — `FUNDAMENTOS §1`). La agencia es el **canal de venta** natural.
- **Por qué P2 (no P1):** para escalar comercialmente hay que **cerrar el gate del 2º tenant** —RLS
  (ADR-018) + onboarding self-serve (ADR-019/021)—. Es el mayor upside, pero tiene trabajo de
  plataforma antes de vender a volumen. Hasta entonces se vende **asistido** (alta operada).

### P3 — **Storefront / Vidriera brandeable como producto** (Tier Front Premium)
- **Qué es:** landing/tienda brandeable por marca que la agencia vende como **entregable recurrente**
  (armado + hosting/updates), y que convierte la inversión en ads del cliente.
- **Qué apalanca:** ya construido — `src/components/premium` + `/premium` (Lighthouse 100), Blueprints
  retail **Storefront** y **Magra SiteReplica** migrados a design tokens + `PhotoPlaceholder` de marca.
- **Por qué genera ingresos:** **fee de armado + suscripción mensual** de hosting/mantenimiento; ticket
  chico pero **ciclo de venta corto** y upsell directo desde el frente de Ads (un cliente de campañas
  necesita una landing que convierta). Es el **puente perfecto agencia↔producto**.
- **Por qué P3:** menor ticket y ya casi listo; ideal para **generar caja temprano** y validar el
  canal agencia→producto mientras P1/P2 maduran.

> **Orden recomendado de ejecución:** P3 para caja temprana y validar canal → **P1 como apuesta
> principal** (recurrente + mercado masivo) → **P2 como plataforma de fondo** (mayor upside, requiere
> cerrar RLS/onboarding). Los tres reusan activos ya pagos; ninguno arranca de cero.

---

## 6. Convivencia de los dos sectores (decisión recomendada)

**Recomendación (con criterio de PMO): metodología y gobierno ÚNICOS; repos y deploys SEPARADOS por
sector; el puente es explícito y productizado.**

- **Metodología: única y compartida.** El modelo de sprint, roles, ADRs, Fase 0, backup al cierre y
  coordinación-por-repo (`METODO-ROLES.md`, `METODOLOGIA-SPRINT.md`, ADR-008) rigen **igual** para los
  dos sectores. Es el sistema operativo de la compañía; no se duplica.
- **Gobierno: un solo PMO** por encima de ambos, con **un tablero por sector**. Autonomía amplia;
  gates duros compartidos (deploy y DB de prod).
- **Repos: SEPARADOS, no un mono-repo.** Razón dura:
  1. El ERP es **Core-producto con deploy único y DB de producción (Neon) + RLS + gate de deploy**.
     Meterle la operación de una agencia de servicios (assets de campañas, entregables por cliente)
     **contamina el Core** con material **no reutilizable** y **viola el guardrail anti-consultora**
     (`FUNDAMENTOS §2`: lo que sirve a un solo cliente es proyecto aparte, se aísla, no entra al Core).
  2. Distintos ejes de cambio, distintos deploys, distinto blast-radius: un push de la agencia no debe
     poder tocar el pipeline del ERP en producción.
  3. El sector Agencia vive en su **propio repo/espacio** (`agencia-digital`) para su operación de
     servicios; los **productos** de software con vida propia (ej. arca standalone) van en **su** repo
     o como plugin del Core, con su ADR.
- **El puente, explícito y sin forks:**
  - Cliente de la agencia que necesita ERP/tienda → se da de **alta como tenant** del ERP (Blueprint +
    config + provisioning), **nunca** un fork ni código a medida en el Core (`FUNDAMENTOS §1/§3`).
  - Producto de software que apalanca el ERP → se construye como **capability/Blueprint/Plugin** (si es
    reutilizable dentro del Core) **o standalone** (si es separable, tipo arca — ADR-022 vive como
    plugin *y* ADR-025 lo habilita como producto aparte). Siempre con su ADR; nunca a medida.

**Descartado — mono-repo único:** rompería el aislamiento de deploy/DB del ERP y el guardrail
anti-consultora. **Descartado — método distinto por sector:** duplica gobierno y rompe la
coordinación-por-repo que ya funciona.

---

## 7. Próximos pasos (no ejecutados en esta sesión)

Esta sesión es **documentación/planificación**; no toca prod, Neon ni deploys. Follow-ups sugeridos,
para que el owner los dispare cuando quiera:

1. **Ratificar como ADR-027** — "Sector Agencia Digital: gobierno único, repos separados, puente
   productizado" (formaliza §6 como decisión estructural, `METODO-ROLES.md` §3).
2. **Crear el espacio del sector** — repo/carpeta `agencia-digital` + su tablero (análogo a
   `ESTADO-FRENTES.md`/`TABLERO-SESIONES.md`).
3. **Kickoff del frente de Producto** — abrir la `/sesion-feature` de **P3 (Storefront producto)** para
   caja temprana, y planificar **P1 (arca standalone)** apoyándose en ADR-022/ADR-025.
4. **Definir pricing** de cada motor (fee de agencia vs. suscripción de producto) — su propio ADR.

> **Gates que siguen vigentes para el frente de Producto:** publicar en la web = OK explícito de Maxi
> ("deployá"); `prisma migrate deploy` en prod se pausa y se reporta. Nada de esto se hizo acá.
