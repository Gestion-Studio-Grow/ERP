# Análisis comercial del GSG Lab — noviembre 2026 (cinco preguntas del dueño)

> **04/11/2026** · contexto local (`CICLO-2026-11-04.md`, `preventa/pedido-facturita-iibb-caba.md`, ADR-078, `docs/producto/costos-pricing-suite.md`,
> `productos/kudos|testigo/ARQUITECTURA.md`) + una vuelta del `gsg-investigador` en Opus (9 búsquedas; ningún fetch directo pasó por dominios
> no permitidos: **todo dato web queda [A VALIDAR]**). Dólar de referencia **$1.510** (ADR-078). Precios, señas y pauta: **provisional a confirmar por el dueño** (§C).

## (a) Precio de Comerciante Solo frente a «$4.999 por facturar ilimitado por WhatsApp»

**Hecho:** el competidor se llama **Facturitas** (bot de WhatsApp): plan Monotributo **$4.999/mes** ilimitado, plan Web $7.999,
14 días gratis (iProfesional, 2026 [A VALIDAR]). **Alerta de marca:** el nombre choca con *Facturita* → riesgo de confusión y de
reclamo; revisar antes de cualquier campaña (§C).

**Lectura:** SOLO no vende facturación, vende **caja + cobros + extracto** (ADR-076/078). Cost-to-serve $6.950 (98 % soporte) + MP
e IIBB ~$1.056 → a $14.900 deja $6.894 (46 %); a $4.999 **pierde plata**. Bajarlo no se sostiene; dejarlo solo tampoco: el gancho
«factura n° 6» manda al usuario gratis (tope 5) a $14.900 y el mercado tiene un escalón a $5k.

**Propuesta: reempaquetar en tres escalones.**
| Escalón | Precio/mes | Qué da | Soporte |
|---|---|---|---|
| Facturita gratis | $0 | 5 facturas/mes (sin cambio) | 0 por diseño |
| **Facturita Plus (nuevo)** | **$6.900** (anual $5.900/mes) | facturas ilimitadas + planilla de monotributo + recordatorios | 0 humano: sólo bot/FAQ |
| Comerciante Solo | **$14.900 (se sostiene)** | lo anterior + caja, cobros MP, extracto y conciliación | fair-use 0,3 h/mes |

Por qué $6.900 y no $4.999: igualar invita a guerra de precios con quien ya está ahí; $6.900 queda «menos de 7 lucas», con costo
técnico de ~$50 + MP $385 + IIBB ~$100 → margen ~90 % si el soporte humano es cero (la regla de Facturita gratis, que ya se cumple).
Costo de la decisión: el disparador «factura n° 6» pasa a convertir a Plus y no a SOLO; SOLO se vende por cobros y conciliación.

## (b) Facturita: ¿hace falta de verdad?

**Como producto suelto, no:** ARCA emite gratis, YoFacturo regala 30 facturas/mes, Facturitas cobra $4.999 [A VALIDAR]. **Como
embudo del ERP, sí:** un usuario activo cuesta ~$50/mes (ADR-078) y llega con el certificado de ARCA resuelto, lo que baja el
onboarding de SOLO de $90–135k a casi cero. Es el CAC más barato que tiene GSG: se mantiene.

**Ganchos, uno por uno:**
- **Leyenda de IIBB CABA (Res. AGIP 339/2026, vigencia 1/1/2027):** alcanza a todos los contribuyentes de Ingresos Brutos
  **excepto el Monotributo** (Dec. 107/2026 y Res. 169/2026 [A VALIDAR con la norma y el contador]). **No es gancho para Facturita**
  (su usuario es monotributista). Es **cumplimiento obligatorio** para los clientes responsables inscriptos del ERP con punto de
  venta en CABA (Comerciante Solo/Comercio/Pyme) → el pedido `preventa/pedido-facturita-iibb-caba.md` se mantiene, pero cambia de
  dueño: frente ERP/fiscal, campaña «listo para el 1/1» dirigida a comercios inscriptos, no a la base gratis.
