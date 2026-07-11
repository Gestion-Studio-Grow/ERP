# Costos y Pricing — Suite de Facturación GSG

> Costo de PONER A FUNCIONAR cada producto por cliente (sin desarrollo) + pricing de venta.
> Dólar oficial venta $1.510 (10-jul-2026). Elaborado por GSG Lab · 2026-07-11.

## Costo fijo de plataforma y escalones

HOY (0 clientes cobrando): ARS ~700/mes en plata real (solo dominio .com.ar prorrateado $8.500/año; Vercel Hobby $0 + Neon Free $0). Ops fijas del dueño valorizadas a precio sombra (USD 30/h × $1.510): monitoreo $181.200 + tablas regulatorias $75.500 + buffer normativo ARCA $37.750 + KB/bot $90.600 = ARS ~385.000/mes — hoy es tiempo, no caja. ESCALONES: · CLIENTE 1 → salta Vercel Hobby→Pro OBLIGATORIO por ToS (uso comercial prohibido en Hobby, no por volumen): +USD 20 = ARS 30.200/mes → infra total ~ARS 31.000/mes. · CLIENTES ~5-15 → se agotan las 100 CU-h de Neon Free (DB despierta en horario comercial): +USD 15-25 pay-as-you-go = ARS 22.700-37.800/mes → EN EL ESCALÓN 10 CLIENTES: infra ~ARS 61.000-69.000/mes (+monotributo cat. A ~$42.400 si ya factura). · 50 CLIENTES: sin nuevo salto de plan; Neon sube leve por concurrencia (USD 20-30 compute) → infra ~ARS 68.000-76.000/mes (+monotributo cat. B-C $48.000-56.500). · 200 CLIENTES: TAMPOCO hay salto — Vercel Pro (1TB/10M incluidos) y Neon PAYG cubren hasta cientos-miles de tenants de bajo tráfico; compute ~0.5 CU sostenido + storage (~2-4 GB acumulados) → infra ~ARS 80.000-105.000/mes. El salto real a esa escala NO es de plan sino de SOPORTE: con >30 clientes A el soporte deja de caber en las horas del dueño (~15 h/mes) → contratar o automatizar. Fuera de escala relevada: Vercel seat extra USD 20/mes por dev; Neon Scale ($0.222/CU-h) solo si >16 CU. Todo a dólar oficial venta $1.510 (10-jul-2026). Confianza: precios Vercel/Neon relevados; umbrales de clientes estimados.

## A·COMERCIANTE
### Cliente SOLO típico (30 movs/mes, 2 alertas WA, plan $14.900)
- **Costo marginal:** ARS ~6.950/mes en régimen (≈47% del ticket; primeros 3 meses ~ARS 22.800 + onboarding one-time $90.600-135.900)
- **Desglose (ARS/mes):** infra 5 + IA 60 + WhatsApp 80 + soporte 6.800
- Supuestos: Infra: storage Neon ~1-2 MB/mes/tenant a $0.35/GB-mes (estimado, centavos de USD). IA: mapeo asistido solo en residuo <80% confianza (~$20) + descripciones ~30 ítems vía Batch API Haiku 4.5 (~$40) — el parser principal es determinista, costo cero. WA: 2 plantillas utility × USD 0.026 = ARS ~79 (si van dentro de ventana 24h abierta por el cliente → $0). Soporte: 0,15 h/mes en régimen × ARS 45.300/h (0,5 h los primeros 3 meses = $22.650). EL COSTO ES 98% SOPORTE — el plan SOLO tolera máx ~0,3 h/mes; sin KB/bot no cierra. NO incluido en cost-to-serve: comisión MP ~5,6% efectivo (10 días) = ~$831 + retención IIBB 1-2% (~$150-300, pago a cuenta) — descontar aparte del MRR. Estimado salvo tarifas Meta/Anthropic/Neon (relevadas).

