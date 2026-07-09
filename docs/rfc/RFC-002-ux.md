# RFC-002 · Revisión de UX/UI del ERP a fondo — Auditoría + direcciones de diseño

> **Etapa 1 (propuesta, NO implementación):** auditoría de UX experta sobre pantallas/código reales +
> RFC de direcciones de diseño para que el dueño elija. Sigue la filosofía GSG: ADR-driven, con Challenger
> (S5) y Gate; la implementación va **después**, detrás de flag + prototipos testeables.
>
> **Autor:** Diseño & Marca (GSG) · **Fecha:** 2026-07-09 · **Rama:** `claude/sprint-startup-generic-rf6x0m`.
> **Ancla:** ADR-058 (un Core, dos motores) · ADR-059 (reingeniería de interfaz: perfil, densidad, 5 grupos,
> primitivos, tier neutro) · ADR-044/046 (argentinizar / de-sesgo) · MP-14 (anti dead-end) · DX-6/DX-7 (la UI
> no debe mentir el dato). **Método:** barrido de las **22 pantallas** de `src/app/admin/(dashboard)`, los
> **11 primitivos** de `src/components/ui`, `globals.css` (tokens/densidad) y el `AdminShell`.

---

## 1. Auditoría de UX (estado real, con evidencia)

### 1.1 El hallazgo central: **el design system existe pero está aplicado a ~30%**
ADR-059 definió la reingeniería (primitivos, dos densidades, 5 grupos). La **fundación está construida**,
pero la **adopción en pantalla es parcial y de dos velocidades**:

| Señal | Evidencia (código real) |
|---|---|
| **Header inconsistente** | **5 de 22** pantallas usan el primitivo `PageHeader` (las 5 nuevas de Empresa: cuentas-a-pagar/cobrar, libros, inventario, devoluciones). Las **16 restantes hand-rollean** `<h1 className="text-2xl font-semibold">` (caja, pedidos, catálogo, clientes, turnos, reportes, usuarios…). |
| **Densidad INERTE** | `--density` + escala `--space-*` están en `globals.css`, pero **el layout NUNCA setea `data-density`** (solo `data-theme`). El propio comentario lo admite ("mientras nadie lo setee, `--density` queda en 1"). → La diferenciación **Comercio↔Empresa por densidad (ADR-059 D4) hoy NO existe**: ambos perfiles renderizan idéntico. |
| **Primitivos sub-usados** | `SectionGroup`: **0** pantallas. `DataTable`/`KpiTile`/`Card`: **1** cada uno. `EmptyState`: 7. Las pantallas legadas maquetan a mano con clases Tailwind sueltas. |
| **Formato de dinero duplicado** | **7** pantallas definen su propio `new Intl.NumberFormat("es-AR", {currency})` en vez del `fmtMoneyARS` que ya existe en `components/ui`. |
| **Padding/ancho ad-hoc** | legadas: `max-w-3xl/4xl px-6 py-8` fijo; nuevas: `max-w-5xl px-4 sm:px-6 py-6 sm:py-8` (responsive). Dos criterios conviviendo. |

**Consecuencia estratégica:** las pantallas de **uso diario del operador** (caja, pedidos, catálogo,
clientes, turnos) son **las MENOS modernizadas**; las nuevas de Empresa son las más pulidas. La experiencia
está invertida respecto del uso real.

### 1.2 Arquitectura de información
- **La IA de 5 grupos (ADR-059 D3) NO está viva por default:** `NAV_GROUPING_ENABLED` y `PROFILES_ENABLED`
  arrancan **OFF** → en producción el usuario ve la **nav plana de 17 ítems**, sin grupos ni perfil. La
  reingeniería de IA está construida pero **apagada**.
- **`Catálogo` está sobrecargado:** una sola página apila **7 secciones** (Boxes · Servicios · Recursos ·
  Productos · Profesionales · Asignación · Cupones) en `space-y-10`. Es **servicios-céntrico**: para una
  carnicería (Magra) muestra Boxes/Profesionales/Servicios que no usa → ruido + scroll largo + mezcla de
  conceptos (catálogo de venta vs. recursos operativos vs. cupones de marketing).

### 1.3 Flujos clave (fricción)
- **Venta/Caja:** `caja` (238 líneas) está bien modelada (apertura/arqueo/cierre) pero es **texto-pesada**
  (un párrafo explicativo largo arriba) y **no hay un POS de una pantalla**: vender (pedidos) y cobrar (caja)
  viven separados. Para el mostrador de alto volumen, es fricción.
