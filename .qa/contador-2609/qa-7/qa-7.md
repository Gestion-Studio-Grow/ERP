**NO SE PUDO RECORRER:** (1) El ataque a la ficha «Red de locales» inyectando el id de un negocio de otro CUIT. El formulario sólo aparece si la casa tiene candidatos del mismo CUIT sin vincular, y ninguna casa del laboratorio los tiene (Del Plata: «No hay otros negocios con el CUIT de la casa para sumar»; MAGRA tampoco). El rechazo del servidor lo verifiqué por el asistente de alta, no por la ficha. (2) El paquete FINAL de septiembre, que es el mes de las facturas de prueba: el mes no terminó (hoy es 26/09). La contadora recibe «Septiembre 2026 todavía no terminó». Sólo congelé agosto, que no tiene ventas. El IVA de septiembre lo cuadré con el Libro IVA del dueño. (3) La Factura A de (c) y de su local: ARCA le asignó «A con leyenda», el configurador lo acepta y el sistema no la emite, ni siquiera en prueba (bloqueante 1). (4) No tenía preview_start/read_page. Recorrí con Chromium headless (Playwright) contra :3210. Guardé la consola de cada página y el log del servidor (`server-3210-durante-qa7.log`). (5) No probé «Lo revisé» sobre un recibido, ni la factura desde el extracto o Mercado Pago. (6) Borré las capturas de «Pasale esto» porque mostraban la contraseña temporal. En los .txt quedó como `<TEMPORAL>`.

# QA contador, vuelta 7 (26/09/2026, :3210 sin reiniciar ni compilar)
El build es válido: `.next/BUILD_ID` es de las 20:49:53, el archivo de `src/` más nuevo es de las 20:23:33 y el servidor :3210 arrancó a las 20:50:04. La evidencia está en `qa-7/`.
Clientes nuevos (CUIT válidos que no estaban en la base):
- (a) Martina Quiroga Fotografía, 27-41236587-4, monotributo, plan Facturación, `martinaq-v7`, id cmuivrg1k0004457df3a10t8h.
- (b) Ferretería Los Aromos SRL, 30-71843217-7, RI, Comerciante, Factura A «A común», `losaromos-v7`, id cmuivs987000b457debr88d8q.
- (c) Distribuidora Del Plata SA, 30-71843225-8, RI, PyME, Factura A «A con leyenda», `delplata-v7`, id cmuivt274000j457doybapf0u. Su segundo local es Del Plata Sarandí, pv 4, `delplata-sarandi-v7`, id cmuivvo8d000t457d77un0obf.
Quedaron en la base de laboratorio: «Del Plata Otro CUIT v7» (cmuiw6dzk003t457dmhv910xu, activo, sin CUIT, ver el bloqueante 2), el pedido de «Kiosco Descarte v7» descartado y el pedido de corrección de CUIT de (b), abierto.

## Por paso · esperado · pasó · evidencia
1. **Alta pedida · OK.** Todos recibieron la misma respuesta, «Recibimos el pedido. Soporte GSG lo configura y te avisa por WhatsApp.»: (a) a 390 con doble clic, 20-11111111-2 a 390, (b) a 1440 con doble clic, (c) y el kiosco a 1440. En AuditLog, `cartera.solicitud_alta` pasó de 26 a 30: el doble clic deja una sola fila y el CUIT existente no suma. Con el formulario vacío se marcan los 4 campos. Con un CUIT mal escrito aparece «El CUIT no es válido» y el botón queda deshabilitado. 0 errores de consola (`p1-respuestas.txt`).
2. **Soporte · OK.** Para un RI, crear sin elegir la Factura A da el error «Elegí qué Factura A le asignó ARCA». La contraseña temporal no vuelve a aparecer al recargar. Para (c), «Pasale esto» indica el camino: «Dar de alta un negocio» → «¿De qué red?», eligiendo esta casa. El mensaje al dueño dice «Los otros los sumamos aparte». Descarté el kiosco con esta nota interna: «Lo confunden con CH Estética y con MAGRA Lomas… Qué Bien Olés. ZZnotav7». A 1440 y a 390, la contadora tiene 0 apariciones de los 7 términos en el texto y en el HTML (`p2-configurar.txt`, `p2-k-contadora-*.png`).
3. **Segundo local · OK.** Por el camino indicado, Sarandí heredó el CUIT 30-71843225-8, RI y la clase de Factura A. Con el pv 3 de la casa, «Siguiente» queda deshabilitado. Con el pv 4 se creó (`p2-segundo-local.txt`, `p2-c-local-ataque-pv3-1440.png`). En la ficha de la casa figura «Sarandí · Punto de venta 4».
4. **Otro CUIT · el vínculo no pasa, pero el asistente engaña.** En «¿De qué red?» cargué 30-71843266-5 y la prueba en seco respondió «✓ Va a la red de Distribuidora Del Plata SA · CUIT 30-71843266-5 · punto de venta 5 (libre)». Al tocar «Dar de alta», el negocio se crea activo, con usuario y contraseña temporal, y recién ahí avisa «✗ El negocio se creó, pero no se sumó a la red… no es del mismo CUIT». Queda sin CUIT ni punto de venta. La dueña de Del Plata, en /admin/locales y /admin/locales/ventas, no ve ni ese negocio ni a Martina (0 menciones) y sí ve «Sarandí · punto de venta 4» (`p2x-otro-cuit.txt`, `p2x-*.png`). Ver el bloqueante 2.
5. **El dueño entra · OK.** Entraron (a) y Sarandí a 390, y (b) y (c) a 1440, con la temporal. «Cierre del mes» está en el menú (a 390, dentro del menú hamburguesa). 0 errores de consola (`p3-paneles.txt`).
6. **Cartera · OK.** Hay 24 clientes a 1440 y a 390. En la cartera y en la consola, «Abrir su panel» lleva a `https://<sub>.localhost/admin`, que es el «Link propio» (`p4-cartera.txt`).
7. **Facturas de prueba · la A común OK, la A con leyenda no sale.**
   - (a): C 0001-00000001 y C 0001-00000002.
   - (b): A 0002-00000001 (con doble clic, queda una sola) y B 0002-00000001, cada una de neto 1.000 e IVA 210.
   - (c): B 0003-00000001.
   - Sarandí: B 0004-00000001.
   La A de (c) y la de Sarandí responden: «ARCA te asignó la Factura A con leyenda, y el sistema todavía no la emite. Emitila desde el sitio de ARCA» (`p5-facturas.txt`, `p5-invoice-db.txt`).
