# Material de Marca — schema (contrato de salida de la extracción)

**Fuente de verdad:** `src/preset/extraction/material-de-marca.ts` (tipos + validación + tests).
Este doc es la versión legible del contrato, para coordinar con **Adaptación/Calidad** sin leer el código.

**Versión del schema:** `1.0`.

---

## 1. Trazabilidad — el tipo `Field<T>`

Cada dato extraído es un `Field<T>`:

| Prop | Tipo | Regla |
|---|---|---|
| `value` | `T \| null` | `null` = no se pudo obtener todavía |
| `provenance` | `"verificado" \| "provisional" \| "pedido-al-dueno"` | ver abajo |
| `source` | `string?` | **obligatorio si `verificado`** (URL / captura / reseña) |
| `note` | `string?` | recomendado si `provisional` (por qué se estimó) |

**Semántica de `provenance` (regla de oro, chequeada por `validateMaterial`):**

- `verificado` — visto en fuente pública. Exige `source`. No puede tener `value` nulo.
- `provisional` — estimación razonable marcada. Debe tener `value`; conviene `note`.
- `pedido-al-dueno` — no accesible; se le pide al dueño. `value` puede ser `null`.

Invariante: **si no hay valor, la única provenance válida es `pedido-al-dueno`.** Marcar como
`verificado`/`provisional` algo sin valor es un **error** de validación.

---

## 2. Estructura del Material

| Ruta | Tipo del `value` | Notas |
|---|---|---|
| `prospecto` | `string` | nombre del negocio (clave del caso) |
| `capturedAt` | `string?` | ISO date, lo pasa quien construye (no autogenera) |
| `rubro` | `string` | texto libre → `resolveBlueprint(rubro)` aguas abajo |
| `identidad.nombrePublico` | `string` | |
| `identidad.tagline` | `string` | **literal**, no parafraseado |
| `identidad.tono` | `string` | descripción de la voz |
| `identidad.colores` | `string[]` | hex |
| `identidad.accentPreset` | `"petroleo"\|"oxblood"\|"rosa"\|"celeste"\|"verde"\|"ambar"` | mapea a `src/lib/branding.ts` |
| `identidad.theme` | `"light"\|"dark"` | |
| `identidad.logo` | `AssetRef` | `{ url, downloaded, kind }` |
| `modeloNegocio` | `string` | el **cómo** vende |
| `catalogo` | `CatalogoItem[]` | `{ categoria, items[], marcas? }` |
| `ofertas` | `string[]` | |
| `quienesSomos` | `string` | |
| `servicios.delivery` | `string` | zonas |
| `servicios.mediosPago` | `string[]` | |
| `servicios.horarios` | `string` | |
| `servicios.canalesVenta` | `string[]` | local/web/WhatsApp/apps |
| `contacto.whatsapp` | `string` | formato `wa.me` |
| `contacto.telefono` | `string` | |
| `contacto.email` | `string` | |
| `contacto.direccion` | `string` | |
| `contacto.ciudad` | `string` | alimenta `--city` |
| `contacto.instagram` | `string` | |
| `contacto.web` | `string` | |
| `incumbente` | `string` | software/sistema que reemplazamos |
| `fuentes` | `string[]` | todas las URLs consultadas |
| `pendientesDelDueno` | `string[]` | qué pedir para cerrar prod |

---

## 3. API del módulo (lo que consume Adaptación/Calidad)

| Función | Devuelve | Para qué |
|---|---|---|
| `emptyMaterial(prospecto, capturedAt?)` | `MaterialDeMarca` | scaffold honesto (todo `pedido-al-dueno`) |
| `field(value, provenance, {source?, note?})` | `Field<T>` | declarar un dato con su trazabilidad |
| `validateMaterial(m)` | `{ ok, issues[] }` | integridad + regla de oro (no exige completitud) |
| `completenessScore(m)` | `{ demo, prod, missingForDemo[], missingForProd[], pendientes }` | **el gate** |
| `toProvisionHandoff(m)` | `{ prospecto, rubro, flags, provisionales[], bloqueantesProd[] }` | insumo del alta |

**Campos requeridos** (los define el módulo, no este doc):

- **Demo:** `rubro`, `identidad.nombrePublico`, `identidad.tono`, `modeloNegocio`, `catalogo`,
  `contacto.whatsapp`.
- **Prod:** los de demo + `identidad.tagline`, `identidad.colores`, `identidad.logo`,
  `servicios.mediosPago`, `servicios.horarios`, `contacto.direccion`, `contacto.ciudad`.

---

## 4. Contrato con Adaptación / Calidad

Lo que **la extracción garantiza** al entregar el Material:

1. `validateMaterial(m).ok === true` (sin errores; warnings anotados).
2. Ningún dato `verificado` sin `source`. Ningún valor inventado sin marca.
3. `toProvisionHandoff(m)`:
   - `flags` sólo trae **valores presentes** (nunca inventa un WhatsApp o una ciudad).
   - `provisionales[]` lista los campos usados que **no** están verificados → Adaptación los trata como
     *a-confirmar*, no como hechos.
   - `bloqueantesProd[]` = lo que falta para producción + `pendientesDelDueno`.

Lo que **Adaptación/Calidad hace** con eso (su dominio, no el nuestro):

- Resuelve `rubro` → blueprint con `resolveBlueprint` (`src/blueprints/index.ts`).
- Aplica los `flags` de branding en el alta (ONBOARDING §4).
- Decide demo vs. prod según `completenessScore` y cierra los `bloqueantesProd` con el dueño.

> **Coordinación abierta.** Si Adaptación necesita un campo nuevo en el Material, se agrega acá y en el
> módulo (bump de `schemaVersion`), con su test. El schema es el único lugar donde se negocia la interfaz.

---

## 5. Ejemplo mínimo

```ts
import { emptyMaterial, field, validateMaterial, toProvisionHandoff }
  from "@/preset/extraction/material-de-marca";

const m = emptyMaterial("MAGRA Meat Market", "2026-07-05");
m.rubro = field("boutique de carnes premium", "verificado", { source: "https://magrameatmarket.com.ar/" });
m.contacto.whatsapp = field("+5491161354042", "verificado", { source: "linktr.ee/magrameatmarket" });
m.identidad.accentPreset = field("oxblood", "provisional", { note: "hex exacto pendiente" });

validateMaterial(m).ok;        // true
toProvisionHandoff(m).flags;   // { whatsapp: "+5491161354042", accentPreset: "oxblood", ... }
```
