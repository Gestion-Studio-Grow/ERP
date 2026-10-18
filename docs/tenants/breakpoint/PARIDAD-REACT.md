# Break Point — paridad del sistema de hoy (vanilla) con la versión React del ERP

Pedido del dueño (17/10): «si vamos a pasar a React, completá el trabajo: quiero llegar al mismo status que tenemos
con el sistema de hoy». Matriz armada por Fable leyendo el código de las dos versiones (vanilla
`public/previews/breakpoint/club/*` y React `src/app/admin/(dashboard)/club/*` de la rama de terminales).

**Foto:** de ~95 funciones, React tiene **SÍ 31 · PARCIAL 10 · NO 50 · N/A 4**. Lo hecho (la recepción del turno:
agenda, alta, cuenta del turno con «a cargo de» y «la mesa sigue», ciclo, fijos, espera, lluvia, mantenimiento,
buffet básico, caja básica, deshacer) está muy bien. Falta: 8 de las 9 pestañas del dueño/operación, identidad y
seguridad del mostrador (PIN, bloqueo, cambio de usuario), **reloj real**, **persistencia real** (BP-3) y cosas
diarias chicas pero críticas.

## Lo que falta, por prioridad

🔴 = lo usa recepción todos los días · 🟠 = el dueño cada día/semana · 🟢 = ocasional

| Área | Falta | Prioridad | Quién | Estado (UAT de paridad, 17/10) |
|---|---|---|---|---|
| Tiempo | Reloj real (hoy fijo 19:10), madrugada, cambio de día | 🔴 bloqueante | terminales (almacén) | ✅ reloj real, inactividad, 00:30 sigue en el sábado, caja de 12 a 12 (2.hora, 8.medianoche, 8.caja-12-a-12) |
| Agenda | Sumar jugador (nombre/ficha), notas, día anterior, bandeja «Para resolver ahora» completa, luces, WhatsApp de confirmación/recordatorio/lluvia/espera | 🔴 | terminales | ✅ en el guion (alta con los 3 jugadores, luces, mañana). ⚠ **brecha**: el alta del turno no tiene el teléfono «para darlo de alta» |
| Cuenta del turno | Cobro parcial de cancha, cobrar sólo la parte de cancha, cerrar cancha a cuenta corriente | 🔴 | terminales | ✅ «a cargo de», por jugador, «Sólo la cancha», parcial, «la mesa sigue» (1.*, 2.*, 3.*). ⚠ **brechas**: no se suma un cargo con la mesa que sigue; «Pedir OK para fiar» sólo en Buffet |
| Buffet | Venta rápida, mesa compleja (pasar cargo, manual, descuento con PIN del dueño), pedidos de la tienda | 🔴 | terminales | ✅ mostrador (con lector por código interno), cargo manual, descuento sólo con PIN de dueño (5.*) |
| Caja | Fondo de caja, movimientos completos, PIN en egreso y cierre | 🔴 | terminales | ✅ fondo, cierre con PIN (uno mal no cierra), una sola vez, la caja = lo cobrado al peso, remito desde la Caja (8.*, 5.remito) |
| Identidad | PIN, cambio de usuario, bloqueo de pantalla (inactividad, pantalla apagada, recarga, intentos que escalan) | 🔴 | club | ✅ todo el bloque 6 y 9.bloqueada. ⚠ **brechas**: las solapas siguen al login del ERP, no a la persona del PIN; al cambiar de persona queda abierta la cuenta de la anterior |
| Persistencia (BP-3) | Foto en la base del ERP (AuditLog, sin migración), espejo local, una pestaña, descargar/restaurar respaldo v1 | 🔴 requisito del corte | club | ✅ local: recarga, «Usar acá», respaldo, archivar en dos pasos (9.*, 7.respaldo, 7b.*). La base (G2) no se probó: es decisión del dueño |
| Clientes | ABM, ficha, cuenta corriente (habilitar/pedir/cobrar/estado de cuenta), baja de novedades | 🔴 | club | ✅ alta, ficha, estado de cuenta, cobrar deuda (1.fichas, 7.*) |
| Tablero del dueño | Novedades para autorizar (crédito, accesos) + aviso 🔔, KPIs, mapa de calor, platos | 🔴/🟠 | club | ✅ 🔔 sólo a dueños → Tablero, KPIs, caja por medio = la caja (3.campana*, 7.kpis, 7.caja-por-medio) |
| Aprobación en el celular | Link `#aprobar` (durante el corte sigue el de vanilla) | 🔴 | club (ola 3) | ⚠ **brecha**: publicado sólo en demo (PIN real no da código) y exige login OWNER del ERP en el celular. En modo real da el código bueno y recepción lo valida (3.codigo, 3.aprobado). **18/10, trial (G4):** el link de Break Point va al aprobador del vanilla y su código lo acepta React (3.whatsapp, 3.celular, 3.codigo) |
| Proveedores | Alta, ficha con CC, pagar con PIN, remitos con lector | 🟠 | club | ✅ alta, remito (recepción, desde la Caja), pagar con PIN (5.*, 7.pagar-proveedor) |
| Stock | Conteo, baja, códigos, precios y rentabilidad, reposición | 🟠 | club | ✅ conteo inicial y corrección, stock que baja con cargos, tienda y mostrador, sube con el remito |
| Configuración | Reglas, tarifas, horarios, contactos (dentro del estado), usuarios y PIN, consola, jornada (respaldo, restaurar, limpieza) | 🔴/🟠 | club | ✅ consola de primera vez, avisos, precios, fondo, bloqueo, alta/PIN nuevo/sacar acceso, link, go-live con respaldo elegido (0.*, 7.*, 10.*). ⚠ **brecha**: falta «Empezar otra jornada en blanco» |
| Novedades | Difusión por audiencia, calendario | 🟠 | club | ✅ difusión, uno por uno con BAJA, CSV (7.difusion, 7.uno-por-uno, 7.csv) |
| Transversal | Paleta Ctrl+K y atajos | 🟢 | club | — no está en el guion del sábado (sólo la L de bloquear: ✅) |
| UAT | Guion del sábado de torneo adaptado a `/admin/club` | requisito del corte | club | ✅ escrito: `npm run test:club-paridad` → **123/131**, 8 brechas, 0 otras fallas, 0 errores de consola |

