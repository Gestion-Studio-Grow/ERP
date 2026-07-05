# Presets por rubro — tenants pre-seteados, listos para alta 1-clic

**Tipo:** spec de blueprints (PO + arquitectura) · **Fecha:** 2026-07-05
**Ancla:** ADR-002 (Core/Blueprint/Plugin), ADR-019 (provisioning), ADR-021 (control-plane),
FUNDAMENTOS §2 (tenant = config sobre el Core, **no fork**). Complementa
`docs/blueprints/retail-mostrador.md` y `docs/ONBOARDING-TENANT.md`.

> **Regla (guardrail):** cada rubro es **config pura** —catálogo, wording, branding,
> acento y módulos— sobre un archetipo de blueprint en código. Un rubro nuevo = una
> entrada de datos, **cero código**. "Si tu negocio no está acá, lo acomodamos sobre lo
> existente (preset del rubro más cercano o comodín)", nunca un desarrollo a medida.

---

## 1. Qué es un preset

El operador, desde **`/operador/alta`**, elige el rubro y el tenant **nace usable** —con
su catálogo, su marca, sus módulos y su wording— sin pantalla vacía (ADR-019 §2.b). Cada
preset se materializa como un `Blueprint` (id = rubro), alcanzable por `--blueprint <rubro>`
o por el **selector** `resolveBlueprint(rubro)` que matchea el texto libre del
descubrimiento (ONBOARDING §3.2.1) y, si no encuentra rubro, cae al comodín `generico`.

Cada preset trae: **catálogo base** (seed idempotente), **roles** (RBAC del Core:
OWNER/RECEPTION/PROFESSIONAL — el alta crea el OWNER), **módulos** activos por defecto,
**branding/acento** sugerido, **wording** del rubro y **datos de ejemplo** editables.

## 2. Archetipos (familias) y sus rubros

Cinco archetipos cubren el grueso del mercado local. Todos son el **mismo Core**; cambia
la config.

| Archetipo (familia) | Núcleo | Rubros incluidos | Módulos default | Código |
|---|---|---|---|---|
| **Agenda & Servicios** | Turnos por profesional + boxes + catálogo | estética, peluquería, veterinaria, consultorio | agenda, catálogo, clientes, lista de espera, recordatorios, reportes | `src/blueprints/agenda` |
| **Retail / Mostrador** | POS + stock + venta peso/unidad | carnicería, verdulería, dietética, kiosco, fiambrería, indumentaria | pos, catálogo, clientes, reportes | `src/blueprints/retail` (otra sesión) |
| **Servicios & Oficios** | Catálogo de trabajos + agenda de visitas (a domicilio) | plomería, electricidad, cerrajería, refrigeración, fletes | agenda, catálogo, clientes, recordatorios, reportes, arca | `src/blueprints/oficios` |
| **Gastronomía** | Carta (Products) + POS/pedidos (mostrador/retiro/delivery) | restaurante, cafetería, panadería, rotisería, pizzería, heladería | pos, catálogo, clientes, reportes, arca | `src/blueprints/gastronomia` |
| **Genérico (comodín)** | Catálogo flexible + caja | cualquier rubro no modelado | catálogo, clientes, pos, agenda, reportes | `src/blueprints/generico` |

## 3. Detalle por familia

### 3.1 Agenda & Servicios (`agenda/`)

Siembra: categorías + servicios + **un profesional de ejemplo** con horarios Lun–Sáb + un
box. Capabilities: `agenda:manage`, `catalog:manage`, `clients:manage`, `reports:read`.

| Rubro | Catálogo base (ejemplos) | Acento | Wording |
|---|---|---|---|
| **estetica** | Limpieza facial, peeling, masaje, radiofrecuencia, manicura, pedicura | rosa / claro | "Nuestros tratamientos" · reservar turno |
| **peluqueria** | Cortes, brushing, coloración, mechas, nutrición capilar | ámbar / oscuro | "Nuestros servicios" · pedir turno |
| **veterinaria** | Consulta, control, vacunas, baño y corte | verde / claro | "Nuestros servicios" · reservar consulta |
| **consultorio** | Primera consulta, seguimiento, sesiones, informe | celeste / claro | "Prestaciones" · solicitar turno |