- **Alta de productos/clientes:** dispersa dentro del mega-`catálogo`; no hay "quick-add" en el camino de
  venta (cargar un producto nuevo obliga a salir del flujo).
- **Cobros/fiado, compras, reportes, libros:** las nuevas (cuentas a pagar/cobrar, libros, inventario) están
  **prolijas y consistentes** (usan PageHeader/EmptyState/DataTable) — son el estándar a replicar, no el
  problema.
- **Reportes** (408 líneas) es la pantalla más pesada; densa en datos pero **sin la densidad tokenizada** ni
  DataTable uniforme → riesgo de inconsistencia visual y de mobile.

### 1.4 Jerarquía visual y consistencia
- Sin `PageHeader` uniforme, **cada pantalla define su propia jerarquía de título/descripción** (tamaños,
  color `text-muted` vs `text-faint`, márgenes). No hay un ritmo visual único.
- **Tokens sí, pero no en las pantallas:** los colores semánticos (`text-strong`, `surface-raised`, etc.) SÍ
  se usan (bien); el problema es el **layout/espaciado artesanal** por fuera de la escala `--space-*`.

### 1.5 Mobile
- **El shell resuelve mobile bien:** drawer con hamburguesa, top-bar sticky, cierra al navegar y con Escape,
  `max-w-[80%]`. Es una **fortaleza**.
- **A nivel pantalla, es despareja:** solo las nuevas traen padding responsive; las legadas usan `px-6` fijo.
  Las pantallas de tabla (reportes, caja, listados) necesitan una estrategia mobile explícita (scroll
  horizontal contenido / cards) que hoy no es uniforme.

