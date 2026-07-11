---
id: ADR-088
nivel: evolutiva
dominio: [Producto, Seguridad]
depends_on: [ADR-025, ADR-022, ADR-066, ADR-076]
---
# ADR-088: Auditoría fiscal — riesgos, estado real (SIMULADO) y corrección competitiva (TFactura = Axoft/Tango, un ERP completo)

**Estado:** Aceptado — foto auditada del dominio fiscal al 2026-07-11 y encuadre competitivo corregido. Registro
de estado + riesgos (no implementa código nuevo por sí mismo; los cierres viven en los ADR citados).
**Fecha:** 2026-07-11
**Depende de:** ADR-025 (producto de auto-facturación MP / modelo contador socio), ADR-022 (plugin ARCA = sólo
autorización fiscal), ADR-066 (credencial fiscal por tenant — principio), ADR-076 (suite: un motor, tres
productos)
**Relacionado:** ADR-084 (implementación del cert por tenant que cierra el Riesgo #1), ADR-064 (invariante I2:
idempotencia comprobante↔venta que cierra el doble CAE), ADR-077 (cert modelo delegación de la cartera del
contador), ADR-083 (schema-ahead: aplicar migraciones antes del deploy) · `src/plugins/arca/` ·
`src/lib/mercadopago-ingest.ts` · `src/lib/invoice-from-mp.ts` · `src/app/contador/`

---

## Contexto

Al auditar el dominio fiscal, el encuadre del dueño ("en otra vertical dimos de alta un tenant para competir
con TFactura y Facturante") **no coincidía con el repo**, y aparecieron riesgos que conviene fijar por escrito
para no re-descubrirlos. Este ADR deja la **verdad de terreno**: qué está simulado, qué riesgos hay, cuáles se
cerraron, y con **quién** competimos de verdad.

## Decisión (registro de estado + encuadre)

### 1. Estado real: el dominio fiscal está SIMULADO

- **No se dio de alta ningún tenant fiscal real.** Los únicos tenants provisionados siguen siendo los 4 de
  siempre (CH, Magra, Shine, ADM) — ninguno es de facturación. **No existe blueprint "facturación/monotributo"**
  en la fábrica (sólo servicios/carnicería/velas/pádel/genérico) → un alta fiscal caería hoy al comodín
  genérico.
- Lo que existe en `main` es **scaffold con stubs**: `src/lib/mercadopago-ingest.ts`, `src/lib/invoice-from-mp.ts`,
  `src/app/contador/` (+ `contador-panel.ts` con clientes dummy hardcodeados). Stubs de MP y ARCA, conciliación
  en memoria, **sin OAuth real, sin tabla de conciliación en DB, sin CAE real**.
- Emisión ARCA **gateada por dos flags seguros por default:** `ARCA_MODO` (default `stub`, en la fábrica) +
  `ARCA_INVOICING_ENABLED` (default `off`, en el cron). El cron `arca-outbox` está en `vercel.json` (diario 6am)
  pero **fail-closed** (CRON_SECRET + gate).

### 2. Riesgos

- **Riesgo #1 (CRÍTICO) — cert ARCA por env único:** el certificado sale de `ARCA_CERT_PEM`/`ARCA_KEY_PEM`
  (`src/plugins/arca/afip/factory.ts` + `signer.ts`), **compartido por todos los tenants** → con ARCA real y >1
  tenant firmaría con el **CUIT equivocado** (contaminación fiscal cruzada). Viola ADR-066. **→ EN CURSO de
  cierre por ADR-084** (cert cifrado por tenant + guard CUIT↔cert fail-closed, rama `seguridad/cert-por-tenant`;
  falta aplicar migración + `FISCAL_MASTER_KEY` = Gate del dueño).
- **Doble CAE (comprobante↔venta):** una venta podía generar más de un comprobante. **→ CERRADO** por la
  **invariante I2** (idempotencia de origen, ADR-064): migración `20260710120000_invoice_origin_idempotency_unique`
  (unique por origen) + `src/lib/invoice-idempotency.ts` + `src/plugins/arca/domain/comprobante.ts`. **En
  `main`** (aplicación a prod = Gate 2, ADR-083).
- **`/contador` sin guard:** ruta top-level **sin barrera** (no había `middleware.ts` ni layout con
  `requireOperator`) — hoy inofensiva (dummy) pero sería un **plano cross-tenant público** si se cablea el dato
  real sin barrera. **→ CERRADO** (guard de operador puesto; se mantiene como invariante: dato real de cartera
  siempre detrás del portón de operador, plano ADR-021).

### 3. Corrección competitiva (el encuadre que estaba mal)

- **TFactura es de Axoft/Tango: un ERP COMPLETO, no un competidor puntual de facturación.** Competir "contra
  TFactura" es competir contra una suite, no contra un facturador. Nuestro diferencial no es "otro facturador"
  sino **integración bancaria** (auto-facturación desde extracto, `src/plugins/bancos/`, ADR-075) + **el
  contador como canal** (ADR-076/077).
- **Facturante sólo cubre posnet/Mercado Pago Point** — es un competidor **acotado** a ese segmento, no
  equivalente a nuestra ingesta automática de TODO el feed (ADR-025).
- **Encuadre de producto correcto (ADR-076):** no son "verticales" sino **DOS productos sobre el mismo motor**
  (Comerciante / Contador; posible 3º standalone), empaquetados de módulos, nunca forks. **El primer cliente
  real es un contador** (cartera).

> **En una línea:** *hoy el fisco es un scaffold con stubs; el doble CAE y el `/contador` abierto están
> cerrados, el cert compartido se está cerrando (ADR-084), y competimos contra un ERP (Tango) por diferencial
> —banco + contador-canal—, no como "un facturador más".*

## Consecuencias

- **(+)** Estado fiscal **honesto y trazable**: nadie asume "ya facturamos real" cuando es stub; los flags
  default-seguros impiden emitir por accidente.
- **(+)** Los dos riesgos operables (doble CAE, `/contador` abierto) **cerrados**; el crítico (cert) tiene dueño
  y camino (ADR-084).
- **(+)** El encuadre competitivo corregido evita una estrategia equivocada ("ganarle a un facturador" cuando
  el rival real es una suite).
- **(−)** **Falta mucho para ARCA real:** blueprint fiscal en la fábrica, OAuth MP real, tabla de conciliación,
  CAE real, cert por tenant aplicado. Es **Gate 4** (encender ARCA real) en el roadmap.
- **(−)** El certificado sigue siendo **por env único en `main`** hasta que ADR-084 se mergee y se aplique su
  migración + master key: **no encender ARCA real con >1 tenant** hasta entonces.

## Alternativas descartadas

- **Dar por bueno el encuadre "vertical / competir con TFactura y Facturante".** Rechazado: no coincide con el
  repo (nada fiscal dado de alta) ni con el mercado real (Tango es un ERP). La foto manda.
- **Encender ARCA real ya, con el cert compartido, "para el primer cliente".** Rechazado por ADR-066/084:
  firmaría con CUIT ajeno al 2º cliente. El cert único se tolera **sólo** para demo/homologación de 1 CUIT
  (decisión acotada del dueño), nunca para 2 emisores reales.
- **Cablear el dato real del contador antes del guard.** Rechazado: `/contador` sin barrera con datos reales es
  una fuga cross-tenant. El guard es pre-condición.

— Elaborado por GSG (Auditoría GSG / Fiscal — registro de estado y riesgos; encender ARCA real = Gate del dueño)
