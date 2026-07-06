# 🔁 Loop de entrenamiento de presets — evaluar, aprender, mejorar

**Tipo:** proceso de mejora continua (entrenamiento del equipo Generador de Preset) · **Dueño:** Célula
"Generador de Preset por IA" (Adaptación y Calidad).
**Para qué:** cerrar el bucle que pide `generador-preset-ia.md §Entrenamiento` — que **cada preset
generado se evalúe contra el Gate, se registren los aprendizajes y se mejoren las reglas**, para subir
la **tasa de éxito de la preventa caso a caso**. Sin este loop, cada agente re-descubre lo mismo.

---

## El ciclo (5 pasos, corre en cada preset)

1. **GENERAR** el preset (6 componentes) con el flujo del método.
2. **AUDITAR** contra `docs/preventa/preset-gate-checklist.md` (los 4 bloques + precondiciones duras).
   **En Opus 4.8** (excepción de modelos).
3. **REGISTRAR** en el **Ledger** (abajo): resultado del Gate, defectos, causa raíz, y qué se ajustó.
4. **PROMOVER a regla** lo recurrente: si un defecto aparece ≥2 veces (un rubro no modelado, un tono mal
   calibrado, un incumbente frecuente, un placeholder que quedó feo), se **sube a regla**: se edita el
   blueprint (`src/blueprints/…` como config), la regla de adaptación (`preset-contract.md §3`), o el
   checklist. Un rubro nuevo se modela como **config, nunca como fork**.
5. **MEDIR**: seguir la tasa de aprobación del Gate en 1er intento, la recurrencia de defectos, y (cuando
   se sepa) el resultado de preventa. La meta es que ambas curvas mejoren caso a caso.

**Disparadores de mejora estructural** (cuándo NO alcanza con arreglar el preset y hay que tocar reglas):
- Rubro que cae al comodín `generico` → candidato a **blueprint nuevo** si se repite.
- Mismo tono mal calibrado en 2+ presets → ajustar la tabla de `brand.voice`.
- Un ángulo del Gate que falla seguido → reforzar el arquetipo de datos o el motor (coordinar con Célula 3).
- Un dato que siempre queda `pedido-al-dueno` → sumarlo al guion de intake (coordinar con "Adaptador/Intake").

---

## 📒 LEDGER de presets (una fila por preset generado)

Formato: `fecha · tenant/slug · rubro→blueprint (matched?) · Gate [SAP/GSG/Arq/Conf] · defectos → causa → regla-cambiada · resultado preventa`.
Se agrega al tope. Los defectos se escriben aunque el Gate haya pasado (son el combustible del loop).

### 2026-07-06 · Seed retroactivo de los 3 presets ya hechos (base del loop)

**1) `magra` — boutique de carnes premium (web) → blueprint `carniceria` (matched ✔)**
- **Gate:** SAP ✔ · GSG ✔ · Arq ✔ · Conf ⚠️ (parcial). Autorización: **total** (el dueño confirmó que
  el estudio @noctiluma es suyo — `docs/tenants/magra/replica-web-demo.md`). ✔
- **Aciertos:** el insight de **modelo de venta** ("no es carnicería de mostrador, es boutique envasada
  al vacío + delivery + WhatsApp") reorientó bien el preset; incumbente **Bistrosoft** identificado
  (paridad concreta); acento `oxblood` de marca; procedencia rigurosa (verificado/provisional/pedido).
- **Defectos / deuda (combustible del loop):**
  - `provisional`: **precios** estimados (lista real vive en Bistrosoft, carga por JS) → `pedido-al-dueno`.
  - `pedido`: **contenido de Instagram** (@tiendamagra, login-gated) + **paleta hex exacta** + **fotos con
    permiso**. Placeholder de marca CH/GSG donde faltan fotos (ya aplicado por el Frente Diseño).
  - **GAP estructural #1:** el probador de Magra hoy se muestra por `/tienda` (SiteReplica), **no** por el
    **motor de Célula 3 parametrizado** — porque el contrato Preset→Motor no existía. → **Causa raíz** de
    crear `preset-contract.md`. **Regla-cambiada:** definido el contrato + set de escenas Retail/Mostrador
    (`vidriera→pedido→caja→factura→dueno→cierre`).
- **Resultado preventa:** ⛔ gate de prod del dueño pendiente (cobro MP online, fotos, precios reales).

**2) `adosmanos` / Break Point Pádel — club de pádel (Instagram) → blueprint `servicios`/turnos (matched ✔)**
- **Gate:** SAP ✔ · GSG ✔ · Arq ✔ · Conf ✔ (preventa artefacto `docs/artefactos/breakpoint-preventa.html`).
- **Aprendizaje:** entrada **solo Instagram** (más pobre que una web) → más campos `provisional`; confirma
  que con poco material el preset se sostiene con provisionales bien marcados. Tono "club de amigos/amigas"
  → `voice: cercano`. **Nota:** A Dos Manos es **retail de palas+zapatillas**, no reservas de cancha
  (rubro `padel` comercio) — ojo de no confundir familia (memoria del proyecto).