### Cliente COMERCIO (100 movs/mes, nómina 3, 6 conversaciones WA, plan $39.900)
- **Costo marginal:** ARS ~13.970/mes en régimen (≈35% del ticket)
- **Desglose (ARS/mes):** infra 10 + IA 180 + WhatsApp 180 + soporte 13.600
- Supuestos: IA: mapeo ($30) + descripciones ~100 ítems Batch ($120) + conciliación difusa ($30), Haiku 4.5. WA: mix estimado 3 inicios utility ($118) + turnos de bot con IA (~12 × $5 = $60); conversaciones service iniciadas por el cliente son GRATIS en Meta. Soporte: 0,3 h/mes (3 usuarios de nómina generan más consultas que SOLO, aún lejos del 0,75-1 h de tiers altos). MP aparte: ~$2.225/mes (5,58% de $39.900). Soporte domina (97%); IA+WA+infra juntos son ~$370. Estimado.

### Cliente PYME (400 movs/mes, 2 cuentas bancarias, 10 conversaciones WA, plan $89.900)
- **Costo marginal:** ARS ~34.900/mes en régimen (≈39% del ticket)
- **Desglose (ARS/mes):** infra 15 + IA 590 + WhatsApp 300 + soporte 34.000
- Supuestos: IA: 2 extractos/mes → mapeo ×2 ($60) + descripciones ~400 ítems Batch ($480) + conciliación ($45); escala lineal con movimientos pero sigue siendo <USD 0.40/mes. WA: 5 utility ($196) + bot (~$100). Soporte: 0,75 h/mes (banda de tiers altos: multi-cuenta, feed bancario, más casos borde ARCA). Storage: ~4-6 MB/mes/tenant. MP aparte: ~$5.014/mes a 10 días. Incluso en el tier alto el costo variable técnico (infra+IA+WA ≈ $900) es <1% del ticket: el margen lo define el soporte. Estimado.

## B·CONTADOR
### Estudio contable con 10 clientes chicos (10 tenants + panel)
- **Costo marginal:** ARS ~182.500/mes por estudio (= ~ARS 18.250 por cliente de cartera; primeros 2 meses ~$318.000 por curva de aprendizaje; onboarding one-time $226.500-271.800 + 1-1,5 h por sub-cliente inicial)
- **Desglose (ARS/mes):** infra 50 + IA 500 + WhatsApp 800 + soporte 181.200
- Supuestos: Soporte: 3 h/mes al contador (nivel experto: casos fiscales borde, cierres, exportaciones) + 0,1 h/mes por sub-cliente (certificados, rechazos ARCA, altas) = 4 h × $45.300. El contador absorbe el soporte de 1er nivel de sus clientes — por eso el marginal por tenant es bajo. Infra: 10 tenants chicos × ~$5 storage. IA: uso liviano ~$50/tenant. WA: ~2 alertas utility/tenant ($39 c/u). Piso de pricing implícito: la cartera debe rendir >$18.250/cliente-activo/mes para no ir bajo agua a 10 clientes. Certificado ARCA: $0 en plata, 15-30 min por alta (delegación al CUIT de GSG a escala). Estimado.

### Estudio contable con 30 clientes
- **Costo marginal:** ARS ~276.000/mes por estudio (= ~ARS 9.200 por cliente de cartera — la base de 3 h se licúa: el modelo B mejora con carteras grandes)
- **Desglose (ARS/mes):** infra 150 + IA 1.500 + WhatsApp 2.350 + soporte 271.800
- Supuestos: Soporte: 3 h base + 30 × 0,1 h = 6 h/mes × $45.300. Infra: 30 tenants × ~$5. IA: 30 × ~$50 (sub-clientes chicos, mapeo determinista). WA: 30 × 2 utility × $39. El costo por cliente-activo cae de $18.250 (cartera 10) a $9.200 (cartera 30): el pricing por cliente-activo puede escalonar hacia abajo con volumen sin perder margen. Ojo capacidad: un solo estudio de 30 ya consume 6 h/mes del dueño; 3-4 estudios así saturan al equipo actual. Estimado.

## C·FACTURITA
### Usuario facturita free (5 facturas/mes, cero soporte humano por diseño)
- **Costo marginal:** ARS ~50/mes por usuario activo (contingencia máx si falla la regla de cero soporte: +$2.265 = 0,05 h)
- **Desglose (ARS/mes):** infra 2 + IA 10 + WhatsApp 40 + soporte 0
- Supuestos: Emisión ARCA WSFEv1: $0 por factura, sin límite (web service público, relevado) — 5 facturas cuestan literalmente cero. Infra: tenant liviano, ~5-15 KB/mes de storage. IA: emisión determinista; solo turnos ocasionales de bot WA (~$5/turno con Haiku). WA: respuestas del bot dentro de ventana 24h GRATIS en Meta; presupuestada 1 utility eventual ($39). Soporte: $0 por regla de diseño (self-serve + video + FAQ + bot; sin canal humano publicado); métrica de control: si supera 0,05 h/mes/usuario, arreglar UX antes que contratar. La fricción del certificado ARCA es el gancho de upgrade a plan A (ahí se cobra el onboarding). Conclusión: regalar C cuesta ~$50/usuario/mes — funnel viable incluso con miles de usuarios free. Estimado sobre tarifas relevadas.