### 3.2 Servicios & Oficios (`oficios/`)

Siembra: categorías + trabajos (con nota "precio desde, se cotiza en visita") + **un
profesional** con horarios de visita, **sin box** (trabajan a domicilio). Capabilities:
`catalog:manage`, `agenda:manage`, `clients:manage`, `reports:read`.

| Rubro | Catálogo base (ejemplos) | Acento |
|---|---|---|
| **plomeria** | Visita, reparación de pérdida, grifería, termotanque, destapación | celeste / oscuro |
| **electricista** | Diagnóstico, cortocircuito, artefactos, cableado, tablero | ámbar / oscuro |
| **cerrajeria** | Apertura, cambio de cerradura, traba de seguridad, copia de llave | petróleo / oscuro |
| **refrigeracion** | Instalación de split, carga de gas, mantenimiento, reparación | celeste / claro |
| **fletes** | Flete corto, con ayudante, mudanza chica, mudanza casa | ámbar / claro |

### 3.3 Gastronomía (`gastronomia/`)

Siembra: la **carta como Products** del Core (unidad o kg según el ítem) — la venta se
hace por POS/pedidos. Capabilities: `catalog:manage`, `orders:manage`, `clients:manage`,
`reports:read`.

| Rubro | Carta base (ejemplos) | Acento |
|---|---|---|
| **restaurante** | Bife, milanesa napolitana, ravioles, ensalada, flan, bebida | oxblood / oscuro |
| **cafeteria** | Café con leche, cortado, medialuna, tostado, torta, jugo | ámbar / claro |
| **panaderia** | Pan francés (kg), facturas (kg), pan de campo (kg), medialunas, torta | ámbar / claro |
| **rotiseria** | Pollo al spiedo, empanadas, milanesas (kg), ensalada rusa (kg), tarta | oxblood / claro |
| **pizzeria** | Muzzarella, napolitana, fugazzeta, empanadas, faina | oxblood / oscuro |
| **heladeria** | 1/4, 1/2 y 1 kg, cucurucho, postre helado | rosa / claro |

## 4. Cómo se conecta al provisioning y al control-plane

- **Registro:** `src/blueprints/families.ts` agrega las tres familias (`FAMILY_BLUEPRINTS`)
  y sus pistas (`FAMILY_RUBRO_HINTS`) al registro central (`index.ts`) con **una línea**;
  los rubros específicos ganan al genérico en el selector.
- **Metadata liviana:** `src/blueprints/presets-meta.ts` expone módulos por familia +
  acento/tema por rubro (datos puros, sin seeders), consumidos por
  `src/lib/operator-config.ts` (`defaultModulesForBlueprint`, `suggestedAccentForBlueprint`).
- **Alta:** `provisionFromConsole` (`operator-actions.ts`) usa el blueprint elegido, sus
  módulos default y su acento sugerido si el operador no los pisa. Persiste
  `Tenant.blueprintId` + `modules` + `accentPreset`/`frontTheme` (control-plane, ADR-021).

## 5. Datos provisionales y edición

Todos los catálogos, precios (AR, mediados 2026), horarios y branding son **de referencia
razonable** para que el tenant se vea poblado desde el día uno — **no** son la lista real
de ningún negocio. El negocio los edita desde el panel. El wording por rubro está listo en
los datos (`rubros.ts`) para que la vidriera lo consuma; el cableado del copy a la vidriera
por tenant queda para quien administre el sitio público (fuera de este alcance).

## 6. Cuándo se modela un rubro nuevo (guardrail)

Un rubro entra como **entrada de datos** en el `rubros.ts` de su familia (o cae al comodín).
Sólo se crea una **familia/archetipo nuevo** —código— cuando un modelo de negocio no encaja
en ninguno de los cinco (p. ej. algo que no sea ni agenda, ni mostrador, ni oficio a
domicilio, ni gastronomía). El trabajo se hace una vez y lo heredan todos los tenants; jamás
un fork por cliente (FUNDAMENTOS §1, ADR-002).
