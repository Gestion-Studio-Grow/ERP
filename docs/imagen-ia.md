# Generación de imágenes por IA — capacidad compartida de la plataforma

Capacidad **compartida** para **todos los tenants** (CH Estética, MAGRA, velas, pádel y
futuros): generar imágenes fotorrealistas a demanda (hero, onboarding, catálogo) desde una
sola función, con el proveedor abstraído detrás de una interfaz. No es un script de un solo
uso: es infraestructura reutilizable, integrable vía API.

- **Módulo:** `src/lib/imagen/` — punto de entrada `generarImagen()`.
- **CLI:** `scripts/genera-imagen.mjs` (envoltorio fino del módulo).
- **Proveedores** (todos detrás de la interfaz `ImageProvider`; cambiar de uno a otro NO
  toca a los consumidores):

  | provider        | costo            | key                   | notas |
  | --------------- | ---------------- | --------------------- | ----- |
  | **`pollinations`** *(default)* | **GRATIS**, sin key | — | Flux por detrás. Funciona ya, a costo cero. |
  | `gemini`        | free tier con key | `GEMINI_API_KEY`      | Google AI Studio, más control. |
  | `fal`           | ~US$0.04/img      | `FAL_KEY`             | FLUX1.1 [pro], calidad tope. |
  | `replicate`     | pago              | `REPLICATE_API_TOKEN` | scaffold (firma lista). |
  | `bfl`           | pago              | `BFL_API_KEY`         | scaffold (firma lista). |

> **Sin ninguna key configurada, la capacidad YA funciona** con `pollinations` (el default).
> Los proveedores con key (gemini/fal) son opt-in para más control/calidad. Si se elige uno
> con key y falta la variable, lanza un error claro (no rompe build ni tests).

---

## 1. Arrancar YA (gratis, sin configurar nada)

```bash
node --import tsx scripts/genera-imagen.mjs \
  --prompt "recepción de spa con toallas y velas, luz de mañana" \
  --out public/tenants/ch/hero.jpg \
  --rubro estetica --aspect 4:5 --tenant ch
```

Usa `pollinations` por default: sin cuenta, sin clave, sin costo. La imagen sale en `--out`.

> Nota: en el tier gratis, `pollinations` respeta la **relación de aspecto** pero puede
> devolver una **resolución menor** a la pedida (~686×858 para 4:5). Para resolución/control
> mayores, usá `--provider gemini` o `--provider fal` (requieren key).

---

## 2. Cómo sacar las keys (opcional — solo para gemini/fal)

**Gemini (gratis con key):**
1. Entrá a **https://aistudio.google.com/apikey** e iniciá sesión con tu cuenta Google.
2. **Create API key**, copiá el valor.

