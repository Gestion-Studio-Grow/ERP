# Plan Fase 0 — Motor del PROBADOR INTERACTIVO (`/probar`)

**Tipo:** plan de diseño (Fase 0, no-build) · **Dueño:** Célula del Probador Interactivo (capa Sonnet).
**Para qué:** definir alcance, ruta, mecánica de simulación y frontera motor↔preset **antes de construir**,
por pedido explícito del dueño. Coordina con la Célula "Generador de Preset por IA" (Adaptación/Calidad),
autora de `docs/preventa/preset-contract.md`.

---

## 1. Qué ya existe (no se re-descubre)

- **`/demo`** (`src/app/demo/`, Célula 3 v1, `docs/demo/README.md`): un **tour pasivo estilo Stories**
  (autoplay + tap/swipe para avanzar 6 escenas fijas), pensado como **landing de publicidad de
  Instagram** ("echá un vistazo"). Hoy está **hardcodeado** a un negocio ficticio ("Estudio Aura",
  `demo-content.ts`) — no consume ningún preset.
- **`docs/preventa/preset-contract.md`**: contrato **propuesto** (`Preset` en `src/presets/contract.ts`,
  aún no escrito en código) que define cómo el generador de presets **alimentaría** ese motor: marca
  (`brand`), escenas por familia de rubro (`scenes[]`), catálogo de ejemplo (`catalogSample`, todo
  `Sourced` con procedencia), autorización embebida y el resultado del Gate (`quality`). Estado: **PROPUESTA
  pendiente de ratificación de esta célula.**
- **`docs/preventa/preset-gate-checklist.md`**: el Gate de Excelencia (SAP 7 ángulos + Sello GSG +
  Arquitectura + Confiabilidad) ya traducido a chequeos concretos sobre un preset/probador. Auditor: Opus.
- **`src/blueprints/`**: familias de rubro ya modeladas en código (`agenda`, `retail`, `gastronomia`,
  `oficios`, `generico`) — la fuente de verdad de qué módulos/catálogo corresponden a cada rubro.

## 2. El gap que motiva esta célula

