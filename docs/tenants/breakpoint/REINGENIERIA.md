# Break Point Pádel — Reingeniería del backoffice del club

**Fecha:** 2026-10-14 · **Método:** skill `ingenieria-reversa` (`.claude/skills/ingenieria-reversa/SKILL.md`)
**Etapa comercial:** preventa → **todo es DEMO a costo cero** (sin datos reales, sin persistencia, sin dominio).
**Entregable vivo:** `public/previews/breakpoint/club/` (servido en `/previews/breakpoint/club/index.html`, enlazado desde la vidriera de preventa)
· motor `motor.mjs` · backoffice `index.html` + `app.mjs` · tests `src/tenants/breakpoint/motor-club.test.ts` (29).

> **Qué es esto.** Tomamos cómo gestionan un club de pádel los sistemas de referencia en Europa, separamos lo
> que es del rubro de lo que es de su mercado, lo adaptamos a un club de Ezeiza y lo construimos: un backoffice
> que la **recepcionista** usa con gente esperando en el mostrador y una **vista del dueño** con cámaras, stock
> y turnos. Todo lo que no se pudo verificar en una fuente dice **inferido**.

---

## 0. Calibración (ADR-052)

- **Lo que ya existía:** preventa del 06/07/2026 (`docs/metodologia/registro-casos/breakpoint.md`) con
  identidad (azul royal `#0B5FB0` + naranja `#F07A0C`, pelota como la "O" de POINT), 4 canchas panorámicas,
  shop, Delicias (bodegón), escuelita y Circuito Padel Sur. La vidriera pública está en
  `public/previews/breakpoint/index.html`. **Faltaba el backoffice**: esto lo construye.
- **Principios de esta pasada:**
  1. La recepcionista no busca problemas: **el sistema se los pone adelante** con la acción en un toque.
  2. Toda regla de plata vive en el motor y tiene test; la pantalla sólo pinta.
  3. Nada que no sea verdad: cámaras y luces **simuladas y rotuladas como tales**; precios "de ejemplo".
  4. Argentina primero: seña por transferencia/Mercado Pago, WhatsApp, lluvia, cortes de luz, efectivo.
  5. Demo a costo cero: estado en memoria, cero persistencia, cero credenciales.
- **Zona de de-sesgo (ADR-046):** motor y reglas = **estándar** (preciso). Textos de pantalla y WhatsApp =
  **humana/criolla** ("No llegó: van 40 min", "Cobrar antes de que se vayan").
- **Marca:** el logo de esta demo es la **recreación fiel en CSS** de la preventa. El club tiene el logo
  oficial; **pendiente que lo pase en vectorial** para reemplazar la recreación (ver §9).

---

## 1. Referentes (ingeniería reversa sobre lo público)

| Referente | Origen | Qué define del rubro | Fuente |
|---|---|---|---|
| **Playtomic Manager** (Syltek) | España | Líder: agenda unificada (reservas + partidos abiertos + clases + ligas), pago integrado, monedero del club, política de cancelación | Centro de ayuda de Playtomic Manager |
| **MATCHi** | Suecia | Reserva y pago por app, emparejar por nivel; automatiza **luces sólo en horario reservado** y **códigos de acceso** digitales | matchi.se/about |
| **Doinsport** | Francia | Caja registradora, pro-shop integrado, **acceso por digicode/QR/RFID sincronizado con la reserva**, que también maneja la luz | Fichas comparativas (Appvizer) |
| **Automatización de club** (Smart Padel Automation, Kisi) | Europa | PIN/teclado y **luz que prende y apaga según la reserva**; credencial que vence al terminar el turno | bookaball.com · getkisi.com |

**Lo verificado** (centro de ayuda de Playtomic):
- El jugador cancela su lugar en un partido público **hasta 24 h antes**; dentro de esa ventana **decide el club**.
- Si cancela el club, el reembolso es completo; a tarjeta tarda 2–10 días hábiles, **al monedero del club es instantáneo**.
- Partido abierto: no reserva cancha hasta llenarse o hasta que un admin la asigna; los lugares vacantes se reembolsan.
- Lluvia: **el club decide** si cancela; Playtomic no interviene.
- No-show en partido abierto: el reembolso de lo pagado con saldo del club queda a criterio del club.

