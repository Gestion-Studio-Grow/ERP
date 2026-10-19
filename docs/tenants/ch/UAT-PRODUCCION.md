# CH Estética — UAT en producción (Chrome real)

**Negocio:** CH Estética (Carolina Haponiuk) · slug `beauty-spa` · subdominio `chestetica`.
**Cuándo:** después de cada publicación que toque turnos, cobros o caja, y antes de prender un interruptor en CH.
**Dónde:** `https://chestetica-erp.vercel.app` (la URL que hoy sirve CH; si el dueño ya movió el dominio, la que esté
en `TENANT_HOST_MAP`), en Chrome real, en escritorio (1440 px) y con el celular emulado (DevTools → 390 × 844).
**Ensayo previo, sin producción:** `npm run build && npm run test:ch-uat` recorre este mismo guion clic por clic contra
una base Postgres **local** sembrada con datos de demo de CH (nunca Neon). Capturas a 390 y 1440 px en `dist/uat-ch/`.
Cada fila de abajo lleva entre corchetes el id del paso en ese recorrido.

**Reglas (CH es un negocio VIVO, con clientas reales):**
- Es un ambiente real: **nada de lo que ve el negocio puede decir «prueba», «demo» ni «ejemplo»**. Los turnos los da
  **la persona de GSG que corre el UAT, con su propio nombre y su celular**, como una clienta más. Nunca con los
  datos de una clienta real de CH.
- Los turnos de prueba se dan en un hueco **libre de mañana o pasado**, en el box que menos se use, y se cancelan al
  terminar. La plata cobrada se **anula** desde la fila del turno («Anular», con el motivo «Corrección de carga»): así sale
  del libro.
- **El cierre del día NO se ensaya en producción:** cerrar congela el día y no se deshace. En producción sólo se mira la
  pantalla de cierre; el caso «caja que no cuadra» lo prueba el recorrido local (9.2 y 9.3).
- No se toca ninguna configuración de Vercel ni de Neon, ni un interruptor. Las claves de las usuarias no se escriben
  en ningún lado.

Cada paso se marca **OK / FALLA / BLOQUEADO**. Cada falla lleva captura, URL, usuaria, qué se esperaba y qué pasó.
El resultado va al final de este archivo, en «Resultado».

## 0. Publicación y aislamiento

| # | Paso | Esperado |
|---|---|---|
| 0.1 | Abrir `/` a 1440 y a 390 | La vidriera de CH con su marca, sin desplazamiento horizontal. [0.1] |
| 0.2 | Abrir `/admin/login` | El ingreso del panel con el nombre de CH. [0.2] |
| 0.3 | Abrir la vidriera de otro negocio publicado (Break Point, `wpe.gsgapp.com.ar`) | Están como antes: CH no se mezcla con nadie. |

## 1. Matriz de acceso por rol

Entrar con las tres personas. ✔ = la abre; ✘ = el sistema la manda a su inicio. [1.matriz]

| Pantalla | Dueña | Recepción | Profesional |
|---|---|---|---|
| Agenda (`/admin/turnos`) | ✔ | ✔ | ✔ sólo sus turnos |
| Lista y alta de turnos (`/admin/turnos/lista`) | ✔ | ✔ | ✘ |
| Caja del día (`/admin/caja`) | ✔ | ✔ | ✘ |
| Cierre del día (`/admin/caja/cierre`) | ✔ | ✔ | ✘ |
| Reportes, Usuarios, Catálogo | ✔ | ✘ | ✘ |

| Acción | Dueña | Recepción | Profesional |
|---|---|---|---|
| Dar turno, confirmar, reprogramar, cancelar | ✔ | ✔ | ✘ |
| Cobrar seña, parcial o saldo | ✔ | ✔ (menos a quien cobra aparte) | ✔ sólo los suyos |
| Completar y «No se presentó» | ✔ | ✔ | ✔ sólo los suyos |
| Anular un cobro | ✔ | ✔ | ✔ sólo los suyos |
| Dar de baja un saldo | ✔ | ✔ | ✘ |
| Vincular una usuaria Profesional con su ficha (Usuarios) | ✔ | ✘ | ✘ |

## 2. Reserva web de la clienta (celular, 390 px)

| # | Paso | Esperado |
|---|---|---|
| 2.1 | `/reserva` → profesional → servicio → mañana → primer horario → su nombre y su celular → Confirmar turno | «¡Solicitud enviada!» sin desplazamiento horizontal. [2.1] |
| 2.2 | Como recepción: Agenda → Lista | El turno aparece en «Reservados, a confirmar». [2.2] |
| 2.3 | Elegir un horario de hoy que ya pasó (si lo hubiera) | No se ofrece; si se fuerza, «Ese horario ya pasó. Elegí otro horario.» (B5) |

## 3. Alta de turno por teléfono (recepción)

| # | Paso | Esperado |
|---|---|---|
| 3.1 | Lista → «+ Nuevo turno» → profesional → un servicio con seña → mañana → horario → su nombre y celular → Cobrar ahora | Propone «Seña — $…». Elegir Efectivo → «Crear turno». La seña queda cobrada. [3.1] |
| 3.2 | Mirar la fila del turno | «cobrado $… · saldo $…». [3.2] |
| 3.3 | Elegir un servicio con una profesional que no lo hace (forzándolo) | «X no hace Y. Elegí otro profesional para ese servicio.» (B6) |

## 4. Mover

| # | Paso | Esperado |
|---|---|---|
| 4.1 | En la fila → «Reprogramar» → otra fecha → horario → «Confirmar nuevo horario» | El turno cambia de día y conserva la seña. [4.1] |

