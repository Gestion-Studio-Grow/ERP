# TESVO — Reingeniería de la gestión de una importadora puerta a puerta (RAE sobre Aerobox y referentes)

**Fecha:** 2026-10-15 · **Método:** skill `ingenieria-reversa` (`.claude/skills/ingenieria-reversa/SKILL.md`)
**Etapa comercial:** preventa → **todo es DEMO a costo cero** (sin datos reales, sin persistencia, sin dominio propio).
**Entregable vivo:** `public/previews/tesvo/gestion/` (fuente) → `src/tenants/tesvo/sitio/gestion.html` (lo que sirve el ERP en
`tesvo.gsgapp.com.ar/gestion`) · motor `motor.mjs` · tests `src/tenants/tesvo/motor-gestion.test.ts` (39) · cómo se publica: [`GESTION.md`](GESTION.md).

> **Qué es esto.** Desarmamos cómo gestionan por dentro los que ya hacen lo de TESVO: **Aerobox**, el referente local con
> casilla en Miami, y sus pares locales y globales. Separamos lo que es del rubro de lo que es de cada mercado, lo
> adaptamos a TESVO (China, Miami y Paraguay; aéreo, marítimo y terrestre; personas y pymes) y lo construimos: una
> gestión por rol (**Atención**, **Depósito**, **Dueño**) con un motor de reglas testeado. Todo lo que no se verificó
> en una fuente dice **inferido**.

---

## 0. Calibración (ADR-052)

- **Lo que ya existía.** La sesión TESVO del 06–08/10 construyó en la PC del dueño la rama `frente/tesvo` (51 commits,
  **sin pushear**): blueprint y módulo `comex`, vidriera con cotizador «la frase», seguimiento por código y un panel
  Cotizaciones/Envíos/Tarifas sobre `prisma/pending-gate2/Comex.sql` (Gate 2 sin aplicar). Este trabajo **no la pisa**:
  vive en `/gestion`, no toca el schema ni la `/tienda`, y su motor es la especificación ejecutable para el panel real
  cuando la rama llegue a GitHub (ver §8).
- **Principios de esta pasada.**
  1. **El cliente no se entera en destino.** Toda diferencia (peso, impuestos, daño, prohibido) se avisa en origen, antes de embarcar.
  2. **Nada se embarca incompleto.** Sin dueño, sin seña, con diferencia sin avisar o con un prohibido adentro, no sube.
  3. **El régimen es un dato**, no código: franquicia, tope, cupo y alícuotas los edita el dueño con PIN cuando ARCA cambia algo.
  4. **Argentina primero:** dólar del día y dólar congelado por seña, transferencia y Mercado Pago, WhatsApp con el mensaje listo.
  5. **Demo honesta:** tarifas y alícuotas de demostración, rotuladas; balanza y cámara del depósito simuladas y dichas.
- **Zona de de-sesgo (ADR-046):** motor, impuestos y plata = **estándar**. Textos de pantalla y de WhatsApp = **criolla**
  («Pesa 12,8 kg y habíamos cotizado 3 kg: la diferencia es de US$ 244,20. ¿Seguimos?»).
- **Marca:** se usa la marca real de TESVO leída de su sitio el 07/10. **No consta el OK registrado de TESVO (ADR-034/042):
  se construye igual, pero es bloqueante antes de mostrársela a alguien fuera de GSG** (§9).

---

## 1. Referentes (sólo lo público)

