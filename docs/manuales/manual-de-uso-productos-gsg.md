# Manual de uso — todos los productos GSG

*Guía en criollo, para gente que no es técnica. Explica qué es cada producto, para quién es, cómo se entra y cómo se usa paso a paso.*

> **Antes de empezar, tres cosas que conviene tener claras:**
>
> 1. **Es un solo sistema, muchos negocios.** Por debajo hay **un solo motor** (un solo programa). Lo que cambia entre una carnicería, una estética o una tienda de velas es la **configuración**: qué pantallas se prenden, qué palabras usa, si vende por kilo o por unidad. No son programas distintos: es el mismo, vestido distinto para cada rubro.
> 2. **Todo esto está en fase de prueba y adaptación.** Los negocios son reales, pero varias cosas todavía están "cableadas pero apagadas" — sobre todo la facturación electrónica. En cada sección te digo con honestidad **qué anda hoy y qué falta**.
> 3. **Hay dos "puertas" distintas.** La puerta del **operador** (vos/GSG, para dar de alta negocios y controlar todo) y la puerta del **dueño de cada negocio** (para manejar su local). Son mundos separados, con contraseñas separadas.

---

## Mapa rápido: todas las superficies y sus direcciones

| Producto | Para qué es | Dirección (URL) |
|---|---|---|
| **Consola de Operador** | El tablero de control de GSG: dar de alta negocios y vigilarlos | `gsg-erp.vercel.app` |
| **Comerciante** | El comercio que se factura sus ventas solo | `comerciante-gsg.vercel.app` |
| **Contador** | El panel del gestor que administra la cartera de sus clientes | `contador-gsg.vercel.app` |
| **Facturita** | (ver la aclaración honesta más abajo) | `facturita-gsg.vercel.app` |
| **CH Estética** | Estética con turnos | `chestetica-erp.vercel.app` |
| **Magra** | Carnicería boutique (tienda, venta por kg) | `magra-erp.vercel.app` |
| **Shine Velas** | Tienda de velas | `shinevelas-erp.vercel.app` |
| **A Dos Manos** | Tienda de pádel | `adosmanos-erp.vercel.app` |

En **cada negocio**, la dirección sola (ej. `magra-erp.vercel.app`) es la **vidriera pública** que ve el cliente final. El **panel de trabajo del dueño** (el "backoffice") está agregando **`/admin`** al final (ej. `magra-erp.vercel.app/admin`).

---

# 1. Consola de Operador

### Qué es y para quién

Es el **tablero de control de GSG** — tu tablero, no el del cliente. Desde acá se dan de alta los negocios nuevos, se los vigila y se los configura. El cliente final **nunca** entra acá. Es un mundo aparte, con su propia contraseña.

- **Dirección:** `gsg-erp.vercel.app`
- **Cómo se entra:** en `gsg-erp.vercel.app/operador/login`. Pide **una sola cosa: la contraseña** (no pide usuario ni email). La contraseña es **la que definiste** en la variable de entorno **`OPERATOR_PASSWORD`** (en producción es obligatoria). Si te equivocás varias veces te frena un rato ("Demasiados intentos fallidos"). La sesión te dura 8 horas.

### Cómo se da de alta un negocio nuevo — el wizard de 5 pasos

El alta es un asistente que te lleva de la mano. Se llega desde el menú de arriba, en **"Alta de tenant"**. A la derecha vas viendo **una vista previa en vivo** que se arma sola con lo que cargás. Los cinco pasos son:

1. **Negocio.** Cargás el **nombre del negocio** (ej. "Estética Norte"), el sistema te sugiere solo un **link corto** (el "slug", ej. `estetica-norte`) y te avisa en el momento si está libre o tomado. También ponés el **nombre del dueño** (opcional) y su **email** (obligatorio: es con lo que el dueño va a entrar a su panel).
2. **Rubro + Edición.** Escribís el rubro en palabras (ej. "ferretería", "spa", "carnicería") y el sistema lo traduce a la plantilla que corresponde. Elegís también la **edición**: **Comercio** (lo básico, arranca liviano) o **Empresa** (suma cuentas por pagar/cobrar, libros e inventario). Importante: se puede **subir de Comercio a Empresa después, sin migrar ni perder nada**.
3. **Módulos.** Es **solo para mirar**: te muestra qué funciones se van a prender según el rubro y la edición que elegiste. Acá no se toca nada — el ajuste fino se hace después, ya dentro del negocio.
4. **Marca + link.** Elegís el **color** de la marca, si la vidriera es **clara u oscura**, y el **monograma** (las 2 o 3 letras del logo). Podés reservar un **link propio** (subdominio), que es opcional. Y hay una solapa desplegable para cargar **datos de contacto** (ciudad, WhatsApp, dirección, Instagram), todo opcional.
5. **Revisar.** Te muestra el resumen de todo y la lista de lo que se va a crear. Si detecta algún problema (un link repetido, por ejemplo) te lo marca en rojo y **no te deja crear** hasta arreglarlo. Cuando está todo verde, tocás **"Crear tenant"**.

