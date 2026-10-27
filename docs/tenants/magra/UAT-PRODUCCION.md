# MAGRA — UAT en producción (Chrome real)

**Cuándo:** con el negocio `magra` publicado (Gate 1) y sus datos cargados por el dueño: WhatsApp del local,
catálogo con precios por kilo y por unidad, horario y dirección. Mientras alguno falte, el paso que lo usa se marca
**BLOQUEADO** y se anota qué falta; no se inventa.
**Dónde:** la URL del negocio en Chrome real, en escritorio (1440 px) y con el celular emulado (DevTools → 390 × 844).
La tienda es `/tienda`; el panel, `/admin`.
**Usuarios:** dos, que crea el dueño desde Usuarios: **Dueño** (rol Dueño/a) y **Mostrador** (rol Recepción). Las
claves no se escriben en ningún lado, tampoco en el resultado.
**Regla:** es producción con datos reales. Cada pedido, venta o movimiento de prueba lleva **«UAT»** en el nombre o en el
detalle, y al final se anula (pedidos y ventas) o se borra (movimientos manuales) desde el panel. **No se cierra el día
real con números de prueba:** el paso 7.3 se hace sólo si el dueño lo autoriza ese día, o se corre en el recorrido
automático (abajo). No se toca ninguna configuración de Vercel ni de Neon.

Cada paso se marca **OK / FALLA / BLOQUEADO**. Cada falla lleva captura, URL, usuario, qué se esperaba y qué pasó.
El resultado va al final de este archivo, en «Resultado».

**Recorrido automático:** este mismo guion corre clic por clic en Chromium contra la app de producción (`next start`)
sobre una base Postgres **local** sembrada con `prisma/seed-magra.ts` (nunca Neon):

```bash
npm run build && npm run test:magra-uat [carpeta de capturas]   # por defecto dist/uat-magra
```

Necesita Postgres local (`ERP_TEST_PG_URL`, por defecto `postgresql://postgres@localhost:5433/postgres?host=/tmp/pgrun`,
el mismo del arnés de tests). Crea su base, aplica migraciones y RLS, siembra MAGRA con el slug `magra`, levanta la app
como `app_rls` y la borra al terminar. Falla ante cualquier error de consola y deja capturas a 390 y 1440 px. Los números
de paso del recorrido son los de este guion. Para mirar a mano el mismo entorno: `node --import tsx
src/tenants/magra/e2e/entorno.mjs` (Ctrl+C lo borra).

## 0. Publicación y aislamiento

| # | Paso | Esperado |
|---|---|---|
| 0.1 | Abrir `/tienda` | La tienda de MAGRA («¡Esto no es una carnicería!», sus colores y su logo). No es la vidriera genérica «Mi negocio». |
| 0.1b | Bajar hasta el pie | Dirección, horario y WhatsApp son los del local. Lo que todavía no está cargado no aparece: nunca «a confirmar» ni un número inventado. |
| 0.1c | Sin WhatsApp del local cargado | No hay botones de WhatsApp: el pedido entra por «Enviar pedido». |
| 0.2 | Abrir `/admin` sin sesión | Rebota al ingreso del panel con el nombre de MAGRA. |
| 0.3 | Abrir la URL de CH Estética y la de otro negocio | Están igual que antes: MAGRA no se mezcla con nadie. |
| 0.4 | Como Dueño: Clientes | Sólo clientes de MAGRA. |

## 1. Acceso por rol (Dueño y Mostrador)

Matriz que hay que confirmar con **los dos usuarios** (✔ = lo ve y lo usa; ✘ = no lo ve, y por URL cae en «no está disponible»):

| Qué | Dueño | Mostrador |
|---|---|---|
| Inicio con «Ventas hoy» y cortes para reponer | ✔ | ✔ |
| «Ingresos hoy» e «Ingresos 7 días» en el Inicio | ✔ | ✘ |
| Pedidos (bandeja): preparar, pesar y ajustar, listo, entregar, cobrar | ✔ | ✔ |
| Vender (`/admin/vender`) y Ventas del día (`/admin/ventas`) | ✔ | ✔ |
| Anular un pedido o una venta | cualquier día abierto, motivo opcional | sólo lo cobrado hoy, **motivo obligatorio** |
| Caja del día: abrir el turno, gastos y retiros | ✔ | ✔ |
| Cierre del día (`/admin/caja/cierre`) y Libro de caja | ✔ | ✔ |
| Clientes | ✔ | ✔ |
| Catálogo y Actualizar precios | ✔ | ✘ |
| Costos y margen | ✔ | ✘ |
| Stock / Inventario, Compras, Facturación, Reportes, Auditoría, Usuarios, Datos del negocio | ✔ | ✘ |

