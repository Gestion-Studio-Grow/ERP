---
id: ADR-073
nivel: fundacional
dominio: [Diseño, Arquitectura, Producto, Negocio]
depends_on: [ADR-002, ADR-033, ADR-034, ADR-042, ADR-054, ADR-055, ADR-072]
---
# ADR-073: Personalización de diseño por tenant — SOLO configuración, nunca fork (+ "Creative Grow")

**Estado:** Aceptado — **fundamento de producto/arquitectura/negocio**. Fija la **frontera** de lo que el producto
hace y no hace por cliente en materia de diseño, y **de qué se cobra**. Complementa el enfoque de diseño (ADR-072)
con la regla de sustentabilidad del modelo config-sobre-código (ADR-002).
**Fecha:** 2026-07-10
**Depende de:** ADR-002 (Core/Blueprint/Plugin: config, cero schema por cliente), ADR-033 (copia exacta ↔ auditoría),
ADR-034 (preset por IA), ADR-042 (autorización de marca), ADR-054 (catálogo de módulos), ADR-055 (variante),
ADR-072 (enfoque de diseño)
**Relacionado:** RFC-004 (detección de marca por IA / ficha de marca) · `docs/estrategia/diseno/fuentes/GSG_Decision_Personalizacion_Diseno.md`
(documento decision-grade fuente) · `docs/estrategia/comercial-fundacional-mariano.md` (Creative Grow en la oferta)
**Fuente:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10); este ADR formaliza la tesis que ese
documento propuso explícitamente.

---

## Contexto

GSG es un ERP multi-tenant con **equipo 100%-IA** cuya sustentabilidad depende de **no bifurcar el código por
cliente** (ADR-002). Hay demanda real de **identidad visual propia**, incluida la **réplica de sitios existentes**
(caso disparador: Magra, autorizado por su dueño — ADR-042). La pregunta del dueño: *"¿un cliente que quiere su
diseño propio entra en los estándares fundacionales, y si no, lo cobramos como servicio?"*

La respuesta preserva la escala **sin cerrar la puerta al negocio**: la línea fundacional **no** es "estándar vs.
propio", es **"configuración/datos vs. código bifurcado por cliente"**.

## Decisión

> **La personalización de diseño se expresa EXCLUSIVAMENTE como configuración y assets versionados por tenant; el
> código compartido NUNCA se bifurca por cliente. Toda necesidad no cubierta por la configuración se resuelve
> ELEVANDO una nueva primitiva al Core, disponible para todos — nunca resolviéndola para un solo cliente.**

### La frontera de 3 niveles
- **Nivel A — Ficha de marca estándar (INCLUIDA):** tokens básicos (paleta/tipografía/logo), variante de layout del
  catálogo, autocompletado por **detección IA** (RFC-004). Costo marginal por tenant ≈ 0. Autoservicio.
- **Nivel B — Config rica / custom (PERMITIDA, sin código por cliente):** el "diseño propio" que **sigue siendo
  dato** — tokens extendidos (radios/sombras/espaciados/tipografía por rol), **composición de layout por slots**
  desde un catálogo de bloques parametrizables, **assets del tenant**, **CSS-por-tenant como DATO scopeado**
  (namespacing + allowlist, sandboxeado). Dos tenants pueden verse **completamente distintos ejecutando el mismo
  código**.
- **Nivel C — Código a medida por cliente (PROHIBIDO):** `if (tenant === X)`, componentes/archivos exclusivos, forks
  de bundle/deploy, lógica de render por tenant. Rompe el apalancamiento "mejorar una vez, beneficia a todos".

**Regla de conversión C→B:** ante la tentación de C, preguntar *"¿cómo lo convierto en una primitiva reutilizable?"*
→ se construye en Core una vez y baja a B; si genuinamente no es generalizable, está **fuera del producto**.

**Réplica de sitio existente = Nivel B** (no C): es "réplica de **identidad y estructura** con alta fidelidad", **no**
clonado pixel-perfect del markup ajeno (frágil, sin valor de producto, riesgo de autoría — se **descarta**; alinea
con ADR-033). Estimado ~80–90% del caso Magra es config; el resto alimenta primitivas de Core.

### Frontera comercial — "Creative Grow"
- **Identidad Estándar (Nivel A):** **incluida** en el plan.
- **Identidad a Medida — "Creative Grow" (Nivel B):** **paga** (setup one-time + fee mensual de mantenimiento);
  entregada como **config + assets aislados del Core**, con revisión IA + humana. **[SUPUESTO]** rangos ilustrativos
  del doc fuente (setup USD 300–900 · mensual USD 15–40) → **calibrar** con costos reales y disposición a pagar.
- **Efecto de plataforma:** cada proyecto Creative Grow **enriquece el catálogo compartido** de bloques/presets → el
  add-on premium **financia la I+D del Core** en vez de fragmentarlo.

## Consecuencias
- **(+)** Se preserva el apalancamiento y el costo marginal por tenant acotado; escala con equipo IA.
- **(+)** Se abre una línea de ingreso premium (Creative Grow) que financia el Core.
- **(−)** Exige invertir en un **motor de theming rico** (tokens extendidos + slots + CSS-dato scopeado) y en su
  **gobernanza** (sandboxing/allowlist). **[SUPUESTO]** el estado real de ese motor **no está verificado en código**
  en este ADR (ver Anexo).
- **(−)** Pedidos que empujan a C (clonado pixel-perfect, feature no generalizable) quedan **fuera de alcance** —
  límite deliberado del producto.

## Invariantes verificables (GATES)
1. **Ningún build contiene identificadores de tenant en ramas de render** (test de arquitectura: grep anti
   `tenant === ` en el bundle de render).
2. Todo estilo por tenant reside en **config/assets versionados**.
3. El **CSS-dato está scopeado** y no puede afectar a otros tenants ni al shell.
4. Toda primitiva creada por un proyecto Creative Grow queda en el **catálogo compartido** (ADR-054).

## Alternativas consideradas (y por qué no)
- **Cobrar "diseño propio" como código a medida (fork por cliente):** mata la economía config-sobre-código (N bases
  divergentes). Rechazado.
- **Negar toda identidad más allá de la ficha básica:** deja plata sobre la mesa y no responde la demanda real.
- **Clonado pixel-perfect del sitio del cliente:** frágil, sin valor de producto, riesgo de autoría (ADR-033). Rechazado.

## Anexo — supuestos abiertos
- **[SUPUESTO]** La arquitectura del motor de theming (tokens extendidos, slots, CSS-dato scopeado) se asume por la
  descripción del dueño; **no verificada contra el código real** — determina qué del caso Magra es config inmediata
  vs. inversión de Core. Ver `docs/estrategia/diseno/fuentes/GSG_Decision_Personalizacion_Diseno.md` §Apéndice.
- **A confirmar:** existencia/estado del catálogo de bloques + soporte de CSS-dato scopeado.

---

> **En una línea:** *la unidad de personalización es el DATO, no el código; el diseño propio vive como config+assets
> versionados por tenant (nunca fork), y la identidad de alta fidelidad se cobra como "Creative Grow" — que además
> financia las primitivas que sirven a todos.*

— Elaborado por GSG (Arquitecto de Solución + Diseño & Marca + Agencia Digital)
