# Bandeja — estrategia de venta (propuesta para el dueño, NO adoptada)

> Nombre de trabajo: **Bandeja** (provisional a confirmar). Encargo del dueño, 17/10/2026: una app para
> **puntuar y encontrar profes de pádel por ubicación**, donde los profes usan la app que hicimos para
> **Matías Consoli** (módulo `padel-clases`, rama `claude/beautiful-keller-5tykrg`).
>
> Proceso ADR-045: **Advisory** propuso → **Growth** y **Pricing** bajaron canal y precios →
> **Challenger** desafió → esta síntesis. **Adoptar precios, canales o gasto es decisión del dueño.**

## Estado de Matías al 17/10/2026 (verificado contra el repo)

- **Marca autorizada** por el dueño el 17/10, con el OK de Matías, **para su negocio dentro del ERP** (turnero,
  panel y link del alumno): commit `3143ff9b` en `claude/beautiful-keller-5tykrg`. **Ese alcance no cubre
  usarlo como caso para vender Bandeja** a otros profes: hay que pedirle ese uso aparte. Hasta entonces, la demo
  y los mensajes no lo nombran.
- **Integración a `main`:** el README de esa rama dice «integrada a `main`» (merge `41c91a16`), pero ese commit
  **no está en `origin/main`** (tip `aa8a3415`) a la hora de escribir esto. La versión real de Bandeja depende
  de que entre.
- **Migración** `20261015120000_modulo_padel_clases`: declarada en `prisma/lote-deploy.txt` con OK del dueño (Gate 2), en esa misma rama.

## La tesis en tres líneas

1. **Se vende la herramienta, no el directorio.** El profe paga por el turnero, el «Hoy» de un toque y el
   cobro con comprobante (lo que ya existe para Matías). El directorio es lo que sale de eso: cada clase dada
   habilita una reseña verificada.
2. **El foso es operativo, no la reseña.** La reseña verificada distingue frente a Google e Instagram, pero
   la marca «dada» la pone el propio profe. Lo que retiene al profe es tener su agenda y su plata ordenadas.
3. **Primero la oferta, por club, no por barrio.** Ezeiza (Break Point) → Canning → Monte Grande →
   Lomas/Adrogué/Burzaco. El buscador público abre recién con ~15 profes activos en la zona.

## Veredicto del Challenger: 🟡 adoptable con cambios (en el directorio, rozando 🔴)

| Cambio que pidió | Cómo quedó |
|---|---|
| Fundamento = «herramienta del profe y del club». El directorio es **hipótesis** hasta pasar el experimento. | Así se presenta en este documento y en la demo. |
| Gatillo previo: **Matías paga**, o se pivotea a Break Point con el plan Club. | Paso 0 del plan (abajo). |
| **Sacar a Circuito WPE** de los canales de la v1 (cliente vendido, freeze de deploy, cesión de datos de sus jugadores). | Fuera de la v1. Se revisa cuando haya tracción y WPE lo pida. |
| **Legal desde el diseño:** alta voluntaria, réplica, denuncia y baja, sin menores, inscripción AAIP, «destacado» rotulado como publicidad. | En la demo: réplica del profe, botón «Denunciar reseña», el menor no puntúa (lo hace su adulto), nadie aparece sin darse de alta. AAIP y términos: pendiente (§ Riesgos). |
| **Sacar el «destacado» del plan Pro** hasta que haya tráfico. | Sacado de la tabla de planes. |
| Modelar el costo de WhatsApp Cloud API (Meta cobra **por mensaje de plantilla** desde jul-2025) antes de fijar precio. | Pendiente. Hasta vender, todo va por `wa.me` (costo cero). |

## Qué hay en el mercado (con fuentes)

