# Break Point: prueba del dueño (05/11/2026)

Guía para probar hoy Break Point como se probó CH: qué abrir, en qué orden y qué tenés que ver. Son unos 30 minutos.
Usá la **tablet o la PC** para la gestión y el **celular** para lo que ve el jugador. Si algo no coincide con lo que
dice acá, anotá la pantalla, la hora y sacá una captura: con eso alcanza.

**Antes de empezar.** Esto prueba lo que está en `main`, más la rama `claude/bp-prueba-hoy` (PR aparte) si ya la
mergeaste. El PR #7 (diseño nuevo siempre prendido) se probó encima y no rompe nada de Break Point. Si lo mergeás,
los botones del club se ven en negrita y un poco más compactos, con el mismo azul y naranja de siempre.

---

## Parte A · Lo que ve el jugador (celular, 5 min)

| # | Hacé esto | Tenés que ver |
|---|---|---|
| A1 | Abrí **breakpointpadel.gsgapp.com.ar** | La cancha desde arriba con la marca y **Reservá tu cancha**. No se corre de costado. |
| A2 | Tocá **Reservá tu cancha** | El turnero: hoy y los 13 días siguientes, horarios de 90 min de 11:30 en adelante, con los de la noche marcados **Pico**. **Sin precios**: todavía no los cargamos. |
| A3 | Elegí un día y un horario → **Mandalo por Instagram** | Se abre el chat del club con el pedido ya escrito. No hace falta mandarlo. |
| A4 | Volvé a la portada → **Ver la tienda** | Los productos dicen «Precio en el club» y el total, «A confirmar en el club». El pedido sale con un código **T-XXXX** y también se manda por Instagram. |

## Parte B · La gestión del club en el ERP, con la demo (tablet o PC, 20 min)

Entrá a **breakpointpadel.gsgapp.com.ar/admin/login** con tu usuario de dueño y después abrí
**breakpointpadel.gsgapp.com.ar/admin/club?demo=1**. Ahí hay datos de ejemplo y **no se guarda nada**: arriba lo
dice una cinta negra, con el botón **Reiniciar demo**. Los PIN de ejemplo son **Rober 1111**, **Majo 2222**,
**Lu 33** y **Caro 44**.

| # | Hacé esto | Tenés que ver |
|---|---|---|
| B1 | Mirá la **Agenda** | Cuatro canchas en columnas, la raya naranja de la hora y la lamparita de la luz de cada cancha. A la derecha, **Para resolver ahora** con los urgentes. |
| B2 | **+ Turno** → elegí cancha, hora y cliente → reservar | La previa con el precio y la seña, la confirmación para mandar por WhatsApp y el turno en la grilla. |
| B3 | Tocá el turno de **Lucas Fernández, Cancha 1, 20:30** (fijo) | Se abre **la cuenta del turno**. Sumá un jugador por nombre (por ejemplo, «Pedro»), cargale un agua (`bp-002`), cobrale su parte y cerrá la cancha a cuenta corriente. La grilla pasa de «1/4» a «2/4». |
| B4 | En un turno que debe (por ejemplo, **Martín Ríos**) → **Cobrar $…** | Elegís el medio con un toque y la cuenta queda en cero. «La mesa sigue» deja la cancha libre y la mesa abierta en Buffet. |
| B5 | **Buffet** → **Vender** | Una sola hoja de venta de mostrador. Pasá un producto y probá un descuento: pide el **PIN de un dueño**. |
| B6 | **Buffet** → en la tarjeta de una mesa, **Cargar / cobrar** | La tarjeta se despliega con los platos y el − / + de cada cargo. Si la tocás de nuevo, se pliega. |
| B7 | **Reiniciar demo** → turno de Lucas 20:30 → **Dividir entre 4** | Cuatro filas sin nombres, cada una con su medio de pago de un toque. |
| B8 | **Caja** | Lo cobrado por medio y el cierre del día. Cargá un egreso y cerrá: si el conteo no da, te muestra la diferencia. |
| B9 | **Clientes** → buscá a alguien que debe | Su ficha con el estado de cuenta. Si cobrás una parte, aparece **Deshacer**. |
| B10 | **Ctrl K** (o la lupa) → escribí un nombre | La paleta lo encuentra y abre su ficha. Con **Escape** se cierra. |
| B11 | El candado → **Bloquear** → entrá con otro PIN (Lu 33) | Cambia quien opera. Recepción **no ve** Stock, Proveedores ni Novedades; el dueño sí. |
| B12 | Lo mismo desde el **celular** | La barra azul en un renglón, con el logo entero, la lupa, **Vender**, quién opera, la hora y el candado. Nada se corre de costado. |

## Parte C · La jornada real (sólo si hoy querés arrancar de verdad)

**breakpointpadel.gsgapp.com.ar/admin/club**, sin `?demo=1`, abre la **jornada real**: lo que se cargue ahí **queda
guardado en el sistema**. La primera vez aparece la **consola de configuración**:

1. Rober y Majo arman su PIN de 4 números. No sirven los de la demo, ni todos iguales, ni escaleras.
2. Los avisos por WhatsApp son opcionales.
3. Recepción: a cada persona el sistema le da un PIN de 2 números y lo muestra **una sola vez**.
4. Cargás los precios y el fondo de caja → **Abrir el club**. Queda bloqueado y se entra con el PIN.

Para la prueba de hoy **no hace falta**: con la Parte B alcanza.

## Lo que todavía no está, para que no te sorprenda

- **Los pedidos de la tienda no llegan al club del ERP.** «Pedidos de la tienda para retirar → Cargar pedido recibido
  por mensaje» existe sólo en el club de antes (**breakpointpadel.gsgapp.com.ar/club**), no en `/admin/club`. Hasta
  que se pase, un pedido de la tienda se cobra en el club como una venta del Buffet.
- **El turnero no carga solo el turno en el ERP.** El jugador pide por Instagram y recepción lo da con **+ Turno**.
  La sincronización en vivo entre pestañas funciona sólo con el club de antes (`/turnero?demo=1` + `/club`).
- **Faltan datos del club** (provisional, a confirmar): el WhatsApp, las tarifas, el catálogo de la tienda, cuántas
  canchas hay y cuáles son techadas, y la dirección. Hasta que estén, el turnero sale sin precios y pide por Instagram.

— Elaborado por GSG
