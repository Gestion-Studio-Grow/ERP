# Generación de imágenes por IA — capacidad compartida de la plataforma

Capacidad **compartida** para **todos los tenants** (CH Estética, MAGRA, velas, pádel y
futuros): generar imágenes fotorrealistas a demanda (hero, onboarding, catálogo) desde una
sola función, con el proveedor abstraído detrás de una interfaz. No es un script de un solo
uso: es infraestructura reutilizable, integrable vía API.

- **Módulo:** `src/lib/imagen/` — punto de entrada `generarImagen()`.
- **CLI:** `scripts/genera-imagen.mjs` (envoltorio fino del módulo).
- **Proveedor default:** [fal.ai](https://fal.ai) con **FLUX1.1 [pro]** (fotorrealismo
  editorial, API REST simple, **~US$0.04/imagen**).
- **Intercambiable:** adaptadores `fal` / `replicate` / `bfl` detrás de la interfaz
  `ImageProvider`. Cambiar de proveedor NO toca a los consumidores.

> **Estado:** scaffold + wiring. El adaptador `fal` está implementado (queue API por HTTP);
> `replicate` y `bfl` son stubs listos para completar. **Sin `FAL_KEY` la feature queda
> inerte** (lanza un error claro), **no rompe build ni tests**.

---

## 1. Cómo sacar la `FAL_KEY` (lo hace el dueño)

1. Entrá a **https://fal.ai** y creá una cuenta (o iniciá sesión).
2. Andá a **Dashboard → API Keys** (https://fal.ai/dashboard/keys).
3. **Create key**, copiá el valor (empieza con `fal-...` o es un par `key_id:key_secret`).
4. Cargá saldo/tarjeta en **Billing** cuando quieras generar de verdad (~US$0.04/img).

> El agente **no** crea la cuenta ni pega la clave: son acciones del dueño (política de
> credenciales — FASE 2). El repo nunca contiene la clave.

---

## 2. Cómo setear la clave

### Local (`.env.local`)

```bash
# .env.local  (NO se commitea — ya está cubierto por .gitignore: `.env*`)
FAL_KEY=fal-tu-clave-aca
```

### Vercel (deploy)

`Settings → Environment Variables → Production` (y Preview si querés):

| Name      | Value            |
| --------- | ---------------- |
| `FAL_KEY` | `fal-tu-clave`   |

La plantilla `.env.vercel.template` ya lista `FAL_KEY` (más `REPLICATE_API_TOKEN` y
`BFL_API_KEY` para las alternativas). **Nunca** pongas la clave en el repo ni en logs.

---

## 3. Cómo se usa por tenant (desde código)

La firma es la misma para todos; el **rubro** elige el estilo base (dirección de arte) y el
pedido puntual describe la escena:

```ts
import { generarImagen } from "@/lib/imagen";

// Hero de CH Estética (rubro estetica → tierra + teal, sereno, editorial)
await generarImagen({
  prompt: "recepción de spa con toallas dobladas y velas encendidas, mañana",
  outPath: "public/tenants/ch/hero.png",
  rubro: "estetica",
  tenant: "ch",
  aspectRatio: "16:9",
});

// Hero de MAGRA (rubro carniceria → carbón + oro, producto protagonista)
await generarImagen({
  prompt: "bandeja de cortes premium sobre mármol oscuro",
  outPath: "public/tenants/magra/hero.png",
  rubro: "carniceria",
  tenant: "magra",
  aspectRatio: "4:3",
});
```

Devuelve `{ outPath, provider, promptFinal, contentType, bytes }`. Si falta la clave lanza
`FaltaKeyError` con un mensaje que dice qué setear; si el prompt es inválido, `PromptInvalidoError`.

### Desde la CLI

```bash
node scripts/genera-imagen.mjs \
  --prompt "recepción de spa con toallas y velas, luz de mañana" \
  --out public/tenants/ch/hero.png \
  --rubro estetica --aspect 16:9 --tenant ch
```

### Rubros y estilos disponibles

El mapa `rubro → estilo` vive en `src/lib/imagen/presets.ts` (config-sobre-código, coherente
con los blueprints de ADR-074). Cubre estética/spa (tierra+teal), carnicería/MAGRA
(carbón+oro), velas/deco (cera cálida), pádel (deportivo), gastronomía (horneado cálido) y un
**genérico** comodín para cualquier rubro sin match. Un rubro nuevo = una entrada en ese
archivo, sin tocar a los consumidores. `estilo` (override explícito) pisa al preset del rubro
para casos puntuales.

---

## 4. Costo

- **FLUX1.1 [pro] en fal:** ~**US$0.04 por imagen** (1 imagen por llamada por default).
- Se paga por generación efectiva; el scaffold **no** consume mientras no exista `FAL_KEY` y
  no se llame a `generarImagen()`.
- Coherente con el ciclo **DEMO → VENTA → INVERSIÓN**: generar imágenes reales es inversión;
  antes de la venta, todo queda inerte a costo cero.

---

## 5. Cómo cambiar de proveedor

La interfaz `ImageProvider` (`src/lib/imagen/types.ts`) es el único contrato que conocen los
consumidores. Para cambiar de proveedor:

1. Pasá `provider: "replicate"` (o `"bfl"`) en `generarImagen(...)`, **o** cambiá el default
   `PROVIDER_DEFAULT` en `types.ts`.
2. Completá el adaptador correspondiente (`src/lib/imagen/providers/replicate.ts` /
   `bfl.ts`) — hoy son stubs con la firma lista; seguí la forma del adaptador `fal.ts`.
3. Seteá su variable de entorno: `REPLICATE_API_TOKEN` o `BFL_API_KEY`.

Ningún consumidor cambia: siguen llamando a `generarImagen()`.

---

## 6. Seguridad

- La clave se lee **solo** de variable de entorno (`FAL_KEY` / `REPLICATE_API_TOKEN` /
  `BFL_API_KEY`). **Nunca** hardcodeada, **nunca** commiteada, **nunca** en logs.
- `.env.local` está cubierto por `.gitignore` (`.env*`); solo se versiona la plantilla
  **sin valores** (`.env.vercel.template`).
- El prompt se **sanitiza** antes de usarse: se quitan caracteres de control (anti
  inyección de logs), se colapsan espacios y se valida el largo (3–1500 chars).
- Los errores tipados (`FaltaKeyError`, `PromptInvalidoError`, `ProviderError`) no incluyen
  el valor de ninguna clave.

---

## 7. Estructura del módulo

```
src/lib/imagen/
  types.ts          Contrato: ImageProvider, tipos del pedido/resultado, errores tipados.
  presets.ts        Mapa rubro → estilo base + composición del prompt (PURO, testeable).
  index.ts          Orquestador generarImagen(): valida → compone → resuelve proveedor →
                    lee la clave del entorno → genera → guarda. Deps inyectables (tests).
  providers/
    fal.ts          Adaptador fal.ai / FLUX1.1 [pro] (queue API por HTTP, sin SDK).
    replicate.ts    Adaptador Replicate (scaffold, firma lista).
    bfl.ts          Adaptador Black Forest Labs (scaffold, firma lista).
  imagen.test.ts    Tests del orquestador con proveedor mockeado (sin red ni disco).
  presets.test.ts   Tests de composición de prompt por rubro.
scripts/genera-imagen.mjs   CLI fino sobre el módulo.
```

Tests: `npm test` (corren con el proveedor mockeado; no pegan a la API).

---

*— Elaborado por GSG (Gestión Studio Grow).*
