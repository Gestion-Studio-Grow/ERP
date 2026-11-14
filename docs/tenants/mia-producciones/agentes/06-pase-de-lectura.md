# 06 · «Copiar para Claude»: que quien atiende la bandeja prepare la respuesta con ayuda de Claude

> Estado: diseño, sin construir. Se construye **dentro del brief 1D** (bandeja) o como brief 1E inmediatamente
> después. Superficie: seguridad y datos entre negocios → certificación adversarial sobre el diff.
> El archivo conserva el nombre `06-pase-de-lectura.md`, pero **el pase de lectura quedó descartado** (ver abajo).

## Decisiones del dueño que lo originan (14/11/2026, sesión session_01BtqRUKojnK9M175EeSA8pp)

- «Si contesta la sesion tenemos que probar realmente.»
- Sobre el acceso de la sesión a la bandeja: «El acceso te lo autorizo y diseñalo y certificalo.»
- GSG ve los datos del negocio para contestar: «2. Si».
- El aviso al cliente: «Van en los términos y condiciones de servicio del producto.»
- «Excediendo los 3 minutos tenemos tiempo para validar la respuesta también. y dar una mejor calidad.»

## Qué pasó con el pase de lectura

La primera versión de este documento proponía un «pase»: un permiso temporal para que la sesión de Claude leyera un
pedido por una ruta nueva del sistema. Un agente de seguridad distinto lo certificó el 14/11 y el veredicto fue
**NO CUMPLE**:

- Abría una ruta pública nueva en producción, para los cuatro negocios, sin sesión de operador; el control que vigila
  las lecturas entre negocios (`src/lib/operador/guardia-negocio.test.ts:372`) sólo mira acciones de servidor y no la
  habría visto.
- El tope de lecturas tenía una carrera, y el registro es de sólo agregar (`03` §3, `REVOKE`), así que no se podía
  contar con candado.
- Buscar el pase en el registro no tiene índice: cada intento sin sesión recorre la tabla y despierta la base.
- Servía poco tiempo: con clave de API e interruptor prendido, el texto libre va al motor y no pasa por la bandeja.

El certificador recomendó la alternativa que este documento ya traía como plan B. **Es la que queda.**

## Qué se construye: el botón «Copiar para Claude»

1. La persona de GSG abre un pedido `EN_BANDEJA` (queda `LECTURA_GSG`, como en `03` §4.4).
2. Toca **«Copiar para Claude»**. Una acción de servidor arma el texto (el pedido y su ficha) y lo devuelve; el
   navegador lo copia al portapapeles.
3. La persona lo pega en su sesión de Claude y le pide que prepare la respuesta.
4. La persona valida la propuesta contra la ficha, la pega en la bandeja y toca «Responder» (`responderEnTx`).
5. En el Registro del negocio queda quién copió, quién leyó y quién respondió.

No hay ruta nueva, ni pase, ni secreto, ni acceso de red de la sesión hacia producción. El servidor no llama a ninguna
IA: los datos salen sólo cuando una persona los pega en su sesión.

## Reglas (cada una con su test)

- **C1 · Sólo una persona, con sesión de operador.** `copiarParaIa` es una acción de servidor en `bandeja/actions.ts`;
  primera línea `operadorParaNegocio({ id })`. Entra en el control de `guardia-negocio.test.ts` como las demás.
- **C2 · Sigue sin haber lista ni respuesta para robots.** No se agrega nada en `src/app/api/`. El invariante 1 de
  `03` §4.4 queda como está.
- **C3 · Queda registrado.** Fila `COPIA_PARA_IA` con `operator:<nombre>` en el registro del negocio, visible para el
  negocio como «GSG».
- **C4 · La ficha respeta lo que puede ver quien pidió.** La ficha se arma con las herramientas de lectura del puesto
  y con el recorte de la persona que dejó el pedido. Hoy no se puede: `AgentePedido` guarda sólo `userId` y `03` §5
  dice que no existe ni se crea una función que arme a una persona desde un `userId`. **Enmienda a la migración (antes
  de aplicarla):** sumar a `AgentePedido` un campo `recorte` (Json), tomado con `actorActual` en el momento de dejar el
  pedido (módulos, proyectos visibles, columnas ocultas). Sin `recorte`, la ficha sale vacía y se copia sólo el texto.
- **C5 · Los datos de terceros se filtran.** Antes de copiar, la ficha pasa por el mismo filtro que usa el producto
  para mandar datos a una IA (`datosParaLaIa`): fuera CUIT, CBU, alias, mails y teléfonos de clientes del negocio.