No se portan: los 5 estilos visuales (el panel usa el tema del ERP). **Studio de redes y cámaras simuladas**
(decisión del dueño, 18/10: «se quedan en el sistema de hoy pero se hace también en React»): el Studio va en
Novedades y redes (desde la novedad que se arma y desde el calendario; `studio-de-redes.tsx` en su propio chunk,
lo puro en `studio-core.ts`, el dibujo en `studio-placa.ts`); las cámaras van en el Tablero del dueño SÓLO en la
demo, como el vanilla (`camaras-de-la-demo.tsx`, `camaras-core.ts`). Prueba en el navegador: `studio-pantalla.test.ts`.

## Lo que cambia por estar dentro del ERP

- **Login y PIN conviven:** la sesión del ERP es el **puesto** (entra una vez por día); el PIN del club es la
  **persona** (bloqueo, cambio de usuario, acciones sensibles), igual que hoy.
- **Persistencia (BP-3):** la foto del estado (mismo sobre v1 del respaldo) en `AuditLog` con versión optimista,
  poda y espejo local; sin migración de base. Cadencia de guardado medida para no gastar de más en Neon.
- **Multi-tenant:** `requireApp("club")`, `tenantId` de la sesión, RLS; test con base efímera (A no lee lo de B).

## Día de corte (vanilla → React)

**El paso a paso para el dueño (con archivo:línea) está en `PASE-AL-ERP.md`** (decisión del 18/10: trial en el plan
gratis). Resumen:

Cerrar la caja en vanilla → descargar respaldo → asignar el módulo `club` a `breakpoint` (O4) → restaurar el
respaldo en `/admin/club` → verificar caja al centavo, cuentas, clientes, deudas, usuarios y PIN → trabajar.
El sitio público (portada, turnero, `publico.json`) sigue igual.

