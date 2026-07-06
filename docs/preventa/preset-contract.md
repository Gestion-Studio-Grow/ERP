# 📦 Contrato PRESET → MOTOR + Reglas de adaptación por rubro

**Tipo:** especificación de interfaz (entrenamiento de agentes) · **Dueño:** Célula "Generador de
Preset por IA" (Adaptación y Calidad) · **Ratifica:** Célula 3 (motor del probador).
**Para qué:** cerrar el **formato único** con el que el generador **emite** el preset y el motor del
probador (`src/app/demo/`) lo **consume**. Es el CONTRATO del que habla `docs/metodologia/generador-preset-ia.md`
("acuerdo de interfaz — a cerrar con Célula 3"). Hoy ese contrato **no existe en código**: el motor está
hardcodeado a un negocio ficticio ("Estudio Aura", `demo-content.ts`). Este doc lo define.

> **Estado (2026-07-06):** PROPUESTA del agente de Calidad, **pendiente de ratificación de Célula 3**.
> Nada se cablea al motor sin su OK (el motor es de ellos). Mientras tanto, el preset se sigue mostrando
> por el camino actual (vidriera del tenant `/tienda` + probador base genérico).

---

## 1. Principios del contrato (por qué esta forma y no otra)

1. **Data pura, cero servidor.** El preset es un **objeto de datos** (JSON-serializable), NO una conexión
   a DB ni una llamada a acción. Respeta la garantía dura del motor: `force-static`, sin `@/lib/prisma`,
   sin `process.env`, sin credenciales (ver `docs/demo/README.md` §Aislamiento). El único import que el
   motor puede tomar del contrato es **type-only** (`AccentPreset`), que se borra en build.
2. **Sin secretos, sin datos reales de clientes.** El preset vive entero en la **FASE 1** (probador
   público). Nada de `DATABASE_URL`, passwords, ni transacciones reales (`generador-preset-ia.md`
   §"Un preset NO incluye").
3. **Procedencia por campo.** Cada dato leído del prospecto viaja con su **origen** (`verificado` /
   `provisional` / `pedido-al-dueno`), para que el probador lo **marque visualmente** y el Gate verifique
   que **nada inventado pasó sin etiquetar** (regla de oro del playbook de lectura de redes).
4. **Autorización embebida.** El preset **referencia el registro de autorización** del cliente. Sin
   `authorization.granted === true`, el Gate **bloquea** y el motor **no renderiza** (precondición dura).
5. **Rubro-aware.** El set de escenas y los datos de demo dependen de la **familia del blueprint** (una
   carnicería no tiene "reservá tu turno"). El contrato lo modela con `scenes[]` parametrizadas, no con
   escenas fijas de spa.
6. **Versionado.** `schemaVersion` para poder evolucionar el contrato sin romper presets viejos ni el motor.

---

## 2. El tipo `Preset` (propuesta de `src/presets/contract.ts`)