---
INFORME DE PRICING FINAL — SUITE FACTURACIÓN GSG
(Elaborado sobre unit economics y costos base relevados al 11-jul-2026, dólar oficial venta $1.510. Todo lo estimado está marcado. Regla de la casa respetada: cobro por MP en pesos, self-serve, tiers por volumen — nunca por usuario —, margen IA ≥50-60%.)

---

## 1) PRODUCTO A — Validación de la escalera

**Veredicto: la escalera está bien parada en los tiers medios y altos; el problema está en SOLO, y no es el precio — es el soporte y el onboarding.**

Margen bruto real por plan (descontando cost-to-serve + comisión MP a 10 días 5,58% + fricción IIBB 1,5% estimada):

| Plan | Precio | Cost-to-serve | MP + IIBB | Margen $ | Margen % |
|---|---|---|---|---|---|
| SOLO | $14.900 | $6.950 | ~$1.056 | $6.894 | **46%** |
| COMERCIO | $39.900 | $13.970 | ~$2.826 | $23.104 | **58%** |
| PYME | $89.900 | $34.900 | ~$6.364 | $48.636 | **54%** |
| CM | $149.900 | ~$58.800 (estimado: 1,25 h soporte + IA escalada) | ~$10.614 | $80.486 | **54%** (estimado) |

Lecturas honestas:

- **El costo es 97-98% soporte.** Infra+IA+WhatsApp juntos son $145-905/mes por cliente en toda la escalera — no mueven la aguja. El margen lo define cuántas horas tuyas consume cada cliente. La IA cumple sobrada la regla de margen 50-60% (cuesta centavos).
- **SOLO pierde plata con uso intensivo.** El plan tolera máximo ~0,3 h/mes de soporte. Un cliente SOLO "pesado" (0,5 h/mes) cuesta ~$22.800 → margen NEGATIVO. Y los primeros 3 meses TODO cliente SOLO va bajo agua (~$22.800/mes de costo + onboarding one-time de $90.600-135.900 = 13 a 20 meses de payback solo del alta).
- **CM no tenía escenario costeado**: lo estimé grueso; antes de vender el primero, medir.

**Ajustes propuestos (no tocar los precios de lista, tocar las condiciones):**

1. **SOLO: mantener $14.900** (es el ancla de mercado y está por debajo del piso psicológico — ver punto 5), pero con **fair use explícito**: soporte humano hasta 0,3 h/mes; pasado eso, bot/KB primero, y sesión de soporte extendida a $9.900. Sin esto, SOLO es una lotería.
2. **Cobrar el alta**: setup/onboarding SOLO $49.900 one-time, **bonificado 100% si paga plan anual** (anual = 10 meses). Eso corta el payback de 13-20 meses a 4-6 y empuja el prepago (caja + inflación a favor).
3. **Ruta preferida de entrada a SOLO: vía Facturita** (certificado ARCA ya resuelto por el usuario en self-serve) → el onboarding cae de $90-135k a casi cero. SOLO "de la calle" paga setup; SOLO "graduado de C" no.
4. COMERCIO, PYME y CM: **validados sin cambios**. Son los planes donde hay que empujar la venta (58% y 54% de margen real).

---

## 2) PRODUCTO B — Pricing del contador (a diseñar → diseñado)

Costo real relevado: cartera 10 = $182.500/mes (=$18.250/cliente); cartera 30 = $276.000/mes (=$9.200/cliente). La base de 3 h de soporte experto se licúa con carteras grandes: **B mejora con volumen, y a cartera chica es apenas break-even contable.**

**Opciones evaluadas:**

