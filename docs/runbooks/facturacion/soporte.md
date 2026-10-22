# Soporte de primer nivel — facturación y Facturita

**Para:** Débora (soporte de primer nivel — *rol exacto provisional a confirmar*) y quien atienda el
WhatsApp de soporte. **Tono:** de persona, criollo, sin jerga (ADR-046). Nada de «outbox», «CAE en
duda» ni «error 503» con el cliente: eso es para nosotros.

## Antes de contestar: tres preguntas

1. **¿Quién es y de qué negocio?** (nombre del negocio; si es Facturita, el mail con el que entra).
2. **¿Qué quería hacer y qué vio?** Pedile una captura de pantalla.
3. **¿Desde cuándo?** ¿Le pasa con todas las facturas o con una?

**Nunca pidas** contraseñas, clave fiscal, el certificado ni códigos que le lleguen por mail. Si te los
mandan igual, decile que no hacía falta y avisá al dueño para cambiarlos.

## Las consultas de siempre

### «Hice una venta y no me salió la factura»

La factura no sale siempre en el momento: se manda a ARCA y vuelve con el número de autorización (el CAE).
Si ARCA tarda, queda **pendiente** y sale sola más tarde.

> «Quedate tranqui, la venta está registrada. La factura quedó en la fila para ARCA y sale sola, a más
> tardar a la madrugada. Si la necesitás ya, en el panel tocá **Facturación → Autorizar los pendientes**.
> Si mañana a la mañana sigue sin salir, avisame y lo miramos.»

Si a la mañana siguiente sigue pendiente → pasalo a guardia (ver «Cuándo escalar»).

### «Me dice que la factura fue rechazada»

ARCA la miró y dijo que no. En el panel, al lado de la factura, está el motivo.

- **Datos del cliente** (CUIT/DNI mal, condición de IVA): «Corregí los datos del cliente y volvé a
  emitirla desde el panel. La rechazada no cuenta, no hace falta anularla.»
- **Punto de venta / CUIT / certificado:** no lo puede arreglar el cliente solo → escalar.
- **Muchas rechazadas de golpe:** escalar ya (puede ser un problema nuestro).

### «Me salió la factura dos veces» / «¿La vuelvo a hacer?»

> «No la vuelvas a hacer, así no la duplicamos. Pasame el número de la venta y lo revisamos nosotros.»

Escalar siempre. Una factura autorizada **no se borra**: si sobra una, se anula con nota de crédito, y eso
lo decide el contador del negocio.

### «ARCA está caído» / «No anda nada de facturar» {#arca-está-caído}

Si guardia confirmó que es ARCA:

> «Es ARCA, no es tu sistema: hoy sus servidores están con problemas. Tus ventas quedan guardadas y las
> facturas salen solas cuando ARCA vuelva. No hace falta que hagas nada.»

### «Me venció el certificado» / «Me dice que no está autorizado»

> «Hay que renovar el certificado de ARCA. Lo hace tu contador (o vos con clave fiscal) en
> "Administración de certificados digitales" y nos lo pasa por el canal que te indicamos. No lo mandes por
> WhatsApp ni por mail.»

Escalar para que el dueño lo cargue por la consola.

### Facturita: «No puedo entrar» / «No me llega el mail»

1. Que revise **spam / promociones**.
2. Que verifique que escribe el mail **igual** que cuando se registró.
3. Si sigue: escalar con el mail (no pidas la contraseña).

### Facturita: «¿Cómo la instalo en el celular?»

Sólo si su cuenta tiene la app instalable activada (flag `facturita.pwa`):
- **Android (Chrome):** menú ⋮ → «Instalar app» / «Agregar a pantalla principal».
- **iPhone (Safari):** botón compartir → «Agregar a inicio».

Si no le aparece la opción, todavía no está activada para su cuenta: «Lo estamos largando de a poco, te
aviso cuando esté para vos.»

### «¿Esta factura vale? ¿Es de verdad?»

Si el negocio todavía está **en prueba** (homologación), las facturas dicen que son de prueba y **no tienen
validez fiscal**. «Estás en el período de prueba: las facturas son de práctica. Cuando pases a real, las que
emitas desde ese día son las válidas.» Ante la duda, escalar: no adivines.

## Cuándo escalar (a guardia: dueño / Plataforma)

Escalá **ya** si:
- muchas facturas rechazadas de golpe, o varios negocios con el mismo problema;
- alguien dice que se **duplicó** una factura;
- una factura sigue pendiente **más de un día**;
- el problema es de certificado, CUIT o punto de venta;
- el cliente ve datos que **no son suyos** (otro negocio, otros clientes): esto es urgente, avisá por
  teléfono, no por mensaje.

Cómo escalar: nombre del negocio, qué pasó, desde cuándo, la captura. **Sin** CUIT de terceros, sin montos
de clientes del negocio en el chat grupal.

— Elaborado por GSG (Plataforma, publicación y mantenimiento)
