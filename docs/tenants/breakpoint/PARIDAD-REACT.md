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
| Aprobación en el celular | Link `#aprobar` (durante el corte sigue el de vanilla) | 🔴 | club (ola 3) | ⚠ **brecha**: publicado sólo en demo (PIN real no da código) y exige login OWNER del ERP en el celular. En modo real da el código bueno y recepción lo valida (3.codigo, 3.aprobado) |
| Proveedores | Alta, ficha con CC, pagar con PIN, remitos con lector | 🟠 | club | ✅ alta, remito (recepción, desde la Caja), pagar con PIN (5.*, 7.pagar-proveedor) |
| Stock | Conteo, baja, códigos, precios y rentabilidad, reposición | 🟠 | club | ✅ conteo inicial y corrección, stock que baja con cargos, tienda y mostrador, sube con el remito |
| Configuración | Reglas, tarifas, horarios, contactos (dentro del estado), usuarios y PIN, consola, jornada (respaldo, restaurar, limpieza) | 🔴/🟠 | club | ✅ consola de primera vez, avisos, precios, fondo, bloqueo, alta/PIN nuevo/sacar acceso, link, go-live con respaldo elegido (0.*, 7.*, 10.*). ⚠ **brecha**: falta «Empezar otra jornada en blanco» |
| Novedades | Difusión por audiencia, calendario | 🟠 | club | ✅ difusión, uno por uno con BAJA, CSV (7.difusion, 7.uno-por-uno, 7.csv) |
| Transversal | Paleta Ctrl+K y atajos | 🟢 | club | — no está en el guion del sábado (sólo la L de bloquear: ✅) |
| UAT | Guion del sábado de torneo adaptado a `/admin/club` | requisito del corte | club | ✅ escrito: `npm run test:club-paridad` → **123/131**, 8 brechas, 0 otras fallas, 0 errores de consola |

No se portan (decisión a confirmar con el dueño): las cámaras simuladas, los 5 estilos visuales (el panel usa el
tema del ERP) y el Studio de redes (queda en vanilla por ahora).

## Lo que cambia por estar dentro del ERP

- **Login y PIN conviven:** la sesión del ERP es el **puesto** (entra una vez por día); el PIN del club es la
  **persona** (bloqueo, cambio de usuario, acciones sensibles), igual que hoy.
- **Persistencia (BP-3):** la foto del estado (mismo sobre v1 del respaldo) en `AuditLog` con versión optimista,
  poda y espejo local; sin migración de base. Cadencia de guardado medida para no gastar de más en Neon.
- **Multi-tenant:** `requireApp("club")`, `tenantId` de la sesión, RLS; test con base efímera (A no lee lo de B).

## Día de corte (vanilla → React)

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

| # | Decisión |
|---|---|
| G1 | Fecha del día de corte y OK a asignar el módulo al club (publicación) |
| G2 | Guardar los datos de Break Point en la base del ERP (Neon) es inversión post-venta: ¿se considera venta concretada? Si no, el corte se hace con guardado local y la base se enciende después |
| G3 | PIN de 2 dígitos (como hoy, recomendado para el corte) o 4 (después) |
| G4 | La aprobación desde el celular del dueño sigue por el link de vanilla durante el corte |
| G5 | El panel usa el tema del ERP, no los 5 estilos del vanilla |
| G6 | Studio de redes y cámaras quedan en vanilla / no se portan |
| G7 | Usuarios del ERP para el club (mail y clave; las claves las pega el dueño) |

## UAT de paridad — resultado (17/10)

`npm run test:club-paridad [carpeta de capturas]` (`src/app/admin/(dashboard)/club/uat-paridad.e2e.ts`): el guion del sábado
de torneo del vanilla (`uat-torneo.e2e.mjs`, más lo de `uat-b.e2e.mjs`) recorrido clic por clic en el ClubDemo real (esbuild,
CSS real de la app, almacén real en **jornada real**, reloj controlado), con el turnero público servido por el mismo
manejador del ERP para la tienda. Es un e2e y no un `*.test.ts` porque, mientras haya brechas, falla a propósito (y `npm
test` corre `src/**/*.test.ts`). Lo que React no puede hacer queda como check `brecha.*` con la línea del vanilla y de React.

**Resultado: 123 de 131 en verde; las 8 que faltan son brechas** (7 de fondo: las solapas por persona fallan por los dos lados, `brecha.permisos-por-persona` y `brecha.duenio-en-el-puesto-de-recepcion`).** 0 errores de consola, 0 scroll de costado a 390 px.**

### Brechas, por prioridad

| Prioridad | Brecha | Vanilla | React |
|---|---|---|---|
| 🔴 bloquea el día de corte | **Las solapas siguen al login del ERP, no a la persona del PIN.** Con el puesto en OWNER, Lu (recepción) ve Tablero, Proveedores, Stock, Novedades y Configuración (el motor frena lo sensible: «Lu no tiene permiso para esto»). Con el puesto en RECEPTION, Majo entra con su PIN y no ve nada de dueño (ni respaldo, ni go-live). Hay que decidir el modelo puesto/persona (G7) o filtrar las solapas por `puede()` del operador | `app.mjs` pestañas por permiso; uat-torneo.e2e.mjs:138 y :302-333 | ClubDemo.tsx:184 · solapas-club.ts:41-52 · config-golive.tsx:50 |
| 🔴 bloquea el día de corte | **Aprobador del celular publicado sólo en demo**: con el PIN real de Majo dice «PIN incorrecto». Además exige login OWNER del ERP en el celular (el vanilla no). Con G4 (durante el corte sigue el link del vanilla) deja de bloquear, pero el link de «Avisar a Majo» de React apunta a `/admin/club/aprobar` | uat-torneo.e2e.mjs:242-248 | aprobar/page.tsx:28 y :31-44 |
| 🟠 importante | El alta del turno no tiene el **teléfono «para darlo de alta»**: un titular nuevo queda sin ficha (sin fiado ni novedades); hay que ir antes a Clientes | app.mjs:1662, :1680-1681 | AltaDeTurno.tsx:194-209 |
| 🟠 importante | **«Pedir OK para fiar»** no está en la cuenta del turno: sólo en Buffet → la tarjeta de la cuenta | uat-torneo.e2e.mjs:230-232 | CuentaDelTurno.tsx · BuffetDelClub.tsx:206-210 |
| 🟠 importante | Con la cancha cerrada y **la mesa que sigue**, la cuenta del turno no deja sumar cargos: hay que ir a Buffet → «Cargar productos» | app.mjs:1426-1429 | CuentaDelTurno.tsx:492 · cuenta-core.ts:162 |
| 🟢 menor | Al **cambiar de persona** queda abierta la cuenta del turno que tenía la anterior (el vanilla cierra la ventana) | uat-b.e2e.mjs:141-143 | ClubDemo.tsx:185 |
| 🟢 menor | Falta **«Empezar otra jornada en blanco»** (con PIN de dueño, apartando la de ahora) | app.mjs:888, :2279 | config-jornada.tsx |

Propuestas triviales (no se tocaron: este frente sólo agrega tests y docs): limpiar `panel` cuando cambia el operador
(`useOperador` en ClubDemo.tsx); mostrar `SumarCargo` también con la cancha `finalizada` mientras la mesa siga abierta.

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

**Llaves del corte (no son brechas, son decisiones del dueño):** `NEGOCIOS_CON_JORNADA_REAL` vacío en
`club/page.tsx` (G1) y la base del ERP para la jornada (G2). El UAT monta la jornada real como quedaría ese día.

— Elaborado por GSG