### Qué es eso del "dry-run", el "preview" y el "commit"

- **Preview (vista previa):** el panel de la derecha que se actualiza solo mientras cargás. Sirve para ver cómo va a quedar **antes** de crear nada.
- **Dry-run (simulación):** por detrás, con cada cambio el sistema hace un **ensayo sin escribir nada** en la base. Chequea que el link no esté tomado, que el email tenga formato válido, qué módulos correspondería prender, y arma la lista de lo que crearía. Es lo que alimenta la vista previa y lo que decide si el botón "Crear" se habilita.
- **Commit (crear de verdad):** recién cuando tocás "Crear tenant" el sistema **escribe en la base**: crea el negocio, el usuario dueño, la configuración inicial y siembra el catálogo del rubro. Lo hace en pasos ordenados y, si algo externo falla, deshace lo externo sin romper lo ya creado. **Todo el alta queda auditado** (queda registro de quién lo creó, cuándo, con qué datos). Al terminar, si el sistema generó una contraseña inicial para el dueño, **te la muestra una sola vez** con un botón para copiarla — copiala y pasásela al dueño en ese momento.

### El CUIT y el certificado fiscal — la verdad honesta

Hoy, **el wizard de alta NO pide el CUIT ni el certificado fiscal**. El alta crea el negocio, pero la parte fiscal (CUIT + certificado de ARCA) es un **paso aparte, posterior**, que se está terminando de conectar en la ficha de cada negocio dentro de la consola. A la fecha de este manual, cargar el **CUIT** de cada negocio todavía requiere una intervención manual del equipo técnico (por base de datos), porque el campo en la pantalla está en camino. Más detalle en la sección **6. Facturación**.

### Ver y configurar los negocios existentes

- La **home de la consola** (`/operador`) lista todos los negocios en una tabla: nombre y link, estado (Activo / En pruebas / Suspendido), plan, rubro, link propio, cantidad de módulos y un resumen de actividad (usuarios · productos/servicios · turnos/ventas). Arriba hay tarjetas con el total de negocios, cuántos activos y cuántos en prueba.
- Entrando a **"Configurar →"** de un negocio, podés cambiarle el estado, el plan, la marca (color y tema), el link propio, y **prender o apagar cada módulo uno por uno** para ese negocio.

### El Cockpit (tablero de salud)

Es una pantalla de **solo mirar** (no muestra datos de los clientes, solo el estado técnico). Tiene un semáforo general ("Anda todo" / "Necesita tu ojo" / "Algo caído"), un mapa de los negocios con su semáforo, un diagrama de la arquitectura, alertas de lo que necesita atención y el avance del plan de mejoras. Se refresca solo cada 30 segundos. *Nota: viene apagado por defecto y se prende con una variable de entorno; el estado de la base de datos también viene "en pausa" para no gastar recursos.*

### Qué NO se puede hacer todavía (honesto)

- El alta **todavía no conecta el link real** (DNS/subdominio en Vercel) ni **manda el email de invitación** al dueño de verdad — esos dos pasos están simulados. Por ahora, el link y el aviso al dueño los coordinás vos a mano.
- La memoria de "altas ya hechas" que evita duplicados vive en el proceso del servidor; si el servidor se reinicia, se pierde (la versión definitiva, en base, es un paso pendiente).
- La carga de CUIT/certificado fiscal, como dijimos, es un flujo aparte en construcción.

---

# 2. Los tres "productos de facturación" (Comerciante · Contador · Facturita)

**Este es el punto que hoy genera más confusión, así que va derecho y honesto.**