Caso de acceso:
- **1.1** Clave equivocada: avisa y no entra. Muchos intentos seguidos frenan el ingreso un rato (es la protección del panel, no una falla).

## 2. La clienta pide 1,5 kg desde el celular (390 px)

| # | Paso | Esperado |
|---|---|---|
| 2.1 | `/tienda` → en un corte por kilo, tocar **+** 6 veces | La bolsa dice **1,5 kg** (de a 0,25 kg por toque), el precio por kilo y **«Total estimado»**. |
| 2.2 | Mirar debajo del total | «El total puede ajustarse al peso real de cada pieza envasada.» |
| 2.2b | Sumar un producto por unidad (+ una vez) | Entra como **1 u** con su precio por unidad. |
| 2.3 | Nombre «Clienta UAT», WhatsApp «hola», Enviar pedido | No se manda: dice que revise el WhatsApp y cómo escribirlo. |
| 2.4 | WhatsApp válido, dirección, **Enviar pedido** | «¡Pedido recibido!» con el número de pedido. |
| 2.5 | Otra bolsa → retiro en el local → **Pedir por WhatsApp** | Registra el pedido y abre el chat **del local** con el número de pedido, los renglones y el total ya escritos. Sin WhatsApp del local cargado: avisa «Todavía no publicamos el WhatsApp» y no abre nada (BLOQUEADO hasta que el dueño lo cargue). |

## 3. La bandeja avisa el pedido

| # | Paso | Esperado |
|---|---|---|
| 3.1 | Dueño con `/admin/pedidos` abierto y a la vista; la clienta manda un pedido | En menos de un minuto, sin tocar nada: «Entró un pedido nuevo de la tienda: #N» y un sonido (se puede apagar con «Sonido del aviso»). |
| 3.2 | Mirar la línea de estado de la bandeja | «N de la tienda esperando · el más viejo hace X min», en alerta pasados 15 min (umbral a definir con el dueño). |
| 3.3 | Lo mismo con la bandeja en otra pestaña | No suena hasta volver; al volver, la línea de estado dice cuánto hace que espera (matriz de eventualidades, caso 1). |

## 4. Preparar, pesar y ajustar, cobrar y entregar

| # | Paso | Esperado |
|---|---|---|
| 4.1 | En el pedido de la clienta: **Preparar** → **Pesar y ajustar** → poner el peso real (1,62 kg) → Guardar peso real | El renglón pasa a 1,62 kg y el total se recalcula al precio por kilo con el que pidió. |
| 4.2 | **Marcar listo** → **Entregar** → elegir Efectivo → **Cobrar y entregar** | Queda «Entregado» y cobrado; entra en la caja del día. |
| 4.2b | En otro pedido: Entregar → «Queda a cobrar» | Queda entregado y a cobrar; no entra plata en la caja. |
| 4.3 | Dueño: Catálogo → el corte | El stock bajó el peso **real** (1,62), no el pedido (1,5). |

## 5. Anular

| # | Paso | Esperado |
|---|---|---|
| 5.1 | Mostrador: en el pedido de WhatsApp, Anular… → Sí, anular sin motivo | No anula: pide el motivo. |
| 5.2 | Con motivo «UAT: la clienta canceló» | Anulado. Como no estaba cobrado, dice que la caja no se toca. |
| 5.3 | Dueño: Catálogo | La mercadería volvió al stock (salvo que se haya tildado «La mercadería no volvió»). |
| 5.4 | Anular una venta cobrada hoy | Dice cuánto se devuelve en la caja del día en que se cobró, y la caja lo resta. |

## 6. Venta de mostrador (Mostrador, 390 px)