| Referente | Mercado | Qué define del rubro | Fuente principal |
|---|---|---|---|
| **Aerobox** | Argentina · casilla en Miami, depósito en China, área pymes | Pre-alerta como declaración jurada, foto + peso al recibir, consolidación a pedido, cobro al llegar a Buenos Aires | aerobox.com.ar (FAQ, términos, tarifas, calculadora) |
| **Aerolíneas Argentinas Courier** | Argentina · casilla en Miami (relanzada 02/2025) | 30 días de guarda sin costo, 2 vuelos diarios, cotizador por valor, peso y medidas | Infobae 19/02/2025 · iProUP |
| **PuertoBox · BRYX** | Argentina · China para pymes | Cotizador con CIF, derechos, tasa e IVA; honorario mínimo + % del CIF; anticipo y saldo al llegar | puertobox.com.ar · bryx.com.ar |
| **MyUS · Shipito · Aeropost** | EE. UU. / LatAm · package forwarding | Estados del paquete, valor declarado con factura, almacenaje gratis y después por día, consolidación, devolución al vendedor | myus.com/faq · shipito.com/en/help · aeropost.com |
| **Flexport · Freightos** | Global · forwarder digital B2B | Cotización por renglones con vencimiento, hitos estimado vs. real, **excepciones que frenan la carga**, landed cost por producto | support.portal.flexport.com · freightos.com/standard-operating-procedure |

**Verificado** (aparece en la fuente; el proxy de la sesión no dejó abrir las páginas enteras, se leyeron los fragmentos indexados):
- Aerobox: pre-alerta por tracking con factura, **«tiene carácter de declaración jurada»**; al recibir en Miami suben **foto, peso y valor** y avisan por mail en ~24 h hábiles; producto prohibido queda **«retenido en Miami»**; se cobra **el mayor entre peso real y volumétrico**; **manejo documental por paquete** que sale (USD 5, 10 o 20 según la página); entrega CABA USD 15 · PBA 25 · interior 30; límites 50 kg y USD 3.000; **5 envíos por año por CUIT/CUIL y 3 ítems de la misma especie**; se paga **al llegar a Buenos Aires, al dólar oficial del día de llegada**; transferencia, Mercado Pago, tarjeta en 3 cuotas, efectivo o dólares. Retención aduanera: despachante propio del cliente o el de Aerobox, a costo del cliente. Reclamos dentro de 30 días; recompra o reintegro en pesos por el valor declarado.
- MyUS: almacenaje gratis 30 días y después USD 1,25/día; peso facturable = mayor entre real y volumétrico; estados *Incoming → Action Required → In Review → Ready to Send*; sin factura o con valor sospechoso, el paquete **queda en espera**.
- Shipito: hasta 3 fotos al recibir y el cliente revisa **antes** de aprobar el envío; consolidar sólo dentro del mismo depósito; vencido el almacenaje, extensiones y después abandono.
- Flexport: estados *Booked → … → Delivered*, fechas estimadas que pasan a reales, **«Missing Customs Documents» frena la carga**; tablero con excepciones y costo de importación por producto.
- Freightos: **el precio reservado es vinculante** (un cargo omitido no se cobra después); retención e inspección aduanera se cobran aparte.

**Inferido:**
- Que ningún referente local publica la secuencia de estados ni una regla escrita para **diferencia de peso**, **demora del proveedor** o **saldo impago** (no se encontró en ninguna fuente).
- Que el **paquete sin dueño** (sin pre-alerta ni casilla) se resuelve a criterio de soporte en todos (no hay procedimiento público).
- Que el texto de Aerobox sobre «más de USD 200 → despachante» y URSEC es heredado de su sitio de Uruguay.

**Quejas públicas** (reseñas, sin fecha confirmada): demoras de semanas en Miami, «USPS lo entregó y Aerobox no lo tiene», atención que no responde después de pagar, recálculo del costo a último momento (Aerolíneas), reclamos de 8 semanas (MyUS/Shipito). Fuentes: es.trustpilot.com/review/www.aerobox.com.ar · tuquejasuma.com/aerobox-argentina · tuquejasuma.com/aerolineas-argentinas.

---

## 2. Desarme — el modelo detrás de las pantallas