**Mínimo para el corte:** olas 0 + 1 + 2 completas; de la 3: clientes, novedades para autorizar + 🔔, precios y
stock; de la 4: usuarios y PIN, reglas/tarifas/horarios/contactos, respaldo y restaurar; UAT de paridad en verde.

## Olas y esfuerzo (estimación de Fable)

| Ola | Qué | Días (Opus) |
|---|---|---|
| 0 | Reloj real, persona y PIN, bloqueo | 2–3 |
| 1 | Lo diario que falta en recepción | 4–5 |
| 2 | Persistencia real y jornada (BP-3) | 3–4 |
| 3 | Clientes, dueño, proveedores, stock | 4–5 |
| 4 | Configuración, consola, novedades | 3–4 |
| 5 | Paleta, atajos y UAT de paridad | 2–3 |

Total 18–24 días de trabajo; con dos sesiones en paralelo (terminales + club), unas 3 semanas.

## Decisiones del dueño

| # | Decisión | Respuesta del dueño (18/10/2026) |
|---|---|---|
| G1 | Fecha del día de corte y OK a asignar el módulo al club (publicación) | **Fecha: «se cargará cuando se cargue y esté todo probado».** OK explícito a **asignar el módulo `club` a Break Point** (pendiente de ejecutar: este entorno no tiene acceso a la base; ver abajo) |
| G2 | Guardar los datos de Break Point en la base del ERP (Neon) | **OK: «enciende la base para break»** — se considera habilitada la inversión. Se ejecuta junto con G1 |
| G3 | Largo del PIN | **4 dígitos para los dueños, 2 para los empleados.** Los PIN de 2 de los dueños del piloto siguen entrando y se les pide el nuevo de 4 |
| G4 | Aprobación desde el celular del dueño | **Link del sistema de hoy (vanilla, sin login) hasta el go-live** — **también durante el trial en el ERP**: el «Avisar a Rober/Majo» del club React manda `https://breakpointpadel.gsgapp.com.ar/club#aprobar&…` con los mismos 7 datos y en el mismo orden que el vanilla; el código que da el celular lo acepta `aprobarPorCodigo` en React. Configuración por negocio, sin el tenant en el núcleo: `aprobador-externo.ts` (`APROBADOR_EXTERNO`), el negocio llega por `negocio-del-club.tsx` (lo pone ClubDemo) a `pedido-del-duenio.tsx` y a la ficha del cliente (`clientes-core.ts` → `armarFicha`) ✅ (18/10) |
| G5 | Aspecto del panel | **Personalizado a nivel cliente: opcional y se cobra; si no, va el tema por defecto del ERP** |
| G6 | Studio de redes y cámaras simuladas | **Se quedan en vanilla y se hacen también en React** — ✅ hecho (18/10): Studio en «Novedades y redes», cámaras en el Tablero sólo en la demo |
| G7 | Usuarios del ERP para el club | **Se otorgan después de la prueba piloto** (las claves las pega el dueño) |
| G8 | Lo delicado (archivar, restaurar, empezar en blanco, limpieza) | **Estricto: puesto de dueño (login OWNER del ERP) + PIN de dueño**, y la pantalla lo avisa de entrada, no al tocar |
| G9 | Modo sin internet en el mostrador | **Construirlo**: se opera sobre la copia local y se sincroniza al volver la conexión |
| G10 | Back separado del front | **Decidido por el dueño («mejor performance»)**; pasa por Advisory + Challenger (ADR-045) para definir cómo, con qué y en qué orden |
| G11 | Riesgo de los ~5 MB del navegador en el sistema de hoy | **Aceptado** («está ok»); el archivado de días cerrados ya está listo y aprobado por el Gate |
| G12 | Pasar Break Point al ERP | **18/10: «Pasamos al ERP el sistema, con el plan actual (gratis), todavía no le vamos a cobrar; al venderlo se aumenta el plan; es un trial pero debe estar en el ERP.»** Trial en el club React con la jornada en la base (BP-3), sobre Neon Free y Vercel Hobby; al venderlo se sube el plan. Runbook del pase (usuarios, módulo, día del pase, cómo volver atrás, límites del plan gratis): **`PASE-AL-ERP.md`** |

