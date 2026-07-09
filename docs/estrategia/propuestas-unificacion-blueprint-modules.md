# 🔀 FU1 — Unificar `defaultModulesForBlueprint`: propuestas de concepto (para elegir)

> **Qué es:** menú de opciones —cada una con un CONCEPTO distinto— para cerrar el follow-up **FU1**: hoy hay
> **dos definiciones con drift real** de "qué módulos trae un blueprint por defecto". El dueño elige el
> concepto; **este doc NO implementa** (no toca código de producción).
>
> **Autor:** Arquitecto de Solución (GSG) · **Fecha:** 2026-07-09 · **Rama:** `claude/sprint-startup-generic-rf6x0m`.

---

## 1. El problema, con evidencia

Dos funciones homónimas resuelven lo mismo por caminos distintos:

| | `src/blueprints/presets-meta.ts:94` | `src/lib/operator-config.ts:50` |
|---|---|---|
| **La consume** | la **consola de operador** (page.tsx) — para el CONTEO derivado (OP-2) | `operator-actions.ts` — el **provisioning REAL** (persiste `Tenant.modules`) |
| **Orden de lookup** | preset de familia → retail (`retailLiteModules`) → legacy servicios → `[]` | mapa hardcodeado `BLUEPRINT_DEFAULT_MODULES` → preset de familia → `DEFAULT_MODULES` |
| **Fallback desconocido** | **`[]`** (vacío) | **`["catalog","clients","pos","reports"]`** |

**Drift concreto (mismo blueprint, distinto resultado según qué función resuelva):**
- **`servicios`:** operator-config → 7 módulos **incluye `commissions`**; presets-meta → 6 (sin `commissions`).
- **`generico`:** operator-config → `catalog,clients,pos,agenda,reports` (5); presets-meta → **`[]`**.
- **rubro desconocido:** operator-config → 4 (DEFAULT_MODULES); presets-meta → **`[]`**.
- **`carniceria`:** ✅ ya coinciden (`pos,catalog,clients,reports,arca`) tras el fix del set lite por rubro.

**Consecuencia:** lo que la consola MUESTRA que un tenant recibiría puede diferir de lo que el alta le
ASIGNA. Y el fallback distinto significa que un rubro nuevo/no modelado nace con módulos distintos según el
camino. **La fuente de verdad está partida en dos.**