| Capa | Lo que hacen los referentes | Cómo queda en TESVO |
|---|---|---|
| **Objetos** (ADR-055) | Cliente con casilla · tarifa por ruta · paquete recibido · cotización con vencimiento | `cliente` (con casilla TV-1001 y tipo persona/empresa) · `tarifa` por origen × vía · `paquete` · `cotizacion` |
| **Asignaciones** | Paquete → cliente por pre-alerta o casilla · varios paquetes → un envío · envío → vuelo/contenedor | `prealerta` (tracking → envío) · `envio.paquetes` · `embarque.envios` — nunca «todos con todo» |
| **Ciclo de vida** | Pre-alertado → recibido → listo → enviado → en aduana → disponible → entregado | `confirmado → esperando la compra → en depósito → embarcado → en viaje → en aduana → listo → en reparto → entregado` (+ cancelado). Desvíos aparte: observado, retenido, dañado |
| **Reglas** | Peso facturable, tope y cupo, almacenaje, prohibidos, consolidación | Todas en el motor, con test (§4) |
| **Roles** | Cliente, depósito, atención, despachante | **Atención** (cotiza, cobra, entrega, aduana) · **Depósito** (recibe, asigna, embarca) · **Dueño** (todo + tarifas, régimen, devoluciones y bonificaciones con PIN) |
| **Plata** | Se cobra al llegar al dólar del día · seguro opcional · tributos estimados | **Seña del 30 % que congela el dólar** del saldo · cobro en pesos o en dólares billete · caja bimonetaria · ajustes trazables |
| **Automatización** | Mail al recibir, mail de prohibido, calculadora | **WhatsApp con el mensaje listo** en cada evento · bandeja priorizada · aviso masivo por embarque |
| **Métricas** | Tablero de excepciones y landed cost (Flexport) | Por cobrar, cobrado del mes, días puerta a puerta, % observados, conversión de cotizaciones, **margen real por embarque** |

---

## 3. Esencia vs. accidente

**Esencia (va al motor tal cual):** pre-aviso → recepción medida → validación → orden de salida · valor declarado con factura como eje (aduana, seguro, reclamo) · peso facturable = máximo(real, volumétrico) · precio por renglones con impuestos aparte y **estimados** · tiempo libre de almacenaje y después cargo por día · estimado contra real en cada hito · excepciones que frenan el flujo.

**Accidente de mercado (se reemplaza):**

| Allá | Acá |
|---|---|
| Membresía mensual en USD con tarjeta | Sin membresía: **seña por transferencia o Mercado Pago**, saldo en pesos al dólar congelado |
| DDP y aranceles de EE. UU./UE | **Régimen courier argentino como dato**: franquicia USD 400 FOB, 5 envíos con franquicia por persona y año, tope USD 3.000, 50 kg por paquete, 3 unidades por especie (§5) |
| Pulgadas, libras, divisor 139 | cm, kg, divisor 5.000 (aéreo) y 4.000 (terrestre); m³ en marítimo |
| Bond, ISF, broker de EE. UU. | **Despachante matriculado** en régimen general; intervenciones ANMAT, SENASA, INAL y ENACOM como aviso explícito |
| Mail o app propia | **WhatsApp primero**, mensaje listo, sin número cargado en la demo |
| Un solo origen | **Tres orígenes y tres vías en un sistema**: Miami aéreo, China aéreo y marítimo, Paraguay terrestre — ningún referente cubre Paraguay terrestre |

**Checklist de argentinización (ADR-044):**
- ¿Cómo se paga? → transferencia y Mercado Pago primero, efectivo y dólares billete siempre, tarjeta.
- ¿Por dónde se habla? → WhatsApp con el texto listo en cada evento.
- ¿Inflación y dólar? → el dueño carga el **dólar del día**; la seña lo **congela** para el saldo; cotización con vencimiento (3 días).
- ¿Facturación? → plugin ARCA del ERP cuando haya venta real; en demo, N/A.
- ¿Quién usa la pantalla? → Atención con el WhatsApp abierto, Depósito con la balanza delante: acción en un toque.

---

## 4. Matriz de eventualidades

Cada fila tiene su test en `src/tenants/tesvo/motor-gestion.test.ts`.

