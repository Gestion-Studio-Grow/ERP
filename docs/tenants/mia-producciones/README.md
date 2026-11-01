# MIA Producciones — módulo `proyectos` y pase a producción

Rama `tenant/mia-producciones` (worktree `C:\mia`), nacida de `origin/main` `d8f0a614`. **Sin push y sin
tocar Neon.** Este archivo es la guía del pase; nada de lo que dice se ejecutó todavía salvo lo marcado
como medido.

## Apps de gestión de eventos

Desde `272863a8` se suman las apps relevadas en Heka el 01/11/2026, escritas de cero
sobre el motor y con la marca GSG en el panel: Inicio, Proyectos (Kanban y Lista), Diseño, Calendario, Proveedores,
Administración, Dirección, Agentes IA, Propuesta con IA, Mi liquidación y Equipo y permisos. El sitio y lo que ve el cliente
siguen con la marca de MIA. Lo relevado y la brecha: `docs/benchmark/heka-2026-11-01.md` y `heka-especificacion.md`.

**Antes del pase:** la migración `20261101150000_proyecto_gestion_eventos` no está en
`docs/runbooks/pase-produccion/1-lote-en-produccion.sql` ni en el ensayo: hay que regenerar esos lotes. Sin aplicar en
ninguna base que no sea la demo en memoria.

**Probado clic por clic en la demo local:** ingreso de cada rol; ficha, ítems y regeneración de cuotas; versiones, «Qué
cambió», aprobación interna, envío, PDF y CSV; respuesta del cliente con constancia, historial y aviso; cobros y pagos con su
asiento en el libro de caja; checklist, chat con mención, archivos, comentario sobre imagen; presentación y su aprobación en el
portal; bancos, extracto y conciliación; liquidaciones y Mi liquidación; permisos por rol (barra, pantallas y cifras); buscador,
avisos, calendario suscripto; celular a 375 px sin desbordes.

**No se pudo probar:** agentes y concepto con IA (falta `ANTHROPIC_API_KEY`), imágenes generadas (falta un servicio y
`IMAGENES_API_URL`/`KEY`; el formato de esa llamada es una suposición a validar con el servicio elegido), y el tiempo de carga
real: la demo atiende una sola conexión y el panel precarga decenas de pantallas por vista [A VALIDAR en un ambiente real].

**No construido, y la pantalla lo dice:** doble factor, ingreso con Google, carpeta automática en Drive, avisos por mail,
adjuntos dentro de la fila del ítem.

**Decisiones provisionales, a confirmar con MIA:** las cuotas al cliente llevan IVA y las de proveedores van netas; venta en
dólares con referencia en pesos; Diseño ve la venta pero nunca costos ni márgenes; `costoReal` del ítem sin definir.

**Ramas:** `tenant/mia-producciones` (`C:\mia`) ya incluye todo esto: no tenía commits propios y avanzó sin merge sobre `tenant/mia-heka`. Se sigue trabajando en `C:\mia`.

## Qué es

Primer negocio del rubro **productora** (eventos, stands, contenidos). Es un negocio más del motor.

| Pieza | Dónde |
|---|---|
| Rubro y módulos por defecto | `src/blueprints/oficios/rubros.ts`, `src/blueprints/presets-meta.ts` (`productora`) |
| Descriptor del módulo y app del panel | `src/modules/descriptors/proyectos.ts`, `src/apps/catalogo/comercial.ts` |
| Reglas puras + pruebas | `src/lib/proyectos/core.ts`, `stand.ts`, `core.test.ts` |
| Armador 3D | `src/lib/proyectos/stand-escena.ts`, `src/app/admin/(dashboard)/proyectos/[id]/stand/` |
| Panel | `src/app/admin/(dashboard)/proyectos/` |
| Propuesta del cliente (link sin login, sin costos) | `src/app/propuesta/[token]/` |
| Tablas + RLS | `prisma/migrations/20261101120000_modulo_proyectos/`, `20261101130000_proyecto_gastos/`, `20261101140000_proyecto_entregables/` |
| Piezas para aprobar | Reglas: `estadoDelEntregable` y `resumenEntregables` en `core.ts`. Panel: sección de la ficha y `proyectos/[id]/entregable/[entregableId]/`. Link del cliente, sin login y sin plata: `src/app/entregables/[token]/` |
| Costo real y proveedores | Reglas: `resultadoReal` y `desvioPorRubro` en `core.ts`. Pantallas: sección «Costo real» de la ficha, `proyectos/proveedores/`, `proyectos/reportes/` |
| Marca | `src/lib/proyectos/marca.ts`, `public/tenants/mia-producciones/marca/`; panel e ingreso: `src/lib/estetica-backoffice.ts`, `globals.css` |
| Panel sólo de MIA | `panelCerrado` en `src/apps/catalogo/comercial.ts`, regla en `src/apps/visibles.ts` |
| Copia de su sitio | Páginas: `src/tenants/mia-producciones/sitio/`. Imágenes, estilos y scripts: `public/tenants/mia-producciones/sitio/` (22 MB). Registro: `src/lib/sitio-estatico.ts`. Se regenera con `scripts/proyectos/copiar-sitio-mia.mjs` |
| Demo en esta máquina | `next build` y `node scripts/proyectos/demo-local.mjs --start` → `http://mia-producciones.localhost:3218/admin` |