| # | Paso | Esperado |
|---|---|---|
| 6.0 | Vender → buscar «vac» → Vacío → peso «1500» | Pregunta «¿Son 1.500 kg de verdad?» antes de cobrar; «No, es 1,5 kg» lo corrige. |
| 6.1 | Peso 1,24 kg → Efectivo | El total es 1,24 × el precio por kilo, sin pasos extra. |
| 6.2 | **Cobrar** | «Venta #N cobrada» con el ticket a la vista (mandar por WhatsApp o imprimir 58 mm). |
| 6.3 | Caja | El efectivo del día subió lo de la venta. |

## 7. Caja del día y cierre

| # | Paso | Esperado |
|---|---|---|
| 7.1 | Mostrador a la mañana: Caja → Fondo inicial → Abrir caja | Si el fondo no coincide con el libro, pregunta «¿Abrir con $X?» y asienta la diferencia una sola vez. |
| 7.2 | Registrar un movimiento: egreso en efectivo «UAT hielo» | «Guardado: …». La caja lo resta. |
| 7.3a | Cierre del día → Movimientos del período | La apertura del turno figura como «conteo del cajón… no suma»: la columna Ingreso da lo que dice el cuadro de arriba. |
| 7.3 | Contar el efectivo (distinto de lo que dice el libro) → Qué pasó → Cerrar el día → Sí, cerrar el día | Sin «Qué pasó» no deja cerrar con diferencia. Al cerrar: «Día … cerrado» y el día queda congelado. |
| 7.3b | Libro de caja | La diferencia quedó asentada como una fila. |
| 7.4 | Con el día cerrado, Vender → Cobrado → Cobrar | No cobra y dice por qué: el día ya está cerrado; se puede dejar registrada sin cobrar y marcarla cobrada mañana. |

## 8. Catálogo y precios por kilo (Dueño)

| # | Paso | Esperado |
|---|---|---|
| 8.1 | Catálogo → un corte → Editar → Precio por kilo → Guardar | La tabla muestra el precio nuevo «/kg». |
| 8.2 | Recargar `/tienda` | El corte se ve con el precio nuevo. |
| 8.3 | Catálogo → Vacío → Editar → **Código / PLU** (el número con el que lo imprime la balanza) → Guardar | Queda guardado. Un código que ya tiene otro producto dice cuál. |
| 8.4a | Mostrador: Vender, sin el formato de la balanza guardado | El campo «Etiqueta de la balanza o código» no aparece (no se lee una etiqueta con un formato supuesto). |
| 8.4 | Con el formato de la balanza de MAGRA guardado: Vender → «Etiqueta de la balanza o código» → pasar la etiqueta de un paquete de vacío | Carga el renglón con el peso de la etiqueta, al precio por kilo **del sistema** (la pantalla lo dice). **BLOQUEADO** hasta tener una etiqueta real de la balanza de MAGRA y guardar su formato. |
| 8.5 | Pasar un código que no está en el catálogo | Avisa y la venta sigue; se puede cargar a mano. |
| 8.6 | Un pedido que ya estaba tomado | Conserva el precio con el que se pidió (pesar y ajustar recalcula a ese precio). Si el precio cambió mientras la clienta armaba la bolsa, la tienda se lo avisa en el renglón antes de mandar. |

## 9. Forma y celular

- Tienda, Inicio, Pedidos, Vender, Ventas, Caja, Cierre y Catálogo, a 390 y a 1440 px: sin desplazamiento horizontal,
  botones de al menos 44 px en el celular, y cero errores en rojo en la consola.
- El crédito «Gestión Studio Grow» va en el pie del panel, no en la tienda.

## 10. Tanda 2b — mostrador

Lo que entró en la tanda 2b (rama `reing-magra-t2b`), probado clic por clic el 27/10/2026 en una app local
(`next dev`, base Postgres local sembrada con `prisma/seed-magra.ts`, 390 y 1440 px). **Antes de empezar**, en la consola
del operador: `mostrador-boutique` y `cuentas-corrientes` prendidos y **`inicio-por-apps` apagado** (para el paso 10.2;
después se prende, como dice `provisioning-magra.md` § 3 bis). Todo lo de prueba lleva «UAT» en el nombre y se anula al final.

### 10.1 Pegar un pedido de WhatsApp (Mostrador, 390 px)

Pedidos → **Nuevo pedido de WhatsApp** → pegar el chat en «Pegá el mensaje de la clienta». En cada caso se mira la lista
«Lo que pidió».