8. **Recibidos · cuadra a mano.** Todas las importaciones las hice dos veces, la primera con doble clic.

   | Archivo | Entraron | A revisar | Crédito | Percepciones | Esperado a mano |
   |---|---|---|---|---|---|
   | (b) septiembre, 10 filas | 8 (1 nota de crédito) | 1 | 24.640,50 | 360 | 24.640,50 y 360 |
   | (c) agosto, 63 filas clásicas | 61 | 2 (15 % y 30 %) | 197.407,93 | 20.105,72 | iguales |
   | (c) septiembre, 5 filas | 5 | 1 | 15.300 | 1.800 | iguales |
   | (a) agosto, 2 filas | 2 | – | «sin crédito fiscal» | – | – |

   - En (b), la fila con IVA 150 sobre 1.000 quedó «A revisar» y no suma.
   - Al reimportar, todas dicen «No entró ningún comprobante nuevo. N ya estaban cargados (no se duplican)».
   - Los CAE de (b) son, a propósito, los mismos que usó otro negocio en la vuelta 6, y entraron como nuevos: no hay inferencia entre negocios.
   - La fila repetida dentro del archivo se sigue contando en «2 con errores» (bloqueante 3).
   - Evidencia: `p6-recibidos.txt`, `p6-*-mes-*.txt`, `recibidos-*-esperado.json`.
9. **Monitor de (a) · OK.** Con la categoría B, dice «Facturó $ 0,00 en los últimos 12 meses». Las 2 C de prueba ($2.420) ya no suman (`p7-monitor.txt`).
10. **Corrección de CUIT · OK.** Un CUIT inválido da error. Con 30-71843233-9 aparece «Listo: quedó en la bandeja…». Soporte lo ve a 1440 y a 390 con el CUIT de hoy, el correcto y la aclaración (`p8-cuit.txt`).
11. **IVA de septiembre · cuadra.**
    - (b): débito declarable $0 y crédito $24.640,50. «Facturas de prueba (2)» aparte, la A y la B, con el texto «no se declaran ni cuentan para los topes».
    - (c): débito $0 y crédito $15.300. Dice «Este libro suma los locales del mismo CUIT: Distribuidora Del Plata SA (punto de venta 3) y Del Plata Sarandí (punto de venta 4)». Las B de prueba 00003-00000001 y 00004-00000001 aparecen aparte.
    - Evidencia: `p9-*-libros-2026-09-1440.txt`.
12. **Cierre y FINAL · OK.** Congelé agosto de (c) a 1440 y de (a) a 390 con «Sí, congelar». La contadora baja la «Versión final: mes congelado el 26/09».
    - COMPRAS de (c): tiene las columnas Neto gravado, IVA crédito y Percepciones. Subtotal: 1.083.591,82 / 197.407,93 / 20.105,72 / total 1.404.655,47. Las percepciones son las mismas que en la pantalla: se corrigió el bloqueante 3 de la vuelta 6. Las dos filas a revisar dicen «a revisar, no suma».
    - COMPRAS de (a): sólo percepciones y total.
    - Evidencia: `p9-cierre.txt`, `p9-*-paquete-2026-08-contadora.csv`.
