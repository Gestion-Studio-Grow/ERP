# Guía de hardware para el mostrador — qué comprar, cómo conectarlo y cómo probarlo

**Para quién es:** para el comercial que la lleva a la reunión y para el dueño del local que tiene que
salir a comprar. No hace falta saber de computación: elegí tu perfil, imprimí la lista y tildá.
**Fase:** T-7 del plan `docs/producto/PLAN-TERMINALES-MOSTRADOR.md` (§5). **Fecha:** 2026-10-16.

> **Antes de leer los precios:** son **de referencia, en dólares, provisionales a confirmar** el día que
> compres (cambian todas las semanas). Las marcas que aparecen son **ejemplos**, no obligación: sirve
> cualquiera que cumpla lo que pide la lista. Y **no se compra nada antes de cerrar la venta**: mientras
> estemos en demo, todo se prueba con lo que ya tenés (tu celular, tu compu).

---

## 1. ¿Qué perfil sos?

| Si tu negocio es… | Tu perfil | Ir a |
|---|---|---|
| Súper, almacén grande, buffet con mucho movimiento, local con productos con código de barras y fila en la caja | **Caja de alto volumen** (mini PC tipo kiosco) | §2 |
| Querés todo en un solo equipo, prolijo, sin cables a la vista | **POS todo-en-uno** | §3 |
| Trabajás con turnos: estética, consultorio, club, recepción | **Tablet de recepción** | §4 |
| Vendés poco por día, o recién arrancás, o atendés parado (carnicería chica, tienda) | **Celular de mostrador** | §5 |
| Vendés por peso con etiqueta (carnicería, fiambrería, verdulería de súper) | Sumá la **balanza etiquetadora** a tu perfil | §6 |
| Cobrás con tarjeta | Sumá **Mercado Pago Point** (va aparte) | §7 |

Si dudás entre dos, empezá por el más chico: **del celular se pasa a la PC sin perder nada**, porque el
sistema vive en internet y no en el equipo.

---

## 2. Caja de alto volumen — mini PC tipo kiosco

**Para qué sirve:** fila en la caja, lector que no para, ticket impreso sin tocar nada. Es la caja de un
súper chico.

### Lista de compras