```ts
// PROPUESTA — a ratificar con Célula 3. Import type-only: no rompe force-static.
import type { AccentPreset } from "@/lib/branding";

/** Origen de cada dato leído del prospecto (regla de oro: no inventar). */
export type Provenance = "verificado" | "provisional" | "pedido-al-dueno";

/** Envuelve un valor con su procedencia + nota opcional (de dónde salió / qué falta). */
export type Sourced<T> = { value: T; prov: Provenance; note?: string };

export interface PresetBrand {
  businessName: string;                 // nombre del comercio (visible dentro del teléfono)
  monogram: string;                     // monograma recreado (1–2 letras)
  accentPreset: AccentPreset;           // de ACCENT_PRESETS (petroleo|oxblood|rosa|celeste|verde|ambar)
  theme: "light" | "dark";              // tema de la vidriera
  voice: "formal" | "cercano" | "premium" | "descontracturado"; // tono → calibra el copy
  tagline?: Sourced<string>;            // posicionamiento textual del negocio
}

export type PresetSceneId =
  | "agenda" | "reserva"                // familia Agenda&Servicios / Oficios
  | "vidriera" | "pedido"               // familia Retail/Mostrador / Gastronomía
  | "caja" | "factura" | "dueno" | "cierre"; // transversales

export interface PresetScene {
  id: PresetSceneId;
  kicker: string;                       // etiqueta corta (barra stories)
  title: string;                        // titular de venta
  pitch: string;                        // una línea de beneficio, criollo claro
  seconds: number;                      // duración en autoplay
  data?: unknown;                       // payload de la escena (tipado por familia, §4)
}

export interface PresetCTA {
  whatsappNumber: Sourced<string>;      // E.164 sin '+'; provisional hasta confirmar con el dueño/GTM
  whatsappText: string;
  email: string;
}

export interface PresetAuthorization {
  granted: boolean;                     // precondición dura: sin true, NO se genera ni se muestra
  scope: string;                        // qué autorizó (web / fotos / catálogo / total)
  grantedBy: string;                    // quién dio el OK
  recordPath: string;                   // docs/tenants/<slug>/... (registro citable)
}

export interface PresetQuality {        // resultado del Gate de Excelencia (los 4 bloques)
  gatePassed: boolean;                  // AND de los cuatro; sin esto el preset NO se muestra
  sap: boolean; gsg: boolean; arquitectura: boolean; confiabilidad: boolean;
  auditedAt?: string; auditor?: string; // se estampa afuera (no usar Date.now en build)
  notes?: string;
}

export interface Preset {
  schemaVersion: 1;
  slug: string;                         // ruteo
  subdomain: string;
  blueprintId: string;                  // de resolveBlueprint()
  matchedRubro: boolean;                // false = cayó al comodín generico (se justifica)
  modules: string[];                    // de PRESET_META (por familia)
  brand: PresetBrand;
  scenes: PresetScene[];                // set por FAMILIA (§3) — mínimo 4, típico 6
  catalogSample: Array<Sourced<{        // catálogo/servicios de ejemplo (marcados)
    name: string; price?: number; unit?: string; category?: string;
  }>>;
  cta: PresetCTA;
  incumbent?: Sourced<string>;          // sistema a reemplazar (p.ej. Bistrosoft)
  authorization: PresetAuthorization;   // §Autorización
  quality: PresetQuality;               // §Gate
  provenanceSummary: { verificado: number; provisional: number; pedido: number }; // conteo (Gate lo verifica)
}
```

**Regla de aislamiento verificable (misma que el motor):** el contrato **solo** puede importar `type`s.
Si algún día `src/presets/contract.ts` importa runtime de la app, el build de `/demo` lo delata. El
generador arma el objeto; el motor lo recibe como prop y renderiza. Nunca al revés.

---

## 3. Reglas de adaptación por rubro (familia → set de escenas)

El motor hoy fija escenas de **Agenda&Servicios** (agenda → reserva → caja → factura → dueño → cierre).
Eso **no sirve** para una carnicería. El set de escenas se elige por la **familia** del blueprint
resuelto (`resolveBlueprint()` → `src/blueprints/`). Reglas:

| Familia (blueprint) | Rubros ejemplo | Escenas (en orden) | Módulos (PRESET_META) |
|---|---|---|---|
| **Agenda & Servicios** | spa, peluquería, barbería, uñas, estética | `agenda` → `reserva` → `caja` → `factura` → `dueno` → `cierre` | agenda, catalog, clients, waitlist, reminders, reports |
| **Retail / Mostrador** | carnicería, verdulería, dietética, kiosco, fiambrería, indumentaria | `vidriera` → `pedido` → `caja` → `factura` → `dueno` → `cierre` | pos, catalog, clients, reports, arca (+ inventario) |
| **Gastronomía** | restaurante, cafetería, rotisería | `vidriera` → `pedido` → `caja` → `factura` → `dueno` → `cierre` | pos, catalog, clients, reports, arca |
| **Servicios & Oficios** | plomería, electricista, flete, técnico | `agenda` → `reserva` (visita/presupuesto) → `caja` → `factura` → `dueno` → `cierre` | agenda, catalog, clients, reminders, reports, arca |
| **Comodín (genérico)** | rubro no modelado | `vidriera` → `caja` → `factura` → `dueno` → `cierre` (mínimo honesto) | set base; se justifica el comodín |

