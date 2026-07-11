---
id: ADR-072
nivel: fundacional
dominio: [Diseño, UX, Producto, Arquitectura]
depends_on: [ADR-009, ADR-040, ADR-043, ADR-044, ADR-058, ADR-059, ADR-069]
---
# ADR-072: Enfoque de diseño — la filosofía del front (Apple×SAP), el sistema tematizable y el backoffice "Fable" congelado

**Estado:** Aceptado — **fundamento de diseño**. Es la pieza que faltaba en la fundación: el *cómo se ve y por
qué* de TODO lo que sale de GSG. Baja el **norte** de ADR-069 ("un SAP que diseñó Apple") a una **decisión de
diseño operable** y **congela** el patrón de backoffice ganador.
**Fecha:** 2026-07-10
**Depende de:** ADR-009 (UX metadata-driven, diseñar para la recepcionista), ADR-040 (Gate de Excelencia / SAP
Fiori), ADR-043 (sello de marca GSG: no pisar la marca del tenant), ADR-044 (Argentinizar SAP), ADR-058
(GROW-AR: un Core, dos motores), ADR-059 (reingeniería de interfaz: perfil · densidad · naming), ADR-069
(norte de diseño Apple×SAP + UX/UI como pilar)
**Relacionado:** `docs/estrategia/addendum-arquitectura-ux-ui.md` (detalle §11: Apple como referencia primaria,
SAP como profundidad) · `docs/estrategia/diseno/README.md` (catálogo de assets aprobados) ·
`docs/estrategia/fundacional-DEFINITIVO-v2.md` (síntesis, sección Diseño)

---

## Contexto

