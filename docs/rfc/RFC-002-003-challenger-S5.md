# 🥊 Challenger (ADR-045) — RFC-002 (UX) y RFC-003 (alta de tenants)

> **Rol:** Challenger / red-team (S5, Opus). Postura opuesta con el mismo rigor, **anclado en el repo**, sin
> complacencia. Tensiona ANTES de que el dueño elija/construya. **No implementa, no merge.**
> **Método:** verifiqué las anclas fuertes de cada RFC en el código real (citadas abajo). **Fecha:** 2026-07-09.

---

## RFC-002 · UX del ERP — la recomendación (C como eje) **NO se sostiene tal cual: está mis-frameada**

### Los challenges más fuertes

**Ch-1 · Sesgo de completitud (el más importante).** La propia RFC titula C *"terminar ADR-059 en serio"*.
Eso es un **tell**: el eje elegido es *"terminar lo que ya diseñamos"*, no *"lo de mayor impacto para el
usuario diario / la venta"*. La justificación de C ("ataca la raíz P1+P2+P3") confunde **deuda de sistema
(interna)** con **valor de usuario**. Migrar `clientes.tsx` de un `<h1>` a `PageHeader` **el usuario no lo
percibe** — le importa que vender→cobrar sea rápido y que entienda la pantalla.

**Ch-2 · La métrica delata el sesgo.** La métrica de éxito propuesta es *"adopción de PageHeader/primitivos =
100%"*. Es una **métrica de desarrollador**, no de negocio. Un RFC de UX que recomienda un refactor ancho y se
mide por "% de primitivos" está optimizando **mantenibilidad**, no **tiempo-de-tarea, conversión de demo, ni
carga de soporte**. Ausentes: task-time del camino caliente, tasa de self-serve completado, demo→interés.

**Ch-3 · Con 0 clientes pagos, los verdaderos leverage están sub-ponderados.** El estado real (anclado en la
sesión): producto construido, go-live a un OK de §C, y la palanca de valor es **vender + primer cliente**
(ADR-030). Los tres leverage reales:
- **(a) Hacer VISIBLE el diferenciador** — hoy `data-density` está **inerte** (verificado: `layout.tsx` setea
  `data-theme` pero **nunca `data-density`**), así que Comercio y Empresa **se ven iguales**. Encender densidad
  es una **rebanada barata de C con impacto de VENTA** (anti-rechazo enterprise, D8). *Esto sí vale — pero es
  1 slice, no "migrar 22 pantallas".*
- **(b) Velocidad del operador diario** (A) → retención. La RFC **admite** que "lo diario es lo menos
  modernizado; la experiencia está invertida". El POS de una pantalla / quick-add ataca eso directo.
- **(c) Self-serve del micro** (B) → **protege el cuello de mano de obra** (`costos §4`, el límite real del
  negocio). **No hay primer-uso guiado (verificado).** Si el micro no se auto-onboardea, la economía de
  volumen se rompe. **B tiene un argumento de COSTO, no solo de UX.**

**Ch-4 · La priorización sub-pondera lo rubro-aware, y los clientes cercanos son RETAIL.** P4 (Catálogo
sobrecargado, servicios-céntrico) está en **Media**, pero los demos/altas cercanos (Magra=carnicería,
adosmanos=retail) **verían Boxes/Profesionales/Servicios que no usan** → **mata la credibilidad en la demo**.
Para el camino de venta, un Catálogo rubro-aware pesa **más** que migrar `clientes.tsx` a primitivos.

**Ch-5 · El activo de venta está enterrado.** El "prototipo Comercio vs Empresa lado a lado" (sub-bullet de
C-core) **ES el material de venta del diferenciador** — debería ser un objetivo de primer nivel, no un paso
técnico.