**Lo inferido** (no encontramos documentación pública, se deduce del producto o del mercado):
- Que estos sistemas **no** tienen una bandeja de eventualidades priorizada para recepción (la agenda es la interfaz).
- Que no resuelven **corte de luz** con crédito proporcional (en su mercado no es una eventualidad frecuente).
- Que la integración de **cámaras** con el turno no es estándar en ninguno (no aparece en ninguna fuente revisada).
- Que la gestión de **stock** fuera del pro-shop (bebidas, alquiler de palas que vuelve) es débil en Doinsport
  (la ficha no la menciona).

---

## 2. Desarme — el modelo detrás de las pantallas

| Capa | Lo que hacen los referentes | Cómo queda en Break Point |
|---|---|---|
| **Objetos** (se crean una vez, ADR-055) | Cancha (techada/descubierta, panorámica), cliente con nivel, producto, tarifa por franja | `CANCHAS_DEMO`, `clientes`, `PRODUCTOS_DEMO`, `config.tarifas` |
| **Asignación** | Reserva = cancha × horario × titular (+ jugadores) | `crearReserva` — nunca "todas las canchas para todos" |
| **Recurrencia** | Turnos fijos semanales, liberación puntual | `crearFijo`, `materializarFijos` (idempotente), `liberarFijo` |
| **Ciclo de vida** | reservada → en juego → terminada · cancelada · no-show | `reservada → en_cancha → finalizada` · `cancelada` · `no_show` · `suspendida` (lluvia) |
| **Reglas** | Ventana de cancelación, seña, tolerancia, precio dinámico por franja, descuento socio | `config.politica` + `precioTurno` (integra minuto a minuto valle/pico, finde = pico) |
| **Plata** | Pago integrado, monedero, reembolso al monedero, pago por jugador | `registrarPago` (5 medios), `dividir` (exacto), saldo a favor, caja con arqueo |
| **Automatización** | Luz según reserva, acceso por código | Luz ↔ turno en juego (prende al dar la cancha, apaga al cerrar, alerta si queda prendida) |
| **Roles** | Admin/recepción, jugador por app | **Recepción** (operación) y **Dueño** (control); el jugador sigue por WhatsApp + vidriera |
| **Métricas** | Ocupación, ingresos, BI | `kpis` (ocupación pico/valle, facturado vs. cobrado, ticket, no-shows, stock valorizado, deuda/saldo a favor) + `mapaDeCalor` |

---

## 3. Esencia vs. accidente — qué se adapta a la Argentina

| Es esencia del rubro (va tal cual) | Es accidente de su mercado (se reemplaza) | Equivalente argentino |
|---|---|---|
| Grilla cancha × hora sin doble reserva | Pago 100 % con tarjeta en la app | **Seña** por transferencia o **Mercado Pago (QR)**, saldo en efectivo en el mostrador |
| Ventana de cancelación + monedero | App propia como canal | **WhatsApp**: cada acción genera el mensaje listo para mandar |
| Precio por franja (valle/pico) | Clubes mayormente techados | **Plan lluvia** para la descubierta (mover a techada o suspender con crédito) |
| Turnos fijos | Red eléctrica estable | **Corte de luz**: crédito proporcional por el tiempo no jugado |
| Pago por jugador | IVA europeo, SEPA | Facturación ARCA vía plugin del ERP **cuando haya venta** (en demo: N/A) |
| Luz atada a la reserva | Precios estables | **Precios editables por el dueño en vivo** (inflación), sin tocar código |

---

## 4. Matriz de eventualidades

Cada fila tiene regla, función del motor y test (`src/tenants/breakpoint/motor-club.test.ts`).