| # | Pegar | Esperado |
|---|---|---|
| 10.1a | Copiado del celular (Android): `27/10/26, 10:15 - Ana UAT: hola soy Ana 11 5555-1234` y abajo `27/10/26, 10:16 - Ana UAT: 2 kg de vacío y 1 chorizo de cerdo` | Dos renglones: «2 kg de vacío» y «1 chorizo de cerdo» (pregunta «¿1 paquete de 6?»). Ni la fecha ni la hora aparecen como cantidad. |
| 10.1b | Copiado de WhatsApp Web: `[10:20, 27/10/2026] Ana UAT: hola soy Ana 11 5555-1234` y `[10:21, 27/10/2026] Ana UAT: 1 kg de vacío y 2 chorizos de cerdo` | Dos renglones: «1 kg de vacío» y «2 chorizos de cerdo» («Pidió 2: van 1 paquete de 6»). No hay renglón de «10» ni de «20». |
| 10.1c | Web sin fecha: `[10:20] Ana UAT: hola soy Ana 11 5555-1234` y `[10:21] Ana UAT: 1 kg de vacío` | Un solo renglón: «1 kg de vacío». |
| 10.1d | `hola soy Ana 11 5555-1234, 1500 kg de vacío` | El renglón pregunta «¿Son 1.500 kg de verdad? Confirmalo con la clienta.» y «Da $…: revisá que sea así.»; si no hay stock, también lo dice. |
| 10.1e | `hola soy Ana 11 5555-1234, para el 25/10 2 kg de asado de tira` | «2 kg» de asado de tira (no 2,5 kg): la fecha no se lee como cantidad. |
| 10.1f | `hola soy Ana 11 5555-1234, 100 paquetes de hamburguesas caseras` (más de $500.000) | El renglón pregunta «Da $650.000: revisá que sea así.» (con los precios de la demo; con los reales, el importe que dé). |
| 10.1g | Uno limpio (10.1b) → «Está bien» en cada renglón → Hoy tarde → **Registrar pedido** | «Pedido #N anotado» con el mensaje listo para mandarle a la clienta. Aparece en Pedidos → Nuevos. |

Repetir 10.1a–10.1e a 1440 px: mismo resultado.

### 10.2 «Queda a cobrar» con «Trabaja por apps» apagado (Mostrador)

| # | Paso | Esperado |
|---|---|---|
| 10.2a | El pedido de 10.1g → **Armar** → escribir lo que pesó → **Listo y avisar** | Pasa a Listos. |
| 10.2b | Pedidos → Listos → **Entregar y cobrar** del pedido → **Queda a cobrar: entregar sin cobrar** | Aviso: «Pedido #N entregado sin cobrar, pero NO quedó en la cuenta del cliente: el negocio no tiene abierta «Fiado y cuentas de clientes» (falta prender «Trabaja por apps»)…». Nunca en silencio. |
| 10.2c | Pedidos → A cobrar | El pedido está ahí con «Cobrar $…»: se cobra desde la bandeja. (El texto de arriba de la columna todavía manda a «Fiado y cuentas», que con este interruptor apagado no abre: ver el resultado.) |

### 10.3 Rendición del reparto con dos puestos (Mostrador en el celular, Dueño en la PC)

Preparación: dos pedidos con **Envío a domicilio**. Al primero se lo arma y queda listo sin cobrar. Al segundo, en Nuevos
→ tocar el pedido → Más acciones → «¿Ya pagó…?» → **Transferencia**; después **Preparar** y **Marcar listo** desde la
misma ficha (en un pedido ya cobrado, «Seguir armando» no deja pesar: se usa la ficha). Armar reparto → elegir la franja
(«Sin horario» es otra) → **Salió el cadete**.

| # | Paso | Esperado |
|---|---|---|
| 10.3a | Abrir Pedidos → Rendición del cadete en los **dos** puestos, sin recargar | Los dos ven los envíos: el primero «A cobrar», el segundo «Ya pagó». |
| 10.3b | Puesto 1: primer envío → **Cobró** → **Dividir** → Efectivo una parte + Mercado Pago el resto → Cobrar | Queda rendido. «Rendido hoy» lo muestra con los dos medios. |
| 10.3c | Puesto 2, con la pantalla vieja: el mismo envío → **Cobró** → Efectivo | «El pedido #N ya estaba rendido.» No cobra de nuevo. |
| 10.3d | Los dos puestos a la vez: segundo envío → **Entregado (ya pagó)** | Los dos dicen «Pedido #N entregado (ya estaba pago)». |
| 10.3e | Recargar la rendición en los dos puestos | «Rendido hoy» muestra **una vez** cada envío: el mixto con «Efectivo $X + Mercado Pago $Y» y el pago como «Ya pagaba · $…». «El cadete entrega en efectivo» es sólo la parte en efectivo. |