**fal (pago, calidad tope):**
1. Entrá a **https://fal.ai** y creá una cuenta.
2. **Dashboard → API Keys** (https://fal.ai/dashboard/keys) → *Create key*, copiá el valor.
3. Cargá saldo/tarjeta en **Billing** (~US$0.04/img).

> El agente **no** crea cuentas ni pega claves: son acciones del dueño (política de
> credenciales — FASE 2). El repo nunca contiene la clave.

---

## 3. Cómo setear las keys

### Local (`.env.local`)

```bash
# .env.local  (NO se commitea — ya está cubierto por .gitignore: `.env*`)
GEMINI_API_KEY=tu-clave-de-google-ai-studio
FAL_KEY=fal-tu-clave
```

### Vercel (deploy)

`Settings → Environment Variables → Production` (y Preview si querés):

| Name             | Value                     |
| ---------------- | ------------------------- |
| `GEMINI_API_KEY` | `tu-clave` (opcional)     |
| `FAL_KEY`        | `fal-tu-clave` (opcional) |

La plantilla `.env.vercel.template` ya lista estas variables. `pollinations` no necesita
ninguna. **Nunca** pongas una clave en el repo ni en logs.

---

## 4. Cómo se usa por tenant (desde código)

La firma es la misma para todos; el **rubro** elige el estilo base (dirección de arte) y el
pedido puntual describe la escena. Sin `provider`, usa `pollinations` (gratis):

```ts
import { generarImagen } from "@/lib/imagen";

// Hero de CH Estética (gratis, rubro estetica → tierra + teal, sereno, editorial)
await generarImagen({
  prompt: "recepción de spa con toallas dobladas y velas encendidas, mañana",
  outPath: "public/tenants/ch/hero.jpg",
  rubro: "estetica",
  tenant: "ch",
  aspectRatio: "4:5",
});

// Hero de MAGRA con fal (calidad tope; requiere FAL_KEY)
await generarImagen({
  prompt: "bandeja de cortes premium sobre mármol oscuro",
  outPath: "public/tenants/magra/hero.png",
  rubro: "carniceria",
  tenant: "magra",
  aspectRatio: "4:3",
  provider: "fal",
});
```

Devuelve `{ outPath, provider, promptFinal, contentType, bytes }`. Si se elige un proveedor
con key y falta, lanza `FaltaKeyError` (mensaje que dice qué setear y que pollinations es
gratis); si el prompt es inválido, `PromptInvalidoError`.

### Desde la CLI

```bash
node --import tsx scripts/genera-imagen.mjs \
  --prompt "recepción de spa con toallas y velas, luz de mañana" \
  --out public/tenants/ch/hero.jpg \
  --rubro estetica --aspect 4:5 --tenant ch [--provider gemini|fal] [--seed 7]
```

### Rubros, estilos y aspectos

El mapa `rubro → estilo` vive en `src/lib/imagen/presets.ts` (config-sobre-código, coherente
con los blueprints de ADR-074). Cubre estética/spa (tierra+teal), carnicería/MAGRA
(carbón+oro), velas/deco (cera cálida), pádel (deportivo), gastronomía (horneado cálido) y un
**genérico** comodín. Un rubro nuevo = una entrada en ese archivo, sin tocar a los
consumidores. `estilo` (override explícito) pisa al preset. Aspectos soportados: `1:1`, `4:3`,
`3:4`, `4:5`, `5:4`, `16:9`, `9:16` (dimensiones en `ASPECT_DIMS`, `types.ts`).

---

## 5. Costo

- **`pollinations`:** **gratis**. Ideal para demos y para arrancar (ciclo DEMO → VENTA →
  INVERSIÓN: generar sin costo antes de la venta).
- **`gemini`:** free tier de Google AI Studio (cuotas del free tier).
- **`fal` FLUX1.1 [pro]:** ~**US$0.04 por imagen**.
- El scaffold no consume nada mientras no se llame a `generarImagen()`.

---

## 6. Cómo cambiar de proveedor

La interfaz `ImageProvider` (`src/lib/imagen/types.ts`) es el único contrato que conocen los
consumidores. Para cambiar:

1. Pasá `provider: "gemini"` (o `"fal"`, `"replicate"`, `"bfl"`) en `generarImagen(...)`, **o**
   cambiá el default `PROVIDER_DEFAULT` en `types.ts`.
2. Si el proveedor es scaffold (`replicate`/`bfl`), completá su adaptador en
   `src/lib/imagen/providers/` siguiendo la forma de `fal.ts` / `pollinations.ts`.
3. Seteá su variable de entorno (los que la necesiten).

Ningún consumidor cambia: siguen llamando a `generarImagen()`.

---

## 7. Seguridad

- Las keys se leen **solo** de variable de entorno (`GEMINI_API_KEY` / `FAL_KEY` / …).
  **Nunca** hardcodeadas, **nunca** commiteadas, **nunca** en logs ni en la URL (pollinations
  no usa clave; gemini manda la clave por header, no por query string).
- `.env.local` está cubierto por `.gitignore` (`.env*`); solo se versiona la plantilla
  **sin valores** (`.env.vercel.template`).
- El prompt se **sanitiza** antes de usarse: se quitan caracteres de control (anti inyección
  de logs), se colapsan espacios y se valida el largo (3–1500 chars).
- Los errores tipados (`FaltaKeyError`, `PromptInvalidoError`, `ProviderError`) no incluyen el
  valor de ninguna clave.

---

## 8. Estructura del módulo

```
src/lib/imagen/
  types.ts          Contrato: ImageProvider, tipos del pedido/resultado, errores, ASPECT_DIMS.
  presets.ts        Mapa rubro → estilo base + composición del prompt (PURO, testeable).
  index.ts          Orquestador generarImagen(): valida → compone → resuelve proveedor →
                    lee la clave del entorno SI el proveedor la necesita → genera → guarda.
  providers/
    pollinations.ts Adaptador Pollinations.ai (GRATIS, sin key) — DEFAULT. GET HTTP simple.
    gemini.ts       Adaptador Google Gemini (GEMINI_API_KEY) — generateContent + inlineData.
    fal.ts          Adaptador fal.ai / FLUX1.1 [pro] (queue API por HTTP, sin SDK).
    replicate.ts    Adaptador Replicate (scaffold, firma lista).
    bfl.ts          Adaptador Black Forest Labs (scaffold, firma lista).
  imagen.test.ts    Tests del orquestador con proveedor mockeado (sin red ni disco).
  presets.test.ts   Tests de composición de prompt por rubro y dimensiones por aspecto.
scripts/genera-imagen.mjs   CLI fino sobre el módulo.
```

Tests: `npm test` (corren con el proveedor mockeado; no pegan a la API).

---

*— Elaborado por GSG (Gestión Studio Grow).*