**Contexto que acota las opciones:** `src/modules/activation.ts` (`asignacionSugerida`) se declara "el
reemplazo rubro-consciente del `defaultModulesForBlueprint` legado" — **pero es un FILTRO** (toma un set
propuesto y descarta lo incompatible con el rubro); **NO sabe el set por rubro** ("eso lo saben los
blueprints/presets"). Es decir: la capa de módulos delega la pregunta "¿qué set por rubro?" de vuelta al
blueprint. **Cualquier solución necesita UNA fuente del set en la capa blueprint** — la activación solo la
constrañe, no la reemplaza.

---

## 2. Propuestas (conceptos distintos)

### A · Función canónica en capa compartida (una fn, dos importadores)
- **Idea central:** dejar UNA sola implementación de `defaultModulesForBlueprint` en un módulo compartido
  liviano (p. ej. `src/blueprints/module-defaults.ts`); `operator-config.ts` **borra su copia** y re-exporta
  la canónica. Se unifican también los datos: `BLUEPRINT_DEFAULT_MODULES` se funde en la fuente canónica.
- **Cómo elimina el drift:** hay un solo cuerpo de función y un solo fallback → imposible divergir.
- **Archivos:** nuevo `module-defaults.ts` (o se elige `presets-meta` como hogar) · `operator-config.ts`
  (borra fn + mapa, importa) · consumidores quedan igual (mismo nombre).
- **Fallback desconocido:** se decide UNO explícito. Recomendado: set mínimo funcional
  `["catalog","clients","pos","reports"]` (el alta necesita un tenant que opere; el "0 honesto" de la consola
  ya se resuelve con su flag `derived`).
- **Pros:** el cambio más chico que MATA el drift hoy; riesgo mínimo; sin plumbing nuevo.
- **Cons:** unifica la FUNCIÓN pero los DATOS siguen en 2-3 formas (mapa + preset meta + retail) salvo que se
  fundan; no aporta garantía contra un futuro tercero que vuelva a bifurcar.
- **Riesgo:** bajo · **Esfuerzo:** chico.

### B · Registro DECLARATIVO blueprint→módulos (una tabla-dato única)
- **Idea central:** una sola **tabla plana** `BLUEPRINT_MODULES: Record<BlueprintId, ModuleId[]>` que enumera
  explícito el set de CADA blueprint/rubro; el resolver es un lookup puro sin lógica de orden. Los sets de
  familia/retail se materializan en esa tabla (o se generan de los rubro-configs al cargar, en un solo lugar).
- **Cómo elimina el drift:** una tabla = una respuesta por blueprint; no hay orden de lookup que pueda diferir.
- **Archivos:** nuevo `src/blueprints/blueprint-modules.ts` (tabla + resolver) · `presets-meta.ts` y
  `operator-config.ts` borran sus mapas/fns e importan · rubro-configs pueden alimentar la tabla.
- **Fallback desconocido:** una constante explícita declarada UNA vez en el resolver de la tabla.
- **Pros:** modelo mental trivial ("¿qué recibe X? leé la fila"); auditable de un vistazo; sin bugs de orden.
- **Cons:** hay que enumerar cada rubro (retail 8 + familias N); si el rubro-config YA lleva su `modules`,
  aparece doble mantenimiento (dos lugares por rubro) salvo que se genere desde uno.
- **Riesgo:** medio (reconciliar con los `modules` por-rubro existentes para no crear un drift nuevo) ·
  **Esfuerzo:** medio.

### C · El blueprint es DUEÑO de sus módulos (campo tipado + comodín explícito)
- **Idea central:** cada Blueprint/rubro declara su `defaultModules` como **campo tipado del propio objeto
  Blueprint** (junto a su catálogo/wording/branding). El resolver es `getBlueprint(id).defaultModules`; el
  desconocido cae al **comodín `generico`** que YA existe (`FALLBACK_BLUEPRINT_ID` en `index.ts`).
- **Cómo elimina el drift:** la fuente de verdad es el objeto blueprint; hay exactamente un campo por
  blueprint; el resolver es una lectura pura, sin mapas paralelos.
- **Archivos:** `blueprints/types.ts` (agrega `defaultModules` al tipo) · cada blueprint/rubro-config setea
  el campo · `index.ts` (resolver + fallback al comodín) · borra ambas fns/mapas legados.
- **Fallback desconocido:** el **comodín `generico`** ya es el mecanismo del sistema — su `defaultModules` es
  el fallback único, explícito y colocado.
- **Pros:** colocación (cambiar un rubro se hace en UN lugar); reusa el registry + comodín existentes; sin
  tablas sueltas; encaja con el grano "el blueprint es dueño de su config".
- **Cons:** toca la definición de cada blueprint/rubro (edición ancha); la familia retail "comparte un set"
  necesita una forma de compartir sin repetir por rubro; ojo con confundir el `capabilities` documental
  existente con `defaultModules` (dejarlos separados y claros).
- **Riesgo:** medio · **Esfuerzo:** medio.

### D · Type-safe con exhaustividad (el compilador exige cubrir cada blueprint)
- **Idea central:** un tipo unión `BlueprintId` (derivado de `BLUEPRINT_IDS`) y un `Record<BlueprintId,
  ModuleId[]>` con `satisfies` (o un `switch` con chequeo `never`): **agregar un blueprint sin su set es un
  error de compilación**. `ModuleId` también se tipa (unión de `MODULE_IDS`) para vetar módulos inexistentes.
- **Cómo elimina el drift:** estructuralmente hay UNA sola mapa exhaustiva; el compilador prohíbe olvidar un
  blueprint y —al haber un solo lugar tipado— desalienta una segunda definición divergente.
- **Archivos:** unión `BlueprintId` + `ModuleId` · un `Record<BlueprintId, ModuleId[]> satisfies` · resolver ·
  borra legados.
- **Fallback desconocido:** como `blueprintId` entra como `string?` libre (viene del descubrimiento de rubro),
  la exhaustividad cubre el set MODELADO; el input desconocido/null pasa por una rama con **un default
  explícito** (constante única). La garantía del compilador aplica a lo modelado, no al texto libre.
- **Pros:** la garantía más fuerte contra drift futuro y contra olvidar un blueprint nuevo.
- **Cons:** `blueprintId` libre limita la exhaustividad real; exige mantener la unión `BlueprintId` en sync;
  más maquinaria de tipos por adelantado.
- **Riesgo:** medio (plumbing de tipos) · **Esfuerzo:** medio.

### E · Converger en la capa de módulos (activación como SoT, deprecar el helper)
- **Idea central:** retirar `defaultModulesForBlueprint` legado y que el **sistema de módulos** (ADR-054,
  `activation.ts`) sea la única vía: el set por rubro se declara como `preferidos` del catálogo y
  `asignacionSugerida` lo filtra por compatibilidad. Un solo pipeline alta→módulos.
- **Cómo elimina el drift:** ambos consumidores pasan a llamar al mismo resolver del registry; no quedan
  funciones legadas que diverjan.
- **Archivos:** definir los `preferidos` por rubro (de dónde salen hoy los sets) dentro del catálogo/descriptores ·
  `operator-actions.ts` y la consola migran a `asignacionSugerida` · borrar ambos legados.
- **Fallback desconocido:** lo define el rubro-comodín del catálogo (o un `preferidos` base) — una vía única.
- **Pros:** alinea con la dirección ya declarada (activation = "reemplazo del legado"); un solo pipeline;
  respeta la variante (anti "todos con todo").
- **Cons:** **la activación es un FILTRO, no la fuente del set** → igual hay que declarar el set por rubro en
  algún lado (se combina naturalmente con A/B/C para la fuente). Es el cambio más ancho; toca el alta.
- **Riesgo:** medio-alto (toca provisioning) · **Esfuerzo:** medio (grande si se hace completo).

---

## 3. Comparación rápida

| | Concepto | Unifica FUNCIÓN | Unifica DATO | Garantía anti-drift futuro | Riesgo | Esfuerzo |
|---|---|---|---|---|---|---|
| **A** | Fn canónica compartida | ✅ | parcial | débil (convención) | bajo | chico |
| **B** | Tabla declarativa única | ✅ | ✅ | media (un lugar) | medio | medio |
| **C** | Blueprint dueño (tipado) | ✅ | ✅ (colocado) | media | medio | medio |
| **D** | Exhaustividad de compilador | ✅ | ✅ | **fuerte** (compila-o-no) | medio | medio |
| **E** | Activación como SoT | ✅ | — (necesita fuente) | media | medio-alto | medio+ |

---

## 4. Recomendación

**Dos pasos: A ahora → C como destino (con el sabor tipado de D).**

1. **Ya (chico, riesgo bajo): concepto A.** Cierra el sangrado HOY — una función, un fallback explícito
   (`catalog/clients/pos/reports`), borrando la copia de `operator-config`. Elimina el drift funcional que
   puede morder en el alta con el mínimo blast radius, sin comprometer el diseño final.
2. **Después (durable): concepto C, tipando el campo al estilo D.** El blueprint dueño de su `defaultModules`
   es el grano correcto del repo (el blueprint YA es dueño de su catálogo/branding/wording) y da colocación
   real; agregarle el `satisfies BlueprintId`/`ModuleId` de D lo blinda contra olvidos futuros. El comodín
   `generico` ya provee el fallback único.

**Por qué NO B ni E como primer movimiento:** **B** crea una tabla paralela a los `modules` que los
rubro-configs ya insinúan (riesgo de un drift nuevo si no se genera desde una sola fuente) — C evita eso
colocando el set EN el rubro. **E** es la dirección estratégica (la activación filtra), pero **no aporta la
fuente del set** por sí sola: conviene que la fuente sea C y que la activación (E) la consuma como filtro —
son complementarias, no excluyentes. Sobre-invertir en E ahora, antes de tener la fuente unificada, es
resolver el filtro sin resolver el origen.

> **En una línea:** *matá el drift ya con una función canónica (A); consolidá la verdad en el blueprint mismo,
> tipado (C+D); dejá que la capa de módulos (E) lo filtre por rubro — sin construir una tabla paralela (B).*

— Elaborado por GSG (Arquitecto de Solución) · doc-only, para decisión del dueño.