## El pase

**El orden importa: primero la base, después el código.** `CashMovement` suma dos columnas que el código
nuevo lee en toda la caja: con el código nuevo y la base vieja se rompería la caja de todos los negocios.
El build de Vercel frena si la base está atrás, así que ese error no llega a publicarse. Al revés no hay
problema: el código actual funciona con la base ya migrada.

**Qué afecta a los demás negocios:** las dos columnas nuevas con sus índices en `CashMovement` (nulas para
todos), el código compartido que entra con el deploy y un rótulo nuevo en el libro de caja, que sólo aparece
si hay gastos de proyecto. El push además publica lo que haya en `main` en ese momento.

| # | Paso | Quién | Se deshace |
|---|---|---|---|
| 1 | Respaldo: Neon → Branches → Create branch desde producción, `respaldo-AAAA-MM-DD-mia`, **Auto-delete: Never** (el plan gratis sólo retiene 6 horas). | Dueño | Sí |
| 2 | Volver a medir: `node scripts/taller/migrar-produccion.mjs` (sólo lectura). Tiene que decir «Listo para migrar». | Agente | No escribe |
| 3 | Migrar: `node scripts/taller/migrar-produccion.mjs --migrar`. Aplica, verifica índices únicos y RLS. | Agente, con OK del dueño | Sí, ver abajo |
| 4 | Traer lo nuevo de `main`, rebasar, repetir pruebas si hubo cambios. Push a `main`: **deploy de producción**. | Agente, con OK del dueño | Sí, Instant Rollback |
| 5 | Esperar *Ready* y `npm run release:smoke -- https://<dominio> --commit <sha>`. | Agente | No escribe |
| 6 | Alta en `/operador/alta`: rubro **Productora** elegido del desplegable, slug y subdominio `mia-producciones`, estado `TRIAL`. El rubro cierra el panel y el subdominio publica la copia del sitio: con otro, no aparecen. | Dueño | Ver abajo |
| 7 | En la ficha del negocio: controlar que estén los módulos y prender **«Trabaja por apps»**. | Dueño | Sí |
| 8 | Dar de alta a las personas con su mail real (ficha → Personas). Las claves van sólo por chat al dueño. | Dueño | Sí |
| 9 | Cargar los costos reales del armador en Proyectos → Configuración. Los de fábrica son referencia. | MIA | Sí |
| 10 | Recorrido de punta a punta con un proyecto de prueba, en la dirección real. | Agente + dueño | — |

Si el slug termina siendo otro, sumarlo en `src/lib/proyectos/marca.ts` y `src/lib/branding.ts`; si no,
el negocio funciona pero sin su marca. El camino alternativo sin terminal es el SQL de
`docs/runbooks/pase-produccion/` pegado en el SQL Editor de Neon: es el mismo lote.

## Qué lo vuelve difícil de deshacer

- **Base:** la migración no borra ni reinterpreta datos. Si sale bien, no hace falta revertirla: el código
  viejo convive. Restaurar el respaldo es lo único que la deshace y **pierde lo que todos los negocios
  hayan cargado después de esa hora**: es el último recurso, no el primero.
- **Datos reales de MIA:** una vez que carguen proyectos y cobros, volver atrás los perdería.
- **Links enviados:** un cliente de MIA que aprobó por link ya vio esa propuesta; eso no se retira.

## Si algo sale mal

| Qué pasó | Qué se hace |
|---|---|
| El paso 2 frena | No se tocó nada. Lo pendiente cambió: revisar antes de seguir. |
| El paso 3 falla | Puede quedar a medio aplicar (P3009): `docs/runbooks/migracion-caja-neon.md`. No improvisar SQL. |
| Falla el chequeo de la app sobre una tabla nueva | Falta un GRANT: pegar `prisma/rls/0002_app_role.sql` en el SQL Editor (idempotente). |
| El deploy rompe pantallas | Vercel → Instant Rollback (`docs/runbooks/facturacion/rollback.md` §A), y revertir en `main` antes del siguiente push. |

## Qué NO está hecho

1. **Su dominio:** `miaproducciones.com.ar` sigue en su WordPress, sin tocar. La copia vive en
   `mia-producciones.<dominio>` con `noindex`: no se pasa a su dominio sin decisión del dueño.
