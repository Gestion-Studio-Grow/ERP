# QA contador — vuelta 1 (26/09/2026, contra :3210, build del worktree, sin reiniciar)

Capturas, textos y archivos en `.qa/contador-2609/qa-1/`. Navegador: Chromium headless (Playwright), 1440 y 390 px.
Clientes nuevos pedidos por la contadora: (a) Estudio de Diseño Lucía Ferro 27-34567121-3 (monotributo),
(b) Ferretería El Tornillo SRL 30-71234561-2 (RI, comercio), (c) Distribuidora del Sur SA 30-70999881-8 (RI, varios locales),
más QA Kiosco Lab 20-11111111-2.

## Lo que NO se pudo recorrer (primera línea, a propósito)
- **Paso 4 (facturar en modo prueba) y paso 8 (cerrar el mes): sin recorrer.** El laboratorio no tiene `APP_BASE_DOMAIN` y
  `TENANT_HOST_MAP` no incluye a los clientes nuevos; sin reiniciar :3210 (prohibido en esta vuelta) ningún cliente tiene
  panel propio: `src/app/contador/page.tsx:116,127` (`tieneDireccion = subdomain && base`). Evidencia: `p4-ficha-lucia-1440.txt`
  («Sin dirección propia todavía»), «Emitir automáticas (0)» deshabilitado (paso8 en Del Sur), y el cierre se hace
  «desde su panel». Sí se probó: descarga del paquete borrador de agosto (`paquete-tornillo-2026-08-borrador.csv`).
- **Vínculo de un CUIT que ya existe:** en `erp_lab` QA Kiosco Lab no tiene CUIT (`Tenant.arcaCuit` vacío), así que el
  configurador lo trató como alta nueva (no mostró «Ese CUIT ya tiene negocio»). La rama «Sumar a la cartera» con
  autorización del dueño quedó sin ejercitar. El pedido se descartó con motivo (no se creó nada).

## Por paso · qué esperaba · qué pasó · evidencia
1. **Alta pedida por la contadora** · misma respuesta para cualquier CUIT · IGUAL para los 4 (incluido el del Kiosco):
   «Recibimos el pedido. Soporte GSG lo configura y te avisa por WhatsApp.» Doble clic y reenvío del mismo CUIT: un solo
   pedido. CUIT con dígito malo: «El CUIT no es válido…» y botón deshabilitado. `p1-alta-*-1440.png`, `p3-cartera-1440.txt:112-124`.
2. **Soporte configura y «Pasale esto»** · ver la contraseña temporal y los mensajes para el dueño y la contadora ·
   **FALLA**: tras «Crear el cliente» la pantalla queda en «Este pedido ya está cerrado…» y el bloque 6 «Pasale esto»
   nunca se ve (3 de 3). Los negocios sí se crearon (DB: 3 `Tenant` nuevos 13:48–13:49 UTC). Causa: la action hace
   `revalidatePath` (`src/app/operador/(console)/solicitudes/actions.ts:42-44`), la página se re-renderiza con
   `s.cerrada=true` (`solicitudes/[id]/page.tsx`) y desmonta el cliente con la contraseña. `p2-pasale-estudio.png`,
   `p2-pasale-*.txt`.
3. **Cartera y bandeja** · los 3 aparecen · OK a 1440 y 390 (sin scroll horizontal, 0 errores de consola):
   tabla, «De qué cliente me ocupo hoy», pendientes del mes, monitor. `p3-cartera-tras-config-1440.txt`, `p3-cartera-390.png`.
4. **Facturar en prueba** · sin recorrer (ver arriba).
5. **Recibidos** · resumen y sin duplicados · OK. El Tornillo: 12 entran (NC resta), neto $116.562,50, IVA 21% $24.478,15,
   total $141.040,65 (cuadra con el archivo); reimportar: 0 entran, cada fila «Ya estaba cargado (compra #n): no se
   duplica»; archivo de banco: mensaje claro. Del Sur a 390: 400 filas (300 válidas; 100 con CUIT de emisor inválido,
   rechazadas con motivo), alícuotas 10,5 y 21, percepciones $12.900; reimportar: 0. Un comprobante cargado en agosto
   llega al paquete del mes (COMPRAS 12.100,00). `p5-tornillo-2-reimporto.png`, `p5-delsur-390-*.png`.
6. **Monitor de monotributo (a)** · OK a 390: cargar Categoría C → «Bien · Dentro de la C · 0 % del tope», tope C y D,
   vencimiento 05/02/2027. `p6-monitor-390.png`.
7. **Corrección de CUIT** · OK a 390: CUIT inválido rechazado con mensaje; válido + doble clic → un solo pedido, queda
   marcado en la ficha y aparece en /operador/pedidos-cartera con CUIT hoy y CUIT correcto. `p7-*.png/txt`.
8. **Cierre del mes** · sin recorrer (ver arriba).
9. **Aislamiento** · OK. Con la sesión de la contadora, ids de MAGRA, CH, Kiosco (fuera de cartera) e inexistente:
   recibidos → «Ese cliente no está en tu cartera.» con HTML visible idéntico (no se infiere existencia); csv y paquete → 404
   idéntico; Shine (en cartera) → 200. `magra.localhost/admin` con la sesión del estudio → login. `p9-aislamiento-magra.png`.
10. **CH igual que siempre** · OK: `/`, `/admin/login`, `/admin` (dueña) normalizados, idénticos a la línea base de
   integración (`qa-1/ch-diff.txt` vacío, DIFF_EXIT 0).

## 🔴 Bloqueantes
- «Pasale esto» nunca se muestra: la contraseña temporal del dueño («se ve una sola vez») se pierde en cada alta.
- Pasos 4 y 8 sin evidencia (entorno): el viaje «facturar en prueba» y «cerrar el mes» no está probado para ningún cliente nuevo.

## 🟡 Menores
- Descarte silencioso: el pedido del Kiosco desaparece de «Pedidos de alta en curso» sin que la contadora vea el motivo.
- Aviso de reimportación «Entraron 0 comprobantes. 13 no se cargaron.» mezcla duplicados con errores (el detalle sí distingue); «1 notas de crédito».
- CUIT sin guiones en «Pedidos de alta en curso» y en las bandejas de Soporte (27345671213); con guiones en la tabla.
- «(corregir el cuit del emisor)» en minúsculas en la confirmación.
- Alta con campos vacíos: sólo el globo nativo del navegador; selector de archivo nativo en inglés («Choose File»).
- Paquete del mes: COMPRAS sólo con total (sin neto ni IVA crédito) y «no se puede calcular la posición de IVA» sin CAE: el IVA del mes de (b) no se pudo ver.
- Consola del operador: aviso de precarga de fuente `archivo-latin.woff2` sin usar.