| # | Eventualidad | Regla | Quién decide | Qué ve la persona | Función del motor |
|---|---|---|---|---|---|
| 1 | Cotiza por peso y la caja es grande | Se cobra el mayor entre real y volumétrico, con mínimo de 1 kg | Motor | «Flete (12 kg cobrados, por volumen)» | `pesoACobrar` |
| 2 | Compra de hasta USD 400 | Sin derechos ni tasa; **IVA igual** | Motor | «Entra en la franquicia: sin derechos, sólo IVA» | `impuestosCourier` |
| 3 | Pasa los USD 400 | Derechos + tasa de estadística (3 %, tope USD 180) sobre el excedente; IVA sobre CIF + derechos + tasa | Motor | Desglose por renglón | `impuestosCourier` |
| 4 | Empresa por courier | Sin franquicia; aviso de que con despachante suele convenir (IVA computable) | Atención | Aviso no bloqueante | `cotizar` |
| 5 | Persona que ya usó sus 5 envíos con franquicia | Puede seguir, pero paga sobre el total | Atención | «Ya usó sus 5 envíos con franquicia» | `cupoCourier`, `cotizar` |
| 6 | Pasa USD 3.000 o más de 3 iguales | No va por courier: partir o despachante | Atención | Aviso bloqueante | `cotizar` |
| 7 | China marítimo por courier | No existe: sólo régimen general, por m³ con mínimo | Motor | Motivo en criollo | `cotizar` |
| 8 | Producto restringido o prohibido | Restringido avisa; prohibido bloquea la cotización y **retiene** el paquete | Atención / Depósito | Aviso · ítem en bandeja | `cotizar`, `recibirPaquete`, `resolverProhibido` |
| 9 | Cotización vencida | No se confirma: se recotiza al dólar de hoy | Atención | «Venció el 4/10» | `confirmarEnvio` |
| 10 | Confirmar sin ficha del cliente | Hace falta CUIT/CUIL | Atención | Motivo | `confirmarEnvio` |
| 11 | Sube el dólar entre la cotización y el pago | La **seña del 30 % congela** el dólar del saldo; sin seña, dólar del día | Motor | «dólar congelado $ 1.450» | `cobrar`, `tcParaCobrar` |
| 12 | Cobra más que el saldo · paga en dólares | Rechazo · la caja guarda la moneda real | Atención | Motivo · caja USD | `cobrar` |
| 13 | Paquete sin pre-alerta | Busca por casilla; si no, **sin dueño**, no se embarca; se asigna solo cuando avisan el tracking | Depósito | Ítem urgente en bandeja | `recibirPaquete`, `prealertar`, `asignarPaquete` |
| 14 | Tracking duplicado · paquete sin pesar | No se recibe | Depósito | Motivo | `recibirPaquete` |
| 15 | Paquete de courier de más de 50 kg | No se recibe para courier; con despachante sí | Depósito | Motivo | `recibirPaquete` |
| 16 | Llega más pesado que lo cotizado | Hasta 5 % no se toca; más, **frena el embarque** hasta avisar y ajustar | Atención | «Aplicar +US$ 244,20» + WhatsApp | `diferenciaDePeso`, `aplicarDiferenciaDePeso` |
| 17 | Faltan compras avisadas | No se compara peso ni se embarca | Motor | «faltan 1 paquete(s)» | `diferenciaDePeso`, `listoParaEmbarcar` |
| 18 | Llega dañado | Frena el embarque; el cliente decide: sigue o se reclama al vendedor | Atención | Foto + WhatsApp + dos botones | `resolverDano` |
| 19 | Almacenaje | 30 días gratis, aviso 5 días antes, después USD 1/día por paquete | Motor | «faltan 3 días» | `almacenaje`, `bandeja` |
| 20 | El cliente quiere juntar más compras | Se retiene hasta una fecha; avisa si cruza el almacenaje gratis | Atención | «Espera más compras hasta el 22/10» | `retenerParaConsolidar` |
| 21 | Envío de otra ruta o sin seña al embarque | No sube; se muestra por qué | Depósito | «no sube: no tiene la seña» | `subirAEmbarque`, `listoParaEmbarcar` |
| 22 | Se demora el vuelo o el contenedor | **Una carga avisa a todos** los clientes del embarque; si pasó la fecha, va a la bandeja | Depósito | Mensajes listos uno por cliente | `demorarEmbarque` |
| 23 | Aduana observa | Frenado con pedido y plazo; no se libera hasta resolver | Atención | «pide la factura · vence el 17/10» | `observarAduana`, `resolverObservacion` |
| 24 | Aduana liquida distinto de lo estimado | La diferencia ajusta el saldo (a favor o en contra) | Atención | Renglón de ajuste | `liberarAduana` |
| 25 | Quiere retirar con saldo | No se entrega | Atención | «cobralo antes de entregar» | `entregar` |
| 26 | No había nadie | Un reintento; al segundo, retiro en oficina | Atención | Mensaje de reintento / retiro | `entregaFallida` |
| 27 | Cancela | Sin paquetes, devuelve todo; con paquetes, retiene manejo y almacenaje; embarcado no se cancela | Atención | Monto a devolver | `cancelarEnvio` |
| 28 | Devolver seña · bonificar | Sólo el dueño con PIN; la bonificación no baja de lo pagado | Dueño | PIN | `devolverSena`, `bonificar` |
| 29 | Cambia el régimen o la tarifa | Dueño; el régimen pide PIN y guarda «vigente desde» | Dueño | Formulario | `cambiarRegimen`, `cambiarTarifa`, `cambiarTipoCambio` |
| 30 | Código tipeado mal | Dígito de control: no encuentra otro envío | Motor | «Ese código no es válido» | `validarCodigo`, `seguimiento` |