### 10.4 Venta del cuaderno de ayer y la ficha de stock

| # | Paso | Esperado |
|---|---|---|
| 10.4a | Mostrador: Vender → cuaderno sin señal (`/admin/vender/cuaderno`) → **Ayer** → hora 11:20 → Efectivo → Corte «Lomo» → 1,5 kg → **Cargar 1 venta del …** | «✓ Venta #N · $…» y «La venta quedó cargada con su hora.» |
| 10.4b | Inventario → Movimientos (Mostrador 390 px y Dueño 1440 px), **con el diseño nuevo prendido** | En el día de ayer, a las 11:20: «Venta del cuaderno (se cargó después de vender)», «quedó X kg **al cargarla**» y «Las ventas del cuaderno descuentan al cargar.» |

### Resultado de la prueba local (27/10/2026)

- 10.1, 10.2 y 10.3: **OK** a 390 y 1440 px. En la base, el cobro mixto dejó una fila por medio y una sola vez; el
  «ya pagó» apretado en los dos puestos dejó dos marcas de rendición, pero el resumen lo cuenta una vez (deduplica por pedido).
- 10.4 con el diseño de siempre (`diseno-nuevo` apagado): **FALLA.** Se ve el motivo, pero no «al cargarla» ni la
  aclaración: la ficha clásica (`inventario/movimientos/page.tsx:164`) no tiene el cambio, que está sólo en
  `MovimientosRenglon.tsx:190-191`. Si MAGRA se publica sin el diseño nuevo, 10.4b no se cumple.
- Observación de 10.2c: con `inicio-por-apps` apagado, la columna A cobrar dice «va a su cuenta: Fiado y cuentas» con un
  enlace que termina en «no está disponible» (`pedidos/TableroPedidos.tsx:633-636`).

## Resultado

**Recorrido automático (base local, 18/10/2026):** `npm run test:magra-uat` → **46/46 OK**, cero errores de consola,
capturas a 390 y 1440 px (8 pantallas por ancho, sin desplazamiento horizontal). Defectos que encontró y quedaron
arreglados en la rama `claude/magra-nivel-bp`:

- **D1 · Ingresos inflados en el Inicio.** «Ventas hoy» e «Ingresos hoy» sumaban el pedido de la tienda recién entrado, sin
  pesar ni cobrar (y la venta a cuenta). Ahora cuentan lo cobrado con medio, con el mismo criterio que Vender y Ventas
  del día (`src/lib/actions.ts`, test `src/lib/inicio-mostrador-postgres.test.ts`).
- **D2 · El cierre no cuadraba a la vista.** La lista de movimientos del cierre pintaba la apertura del turno en la columna
  «Ingreso», pero no la sumaba (bien): la columna no daba lo que decía el cuadro. Ahora usa la misma tabla de signos que el
  libro y la rotula como conteo del cajón (`caja/cierre/page.tsx`, `CierreRenglon.tsx`, test en `revisar-cierre.test.ts`).
- **D4 · Ambiente real.** La tienda mostraba «Dirección / Horarios / WhatsApp a confirmar» y botones de WhatsApp que
  abrían «todavía no publicamos el WhatsApp»; Vender rotulaba la balanza «provisional a confirmar» y el Inicio pedía una
  «venta de prueba». Ahora lo que falta no se muestra (`MagraFront.tsx`, `vender/page.tsx`, `inicio/bandeja-core.ts`).
- **D3 · Semilla de la demo.** Los pedidos de ejemplo salían «precio a mano» (sin producto) y no había usuario de mostrador
  ni productos por unidad. Corregido en `prisma/seed-magra.ts` (sólo demo y QA local).

**En Chrome real, en producción:** _(lo completa la sesión que corre el UAT: fecha y hora, navegador, una tabla con cada
paso y su estado, y los defectos numerados con captura)_

— Elaborado por GSG