`/demo` responde al **top-of-funnel** (ad de IG → "date una idea"). Lo que pide el dueño ahora —
**"el cliente navega y palpa TODO el ERP" (agenda, caja, tienda, facturación, panel del dueño, WhatsApp)**
— es otra cosa: el **sandbox real para la reunión de venta**, donde el prospecto **manda él** (no un
autoplay). La metodología ya lo nombra ("Instancia del PROBADOR... sandbox navegable, listo para
preventa") pero **no está construido**: `/demo` cubrió el teaser, no el sandbox.

**Decisión:** son **dos experiencias, un mismo preset.**

| | `/demo` (existe) | `/probar` (esta célula) |
|---|---|---|
| Momento de uso | Ad de Instagram, solo | Reunión de venta, con vendedor |
| Mecánica | Autoplay/Stories, lineal | **Navegación libre** por módulos (tabs/menú, como la app real) |
| Objetivo | Generar curiosidad en 60s | Que el dueño del negocio **se vea operando** su propio sistema |
| Datos | Fijos ("Estudio Aura") | **Parametrizados por `Preset`** (rubro del prospecto) |
| Alimentado por | `demo-content.ts` (a migrar) | `Preset` (mismo contrato) |

No se descarta ni se reemplaza `/demo` — sigue sirviendo GTM. `/probar` es el escalón siguiente del
mismo embudo, y ambos terminan consumiendo el mismo objeto `Preset`.

## 3. Alcance de `/probar`

- **Ruta:** `/probar` — pública, sin login, mobile-first (mismo criterio que `/demo`).
- **Navegación:** un **shell de app simulada** (marco de teléfono o layout admin, según rubro) con
  **menú/tabs persistentes** entre módulos — no autoplay forzado. El visitante entra a un módulo, lo toca,
  vuelve, salta a otro. Autoplay opcional solo como "sugerencia" inicial (highlight), nunca obligatorio.
- **Módulos (mapeados 1:1 a `PresetScene`/`modules` del contrato, por familia de rubro):**
  - Agenda & Servicios: agenda, reservá online, caja, facturación, panel del dueño, **WhatsApp**.
  - Retail/Mostrador y Gastronomía: vidriera/pedido, caja, facturación, panel del dueño, **WhatsApp**.
  - Servicios & Oficios: agenda (visita/presupuesto), caja, facturación, panel del dueño, **WhatsApp**.
  - Panel del Dueño va **siempre** (la palanca estrella, ya lo marca el contrato).
- **Módulo nuevo respecto del contrato actual: WhatsApp.** El contrato de Preset (`PresetSceneId`) hoy
  no tiene un arquetipo para esto. Se necesita un **`PresetSceneId: "whatsapp"`** con datos de ejemplo
  (bandeja simulada: mensajes entrantes, un pedido/turno que llega por WhatsApp, respuesta con el link de
  la vidriera). Ver §5, amendment 1.

## 4. Cómo simula sin transaccionar (hereda el aislamiento de `/demo`)

Mismo patrón ya verificado en `docs/demo/README.md` §Aislamiento — se reutiliza tal cual, no se reinventa:

- Todo vive bajo `src/app/probar/` (o el nombre de ruta final), **sin importar** `@/lib/prisma`, acciones
  de servidor, `tenant`/`rls`, ni `process.env`. Únicos imports externos: `react`, `next`.
- `export const dynamic = "force-static"` → pre-renderizado en build, cero conexión/credenciales.
- **"Transaccionar" = estado de React en el cliente**, no un POST real: tocar "Cobrar" corre una
  animación/máquina de estados local (el ticket pasa a "pagado", la caja del día suma en pantalla) que se
  **resetea** al recargar. Cero red, cero persistencia, cero passwords — igual que ya hace `/demo` con el
  turno "entrante" y el total del ticket.
- Chequeo de aislamiento reusable: `grep -rhoE 'from "[^"]+"' src/app/probar/ | sort -u` → solo debe
  listar `react`, `next`, imports `./` y el import **type-only** del contrato de preset.

## 5. Frontera motor/preset — ratificación del contrato propuesto

Se **ratifica `docs/preventa/preset-contract.md`** como base (principios, `Sourced<T>`, autorización
embebida, `quality`/Gate, tabla de familias→módulos): es sólido y ya pensado para rubro-aware. Dos
amendments desde el lado del motor:

1. **Agregar `"whatsapp"` a `PresetSceneId`** + su arquetipo de datos (`PresetScene.data` para esa
   escena: lista de mensajes de ejemplo con remitente/hora/texto, uno marcado como "pedido entrante"),
   dado que el dueño lo pidió explícito como módulo palpable. Sin esto, WhatsApp queda fuera del
   sandbox aunque esté en la lista de módulos deseados.
2. **`Preset.scenes[]` debe poder alimentar dos consumidores**, no uno: el tour lineal de `/demo`
   (recorre `scenes` en orden, autoplay) y la navegación libre de `/probar` (misma lista, pero renderizada
   como menú/tabs sin orden forzado). No hace falta un segundo campo — el mismo array sirve a ambos
   modos de consumo; **la diferencia es del motor que lo lee, no del dato.**

Con estos dos amendments, el contrato queda **cerrado** para que la Célula de Preset IA empiece a emitir
objetos `Preset` reales (hoy solo tiene el tipo, sin generador conectado).

## 6. Datos de demo por rubro

Se reusa **sin modificar** la tabla de familias de `preset-contract.md` §3 (Agenda&Servicios /
Retail-Mostrador / Gastronomía / Servicios&Oficios / Genérico) y los arquetipos de `demo-content.ts`
como semilla (turnos, ticket, factura con CAE, insights del dueño). Se suma el arquetipo de WhatsApp
(§3 arriba). Todo dato de ejemplo viaja `Sourced<T>` con su `prov` (`verificado`/`provisional`/
`pedido-al-dueno`) — ninguna dato inventado sin marcar, igual que exige el Gate.

## 7. Gate de calidad

Se reusa **tal cual** `docs/preventa/preset-gate-checklist.md` (SAP Fiori 7 ángulos + Sello GSG +
Arquitectura + Confiabilidad, auditor Opus). No se redefine un gate nuevo para `/probar`: es el mismo
probador, ampliado en navegación.

## 8. Próximo paso (si se aprueba este plan)

1. Escribir `src/presets/contract.ts` en código con los 2 amendments (hoy solo existe como propuesta en
   Markdown).
2. Migrar `/demo` para que reciba un `Preset` por prop (con "Estudio Aura" como `demoPresetFallback`,
   cero cambio visible) — paso 1 de la migración sugerida en `preset-contract.md` §5.
3. Construir el shell navegable de `/probar` reusando los renders de escena ya hechos en
   `src/app/demo/scenes.tsx` (agenda, caja, factura, dueño) + los nuevos (vidriera/pedido, whatsapp).
4. Pasar el Gate (§7) antes de publicar cualquier preset real sobre `/probar`.
5. No toca prod/deploy — sale por el flujo normal (build local verde → commit → push a `main`); publicar
   en Netlify sigue detrás del Gate 1 del dueño.

— Elaborado por **Gestión Studio Grow (GSG)**.