Invariante global: **lo pagado nunca supera el total** y saldo = total − pagado (test sobre toda la demo).

**Fuera de alcance (con porqué):** reclamo formal al vendedor y al seguro (requiere el circuito de cada tienda: se registra la decisión, no el trámite) · liquidación real por NCM (la hace el despachante; acá hay una alícuota de demo editable) · última milla con transportista (se registra entregado/fallido; el ruteo es otro producto).

---

## 5. Régimen vigente usado (provisional, lo valida el despachante)

| Regla | Valor en la demo | Norma | Estado |
|---|---|---|---|
| Tope por envío courier | USD 3.000 FOB | RG 5608, mod. RG 5883/2026 (BO 29/07/2026) | verificado |
| Franquicia | USD 400 FOB, sin derechos ni tasa | Dto. 1065/2024 y Dto. 604/2026 | verificado |
| Envíos con franquicia | 5 por persona y año | Dto. 1065/2024 y 604/2026 | verificado |
| IVA | 21 %, también dentro de la franquicia | ídem | verificado |
| Excedente | tributos del régimen general por NCM; el 50 % fijo del Correo quedó derogado | Dto. 604/2026 | verificado la derogación; **la base (FOB o CIF) a validar** |
| Derechos sobre el excedente | **20 % de demostración** | sale de la NCM de cada producto | **de demo** |
| Tasa de estadística | 3 %, tope USD 180 | Dto. 1140/2024 | verificado |
| Peso | 50 kg **por paquete** | RG 5631/2025 | verificado |
| Unidades por especie | 3 | RG 4450/2019; la RG 5884/2026 lo mantiene para el Correo | **inferido para courier** |

**A validar por el despachante de TESVO:** cronograma operativo de las RG 5883 y 5884 · si courier y Correo comparten el cupo de 5 · base del excedente · la regla de 3 unidades en courier · percepciones (RG 2937, 2281, IIBB) y la excepción MiPyME de la RG 5868/2026 · homologación ENACOM para celulares · **si TESVO, al consolidar compras de terceros, cae en finalidad comercial** (el mayor riesgo del modelo) · si TESVO opera como intermediario de un courier habilitado o necesita inscripción en los Registros Especiales Aduaneros. La «Disposición 954/2025» que citaba el plan anterior **no se encontró**: no usarla como fuente.

---

## 6. Innovaciones (donde el referente es débil)