Revisamos el código a fondo. **Los tres no son tres productos distintos.** Son **tres direcciones (alias) que apuntan al mismo motor**. La idea de "tres productos de facturación" vive por ahora en el **marketing y en los documentos de estrategia**, no en el programa. Por debajo hay **un solo producto de facturación** (facturación electrónica ARCA + ingesta de Mercado Pago), y hoy está **en modo de prueba, sin emitir facturas reales**.

Dicho eso, cada nombre tiene un **sentido** y apunta a una superficie concreta:

### Comerciante — `comerciante-gsg.vercel.app`
- **Para quién:** el **comerciante monotributista** que quiere facturarse sus propias ventas (sobre todo las que cobra por Mercado Pago) sin pelearse con la web de ARCA.
- **Qué es en la práctica:** es **el backoffice del dueño** (`/admin`) con foco en el módulo **"Facturación y cobros"**. O sea, no es una app nueva: es el mismo panel de negocio, pensado desde la necesidad del comerciante de facturar.
- **Estado:** funciona en **modo prueba** (sandbox); la pantalla anda sin necesidad de credenciales, pero todavía no factura de verdad.

### Contador — `contador-gsg.vercel.app`
- **Para quién:** el **contador o gestor** que administra la cartera de muchos monotributistas.
- **Qué es:** la **única de las tres que tiene pantalla propia**. Es un "Panel del Contador" que muestra, de todos sus clientes juntos, cuánto cobró cada uno por Mercado Pago, cómo viene la conciliación (facturado / no facturable / a revisar / rechazado) y una **alerta de recategorización de monotributo** cuando un cliente llega al 80% del tope.
- **Estado:** es una **maqueta con datos simulados**. Se ve la pantalla y el concepto, pero los botones de "Facturar en lote" / "Descartar" están todavía deshabilitados. Le falta la conciliación real conectada a la base.

### Facturita — `facturita-gsg.vercel.app`
- **La verdad:** en el código, **"Facturitas" figura como el nombre de un COMPETIDOR** (una app que factura por WhatsApp/voz, de disparo manual), no como un producto propio de GSG. **No existe un producto GSG llamado "Facturita"** con código detrás. La dirección `facturita-gsg.vercel.app` está publicada, pero por ahora no tiene una pantalla propia distinta del motor común — probablemente sea una landing o demo de posicionamiento.
- **Recomendación:** si querés que "Facturita" sea un producto de verdad (por ejemplo, "la versión mínima y bien simple para facturar"), hoy **es solo una etiqueta**; hay que decidir y construir qué lo hace distinto del resto.

### En una frase
**Un solo motor de facturación (hoy en prueba), con dos usos según el rol: el comerciante que se factura solo y el contador que maneja la cartera.** "Facturita" todavía no es un producto: es un nombre. Cuando encendamos ARCA de verdad (sección 6), este es el motor que va a emitir.

---

# 3. El modelo Núcleo + Plugins (la pantalla `/admin/modulos`)

### La idea, en criollo

El sistema es como un celular: viene con **funciones que ya trae de fábrica** y podés **agregarle o sacarle apps** según lo que uses. La pantalla donde el dueño hace eso es **"Módulos"**, dentro de su panel (`/admin/modulos`). Es como una pequeña "tienda de apps" del negocio.

Hay dos tipos de piezas:

- **Nativas** (las de fábrica): son parte del sistema y usan su misma base. Ejemplos: Agenda, Caja/Pedidos, Catálogo, Clientes, Reportes.
- **Integraciones** (los "plugins"): son conexiones con servicios de afuera. Ejemplos: **ARCA** (facturación electrónica), **Mercado Pago** (cobros) y **Bancos** (facturar desde el extracto).

### ¿Qué es "núcleo que no se puede desinstalar"?

En la práctica, hay cosas que **no se pueden apagar**, pero no por una marca de "obligatorio", sino por **dependencias**: si una función necesita a otra, no te deja apagar la de abajo hasta que apagues la de arriba. Ejemplo: **la Lista de espera necesita la Agenda** → no podés apagar Agenda mientras la Lista de espera esté prendida. El sistema te lo dice con todas las letras: *"No podés apagar esto porque lo usan: … Apagá esos primero."*

Además, hay pantallas **de configuración base que nunca se ocultan**: el Tablero (dashboard), Ajustes, Usuarios, Auditoría, Localización y la propia pantalla de Módulos. Esas están siempre, pase lo que pase.

### Cómo el dueño suma (o saca) un módulo — paso a paso

