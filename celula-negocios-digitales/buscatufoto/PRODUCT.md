# buscatufoto — producto

**Qué es:** una plataforma para que fotógrafos de eventos (carreras, torneos, fiestas) vendan sus fotos y
videos, y para que la gente encuentre y compre las suyas. Referencia de estructura: picsel.app
(`docs/relevamiento-referencia.md`). Todo el contenido es propio, en rioplatense.

## Para quién

- **Fotógrafo de eventos** (zona de uso: el panel, después de la carrera, con 800 fotos y apuro por publicar).
  Quiere subir, que salga con marca de agua, compartir un enlace y cobrar. Nada más.
- **Corredor / jugador / invitado** (zona de uso: el celular, el día después, desde el link del grupo de
  WhatsApp o de Instagram). Quiere encontrarse rápido por número, ver precio claro y descargar.

## Qué tiene que andar (demo, sin backend)

| Recorrido | Qué hace |
|---|---|
| Fotógrafo | alta e ingreso de prueba · datos de cobro simulados · crear álbum (nombre, evento, fecha, precio por foto, paquetes, descuento por cantidad, cupones con tope y usos) · subir fotos y videos · marca de agua automática en el navegador · editor de marca propia (logo, texto, color, escala, ángulo) con vista en vivo · dorsales por foto a mano o desde el nombre del archivo · colaboradores · ventas · enlace público · placa vertical para historias |
| Comprador | galería con vistas previas marcadas · búsqueda por número · selección · carrito con descuentos y cupón · pago simulado · descarga de originales |
| Selfie | **próximamente** (no hay detección facial 100 % en el navegador probada; no se simulan resultados) |

## Reglas que no se negocian

1. **El original nunca se muestra antes de pagar.** El comprador sólo recibe la vista previa (≤ 1280 px,
   con marca). El original vive en otro almacén y sólo sale con un pedido pagado y su clave.
2. **Honestidad:** sin testimonios, cifras de usuarios ni logos de clientes inventados. Pagos y WhatsApp
   simulados se rotulan *modo demostración*. Fotos de muestra generadas por nosotros (`scripts/generar-muestras.py`).
3. **Números provisionales:** precios de planes y comisiones, *provisional a confirmar* (decide el dueño).
4. **Sin servicios pagos:** datos en IndexedDB detrás de `Repositorio` (`src/lib/repo/`), listo para cambiar
   por un backend.

## Límite conocido de la demo

En el navegador, quien abre las herramientas de desarrollo puede leer IndexedDB. La protección real del
original exige backend (URLs firmadas tras el pago). La demo protege la **interfaz**: ningún componente del
comprador pide ni recibe el original sin pedido pagado. Anotado como pendiente de plataforma.

**Excepción declarada — álbum de muestra:** sus "originales" son ilustraciones nuestras publicadas como
archivos estáticos (`public/muestras/`), porque la demo no tiene servidor: la primera visita los baja para
armar el álbum en el navegador. Es contenido de demostración sin valor de venta; los álbumes que crean los
fotógrafos nunca pasan por ahí.

— Elaborado por GSG