| # | Eventualidad | Regla | Qué ve la recepcionista | Motor | Test |
|---|---|---|---|---|---|
| 1 | Dos reservas para el mismo hueco | Rechazo con el nombre de quién lo tiene | "Se pisa con Ana (20:00–21:30)" | `validarHueco` | ✔ |
| 2 | Fuera de horario / fuera de grilla / cancha en mantenimiento / horario pasado | Rechazo con motivo | Mensaje en criollo | `validarHueco`, `crearReserva` | ✔ |
| 3 | Turno que cruza la medianoche (cierre 01:00) | Se permite hasta el cierre | Grilla hasta 01:00 | `config.cierre = 1500` | ✔ |
| 4 | Cliente con faltas, con deuda, o sin ficha | **Seña obligatoria** (50 %) | Chip "Falta seña" + alerta 3 h antes | `requiereSena` | ✔ |
| 5 | Llega sin pagar la seña | No se entrega la cancha | "Falta la seña: cobrala antes de dar la cancha" | `checkIn` | ✔ |
| 5b | Llegan muy temprano, o la cancha sigue ocupada por el turno anterior | La cancha se da desde 30′ antes y sólo si está libre | "Sigue ocupada por…: cerrá ese turno primero" | `checkIn` | ✔ |
| 6 | Pagan los cuatro por separado | Partes que suman exacto; no se cobra de más | Botón "Cobrar $X" por jugador | `dividir`, `registrarPago` | ✔ |
| 7 | Paga con saldo a favor | Descuenta del monedero, **no** entra a caja | Medio "Saldo a favor ($…)" | `registrarPago` | ✔ |
| 8 | Cancela con tiempo (≥ 12 h, editable) | Lo pagado vuelve como saldo a favor; **sin ficha**, queda anotada la devolución y sale de caja al registrarla | Toast con el monto · alerta "Hay que devolverle…" | `cancelar`, `marcarDevuelto` | ✔ |
| 9 | Cancela tarde | **Seña en suspenso**: si el hueco se vuelve a vender, se libera sola | "Seña en suspenso hasta que se venda el hueco" | `cancelar` + `liberarSenasPorRelleno` | ✔ |
| 10 | No vino (pasada la tolerancia de 15 min, controlada por el motor) | Suma falta, libera cancha, devuelve lo alquilado, ofrece a lista de espera | Alerta urgente + "Se liberó un hueco" | `marcarNoShow`, `ofertasEspera` | ✔ |
| 11 | Lista de espera | Primero que encaje (día, franja, techada) | "Hay lugar para Daniela: Cancha 2 21:00" | `anotarEspera`, `asignarDesdeEspera` | ✔ |
| 12 | Lluvia sobre la descubierta | Mover a techada libre; si no hay: **antes de empezar**, suspender y acreditar lo pagado (sin ficha: devolución anotada); **ya jugando**, misma regla que el corte (sólo lo no jugado; bebidas y alquiler se cobran) | Lista de afectados con WhatsApp de cada uno | `planLluvia` | ✔ |
| 13 | Corte de luz / lesión en pleno partido | Crédito proporcional al tiempo no jugado; una sola vez y nunca con 0′ jugados | "Se reconocen $14.000 por 30′ sin jugar" | `interrumpir` | ✔ |
| 14 | Quieren seguir jugando | Extender sólo si el hueco siguiente está libre; cobra la diferencia | "Extendido 30′ (+$…)" | `extender` | ✔ |
| 15 | Hay que cambiarlos de cancha | Mover sin perder pagos ni consumos | Selector de cancha | `mover` | (vía 12) ✔ |
| 16 | Se quieren ir con saldo | No se cierra; o se deja **a cuenta** (deuda visible + seña obligatoria la próxima) | Alerta "terminó y debe $…" | `finalizar` | ✔ |
| 17 | Alquiler de palas | Va a la cuenta del turno y **vuelve al stock** al cerrar | "(2 en cancha)" en stock | `agregarConsumo`, `devolverAlquileres` | ✔ |
| 18 | "Esta semana no venimos" (turno fijo) | Libera sólo esa fecha; el fijo sigue | Botón en el turno | `liberarFijo` | ✔ |
| 19 | Mantenimiento / torneo / evento | Bloqueo que **no pisa** turnos existentes | Franja rayada "Bloqueada" | `bloquear` | ✔ |
| 20 | Luz prendida sin turno en juego | Alerta | "Luz prendida en Cancha 3 sin turno" + Apagar | `alertas` | ✔ |
| 21 | Stock bajo el mínimo | Alerta + pedido al proveedor por WhatsApp | Dueño: "Pedir lo que falta" | `alertas`, `mensajeWhatsApp("reposicion")` | ✔ |
| 22 | La caja no cuadra | Arqueo con diferencia explícita, visible al dueño | Cierre con "Diferencia −$…" | `cerrarCaja` | ✔ |
| 23 | Venta de mostrador sin turno | Baja stock y entra a caja; el alquiler no se vende suelto; "saldo a favor" no es medio de mostrador | "Venta cobrada" | `ventaMostrador` | ✔ |
| 24 | Saldan una deuda vieja | Entra a caja por el medio elegido | Clientes → "Cobró" | `cobrarDeuda` | ✔ |
| 25 | El dueño pone una regla absurda (seña 500 %) | Topes por regla | "Tiene que ser entre 0 y 100" | `ajustarPolitica` | ✔ |