- **C6 · Lo que escribió el cliente son datos, no instrucciones.** El texto copiado va escapado (`escaparDatos`,
  `src/lib/proyectos/diseno-core.ts:377`) y con un encabezado fijo que lo dice.
- **C7 · La respuesta no puede llevar links, CBU ni alias.** `responderEnTx` pasa la respuesta por
  `texto-seguro-core` (`03` §13) antes de guardarla, venga de donde venga. Un pedido malicioso no puede usar a GSG
  para mandarle al negocio una cuenta o un enlace «con la firma de GSG».
- **C8 · El negocio lo habilitó.** El botón existe sólo si el negocio tiene prendido `equipo-agentes-ia` y aceptó los
  términos del producto que lo avisan (abajo). Apagado: la persona de GSG contesta sin IA.
- **C9 · Fase sin clave de API: sólo datos de prueba.** Decisión del dueño: con datos reales del cliente se usa la API.
  Es regla de trabajo, no bloqueo técnico.
- **C10 · La sesión que atiende no tiene conectores.** Regla de trabajo: se usa un perfil de atención sin Neon, Gmail,
  Vercel ni escritura en repositorios, porque el texto lo escribe un tercero.

## Enmiendas a `03` que este documento ordena (las aplica quien construya 1A y 1D)

1. `03` §3: campo `recorte` Json en `AgentePedido` (C4). **Urgente: va en la migración única, antes del Gate 2.**
2. `03` §4.4, donde dice que GSG no ve los datos del negocio (línea 378 al 14/11) y §13 (línea 750): GSG ve la ficha
   del pedido, con C4 y C5. Decisión del dueño del 14/11.
3. `03` §4.4, `responderEnTx`: suma el filtro de C7.
4. `03` §4.4, invariante 4 («no hay sugerir la respuesta con IA»): sigue valiendo para el servidor. Lo nuevo es que la
   persona puede copiar el pedido a su propia sesión, con C3, C5 y C8.
5. Plazo del texto libre: los 180 s valen para los pedidos de la lista; al texto libre se le avisa «recibido, lo está
   viendo una persona» y su plazo es de 15 minutos (provisional a confirmar por el dueño).

## Archivos

- `src/lib/agentes/ficha-bandeja.server.ts`: `fichaParaBandeja(tx, pedido)`, usada por la pantalla y por el botón.
- `src/lib/agentes/bandeja.server.ts`: `copiarEnTx(tx, …)` (arma el texto y deja `COPIA_PARA_IA`); filtro en
  `responderEnTx`.
- `src/app/operador/(console)/bandeja/actions.ts`: acción `copiarParaIa`. `ResponderPedido.tsx`: el botón.
- Tests, antes de la certificación: `ficha-bandeja.test.ts` (recorte, filtro de terceros, escapado),
  `bandeja-postgres.test.ts` (dos negocios; copia con interruptor apagado; respuesta con link, CBU o alias rechazada)
  y `bandeja-solo-personas.test.ts` sin cambios (sigue sin haber ruta).

## Términos y condiciones del producto (decisión del dueño)

Tienen que decir, en criollo: que un pedido escrito lo puede leer y contestar una persona de GSG; que para contestar
ve los datos del negocio que ese pedido necesita; que puede ayudarse con una IA, y cuál, si el negocio lo tiene
prendido; y que todo queda en el Registro del negocio. Observación del certificador: el interruptor lo prende GSG, no
el cliente, así que la aceptación de estos términos tiene que quedar registrada por negocio. Redacción pendiente
(frente de dirección o legal).

## Abierto

- Quién atiende la bandeja y cómo se entera.
- Plazo del texto libre (15 minutos, provisional).
- Redacción y registro de la aceptación de los términos.

## Prueba clic por clic

1. Dejar un pedido de texto libre en el negocio de MIA, con `equipo-agentes-ia` prendido.
2. En la bandeja: abrirlo, tocar «Copiar para Claude» y pegar en la sesión.
3. Ver que lo pegado trae el pedido y la ficha, sin CUIT, CBU, mails ni teléfonos de terceros.
4. Pegar la respuesta en la bandeja y enviarla; ver el tiempo y «Respondido por una persona de GSG» en el buzón.
5. Intentar enviar una respuesta con un link o un CBU: el sistema la rechaza y dice por qué.
6. Apagar `equipo-agentes-ia`: el botón desaparece.
7. Registro de MIA: aparecen la lectura, la copia y la respuesta.