- **(a) Por cliente activo/mes con mínimo**: $19.900/cliente (1-10), $12.900 (11-30), $8.900 (31+), mínimo 10 clientes facturables. A cartera 10 → $199.000 vs costo total ~$197.600: **margen ~1% contable**. No cierra abajo, cierra arriba. Flexible pero impredecible para el estudio.
- **(b) Packs de cartera (RECOMENDADA — simple, predecible, self-serve):**

| Pack | Precio/mes | $/cliente | Costo (incl. MP+IIBB) | Margen % contable | Margen % de caja* |
|---|---|---|---|---|---|
| CARTERA 10 | $249.000 | $24.900 | ~$201.400 | **19%** | ~93% |
| CARTERA 30 | $449.000 | $14.966 | ~$310.000 | **31%** | ~92% |
| CARTERA 100 | $990.000 | $9.900 | ~$677.000 (estimado) | **32%** (estimado) | ~92% |

*Margen de caja = descontando solo lo que sale en plata (infra+IA+WA+MP+IIBB); el soporte es tu tiempo valorizado a $45.300/h, no un pago. **Honesto: a cartera 10 no ganás plata "extra", te pagás el sueldo.** El negocio B es de carteras 30+.

Condiciones del diseño:
- **Mínimo de entrada: pack CARTERA 10.** No aceptar estudios de 3-5 clientes: cada estudio te consume 3 h/mes de base sí o sí.
- **Tope de capacidad (crítico):** un estudio de 30 consume 6 h/mes tuyas; uno de 100, ~13 h. Con el equipo actual entran **3-4 estudios medianos, no más** — B escala cuando contrates/automatices soporte, no antes.
- Excedente sobre el pack: $14.900/cliente adicional/mes (empuja el upgrade al pack siguiente).

**Incentivo de canal (graduación a A directo):** si un cliente de la cartera crece y contrata A por su cuenta, el contador cobra **20% del abono del cliente durante los primeros 12 meses** (ej.: gradúa a COMERCIO → $7.980/mes × 12 = ~$95.800). Te cuesta ~8 puntos de margen del primer año sobre un plan que rinde 58% — lo pagás con gusto: CAC cero y el contador deja de defender al cliente en su cartera. Acreditar como descuento en la factura del pack (sin plata que viaje = sin fricción fiscal).

---

## 3) PRODUCTO C — Facturita

- **Costo real de regalar un usuario: ~$50/mes** ($2 infra + $10 IA + $40 WA, con emisión ARCA a costo literalmente cero). Estimado sobre tarifas relevadas. La contingencia es UNA sola: que se rompa la regla de cero soporte humano (cada 0,05 h/usuario/mes son +$2.265 — ahí se arregla UX, no se contrata gente).
- **¿Cuántos free aguanta el fijo?** Con la infra del escalón actual (~$31.000/mes con Vercel Pro): cada **1.000 usuarios free activos ≈ $50.000/mes** de marginal — se financia con el margen de **~7-8 clientes SOLO** o **2-3 COMERCIO**. Con la base pagante proyectada (20-30 clientes A), **2.000-3.000 usuarios free son sostenibles sin despeinarse**. El límite práctico antes que la plata: que el bot WA y las 100 CU-h de Neon aguanten la concurrencia (a ~1.000+ usuarios el compute Neon sube unos USD 10-20/mes más, estimado).
- **¿$0 o $2.900?** **$0, sin dudarlo.** Cobrar $2.900 por MP deja ~$2.700 netos, mete fricción de alta de pago exactamente donde queremos CERO fricción, genera soporte de cobranza (rechazos, bajas) que vale más que lo recaudado, y mata el volumen del funnel. C no es un producto, es el CAC de A.
- **Límites free (el trigger de conversión):** 5 facturas/mes · 1 punto de venta · sin extracto bancario · sin MP · alertas WA básicas · sello "hecho con Facturita". **Triggers de upgrade a A SOLO:** factura n°6 del mes (pantalla de upgrade en el momento exacto del dolor), pedir extracto/conciliación, o pedir cobros MP. El certificado ARCA ya resuelto en C hace que el upgrade a A sea sin onboarding (ver punto 1.3).
- Variante opcional si querés monetizar algo sin romper el funnel: "Facturita Plus" $4.900/mes (30 facturas, sin sello) como escalón intermedio — **pero no lo lanzaría hasta medir la conversión C→A** (riesgo: canibaliza SOLO).