| Innovación | Qué resuelve | Valor | Test |
|---|---|---|---|
| **Bandeja «para resolver ahora»** ordenada por urgencia y plata, con la acción en un toque y el WhatsApp listo | Hoy el cliente reclama y recién ahí alguien descubre el problema (queja nº 1 de Aerobox) | Menos reclamos; nada se pierde entre mail y planilla | «la demo abre con cada eventualidad…» |
| **El cliente no se entera en destino**: peso, daño y prohibido se resuelven en origen y **frenan el embarque** | Recálculo a último momento (queja pública de Aerolíneas Courier) | Cero sorpresas en la entrega; cero cobros discutidos | filas 16–18 |
| **Seña que congela el dólar** | Aerobox cobra al dólar del día de llegada: el cliente no sabe cuánto va a pagar | Precio cerrado para el cliente; TESVO cobra el 30 % por adelantado | fila 11 |
| **Partir para ahorrar**: reparte la compra en envíos dentro de la franquicia sin pasar el tope ni el cupo y muestra el ahorro contra los fletes extra | Nadie lo ofrece; el cliente lo calcula solo o paga de más | Ej. de la demo: celular + tablet + funda → ahorro en derechos y tasa | «partir para ahorrar…» |
| **Demora con aviso masivo**: una carga, un mensaje por cliente | Los referentes lo dejan «a criterio» | Ningún cliente se entera por su cuenta | fila 22 |
| **Margen real por embarque**: flete cobrado contra costo de la guía/contenedor | El dueño no sabe qué ruta le deja plata | Decide tarifas con datos | tablero |
| **Régimen como dato con «vigente desde»** | ARCA cambió el régimen 3 veces en 2 años | Un cambio normativo no es un redeploy | fila 29 |
| **Tres orígenes, tres vías, un sistema** (incluye Paraguay terrestre) | Ningún referente cubre los tres | Una sola bandeja y un solo tablero | rutas de la demo |

---

## 7. Vistas por rol

- **Atención** (Sole): Hoy (lo suyo) · Envíos (ficha con línea de tiempo, cuenta, paquetes y acciones) · Cotizar (en vivo, con avisos del régimen y «partir para ahorrar») · Embarques y aduana (liberar / observado) · Clientes (casilla y cupo) · Caja.
- **Depósito** (Nico): Hoy · Envíos · **Depósito** (recibir: tracking, peso, medidas, casilla, contenido, dañado; foto y balanza simuladas y dichas) · Embarques (abrir, subir lo listo, salió con costo real, demora, llegó).
- **Dueño**: todo, más **Tablero** y **Tarifas y régimen**. PIN de la demo: 9999.

Sello GSG: `meta generator` + crédito discreto en el pie. La marca visible es la de TESVO.

---

## 8. Camino a producción

| Paso | Tipo | Quién |
|---|---|---|
| Publicar `/gestion` en `tesvo.gsgapp.com.ar` | Gate 1 (deploy) | Dueño |
| Alta del negocio `tesvo` en producción (consola → Alta de negocio) con subdominio `tesvo`; sin el negocio, `/gestion` responde 404 (falla cerrado) | §C | Dueño |
| **Pushear `frente/tesvo`** desde la PC (51 commits locales) y converger: el motor de esta demo es la especificación del panel real en `src/lib/comex` | Reversible una vez en GitHub | Dueño (push) · sesión (convergencia) |
| Tablas `Comex.sql` en Neon (6 tablas con RLS) | **Gate 2** (irreversible) | Dueño |
| Datos reales: tarifas por ruta, honorario, despachante, depósitos (dirección de Miami, China, Paraguay), WhatsApp | Lo pasa TESVO | Dueño |
| Facturación ARCA de los servicios de TESVO | Plugin ARCA del ERP, post-venta | Sesión + dueño (credenciales) |

---

## 9. Provisional a confirmar

- **Autorización registrada de TESVO para usar su marca** (ADR-034/042). **Bloqueante antes de mostrar.**
- Tarifas, honorario (8 %, mínimo USD 30), despachante (USD 250), seguro (1,5 %), manejo (USD 10), almacenaje (30 días, USD 1/día), seña (30 %), validez de cotización (3 días), tolerancia de peso (5 %): **todos de demostración**.
- Derechos sobre el excedente (20 % de demo) y todo lo de §5 marcado «a validar».
- Plazos por ruta: tomados de lo que publican los referentes, no de TESVO.
- Nombres, CUIT y trackings de la demo: inventados.
- Poppins se carga de Google Fonts en la demo (igual que Break Point); en producción va autoalojada, con el OK del dueño.

— Elaborado por GSG
