# Break Point Pádel — un negocio más del ERP, con su sitio en breakpointpadel.gsgapp.com.ar

**URL:** **https://breakpointpadel.gsgapp.com.ar/**
- `/` es la portada con la marca.
- `/turnero` es el turnero para los jugadores.
- `/club` es la gestión del club.

Con `/turnero` y `/club` abiertos en pestañas del mismo navegador, se sincronizan **en vivo, sin servidor**: la reserva
web, la seña confirmada y el turno del mostrador.

Prospecto en preventa (club de pádel, Ezeiza). La gestión del club es la **demo de gestión del club**
(agenda, buffet, caja de 12 a 12, clientes con cuenta corriente, proveedores, stock, contenido y tablero del
dueño con cámaras; usuarios con PIN), en un solo archivo, con **5 estilos visuales** a elegir (Chapa por defecto). **Es demo a costo cero:** datos de
ejemplo, sin persistencia ni credenciales (ciclo DEMO → VENTA → INVERSIÓN). Análisis y reglas:
[`REINGENIERIA.md`](REINGENIERIA.md).

Mismo mecanismo que Circuito WPE ([`../circuito-wpe/README.md`](../circuito-wpe/README.md)): **sin cambios de schema.**

| Pieza | Archivo |
|---|---|
| Fuente de la demo (la que se edita) | `public/previews/breakpoint/club/{index.html, app.mjs, motor.mjs}` |
| El sitio que sirve el ERP (generado, no se edita) | `src/tenants/breakpoint/sitio/{index, turnero, club}.html` (portada · turnero · gestión del club, cada uno en un solo archivo) |
| Empaquetador (con esbuild para el JS del turnero y del modo conectado) | `node src/tenants/breakpoint/empaquetar.mjs` |
| Registro del sitio (slug `breakpoint`, subdominio `breakpointpadel`, rutas `""`, `turnero`, `club`) | `src/lib/sitio-estatico.ts` (los rewrites y el trazado de `next.config.ts` salen de ahí) |
| Nombre y monograma del ingreso y del panel | `src/lib/branding.ts` → `TENANTS.breakpoint` |
| Los 5 estilos visuales (plan + ajustes) · generador del CSS | [`ESTILOS.md`](ESTILOS.md) · `src/tenants/breakpoint/generar-estilos.py` |
| Tests (motor, empaquetado al día, registro del sitio) | `src/tenants/breakpoint/motor-club.test.ts` · `src/lib/sitio-estatico.test.ts` |

En `breakpointpadel.<dominio>`, `/`, `/turnero` y `/club` se reescriben a `/sitio-estatico/…` (sólo en ese host) y
el manejador sirve el archivo **sólo si el host resuelve al negocio `breakpoint`**. Sin ese negocio en la base, responde 404 (falla cerrado): el código
puede estar publicado antes del alta sin exponer nada.

## Turnero web de canchas (para los jugadores)

Front del jugador y back **separados**, sincronizados **en vivo** con el backoffice; ingreso con Google o con
celular y contraseña; seña por transferencia con comprobante por **WhatsApp** y conciliación automática (con bandeja
"a revisar" para lo dudoso). Todo en DEMO: Google, WhatsApp y las cuentas del club son simulados y nada se guarda.

| Pieza | Archivo |
|---|---|
| Plan (RAE con Fable: dolores de los turneros, matriz, conciliación, evaluación de mesa del bodegón) + desvíos de la ejecución | [`TURNERO-PLAN.md`](TURNERO-PLAN.md) |
| Contrato de la API (lo construido) | [`TURNERO-API.md`](TURNERO-API.md) |
| Diseño (marca, motion, performance, accesibilidad) | [`TURNERO-DISENO.md`](TURNERO-DISENO.md) |
| Tests, defectos corregidos (antes/después) y mediciones | [`TURNERO-QA.md`](TURNERO-QA.md) |
| Front (estático, vanilla) · adaptador local de la demo pública | `public/previews/breakpoint/turnero/{index.html, turnero.css, app.mjs, local.mjs}` |
| Dominio isomórfico (lo usan el back y el adaptador local) | `public/previews/breakpoint/turnero/dominio/{nucleo, conciliacion, identidad}.mjs` + `club/motor.mjs` |
| Back (Node, sin dependencias) | `src/tenants/breakpoint/turnero/back/{servidor, auth, whatsapp}.mjs` |
| Modo conectado del backoffice (`?api=`) | `public/previews/breakpoint/club/conectado.mjs` |
| Levantar todo | `npm run turnero` · E2E: `npm run test:turnero-e2e` |
| Sync entre pestañas sin servidor (el sitio publicado) | `public/previews/breakpoint/turnero/bus.mjs` (una pestaña del turnero hace de servidor; el club entra sólo si hay un turnero abierto) |
| E2E del sitio servido (portada → turnero → reserva → seña, con el club en otra pestaña) | `src/tenants/breakpoint/turnero/e2e/sitio.e2e.mjs` (dentro de `npm run test:turnero-e2e`) |
| QA en Chrome real (sesión local) | [`TURNERO-QA-CHROME.md`](TURNERO-QA-CHROME.md) · defectos D21–D34 resueltos en [`TURNERO-QA.md`](TURNERO-QA.md) |

