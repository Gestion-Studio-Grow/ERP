---
id: ADR-085
nivel: evolutiva
dominio: [IA, Producto, Plataforma]
depends_on: [ADR-006, ADR-061, ADR-041]
---
# ADR-085: Generación de imágenes por IA como CAPACIDAD COMPARTIDA — multi-proveedor tras una interfaz, gratis por default

**Estado:** Aceptado — capacidad de plataforma. Trabajo en la rama **`feat/imagen-ia`**; **no mergeado** aún.
**Fecha:** 2026-07-11
**Depende de:** ADR-006 (la IA es una **capa delgada** sobre la plataforma, no el centro), ADR-061 (motor
invisible compartido: una capacidad para todos los tenants, diferenciada por config), ADR-041 (las keys de los
proveedores pagos las pega el dueño — FASE 2)
**Relacionado:** ADR-085 sirve al preset-IA de alta (ADR-034/065: hero/onboarding/catálogo de un tenant nuevo),
ADR-073 (personalización por tenant = dato, no fork), ADR-030 (costo cero antes de la venta) ·
`src/lib/imagen/` · `scripts/genera-imagen.mjs` · `docs/imagen-ia.md`

---

## Contexto

Dar de alta un tenant y armar su vidriera/onboarding necesita **imágenes fotorrealistas** (hero, catálogo,
onboarding). Sin una capacidad común, cada frente resolvería la imagen a mano, con un proveedor distinto, y
atado a una key — no escala y repite trabajo. La necesidad es **transversal** (CH, MAGRA, velas, pádel y
futuros) y debe respetar dos reglas de GSG: **costo cero antes de la venta** (ADR-030) y **el agente no pega
claves ni crea cuentas** (ADR-041).

## Decisión

**La generación de imágenes por IA es una capacidad COMPARTIDA de la plataforma**, con el proveedor abstraído
detrás de una interfaz — no un script de un solo uso.

1. **Un punto de entrada único:** `generarImagen(...)` en `src/lib/imagen/` (CLI fino `scripts/genera-imagen.mjs`).
   Todos los tenants la consumen igual; cambiar de proveedor **no toca a los consumidores**.
2. **Interfaz `ImageProvider` + adaptadores** (`src/lib/imagen/providers/`), catálogo actual:
   - **`pollinations`** *(default)* — **GRATIS, sin key** (Flux por detrás). **Funciona ya, a costo cero.**
   - **`gemini`** — free-tier con `GEMINI_API_KEY` (más control).
   - **`fal`** — pago (~US$0.04/img), `FAL_KEY`, FLUX1.1 [pro], calidad tope.
   - **`replicate` / `bfl`** — scaffolds con la firma lista (pago), para sumar sin tocar consumidores.
3. **Gratis por default, sin configurar nada:** sin ninguna key, la capacidad **ya funciona** con
   `pollinations`. Los proveedores con key son **opt-in** para más control/calidad. Si se elige uno con key y
   falta la variable → **error claro (`FaltaKeyError`), no rompe build ni tests**.
4. **Presets por rubro:** `componerPrompt`/`ESTILOS` (`presets.ts`) componen el prompt del caller con el
   **estilo del rubro** (estética, velas, pádel…) → coherencia visual por vertical sin que el consumidor sepa
   de estilos.
5. **Seguridad:** la clave se lee **de variable de entorno**, nunca se hardcodea ni se loguea (ADR-041). El
   prompt del caller se **sanitiza y valida** (una línea, sin caracteres de control, largo acotado) antes de ir
   al proveedor.

> **En una línea:** *una función para toda la plataforma; gratis por default con `pollinations`, y si el dueño
> quiere más calidad, cambia de proveedor por env sin tocar una línea de los consumidores.*

## Consecuencias

- **(+)** **Costo cero por default** (ADR-030): se generan imágenes para demos/altas sin gastar un peso ni
  esperar credenciales.
- **(+)** **Cambiar de proveedor es config, no refactor** (ADR-061): el consumidor no se entera; la calidad se
  sube pagando sólo cuando conviene.
- **(+)** Encaja como insumo del **preset-IA de alta** (ADR-034/065): hero/onboarding/catálogo de un tenant
  nuevo salen de acá con el estilo de su rubro.
- **(−)** El tier gratis de `pollinations` **respeta el aspecto pero puede bajar la resolución** (~686×858 para
  4:5) → para calidad/resolución tope hay que pasar a `gemini`/`fal` (key + eventual costo).
- **(−)** Depende de **servicios externos**: disponibilidad/ToS/rate-limits de cada proveedor son riesgo
  operativo; la interfaz mitiga (fallback a otro proveedor) pero no elimina.
- **(−)** Genera **assets** (imágenes en el repo/almacenamiento del tenant) → hay que cuidar dónde se guardan
  (personalización = dato, ADR-073) y su peso.

## Alternativas descartadas

- **Un script atado a un proveedor pago (fal/gemini) desde el arranque.** Rechazada: viola costo-cero-antes-de-
  vender (ADR-030) y ata la capacidad a una key. El default gratis (`pollinations`) es la decisión.
- **Que cada frente/tenant resuelva su imagen a mano.** Rechazada: repite trabajo, diverge estilos, no escala;
  contradice el motor compartido (ADR-061).
- **Hardcodear la key en el repo/config para "que ande".** Prohibido (ADR-041): la key va por env, la pega el
  dueño, nunca está en el repo.
- **Bloquear la capacidad hasta tener claves.** Rechazada: `pollinations` sin key ya cubre el 80% (demos/altas);
  la calidad tope es opt-in.

— Elaborado por GSG (IA / Plataforma — capacidad compartida; las keys pagas las pega el dueño, ADR-041)