13. **Aislamiento · OK.** Probé MAGRA Lomas, Sarandí (es local de (c) pero no está en la cartera) y un id inexistente. Dan el mismo cuerpo en cada ruta: recibidos 200 md5 b537afa1, paquete 404 md5 09540a71, ficha 200 md5 85ac059a y CSV 404 md5 6c1c8f7d. El CSV propio da 200. Ningún nombre ajeno aparece en el HTML. Con la sesión de la contadora, magra.localhost/admin pide login (`p10-aislamiento-ch.txt`, `p10-aislamiento-csv.txt`).
14. **CH · OK.** A 1440 y a 390 tiene el menú de siempre (Inicio, Agenda, … Reseñas), sin «Cierre del mes» ni «Comerciante». 0 errores de consola.
15. **Mobile · OK.** A 390, los recibidos de la contadora, el cierre de (a) y los pedidos de Soporte tienen scrollWidth 390, sin desborde, y 0 errores de consola (`p12-*.png`).

## Bloqueantes
1. **La Factura A con leyenda no se puede emitir, y nadie lo avisa al configurar.** El configurador ofrece «A con leyenda» y «M» igual que «A común». El negocio recién se entera al facturar: no la emite ni en prueba (`decidir-comprobante.ts:827`), y el local la hereda. Un RI nuevo con esa clase no tiene Factura A en el sistema. Además, si las emite en el sitio de ARCA, no encontré cómo cargarlas: el débito del Libro IVA y el paquete del estudio quedarían incompletos. Esto último no lo recorrí.
2. **La prueba en seco del asistente dice ✓ con otro CUIT, y el alta deja un negocio suelto.** La pantalla promete que «Antes de crear nada se hace una prueba en seco… no queda nada a medias». Pero se creó «Del Plata Otro CUIT v7» activo, con usuario y contraseña temporal y un «Pasale esto» listo para mandar, fuera de la red y sin CUIT. El vínculo, en cambio, se rechazó bien. El log registra `dry-run ok:true` y después `commit state:ACTIVE`.
3. **El aviso de la importación todavía no distingue la fila repetida de los errores.** Dice «2 con errores: no se cargaron», pero una de esas filas es «Está repetido en el archivo (ya aparece en la fila 2)». Al reimportar sí separa «ya estaban cargados» de «con errores». El criterio es de esta vuelta y ya está en BACKLOG.

## Menores
- `?mes=2026-09` en «Cierre del mes» abre agosto sin avisar, y el «borrador» que baja (b) es el de agosto (`paquete-2026-08-…-borrador.csv`). Ya está en BACKLOG.
- «Lo congeló Distribuidora Del Plata SA»: guarda el nombre del negocio, no el de la persona. Ya está en BACKLOG.
- El neto gravado de la pantalla incluye lo que está a revisar (1.085.591,82) y el paquete no (1.083.591,82). Ya está en BACKLOG.
- A la monotributista (a), la pantalla de recibidos le muestra el renglón del crédito fiscal («Lo que suma…», $0,00) sin aclarar que no lo computa. Ya está en BACKLOG.
- En la tabla de la cartera, «Abrir su panel» lleva a `/admin/facturacion/bancos`. En la ficha y en la consola lleva a `/admin`. El host es el mismo.
- En el Libro IVA, el receptor de la A aparece como «20111111112», sin guiones.
- La contraseña temporal no pide cambiarse al entrar: el inicio de los 4 dueños no la menciona.
- El log del servidor tiene 5 líneas «⨯ Error: The destination stream closed early» (digest 2006788813). Cuatro caen en la ventana de las importaciones con doble clic. No vi ningún efecto en pantalla ni en los datos.
- Con la sesión de la contadora, el login de magra.localhost da 3 errores de consola «Failed to load resource: 404».
- El local Sarandí no tiene plan: muestra «159 disponibles este mes». Es una decisión pendiente del dueño, ya en BACKLOG.
- Los links de «Pasale esto» salen sin puerto (`https://delplata-v7.localhost/admin`). Pasa sólo en el laboratorio.

## Anduvo (lo que recorrí de punta a punta)
El alta pedida y el descarte con nota interna. El configurador para RI y monotributo. El segundo local por el camino indicado, con los ataques de pv y de CUIT. El login de los 4 dueños a 1440 y a 390. La cartera. Las facturas A común, B y C de prueba, con doble clic. Las 4 importaciones de recibidos con reimportación. El monitor. La corrección de CUIT hasta la bandeja de Soporte. El congelado de agosto y los FINAL de (a) y (c). El Libro IVA de septiembre de (b) y (c). El aislamiento por 4 rutas y 3 negocios. CH.