**Fuera de alcance de esta pasada** (con el porqué): reembolso a tarjeta (en demo no hay pasarela real; con
venta, plugin `mercadopago`) · partido abierto con inscripción por app (hoy se arma desde recepción como turno
tipo "Partido abierto"; la app de jugador es otra fase) · niveles/ranking (el nivel se registra, no se calcula).

---

## 5. Innovaciones (lo que ningún referente revisado resuelve así)

| Innovación | Valor en una línea |
|---|---|
| **Bandeja "Para resolver ahora"** ordenada por urgencia, con la acción en un toque | La recepcionista deja de descubrir los problemas mirando la grilla: el sistema se los trae. |
| **Seña en suspenso por relleno** | Cancelar tarde deja de ser una pelea: si el club vendió el hueco, el cliente recupera su seña solo. |
| **Plan lluvia de un toque** (mover a techada o suspender con crédito + WhatsApp de cada uno) | Una noche de lluvia se resuelve en un minuto, no en veinte llamadas. |
| **Corte de luz con crédito proporcional** | Una eventualidad argentina con regla clara en vez de discusión. |
| **Cámara ↔ turno ↔ saldo** | El dueño ve la cancha **y** quién está jugando **y** cuánto debe, en el mismo cuadro. |
| **Luz ↔ turno en juego** | Plata que se va por el medidor queda a la vista (alerta de luz sin turno). |
| **Cuenta de la cancha** (bar + shop + alquileres en el turno) | Se cobra todo junto y lo alquilado vuelve al stock solo. |
| **Reglas en vivo** (horas de cancelación, seña, tolerancia, precios) | El dueño ajusta por inflación o por temporada sin pedir un cambio de sistema. |
| **Reloj de la demo** (±30′) | En la presentación se adelanta el tiempo y se ven aparecer las eventualidades. |

---

## 6. Las dos vistas

**Recepción** (operación, una sola pantalla):
- Grilla cancha × hora (08:00–01:00, cada 30′) con línea de "ahora", huecos libres tocables, colores por estado
  y por tipo (fijo, clase, partido abierto) y borde rojo en lo que necesita atención.
- Bandeja de eventualidades a la derecha (abajo en el celular) y caja de hoy por medio de pago.
- Detalle del turno: cuenta de la cancha, jugadores con cobro individual, medios de pago, dar la cancha,
  mover/extender, no vino, cancelar, corte de luz, cerrar o dejar a cuenta, WhatsApp.
- Acciones de barra: nuevo turno (sólo ofrece horarios libres, muestra precio y si corresponde seña), venta de
  mostrador, lista de espera, plan lluvia, bloquear cancha, clientes (deuda, faltas, saldo a favor).

**Dueño** (control):
- Indicadores: ocupación (pico/valle), facturado, cobrado vs. por cobrar, consumos, no-shows, stock valorizado, deuda.
- **Cámaras** (4 canchas + recepción + bar + estacionamiento) con el turno y el saldo sobreimpresos; ampliables.
- **Canchas ahora**: quién juega, cuánto falta, si debe; luz prendida sin turno.
- **Mapa de calor** de la semana (dónde sobran horas para promos de valle, clases, escuelita) + tabla accesible.
- Plata por medio y **cierres de caja** con diferencia; **stock** con ingreso de mercadería y pedido por WhatsApp;
  **reglas del club** editables; **qué pasó hoy** (registro de actividad).

---

## 7. Camino a producción (cuando haya venta) — reversible vs. §C (ADR-048)

