# MIA Producciones — lo que le cobra GSG (propuesta)

**Estado: PROPUESTA, no adoptada.** Escrita el 04/11/2026. Precio, descuento y forma de cobro los decide el dueño
(decisión comercial, ADR-048). Antes de adoptarla como base para otras productoras pasa por el Challenger (ADR-045).
Hasta hoy no había ningún precio escrito para MIA ni para el rubro productora: esto es la primera versión, no un ajuste.

## De dónde salen los números

| Dato | Valor | Fuente |
|---|---|---|
| Marco de precios PyME/Empresa de GSG | Base $60.000–120.000 (1–3 usuarios) + $8.000–15.000 por usuario + $15.000–40.000 por módulo, por mes | `docs/estrategia/comercial/documento-fundacional-comercial.md:222-224` `[SUPUESTO]` |
| Lo que cobra el mercado a una PyME con todo integrado | $30.000–50.000 y hasta $100.000–230.000+ por mes (Tango, Xubio completo) | `docs/estrategia/comercial/onboarding-director.md:256-268` |
| Dólar de referencia | $1.510 (oficial venta, 10/07/2026) | `docs/producto/costos-pricing-suite.md:8` — **provisional a confirmar**, está viejo |
| Hora de soporte a precio sombra | USD 30 | `docs/producto/costos-pricing-suite.md:8` |
| Modelo de IA cuando se cargue la clave | `claude-opus-5-5`, hasta 8.000 tokens de salida por pedido | `src/lib/proyectos/ia.server.ts:21,90` |
| Precio de ese modelo | USD 4 por millón de tokens de entrada, USD 20 de salida (Sonnet 5.5: 2 / 10) | Tabla de precios de Anthropic, vigente al 06/10/2026 |
| Archivos | Cloudflare R2, hasta 200 MB por archivo | `src/lib/proyectos/r2-core.ts:35` |
| Heka (el sistema que se tomó de modelo) | **Precio desconocido**: no se relevó | `docs/benchmark/heka-2026-11-01.md` |

## Qué recibe MIA

No es un plan de comercio: tiene 11 apps propias (Proyectos, Diseño con armador 3D, Calendario, Proveedores,
Administración con bancos y conciliación, Dirección, Liquidaciones, Agentes IA, Propuesta con IA, Equipo y permisos),
seis roles, verificación en dos pasos, link del cliente sin login y su sitio publicado. Está en el escalón de arriba
del marco PyME, cerca del de Empresa.

## Lo que nos cuesta atenderla (por mes)

| Rubro | Estimado | Cómo |
|---|---|---|
| Infra propia de MIA | USD 2–5 | R2 a USD 0,015/GB-mes (10 GB sin cargo) con 50–200 GB de piezas y renders; mails dentro del cupo gratis de Resend. Vercel Pro y Neon se reparten con los demás negocios. |
| IA de texto (Opus 5.5) | USD 35–120 | ~USD 0,12 por pedido (≈15.000 tokens de entrada + 3.000 de salida) × 300–1.000 pedidos/mes. **[A VALIDAR]**: no hay medición real, sólo pruebas simuladas. |
| IA de imágenes | USD 0 hoy | Cupo gratis de Cloudflare o Pollinations. Al vender no hay servicio pago elegido: **[A VALIDAR]**. |
| Soporte | 3–5 h → USD 90–150 a precio sombra | Es tiempo del equipo, no sale de caja. Los primeros 3 meses, el doble. |
| **Total de caja** | **USD 37–125 (≈ $56.000–189.000)** | Lo que manda es la IA. |

## La propuesta

Precios por mes, en pesos, más IVA si corresponde (ver «A confirmar»), con ajuste trimestral.