**Escenas transversales** (`caja`, `factura`, `dueno`, `cierre`) son iguales en forma para todas las
familias; cambia el **contenido** (ticket de servicios vs ticket de productos por kg). `dueno` (Panel del
Dueño, "tu negocio te habla") es **la palanca estrella** — va en TODAS las familias.

### 3.1 Arquetipo de datos de demo por escena (qué sembrar)

- `agenda` → jornada de turnos (`Appt[]`: hora/cliente/servicio/profesional) + un turno que "entra online".
- `reserva` → servicio + slots + pick (mini-flujo de la vidriera pública).
- `vidriera` → catálogo del rubro (categorías + productos con precio/unidad) desde el blueprint + líneas
  específicas del negocio leídas. **Retail: venta por kg + packs; Gastro: menú.**
- `pedido` → un pedido de delivery/WhatsApp entrando (canal, zona, items) → bandeja del backoffice.
- `caja` → ticket armándose (líneas + medio de pago + saldo de caja).
- `factura` → comprobante emitido con **CAE de ARCA** (tipo, neto, iva, total, cae, pv/nro).
- `dueno` → 3 insights en lenguaje llano + 1 tendencia (spark). Calibrados al rubro.
- `cierre` → tarjeta de conversión con el CTA (WhatsApp del cliente / captación).

**Regla que no se negocia:** lo **genérico del rubro** va al blueprint (`src/blueprints/…`, reusable);
lo **específico del negocio** va al preset del tenant. Nunca ensuciar el rubro con datos de un cliente.

### 3.2 Calibración de tono (`brand.voice`)

El `voice` afina el copy de las escenas (no solo los nombres): `premium/descontracturado` (Magra:
"esto no es una carnicería"), `cercano` (spa de barrio), `formal` (estudio contable). El generador
**elige el voice desde el tono leído** (playbook de lectura de redes §5) y lo aplica al `title`/`pitch`.

---

## 4. Mapa de los 6 componentes del preset ↔ el contrato

| Componente (metodología) | Campo(s) del `Preset` |
|---|---|
| 1. Ficha del negocio | `brand.voice`, `brand.tagline`, `incumbent`, `blueprintId` |
| 2. Ruteo + estructura | `slug`, `subdomain`, `blueprintId`, `matchedRubro`, `modules` |
| 3. Identidad / branding | `brand.*` (nombre, monograma, `accentPreset`, `theme`, wording en `scenes`) |
| 4. Datos de demo por rubro | `scenes[].data`, `catalogSample` (todo `Sourced`, marcado) |
| 5. Instancia del probador | el objeto `Preset` completo → prop del motor de Célula 3 |
| 6. Sello de calidad | `quality` (Gate) + `authorization` (precondición) |

---

## 5. Migración sugerida (para Célula 3, sin romper lo actual)

1. El motor pasa de constantes hardcodeadas (`demo-content.ts`) a **recibir un `Preset` por prop**, con
   el "Estudio Aura" actual convertido en un **preset de ejemplo por defecto** (`demoPresetFallback`).
   Cero cambio visible mientras no se pase otro preset.
2. `DemoTour` renderiza `preset.scenes` en vez de `SCENES` fijas; cada escena mira `scene.id` para elegir
   su render (ya hace algo así). Las nuevas (`vidriera`, `pedido`) se suman como casos.
3. El generador (esta célula) emite `Preset` objetos; se pueden pre-generar como data estática por tenant
   (`src/presets/<slug>.ts`) → siguen siendo `force-static`, sin backend.
4. Aislamiento intacto: `grep -rhoE 'from "[^"]+"' src/app/demo/` debe seguir mostrando solo `react`,
   `next`, imports `./` y **type-only** del contrato.

Esta migración es **trabajo conjunto con Célula 3** (el motor es de ellos); acá queda el contrato para
que ambos lados codifiquen contra la misma forma.

— Elaborado por **Gestión Studio Grow (GSG)**.
