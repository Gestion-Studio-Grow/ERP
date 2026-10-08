# QA — buscatufoto (08/10/2026)

Build de producción (`next build` + `next start`), Chromium sin interfaz (Playwright 1.56), escritorio 1440×900
y móvil 390×844. Los scripts del recorrido están en `scripts/qa/`.

## Recorrido principal (escritorio y 390 px: pasa en los dos)

| Paso | Resultado | Captura |
|---|---|---|
| Crear cuenta de prueba | ok | `*-01-panel` |
| Crear álbum "Torneo QA 2026" a $ 2.000 | ok | — |
| Subir 5 fotos + 1 video WebM | ok; dorsal leído del nombre (`QA_02_d512-d88` → 512 y 88; video → 512); `IMG_4021` sin dorsal, como corresponde | `*-02-fotos-subidas` |
| Etiquetar a mano el 512 en `IMG_4021` | ok, "Sin dorsal (0)" | — |
| Cupón QA10, 10 %, 1 uso | ok | `*-03-cupon` |
| Publicar y obtener el enlace | ok, `/a/torneo-qa-2026` | `*-04-compartir` |
| Buscar el 512 en el álbum público | "3 fotos y 1 video con el 512" | `*-05`, `*-06` |
| Carrito con cupón | lista $ 8.000 − $ 800 = $ 7.200 | `*-07-carrito` |
| Pago simulado → pedido | ok, referencia DEMO-… | `*-08-pedido` |
| Descargar original | mismo tamaño en bytes que el archivo subido (278.752 B, el video) | — |
| Mismo cupón, otra compra | "Ese cupón ya se usó todas las veces permitidas." | — |
| Pedido con clave inválida | "No encontramos ese pedido…" | — |
| Venta en el panel | $ 7.200, comisión $ 648 (9 %), neto $ 6.552 | `*-09-ventas` |

## Más pruebas

- Álbum de muestra armado en el navegador en ~1,4 s; el 1043 da 7 fotos; el 99999 da un mensaje útil. (`*-10`)
- Selfie: diálogo "próximamente", sin resultados simulados. (`*-11`)
- Visor: la vista previa mide 1280 px de lado mayor y lleva marca. (`*-12`)
- Paquete de 3 = $ 8.500 y sugerencia del escalón del 25 % llevando 5.
- Editor de marca con vista en vivo (`*-13`); placa de historias de 1080×1920 (`*-14`, `placa-historias.jpg`).
- 14 rutas públicas sin desborde horizontal a 390 px; tema claro persiste al recargar.

## Refutador — hallazgos y estado

| # | Hallazgo | Estado |
|---|---|---|
| 1 | "Continuar al pago" podía cobrar sin pasar por el formulario | **Corregido** (botones con `key`); confirmado: 0 pedidos |
| 2 | Marca vacía u opacidad 5 % = vista previa sin marca | **Corregido**: se exige texto o logo, opacidad ≥ 15 % y, sin texto, va el de por defecto |
| 3 | Cupón o precio que cambian durante el pago se cobraban en silencio | **Corregido**: total congelado al entrar al pago; el repositorio rechaza si difiere; aviso con "Aceptar el total nuevo" |
| 4 | "1.5" se leía como 15 | **Corregido**: el punto sólo vale como separador de miles |
| 5 | Borrar un álbum o una foto vendida dejaba el pedido sin descarga | **Corregido**: se bloquea; el pedido muestra el contacto del fotógrafo |
| 6 | El álbum de muestra baja sus "originales" públicos | **Declarado** en PRODUCT.md (ilustraciones propias, sin servidor) |
| 7 | Renombrar un cupón le borraba los usos | **Corregido**: los usos van atados al código guardado |
| 8 | El texto de WhatsApp no decía lo que pasa | **Corregido** |
| 9 | Cerrar sesión con cambios sin guardar no avisa | Pendiente (baja) |

Resistió: dos pagos simultáneos con un cupón de 1 uso (sale 1 pedido), carrito manipulado, clave vacía o ajena,
videos que no se reproducen sin pagar y ninguna salida sin camino.

— Elaborado por GSG
