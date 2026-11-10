# Paquete Peluquerías y Barberías — inventario, plan por tandas y precio

GSG-PELU-001 · 10/11/2026 · Frente lanzado por GSG-ORQ-006 con autorización del dueño.
Consultorios quedan FUERA de este frente.

## Tesis comercial

«Dejá de pagar 3 suscripciones»: turnos + caja/cobros + factura ARCA en un solo sistema.
La puerta de entrada es Factoque (blueprint `facturita`): todo monotributista factura; el
paso a peluquería **no se promete en el mismo negocio**: hoy Factoque se reconoce por el blueprint
`facturita` y cambiarlo pierde sus pantallas y su tope mensual (ver
`RUNBOOK-FACTOQUE-A-PELUQUERIA.md`, T6). El camino (A negocio nuevo · B Factoque como módulo ·
C alta nueva al dejar Factoque) lo decide el dueño; hasta entonces, no se le ofrece a la clienta.

## Hallazgo principal

El ERP ya tenía un rubro `peluqueria` en la familia Agenda (`src/blueprints/agenda/rubros.ts:96`),
con catálogo semilla y voz propia, pero:

1. **No podía activar Comisiones**: el descriptor las limitaba a `servicios`
   (`src/modules/descriptors/nativos.ts:168`, antes `rubros: ["servicios"]`) → la consola
   las rechazaba por incompatibles (`src/modules/activation.ts:91`).
2. **Nacía sin mostrador, stock, factura ni Mercado Pago**: usaba el set de agenda
   (`src/blueprints/presets-meta.ts`, `AGENDA_MODULES`).
3. **La barbería no tenía rubro propio**: caía en peluquería con catálogo de dama.

T1 cierra esos tres sin migración. CH (`beauty-spa`) vive sin blueprint: no la toca.

## Matriz necesidad ↔ ERP

| Necesidad | Estado | Dónde |
|---|---|---|
| Turnos por profesional y sillón | **Existe** (sillón = `Box`; solape profesional+box) · el texto dice «box», no «sillón» → T2 | `src/lib/booking-core.ts:52`, `prisma/schema.prisma:582,615` |
| Servicios con duración y precio | **Existe** (+ semilla de peluquería y, desde T1, de barbería) | `prisma/schema.prisma:672`, `src/blueprints/agenda/rubros.ts:96` |
| Seña | **Existe** tras interruptor `sena-obligatoria` (monto o %); seña por MP automática | `prisma/schema.prisma:692,750`, `src/cambios/interruptores.ts:178`, `src/lib/turnos/senia-mp.ts:84` |
| Confirmación por WhatsApp | **Parcial**: links `wa.me` (confirmar mañana, aviso de confirmado, comprobante); sin envío automático (WhatsApp Cloud sólo en pádel) | `src/app/admin/(dashboard)/turnos/MananaConfirmar.tsx:109`, `src/app/admin/(dashboard)/turnos/_agenda/aviso-confirmado.ts`, `src/lib/padel/whatsapp-cloud.ts` |
| Caja diaria | **Existe** (Core, sin módulo): caja, libro, cierre con arqueo ciego | `src/app/admin/(dashboard)/caja/cierre/page.tsx:76`, `src/lib/caja/cierre-diario.ts` |
| Cobro MP y efectivo | **Existe**: cobro de turno por medio, dividido, con producto; MP por aviso | `src/lib/caja/cobro-turno.ts:113`, `src/lib/turnos/cobro-dividido.ts`, `src/lib/mercadopago-ingest.ts` |
| Comisiones | **Parcial → T1**: liquidación por profesional y override por servicio existen; faltaba compatibilidad con peluquería. Sin comisión sobre productos vendidos → T3 | `src/app/admin/(dashboard)/comisiones/page.tsx:32`, `prisma/schema.prisma:954,1133`, `src/lib/comision-liquidable.ts` |
| Stock de reventa | **Existe** (inventario + cobro de turno con producto); faltaba en el set → T1 | `src/app/admin/(dashboard)/inventario/page.tsx:55`, `src/lib/turnos/cobro-con-producto.ts:16` |
| Ficha del cliente (color, fórmulas) | **Falta**: sólo `Client.notes` (texto libre). Ficha técnica estructurada = tabla nueva → T4 (migración) | `prisma/schema.prisma:853` |
| Factura ARCA (vía Factoque) | **Existe** (módulo `arca`; el paso de facturita a peluquería en el mismo negocio **no se promete**, decide el dueño A/B/C) | `src/blueprints/facturita.ts`, `src/lib/producto-identidad.ts:124` |
| Reportes simples | **Existe** | `src/app/admin/(dashboard)/reportes/page.tsx:86` |