## UAT de paridad — resultado (17/10)

`npm run test:club-paridad [carpeta de capturas]` (`src/app/admin/(dashboard)/club/uat-paridad.e2e.ts`): el guion del sábado
de torneo del vanilla (`uat-torneo.e2e.mjs`, más lo de `uat-b.e2e.mjs`) recorrido clic por clic en el ClubDemo real (esbuild,
CSS real de la app, almacén real en **jornada real**, reloj controlado), con el turnero público servido por el mismo
manejador del ERP para la tienda. Es un e2e y no un `*.test.ts` porque, mientras haya brechas, falla a propósito (y `npm
test` corre `src/**/*.test.ts`). Lo que React no puede hacer queda como check `brecha.*` con la línea del vanilla y de React.

**Resultado (corrida del 17/10 con la rama `ccr-63ed11dc-blanco`): 136 de 137 en verde; la única que falta es la brecha
`aprobador-real`, que depende del dueño.** 0 otras fallas, 0 errores de consola, 0 scroll de costado a 390 px. (Primera
corrida: 123 de 131 con 8 brechas; después de las solapas por persona y el alta con teléfono, 126 de 129 con 3.)

**18/10 (trial en el ERP, G4): 139 de 140.** El celular de Majo ahora abre el link del club de hoy (el `/club`
empaquetado, servido por el mismo manejador del ERP) y da el código con su PIN real; recepción lo tipea en React y
aprueba (`3.whatsapp`, `3.celular`, `3.codigo`, `3.aprobado`). El aprobador del ERP se sigue probando aparte con el
mismo pedido (`3.celular-erp`, `3.codigo-erp`): la brecha `aprobador-real` queda, pero ya no bloquea el trial.

### La brecha que queda

| Prioridad | Brecha | Vanilla | React |
|---|---|---|---|
| 🔴 bloquea el día de corte | **Aprobador del celular publicado sólo en demo**: con el PIN real de Majo dice «PIN incorrecto». Además exige login OWNER del ERP en el celular (el vanilla no). Con G4 (durante el corte sigue el link del vanilla) deja de bloquear, pero el link de «Avisar a Majo» de React apunta a `/admin/club/aprobar` | uat-torneo.e2e.mjs:242-248 | aprobar/page.tsx:28 y :31-44 |

Es decisión del dueño (G4: durante el corte la aprobación sigue por el link del vanilla; para la jornada real del ERP hay
que sumar el negocio a `NEGOCIOS_CON_APROBADOR_REAL` y resolver el login OWNER en el celular). **18/10:** con el trial,
el link de Break Point ya va al vanilla (`aprobador-externo.ts`), así que la brecha **deja de bloquear el día de
corte**; sigue abierta para cuando se deje el club de hoy (se borra la línea de `breakpoint` en ese archivo y se hace
lo de arriba).

**A tener en cuenta con G7 (no es brecha del guion):** Majo en un puesto de recepción ve Configuración, pero archivar,
restaurar, empezar en blanco y la limpieza del go-live piden además el puesto del dueño (rol OWNER del ERP, en el
almacén y en `configuracion-core.ts`): desde ese puesto le dicen «… lo hace un dueño». El UAT corre en el puesto del
dueño, como quedaría el día de corte.

### Cerradas desde la primera corrida