2. **Formulario de contacto de la copia:** valida y abre el correo de quien consulta, con el mensaje listo para
   `comercial@miaproducciones.com.ar` (`contacto.js`). Es provisional: el original publica en su WordPress.
3. **La copia es una foto del 01/11/2026:** un proyecto nuevo en su WordPress no aparece solo. Conserva
   «Nos estamos renovando», su WhatsApp y sus enlaces tal cual; saca Google, Meta, AddToAny y reCAPTCHA.
4. **Diseño nuevo («Renglón»):** con ese interruptor prendido, Caja, Libro y Usuarios usan otras pantallas, que no
   se adaptaron a la productora. En MIA va apagado.
5. **Factura electrónica:** no se emite desde el módulo; sale de Facturación.
6. **Costos del armador:** provisionales, no son de MIA.
7. **Render:** es la vista 3D del navegador. No hay integración con un programa de render externo.
8. **PDF:** imprimir o guardar desde el navegador.
9. **Archivos:** imágenes achicadas en la base (hasta ~1 MB, 30 por proyecto) y links para lo pesado.
10. **Caja:** el libro no tiene columna de cheques: el cheque se asienta en Transferencia y su detalle dice
   «Cheque», en cobros y en gastos. Decisión provisional a confirmar con quien lleve la contabilidad de MIA.
11. **Gastos de proyecto:** el neto y el IVA se cargan separados y el neto es lo que se compara contra el
   presupuesto (provisional, igual que el punto anterior). No pasan por Compras: no suman a la cuenta corriente
   del proveedor ni al IVA compras, y lo «por pagar» vive sólo en Proyectos. En el reporte general de Resultado,
   un gasto pagado aparece sin categoría y su anulación como ingreso manual.
12. **Piezas para aprobar:** el circuito es una propuesta nuestra, sin validar con MIA. Quien responde deja el nombre que
   escribe: no se comprueba quién es, igual que en la propuesta. Nadie recibe un aviso cuando el cliente responde: se ve
   en el tablero y en la ficha. Cualquiera con el link puede responder y no hay forma de cambiarlo desde el panel. Los
   videos y PDF van por link a su nube, sin vista previa. Una pieza sacada del proyecto no se puede volver a ver en
   pantalla: su constancia queda en la base. El equipo, no sólo el dueño, puede enviar versiones al cliente (provisional).
13. **Cronograma y equipo:** propuesto, sin autorizar ni validar con MIA.

## Verificación

Hecha con compilación real y base en memoria: alta, armador, cómputo, propuesta, aprobar y rechazar,
versión 2, cobro, caja, anulación, rentabilidad, rol equipo sin plata, celular. También: el equipo entra a
Proyectos, imagen de 6,1 MB subida por archivo, cobro con centavos, transferencia y cheque en el libro,
link de WhatsApp con 549 y PDF de la propuesta generado con Chromium, sin costos ni botones.

**Front y panel, 01/11/2026, sobre la compilación final:**

- Copia: 13 páginas en 200 y 0 pedidos a otros servidores. En la portada, igual que el original: 59 imágenes,
  video, carruseles, marquee, botón de WhatsApp y Work Sans. Lo único que no está es el sello de reCAPTCHA.
- `/servicios`, `/clases`, `/facturita`, `/tienda` y las demás de otros rubros llevan a la portada, sólo en este host.
- Panel: dueño y equipo entran a Proyectos; el dueño ve las 8 apps aprobadas, el equipo sólo Proyectos; `/admin/turnos`,
  catálogo, recordatorios, auditoría, apariencia y localización rebotan. Sin textos de turnos en las 8 pantallas.
- Alta de cliente desde la lista, búsqueda, ficha con sus proyectos, exportación del libro, tema oscuro y celular a 390 px.
- **La demo necesita más de una conexión a su base** (`maxConnections`): con una sola, la portada daba 404 o el ingreso
  500, según qué se abriera primero. Es de la base en memoria; contra Neon no se pudo probar sin el pase.
- **Sin probar:** `/admin/proyectos` con el interruptor «Trabaja por apps» apagado, y el `mailto` abriendo un correo real
  (se revisó el enlace que arma).

**Costo real y proveedores, 01/11/2026, sobre la compilación final:**

- Neto con letras: avisa y no guarda. Gasto pagado con centavos y cheque, gasto por pagar, proveedor nuevo por nombre
  y existente sin distinguir mayúsculas, rubro no presupuestado y rubro en minúsculas unido al presupuestado.
- Doble clic en Pagar: un solo egreso. Anular uno pagado: vuelve la plata. Saldos del libro y ganancia real controlados
  a mano. El libro y su exportación dicen «Gasto de proyecto» y «Cobro de proyecto».