---

## 4) TABLA RESUMEN FINAL

| Producto | Plan | Precio/mes | Costo marginal/mes | Margen bruto real* | Break-even (clientes para cubrir fijo**) |
|---|---|---|---|---|---|
| A | SOLO | $14.900 | $6.950 | 46% | 16 |
| A | COMERCIO | $39.900 | $13.970 | 58% | 5 |
| A | PYME | $89.900 | $34.900 | 54% | 3 |
| A | CM | $149.900 | ~$58.800 (est.) | ~54% (est.) | 2 |
| B | CARTERA 10 | $249.000 | $182.500 | 19% (caja ~93%) | 3 estudios (ojo capacidad) |
| B | CARTERA 30 | $449.000 | $276.000 | 31% (caja ~92%) | 1 estudio |
| B | CARTERA 100 | $990.000 | ~$677.000 (est.) | ~32% (est.) | 1 estudio (13 h/mes tuyas) |
| C | FREE | $0 | ~$50/usuario | −$50/usuario (funnel) | n/a — lo financian ~8 SOLO por cada 1.000 free |

*Margen real = neto de cost-to-serve + MP 5,58% (acreditación 10 días) + IIBB ~1,5% estimado.
**Fijo de referencia: escalón ~10 clientes = infra ~$65.000 + monotributo ~$42.400 ≈ **$107.000/mes en plata**. Si además querés cubrir las ops fijas valorizadas de tu tiempo (~$385.000/mes, precio sombra), multiplicá por ~4,6: ahí el número honesto es ~60 SOLO o ~20 COMERCIO — por eso la venta se empuja hacia arriba de la escalera.

**Mix objetivo sugerido para mes 6:** 10 SOLO + 6 COMERCIO + 2 PYME + 1 estudio CARTERA 10 ≈ MRR $1.050.000 con margen real ~$460.000/mes sobre un fijo en plata de ~$110.000. Cierra.

---

## 5) RIESGOS DE PRICING

1. **Inflación → revisión trimestral, NO indexación contractual.** Indexar por IPC en el contrato asusta en la venta y es rígido. Regla operativa: revisión de lista cada trimestre con aviso de 30 días, y **plan anual prepago como cobertura mutua** (el cliente congela precio, vos hacés caja). Los packs B, igual. Primera revisión programada: octubre 2026.
2. **Dólar en los costos: exposición REAL baja, no cero.** Vercel+Neon+Anthropic facturan en USD, pero suman USD 40-55/mes para TODA la plataforma (~4-6% del costo total; el 95% del costo es soporte, en pesos). Una devaluación del 50% te mueve el costo total <3%. Ojo con lo que sí está dolarizado de facto: tu precio sombra hora ($45.300 = USD 30) — si ajustás tu tarifa con el dólar, el cost-to-serve sube en paralelo y el punto 1 (revisión trimestral) lo absorbe. Meta ya factura WhatsApp en ARS desde abr-2026. Percepciones por pagos al exterior sobre la tarjeta: verificar, no incluidas.
3. **Piso psicológico del mercado (estimado, del blueprint de referencia):** los competidores de facturación cloud AR (Xubio, Colppy, Contabilium) arrancan en la zona de $20.000-40.000/mes. SOLO a $14.900 queda **debajo del piso de mercado** — es deliberado (ancla de entrada), pero significa dos cosas: (a) hay espacio para llevarlo a $17.900-19.900 en la revisión de Q4 sin perder competitividad, y (b) NO bajar de ahí nunca: más barato que $14.900 el mercado no lo lee como "accesible", lo lee como "juguete" — para eso ya existe Facturita gratis, que es quien pelea abajo.
4. **Riesgo silencioso n°1 (no es de precio pero mata el pricing): el soporte.** Todos los márgenes de arriba asumen la disciplina de horas (SOLO 0,15 h, COMERCIO 0,3 h, PYME 0,75 h). Sin KB + bot WA operativos, los 46-58% de margen son ficción. La inversión que más protege el pricing no es infra: es documentación y self-serve.
5. **Comisión MP:** la tabla usada (4,61%+IVA a 10 días) fue relevada por fuentes secundarias porque el sitio oficial bloquea el fetch — **verificar el % exacto en la cuenta MP antes de publicar precios**.

— Elaborado por GSG