1. Entra a su panel y va a **"Módulos"**. *(Solo el **dueño** puede; la recepción y los profesionales no ven esta pantalla.)*
2. Ve las **tarjetas** de cada módulo disponible **para su rubro** (una carnicería no ve "Agenda", una estética no ve "Pedidos"). Cada tarjeta dice el nombre, para qué sirve, si está **Activo** o **Apagado**, y si es **Nativo** o **Integración**.
3. Para **sumar** un módulo, toca **"Activar"**. Si ese módulo necesita otros, el sistema **prende también los que hacen falta**, y te avisa: *"Activaste 'X' (se activaron también: …)"*.
4. Para **sacar** uno, toca **"Apagar"**. Si otro módulo lo está usando, el botón aparece como **"Apagar (bloqueado)"** con la leyenda de quién lo usa.
5. Todo queda **guardado y registrado en la auditoría** (quién lo prendió o apagó y cuándo).

> **Aclaración honesta de hoy:** por ahora, prender o apagar un módulo **guarda tu elección**, pero el sistema **todavía no esconde automáticamente** las pantallas de los módulos apagados (esa parte está detrás de un interruptor que viene apagado por defecto). O sea, hoy esta pantalla funciona más como **tu inventario de módulos** que como un cerrojo. Es reversible y no rompe nada.

---

# 4. Los cuatro negocios

## 4.1 CH Estética — turnos

### Qué es y para quién
Una **estética que trabaja con turnos**. El cliente reserva desde la web; el mostrador maneja la agenda del día.

- **Vidriera pública:** `chestetica-erp.vercel.app`
- **Panel del dueño:** `chestetica-erp.vercel.app/admin`

### La reserva de turno, paso a paso (lo que hace el cliente)
Es un solo formulario que se va abriendo de a poco (arriba se arma un resumen en vivo con precio y seña):

1. **Elegís profesional** — la lista muestra a cada profesional con su box.
2. **Elegís servicio** — aparecen solo los servicios que hace ese profesional, con duración y precio (ej. "Limpieza facial (60 min) — $15.000").
3. **Elegís el día** — un calendario que no te deja elegir fechas pasadas.
4. **Elegís el horario** — el sistema te muestra solo los **huecos libres** de ese día. Si no hay, te lo dice.
5. **Cargás tus datos** — nombre y teléfono (obligatorios), email (opcional), el check "Soy vecino/a" si aplica precio especial, y un cupón si tenés. Tocás **"Confirmar"**.

El turno queda **"Pendiente de pago"**. El cliente recibe una pantalla de "¡Solicitud enviada!" que le avisa que lo van a contactar por **WhatsApp** para coordinar el pago. Después puede volver a su turno con el link para **cancelar o reprogramar**.

### La agenda del backoffice (lo que hace el mostrador)
En **"Turnos"** hay un **calendario del día** de **9 a 19 hs**, una columna por profesional. Cada turno es un bloque de color según su estado: **amarillo** = pendiente, **verde** = confirmado, **azul** = completado, **rojo** = no se presentó. Arriba te avisa qué profesionales no están (franco/vacaciones). Tocando un turno lo gestionás: **confirmar el pago** (eligiendo Mercado Pago / Efectivo / Transferencia), **cancelar**, **reprogramar**, o marcar **"Completado"** / **"No se presentó"**.

### La lista de espera
En **"Espera"**, cuando no hay horario, anotás al cliente (nombre, teléfono, servicio, profesional preferido, cuándo le viene bien). Cuando se libera un hueco, con la anotación reservás el turno de un clic. Podés marcar "Avisado" o quitarlo.

## 4.2 Magra — carnicería (tienda + venta por kg)

### Qué es y para quién
Una **carnicería boutique** que vende por la web y por mostrador, con **venta por kilo**.

- **Vidriera pública:** `magra-erp.vercel.app` *(Magra tiene una vidriera con diseño propio, más fiel a su marca; los otros dos negocios de tienda usan un molde común.)*
- **Panel del dueño:** `magra-erp.vercel.app/admin`

### El flujo de la tienda (lo que hace el cliente)
1. **Catálogo** — los cortes agrupados por sección, cada uno con su precio "**/ kg**" o "/ unidad" y botones **+ / −**. Para lo que va por peso, cada toque suma de a **¼ kg**.
2. **Carrito** — en "Tu pedido" ve las líneas, el subtotal, el costo de envío y el total. Si falta poco para el envío gratis, se lo dice.
3. **Checkout** — nombre y WhatsApp (obligatorios), elige **Retiro o Envío** (con dirección si es envío) y una nota. Puede **"Hacer el pedido"** o **"Pedir por WhatsApp"** (arma el mensaje solo).
4. **Pedido** — el pedido entra **sin cobrar** (se coordina el pago al recibirlo) y el cliente ve "¡Pedido recibido!" con su número.