## 5. Cancelar

| # | Paso | Esperado |
|---|---|---|
| 5.1 | En el turno de la reserva web → «Cancelar turno» | Queda cancelado y el horario vuelve a estar libre en la reserva. [5.1] |

## 6. No vino

| # | Paso | Esperado |
|---|---|---|
| 6.1 | Un turno de prueba confirmado cuya hora ya pasó → «No se presentó» | Queda «No se presentó». [6.1] |
| 6.2 | Un turno de más tarde → «No se presentó» | Lo niega: «Todavía no es la hora del turno…» (arreglo de esta pasada). |
| 6.3 | Un turno Reservado (sin confirmar) cuya hora ya pasó | También ofrece «No se presentó» (antes no tenía salida). |

## 7. Cobro con seña, parcial y saldo; completar

| # | Paso | Esperado |
|---|---|---|
| 7.1 | Turno de prueba confirmado y ya empezado, sin nada cobrado | El cobro sugerido es la seña. «Registrar cobro». [7.1] |
| 7.2 | Otro cobro de $4.000 por Transferencia | «cobrado $9.000 · saldo $6.000» (con un servicio de $15.000 y seña de $5.000). [7.2] |
| 7.3 | «Marcar como completado» con Efectivo | Cobra el saldo y el turno queda saldado. [7.3] |
| 7.4 | Anular los tres cobros del UAT («Anular» → motivo «Corrección de carga» → «Sí, anular») | La plata sale del libro con su egreso. |

## 8. La profesional

| # | Paso | Esperado |
|---|---|---|
| 8.1 | Entrar como la profesional | Ve sólo sus turnos, no los de las demás. [8.1] |
| 8.2 | Completar uno suyo cobrando el saldo | Queda completado. [8.2] |
| 8.3 | Buscar «Cancelar turno» o «Reprogramar» | No están. [8.3] |
| 8.4 | Como dueña: Usuarios → la fila de la profesional | Tiene «Ficha de profesional» con su ficha elegida. Sin ficha ve la agenda vacía. [12.usuarios] |

## 9. Caja del día y cierre

| # | Paso | Esperado |
|---|---|---|
| 9.1 | Caja del día | Los cobros de los turnos aparecen como «Turno · servicio — clienta», sumados por medio. [9.1] |
| 9.2 | Cierre del día: **sólo mirar** (en producción no se cierra para probar) | Cada medio dice «El libro dice $X». El caso «no cuadra» (falta la nota → la pide; con nota → asienta el faltante) lo prueba el recorrido local. [9.2, 9.3] |
| 9.3 | Después del cierre REAL del día (lo hace la dueña al final de la jornada): intentar un cobro de prueba | «La caja del dd/mm ya está cerrada: este cobro no se puede asentar hoy. Registralo el …». Nada entra al libro (arreglo de esta pasada). [10.1] |

## 10. Factura

| # | Paso | Esperado |
|---|---|---|
| 10.1 | Completar un turno | Hoy **N/A**: `ARCA_INVOICING_ENABLED` está apagado en producción (Gate 4). Cuando se prenda: el comprobante sale al completar y, si ARCA lo rechaza, la pantalla lo avisa (B8). [11.1] |

## 11. Agenda práctica (sólo si el dueño prendió el interruptor «agenda-practica» en CH)

Hoy está **apagado en producción**. Se prueba completo en el recorrido local (pasos 12.*).

| # | Paso | Esperado |
|---|---|---|
| 11.1 | Lista → «+ Nuevo turno» sin fecha | Propone mañana; con una sola profesional, viene elegida. [12.T4] |
| 11.2 | «Cancelar turno» de un turno con seña | Dice la consecuencia y pregunta: «Se la queda el negocio» / «Se la devolvemos». [12.T10] |
| 11.3 | Devolver la seña de un cobro de un día ya cerrado | «No se pudo devolver la seña: … El turno no se cambió.» [12.E3a] |
| 11.4 | Retener la seña | Cancela y lo deja en la auditoría; si hay anotadas en la lista de espera para ese servicio, lo avisa. [12.E3b, 12.E6] |
| 11.5 | Un completado → «Reservar el próximo» | Abre el alta con la misma clienta y la fecha de su ciclo. [12.E5] |
| 11.6 | `/reserva` y «Tu turno» (sólo si el negocio cargó su regla en `CANCELACION_ONLINE_HORAS`) | Muestran «Podés cancelar o reprogramar online hasta N h antes del turno…». A menos de N h, cancelar online se niega y pide WhatsApp. Sin regla cargada no se muestra nada. [12.T12, 12.E2] |

## 12. Celular

- A 390 px: Agenda, Lista, Caja, Cierre y la agenda de la profesional sin desplazamiento horizontal. [390.*]
- El crédito de Gestión Studio Grow aparece en el pie del panel y no en la vidriera de CH.

## Limpieza (obligatoria)

Cancelar los turnos del UAT, anular sus cobros con el motivo «Corrección de carga» y anotar en «Resultado» la ficha
que quedó a nombre de quien corrió el UAT (no se borra una ficha con historia). Nada de esto toca días ya cerrados.

## Resultado

**Recorrido local `npm run test:ch-uat` (18/10/2026, rama `claude/ch-nivel-bp`):** ver `docs/tenants/ch/NIVEL-BP.md` §1.

_En producción: lo completa la sesión que corre el UAT con fecha y hora, navegador, una tabla con cada paso y su estado,
y los defectos numerados con captura._

— Elaborado por GSG