- **Regla-cambiada:** ninguna nueva; refuerza la regla "con IG-only, provisionales + pedir capturas".

**3) `shinevelas` — velas de soja (web) → rubro `velas` (matched ✔, acento `ambar`)**
- **Gate:** SAP ✔ · GSG ✔ · Arq ✔ · Conf ✔ (`docs/artefactos/shinevelas-preview.html`, landed af26494).
- **Aprendizaje:** rubro experiencial (velas+aromas+deco+ritual+sets) → el arquetipo de `vidriera` Retail
  sirvió con wording sensorial; `voice: premium/descontracturado`. Worktree aislado evitó el commit-race.
- **Regla-cambiada:** ninguna; caso limpio, valida el set Retail para rubros no-alimenticios.

### 2026-07-06 · Auditoría de la célula Productos por Rubro (blueprints + previews)

**Alcance:** revisión de `src/blueprints/` (los 3 previews + los 4 tenants) por la célula dueña de los
rubros/productos, coordinando con Auditoría GSG. Dos hallazgos, ambos corregidos en el acto:

- **Defecto — `adosmanos`: CTA de WhatsApp roto.** El preview usaba `5490000000000` (formato inválido, sin
  marcar provisional en ningún lado) → un clic en la demo en vivo abría un número roto. **Corregido:**
  constante `WA="5491100000000"` (formato válido) en ambas copias (`docs/artefactos/` y
  `public/previews/`) + registrado en `docs/metodologia/registro-casos/adosmanos.md` (caso que faltaba,
  única de las 4 vidrieras sin su registro) + heurística **H7** en `heuristicas-aprendidas.md`.
- **Deuda de arquitectura — blueprint `carniceria` duplicado/divergente.** Existían DOS definiciones del
  rubro: el blueprint standalone viejo (`src/blueprints/carniceria.ts`, catálogo genérico de 14 cortes) y
  el rubro de la familia Retail (`retail/rubros.ts`, catálogo boutique de magra con línea Don Ramón +
  gourmet, informado por el negocio real). El REGISTRY pisaba el segundo con el primero (a propósito,
  para no tocar el comportamiento de magra ya provisionado) — pero eso dejaba el catálogo **correcto**
  como código muerto, y cualquier carnicería NUEVA nacería con el catálogo genérico viejo en vez del
  validado. **Corregido:** se consolidó en `retail/rubros.ts` (única fuente), se portaron los defaults
  provisionales (address/whatsapp/instagram) que sólo tenía el standalone, se borró `carniceria.ts` y se
  agregó test de regresión (`retail/carniceria-rubro.test.ts`). Sin impacto en magra (ya provisionada,
  seed idempotente) — mejora el alta de la PRÓXIMA carnicería.

### Patrones ya destilados de estos 3 (subidos a regla)
- **El "cómo vende" define la familia**, no el "qué vende" (Magra). → en `preset-contract.md §3` + playbook.
- **Entrada pobre (IG-only) ⇒ más provisionales, nunca inventar** (Break Point). → precondición dura del Gate.
- **Retail cubre alimenticio y no-alimenticio** con el mismo set de escenas (Shine, Magra). → tabla §3.
- **Falta el motor parametrizado**: el mayor gap de calidad/consistencia hoy. → contrato definido, a
  ratificar con Célula 3.

---

## Cómo se usa este ledger (para el próximo agente)
Antes de generar un preset nuevo: **leé las últimas filas** — el rubro que te toca puede ya tener
aprendizajes. Después de generarlo: **agregá tu fila** (aunque el Gate haya pasado) y, si viste un patrón,
**subilo a regla** editando el blueprint / `preset-contract.md` / el checklist. Así el generador es más
preciso en cada iteración y la preventa convierte más.

— Elaborado por **Gestión Studio Grow (GSG)**.
