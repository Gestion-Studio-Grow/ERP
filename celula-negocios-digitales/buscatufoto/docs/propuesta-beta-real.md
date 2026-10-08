# buscatufoto — propuesta para la beta real con Valentina

Fecha: 08/10/2026 · Estado: **propuesta, decide el dueño** · Números en USD salvo aclaración, **a verificar**
en las páginas oficiales antes de contratar nada.

## 1. Qué cambia y por qué

Hoy la app guarda todo en el navegador de quien la usa. Si Valentina arma un álbum en su celular y manda el
enlace al grupo del torneo, **los padres no ven nada**. Para la beta real hacen falta tres cosas:

1. Que el álbum se vea desde cualquier celular.
2. Que el original quede guardado afuera del navegador y sólo se entregue después del pago.
3. Que la venta quede registrada aunque la plata vaya directo a la cuenta del fotógrafo (transferencia).

El modelo de negocio acompaña ese cambio: **suscripción mensual baja, sin comisión por venta** (punto de dolor:
el fotógrafo evade la comisión cobrando por afuera). La app no pelea contra la transferencia: la ordena.

## 2. Arquitectura propuesta

| Pieza | Elección | Por qué |
|---|---|---|
| Base de datos | **Proyecto Neon NUEVO, separado del ERP** (plan gratuito) | No mezclar un producto de consumo masivo con la base donde están los clientes reales del ERP (CH vive ahí). Riesgo y RLS aparte. |
| Fotos y videos | **Cloudflare R2**: un bucket privado (originales) y uno público (vistas previas marcadas) | Cobra el almacenamiento (~US$ 0,015 por GB al mes) y **no cobra la salida**: una galería que miran 300 padres no genera costo por tráfico. |
| Subida | El navegador sube directo a R2 con una URL firmada de un solo uso | Las fotos no pasan por nuestro servidor: no hay costo de cómputo ni límite de tamaño de función. |
| Marca de agua | Se sigue aplicando en el navegador del fotógrafo (ya está hecha y probada) | Cero costo de servidor; el original limpio nunca se publica. |
| Descarga del original | URL firmada que vence a los 10 minutos, emitida sólo para un pedido **pagado** | Protección real del original (hoy es el límite declarado de la demo). |
| Ingreso del fotógrafo | Cuenta de Google (gratis) | Sin contraseñas que guardar; el que no tenga Google, más adelante enlace por mail. |
| Servidor | Rutas API dentro del mismo despliegue que ya sirve buscatufoto (`erp-ch`), aisladas por host | No suma un proyecto nuevo en Vercel. Si crece, se separa sin reescribir (la app ya habla con una interfaz `Repositorio`). |

### Cobro
- **Transferencia con comprobante (fase 1):** el álbum muestra el alias del fotógrafo → el comprador elige,
  transfiere y sube el comprobante → al fotógrafo le llega el aviso → toca "pagado" → se liberan las descargas
  solas. La plata nunca pasa por buscatufoto.
- **Mercado Pago (fase 3, opcional):** cada fotógrafo conecta su propia cuenta; el cobro es automático. Si se
  cobra algo, es una comisión chica **sólo** a quien elija esta comodidad.

## 3. Cuánto cuesta (estimación, a verificar)

Supuesto de un fotógrafo activo: 3 eventos por mes, 1.500 fotos por evento, 8 MB por original, originales
guardados **90 días** después del evento (se avisa en los términos).

| Concepto | Cálculo | US$ / mes |
|---|---|---|
| Originales en R2 | 3 × 1.500 × 8 MB ≈ 36 GB × 3 meses de retención ≈ 108 GB × 0,015 | ~1,60 |
| Vistas previas | 4.500 × 0,3 MB ≈ 1,4 GB/mes acumulado | ~0,05 |
| Operaciones R2 (subidas y lecturas) | decenas de miles por mes | < 0,10 |
| Base de datos | filas chicas; entra en el plan gratuito de Neon al principio | 0 |
| **Total por fotógrafo muy activo** | | **~US$ 1,75** |

Un fotógrafo chico (1 evento por mes) cuesta alrededor de US$ 0,60. Con el plan Inicial a ~$4.900 ARS el margen
es amplio a cualquier cotización razonable; el riesgo de costo está en quien sube mucho, y por eso los planes van
**por escalones de GB**, no a precio plano único.

**Costo fijo de la beta:** prácticamente cero mientras entren en los niveles gratuitos (R2 tiene un nivel gratuito
de alrededor de 10 GB según varias fuentes; **a verificar**: una fuente dice que no). Con Valentina sola, el gasto
esperado es de centavos de dólar por mes.

## 4. Plan de trabajo

| Fase | Qué | Resultado visible |
|---|---|---|
| 1 | Base + R2 + ingreso con Google + subir y publicar | Valentina sube un álbum y cualquiera lo ve desde su celular |
| 2 | Pedido + comprobante de transferencia + liberar descargas + avisos | Primera venta real registrada |
| 3 | Política de menores en el producto (ver `politica-fotos-menores.md`) | Álbumes de torneos juveniles protegidos |
| 4 | Mercado Pago opcional, estadísticas, dominio propio al cerrar la beta | Listo para sumar fotógrafos |

Las fases 1 a 3 son el mínimo para salir con Valentina. La 3 no es opcional: sus álbumes son de torneos de menores.

## 5. Lo que decide el dueño

1. **Crear la cuenta de Cloudflare (R2) y el proyecto Neon nuevo.** Las claves las pega el dueño, nunca el agente.
2. **Autorización escrita de Valentina** para usar su marca y sus fotos en la beta (como con Magra).
3. **Precio de los planes** (provisionales: Inicial ~$4.900, Pro ~$14.900 por mes) y la retención de 90 días.
4. Revisión de términos, privacidad y política de menores por un abogado antes de abrir a más fotógrafos.

## 6. Riesgos

- **Temporada:** fuera de temporada el fotógrafo da de baja la suscripción → pase por evento o plan anual.
- **El comprobante de transferencia es falsificable:** por eso confirma el fotógrafo, que ve su cuenta, no la app.
- **Fotos de menores:** el riesgo legal y de reputación más alto del producto. Mitigado por la política.

— Elaborado por GSG