Nota de datos sensibles: la ficha de color NO guarda alergias ni datos de salud (Ley 25.326,
dato sensible); sólo marca, tono, oxidante, tiempos y observaciones técnicas.

## Blueprint

No se crea un blueprint nuevo: se usan los rubros `peluqueria` y `barberia` de la familia
Agenda (config pura, ADR-002/003), con un set de módulos propio:
`agenda · catalog · clients · waitlist · reminders · reports · commissions · pos · inventario · arca · mercadopago`.

## Tandas (un PR en borrador cada una)

| Tanda | Qué | Migración |
|---|---|---|
| **T1** | Rubro barbería; comisiones compatibles con peluquería/barbería; set del paquete; tests de no-cambio | No |
| **T2** | Vocabulario «sillón» en lugar de «box» para peluquería/barbería (agenda, alta, errores de solape) vía `palabras-del-negocio` | No |
| **T3** | Comisión sobre productos de reventa vendidos en el turno (% por profesional) | Probable (columna aditiva) — se confirma al diseñar |
| **T4** | Ficha técnica de color por cliente (fórmula, tono, oxidante, tiempo, fecha, profesional) con RLS | **Sí** |
| **T5** | Recordatorio/confirmación por WhatsApp de un toque desde la agenda del día (plantilla por rubro, `wa.me`); envío automático queda para cuando haya API paga (DEMO → VENTA → INVERSIÓN) | No |
| **T6** | Runbook de alta: Factoque → peluquería (checklist del operador; «mismo negocio» bloqueado, decide el dueño) | No |

## Precio del paquete

Investigación del 10/11/2026: la sesión no pudo abrir las páginas oficiales de precios (red),
así que los valores de competencia salieron de resúmenes de buscador y quedan **[A VALIDAR]**,
no [V]. Detalle de fuentes en el informe del frente.

| Referencia | Precio | Estado |
|---|---|---|
| AgendaPro | desde USD 19–29 por usuario/mes | [A VALIDAR] |
| Booksy | USD 29,99/mes + USD 20 por miembro (EE. UU.) | [A VALIDAR] |
| Fresha | comisión por transacción; modelo en cambio (2026) | [A VALIDAR] |
| Factura en línea de ARCA | gratis | [A VALIDAR] |
| MP Point débito / crédito | 2,75 % / 4,19–5,19 % + IVA | [A VALIDAR] |

Propuesta (ARS por mes, final, **[E] estimado, a validar con el dueño**):

| Plan | Para quién | Incluye | Precio |
|---|---|---|---|
| **Factoque** | Monotributista que sólo factura | Factura ARCA (tope mensual del plan facturita) | Gratis / el plan vigente de Factoque |
| **Silla** | 1–2 profesionales | Turnos + reserva online + seña + caja + MP + factura | ARS 24.900 [E] |
| **Salón** | 3–6 profesionales | Silla + comisiones + stock de reventa + ficha de color + reportes | ARS 44.900 [E] |
| **Cadena** | 7+ o varias sucursales | Salón + multilocal + soporte prioritario | ARS 79.900 [E] |

Lógica [E]: un salón chico hoy paga agenda (USD 19–30) + facturador + planilla de caja; el
plan Salón queda por debajo de una sola agenda internacional por usuario cuando hay 3 o más
profesionales. Los precios no se publican hasta validar la competencia en pesos.