| Paso | Tipo | Nota |
|---|---|---|
| Módulo `canchas` en el ERP: motor portado a `src/modules`, UI en `/admin` con RBAC (recepción/dueño) | Reversible (detrás de flag) | El motor ya es puro y testeado: se porta, no se reescribe. |
| Modelos `Cancha`, `Reserva`, `TurnoFijo`, `ListaEspera`, `Bloqueo`, `MovimientoCaja` con `tenantId` y RLS | **§C · Gate 2** | Migración aditiva propuesta por Data/DBA; la aplica el dueño. |
| Seña por Mercado Pago (link/QR) | **§C · credenciales** | Plugin `mercadopago` existente; las credenciales las pega el dueño (FASE 2). |
| Facturación electrónica | **§C** | Plugin `arca` existente. |
| Cámaras | **§C · seguridad** | La grabadora (NVR) del club **nunca** se expone a internet: un puente en el club (p. ej. go2rtc) publica WebRTC autenticado; credenciales del NVR sólo en el club. Revisión de Seguridad (Facu) antes de activar. |
| Luces / acceso | Opcional, **§C · gasto** | Relé IoT por cancha atado al turno en juego; sólo si el club lo compra. |
| Publicar en `breakpoint-erp.vercel.app` | **Gate 1** | Plan de reconversión (`docs/PLAN-RECONVERSION-CLIENTES.md` §4): esta demo es la candidata a "demo del flujo". |

---

## 8. Gate de Excelencia — autoevaluación de la pasada

1. **SAP Fiori + ángulo argentino:** rol-based (Recepción/Dueño) ✔ · coherente (mismos chips y estados en
   grilla, detalle y bandeja) ✔ · simple (acción principal en un toque, sólo horarios libres en el alta) ✔ ·
   adaptable (390 px sin scroll horizontal, claro/oscuro, marca del club) ✔ · delightful (reloj de demo,
   cámaras) ✔ · accesibilidad (labels reales, `aria-label` en cada hueco y turno, foco visible, estado por texto
   y no sólo color, tabla alternativa del mapa de calor, `prefers-reduced-motion`) ✔ · consistencia (reusa la
   identidad de la preventa) ✔ · 🇦🇷 criollo, Mercado Pago/transferencia, WhatsApp-first, ARCA anotado para la
   fase real ✔.
2. **Sello GSG:** `meta generator="Gestión Studio Grow"` + crédito discreto en el pie del backoffice ✔; doc firmado ✔.
3. **Arquitectura:** motor puro separado de la UI, 18 tests, objeto/asignación (ADR-055), multi-tenant
   **N/A en demo** (sin DB) — el modelo propuesto lleva `tenantId` + RLS (§7).
4. **Confiabilidad:** tests verdes; recorrido Playwright escritorio + celular, claro + oscuro, **cero errores
   de consola**; no toca prod, ni schema, ni deploy.