- **Planilla de monotributo (recategorización 5/2/2027):** ya fue descartada como producto pago en el ciclo; como gancho gratis sirve
  y es barata (cálculo determinista sobre las facturas ya emitidas). Va dentro de Facturita Plus como contenido, con campaña por
  email/ventana de 24 h en enero.

**Veredicto:** Facturita sigue, pero reposicionada: gratis → Plus ($6.900) → SOLO. La leyenda IIBB se construye por cumplimiento del
ERP (Gate + certificación fiscal sobre el diff); el gancho de la base gratis es la planilla, no la leyenda.

## (c) Kudos gestionado: costo real por cliente/mes

Supuestos: 30 reseñas/mes por local; prompt de marca cacheado ~1.500 tokens de entrada + ~300 de salida por reseña; 200 pedidos de
reseña por WhatsApp al mes; tarifas Meta desde 1/1/2026: utilidad US$0,0299, marketing US$0,071 [A VALIDAR]; dólar $1.510.

| Rubro | Cálculo | ARS/mes |
|---|---|---|
| IA (Sonnet 5.5, US$2/10) | 30 × (1.500 × 2 + 300 × 10) / 1M = US$0,18 | ~$270 |
| IA (Opus 5.5, US$4/20) | 30 × (1.500 × 4 + 300 × 20) / 1M = US$0,36 | ~$540 |
| Voz de marca inicial (Opus, 20k in / 2k out) | US$0,12, una vez | ~$180 |
| Meta: pedidos de reseña | 200 × utilidad US$0,0299 = US$6 (si van en ventana de 24 h abierta por el cliente: $0) | $0–9.000 |
| MP 5,6 % + IIBB 1,5 % sobre $60.000 | | ~$4.260 |
| **Horas humanas «gestionado»** | 3–4 h × $45.300 | **$136.000–181.000** |
| Horas humanas «supervisado» (sólo aprobar borradores 1★ en tablero) | 1 h × $45.300 | $45.300 |

**Margen sobre $60.000 fundador:** gestionado **−$90k a −$135k contable** (en caja +$46–55k, pero es tu tiempo); supervisado
**+$1k a +$10k contable** (+$46–55k caja). El costo técnico es < 1 % del ticket: **el margen lo decide la hora humana**, no el
modelo (Opus vs Sonnet son $270 de diferencia: Sonnet 5.5 y listo).

**Veredicto: conviene sólo como caja de transición, con dos condiciones:** (1) tablero de aprobación antes del 3.er cliente para que
sea «supervisado» (≤ 1 h/mes), (2) lista $90.000 después de los 3 fundadores a $60.000. Tope: 5 locales. Sin tablero, cada cliente
cuesta más de lo que paga. La autorización registrada de la marca del cliente sigue siendo previa.

## (d) Factura Social (ARCA RG 5893/2026)

**Hechos [A VALIDAR en la fuente oficial, que no se pudo leer]:** la RG 5893 (BO 31/8/2026) obliga a factura electrónica al
monotributo social y promovido desde el **1/11/2026** y a los exentos de IVA desde el 1/3/2027; el talonario queda sólo de
contingencia; si no hay punto de venta, ARCA lo crea; **en cooperativas factura la persona jurídica**. No existe una «factura social»
ni un canal oficial por WhatsApp: el nombre es nuestro. La responsabilidad del tercero que factura por cuenta de otro no está escrita.

**Lo que cambia el piloto:** en una cooperativa hay **un solo CUIT**: el riesgo de «cientos de CUIT de gente vulnerable» desaparece y
el producto es el ERP de siempre (una cuenta, un punto de venta o ítem por efector). El riesgo alto queda en ferias y efectores
individuales: cada uno debe delegar el webservice a GSG desde su clave fiscal (el mismo muro que mató Buzón ARCA).