### ¿Se sostiene la recomendación? — **CAMBIA (de eje a estándar)**
C **no es el eje**, es el **estándar** (ya está en los Principios #1 y #9: "un solo design system", "primitivos
no artesanal"). Como *secuencia*, C-full (migrar las 16 pantallas legadas) es **el tramo de menor valor de
usuario y mayor esfuerzo**, y la RFC lo pone de titular. La secuencia de **mayor valor** invierte el orden:

1. **Densidad ON + las 5 pantallas diarias** (la intersección A ∩ C-core) — hace visible el diferenciador
   (venta) **y** arregla lo diario (retención), barato.
2. **Catálogo rubro-aware (P4)** — antes de la migración ancha, porque los demos cercanos son retail.
3. **Onboarding / primer-uso (B)** — protege el cuello de mano de obra (`costos §4`).
4. **POS/quick-add (A)** — camino caliente de alto volumen.
5. **Migración del resto (C-full)** — **higiene "touch-it-migrate-it"** (cada pantalla que se toca se migra),
   **no** un refactor dedicado que compita con la venta.

### Condiciones para APROBAR RFC-002
- [ ] Reencuadrar: **C = estándar** (todo se construye a él), **no** el eje de secuencia.
- [ ] **Front-load** densidad-ON + 5 diarias + Catálogo rubro-aware + onboarding; **diferir** la migración de
      las 16 legadas a higiene incremental.
- [ ] **Métricas de negocio reales** (task-time del camino caliente, % self-serve completado, señal demo→
      interés), no "% de primitivos".
- [ ] Reconocer el **prototipo Comercio/Empresa lado a lado como activo de VENTA** explícito.
- [ ] Prender flags (IA 5 grupos + perfil) por default = **cambio de comportamiento** → su propio Gate +
      prototipo probado con un usuario real, nunca un flip silencioso.

---

## RFC-003 · Alta de tenants — el **diagnóstico es excelente; la SOLUCIÓN (wizard) está sobre-diseñada**

### Los challenges más fuertes

**Ch-1 · El wizard de 5 pasos GATEADOS es la herramienta equivocada para el usuario real.** El único usuario
de la consola es **el dueño**, dando de alta **rápido y repetido** — un **experto**. El wizard con pasos
gateados ("Siguiente deshabilitado si…") es un patrón para el **novato ocasional**; para el power-user es
**más navegación/clicks** que un formulario. La RFC **conflaciona dos ideas distintas**: *"validar temprano"*
(bueno) y *"partir en pasos"* (fricción). El fix de P6 ("validación tardía") es **validación INLINE**, **no**
pasos. → **Adoptar un formulario único denso + preview en vivo + validación inline** (un "smart form"),
**sin** el gateo por pasos. Se quedan TODOS los wins (preview, validación temprana, unicidad inline) y se
tira la fricción. *(Bonus: un form denso con preview es coherente con "Operación primero" de RFC-002 y con la
densidad del control-plane.)*

**Ch-2 · §C #2 debe COMMITEAR a derivar del catálogo canónico — o repite EXACTAMENTE el bug de FU1.** La RFC
dice *"extender `MODULES` **o derivarlo** del catálogo real `src/modules/`"*. Verificado: `operator-config`
**NO** deriva de `src/modules/descriptors` → **ya es una 2ª fuente de verdad**. Mantener `MODULES` a mano y
"extenderlo" es **crear el mismo drift que acabamos de unificar en FU1** (`defaultModulesForBlueprint` tenía
dos copias que divergieron). **No puede quedar como "o": tiene que ser derivar del catálogo canónico
(`src/modules`), punto.** Es la lección MP más fresca del repo.

**Ch-3 · §C #1 (profile) es el gap #1 del PRODUCTO — pero está BLOQUEADO y mal-priorizado.** Verificado:
`provisionTenant(prisma, params)` **no toma `profile`** → la consola **no puede crear un tenant Empresa**. Es
literalmente el eje de GROW-AR sin vía de provisioning → debería ser **P0**, no un ítem plano de una lista de
3. **Y tiene una dependencia oculta:** persistir el perfil necesita la columna `Tenant.profile` **aplicada en
prod**, que hoy es **§C congelado** (la migración `add_tenant_profile` sin aplicar, decisión A/B del dueño).
La RFC lo pone como "aditivo, cambio de firma" **sin surfacear que está bloqueado por la migración frozen**.

**Ch-4 · Gap serio: el DOWNGRADE Empresa→Comercio no tiene política de DATO.** La ficha permite "bajar de
Empresa a Comercio" con la nota "los módulos Empresa dejan de verse". Pero el invariante `enterprise ⊇ lite`
solo garantiza el camino **hacia arriba (aditivo)**; **bajar no está definido** por ADR-058/059. ¿Qué pasa con
las filas `AccountPayable`/`AccountReceivable`/cheques del tenant al bajar? Quedan **huérfanas y ocultas pero
presentes** — riesgo DX-6/DX-7 (el dato existe pero la UI lo esconde). **Definir la política de dato del
downgrade, o prohibir el downgrade en v1** (solo subir, que es lo que el invariante respalda).

**Ch-5 · Bootstrap: mover el secreto de la URL al body NO es suficiente.** El "panel de un solo uso + copiar"
sigue mandando el secreto en la respuesta del server render. El fix correcto es un **token de revelación de un
solo uso** (se genera, se muestra una vez, se invalida), no solo cambiar de la query al cuerpo. Menor, pero si
se toca, hacerlo bien (C-005/ADR-041).

### ¿Se sostienen las decisiones? — **el DIAGNÓSTICO sí; la forma del alta CAMBIA**
- Los **3 §C están bien identificados y son reales** (verificados: profile ausente, MODULES 2ª fuente, secreto
  en URL). **Pero:** #1 debe ser **P0 + surfacear el bloqueo de la migración**; #2 debe **commitear a derivar
  del catálogo canónico** (no "extender la lista a mano"); #3 debe ser **token de un solo uso**, no solo
  fuera-de-URL.
- El **wizard NO se sostiene** para el usuario real → **smart form + preview + validación inline**.

### Condiciones para APROBAR RFC-003
- [ ] **Reemplazar el wizard de 5 pasos gateados por un formulario único con preview en vivo + validación
      inline** (los wins sin la fricción del experto). Si se quiere "pasos", que sean secciones scrolleables no
      gateadas.
- [ ] **§C #2: derivar `MODULES` del catálogo canónico `src/modules` (una sola fuente), NO extender la lista a
      mano** — condición dura (anti-repetición de FU1).
- [ ] **§C #1: elevar `profile`-en-`provisionTenant` a P0 y surfacear su dependencia** de la migración
      `add_tenant_profile` (§C A/B congelado) — no puede shippear el alta-Empresa antes que la columna en prod.
- [ ] **Definir la política de dato del downgrade Empresa→Comercio** (qué pasa con CxP/CxC), **o prohibir el
      downgrade en v1**.
- [ ] Bootstrap: **token de revelación de un solo uso**, no solo sacarlo de la URL.

---

## Antítesis de fondo (para el dueño)
Ambos RFC comparten un patrón: **excelente auditoría anclada + una solución más ancha/estructurada de lo que
el problema y el usuario piden**. RFC-002 confunde "terminar el sistema" con "dar valor"; RFC-003 confunde
"validar temprano" con "partir en un wizard". La corrección en los dos es la misma: **quedarse con la rebanada
de mayor valor para el usuario/venta real (que en ambos casos es más chica), y dejar la disciplina de sistema
como estándar de fondo, no como el proyecto del titular.** Ninguno debe pausar el camino de go-live/venta.

— Challenger por GSG (S5 · red-team ADR-045, Opus). Tensión, no decisión. No merge.