**Gate de Excelencia corrido (Auditoría GSG, 2026-10-14): APROBADO CON OBSERVACIONES, sin bloqueantes.**
Corregido en la misma pasada (28 tests): plan lluvia que devolvía de más con el turno en juego; dar la cancha
a cualquier hora o con la cancha ocupada; `$ NaN` por interrupción con 0′; "saldo a favor" arrastrado como medio
de mostrador/deudas; "no vino" sin tolerancia; cancelación sin ficha que se quedaba la plata sin registro;
alquileres que no volvían al stock al cancelar; indicadores "Facturado/Falta cobrar" engañosos (ahora "Turnos
vendidos" y "Por cobrar de lo que ya se juega"); datos de demo incoherentes; teléfonos con pinta de reales;
errores invisibles dentro de las ventanas (ahora se anuncian adentro); foco de teclado perdido al re-pintar;
reglas sin topes; reglas de negocio que mutaban estado desde la pantalla; cámaras rotuladas "DEMO".
**Pendiente (C1):** `tsc` del archivo de test y `eslint` de los archivos nuevos pasan; el `tsc` + `next build`
**del proyecto completo** no se pudo correr acá (sin `node_modules`): correrlo antes de integrar a `main`.
**Deuda anotada:** el motor vive en `public/` y el test lo importa desde ahí (DX-3); se jubila al portarlo a
`src/modules` (§7).

---

## 9. Provisional a confirmar con el club

- **Logo vectorial oficial** (el club lo tiene): reemplaza la recreación CSS en `index.html`.
- **Autorización registrada** para usar la marca frente al club (ADR-034): no consta en el registro de caso;
  bloqueante **antes de mostrar**, no para construir.
- Cuántas canchas son techadas (la demo asume 3 techadas + 1 descubierta para mostrar el plan lluvia).
- Horario real, duración de turno (90′), precios valle/pico, descuento socio, % de seña, horas de cancelación.
- Cámaras existentes (marca/modelo de la grabadora, cuántas, qué cubren).
- Productos, precios y stock del bar y del shop; proveedores para el pedido por WhatsApp.

## 10. Segunda vuelta — pedido del club (14/10/2026)

El club recorrió la demo y pidió cambios concretos. Todos están en el motor (con test) y en la pantalla.
**Lo que cambió de fondo: la cancha y el buffet son dos cuentas separadas.**

| Pedido del club | Cómo quedó | Motor |
|---|---|---|
| Separar en el mismo turno **cuenta y cancha**; abrir y cerrar la cancha (el juego) sin cerrar la cuenta del buffet | El turno sólo lleva la cancha. Cada jugador tiene su **cuenta de consumo** aparte, que sigue abierta al cerrar la cancha | `finalizar`, `abrirCuenta`, `consumoJugador` |
| Abrir el turno **sin límite horario anterior** (configurable) | `minutosAntesParaEntrar` vacío = sin límite (default); el dueño le pone minutos si quiere | `checkIn`, `ajustarPolitica` |
| Consumos del buffet **abiertos a nivel cliente**; aperturar consumo; gestionar buffet | Pestaña **Buffet**: cuentas abiertas por cliente (una por cliente), «Abrir consumo» sin turno, venta rápida | `abrirCuenta`, `cargarEnCuenta`, `pagarCuenta`, `cerrarCuenta` |
| Sumar a la cuenta de **cada jugador** un producto + **2 opciones** | Se elige el jugador y el producto, y: **«Sumar a su cuenta»** o **«Cobrar ahora»** | `consumoJugador` (`modo: cuenta | cobrar`) |
| **Lupita** de búsqueda en el stock | Buscador por nombre, rubro o código en Stock, Buffet, Clientes, turno y remito | `buscarProductos`, `buscarClientes` |
| **Créditos por cliente** y **novedad de autorización**; **cuenta corriente** con habilitación, **estado de cuenta**, **marca roja**; al cerrar cancha **sumar a cuenta o cobrar** | Créditos = saldo a favor. La cuenta corriente la **pide recepción** y la **autoriza el dueño** (novedad con límite). Ficha con estado de cuenta y saldo corrido. Marca roja ⚠ en grilla, turno, buffet y clientes. Al cerrar la cancha: cobrar o «cerrar y sumar a su cuenta» (si está habilitada y le da el límite) | `solicitarCC`, `resolverCC`, `configurarCC`, `estadoDeCuenta`, `puedeACuenta`, `cobrarDeuda` |
| **Acceso con PIN de 2 dígitos**, otorgamiento **dinámico** | Cambio de usuario con PIN. Quien es nuevo **pide acceso**; el dueño lo otorga con rol y el sistema genera un PIN único (se muestra una vez). Revocar y PIN nuevo, con PIN del dueño | `solicitarAcceso`, `otorgarAcceso`, `revocarAcceso`, `regenerarPin`, `usuarioPorPin` |
| **Rango horario por día** en la agenda principal | «Cambiar horario» en la agenda (dueño) y tabla por día en Ajustes. Avisa qué turnos quedan afuera | `horarioDe`, `ajustarHorario` |
| **De 12 a 12 cerramos caja diaria** | La caja del día va de 12:00 a 12:00; lo de la madrugada es del día que abrió | `diaDeCaja`, `resumenCaja` |
| **PIN para cierre de caja** | El cierre pide el PIN de quien cierra | `cerrarCaja` |
| **Egresos de caja con PIN y concepto** | Egreso en efectivo con concepto obligatorio + PIN | `egresoCaja` |
| **Turno fijo pintado naranja** y sin etiqueta | Bloque naranja, sin chip «Turno fijo» | (pantalla) |
| **Sacar beneficios de socio**; sólo clientes; **ABM de clientes** | Sin socios ni descuentos. Alta (sin duplicar teléfono), edición y baja (sólo sin deuda ni consumos abiertos) | `altaCliente`, `editarCliente`, `bajaCliente` |
| **Cargar proveedores** | ABM de proveedores | `altaProveedor`, `editarProveedor` |
| **Carga de stock con radiofrecuencia** | El remito tiene un campo de **lector**: cada lectura (código + Enter, como hacen los lectores USB/Bluetooth de barras o RF) suma 1. Productos con código | `productoPorCodigo`, `registrarRemito` |
| **Pagan a proveedores con transferencia y efectivo** | Sólo esos dos medios; el efectivo sale del cajón | `pagarProveedor` |
| **Rober y Majo**: pago a proveedores y ver cuenta corriente | Rol dueño: pagos con PIN y cuenta corriente del proveedor | `ccProveedor`, `PERMISOS.duenio` |
| **Recepcionistas: sólo remito y egreso en efectivo** | Rol recepción: puede cargar remitos y egresos en efectivo; no ve proveedores, stock ni ajustes | `PERMISOS.recepcion` |
| **Venta de platos: métrica por plato** para Rober | Tablero: unidades, por día, facturado, margen y participación por plato (7 días). Los platos no llevan stock | `metricasPlatos` |
| **Plataforma de contenido con calendario** | Pestaña **Contenido**: calendario mensual con publicaciones (Instagram post/reel/historia, WhatsApp), estado idea → programado → publicado | `agregarContenido`, `editarContenido`, `contenidoDelMes` |
| **Mantenimiento: quitar los botones en la agenda**; plan lluvia con configurar mantenimiento | Sin 🔧 en la grilla. Un solo lugar, **«Mantenimiento y lluvia»**: canchas en mantenimiento con motivo, bloqueos de horario y plan lluvia | `configurarMantenimiento`, `bloquear`, `quitarBloqueo`, `planLluvia` |
| **Faltas: se cobra el turno entero** al cliente o al grupo | «Falta (no vino)»: cobrar todo al titular o repartir en el grupo (cada jugador con ficha paga su parte; la de los sin ficha, el titular). Va a la cuenta corriente aunque no esté habilitada; sin ficha queda la deuda en el turno. «Sin cargo» sólo el dueño | `marcarNoShow({ cobrarA })`, `cobrarFaltaSinFicha` |

**Notas de criterio (decididas con el supuesto más simple; a confirmar con el club):**
- **PIN de 2 dígitos:** es lo que pidió el club y alcanza para el mostrador (identifica quién hizo qué). Para
  producción con datos reales se recomienda subirlo a 4 dígitos y bloquear tras varios intentos fallidos
  (anotado para la revisión de seguridad de Facu, ADR-068).
- **Cambiar el horario de un día** es del dueño; recepción lo ve pero no lo cambia.
- **Falta repartida en el grupo:** se divide entre los cuatro jugadores del turno; la parte de los que no
  tienen ficha la absorbe el titular.
- **Los PIN de la demo se muestran en pantalla** a propósito (Rober 11 · Majo 22 · Lu 33 · Caro 44).

## Fuentes

- Playtomic Manager — [Open Matches](https://helpmanager.playtomic.com/hc/en-gb/articles/20535035123473-How-to-configure-Open-Matches-at-your-Club) · [Gestión de partidos abiertos](https://helpmanager.playtomic.com/hc/en-gb/articles/20534737902353-How-to-manage-Open-Matches-in-Playtomic-Manager) · [Agenda](https://helpmanager.playtomic.com/hc/en-gb/articles/20560058451985-Schedule-basics) · [Problemas comunes de reservas](https://helpmanager.playtomic.com/hc/en-gb/articles/20534585454097-How-to-Handle-Common-Booking-Issues-A-Quick-Guide-for-Your-Club) · [No-show en partidos abiertos](https://helpmanager.playtomic.com/hc/en-gb/articles/50702064570513-No-Show-Policy-for-Open-Matches-what-clubs-need-to-know) · [FAQ jugadores](https://help.playtomic.com/en/articles/6817211-faq-players-playtomic)
- MATCHi — [Acerca de](https://www.matchi.se/about)
- Doinsport — [Ficha Appvizer](https://www.appvizer.fr/loisirs/clubs/doinsport)
- Syltek — [Ficha](https://www.softwaredoit.es/syltek/syltek.html)
- Automatización de acceso y luces — [bookaball](https://bookaball.com/blog-venue-access-automation) · [Kisi](https://www.getkisi.com/blog/entry-systems-for-padel)

— Elaborado por GSG
