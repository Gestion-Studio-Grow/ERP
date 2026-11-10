# Investigación: referentes de delivery, riders y marco legal (piloto Monte Grande)

Fecha: 10/11/2026 · Lector: gsg-investigador · Estado: **borrador para quien decide; no es dictamen legal.**

**Límite de método (importante):** la sesión no pudo abrir páginas (las páginas fallaron por la red: iprofesional.com y letrap.com.ar no
resuelven y el proxy no deja salir). Todo lo marcado «fuente» sale del **buscador** (título, URL y extracto), no de la lectura completa
de la nota. Por eso:
- **[buscador]** = el dato aparece en el extracto del buscador con esa URL; falta abrir la página para confirmar texto y fecha.
- **inferido** = criterio propio o memoria de la norma, sin fuente leída en esta sesión. Hay que validarlo con un abogado o con el Boletín Oficial.

---

## A. Referentes (ficha comparable)

| Ítem | PedidosYa (AR) | Rappi (AR) | Glovo | Uber Eats | Pedix (delivery propio) |
|---|---|---|---|---|---|
| Comisión al comercio | Sin tabla oficial pública. Prensa: ~15 % con envío propio y >30 % con logística de la app (2021) [buscador, baenegocios]; 20-30 % según plan (blog de un proveedor, 03/2026) [buscador, developargentina] | 15-20 % según una cámara de Rosario [buscador, letrap]; 18-28 % (blog 2026) [buscador] | 15-35 % según blogs; 25-35 % por plan, menos si es solo marketplace (guía FR 2026) [buscador, fooderise] | No apareció en fuente oficial | **0 % de comisión**, abono mensual (3 planes; montos viejos, sin fecha) [buscador, infonegocios] |
| Cargos al cliente | Envío + «cargo por servicio». La provincia de Buenos Aires lo sancionó y ordenó devolverlo (12/2023) [buscador, wageindicator] | Envío. Si el cliente no corrige la dirección antes de que el comercio confirme, paga el envío completo [buscador, c5n] | inferido: envío + cargo por servicio | inferido: envío + cargo por servicio | Lo que fije el comercio |
| Asignación del repartidor | Flota propia de la app o envío propio del local [buscador] | Flota de la app | Por GPS y cercanía; el repartidor puede activar la aceptación automática [buscador, delivery.glovoapp.com] | Se despacha el repartidor según el tiempo estimado de preparación [buscador, developer.uber.com] | El comercio con su repartidor |
| Estados que ve el cliente | No confirmado en fuente | No confirmado | No confirmado | Aceptado/cancelado con aviso al cliente [buscador, developer.uber.com] | No confirmado |
| Cancelación y reembolso | Reclamos por reintegros que no llegan cuando el local no confirma (son quejas de usuarios, no la política) [buscador, tuquejasuma] | Reembolsos de hasta 15 días (queja de usuario). En Colombia (10/2026) no puede imponer Rappicréditos como única compensación [buscador, noticiasrcn] | Al repartidor se le paga la cancelación si recorrió ≥75 % del camino [buscador, delivery.glovoapp.com] | Ver fila siguiente | No confirmado |
| Efectivo | No confirmado | Hay casos donde no se puede pagar en efectivo (sitio de quejas) | El repartidor le paga al local el total en efectivo, sin el envío. La app limita al repartidor que junta mucho efectivo [buscador, sell.glovoapp.com/ke] | No confirmado | Lo coordina el comercio |
| Si el comercio no confirma a tiempo | No hay regla oficial. Hay quejas de pedidos sin confirmar por más de 1 h [buscador] | No confirmado | Sin plazo oficial hallado | **Se cancela a los 11,5 minutos sin aceptación** [buscador, developer.uber.com] | No aplica (es el canal del comercio) |

Notas:
- Glovo y Uber Eats **no operan delivery de comida en Argentina hoy** (inferido, de memoria: Uber Eats se fue en 2020 y Glovo en 2022). Sirven como modelo de producto, no como competencia local.
- **Lección de diseño (inferido):** copiar de Uber Eats un **vencimiento explícito** («si el café no confirma en X min, el pedido se cancela solo y se avisa al cliente»). Es la queja más repetida contra PedidosYa.

## B. Riders en Argentina

**Críticas a las apps** [buscador; fechas mezcladas, varias notas 2020-2021]:
- Reclamos de Repartidores Independientes Argentina: aumentos según inflación, claridad en el pago (propinas, km, valor por pedido), fin de los pedidos múltiples, pago por pedido, **fin de sanciones y cierres de cuentas sin justificación**, y quejas por respuestas automáticas en vez de personas. Hubo paros en Rosario, Mendoza y San Luis (laizquierdadiario, lacapital).
- Un repartidor citado en prensa: si regulan, «cada local se hace cargo de su repartidor», que era el esquema inicial (lacapital).
- **«Modo libre»:** no se encontró en ninguna fuente. [A VALIDAR]