> **La venta por kg:** el peso final se ajusta a la pieza real. Por eso figura la aclaración "El total puede ajustarse al peso real de cada pieza envasada". En el mostrador se pesa con precisión (de a gramos).

### La gestión de pedidos (lo que hace el mostrador)
La pantalla **"Caja y pedidos"** tiene arriba el **mostrador (POS)** y abajo la **bandeja de pedidos**.
- **Mostrador (POS):** elegís producto, lo **pesás** o cargás cantidad, y armás el ticket. Podés vender al instante ("Caja / mostrador", se cobra en el acto) o cargar un "Pedido (retiro/envío)". Marcás "Cobrado" con el medio de pago.
- **Bandeja:** cada pedido avanza por estados — **Pendiente → Confirmado → En preparación → Listo → Entregado** (o Cancelado). Con un botón lo pasás al siguiente estado, con otro lo **cobrás**, y podés cancelarlo.

### El catálogo y el stock
- **Catálogo:** cargás los productos con su precio (por kg o por unidad) y su stock. Sin producto cargado, no se puede vender.
- **Compras y reposición:** cuando entra mercadería, la registrás y el sistema **suma el stock solo**. Te avisa "Stock bajo" para lo que conviene reponer.
- **Al vender, el stock se descuenta solo** (con un candado que nunca lo deja en negativo).
- **Ajustes y mermas:** para corregir stock por recuento, rotura o vencimiento — cada ajuste queda con su motivo.
- **Inventario:** una vista de solo lectura con los niveles y **cuánto vale** tu stock a costo. *(Es una función de la edición Empresa.)*

## 4.3 Shine Velas y A Dos Manos — tiendas

- **Shine Velas:** `shinevelas-erp.vercel.app` (velas, aromas, decoración)
- **A Dos Manos:** `adosmanos-erp.vercel.app` (palas y zapatillas de pádel)

**Funcionan igual que Magra**, con el mismo flujo de tienda, mismo mostrador, misma caja y mismo stock. Las **únicas diferencias** son de configuración:
- **Venden por unidad** (no usan balanza).
- Tienen **su propio catálogo y sus propias palabras** (Shine agrupa en "La colección"; A Dos Manos en "Palas y zapatillas").
- Usan el **molde de vidriera común** (Magra es la única con diseño 100% propio por ahora).

En criollo: **es el mismo programa; solo cambia la lista de productos y los textos.**

## 4.4 La Caja (sirve para todos)

La caja es transversal (la usan las tiendas y también sirve en estética). El ciclo es simple:

1. **Abrís la caja** declarando el **fondo inicial** (con cuánto efectivo arrancás el cajón). No te deja abrir dos a la vez.
2. **Durante el turno**, las **ventas en efectivo entran solas** a la caja. Y podés cargar a mano **ingresos, egresos o retiros** (siempre con un motivo).
3. **En vivo** ves el **"efectivo esperado ahora"** = fondo inicial + ventas en efectivo + otros ingresos − egresos − retiros, con el detalle de cada movimiento.
4. **Cerrás con arqueo:** contás la plata real del cajón y la cargás. El sistema compara con lo esperado y **congela el cierre** con el resultado: **Cuadra / Faltante / Sobrante**. El histórico queda cerrado y no se toca.

---

# 5. El backoffice (`/admin`) — cada módulo explicado simple

Este es el panel de trabajo del dueño de cada negocio. Según el rubro, aparecen unas u otras secciones. Acá va cada una en dos líneas, para alguien que maneja un negocio, no una computadora:

