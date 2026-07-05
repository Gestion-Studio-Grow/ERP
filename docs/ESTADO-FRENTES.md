# Estado de frentes — mapa vivo (bajo la metodología de reporte)

**Qué es:** la foto viva del avance de cada frente, reportada bajo `docs/METODOLOGIA-REPORTE-AVANCE.md`
(estados canónicos 🟢 Avanzable ya · ✅ Completado — pendiente acción humana · 🔒 Gated). El **%
mide lo que depende de nosotros** (código/diseño/verificación); la ejecución con datos reales es
*acción humana*, no falta. Se lee para dar "status" y para decidir qué frentes abrir.

- **Verificado contra código:** 2026-07-05. **Mantiene:** el frente D (PMO/estratégico).
- **Frentes en ejecución paralela ahora:** A (Tests) · B (POS/stock) · C (UX/UI) · D (este, PMO).

> Los % son juicio de ingeniería anclado a evidencia del repo, no de memoria. Donde no se puede
> verificar sin tocar Neon prod (si una migración escrita ya está *aplicada*), se marca explícito.

## Tabla de avance

| Frente | % nuestro | Estado (por partes) | Qué falta (nuestro / acción humana) | Esf. |
|---|---|---|---|---|
| **Core servicios/estética** | **~90%** | 🟢 en prod | features nuevas (paquetes, ficha rica) = 🟢 avanzable | M–L |
| **Tenants por rubro / blueprints** | **~85%** | 🟢 sistema · 🔒 prod multi-tenant | profundidad ERP por arquetipo (🟢); alta 2º tenant (🔒 RLS) | M |
| **RLS / multi-tenant** | **100% dev** | ✅ **Completado — pendiente acción humana** | nada nuestro: SQL+wiring+verify offline listos. Falta **aplicar a prod (Gate 2, tu OK)** | — |
| **ARCA / facturación** | **~65%** | ✅ núcleo · 🟢 adapter SOAP · ⏳ activación | núcleo Invoice/Outbox+dominio ✅; **adapter WSAA/WSFEv1 (`soap.ts`) 🟢 avanzable**; activación (cert/homologación/flag/migración a prod) = acción humana | L |
| **Ingesta Mercado Pago (ADR-025)** | **~70%** | ✅ pipeline · 🟢 adapter · ⏳ credenciales | pipeline+clasificador+OAuth-stub ✅; **adapter real+firma webhook+tabla conciliación 🟢 avanzable**; OAuth/credenciales = acción humana | L |
| **WhatsApp** | **~80%** | ✅ infra · 🟢 adapter proveedor · ⏳ credencial | infra+plantillas+punto de entrada ✅; **adapter Meta/Twilio 🟢 avanzable (S)**; número+credenciales = acción humana | S–M |
| **Checkout / seña** | **~10%** | 🟢 avanzable | flujo MP (preferencia+webhook de cobro) casi todo **por escribir (🟢, L)**; luego credenciales = acción humana | L |
| **Performance (ADR-023)** | **100% de lo no-gated** | ✅ · 🔒 resto | F2/F3/F4/F5/F8 hechos; **F1/F6 🔒 atados a RLS** (se hacen con la activación) | — |
| **Tests / QA** | **0%** | 🟢 **avanzable (Frente A activo)** | elegir harness (ADR) + primeras pruebas de lógica pura | M |
| **POS / Retail (profundidad ERP)** | **~55%** | 🟢 dev · ⏳ migración pendiente acción humana | **descuento de stock al vender HECHO** (transaccional, sin oversell, flag `trackStock`; migración SIN aplicar = acción humana). Falta: caja, compras/reposición | M–L |
| **UX/UI design system** | **~50% adopción** | 🟢 **avanzable (Frente C activo)** | barrer las pantallas que faltan (23 archivos ya lo usan) | M |
| **Onboarding equipo/agentes** | **~100% (doc v1)** | 🟢 avanzable (iteración) | iterar con uso real; mejorar comandos `/sesion-*` | S |
| **Consola operador (super-admin)** | **~60% construido** | 🟢 build · 🔒 uso en prod | scaffold login/console/alta/tenants; uso real 🔒 RLS/2º tenant | M |
| **Front Premium (upsell)** | **~90%** | 🟢 avanzable | adopción/branding por tenant | S |
| **Panel contador (arca/MP)** | **~40%** | ⏳ atado a MP | scaffold con datos simulados; se enciende con MP real (acción humana) | M |

**Lectura clave:** **RLS está al 100% nuestro** — no es un "80% a medias", es una entrega lista
esperando tu Gate 2. ARCA/MP/WhatsApp tienen su **núcleo ✅ completado** y una **parte 🟢 avanzable**
(los adapters, que podemos escribir sin credenciales) más la **ejecución con datos reales** (acción
humana). Checkout es el único de los "gated" que además tiene **bastante dev nuestro por escribir**.

---

## Backlog de frentes a conversar (mapa de "qué más encarar")

Lista viva para ir charlando opciones desde el móvil. No es compromiso ni orden fijo — es el menú.
Marcá "hablemos de X" y lo bajamos a plan.

**Avanzables ya (sin gate/credencial) — candidatos a paralelo:**
- **Tests/QA** — *(Frente A en curso)*. Fundacional para "equipo de élite".
- **POS/stock + caja** — *(Frente B en curso)*. Cierra el agujero del vertical retail.
- **UX/UI adopción** — *(Frente C en curso)*. Cohesión visual + branding por tenant.
- **Adapters sin credencial** — escribir `soap.ts` (ARCA) y el adapter real de MP contra
  homologación/sandbox, para que el día de las credenciales sea *encender*, no *construir*.
- **Reportes profundos v2** — no-show, retención, rentabilidad hora-silla, export Excel/PDF
  (sobre el `getReportData` ya acotado por rango).
- **Nuevos presets de rubro** — config sobre arquetipos existentes (una sesión de config c/u).
- **Portal/app del cliente** — login + "mis turnos/pedidos" (diferenciador, L).

**Pendientes de acción humana (listos o casi, esperan al owner):**
- **Migración `trackStock` a prod (Gate 2)** — código de descuento de stock listo y verificado; falta `prisma migrate deploy` de `20260705130000_add_product_track_stock`.
- **RLS a prod (Gate 2)** — el que desbloquea todo el negocio multi-tenant.
- **WhatsApp** — conectar proveedor (máximo valor por esfuerzo, infra lista).
- **ARCA vivo** — cert + homologación + aplicar migración + flag.
- **Mercado Pago vivo** — OAuth + credenciales por comercio.
- **Checkout/seña** — tras escribir el flujo (dev), conectar credenciales.

**Decisiones de dueño / negocio (no técnicas):**
- Orden comercial de verticales (¿empujar retail/magra? ¿solo-facturación para contadores?).
- Pricing y empaquetado (Core + Premium front + arca standalone).
- Gate de prod de magra (cobro MP online, fotos, precios reales).

---

## Mantener esto honesto
Documento vivo del frente D. Si un frente cambia de estado (se activa una credencial, se aplica un
gate, se termina un adapter), se actualiza acá **en el mismo movimiento**. La metodología de cómo
se reportan los estados vive en `docs/METODOLOGIA-REPORTE-AVANCE.md`.