**Litigios y leyes:**
- Juez Roberto Gallardo (CAyT N° 2, CABA, 2019): suspendió Rappi, Glovo y PedidosYa en la Ciudad por no registrar a los repartidores (Ley 5.526) y por riesgo a la vida y la integridad. Hubo apelación y recusación; el estado final no se confirmó [buscador, palabrasdelderecho, cronista].
- Tribunales de Trabajo de La Plata confirmaron multas del Ministerio de Trabajo bonaerense a PedidosYa por considerar que **hay relación de dependencia** [buscador, gba.gob.ar].
- **Ley de Modernización Laboral:** aprobada por el Congreso el 27/02/2026 y promulgada con el **Decreto 137/2026** (BO 06/03/2026). Crea al «prestador independiente de plataformas tecnológicas», sin relación de dependencia con la app, con libertad de conexión. Se reglamentó en 08/2026 [buscador, eleconomista, iprofesional, descubre.vc]. Fairwork critica que no regula la gestión por algoritmo [buscador, wageindicator].
- **04/2026:** dos fallos de la Suprema Corte bonaerense habrían confirmado la dependencia de los repartidores de apps [buscador, primeraedicion]. [A VALIDAR: carátula y fecha]

**Qué conviene para no quedar expuestos (inferido; consultarlo con un laboralista):**
1. **GSG sin relación alguna con el repartidor.** GSG no lo da de alta, no le asigna pedidos, no le fija tarifa, no lo califica, no lo bloquea y no le paga. El software solo registra a «quien reparte», como dato que carga el comercio. Esto importa porque el régimen nuevo y los fallos miran **quién organiza y controla** la tarea.
2. **No construir funciones de «plataforma de reparto»:** nada de despacho automático entre repartidores de varios comercios, ni ranking, ni penalidades. Si existieran, GSG podría encuadrar como «plataforma tecnológica» de la ley nueva.
3. **El repartidor es del comercio:** empleado registrado (lo más seguro) o monotributista que factura al comercio. Dado el criterio bonaerense de dependencia, un repartidor fijo y exclusivo del café tiende a ser empleado. **Riesgo del comercio, no de GSG.**

## C. Marco legal aplicable

| Norma | Qué dice (fuente o inferido) | Aplica al piloto |
|---|---|---|
| Ley 24.240 | Rige la contratación por internet aunque no haya norma específica [buscador, seer.ufrgs.br]. Art. 4 (información) y art. 34 (revocación en ventas a distancia): inferido | Sí, el comercio es el proveedor |
| CCyC arts. 1105-1116 | 1110: revocación en 10 días corridos (inferido). **1116: excepciones, entre ellas los bienes que por su naturaleza no pueden devolverse o se deterioran rápido** (inferido; validar texto) | La comida preparada del café entra en la excepción del 1116 (inferido) |
| Res. SCI 424/2020 «botón de arrepentimiento» | Link visible desde el inicio, sin registro previo [buscador, argentina.gob.ar norma 342869]. **Derogada por la Disposición SSDCyLC 954/2025** (vigente desde el 04/09/2025, 60 días para adecuarse), que unifica los botones de arrepentimiento y de baja [buscador, estudio-ofarrell, allende] | Según una fuente secundaria, contempla la excepción por perecederos [buscador, economis]. [A VALIDAR en el BO] |
| Precio total con envío | No se halló norma vigente específica. Hay proyectos en Diputados (2024-2025) y la Res. GMC MERCOSUR 37/2019 de comercio electrónico [buscador, hcdn, argentina.gob.ar norma 341934]. Igual surge del deber de información de la Ley 24.240 (inferido) | Mostrar el total con envío antes de confirmar |
| Ley 25.326 | Art. 21: inscribir bases en el Registro Nacional de la AAIP; la inscripción previa del responsable es requisito; incumplir trae sanciones [buscador, argentina.gob.ar/aaip]. Res. AAIP 132/2018: sin renovación anual, es una declaración jurada [buscador, marval]. Consentimiento libre, expreso e informado (art. 5, inferido) | El **comercio** es responsable de su base de clientes; **GSG es encargado del tratamiento** (art. 25, inferido) |
| Geolocalización | Sin criterio de la AAIP encontrado. inferido: no es dato sensible, pero hace falta consentimiento expreso y finalidad acotada | Pedirla solo al entregar y opcional (dirección escrita como alternativa) |
| Facturación ARCA | inferido: emite el comercio, a su nombre. GSG factura su abono al comercio | — |
| Código Alimentario Argentino | inferido: la inocuidad y la cadena de frío hasta la entrega son del comercio elaborador | — |