| Módulo | Para qué te sirve | ¿Quién lo usa? |
|---|---|---|
| **Turnos / Agenda** | La agenda del día: quién atiende, a qué hora y con qué profesional. | Negocios de servicios (estética, peluquería). Una carnicería no lo usa. |
| **Espera** | Anotás a quien quería turno y no había lugar; cuando se libera, lo reservás de un clic. | Servicios. |
| **Caja y pedidos (POS)** | El mostrador: elegís producto, lo pesás o cargás cantidad, cobrás; o tomás un pedido para retiro/envío. | Tiendas y comercios. Una estética pura no lo usa. |
| **Caja** | Abrís el turno con el fondo inicial, registrás movimientos y cerrás con arqueo. Las ventas en efectivo entran solas. | Todos. |
| **Catálogo** | Todo lo que vendés u ofrecés: servicios, productos, boxes, profesionales y cupones. | Todos (cambia según rubro). |
| **Clientes** | La libreta de contactos del negocio: nombre, teléfono e historial de cada cliente. | Todos. |
| **Compras y reposición** | Registrás la mercadería que entra y el sistema suma el stock solo. Te avisa lo que conviene reponer. | Los que manejan stock. |
| **Ajustes y mermas** | Corregís el stock por recuento, merma, rotura o vencimiento; cada ajuste queda con su motivo. | Los que manejan stock. |
| **Inventario** | Los niveles de stock y cuánto vale a costo (solo lectura). | Edición Empresa. |
| **Reportes** | Los números del negocio: ingresos, métricas y comisiones por profesional. | Todos (las comisiones, servicios). |
| **Cuentas a cobrar** | El fiado: quién te debe, cuánto y desde cuándo. | Comercios con fiado. |
| **Cuentas a pagar** | Lo que le debés a proveedores, con vencimientos y cheques. | Edición Empresa. |
| **Devoluciones a proveedor** | Devolvés mercadería (falla, vencimiento): baja el stock y genera un crédito. | Edición Empresa. |
| **Libros / Exportar al contador** | El Libro IVA armado desde tus ventas y compras, para pasarle a tu contador. | Edición Empresa. |
| **Facturación y cobros** | Emitís facturas ante ARCA y generás links de cobro por Mercado Pago. (Ver sección 6.) | Todos. |
| **Recordatorios** | Configurás los avisos a clientes (turnos, novedades). El envío real se activa al conectar WhatsApp/email; hoy queda simulado. | Sobre todo servicios. |
| **Reseñas** | Publicás en la web las opiniones que elijas; por defecto quedan ocultas hasta que las aprobás. | Servicios. |
| **Localización** | Dónde está el negocio y cómo contactarlo (dirección, WhatsApp, Instagram, horarios). Aparece en la web. | Todos. Solo el dueño. |
| **Módulos** | La "tienda de apps": prendés y apagás funciones según lo que uses. | Todos. Solo el dueño. |
| **Usuarios** | La gente que entra al panel (dueño/recepción/profesional). Cada acción queda auditada. | Todos. Solo el dueño. |
| **Auditoría** | El registro de las últimas acciones: quién, cuándo y qué cambió. Útil ante dudas. | Todos. Solo el dueño. |

---

# 6. Facturación — cómo se emite hoy, cómo será, y qué falta

Esta es la parte donde más importa ser honesto.

### Cómo se emite hoy
**Hoy no se emite ninguna factura fiscal de verdad.** Todo está en modo **prueba (simulado)**. La pantalla **"Facturación y cobros"** tiene un botón **"🧪 Banco de pruebas: emitir factura de prueba"** que arma una factura de ejemplo y devuelve un número de autorización (**CAE**) **inventado** — sirve para ver que el circuito anda, pero **ese comprobante no vale ante ARCA**. La misma pantalla te lo aclara: *"En modo prueba se obtiene un CAE simulado (sin red)"*.

### Cómo será en real
El programa para facturar de verdad **ya está construido** (la conexión con ARCA existe); lo que falta es **encenderlo con las credenciales reales**. Hay dos escalones:

1. **Homologación** — el ambiente oficial de **pruebas de ARCA**. Da un CAE válido **solo para testear**, no para facturar de verdad. Es a prueba de errores: aunque algo esté mal configurado, fuerza el ambiente de testing, así nunca se te escapa una factura real por accidente.
2. **Real** — factura de verdad. Necesita el **CUIT real** de cada negocio y su **certificado productivo**, más encender el interruptor definitivo. Recién ahí, cuando el negocio cobra, el sistema crea la factura y trae el CAE real solo.

Un detalle de seguridad: en modo real, si el CUIT del certificado no coincide con el del negocio, **el sistema se planta y no factura** (para no firmar con el certificado de otro).