| Plan | Qué incluye | Precio |
|---|---|---|
| **Productora** | Las 11 apps menos los agentes IA, hasta 8 usuarios, soporte por WhatsApp en horario hábil | **$260.000** (≈ USD 172) |
| **Productora + IA** ⭐ recomendado | Todo lo anterior, hasta 12 usuarios, agentes, propuesta y borrador de stand con IA con un **cupo de 400 pedidos por mes** | **$390.000** (≈ USD 258) |
| Usuario extra | Por persona | $12.000 |
| IA por encima del cupo | Paquete de 200 pedidos más | $45.000 |
| **Puesta en marcha** (una vez) | Alta, carga de costos del armador y proveedores, migración de lo que tengan en planillas, capacitación por rol y dos pasos para Dirección y Administración | **$1.200.000** (≈ USD 800). Bonificada al 100 % con contrato anual. |

Así se arma el plan recomendado con el marco de GSG: base $110.000 + 9 usuarios × $12.000 + Proyectos/eventos
$40.000 + Administración y finanzas $35.000 + Diseño y armador 3D $35.000 + IA $60.000 ≈ $388.000.

**Margen de caja del plan recomendado:** con IA alta (USD 125 ≈ $189.000), queda un 52 %; con IA baja, un 86 %.
Si se suma el soporte a precio sombra (USD 150 ≈ $226.000), con IA alta queda en cero, y en los meses de
arranque, con el doble de soporte, da pérdida. Por eso el cupo de IA y la
puesta en marcha cobrada (o el contrato anual) no son opcionales.

### La versión más barata: «Productora Esencial»

| Qué incluye | Precio |
|---|---|
| Las mismas apps, sin IA. Hasta **5 usuarios**. Soporte por WhatsApp con tope de **2 h por mes**. | **$175.000** por mes (≈ USD 116) |
| Puesta en marcha | $600.000, bonificada con contrato anual |

Sale con el marco de GSG: base $110.000 (3 usuarios) + 2 usuarios × $12.000 + módulo Proyectos/eventos $40.000 ≈ $174.000.
No se le sacan apps porque ya están hechas y no nos cuestan más: lo que cuesta es el soporte, y ahí va el tope.
**Piso:** infra USD 5 + 2 h de soporte a USD 30 = USD 65 ≈ **$98.000**. Por debajo de eso perdemos.
Con el 30 % de primer cliente quedaría en $122.500, todavía arriba del piso. Si después quieren IA o más gente, pasan
al plan «Productora + IA» sin otra puesta en marcha.

### Precio de primer cliente del rubro (a decidir)

MIA es el caso con el que se le va a vender a otras productoras. Opción: **30 % menos durante 6 meses**
($273.000 por el plan con IA), a cambio de (1) contrato anual, (2) validar las siete reglas que GSG fijó sin
ellos (`README.md`, «Reglas fijadas el 02/11/2026») y (3) permiso escrito para usarlos de caso de éxito. Al
mes 7 pasa al precio de lista sin renegociar.

## Lo que mueve el número

- **Sacar la IA de Opus:** los agentes con Sonnet 5.5 cuestan la mitad (USD 0,06 por pedido). Es un cambio de
  una línea (`ia.server.ts:21`), pero hay que probar la calidad del texto en castellano. Decisión técnica, no comercial.
- **Cobrar en dólares:** MIA vende en dólares (`README.md`, «Eventos en dólares»). Indexar el abono al dólar
  oficial lo protege de la inflación mejor que el ajuste trimestral. Lo decide el dueño.
- **Usuarios:** no se sabe cuántas personas tiene MIA. La propuesta supone 10 (**provisional a confirmar**).

## A confirmar antes de mandarla

1. **Cómo factura GSG.** Si es monotributo, la factura es C y MIA no se puede descontar el IVA; con 12 meses de
   abono más la puesta en marcha, revisar el tope anual de la categoría. Consultar al contador.
2. **Cuántos usuarios y cuántos eventos por mes tiene MIA.** Cambia el cupo de IA y el precio por usuario.
3. **Cuánto paga hoy MIA (Heka, planillas, monday, lo que use).** Sin ese dato no se puede decir si $390.000 es caro o barato para ellos.
4. **Dólar del día** para la referencia en USD.
5. **Consumo real de IA:** medir los primeros 30 días con la clave cargada y ajustar el cupo.