### 1.6 Onboarding / primer uso
- **No hay un primer-uso guiado.** Un tenant nuevo entra a un Dashboard con KPIs en cero y 17 ítems; los
  `EmptyState` existen (7 pantallas) pero **no hay un hilo conductor** ("cargá tu primer producto → hacé tu
  primera venta → configurá tu negocio"). El micro self-serve (el que debe rendir sin mano de obra, `costos
  §2`) es justo el que más necesita ese hilo.

### 1.7 Comercio vs Empresa (la diferencia de experiencia)
- **Hoy la diferencia es mínima y frágil:** el home analítico por rol (P1.c, ✅ real) + los 5 ítems Empresa
  (detrás de flag) + la profundización de Compras/Reportes. **La densidad —el diferenciador visual primario
  que ADR-059 D4 diseñó— está apagada.** → Con los flags default-off, **Comercio y Empresa se ven casi
  iguales**. La promesa "dos motores" está **sub-entregada en la experiencia**.

---

## 2. Problemas priorizados (por impacto)

| # | Problema | Evidencia | Impacto | Sev |
|---|---|---|---|---|
| **P1** | **Adopción del design system a ~30%** — dos velocidades de UX; lo diario es lo menos pulido | 5/22 con PageHeader; SectionGroup 0; money-format ×7 | Inconsistencia percibida en todo el producto; deuda que crece con cada pantalla nueva | 🔴 Alta |
| **P2** | **Densidad inerte** → Comercio/Empresa se ven iguales | layout no setea `data-density`; `--space-*` sin usar | La promesa "dos motores"/anti-rechazo enterprise no se percibe (ADR-059 D4/D8) | 🔴 Alta |
| **P3** | **IA de 5 grupos + perfil apagados por default** | flags OFF → nav plana de 17 | La reingeniería de IA no llega al usuario real | 🔴 Alta |
| **P4** | **Catálogo sobrecargado y no rubro-aware** | 7 secciones apiladas, servicios-céntrico | Ruido para retail (Magra ve Boxes/Profesionales), scroll largo, fricción de alta | 🟠 Media |
| **P5** | **Sin POS de una pantalla / quick-add en el camino de venta** | pedidos y caja separados; alta solo en catálogo | Fricción en el mostrador de alto volumen | 🟠 Media |
| **P6** | **Sin primer-uso guiado** | KPIs en cero, sin hilo conductor | El micro self-serve arranca sin asistencia — sube la mano de obra | 🟠 Media |
| **P7** | **Mobile despareja a nivel pantalla** | padding fijo en legadas; tablas sin estrategia uniforme | Riesgo en el uso real (el dueño opera desde el celular) | 🟡 Media-baja |
| **P8** | **Jerarquía/descripción inconsistentes** | `text-muted` vs `text-faint`, tamaños ad-hoc | Falta de ritmo visual; lee "artesanal", no "plataforma" | 🟡 Media-baja |

---

## 3. Direcciones de diseño (2–3 conceptos distintos, comparables)

> No son pixel-perfect: son **principios + concepto**. Se pueden componer, pero cada una PRIORIZA a un
> usuario y a un problema distinto. La elección define el eje rector.

### Dirección A · "Operación primero" (velocidad para el operador)
- **Idea central:** el backoffice se usa **muchas veces al día bajo presión de tiempo**. Optimizar para
  **velocidad y memoria muscular** en las 3–4 tareas calientes (vender, cobrar, cargar cliente/producto).
- **Qué mejora:** P5 (fricción del camino de venta), P1 en las pantallas diarias. Densidad **compacta**
  siempre (también Comercio), teclado-first, quick-add inline.
- **A quién prioriza:** el **operador/recepción/mostrador** (uso intensivo).
- **Cómo se ve (4 pantallas):**
  - **Home:** *lanzadera del día* — cola de tareas (turnos de hoy, pedidos pendientes, caja abierta) +
    botón sólido "Vender" siempre visible. Menos analítica, más acción.
  - **Caja+Pedidos → POS unificado:** una sola pantalla vender→cobrar, atajos de teclado, sin saltar.
  - **Catálogo:** quick-add inline (agregar un producto sin salir del flujo de venta).
  - **Listados:** tablas densas, acciones por fila, filtros rápidos.
- **Trade-off:** menos "premium/analítico" para Empresa; el micro no-experto puede sentirlo denso.

### Dirección B · "Claridad guiada" (que se enseñe solo)
- **Idea central:** el producto debe sentirse **obvio y auto-explicativo**. Jerarquía fuerte, espacio
  generoso (densidad lite), **una acción principal por pantalla**, estados vacíos que guían, **primer-uso
  acompañado**.
- **Qué mejora:** P6 (onboarding), P8 (jerarquía), P7 (mobile-first), comprensión del micro.
- **A quién prioriza:** el **dueño micro/Comercio no-experto** y el **primer uso** (self-serve).
- **Cómo se ve (4 pantallas):**
  - **Home:** *próximo paso* — tarjetas guía ("Cargá tu primer producto", "Hacé tu primera venta",
    "Completá los datos de tu negocio") que desaparecen al completarse.
  - **Catálogo:** progresivo — arranca con lo mínimo del rubro; lo avanzado se revela on-demand.
  - **Onboarding:** checklist de primer-uso (overlay) atado al estado real del tenant.
  - **Formularios:** grandes, criollos, con ayuda contextual; 44px táctil real.
- **Trade-off:** el usuario experto/alto volumen puede encontrarlo lento; menos denso ⇒ más scroll.

### Dirección C · "Plataforma con carácter" (sistema coherente + credibilidad Empresa) — *terminar ADR-059 en serio*
- **Idea central:** llevar **TODO** el producto a un **único sistema aplicado de verdad**: cada pantalla en
  primitivos, **las dos densidades VIVAS** (Comercio espacioso ↔ Empresa denso/data-first), 5 grupos y perfil
  **encendidos**, `DataTable` uniforme. La diferenciación se vuelve **real y percibible**.
- **Qué mejora:** P1, P2, P3, P8 (la raíz de la deuda) + el anti-rechazo enterprise (ADR-059 D8) y la
  mantenibilidad para un equipo chico.
- **A quién prioriza:** el **comprador pyme/Empresa** (credibilidad) + la **coherencia y mantenibilidad**.
- **Cómo se ve (4 pantallas):**
  - **Todas:** migradas a `PageHeader`/`SectionGroup`/`DataTable`/`fmtMoneyARS` → un ritmo visual único.
  - **Reportes/Libros:** densos, data-first (densidad Empresa), tablas ordenables uniformes.
  - **Home:** analítico por rol en Empresa (ya existe) vs. curado en Comercio, ahora **también** distinto en
    **densidad y espacio**.
  - **Shell:** 5 grupos + badge de edición **encendidos por default** (tras Gate) — la IA reingenierada llega
    al usuario.
- **Trade-off:** es el **refactor más ancho** (muchas pantallas); menos novedad de interacción, más disciplina
  de sistema.

### Comparación
| | Concepto | Prioriza | Ataca sobre todo | Esfuerzo | Riesgo |
|---|---|---|---|---|---|
| **A** | Velocidad operador | operador/mostrador | P5, fricción diaria | medio | medio (rediseña flujos calientes) |
| **B** | Claridad + onboarding | micro/primer uso | P6, P8, mobile | medio | bajo-medio |
| **C** | Sistema coherente | pyme/consistencia | P1, P2, P3 (la raíz) | alto (ancho) | bajo por pantalla, alto por volumen |

---

## 4. Principios de UX del producto (base durable)

1. **Un Core, una experiencia.** Un solo design system aplicado en TODAS las pantallas — nunca dos tiers de
   calidad de UX (mata P1 de raíz).
2. **El perfil se SIENTE, no se dice.** La diferencia Comercio/Empresa es **densidad + profundidad +
   analítica**, en **canal neutro** (el acento es del tenant, ADR-059 D5/D7). "Lite = de segunda" está
   prohibido.
3. **Crecé sin migrar, también en la UX.** Subir de perfil **enciende/densifica**, nunca reubica ni esconde
   lo que ya usabas (invariante `enterprise ⊇ lite`).
4. **Una acción principal por pantalla.** Jerarquía clara; lo secundario cede (home de una acción vs.
   analítico por rol, D8).
5. **Anti-fricción en el camino caliente.** Las tareas diarias (vender/cobrar/cargar) optimizadas para
   velocidad y memoria muscular.
6. **Se enseña solo.** Estados vacíos que guían, primer-uso acompañado, lenguaje **criollo claro**
   (ADR-044/046); el micro self-serve no depende de mano de obra.
7. **Mobile y accesibilidad son piso, no extra.** 44px táctil, contraste AA, responsive real **por pantalla**
   (no solo el shell).
8. **Cero callejón sin salida, cero dato que miente.** MP-14 + DX-6/DX-7: lo que se muestra existe y es
   verdadero; nada de ítems a rutas inexistentes ni cifras que no cuadran con la fuente.
9. **Tokens, no hex; primitivos, no artesanal.** Consistencia por construcción, mantenible por un equipo de 3.

---

## 5. Recomendación

**Eje rector: Dirección C (terminar el sistema en serio), con los principios de A aplicados al camino
caliente y el onboarding de B como workstream acotado.** Por qué:

- **C ataca la RAÍZ (P1+P2+P3):** el mayor problema no es falta de ideas de interacción, sino que **la
  reingeniería ya diseñada (ADR-059) está a medio aplicar y apagada**. Encender la densidad, migrar las
  pantallas a primitivos y prender la IA de 5 grupos + perfil entrega el 80% del valor percibido y **hace que
  la promesa "dos motores" por fin se vea** — sin inventar nada nuevo, solo cumpliendo el ADR vigente.
- **A y B no compiten con C, la afinan:** una vez que todas las pantallas están en el sistema (C), aplicar
  "velocidad" (A) a Caja/Pedidos/Catálogo y "claridad guiada" (B) al primer-uso son **capas encima**, no
  rediseños paralelos. Hacerlas antes de C sería pulir sobre una base despareja.
- **Encaja con el equipo chico y la filosofía:** C es disciplina de sistema (tokens/primitivos), lo más
  mantenible por 3 personas; respeta ADR-058/059 al pie y es medible (adopción de primitivos %, densidad
  viva, flags on tras Gate).

**Secuencia sugerida (para la Etapa 2, detrás de flag + Gate + prototipos):**
1. **C-core:** encender `data-density` en el layout + migrar las **5 pantallas diarias** (caja, pedidos,
   catálogo, clientes, turnos) a `PageHeader`/primitivos/`fmtMoneyARS`. Prototipo testeable Comercio vs
   Empresa lado a lado.
2. **C-full:** resto de pantallas + `DataTable` uniforme + prender 5 grupos/perfil por default (tras Gate).
3. **A-hot:** POS de una pantalla + quick-add (camino caliente).
4. **B-onboarding:** primer-uso guiado + catálogo rubro-aware/progresivo.

> **Métrica de éxito (durable):** adopción de `PageHeader`/primitivos = **100%** de pantallas; `data-density`
> vivo y verificable (Comercio ≠ Empresa en captura); 0 pantallas con money-format propio; flags de IA on por
> default tras Gate; QA mobile por pantalla en verde.

---

## 6. Qué NO decide este RFC (para el Challenger / dueño)
- **La elección del eje** (C+A+B como propongo, o priorizar A o B primero) — decisión del dueño.
- **Prender los flags por default** (IA de 5 grupos + perfil) es cambio de comportamiento visible → va con su
  **Gate** y prototipo, no en este RFC.
- **Nada se implementa acá:** este RFC es propuesta. La Etapa 2 es flag + prototipos testeables + Gate (Opus),
  con S5 como Challenger de estas direcciones primero.

— Elaborado por GSG (Diseño & Marca) · RFC, doc-only · para decisión del dueño + Challenger (S5).