- **Precio de clase en AMBA:** Superprof muestra profes de Buenos Aires desde ~$26.500/h y el 91% da la
  primera clase gratis ([Superprof BA](https://www.superprof.com.ar/clases/padel/buenos-aires/)). Diario Uno
  estima el primer mes de clases desde ~$40.000 ([jun-2026](https://www.diariouno.com.ar/sociedad/cuanto-cuesta-empezar-jugar-al-padel-argentina-junio-2026-n1564376)).
  **No hay precio confirmado de clase particular en zona sur:** los $25.000/$12.000 de la demo de Matías
  siguen provisionales.
- **Competencia:**
  - **Alquilá Tu Cancha (ATC):** 350+ clubes, 200 mil usuarios, Pico Mónaco como inversor ([Forbes AR](https://www.forbesargentina.com/negocios/crearon-una-app-alquilar-canchas-tienen-mas-350-clubes-200-mil-usuarios-pico-monaco-como-inversor-n36054)).
    Tiene «clases» como foco próximo ([descubre.vc](https://www.descubre.vc/alquila-tu-cancha)); no se encontró
    lanzado. **Es la amenaza más seria:** si lo lanza, entra con los clubes adentro.
  - **Playtomic:** su Academy apunta al staff de los clubes ([Playtomic Academy](https://playtomic.com/es/academy)); poca presencia local (estimado).
  - **Superprof:** ya tiene profes en Monte Grande, con reseñas ([perfil](https://www.superprof.es/profesor-padel-avalado-por-asociacion-padel-argentino-preparador-fisico.html)).
  - **El incumbente real:** Instagram + WhatsApp + Google Maps. Gratis y ya en el celular de todos.
- **Tamaño:** 1,4 a 3 millones de jugadores y ~2.600 clubes son números de prensa, no censo
  ([El Economista](https://eleconomista.com.ar/deportes/boom-padel-argentina-negocio-rentable-n91778),
  [La Nación 2024](https://www.lanacion.com.ar/deportes/padel/el-crecimiento-de-padel-femenino-y-mundial-las-cifras-y-claves-de-un-fenomeno-que-esta-resurgiendo-nid22082024/)).
  Sólo el SaaS del profe suelto es un negocio chico; **el ticket fuerte está en el club**.

## Modelos de cobro evaluados

| Modelo | A favor | En contra | Decisión propuesta |
|---|---|---|---|
| **Suscripción del profe (freemium)** | Recurrente, simple, encaja con el ERP | Techo chico; el profe informal es reacio a pagar | **Sí, v1** |
| **Plan Club (B2B)** | Un cliente paga por N profes; Break Point ya está caliente | Choque si el club le cobra canon al profe independiente | **Sí, v1** — probablemente la primera venta |
| **Destacado / pago por alumno nuevo** | Cobra lo que el profe valora | Sin tráfico no vale nada; es publicidad y hay que rotularla | **Después**, con demanda medida |
| **Comisión por clase** | Escala con el uso | La transferencia no pasa por GSG; desintermediación a la 2.ª clase; split de MP + facturar comisiones | **No en v1** |
| **Sponsors (A Dos Manos)** | Venta cruzada dentro del grupo | Chico | Complemento, no negocio |

## Planes (provisionales, a confirmar por el dueño)

Patrón de ADR-078: un gratis con tope duro como costo de adquisición, nunca por usuario, anual = 10 meses.
Dólar ~$1.500 (provisional). Márgenes netos de Mercado Pago 5,58% e IIBB 1,5% (cálculo de Pricing).

| Plan | $/mes | Qué incluye | Margen GSG (est.) |
|---|---|---|---|
| **Perfil** | 0 | Ficha, reseñas verificadas, turnero con tope de **8 reservas/mes** | costo ~$50 |
| **Profe** | 14.900 | Turnero sin tope, «Hoy», link del alumno con comprobante, recordatorios `wa.me` de un toque | ~47% |
| **Profe Pro** | 29.900 | + recordatorios automáticos (Cloud API) y abonos de 4/8 clases. **Sin destacado** (Challenger) | ~51% (a recalcular con el costo por mensaje) |
| **Club** | 59.900 | Hasta 5 profes, agenda unificada | ~51% |
| **Club Escuelita** | 109.900 | Hasta 12 profes, escuelita con cuota y adulto responsable por menor | ~55% |

- **Argumento para el profe:** «el plan te sale menos que una clase al mes».
- **Profe fundador (20 lugares):** primer mes gratis; después Pro al precio de Profe, congelado 12 meses, con
  insignia. Condición: cargar sus alumnos y pedirles la reseña. **Los fundadores son costo de adquisición,
  no ingreso.**
- **Break-even (estimado):** ~11 profes pagos para cubrir la caja (~$107.000/mes); ~48 si se valoriza el
  tiempo del equipo. Un Club Escuelita equivale a ~6 profes. **El dato que falta medir es la conversión de
  gratis a pago** (supuesto 3–5%).

## Plan de 90 días (todo a costo cero hasta el gatillo)

**Paso 0, antes de nada (2 semanas):** el experimento del Challenger, sin mergear la rama ni aplicar la
migración. Responde las dos preguntas que matan o confirman la tesis.

| Prueba | Cómo | Muere si… |
|---|---|---|
| **Oferta** | 10 profes de Break Point y Canning, demo de 10 min, cierre: «¿pagás $14.900 desde el lunes?». Cuenta sólo un sí con fecha o seña. | menos de 3 de 10 dicen sí, **o Matías no paga ni firma** |
| **Demanda** | Vidriera a mano con 5–8 profes que den su OK, difundida por el Instagram de A Dos Manos y de Break Point; consultas a un WhatsApp. | menos de 20 consultas reales |
| **Reseña** | A 10 alumnos de Matías (con su permiso) se les pide puntuar por WhatsApp. | contesta menos del 30% |
| **Club** | Se le presenta a Break Point el plan Club. | — (es la venta alternativa) |

**Después, si pasa:**

| Momento | Para seguir | Si no se cumple |
|---|---|---|
| Día 30 | Matías la usa todos los días; 8 profes activados; 80 clases registradas | menos de 4 activos → el problema es el producto: frenar captación y corregir |
| Día 60 | 15 activados; 60 reseñas; 10 fichas con 3+ reseñas; 10% de reservas desde el buscador | — |
| Día 90 | 6 profes pagando (o 40% de fundadores aceptan pagar); bajas < 10%/mes; 20% de reservas desde el buscador | el buscador queda como función de la herramienta, no como negocio aparte |

**Gatillo de inversión (ciclo DEMO → VENTA → INVERSIÓN):** ≥15 profes pagos **+ 1 club firmado**. Recién ahí:
dominio propio, migración a Neon (Gate 2), WhatsApp Cloud API y una prueba chica de pauta (monto a definir
por el dueño).

### Las 5 métricas norte
1. Profes activos por semana (5+ clases registradas).
2. Clases dadas registradas por semana.
3. Reseñas verificadas por clase dada.
4. **% de reservas que llegan desde el buscador y no desde la bio** (la prueba de que el directorio vale algo).
5. Fundadores que pasan a pagar y bajas por mes.

## Canales (v1, sin pauta)

- **Matías:** primer usuario y caso. Su marca está autorizada **sólo para su negocio en el ERP**: para nombrarlo
  al vender Bandeja a otros profes hace falta que extienda ese OK. Hasta entonces, ningún mensaje ni pantalla
  de Bandeja lo nombra.
- **Break Point:** sus profes y su escuelita; QR en el club («Clases en este club, reservá acá»). Imprimir es
  gasto mínimo, pero lo decide el dueño.
- **A Dos Manos:** tarjeta en cada pedido («Profes con reseñas verificadas cerca tuyo»); los profes
  recomiendan palas con código propio.
- **SEO local:** una página por localidad («profe de pádel en Monte Grande») y una por profe, con estrellas
  sólo de reseñas verificadas. Necesita dominio propio para posicionar: es inversión post-venta.
- **Link de la bio de cada profe:** muestra sólo a ese profe (no a la competencia); el buscador es otra puerta.

Guion de primer contacto (Growth, voz criolla; **sin nombrar a Matías hasta que extienda su OK**):
> «Hola [nombre], ¿todo bien? Te escribo de Gestión Studio Grow. Armamos una app para profes de pádel: el
> alumno reserva desde el link de tu bio, vos ves el día en una pantalla y con un toque confirmás o
> reprogramás, y el comprobante lo sube el alumno solo. Estamos sumando 20 profes fundadores en zona sur.
> ¿Te la muestro en 10 minutos? Si no te sirve, me decís y listo.»

## Riesgos (los que quedan abiertos)

1. **Base de venta cero.** Matías no compró y Break Point está en preventa: hoy es una tesis sin un peso cobrado.
2. **Desintermediación.** Profe y alumno se encuentran una vez y siguen directo: el valor tiene que estar en la herramienta.
3. **Informalidad.** El profe cobra en efectivo; la factura no puede ser obligatoria.
4. **Reseñas infladas.** El profe marca «dada» y elige a quién pedir reseña. Mitigación a probar: que pesen más
   las reseñas de alumnos que reservaron por el link público y pagaron con comprobante validado.
5. **Legal (Ley 25.326 y responsabilidad de intermediarios):** inscribir la base en la AAIP; alta voluntaria;
   qué pasa con las reseñas si un profe pide la baja (derecho de supresión); procedimiento de denuncia y baja
   (criterio de *Rodríguez c/ Google*, CSJN 2014 — [Allende & Brea](https://allende.com/propiedad-intelectual/responsabilidad-de-intermediarios-en-internet-en-la-republica-argentina-10-04-2022/));
   el destacado pago, rotulado como publicidad. **Revisión de un abogado antes de abrir el buscador.**
6. **Mundo chico.** Una reseña mala dentro del mismo club termina en pelea y el club presiona.
7. **Foco.** Un buscador con reseñas es otro oficio (moderación, disputas). Compite por los 5 lugares del pool con las demos que venden hoy.

## Decisiones que son del dueño

1. ¿Se corre el experimento de 2 semanas? (costo cero; necesita que alguien hable con 10 profes).
2. Precio de lista de los planes.
3. ¿Bandeja va en **Agencia Grow** (negocio propio) o en **Agencia Digital** (satélite del ERP)? La
   herramienta es un módulo del ERP; el buscador se parece a un negocio propio.
4. El nombre.
5. Pedirle a Matías que extienda su OK de marca a «caso de Bandeja» (hoy cubre sólo su negocio en el ERP).

— Elaborado por GSG