| ✔ | Equipo | Qué pedir en el negocio | Referencia (USD, provisional) |
|---|---|---|---|
| ☐ | **Mini PC** | Procesador tipo Intel N100 o similar, **8 GB de RAM**, disco **SSD** de 256 GB, Windows 10/11, **4 puertos USB o más** | 150 – 250 |
| ☐ | **Monitor** | 19" a 22" con entrada HDMI. Táctil es opcional (15" táctil cuesta bastante más) | 90 – 150 (táctil: 250 – 400) |
| ☐ | **Impresora térmica de 80 mm** | **USB**, **con corte automático**, con **salida para cajón (RJ11)** y con driver para Windows. Ej.: Epson TM-T20, 3nStar, Xprinter, Gadnic | 80 – 150 |
| ☐ | **Rollos de papel térmico 80 mm** | Una caja para arrancar | 15 – 30 |
| ☐ | **Lector de código de barras** | **USB**, que diga **"modo teclado" o HID**. 1D alcanza para productos; 2D si querés leer QR también | 1D: 20 – 40 · 2D: 40 – 90 |
| ☐ | **Cajón de dinero** | Que se conecte **a la impresora** con cable RJ11 (el de teléfono) | 60 – 120 |
| ☐ | **UPS (estabilizador con batería)** | **650 VA o más** | 60 – 100 |
| ☐ | **Respaldo de internet 4G** | Un **router 4G con chip de datos** (o, en el peor caso, el hotspot de un celular) | 50 – 100 + el plan de datos |
| ☐ | Teclado y mouse | Cualquiera USB | 15 – 30 |

**La UPS y el 4G de respaldo NO son opcionales en este perfil.** Hoy el sistema **no vende sin
conexión** (te explicamos por qué en §8). Con fila en la caja, un corte de wifi o de luz sin respaldo es
la caja parada.

### Qué conectar a qué

```
Enchufe de pared ──► UPS ──┬──► Mini PC
                           ├──► Monitor
                           ├──► Impresora térmica
                           └──► Router 4G (y el router del wifi, si entra)

Mini PC ──USB──► Lector de códigos
Mini PC ──USB──► Impresora térmica ──RJ11──► Cajón de dinero
Mini PC ──HDMI─► Monitor
Mini PC ──wifi o cable─► Internet (principal) · Router 4G (respaldo)
```

- **A la UPS no se enchufa nada más**: ni la heladera, ni la estufa, ni la pava. Se la come en segundos.
- El **cajón se abre cuando imprime el ticket**: lo manda la impresora, no la compu. Se configura en el
  driver de la impresora (opción tipo "abrir cajón al imprimir"; el nombre cambia según la marca).
- Para la impresión sin ventanita (el ticket sale solo al cobrar) seguí la receta
  **`docs/producto/impresion-en-el-mostrador.md`**.

### Cómo probarlo en 10 minutos

1. **Lector (2 min):** abrí el Bloc de notas y escaneá cualquier producto. Tienen que aparecer los
   números y **un salto de línea** al final (eso es el "Enter"). Si aparecen símbolos raros antes del
   número, o no salta de línea, el lector trae un prefijo o le falta el sufijo: en el manual del lector
   hay un código de barras para "sin prefijo" y otro para "sufijo Enter" (CR). Se escanean una vez y listo.
2. **Caja (3 min):** entrá a **Caja con lector**, escaneá un producto cargado en el catálogo: tiene que
   aparecer en la venta sin tocar nada. Probá también `3*` + el código para sumar tres unidades.
3. **Ticket y cajón (3 min):** cobrá una venta de prueba en efectivo. Tiene que salir el ticket
   **cortado** y abrirse el cajón. Si sale una hoja larga en blanco, mirá la "prueba de corte" de la
   receta de impresión.
4. **Respaldo (2 min):** desenchufá el router del wifi. Conectá la compu a la red del router 4G y
   recargá la pantalla: tiene que seguir andando. Después desenchufá la UPS de la pared: la compu sigue
   prendida. **Anulá la venta de prueba desde "Ventas del día" antes de abrir al público** (o, mejor, hacé la prueba en el negocio de demo).

---

## 3. POS todo-en-uno

**Para qué sirve:** lo mismo que el perfil anterior, en un solo aparato (pantalla táctil con la compu
adentro, a veces con la impresora incorporada). Más prolijo, más caro, y si se rompe se rompe todo junto.

### Lista de compras

| ✔ | Equipo | Qué pedir | Referencia (USD, provisional) |
|---|---|---|---|
| ☐ | **POS todo-en-uno con Windows** | Pantalla táctil 15", **Windows 10/11**, 4–8 GB de RAM, SSD, puertos USB libres | 400 – 900 |
| ☐ | Impresora térmica 80 mm | Si el equipo no la trae incorporada: igual que en §2 | 80 – 150 |
| ☐ | Lector, cajón, UPS, 4G de respaldo | Igual que en §2 (siguen siendo obligatorios la UPS y el 4G) | ver §2 |

**Ojo con los todo-en-uno Android** (los que traen la impresora adentro, tipo Sunmi o similares): el
sistema anda en su navegador, pero **no prometemos que el ticket salga por esa impresora incorporada**.
El navegador de Android no imprime directo en una térmica. En esos equipos el ticket se manda por
WhatsApp. **Si querés ticket en papel, que sea Windows.**

**Qué conectar a qué y prueba de 10 minutos:** igual que §2. La receta de impresión es la misma.

---

## 4. Tablet de recepción (negocios con turnos)

**Para qué sirve:** la recepción de una estética, un consultorio o un club. Ves la agenda, das turnos,
cobrás el turno y le mandás el comprobante a la clienta por WhatsApp.

### Lista de compras

| ✔ | Equipo | Qué pedir | Referencia (USD, provisional) |
|---|---|---|---|
| ☐ | **Tablet** | Android de 10" a 11" (con 4 GB de RAM o más) **o** iPad | Android: 180 – 350 · iPad: 400 – 550 |
| ☐ | **Soporte de mostrador** | Que la deje firme y en ángulo, mejor si tiene traba | 20 – 50 |
| ☐ | Cargador a mano | Que llegue al enchufe sin cruzar el paso | 10 – 20 |
| ☐ | Datos móviles o 4G de respaldo | Tablet con chip, o el hotspot del celular del negocio | según plan |

**Impresora:** en este perfil **no va**. El ticket se manda por WhatsApp (o se guarda en PDF). Si algún
día necesitás papel, se suma una PC con térmica al lado (§2), no una impresora a la tablet.

### Qué conectar a qué

Nada con cables: la tablet al wifi del local y al cargador. Entrá con Chrome (en Android) o Safari (en
iPad) a la dirección de tu negocio y tocá **"Agregar a la pantalla principal"** en el menú del
navegador: queda un ícono y la abrís como una app, con el nombre y el color de tu negocio. En Chrome
también aparece **"Instalar"** directamente.

### Cómo probarlo en 10 minutos

1. Entrá con tu usuario y abrí la agenda del día (2 min).
2. Dá un turno de prueba y movelo de horario (3 min).
3. Cobrá ese turno y mandá el comprobante **a tu propio WhatsApp** (3 min).
4. Apagá el wifi de la tablet y fijate que, con los datos del chip o el hotspot, sigue andando (2 min).
5. **Cancelá el turno de prueba** y anulá su cobro.

---

## 5. Celular de mostrador

**Para qué sirve:** vender con lo que ya tenés. Es como trabaja hoy una carnicería chica: el celular en
la mano, el peso tipeado con el teclado grande y el ticket por WhatsApp.

### Lista de compras

| ✔ | Equipo | Qué pedir | Referencia (USD, provisional) |
|---|---|---|---|
| ☐ | **Celular Android** | Gama media, que vibre, con pantalla de 6" o más | 150 – 300 (o el que ya tenés) |
| ☐ | **Funda resistente y soporte** | Algo que aguante el mostrador (y la carne, si es carnicería) | 10 – 30 |
| ☐ | **Plan de datos** | Para **no depender del wifi** del local | según plan |
| ☐ | Lector Bluetooth (opcional) | Que diga **"modo teclado" o HID** | 40 – 100 |
| ☐ | Impresora térmica (opcional) | **Sólo si hay una PC al lado** (ver §2). Desde el celular no se imprime directo | ver §2 |

### Qué conectar a qué

- El celular, con datos móviles prendidos. Si usás el wifi del local, que el celular pase solo a datos
  cuando el wifi se cae (en Android: Ajustes → Wifi → "cambiar a datos móviles" o "wifi inteligente";
  el nombre cambia según la marca).
- **Lector Bluetooth:** se empareja como un teclado (Ajustes → Bluetooth). Mientras está conectado,
  Android a veces esconde el teclado de la pantalla; se vuelve a mostrar desde la notificación del
  teclado o desde Ajustes → Idioma y teclado → "Mostrar teclado virtual".
- **Dónde funciona hoy el lector:** en la pantalla **Caja con lector** (si tu negocio la tiene
  activada). En la pantalla **Vender**, escanear sin tocar nada llega **próximamente** (fase T-2); hoy
  ahí se busca el producto por nombre.

### Cómo probarlo en 10 minutos

1. Entrá con tu usuario y hacé una venta de prueba: buscá un producto, si se vende por kilo tipeá el
   peso con el teclado grande (3 min).
2. Cobrala y mandá el ticket **a tu propio WhatsApp** (3 min).
3. Apagá el wifi y repetí: con datos tiene que salir igual (2 min).
4. Si compraste lector: abrí Caja con lector y escaneá un producto (2 min).
5. **Anulá la venta de prueba** desde "Ventas del día".

---

## 6. Balanza etiquetadora (se suma a cualquier perfil)

**Cómo funciona:** **el sistema no se conecta a la balanza. Lee la etiqueta.** La balanza pesa e
imprime una etiqueta con código de barras; en la caja se escanea esa etiqueta con el lector y el
producto entra con su peso (o con su importe, según cómo esté programada).

- **Sirve cualquier balanza etiquetadora** que imprima código de barras **EAN-13 que empiece con 20 a
  29**, que es lo normal. Systel, Kretz, Moretti, Gama son ejemplos, no obligación.
- **Referencia:** 600 – 1.500 USD según marca y modelo (provisional a confirmar).
- **Qué hay que configurar:** en **Caja con lector → "Lector y balanza"** (lo ve el dueño) se cargan
  los datos de la etiqueta: qué prefijos usa, cuántos dígitos tiene el código del producto, y si la
  etiqueta trae **el peso o el importe**. La pantalla te muestra un ejemplo de cómo queda una etiqueta
  con ese formato. Si no sabés esos datos, pedíselos al técnico que programó la balanza.
- **"Mi balanza es…"** rellena el formulario según la marca (Systel, Kretz, Moretti o genérica), y el
  **probador** te deja escanear una etiqueta real y ver cómo la lee el sistema antes de guardar. Los
  formatos por marca son de referencia: confirmalos siempre con una etiqueta de tu balanza.
- **Código del producto:** el número de PLU que tiene cada producto en la balanza tiene que coincidir
  con el **código** del producto en el catálogo del sistema.

**Prueba de 5 minutos:** pesá algo, imprimí la etiqueta, escaneala en Caja con lector. Tiene que entrar
el producto correcto con el peso o el importe de la etiqueta. Si no lo reconoce, revisá los datos en
"Lector y balanza".

**Qué no hacemos:** no leemos la balanza por cable (puerto serie/USB) ni etiquetas de formatos viejos con
el precio "verificado" adentro del código. La etiqueta con lector cubre casi todos los casos.

---

## 7. Cobro con tarjeta: Mercado Pago Point (va aparte)

- El **Point de Mercado Pago** es un aparato aparte: **no está conectado al sistema**. El importe se
  tipea en el Point.
- Lo que cobrás con el Point lo registrás en el sistema como **"Mercado Pago"**: la plata cae en tu
  cuenta de Mercado Pago y así cuadra con su resumen. (Hoy los medios de cobro son Efectivo, Mercado
  Pago y Transferencia.)
- El Point lo comprás directo a Mercado Pago; **precio y comisiones, en su web al momento de comprar**.

---

## 8. Lo que NO prometemos (decilo en la reunión, ahorra disgustos)

- **Vender sin internet: hoy NO existe.** Si no hay conexión, **no se cobra en el sistema**: la pantalla
  avisa que la venta **no salió** (no te deja con la duda). Si se cortó justo mientras cobrabas, el
  sistema la reintenta sin duplicarla. Por eso en alto volumen **el 4G de respaldo y la UPS son
  obligatorios**: son baratos y resuelven casi todos los cortes.
- **Ticket térmico impreso desde el celular o la tablet: no.** El navegador del celu o la tablet no
  imprime directo en una térmica, ni por cable ni por **Bluetooth**. Ahí el ticket va por **WhatsApp**
  o se guarda en **PDF**.
- **El ticket no es factura.** Dice "No válido como factura". La factura electrónica es otro documento,
  cuando el negocio la tiene activada.
- **Lectura de la balanza por cable**: no (ver §6).
- **Marcas:** no exigimos ninguna. Si un equipo cumple la lista, sirve.

---

## 9. Si se corta algo: qué hacer

| Si… | Qué pasa | Qué hacés |
|---|---|---|
| **Se corta el wifi** | La pantalla avisa que no hay conexión y no deja cobrar. | Pasá la compu al **router 4G** (o al hotspot del celular) y recargá la pantalla. En celular/tablet, prendé los **datos móviles**. Seguís vendiendo en un minuto. |
| **Se corta la luz** | Con UPS: la compu, la impresora y el router siguen andando un rato (con 650 VA, típicamente 10 a 20 minutos; depende de lo que tengas enchufado). | Terminá la venta que estabas cobrando y no arranques ventas largas. Si la luz no vuelve, **pasá al celular de contingencia** (abajo) y apagá la compu con calma. |
| **Se corta la luz sin UPS, en pleno cobro** | Puede quedar la duda de si esa venta se grabó. | **Antes de volver a cobrar, mirá "Ventas del día"** desde el celular: si la venta está, no la repitas. |
| **Se rompe la compu** | El sistema no se pierde: vive en internet, no en la compu. | **Celular de contingencia** (abajo) hasta conseguir otra. En la compu nueva sólo hay que repetir la receta de impresión. |
| **No hay internet de ningún lado** | No se puede cobrar en el sistema. | Cobrá como siempre (efectivo, Point), **anotá cada venta en papel** y cargalas apenas vuelva la conexión, **el mismo día y antes de cerrar la caja**. Ojo: quedan con la hora en que las cargás, no con la hora en que vendiste. |
| **Se acabó el papel o se trabó la impresora** | El cobro se grabó igual; sólo falta el papel. | Mandá el ticket por WhatsApp, o reimprimilo después desde **"Ventas del día"**. |

### El celular de contingencia (armalo el primer día, no el día del corte)

- Un celular del negocio (o el del encargado) con **datos móviles** y **su propio usuario** del
  sistema. **No se comparten contraseñas**: cada uno entra con el suyo, así cada venta queda a nombre de
  quien la hizo.
- Dejalo **ya logueado** y con un acceso directo a **Vender** (o a **Caja con lector**, que también
  acepta el código tipeado a mano o el nombre del producto).
- La sesión dura unas horas: si hace mucho que no lo usás, te va a pedir entrar de nuevo. Sabé tu clave.
- Ese día el ticket va **por WhatsApp**.

---

## 10. Antes de comprar: checklist final

- ☐ Elegí mi perfil (§1) y, si vendo por peso con etiqueta, sumé la balanza (§6).
- ☐ Confirmé precios con el proveedor **el día de la compra**.
- ☐ La impresora es **USB, 80 mm (o 58 mm), con corte y con driver para Windows**.
- ☐ El lector dice **modo teclado / HID**.
- ☐ En alto volumen: **UPS de 650 VA o más** y **4G de respaldo**.
- ☐ Tengo un **celular de contingencia** con su usuario.
- ☐ Hice la **prueba de 10 minutos** y **anulé lo de prueba**.

**Si sos el comercial:** al dar de alta un cliente nuevo, decile su perfil en la misma reunión. Así se
termina el "¿y qué compro?".

---

**Ajustes por equipo — próximamente, con el módulo Terminal (fases T-1 y T-4 del plan):** en **Ajustes →
Este equipo** vas a poder decir qué es cada equipo (caja kiosco, tablet de recepción, celular de
mostrador), elegir el ancho del ticket (58 u 80 mm) y si el ticket se imprime solo al cobrar. Hasta que
llegue, el ticket sale en 58 mm (en una impresora de 80 mm se lee bien, con un margen a la derecha).

— Elaborado por GSG (Gestión Studio Grow)