## Pedidos del club del 15/10 (gestión del club)

| Pedido | Cómo quedó | Dónde |
|---|---|---|
| La parte de la cancha de un jugador, a cargo de otro | En el turno, cada jugador tiene «Paga su parte / A cargo de X». Quien paga, paga lo suyo más lo de los que invita. No se encadena, y no se reasigna a quien ya pagó. | `motor.mjs` → `partesCancha`, `asignarCargoCancha`, `cobrarParte` |
| Paso previo para confirmar créditos (seña) | Con «Créditos del cliente», antes de descontar se ve un panel con de quién son, cuánto se usa, qué cubre (avisa si queda **pagada la seña**) y con cuánto queda. Se confirma o se vuelve atrás. | `app.mjs` → `pedirConfirmacionCredito`, `panelCredito` |
| «Consumo» → «cargo» | Todos los textos que se leen dicen «cargo». Los nombres internos no cambian. | `app.mjs`, `motor.mjs` |
| Mesa compleja: se cobra a mano y cada cargo se reparte como quieran | Dentro de la cuenta, «Mesa compleja» tiene dos cosas: **pasar un cargo** (entero o algunas unidades) a la cuenta de otra persona, y **cargo manual** para la excepción. Si se elige «Descuento», lo autoriza el dueño con su PIN y queda en esa cuenta: no se puede pasar a otra. | `transferirCargo`, `cargoManual` |
| Sumar o restar cargos | Cada cargo tiene − / +, en la cuenta y en «Cargos de los jugadores» del turno. Lo que se resta vuelve al stock. Ninguna cuenta, ni la de origen ni la de destino, queda por debajo de lo que ya se pagó. | `ajustarCargo` |
| Código de fábrica al lado del interno | Hay dos columnas: «Cód. interno» (BP-###) y «Cód. fábrica» (el código de barras). El lector y el buscador encuentran el producto por cualquiera de los dos. No se puede repetir un código, y no se distinguen mayúsculas. | `codigoExterno`, `productoPorCodigo` |
| Pricing / revenue editable | En Stock, la vista «Precios y rentabilidad» permite editar costo, % sobre costo y precio, y muestra margen, margen %, vendidos, facturado y ganancia de los últimos 7 días, con totales. | `rentabilidad`, `precioDesdeMarkup` · `tablaPrecios` |
| Bloqueo con PIN propio (celular, compu, tablet, POS) | Se bloquea tras N minutos sin uso (Ajustes, 5 por defecto) y cada vez que la pantalla se apaga o se cambia de app por más de 30 s. También a mano con el candado o la tecla L. Se desbloquea con el PIN de quien estaba usando el sistema o con «Entrar con otro usuario». Esc no lo cierra y ningún atajo abre nada detrás. Al bloquear se cierra lo que había abierto y se pierde el «Deshacer». 5 PIN mal → 30 s de espera. | `app.mjs` → `bloquear`/`desbloquear` · `ajustarBloqueo` |

Supuestos, a confirmar con el club:
- la gracia de 30 s al apagar la pantalla, para que mirar un WhatsApp no obligue a poner el PIN;
- el redondeo del precio calculado por % sobre costo a $50.

**Deuda de la demo, para el producto real:**
- Recargar la página saltea el bloqueo, porque la demo arranca sin login. En el producto real el bloqueo vive en la sesión del servidor y con PINs de más de 2 dígitos.
- «−» sobre un cargo ya cobrado no pide autorización. En el producto real tiene que dejar registrado quién anuló, o pedir el PIN del dueño.
- Con `?api=`, la ventana de clave del modo conectado puede abrirse encima del bloqueo. No permite saltearlo.

## Para que quede en vivo (dos pasos del dueño)

1. **Publicar** (Gate 1): merge de la rama a `main` + deploy del proyecto `erp-ch`. Antes: `tsc` + `next build`
   del proyecto completo en verde.
2. **Alta en producción** (consola: Soporte → Alta de negocio), como con WPE y el supermercado. Ojo: si el negocio ya
   se había dado de alta con subdominio `breakpoint`, hay que **cambiarle el subdominio a `breakpointpadel`** (el
   registro del sitio y los rewrites ya usan ese).

| Campo | Valor |
|---|---|
| Nombre del negocio | `Break Point Pádel` |
| Slug | `breakpoint` |
| Subdominio | `breakpointpadel` |
| Datos fiscales | vacíos, marcados *provisional a confirmar* |
| Certificado ARCA | **no** |

**Verificación:**
- `https://breakpointpadel.gsgapp.com.ar/` muestra la portada.
- `/turnero` muestra el turnero y `/club`, la gestión del club.
- Abrí `/turnero` en una pestaña y `/club` en otra, y reservá: el turno aparece solo en la agenda del club.
- `/api/health` sigue ok y la ficha de CH no cambió. **La clave del dueño que muestra el alta la copia el dueño; nadie más la lee.**

**Marca:** autorizada por el club (registrada el 15/10 en `docs/metodologia/registro-casos/breakpoint.md`). Colores y logo relevados de su Instagram (`MARCA-INSTAGRAM.md`); falta el **logo vectorial oficial** y las fotos originales (canchas, Delicias, shop), que se le piden al club.

— Elaborado por GSG
