# Facturador UX v2: diseño

Fecha: 06/11/2026 · Base: PR #21 (`claude/facturador-guiado`) · Rama: `claude/facturador-ux-v2`
El motor certificado (`emitirComprobanteManual`, `validarEmision`, `mensajeDeEmision`) no se toca. El diseño no requiere migraciones.

**Principio:** hay una sola puerta, «Facturar», que decide sola y pide lo mínimo, y un solo lugar de configuración, «Puesta a punto», con semáforo.

## 1. Flujos para emitir
- **Manual (en el celular):** una sola pantalla en lugar de 3 pasos.
  - Dos preguntas: «¿Cuánto cobraste?» (teclado numérico) y «¿Qué hiciste?» (chips con los servicios del negocio).
  - El comprador viene plegado como «Consumidor final». Si el monto supera el umbral de identificación, la pantalla pide sola el DNI o el CUIT.
  - Las fechas del servicio se completan con hoy y se cambian en «Más detalles».
  - La letra la fija el sistema: RI a RI ⇒ A; RI a cualquier otro ⇒ B; monotributista ⇒ C. Nunca pregunta el tipo de comprobante ni el IVA.
  - Antes de emitir muestra una previa de una línea y un botón único, «Emitir».
- **Desde un turno o una venta:** «Cobrar y facturar» abre la misma pantalla con todo precargado (monto, servicio y cliente). Si falla, el turno queda igual y aparece «Facturar después».
- **Lote (contador):** se pega como hoy, pero primero aparece una tabla de revisión con la letra y el error de cada fila. El botón dice «Emitir las N correctas».

## 2. Puesta a punto (`/admin/facturacion?vista=arca`)
Es un checklist con semáforo:
1. Tus datos.
2. Punto de venta (si está bloqueado: «Lo definió tu contador»).
3. Conexión con ARCA.
4. Factura A (sólo para RI): si falta, botón «Avisar a mi contador».
5. Topes: barra con lo facturado en el mes.

La cabecera dice «Listo para facturar» o «Te faltan N pasos», y su botón lleva al primer paso pendiente. Ese mismo bloque aparece como banner en la lista de comprobantes.

## 3. Estados en criollo
| Estado | Texto | Acción |
|---|---|---|
| Falta configurar | Antes de facturar hay que terminar la puesta a punto. | Completar ahora |
| Sin régimen A | Para hacer Factura A falta saber qué te asignó ARCA. | Avisar a mi contador · Hacer Factura B |
| Tope mensual | Este mes ya facturaste el máximo de tu plan. | Ver planes · Ver comprobantes |
| ARCA no responde | ARCA está lento; probá de nuevo en unos minutos. | Probar de nuevo |
| Emitido | Listo: Factura B 0003-00001234 autorizada. | WhatsApp · PDF |
| Modo de prueba | Factura de prueba, sin validez fiscal. | Pasar a facturar en serio |
| Rechazo | ARCA no la aceptó: [motivo traducido]. | Corregir · Probar de nuevo |

## 4. Pantallas
- **Se fusionan:**
  - `EmitirComprobante` (3 pasos) pasa a una sola pantalla.
  - `FacturaDePrueba` y `AsistenteArca` pasan a Puesta a punto.
  - La configuración de topes y domicilio que estaba en bancos pasa a Puesta a punto.
  - `FacturarVenta` abre el facturador precargado.
- **Quedan:**
  - La lista de comprobantes.
  - El detalle del comprobante.
  - Emitir y lote del contador.
  - La consola del operador.
  - Factoque, con el facturador nuevo.

## 5. Después de emitir
- Arriba, en grande: «✓ Factura B 0003-00001234 · $12.000». El CAE y su vencimiento van en chico.
- Botones: «Mandar por WhatsApp» (el principal), «Descargar PDF» y «Ver detalle». Debajo: «Facturar otra».