| Brecha | Cómo quedó | Dónde | Check del UAT |
|---|---|---|---|
| Las solapas seguían al login del ERP (🔴) | Las decide quien entró con su PIN: Lu no ve Configuración ni lo de dueño; Majo en un puesto de recepción sí | ClubDemo.tsx · solapas-club.ts (488cfdf8) | `1.recepcion`, `1.motor-frena` |
| Teléfono en «Dar un turno» (🟠) | Titular nuevo → nombre + teléfono → ficha atada al turno; si el número ya tiene ficha, se usa ésa (no se duplica) | AltaDeTurno.tsx · alta-core.ts (c2b452c1) | `1.alta-con-telefono`, `1.fichas`, `1.en-clientes`, `2.ficha-por-telefono` |
| «Pedir OK para fiar» en la cuenta del turno (🟠) | Por jugador, con el código del dueño, como en Buffet | CuentaDelTurno.tsx · pedido-del-duenio.tsx (c2b452c1) | `3.fiar-en-la-cuenta` (que el botón esté; el pedido del guion sale de Buffet, la misma pieza) |
| Con la cancha cerrada y la mesa que sigue, no se sumaban cargos (🟠) | Se suman y entran al cobro; lo valida el motor | CuentaDelTurno.tsx · cuenta-core.ts (c2b452c1) | `2.marca`, `2.sigue` |
| Al cambiar de persona quedaba abierta la cuenta anterior (🟢) | Se cierra | ClubDemo.tsx (488cfdf8) | `6.cierra-lo-de-lu` |
| «Empezar otra jornada en blanco» (🟢) | Configuración → Jornada, sólo jornada real y sólo un dueño: zona de peligro con UNA descarga del respaldo de ahora + elegir ese archivo + PIN; se verifica que es la jornada de ahora y recién ahí `almacen.empezarEnBlanco` (copia en la compu; sin lugar, nada). Aparece la consola de primera vez | config-jornada.tsx · configuracion-core.ts (`autorizarEnBlanco`, compartido con la limpieza del go-live) | `7c.*` (otra compu con la jornada del sábado) |

**Revisión de `1.motor-frena`** (el cambio de terminales: con Lu ya no se ve Configuración). Es correcto: con las solapas
por persona, que Lu no vea Configuración es lo esperado. Pero así como estaba anotaba «el motor frena» sin probar el
motor, y si Lu veía Configuración sin el alta de usuarios el check desaparecía en silencio. Ahora, sin la solapa, igual
prueba el motor con el estado real y el PIN real de Lu (`altaUsuario` sobre una copia → «Lu no tiene permiso para
esto.»): esconder la solapa no es seguridad.

### Lo que funciona igual o mejor que el vanilla

- **Consola de primera vez** completa: PIN de los dueños (repetido y distintos), avisos, recepción con PIN que se ve una vez,
  precios valle/pico, fondo y «Abrir el club» → bloqueado.
- **Recepción del sábado**: 4 canchas × 4 jugadores, $ 89.100 por turno en un solo lugar, «a cargo de» ($ 32.600), por
  jugador, «Sólo la cancha», parcial, «la mesa sigue» con el turno siguiente en la misma cancha. **Mejor**: el alta del
  turno ya carga los otros 3 jugadores.
- **Fiado**: WhatsApp a Majo con el link, código de 6 letras, código malo «1 de 5», aprobado, a cuenta corriente; 🔔 sólo
  para dueños y lleva al Tablero.
- **Tienda**: el link de Configuración abre el turnero público; el mensaje pegado aparece en «Pedidos para retirar» y se
  entrega cobrando (stock baja). **Mostrador** con lector, **mesa compleja** con descuento firmado por el dueño, **remito**
  desde la Caja.
- **Bloqueo**: candado y L, letras no gastan intentos, Escape no cierra (modal), 5 mal → 30 s, pantalla apagada > 30 s,
  inactividad configurable, recarga bloqueada; nunca se ve un PIN.
- **Dueña**: KPIs y caja por medio = la caja, estado de cuenta y cobro de deuda, pagar al proveedor con PIN, conteo,
  difusión uno por uno con BAJA y CSV, alta / PIN nuevo / sacar acceso.