**Piloto afinado:**
- **Forma 1 (preferida):** 1 cooperativa, 1 CUIT, ≤ 30 efectores como «vendedores» dentro del tenant. Paga la cooperativa:
  $14.900/mes (= SOLO) o $3.000–6.000 por efector si prefiere por padrón. Cero claves ajenas.
- **Forma 2 (sólo con carta de intención firmada):** ≤ 10 efectores individuales con delegación formal registrada por cada uno; paga
  la organización o el programa que los acompaña, nunca el efector.
- **Qué certificar (adversarial, sobre el diff):** cada comprobante sale del CUIT correcto con su propio punto de venta y CAE; no se
  reutiliza certificado entre CUIT; consentimiento registrado por efector; corte limpio (si GSG se apaga, el efector sigue facturando
  en ARCA sin perder nada); límites de categoría del monotributo social avisados antes de emitir.

**Veredicto:** vale un piloto, **sólo Forma 1**; Forma 2 recién con carta y seña. Sin carta de intención de una cooperativa, no se
construye nada: Facturita ya emite factura C y la demo alcanza para vender.

## (e) Testigo: prueba con Meta Ads (sin llamadas)

**Público:** dueños y encargados de empresas de control de plagas y desinfección; AMBA (CABA + GBA) primero. Intereses («control de
plagas», «fumigación», «desinfección», «consorcios») + cargo (dueño/gerente/responsable técnico) + edad 28–60. El registro de
empresas de CABA (Res. APRA 281/2026 [A VALIDAR]) sirve como público personalizado si es público. Objetivo de campaña: **clic a
WhatsApp** (la conversación que nace de un anuncio abre ventana gratis de 72 h). El tamaño del padrón no se encontró: lo da la prueba.

**Tres creatividades (todas con el PDF real `productos/testigo/ejemplo/parte-ejemplo.html`):**
1. **«El parte en 40 segundos»**: video vertical de 15 s: operario saca foto + manda audio por WhatsApp → aparece el PDF firmado.
2. **«El certificado mensual sin volver a la oficina»**: carrusel de 3: certificado de desinfección obligatorio en CABA (Res. APRA
   245/2018) → hoy (papel, fotos sueltas) → con Testigo (PDF por cliente, listo para el consorcio).
3. **«Tus operarios ya mandan partes por WhatsApp»**: imagen fija con captura de un chat real y el PDF; copy: «lo único que cambia es
   que ahora queda escrito, firmado y archivado».

**Presupuesto de prueba (§C, provisional):** $15.000/día × 14 días = **$210.000** (~US$140). Con CPM US$3–12 y CPC US$0,20–1,50
de LatAm [A VALIDAR]: 90–280 clics, 20–55 conversaciones, **1–3 señas** esperadas al 5 %.

**Métrica de corte:** costo por seña **≤ $70.000** (menos que un mes de 3 operarios, provisional) y costo por conversación calificada
≤ $5.000. Corte anticipado: si a los $100.000 gastados no hay ninguna conversación calificada, se apaga y se cambia el público, no el
producto. La seña ($80.000 = primer mes de 3 operarios, provisional) se cobra por link de MP.

**Landing mínima:** una página bajo `/lab` (sin dominio nuevo): titular, el PDF de ejemplo embebido, 3 viñetas (foto+audio → PDF
firmado · certificado mensual · nunca inventa datos: firma el responsable técnico), botón de WhatsApp con mensaje prellenado y link
de seña. Sin formulario ni cuentas. Requisitos §C: cuenta publicitaria de Meta con medio de pago y número de WhatsApp Business.

## Consumo de esta vuelta (estimado; `medir-consumo.mjs` no corrió porque Factory-GSG no está clonada)
Fable 5.1 (juicio y redacción) ~45k entrada / ~7k salida ≈ US$0,80 · Opus 5.5 (`gsg-investigador`) ~35k / ~3k ≈ US$0,20 · **total ≈ US$1,00**.

— Elaborado por GSG