La fundación (ADR-060..071) ordenó producto, arquitectura, seguridad y gobernanza, pero **el enfoque de diseño
quedó como puntero** (ADR-069 fija el *norte* y eleva UX/UI a pilar, con el detalle "a desarrollar por la
sesión de diseño"). El dueño lo marcó explícito como **el hueco**:

> *"Faltaba el enfoque de diseño… la filosofía del front en todas nuestras plantillas, la referencia que
> tenemos, y por qué tenemos el backoffice como lo tenemos."*

Sin este ADR, cada pantalla re-litiga su estética, el backoffice ganador puede "moverse" sin querer, y el
sello GSG (ADR-043) no tiene una vara de diseño concreta contra la cual auditar. Este ADR **congela** la
filosofía y el patrón de backoffice, y declara que **gobiernan todas las plantillas** (backoffice y
frontends/tiendas), no que son decoración por pantalla.

## Decisión

### 1 · El norte: **Apple × SAP** (dos capas, no promedio)
No es "un poco de cada uno": es **Apple en la piel, SAP en la profundidad**, sin negociar ninguna de las dos.

- **Apple — la piel (percepción):** tipografía **Inter**; **escala de font-sizing generosa** y **jerarquía
  tranquila** (pocos tamaños, mucho contraste de peso, no de ruido); **minimalismo, aire, frescura**;
  **rendimiento sin fricción** (la interfaz nunca "pesa"). El usuario siente calma y calidad.
- **SAP — la profundidad (sustancia):** **densidad operativa** cuando hace falta (tablas, listas, formularios
  de empresa), **correctitud** de dato, **rigor enterprise** (estados, validaciones, trazabilidad). Debajo de
  la piel liviana hay un ERP serio.

Se ata a **Argentinizar SAP** (ADR-044): el rigor de SAP dicho en **criollo claro**, no en jerga. La densidad
se modula por perfil (ADR-059: **Comercio** más espaciada / **Empresa** más densa, mismo design system, token
`--density`).

### 2 · Sistema **tematizable** (un design system, no una paleta hardcodeada)
- **Acento único re-tematizable** vía **`--accent`**: la identidad de color de cada tenant/plantilla se cambia
  en **una variable**, no reescribiendo pantallas. El acento **es del tenant** (ADR-043: el tier/producto va en
  canal neutro, nunca roba la marca del cliente).
- **Variantes clara y oscura como ESTÁNDAR** (no una feature opcional): toda plantilla nace en las dos.
- **Tokens** de color, tipografía y espaciado como **base compartida** entre backoffice y frontends → coherencia
  de familia sin fork por pantalla.

### 3 · El backoffice **"Fable"** — POR QUÉ es como es (y por qué se **congela**)
El patrón de backoffice aprobado y **ganador en sus dos variantes (clara y oscura)** es "Fable". Se declara
**congelado: no se toca** salvo un nuevo ADR que lo reemplace explícitamente. Sus tres piezas y su razón:

- **Sidebar descriptiva** — navegación legible y jerárquica (grupos criollos de ADR-059 D3), no íconos crípticos:
  la recepcionista/comerciante se orienta sin manual (ADR-009).
- **Profundidad operativa tipo "Mostrador"** — el trabajo real (vender, cobrar, stock, caja) vive con densidad
  y correctitud de ERP; es la capa SAP de §1.
- **Buscador universal (⌘K) como CENTRO de la UX** — no un extra: es el modo primario de navegar y actuar
  ("ir a", "crear", "buscar cliente/producto"). Reduce clics y carga cognitiva → es la fricción-cero de Apple
  aplicada a un ERP.

**Por qué congelado:** es un patrón **validado** (ambas variantes ganan); moverlo por gusto de una pantalla
rompe la coherencia y desperdicia el trabajo de diseño. Cambiarlo = decisión de arquitectura (nuevo ADR + Gate),
no un ajuste de sesión.

### 4 · Alcance — esta filosofía **gobierna TODAS las plantillas**
No es estética por pantalla: es la **vara de diseño de todo GSG**.
- **Backoffice** (producto GSG): Fable, congelado, ambas variantes.
- **Frontends / tiendas** (vidrieras de tenant): aplican los **mismos tokens y el mismo norte Apple×SAP**,
  re-tematizados por `--accent` y por la identidad genuina del tenant (RFC-004: "producto ≠ tenant", cada
  vidriera se ve como el cliente, no como CH).
- **El Gate de Excelencia (ADR-040)** audita contra esta filosofía: coherencia, jerarquía, densidad por perfil,
  claro/oscuro, acento re-tematizable, y **respeto del sello sin pisar la marca del tenant (ADR-043)**.

### 5 · Referencias aprobadas (catálogo)
El catálogo vivo de plantillas de referencia está en **`docs/estrategia/diseno/README.md`**. Núcleo aprobado:
- **Backoffice Fable** claro + oscuro → **APROBADO, congelado**.
- **Frontends:** Tema A "Editorial" (Almacén Nuevo) · Tema B "Nítido" (Bazar Central) · front **MAGRA** ("Esto
  no es una carnicería") · réplica **MAGRA** ("Boutique de carnes envasadas al vacío · Canning") → **referencia**.

## Consecuencias

- **(+)** El diseño deja de re-litigarse: hay un **norte único** y un **backoffice congelado** que el Gate puede
  auditar objetivamente. Cierra el hueco que marcó el dueño.
- **(+)** Tematizar un tenant nuevo es cambiar **`--accent`** + su ficha de marca (RFC-004), no rediseñar → sostiene
  el alta self-serve del micro (ADR-058 P5 / ADR-065).
- **(+)** Coherencia de familia (mismos tokens en backoffice y tiendas) sin fork por pantalla (ADR-002).
- **(−)** Congelar Fable cuesta flexibilidad: una pantalla con necesidad legítima distinta debe **elevar un ADR**,
  no improvisar. Es el precio de la consistencia (aceptado).
- **(−)** La filosofía todavía **no está extraída a un design-system versionado** (ver [SUPUESTO] abajo): hoy vive
  como tokens en CSS + primitivos sueltos + estos HTML de referencia. Formalizarla es trabajo pendiente.

## Trade-offs honestos y supuestos

- **[SUPUESTO]** Los **tokens no están aún extraídos a un paquete/design-system versionado** con nombre y semver;
  viven como variables CSS (`--accent`, `--density`, `--space-*`) + primitivos (`PageHeader`, `SectionGroup`,
  `DataTable`, `KpiTile`…) introducidos en ADR-059/GROW-AR. Falta consolidarlos como fuente única versionada.
- **[SUPUESTO]** "Fable ganador en ambas variantes" se apoya en la evaluación del dueño y del equipo de diseño;
  **no hay aún un test/QA de accesibilidad formal** (contraste AA en claro y oscuro, foco de teclado del ⌘K)
  registrado como evidencia — el Gate de Excelencia (ADR-040, ángulo accesibilidad) debe levantar esa evidencia.
- **[SUPUESTO]** Los **6 HTML de referencia** (Fable claro/oscuro, Editorial, Nítido, front MAGRA, réplica MAGRA)
  **pueden no estar todos commiteados** en el repo al momento de este ADR — su estado real y ubicación se lleva
  en `docs/estrategia/diseno/README.md`; los faltantes están marcados ahí como pendientes de aportar.
- **Tensión Apple↔SAP:** minimalismo vs. densidad de datos es una tensión real. Se resuelve **por perfil**
  (`--density`, ADR-059), no eligiendo un bando: Comercio tiende a Apple; Empresa admite más SAP.

## Alternativas consideradas (y por qué no)

- **Dejarlo solo como ADR-069 (norte a nivel principio):** insuficiente — el dueño pidió el *cómo* concreto y el
  *por qué* del backoffice; un puntero no congela el patrón ni da vara al Gate.
- **Un design system por producto (Micro vs Empresa):** rompe la familia y duplica mantenimiento; se resuelve
  con **un** system y `--density` (ADR-059).
- **Backoffice libre por pantalla:** fue justamente la causa del "cada pantalla distinta"; congelar Fable lo cierra.

---

> **En una línea:** *Apple en la piel (Inter, aire, ⌘K, claro/oscuro, `--accent`), SAP en la profundidad
> (densidad y rigor por perfil); el backoffice "Fable" es el patrón congelado, y esta filosofía gobierna TODAS
> las plantillas — no es decoración por pantalla.*

— Elaborado por GSG (Diseño & Marca + Arquitecto de Solución)
