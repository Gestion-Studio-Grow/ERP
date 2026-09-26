# QA contador, vuelta 2 (26/09/2026, contra :3210, sin reiniciar)

Evidencia: `.qa/contador-2609/qa-2/` (capturas `.png`, textos `.txt`, descargas). Chromium headless (Playwright), 1440 y 390 px.
Clientes nuevos: (a) Paula Ríos Fonoaudiología 27-29876541-7 (monotributo), (b) Almacén Mayorista Don Tito SRL 30-71555441-7 (RI),
(c) Grupo Andino SA 30-70888771-0 (RI, 2 locales). CUITs que ya existen: 20-11111111-2 (QA Kiosco Lab), 30-71234561-2 (El Tornillo, ya en cartera), 20-22222222-3 (Tornillo UAT).

## Primero: lo que no se pudo recorrer y por qué
- **El build de :3210 es anterior a los arreglos de fix-qa1.** `.next/BUILD_ID` es de 13:36:50 UTC; los arreglos están en el código
  pero no en el build: `solicitudes/[id]/page.tsx` y `ConfiguradorClient.tsx` (13:58, sin trackear) y `contador/page.tsx`, `CarteraPanel.tsx` (13:59).
  Esta vuelta prueba lo que está corriendo, no esos arreglos. Ningún arreglo de fix-qa1 tiene evidencia en el navegador.
- **Paso 4 (facturar en prueba), paso 8 (cerrar el mes), «IVA del mes» de (b) y «factura desde el extracto y MP» de (a): sin recorrer.**
  Los subdominios nuevos (`paularios-lab`, `dontito-lab`, `andino-lab`) no están en `TENANT_HOST_MAP` del proceso; `http://<sub>.localhost:3210/admin/login`
  muestra un login sin negocio (sin nombre del cliente, `h-*.html`). Shine Velas y A Dos Manos tienen dirección, pero **no tienen CUIT** («No puede emitir»).
  Resultado: hoy **ningún cliente de la cartera** permite facturar en prueba ni cerrar el mes.

## Por paso: qué esperaba, qué pasó y la evidencia
1. **Alta pedida por la contadora** · respuesta igual para cualquier CUIT · **OK**. Los 3 nuevos, el Kiosco, El Tornillo (ya en cartera) y
   UAT dan la misma respuesta: «Recibimos el pedido. Soporte GSG lo configura y te avisa por WhatsApp.» Probado a 1440 y a 390, con doble clic.
   Con un CUIT de dígito verificador malo el botón queda deshabilitado (es correcto: el CUIT de MAGRA en erp_lab, 30-71765432-9, es inválido).
   `p1-1440.txt`, `p1-390.txt`, `p1-390solo.txt`, `p1-alta-*.png`. Consola: 0 errores. Sin scroll horizontal.
2. **Soporte configura y «Pasale esto»** · ver la contraseña temporal y los mensajes · **FALLA 3 de 3**. Tras «Crear el cliente» sólo aparece
   «Este pedido ya está cerrado…» (`p2.txt`, `p2-pasale-{paula,almacen,grupo}.png`). Los negocios se crearon bien: en la base hay 3 Tenant
   con plan facturación, comerciante y pyme, un usuario cada uno y una fila de cartera. Plan sugerido correcto. Para los CUIT que ya existen,
   el configurador detecta «Ese CUIT ya tiene negocio…» y ofrece «Sumar a la cartera». El botón queda deshabilitado hasta marcar
   «El dueño autorizó». Probé sumar El Tornillo, que ya estaba en la cartera, con doble clic: la cartera sigue en 1 fila y sigue habiendo 1 negocio con ese CUIT.
   Para salir del paso: en la ficha del negocio en la consola, en Personas, hay «Resetear…». No lo recorrí.
3. **Cartera y bandeja** · **OK** a 1440 y 390. Los 3 aparecen en «De qué cliente me ocupo hoy», en la tabla, en «Falta cerrar agosto» y en «Sin extracto».
   «Pedidos de alta en curso» baja de 5 a 3. `p3.txt`, `p3-cartera-{1440,390}.png`. Consola: 0 errores. scrollWidth igual al ancho.
4. **Facturar en prueba** · **sin recorrer** (ver arriba). La ficha de Paula dice «Todavía no tiene su dirección propia» y «Emitir automáticas (0)».
   La consola, en cambio, dice «Link propio (subdominio): Listo» para el mismo negocio (`p4-ficha-paula-390.txt:263-265`, `p2-ficha-paula-operador.png`).