- **Cierre**: caja con PIN, una sola vez, **la caja = lo cobrado al peso** (canchas + cargos/tienda/mostrador + deuda).
- **Archivar** en dos pasos con el archivo elegido (sin archivo u otro archivo no achica; descarga bloqueada no achica;
  al centavo día por día). **Go-live mejor que el vanilla**: además de listar lo pendiente, exige elegir el respaldo
  recién bajado (otro archivo no limpia) y no deja copias sueltas en la compu; conserva maestro, saldos y el turno de
  mañana con su adelanto.
- **Empezar otra jornada en blanco, mejor que el vanilla**: el vanilla bajaba un respaldo solo y seguía sin saber si la
  descarga había llegado (el B1 del Gate). Acá: UNA descarga, elegir ese archivo y el PIN; si es otro archivo, o si
  cambió algo en el medio, no se toca nada. Lo de antes queda en el archivo elegido y en una copia en la compu; si no
  hay lugar para esa copia, tampoco se toca nada («archivá días cerrados antes»).

**Llaves del corte (no son brechas, son decisiones del dueño):** `NEGOCIOS_CON_JORNADA_REAL` (G1; desde el 18/10 trae
`breakpoint`, en `club/jornada-del-club-core.ts`, con su test) y la base del ERP para la jornada (G2, habilitada el
18/10). El UAT monta la jornada real como quedaría ese día.

## Lo que el servidor no controla (deuda del «modo foto», Gate del 18/10)

Con la jornada en la base (BP-3) el servidor guarda una FOTO del estado entero; no tiene comandos. Eso deja tres
deudas que se aceptan para el trial y se cierran con los comandos / el back separado (G10):

1. **G8 lo hace cumplir la pantalla, no el servidor (M1).** `guardarFotoDelClub` (`club/estado-actions.ts`) acepta el
   estado completo de cualquier usuario con `agenda:manage` (la recepción incluida): el servidor **no distingue un
   guardado de un restaurar ni sabe qué cambió** (usuarios y PIN, precios, un restaurar entero). Que lo delicado sea
   del dueño lo controlan el motor y el almacén en la pantalla (puesto OWNER + PIN de dueño). Alguien con el login de
   recepción y las herramientas del navegador podría subir una foto con otros PIN.
2. **La «época» de la poda no se usa (M1).** La pantalla restaura con `almacen.restaurar` → `guardarYa()` →
   `guardarFotoDelClub`, o sea como un guardado más: la foto de antes del mismo día de caja se poda. La época que la
   conserva (`estado-repo.ts`, `idsParaPodar`) sólo la abre `restaurarRespaldoDelClub`, que no usa ninguna pantalla
   (sí los tests). La copia de antes queda en el navegador de esa compu (`antes-de-restaurar:<ms>`). **Propuesta
   barata (no implementada: toca `almacen.ts`, de terminales):** que el próximo guardado después de
   `almacen.restaurar` vaya marcado como restaurar (una acción `marcarRestauracionDelClub(version)` o un campo
   `accion=restaurar` en el FormData de `guardarFotoDelClub`, permitido sólo a un OWNER), para que el repositorio
   escriba la fila `restaurar:` y abra la época.
3. **Los PIN viajan y quedan en claro (M2, se suma a SEC-5 / O1).** El sobre v1 trae los PIN de todos los usuarios
   sin hash; ahora también quedan en `AuditLog.changes` (cada foto, hasta que la poda la borra; las 14 diarias
   incluidas) y vuelven en `leerFotoDelClub` a cualquier puesto con `agenda:manage` (la recepción). La Auditoría del
   panel **no** las muestra (filtro `ENTIDADES_FUERA_DE_LA_AUDITORIA`, Gate B1) y ningún otro lector de `AuditLog`
   las trae. Hash o redacción de los PIN en el servidor: BP-4 / G10.

El control de «otro club / la demo» al restaurar ahora lo repiten las acciones del servidor
(`revisarRespaldoDelClub`, `restaurarRespaldoDelClub`, contra la foto vigente). El respaldo v1 sigue sin decir de qué
negocio es: propuesta en `FORMATO-RESPALDO.md`.

— Elaborado por GSG