**Cláusulas sugeridas (todas inferido; las redacta el abogado):**

1. **Términos de uso de la plataforma (GSG–comercio y GSG–cliente):**
   - «Gestión Studio Grow provee el software. No vende, no elabora, no transporta y no cobra los productos.
   - El vendedor es el comercio indicado en cada pedido, y es el único responsable de la oferta, el precio, la calidad, la entrega, la facturación y la atención del reclamo.
   - GSG no contrata, no asigna, no remunera ni evalúa a los repartidores.»
   - Agregar el límite de responsabilidad que permita la Ley 24.240 (inferido: frente al consumidor, la solidaridad del art. 40 puede alcanzar a quien interviene; conviene que GSG **no cobre** el pedido).
2. **Condiciones de venta del comercio:**
   - Identidad y CUIT del comercio, precio final con envío, zona y tiempo estimado, y medios de pago (transferencia a su cuenta de MP, efectivo, link de MP).
   - Revocación: «Por tratarse de alimentos perecederos, no corre el derecho de arrepentimiento (art. 1116 CCyC), salvo que el pedido no haya sido confirmado».
   - Cancelación automática y devolución total si el comercio no confirma en X minutos.
   - Devolución por el mismo medio de pago.
   - Botón de arrepentimiento visible (Disp. 954/2025) para lo que sí lo admita.
3. **Política de privacidad:**
   - Responsable: el comercio. Encargado: GSG.
   - Datos: nombre, teléfono, dirección y, opcional, la ubicación con consentimiento.
   - Finalidad: solo el pedido.
   - Plazo de conservación, derechos de acceso, rectificación y supresión (arts. 14-16), y el aviso de la AAIP como autoridad de control.
   - Sin cesión a terceros.
4. **Acuerdo comercio–repartidor (modelo opcional que provee el comercio, no GSG):**
   - Partes: el comercio y el repartidor.
   - Modalidad: relación laboral registrada, o locación de servicios con monotributista que factura al comercio.
   - Seguro (ART o de accidentes personales), manejo del efectivo y rendición, y uso de datos de clientes solo para la entrega.
   - Cláusula expresa: «GSG no es parte».

## D. Comisiones de PedidosYa 2025-2026 (para sostener «hasta ~30-40 %»)

| Cifra | Quién la dice | Fecha | Fuente |
|---|---|---|---|
| Retiene **hasta 35 % semanal** entre descuentos, publicidad e impuestos | Cámara de hamburgueseros de Rosario (Nicolás Abusar, Burger House) | sin fecha visible; probablemente 2025-2026 [A VALIDAR] | [buscador] letrap.com.ar n5423159 |
| «Cargos de hasta 35 %», con el 13 % de Mercado Libre como referencia | iProfesional | nota fechada 17/07/2026 [A VALIDAR] | [buscador] iprofesional.com 454816 |
| 20-30 % según plan | Blog de un proveedor de software | 03/2026 | [buscador] developargentina.com |
| Hasta 35 % + IVA para nuevos | AEHGAR Rosario | 2020 | [buscador] iproup / baenegocios |
| >30 % con logística, ~15 % con envío propio | Acuerdo con gastronómicos | 2021 | [buscador] baenegocios |
| Tope 10 % + IVA (marketplace) y 18 % + IVA (con logística) | FEHGRA + Secretaría de Comercio Interior; temporal | 2020-2021, vencido | [buscador] infogastronomica, cronista |
| Tope 25 % + IVA | Santa Fe (Ley de Abastecimiento) | 2020 | [buscador] santafe.gob.ar |

**CAME y FEHGRA 2025-2026:** no se encontró ninguna cifra publicada. [A VALIDAR]

**Cómo decirlo con respaldo:** «Según comercios y cámaras gastronómicas, las apps llegan a quedarse con hasta ~35 % de la venta, sumando comisión, promociones y publicidad (Rosario, 2025-26; iProfesional, 2026)». **«40 %» no tiene fuente:** no usarlo.

## Pendiente de validar (abrir páginas o consultar a un abogado)
- Texto de la Disp. 954/2025 (excepción de perecederos) y del art. 1116 CCyC.
- Fecha y texto de las notas de Letra P e iProfesional sobre el 35 %.
- Fallos de la SCBA 04/2026 y el decreto reglamentario de 08/2026 sobre plataformas.
- Los centros de ayuda oficiales de PedidosYa y Rappi para socios (estados del pedido, efectivo, tiempo de confirmación).
- El precio vigente de Pedix y de una segunda alternativa (Olaclick o Fudo).
- Res. 270/2020: no se encontró relación con el tema [A VALIDAR / descartar].