5. **Recibidos** · resumen y sin duplicados · **OK**. Don Tito a 1440: 12 entran (1 NC resta). Neto $116.562,50, IVA 21% $24.478,15, total $141.040,65.
   Al reimportar entran 0. Un archivo de banco da un mensaje claro. Andino a 390: 300 entran y 100 se rechazan. Al reimportar entran 0.
   Aislamiento del importador: es **el mismo archivo** que en la vuelta 1 cargaron El Tornillo y Del Sur, y en los clientes nuevos entra entero,
   o sea que la deduplicación es por negocio. `p5-*.png`, `p5-libro-iva-compras-dontito.csv` (IVA crédito por alícuota).
6. **Monitor de monotributo (a)** · **OK** a 390. Categoría B para Paula: «Bien · Dentro de la B · 0 % del tope», con el tope de la B y de la C
   y el vencimiento 05/02/2027. `p67.txt`, `p6-monitor-paula-390.png`.
7. **Corrección de CUIT** (Don Tito, 390) · **OK**. Un CUIT inválido se rechaza con mensaje. Con uno válido y doble clic queda 1 solo pedido,
   y Soporte lo ve en /operador/pedidos-cartera con el CUIT de hoy y el correcto. `p7.txt`, `p7-pedido-cuit-dontito-390.png`, `p7-pedidos-cartera-soporte.txt`.
8. **Cierre del mes** · **sin recorrer**. La cartera sólo dice «Revisalo y congelalo desde su panel» y no hay botón de cierre (`p8-ficha-andino-390.png`).
   El paquete de septiembre da «Elegí un mes que ya terminó.» (400, `p8-paquete-dontito-2026-09-respuesta.txt`). El de agosto sale como borrador y dice
   «No hay comprobantes con CAE: no se puede calcular la posición de IVA» (`p8-paquete-dontito-2026-08-borrador.csv:34`).
9. **Aislamiento** · **OK**. Con la sesión de la contadora probé ids de MAGRA, CH, Kiosco (fuera de cartera) y uno inexistente en 4 rutas
   (recibidos, csv, paquete y `/contador?cliente=`). Las 4 dan la misma respuesta (mismo código y mismo hash normalizado): no se puede inferir
   que el negocio existe. Shine, que está en cartera, da 200 con datos. `magra.localhost/admin` con la sesión del estudio lleva a `/admin/login`. `p9-aislamiento.txt`, `p9-cruce-magra-390.png`.
10. **CH igual que siempre** · **OK**. `/`, `/admin/login` y `/admin` (dueña) normalizados dan 0 líneas de diferencia contra la línea base `integracion/ch-antes`. `ch-diff.txt`, `ch-paridad.log`.

## Bloqueantes
- «Pasale esto» no se ve nunca (3 de 3): la contraseña temporal del dueño se pierde en cada alta. El arreglo está en el código pero no en :3210.
- Pasos 4 y 8 siguen sin evidencia, y tampoco «IVA del mes» (b), «factura desde extracto y MP» (a) ni «cierre» (c). Ningún cliente de la cartera puede
  facturar en prueba ni cerrar: los nuevos no tienen host y los que tienen host no tienen CUIT. La consola dice «Link propio: Listo» y la contadora ve «sin dirección».
- Riesgo de negocio duplicado: el pedido con el CUIT del Kiosco ofrece «Crear el cliente» porque `qa-kiosco-lab` no tiene `arcaCuit`, y no avisa
  que ya hay un negocio con el mismo nombre. Lo mismo pasaría con Shine o A Dos Manos, que están sin CUIT. No lo apreté.

## Menores
- «Sumar a la cartera» se ofrece aunque el negocio ya está en la cartera de ese estudio (no avisa; el resultado es idempotente).
- El mensaje de CUIT inválido y la confirmación del pedido se repiten 2 o 3 veces en regiones aria-live, así que un lector de pantalla los lee varias veces.
- Sigue «Entraron 0 comprobantes. 13 no se cargaron.», que mezcla duplicados con errores.
- El CUIT sin guiones sigue en «Pedidos de alta en curso» y en la bandeja de Soporte.
- Sigue «(corregir el cuit del emisor)» en minúsculas.
- Checklist de la consola para una fonoaudióloga (Genérico/Comodín): «Dirección del local… el cliente que va a retirar» y «el tenant no es un local
  de mostrador». Son textos de otro rubro y jerga.
- El paquete de un mes en curso responde 400 en texto plano («Elegí un mes que ya terminó.»), sin pantalla ni forma de volver, si se entra por el link.