### En qué estado estamos y qué falta
- **Ya está listo:** la base de datos para guardar el **certificado de cada negocio cifrado** (aplicada en producción) y la pantalla de la consola para cargarlo.
- **Falta (y son pasos que hace el dueño, nunca el agente, porque son secretos):**
  1. Encender el modo homologación en los proyectos (variable `ARCA_MODO`).
  2. Cargar el **CUIT de cada negocio** — hoy con un gap: todavía requiere una carga manual por base de datos, porque el campo en la pantalla está en camino.
  3. Cargar el **certificado de prueba** de cada negocio desde la consola.
  4. Para pasar a real: el **CUIT real** y el **certificado productivo** de cada negocio.

**En una frase:** la facturación está **cableada de punta a punta pero apagada**. Hoy "emite" comprobantes de prueba; para emitir de verdad faltan las credenciales reales que carga el dueño.

---

# 7. Los tres roles: quién puede hacer qué

Cada persona que entra al panel de un negocio tiene un **rol**. El rol decide qué ve y qué puede tocar. Son tres:

### Dueño (OWNER) — puede todo
Ve y maneja **absolutamente todo**: agenda, clientes, caja, pedidos, catálogo y precios, compras y stock, reportes con los números y comisiones, reseñas, recordatorios, facturación y cobros, localización, la auditoría, los **usuarios** (dar de alta gente y resetear contraseñas) y los **módulos**. Es el único que puede tocar precios, ver la plata y administrar la cuenta.

### Recepción (RECEPTION) — el día a día del mostrador
Puede lo operativo: **la agenda completa** (crear, mover, cancelar y cobrar turnos, marcar completado/no-show), **alta y gestión de clientes**, la **lista de espera**, y el **mostrador** (tomar pedidos, cobrarlos, marcarlos listos/entregados, usar la caja).
**No puede:** ver reportes financieros, tocar el catálogo/precios, la facturación, los cobros, los usuarios, los módulos ni la configuración. Es a propósito: la recepción opera, pero no ve la plata ni cambia la configuración.

### Profesional (PROFESSIONAL) — solo lo suyo
Ve **solo su propia agenda** y puede **marcar sus turnos** como completado o no-show. Nada más: no crea turnos, no ve clientes, no toca caja ni catálogo, ni ninguna configuración.

---

# 8. Si perdiste una contraseña

Ninguna contraseña se puede "recuperar" leyéndola: se guardan cifradas, no en texto. Lo que se hace es **ponerle una nueva**. Según qué contraseña sea:

### Perdió la contraseña un usuario del negocio (recepción o profesional)
Es lo más común y lo más fácil. **El dueño** entra a su panel, va a **"Usuarios"**, elige a la persona y usa **"Restablecer contraseña"** para ponerle una nueva (mínimo 8 caracteres). Se la pasa a la persona y listo. Queda registrado en la auditoría que se hizo un reseteo (nunca la contraseña en sí).

### El dueño (OWNER) perdió su propia contraseña
Acá hay que distinguir:
- **Si hay más de un dueño** en ese negocio, el otro dueño puede resetearle la contraseña desde "Usuarios" (igual que arriba).
- **Si es el único dueño** y quedó afuera, no hay un "olvidé mi contraseña" en la pantalla de login. La solución la hace el equipo técnico/operador: se le vuelve a fijar la contraseña al usuario dueño de ese negocio (con el mismo mecanismo de alta/reprovisión que se usó al crearlo, que toma la contraseña de la variable de entorno **`PROVISION_OWNER_PASSWORD`**). No se desentierra la vieja: se pone una nueva.

### Se perdió la contraseña del Operador (la consola GSG)
La contraseña del operador **no es de un usuario**: es un secreto de entorno. Se cambia poniendo un valor nuevo en la variable **`OPERATOR_PASSWORD`** (en el proyecto de Vercel) y volviendo a desplegar. Con eso, la nueva contraseña es la que valga a partir de ahí. *(Ese cambio, como todo lo de secretos, lo hace el dueño/equipo, no el agente.)*

> **Regla de oro:** las contraseñas nunca se guardan ni se leen en texto. Siempre el camino es **fijar una nueva** — por la pantalla de Usuarios (lo normal) o por variable de entorno (los casos de dueño único u operador).

---

*Manual escrito a partir de la lectura del código real del sistema (rama `fase2/consola-operador`), en fecha 2026-07-13. Refleja el estado a hoy: varios circuitos están cableados pero apagados a la espera de credenciales reales (sobre todo la facturación ARCA). Cuando esas piezas se enciendan, conviene actualizar las secciones 1, 2 y 6.*

*— Elaborado por GSG*