- Proveedores: alta, CUIT inválido y CUIT repetido avisan; pagar desde «Por pagar». El rol equipo no ve costo real ni
  cobros y rebota de Proveedores. Celular a 390 px sin desborde en las tres fichas, Proveedores y Rentabilidad.
- **La valla de calidad visual no pasa por `/admin/proyectos`:** ningún negocio de esa corrida tiene el módulo (figura
  entre las omitidas). Lo de celular de este módulo se midió con el recorrido, no con esa valla.

**Piezas para aprobar, 01/11/2026, sobre la compilación con este bloque:**

- Dueño y equipo: pieza nueva, imagen real achicada, link `https`, `http` rechazado, borrador descartado, enviar. Tablero y
  ficha muestran «para corregir» y «esperando al cliente».
- Cliente, sin sesión y a 390 px: no ve borradores ni piezas sin enviar, ni plata; el HTML tampoco trae quién la subió.
  Pedir cambios sin nombre o sin comentario avisa. Doble clic responde una vez. Responder una versión ya reemplazada avisa y
  no pisa nada. Lo aprobado conserva su especificación aunque después se cambie la pieza. Token falso: 404. La página va con `noindex`.
- Celular sin desborde en ficha, tablero, pieza y link del cliente.
- **Sin probar:** un token de MIA en el host de otro negocio. La demo tiene un solo negocio: `localhost` cae en el mismo y
  responde 200, así que eso no prueba nada. Lo protegen el `tenantId` de la consulta y RLS, igual que en la propuesta.

**Sin probar:** abrir WhatsApp de verdad (se revisó el link, no se envió nada) y el PDF con imágenes de un
render real. La propuesta impresa se miró con la hoja de ejemplo, sin render.

**Vallas del 01/11/2026, con gastos y piezas:** tipos, compilación, cobertura de RLS, sello, `test:release`
(14/14) y calidad visual (contraste, toque y desborde: 0 problemas) en verde.

- `npm test`: 6672 pasan, 35 fallan, 280 cancelados, 311 salteados. Comparadas por nombre con la corrida anterior a
  estos cambios, hay dos diferencias: las de `m1-cert-tarjeta-cableado`, que aparecen sólo desde PowerShell, que no tiene
  `grep`, y una medición de tiempos de `club/almacen-real.test.ts`, que corrida sola pasa (19 de 19). Las demás son del
  entorno o de la rama base (fin de línea de Windows, navegador, rutas `C:\C:\`).
- **No corridas en esta máquina:** las pruebas de pantalla de la suite (los 280 cancelados): su navegador
  no arranca (`spawn UNKNOWN`), tampoco en la rama base. Las 311 salteadas piden `ERP_TEST_PG_URL`.
- `gate:visual`: el login de `/admin` da rojo porque esa valla necesita una base propia: sin base,
  `DatabaseNotReachable`; con la de la demo, `ConnectionClosed`. Causa de entorno, sin una corrida en verde.
- `src/tenants/breakpoint/turnero/demo-local.test.ts` puede colgar `npm test` indefinidamente acá. Ya pasa
  en la rama base: correr con `--test-force-exit --test-timeout=180000`.

**Medido el 01/11/2026 contra producción, sólo lectura:** las pendientes son
`20261101120000_modulo_proyectos` y `20261101130000_proyecto_gastos`, y coincidían con el lote. Esa medición es anterior a
`20261101140000_proyecto_entregables`: el paso 2 del pase tiene que mostrar las tres.

**No ensayada sobre una copia de producción:** la migración corrió sobre base en memoria con todas las
anteriores, no sobre un branch de Neon con datos reales. Para ensayarla: crear un branch `ensayo-lote` y
pegar en su SQL Editor `docs/runbooks/ensayo-neon/1-lote-en-branch.sql` y después
`2-rls-despues-del-lote.sql`.

**Trampa de Windows:** `node scripts/ensayo-lote-neon.mjs` no escribe nada acá (su control de arranque no
reconoce la ruta) y con saltos CRLF en `prisma/lote-deploy.txt` toma los comentarios como migraciones. El
SQL de ensayo se generó desde una copia con saltos LF; las sumas de control `9a22cd47…`, `e855b4d1…` y `8364154d…` coinciden
con las de las migraciones en git, que es lo que lee Vercel.

**Trampa de Windows en el paso 3:** con `core.autocrlf=true`, git puede bajar una migración con saltos CRLF, y
`prisma migrate deploy` registra la suma del archivo en disco, no la de git. Medido el 01/11/2026:
`20261101120000_modulo_proyectos` estaba en CRLF, con suma `2e4c42d4…` en disco contra `9a22cd47…` en git. Por eso
`migrar-produccion.mjs` ahora frena si una migración pendiente tiene CRLF y dice cómo corregirla. Qué haría Vercel
con una suma distinta no se probó: la documentación de Prisma dice que avisa y no frena. [A VALIDAR si alguna vez
se saltea este freno]
