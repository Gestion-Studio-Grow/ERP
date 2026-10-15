# Break Point Pádel — Turnero web del jugador: plan de ejecución

**Fecha:** 2026-10-15 · **Método:** skill `ingenieria-reversa` (pasos 0–5 y 7; el paso 6 lo ejecuta Opus 5.5)
**Etapa comercial:** preventa → **todo es DEMO a costo cero** (sin datos reales, sin persistencia, sin credenciales, sin dominio).
**Construye sobre:** `REINGENIERIA.md` (backoffice del club, 29 tests), `ESTILOS.md` (tokens y 5 estilos), `MARCA-INSTAGRAM.md`
(marca autorizada 15/10; falta la firma en ADR-034), motor `public/previews/breakpoint/club/motor.mjs`.
**Rama:** `ccr-breakpoint-turnero`. **Entregable de Opus:** front estático del jugador + back Node sin dependencias +
extensión del motor + tests + QA Playwright, según este plan.

> **Qué es esto.** El backoffice ya resuelve el mostrador. Esto es **el otro lado**: el jugador que a las 23:00 un
> jueves quiere saber si hay cancha el sábado, la reserva desde el celu, paga la seña por transferencia, manda el
> comprobante por WhatsApp y recibe la confirmación **sin bajarse una app ni crear una cuenta con contraseña si no
> quiere**. Y lo que reserva se ve **en la misma grilla** que usa la recepcionista, al instante.

> **Frontera de honestidad.** Sólo fuentes públicas (centros de ayuda, sitios comerciales, reseñas). Cada afirmación
> lleva URL; lo que no se pudo verificar dice **[INFERIDO]**. No se copia código, marca, textos ni diseño de terceros.
> Desde este entorno **no se pudieron abrir** las páginas de ayuda ni las tiendas de apps (DNS bloqueado): las citas
> salen de los extractos de búsqueda, que traen la URL. Opus puede re-verificar las que use en pantalla.

---

## 1. Principios de la pasada y zona de de-sesgo (ADR-046 / ADR-052)

1. **Una sola verdad del hueco.** Mostrador, teléfono, WhatsApp y web escriben en el **mismo estado** por el **mismo
   motor**; el turnero no es "otro calendario que después se sincroniza". Es la causa raíz de la mitad de los dolores
   relevados (§4) y de DB-4.
2. **Cero fricción para reservar, fricción sólo para pagar.** Ver disponibilidad y precio: sin login. Reservar: con
   Google, con usuario/contraseña o (post-venta) con un código por WhatsApp. **Nunca** "bajate la app".
3. **La seña es argentina:** transferencia o Mercado Pago, comprobante por WhatsApp, y el sistema concilia. Dos niveles
   de verdad, dichos con todas las letras: *pre-confirmado por comprobante* ≠ *acreditado contra el movimiento real*.
4. **El motor es el dominio y vive una sola vez.** El back lo importa; el front no sabe reglas (sólo pinta lo que le
   dan). Toda regla nueva (hold, comprobante, conciliación) entra al motor **con test**, nunca al front ni al router.
5. **Demo a costo cero, honesta:** adaptadores simulados (WhatsApp, Google, OCR) que **dicen en pantalla** que son
   simulación; credenciales reales las pega el dueño después de la venta (FASE 2).

**Zona de de-sesgo:** motor, contrato de API, seguridad, tests = **estándar/preciso**. Textos del turnero, mensajes
de WhatsApp, errores que lee el jugador = **humano/criollo** ("Te guardamos la cancha 15 minutos", "Falta la seña",
"Llovió: te movimos a la techada"). Los errores de API llevan `codigo` estable (estándar) **y** `motivo` criollo.

---

## 2. Referentes y ficha comparativa (Paso 1 y 2 de la skill) — lado jugador

| Referente | Rol en el rubro | Qué define del lado jugador | Fuente |
|---|---|---|---|
| **Playtomic** (Syltek, ES) | Líder europeo | Reserva y pago en app; pago dividido con tarjeta en archivo o pre-autorización; monedero del club; política por club; fee de servicio al jugador; sin lista de espera (sólo avisos Premium) | [Dividir el pago](https://playerhelp.playtomic.com/hc/en-gb/articles/19832089052561-How-to-split-the-payment-of-a-reservation) · [Pagos pendientes y deudas](https://playerhelp.playtomic.com/hc/en-gb/articles/19831869050769-Pending-Payments-and-charges) · [Reembolsos](https://playerhelp.playtomic.com/hc/en-gb/articles/19832175736593-Refunds-and-when-you-will-receive-your-money) · [FAQ jugadores](https://playerhelp.playtomic.com/hc/en-gb/articles/19831519179281-FAQ-Players-Playtomic) · [No-show](https://playerhelp.playtomic.com/hc/en-gb/articles/43240624037393-What-happens-if-a-player-doesn-t-show-up) · [Card on File](https://helpmanager.playtomic.com/hc/en-gb/articles/46647891110673-Card-on-File-CoF-your-guarantee-for-split-payment-bookings) |
| **MATCHi** (SE) | Retador nórdico | Cancelación desde la app o desde un **link del mail recordatorio sin login (un solo uso)**; cada club fija su política; fee por cancelación; reembolso al mismo medio; tarjetas de "punches" como saldo | [¿Cómo cancelo?](https://matchiplayers.zendesk.com/hc/en-gb/articles/11451781340061-How-do-I-cancel-a-booking) · [Reservé mal la hora](https://matchiplayers.zendesk.com/hc/en-gb/articles/21837564144413-I-booked-the-wrong-time-what-should-I-do) · [Cancelar/reembolsar (admin)](https://matchi.zendesk.com/hc/en-gb/articles/11673921738013-Cancel-and-or-refund-booking) |
| **TPC Matchpoint** (ES) | Gestión pura con app de marca blanca por club | App/web con la marca del club; partidos abiertos; precios por franja y días especiales; bonos/saldo monedero; pagos online con proveedor aparte | [Software clubes pádel](https://tpcmatchpoint.com/software-gestion-clubs-padel.html) · [EN](https://tpcmatchpoint.com/en/padel-club-management-software.html) |
| **Doinsport** (FR) | Caja + pro-shop + acceso físico | App para organizar partidos y buscar jugadores; pago con tarjeta, créditos o monedero virtual (entrevista 2020) | [Les Pépites Tech](https://lespepitestech.com/blog/2020/09/29/87-interview-des-pepites-doinsport?page=71) |
| **Padel Manager** (ES) | Torneos/ranking, reserva según región | Fuerte en torneos y ranking; las fuentes se contradicen sobre si reserva canchas → **[INFERIDO]** que la reserva no es su núcleo | [Clupik](https://clupik.com/blog/apps-jugadores-clubes-padel/) · [Superprof](https://www.superprof.es/blog/mejores-apps-padel/) |
| **ATC Sports / AlquilaTuCancha** (AR) | Líder local | Reserva con o sin seña según el club; **tarjeta en garantía** (se debita sólo si no van); porcentaje de adelanto y política de cancelación **por club**; SaaS mensual + comisión por transacción online | [Infonegocios](https://infonegocios.info/enfoque/se-cansaron-de-llamar-a-cada-club-para-poder-alquilar-una-cancha-y-crearon-una-app-asi-es-alquilatucancha) · [One pager (Cancillería)](https://www.cancilleria.gob.ar/userfiles/ut/2025-05_-_one_pager_atc.pdf) · [Google Play 4.7 / ~374 reseñas](https://play.google.com/store/apps/details?id=com.alquilatucancha&hl=en) |
| **Easycancha** (CL→LatAm) | Contraste de modelo | **Cuota fija mensual al club, sin comisión por reserva**; pago online en la app; geolocalización | [Forbes CO](https://forbes.co/2025/11/06/negocios/esta-plataforma-mueve-us25-millones-al-mes-con-reservas-de-canchas-deportivas/) · [Pauta](https://www.pauta.cl/ciudad/2023/07/21/easycancha-start-up-encontrar-cancha-deportes-40-disciplinas-app.html) |
| **Turneros por WhatsApp (AR)** — GTP, Reservalo, Partido, CourtOps | Lo que hace el mercado chico argentino | Seña 25–50 % por transferencia/MP; el bot manda el alias y **concilia con la reserva**; "el pago lo maneja el complejo" | [GTP](https://www.gestionatupadel.com/) · [Reservalo](https://reservalo.ar/san-juan/canchas-padel) · [Partido glosario](https://partido.ar/glosario) · [CourtOps](https://www.courtops.net/) · [Turnero](https://www.turneroapps.com.ar/) |

### Ficha comparativa (Paso 2) — sólo lo que ve el jugador

| Capa | Playtomic | MATCHi | ATC (AR) | WhatsApp-bots (AR) | **Break Point (este plan)** |
|---|---|---|---|---|---|
| **Objetos** | Club, cancha, jugador con nivel, tarjeta guardada | Club, cancha, cuenta, "punch card" | Club, cancha, jugador, tarjeta en garantía | Cancha, teléfono | Cancha, cliente (= ficha del backoffice), **identidad web** ligada a la ficha por teléfono |
| **Asignación** | Reserva = cancha × horario × dueño (+ invitados con parte) | Reserva = cancha × horario × quien reservó | Reserva = cancha × horario × jugador | Reserva = cancha × horario × teléfono | `crearReserva` existente + **hold** previo (cancha × horario × identidad, con vencimiento) |
| **Ciclo de vida** | pendiente de pago → confirmada → jugada / cancelada / deuda | reservada → cancelada (link de un uso) | reservada (con o sin seña) → jugada / debitada | "reservado, mandá el comprobante" | **`pendiente` (hold 15′) → `reservada` (seña pendiente) → comprobante recibido → `reservada` seña pagada → `en_cancha` → `finalizada`**; `cancelada` / `no_show` / `suspendida` (lluvia) ya existen |
| **Reglas** | Política **por club**; fee no reembolsable; 24 h en partidos abiertos | Política **por club**, fee por cancelación | Adelanto % y cancelación **por club** | Seña % por club | `config.politica` editable: `horasCancelacionLibre`, `senaPct`, `strikesParaSena`, `toleranciaMin`, `minutosAvisoSena` + nuevas `minutosHold`, `minutosParaSena` |
| **Plata** | Tarjeta; monedero del club (reembolso instantáneo); deuda al dueño de la reserva | Tarjeta; reembolso al mismo medio; punches | Tarjeta en garantía; MP | Transferencia/MP + comprobante | **Transferencia o MP + comprobante por WhatsApp conciliado**; saldo a favor (`monedero`) ya existe; efectivo en el mostrador |
| **Automatización** | Avisos de app; cobro automático 2 h después del partido | Mail recordatorio con link de cancelar | Débito por no-show | Bot | **SSE** (disponibilidad en vivo), vencimiento de holds, conciliación, WhatsApp listo (demo: simulado) |
| **Métricas del jugador** | Nivel, historial | Historial | Historial | — | "Mis turnos": próximos, pasados, saldo a favor, faltas (lo que ya guarda la ficha) |

---

## 3. Esencia vs. accidente y checklist de argentinización (Paso 3, ADR-044)

| Esencia (todos lo hacen igual → va tal cual) | Accidente de su mercado (se reemplaza) | Equivalente Break Point |
|---|---|---|
| Grilla pública cancha × horario con precio visible antes de elegir | Tarjeta universal + pre-autorización bancaria | **Seña por transferencia/MP con comprobante**; tarjeta sólo post-venta vía plugin `mercadopago` |
| Hueco "tomado" mientras se paga (pre-auth / asignación temporal) | Hold por tarjeta | **Hold de 15′ sin plata** (`minutosHold`) + ventana para la seña (`minutosParaSena`) |
| Política de cancelación publicada, por club | Fee de servicio al jugador | **Sin fee al jugador**; la regla del club se muestra **antes** de reservar |
| Reembolso al monedero del club (instantáneo) | Reembolso a tarjeta 2–15 días hábiles | Saldo a favor en la ficha (ya existe) |
| Recordatorio con acción (cancelar sin login) | App propia obligatoria | **Web + WhatsApp**; link de cancelación firmado y de un uso |
| Pago dividido / deuda del dueño | Cobro automático a tarjeta guardada 2 h después | Partes exactas (`dividir`) y falta cobrada al titular/grupo (ya existe); **nada automático contra tarjeta** |

**Checklist de argentinización (respuesta explícita):**
- **¿Cómo se señala/paga?** Transferencia al alias del club o Mercado Pago (QR/link post-venta); efectivo en el club; nunca sólo tarjeta. El alias/CBU **no se hardcodea**: viene de `config` del club (post-venta lo carga el dueño; en demo un alias ficticio rotulado "DEMO").
- **¿Por dónde se habla?** WhatsApp. El comprobante se manda al WhatsApp del club; la confirmación vuelve por WhatsApp (demo: simulado en pantalla). Cero `wa.me/<número de ejemplo>` (DX-4): en demo `wa.me/?text=`; el número real sale de un **helper único** cuando el dueño lo cargue.
- **¿Lluvia?** El plan lluvia del backoffice (`planLluvia`) **avisa al jugador** por SSE + WhatsApp: "te movimos a la techada" o "suspendido, te queda crédito". El turnero muestra qué canchas son descubiertas **antes** de elegir.
- **¿Inflación?** Precios y % de seña editables por el dueño en vivo (`ajustarPolitica`, tarifas); el turnero **siempre** pide el precio al back (nunca lo cachea más de la sesión SSE).
- **¿Facturación?** N/A en demo; plugin `arca` del ERP con venta.
- **¿Cero app obligatoria?** Sí: web estática, mobile-first, sin login para mirar; login liviano para reservar.
- **¿Criollo?** Todo texto del jugador en voz de barrio (como la bio de Instagram: "RESERVAS DE CANCHAS 📞"). Sin "slots", sin "checkout", sin "booking".

---

## 4. Puntos de dolor → solución concreta en Break Point

| # | Dolor (lado jugador) | Evidencia (URL) | Cómo lo resuelve el turnero | Función del motor / back | Test que lo prueba |
|---|---|---|---|---|---|
| 1 | **Doble reserva / overbooking** (dos canales, "chequear y después insertar") | Lección interna [DB-4](../../../brain/20-lecciones/DB-4-doble-reserva-overbooking-toctou.md) · causas típicas por canal/sync en [Moder](https://support.moder.fi/support/solutions/articles/101000562671-overbooking-and-double-booking-the-most-common-causes-and-how-to-handle-them) y [Sirvoy](https://help.sirvoy.com/en_US/avoid-and-resolve-overbookings) (hotelería; el patrón es el mismo) | Un solo estado, un solo motor; en demo las mutaciones se aplican **sincrónicas** en el event loop (ningún `await` entre validar y escribir); en prod `EXCLUDE USING gist` (Gate 2) | `validarHueco`, `crearHold` (nuevo), `aplicarComando` (back) | `turnero.concurrencia.test`: 50 `POST /holds` al mismo hueco en `Promise.all` → **exactamente 1** `ok` |
| 2 | **Hold mientras pago** (me tomó la plata o perdí el hueco mientras transfería) | Playtomic congela el total con pre-autorización en IT/UK/PT/NO ([CoF](https://helpmanager.playtomic.com/hc/en-gb/articles/46647891110673-Card-on-File-CoF-your-guarantee-for-split-payment-bookings)); guía municipal FR: "terrain alloué temporairement pendant la division du paiement" ([Thorigné-Fouillard](https://www.ville-thorigne-fouillard.fr/wp-content/uploads/2025/12/Guide-SportFinder.pdf)) | **Hold de 15′ sin plata** que ocupa el hueco (`OCUPA` incluye `pendiente`); cuenta regresiva visible; al confirmar pasa a `reservada` con `sena.pagada=false` y una ventana de `minutosParaSena` (default 180 = `minutosAvisoSena`) | `crearHold`, `confirmarHold`, `vencerHolds` (nuevos) | hold ocupa el hueco · vence a los 15′ y el hueco vuelve a la lista de espera · confirmar un hold vencido falla con motivo |
| 3 | **Seña y reembolso lentos / negados** | Reembolso a tarjeta "2–15 días hábiles", al monedero "instantáneo" ([Refunds](https://playerhelp.playtomic.com/hc/en-gb/articles/19832175736593-Refunds-and-when-you-will-receive-your-money)); reseñas Trustpilot con reembolsos negados por "cancelaste a menos de 24 h" sin haber cancelado ([UK Trustpilot](https://uk.trustpilot.com/review/www.playtomic.io)) | Cancelación a tiempo → **saldo a favor al instante** visible en "Mis turnos"; tardía → "seña en suspenso: si vendemos el hueco te la devolvemos sola" (ya existe) | `cancelar`, `liberarSenasPorRelleno` (existen) + `cancelarPorCliente` (nuevo: valida que quien cancela es el titular) | ya cubiertos (REINGENIERIA #8, #9) + nuevo: un tercero no puede cancelar tu turno |
| 4 | **Comisiones al jugador/club** | Fee de servicio no reembolsable y comisión no publicada ([youarepadel](https://youarepadel.com/en/playtomic-reviews-alternatives), [Doinsport blog](https://doinsport.com/en/blog/alternative-to-playtomic-which-management-software-to-choose-for-your-padel-club)); "Premium… avoid additional court booking fees" ([App Store](https://apps.apple.com/us/app/playtomic/id1242321076?see-all=reviews)); Easycancha cobra cuota fija ([Forbes](https://forbes.co/2025/11/06/negocios/esta-plataforma-mueve-us25-millones-al-mes-con-reservas-de-canchas-deportivas/)) | **Sin fee al jugador**: el precio que ve es el que paga. El club paga el ERP, no por reserva | `precioTurno` (existe) | el precio del hold == `precioTurno` sin recargo |
| 5 | **Políticas de cancelación confusas o contradictorias** | Reseña: "cancellation terms contradict each other on the same booking" ([App Store PT](https://apps.apple.com/pt/app/playtomic-play-padel/id1242321076)); cada club fija la suya ([MATCHi](https://matchiplayers.zendesk.com/hc/en-gb/articles/11451781340061-How-do-I-cancel-a-booking)) | **Una sola frase** antes de confirmar: "Cancelás gratis hasta 12 h antes (sáb 08:00). Después, la seña queda en suspenso…", calculada con la fecha real del turno | `politicaParaReserva` (nuevo, puro: devuelve `{ limiteCancelacion, senaPct, textoCriollo }`) | el texto cambia cuando el dueño cambia `horasCancelacionLibre` |
| 6 | **Lista de espera inexistente** | Playtomic no la tiene (sólo avisos Premium) ([App Store](https://apps.apple.com/app/1242321076)); CourtReserve sí, "first come, first serve" ([CourtReserve](https://help.courtreserve.com/en/articles/7235129-court-waitlisting)) | "No hay a esa hora: ¿te anotamos? Si se libera te avisamos por WhatsApp" — desde el turnero, sin pedir nada más que el teléfono | `anotarEspera`, `ofertasEspera` (existen) + evento SSE `espera_oferta` | cancelar/no-show/hold vencido generan oferta a la persona en espera |
| 7 | **Partido incompleto / dividir el pago / deuda al que reservó** | El dueño de la reserva carga con lo que no pagan los invitados; el club tiene que "marcar como pagado" o se cobra igual ([Pending payments](https://playerhelp.playtomic.com/hc/en-gb/articles/19831869050769-Pending-Payments-and-charges)); fee de 25p por jugador en MATCHi split ([Hove Beach Park](https://clubspark.lta.org.uk/hovebeachparktennis/COURTBOOKINGS)) | El turnero **no divide plata online** (fuera de alcance de demo): muestra "la seña la pone el titular; el resto se paga en el club, cada uno lo suyo" y el link para invitar a los otros 3 (WhatsApp). Partes exactas en el mostrador ya existen | `dividir`, `registrarPago` (existen); `invitarJugadores` (nuevo, sólo genera el texto) | partes suman exacto (existe) |
| 8 | **Lluvia en cancha descubierta** | "It is up to the clubs to decide whether or not to cancel" ([FAQ](https://playerhelp.playtomic.com/hc/en-gb/articles/19831519179281-FAQ-Players-Playtomic)); club UK: lluvia sin reembolso ni reprogramación ([Padel Yard](https://www.matchi.se/facilities/g4pthepadelyard)) | Antes de elegir: ícono "descubierta" + "si llueve te movemos a techada o te queda crédito". Cuando el club activa el plan lluvia, el jugador ve el cambio en vivo y recibe el WhatsApp | `planLluvia` (existe) + SSE `reserva_cambio` | plan lluvia emite un evento por afectado con `accion` movido/suspendido/cortado |
| 9 | **Login pesado / "bajate la app" / pide el teléfono para todo** | "All Park Padel bookings happen through the Playtomic app… Register a mobile phone number (required)" ([Park Padel](https://parkpadel.com/download-app)); 3 pasos para ver un precio ([Courtside](https://mwm.ai/apps/courtside-padel-app/6737027746)) | Mirar y elegir: **sin login**. Al confirmar: Google (1 toque) o usuario/contraseña; teléfono se pide una vez (es la llave con la ficha del club y con el comprobante) | `sesiones.mjs`, `auth/google.mjs`, `auth/password.mjs` (back) | E2E: llegar al hold sin sesión; confirmar pide login; con sesión, 2 toques |
| 10 | **Lentitud en el celu** | **[INFERIDO]** (no hallamos reseñas que lo digan con esas palabras; sí el reclamo de pasos de más). Regla propia: presupuesto de performance | Front vanilla, sin framework: **< 60 KB JS gz**, LCP < 1,5 s en 4G, CLS 0; disponibilidad en una sola llamada por día; SSE en vez de polling | `GET /api/turnero/disponibilidad` devuelve el día entero precalculado | test de tamaño (gzip de los `.mjs` < 60 KB) + Playwright con throttling 4G midiendo LCP |
| 11 | **Horarios y precios confusos (pico/valle)** | Precios por franja y días especiales en Matchpoint ([TPC](https://tpcmatchpoint.com/en/padel-club-management-software.html)); reseña: fee ~5 % que no se entiende ([App Store PT](https://apps.apple.com/pt/app/playtomic-play-padel/id1242321076)) **[INFERIDO el porcentaje]** | Cada hueco muestra **el precio final del turno** (integrado minuto a minuto, finde = pico) y la seña que corresponde; leyenda valle/pico | `precioTurno`, `franjaDe`, `requiereSena` (existen) | precio de 17:00–18:30 = 30′ valle + 60′ pico (existe) |
| 12 | **No-shows** | Playtomic: reporte sólo por asistentes; pago con crédito del monedero no se devuelve ([No-show](https://playerhelp.playtomic.com/hc/en-gb/articles/43240624037393-What-happens-if-a-player-doesn-t-show-up)); ATC: tarjeta en garantía que se debita si no van ([Infonegocios](https://infonegocios.info/enfoque/se-cansaron-de-llamar-a-cada-club-para-poder-alquilar-una-cancha-y-crearon-una-app-asi-es-alquilatucancha)) | La seña **es** la garantía (sin tarjeta); con 2 faltas (`strikesParaSena`) la seña pasa a obligatoria y el turnero lo dice antes: "Por faltas anteriores, este turno va con seña" | `requiereSena`, `marcarNoShow` (existen) | ya cubierto (REINGENIERIA #4, #10) |
| 13 | **Notificaciones: me entero tarde / soporte a los 4 días** | "I received this response 4 days after the match" ([Trustpilot UK](https://uk.trustpilot.com/review/www.playtomic.io)); Playtomic configura avisos desde el club ([Communication and notifications](https://helpmanager.playtomic.com/hc/en-gb/articles/20535292080145-Communication-and-notifications)); MATCHi manda link de cancelar por mail ([MATCHi](https://matchiplayers.zendesk.com/hc/en-gb/articles/11451781340061-How-do-I-cancel-a-booking)) | Confirmación, recordatorio (día antes), "falta la seña", "se liberó un turno", "lluvia" → **WhatsApp del club** (simulado en demo) + estado en vivo en "Mis turnos" (SSE). El soporte es el club por WhatsApp, no un chatbot | `mensajeWhatsApp` (existe, se amplían tipos `recordatorio_sena`, `hold`, `confirmada`) · `notificador` (puerto) | cada transición de estado produce exactamente un mensaje (test de tabla) |
| 14 | **Accesibilidad** | **[INFERIDO]** (sin reseñas específicas). Norma interna: Gate de Excelencia bloque 1 (AA) | Labels reales, `role="alert"` para errores y cuenta regresiva (`aria-live="polite"`), foco visible, 44 px de toque, contraste AA con tokens de `ESTILOS.md`, `prefers-reduced-motion` | — | Playwright + checklist a11y (§10) |
| 15 | **El turnero no ve lo que pasa en el mostrador** (turnos por teléfono/WhatsApp, pagos en efectivo que la app no registra) | "If the club does not mark it as paid, you will be charged" ([Pending payments](https://playerhelp.playtomic.com/hc/en-gb/articles/19831869050769-Pending-Payments-and-charges)); GTP promete "concilia automáticamente con la reserva correcta" ([GTP](https://www.gestionatupadel.com/)) | **Mismo estado**: el turno que la recepcionista carga a mano aparece ocupado en el turnero **en el mismo segundo** (SSE); la seña que cobra en efectivo marca `sena.pagada` y el jugador lo ve | backoffice en **modo conectado** (§8.5) | E2E: reserva desde el backoffice → el turnero en otra pestaña la ve sin recargar |
| 16 | **Cobros dobles / "me cobraron tres veces"** | "charged THREE TIMES the amount" ([Trustpilot UK](https://uk.trustpilot.com/review/www.playtomic.io)) | Toda mutación `POST` lleva **`Idempotency-Key`**; el back guarda la respuesta por clave 24 h; reintentar devuelve lo mismo, no crea otro hold ni otro comprobante | `idempotencia.mjs` (back) | dos `POST /holds` con la misma clave → una sola reserva, misma respuesta |
| 17 | **Comprobante que "no llegó" / conciliación a mano** | Modelo del mercado chico: "concilia automáticamente" ([GTP](https://www.gestionatupadel.com/)); la seña por WhatsApp desplazó al efectivo ([Reservalo](https://reservalo.ar/san-juan/canchas-padel)) | §6: código de referencia por reserva, lectura del comprobante, reglas de conciliación, cola de revisión en la bandeja de recepción | `registrarComprobante`, `conciliarComprobante` (nuevos) | §6.5 |

---

## 5. Matriz de eventualidades del flujo cliente (Paso 4)

Formato: `eventualidad · regla · quién decide · qué ve el jugador · función · test`. Las de operación (mostrador) ya están en `REINGENIERIA.md §4`; acá van **sólo las del jugador y su interacción con el mostrador**.

| # | Eventualidad | Regla | Decide | Qué ve el jugador | Motor / back | Test |
|---|---|---|---|---|---|---|
| C1 | Elige un hueco que **otro tomó un segundo antes** | El hold se valida y escribe en la misma operación sincrónica | Motor | "Uy, se lo llevaron recién. Estos son los más cercanos: …" (huecos alternativos de la respuesta) | `crearHold` → `validarHueco` | concurrencia 50→1 |
| C2 | Hold creado y **el jugador no confirma** (cierra el navegador) | A los `minutosHold` (15) vence solo y libera; se ofrece a la lista de espera | Motor | Cuenta regresiva; al vencer: "Se te venció. ¿Lo volvés a tomar?" | `vencerHolds` (lo corre el back cada 30 s y antes de cada lectura de disponibilidad) | hold vence · hueco vuelve a estar libre · oferta a espera |
| C3 | Hold confirmado y **nunca manda la seña** | A los `minutosParaSena` (180) sin comprobante, el turno pasa a la bandeja "Pedir seña o liberar" (**ya existe** la alerta `sena`); liberar es decisión humana, **no** automática | Recepción | "Falta la seña. Si no la mandás antes de las 17:00 el club puede liberar el turno" + botón "Ya la mandé" | `alertas` (existe) · `liberarPorSena` (nuevo: cancela por club, sin castigo) | alerta aparece a los 180′; liberar no suma falta |
| C4 | Manda el comprobante **dos veces** | Mismo nº de operación → se ignora el segundo y se responde "ya lo teníamos" | Motor | "Ya lo tenemos, gracias" | `registrarComprobante` (dedupe por `opId` por tenant) | duplicado no crea segundo pago |
| C5 | Manda comprobante **por menos** (seña 50 % = $21.000, manda $20.000) | Parcial: queda `reservada` con `sena.pagada=false`, saldo visible; se pide la diferencia o la recepción decide aceptarlo | Recepción | "Nos llegaron $20.000 de $21.000. Faltan $1.000: los podés pagar en el club" | `conciliarComprobante` → `registrarPago` parcial | parcial no marca seña pagada; saldo correcto |
| C6 | Manda comprobante **por más** (paga el turno entero) | Se registra todo contra el turno (nunca más que `saldo`); el excedente sobre el total va a saldo a favor | Motor | "Pagaste el turno completo. Te queda $X de crédito" | `conciliarComprobante` (tope `saldo(r)`, resto a `monedero`) | excedente va al monedero, no a caja de más |
| C7 | Comprobante **de otra persona / otro destino** (alias que no es del club) | Se rechaza sin acreditar; va a revisión humana si el monto y el código coinciden | Recepción | "No pudimos validar ese comprobante; en el club lo revisan" | `conciliarComprobante` → `revisar` | destino ≠ club → `rechazado`/`revisar`, nunca `conciliado` |
| C8 | Comprobante **viejo** (fecha anterior al hold) o **futuro** | Fuera de ventana (desde la creación del hold hasta el inicio del turno) → revisión | Recepción | mismo que C7 | `conciliarComprobante` (ventana) | fecha fuera de ventana → `revisar` |
| C9 | Comprobante **sin código** de referencia pero monto y teléfono coinciden con una sola reserva pendiente | Se concilia con confianza media; si hay 2 candidatas, revisión | Motor / Recepción | "Lo asociamos a tu turno del sábado 20:00" | `conciliarComprobante` (búsqueda por teléfono + monto) | 1 candidata → conciliado; 2 → revisar |
| C10 | **Cancela a tiempo** desde el turnero | ≥ `horasCancelacionLibre` → crédito al instante | Motor | "Listo. Te quedan $21.000 de crédito para la próxima" | `cancelarPorCliente` → `cancelar` | crédito == pagado |
| C11 | **Cancela tarde** desde el turnero | Seña en suspenso; se libera sola si el hueco se vende | Motor | "Como es con menos de 12 h, la seña queda en suspenso: si lo vendemos, te la devolvemos" | `cancelar` + `liberarSenasPorRelleno` | existe |
| C12 | Cancela **dos veces** (doble toque, reintento) | Idempotente: segunda vez responde el mismo resultado | Back | mismo mensaje | `Idempotency-Key` | sin segundo movimiento |
| C13 | Quiere cancelar **un turno que ya empezó** | No se puede; se ofrece hablar con el club | Motor | "Ese turno ya arrancó. Hablá con el club: [WhatsApp]" | `cancelar` (existe: sólo `reservada`) | existe |
| C14 | **Llueve** y su cancha es descubierta | Plan lluvia del club: movido / suspendido / cortado | Recepción | Evento en vivo + WhatsApp: "te movimos a Cancha 2 (techada)" | `planLluvia` + SSE | un evento por afectado |
| C15 | **Lista de espera**: se libera un hueco y hay 3 anotados | Primero que encaje (orden de anotación); oferta con vencimiento de `minutosHold`; si no responde, al siguiente | Motor / back | WhatsApp "¿Lo querés? Respondé SÍ" + en "Mis turnos" un botón "Lo quiero" que crea el hold | `ofertasEspera`, `crearHold({ desdeEspera })` | el 2.º recibe la oferta cuando vence la del 1.º |
| C16 | **Conflicto con el mostrador**: la recepcionista carga un turno por teléfono sobre un hold web vigente | El hold **ocupa**: la recepción ve "Hold web de Juan hasta 20:14" y no puede pisarlo; puede esperar o llamar | Motor | nada (su hold sigue) | `validarHueco` con `pendiente` en `OCUPA` | mostrador no pisa hold |
| C17 | **Conflicto inverso**: el mostrador cobra la seña en efectivo y después llega un comprobante por WhatsApp | El comprobante no puede exceder `saldo`; si la seña ya está pagada, va a revisión ("¿pagó dos veces?") | Recepción | "Ya figurabas con la seña paga. En el club lo revisan" | `conciliarComprobante` (tope `saldo`) | seña paga + comprobante → `revisar` |
| C18 | El dueño **cambia el precio** mientras un jugador tiene un hold | El hold **congela el precio** al crearse (`precio` fijo en la reserva, como hoy `precioFijo`) | Motor | el precio que vio es el que paga | `crearHold` guarda `precio` | cambiar tarifa no altera el hold |
| C19 | El dueño **cambia el horario del día** y deja afuera turnos web | Ya existe `ajustarHorario` → `afuera`; el back notifica a cada afectado | Dueño | WhatsApp + evento: "Cambiamos el horario; hablá con el club" | `ajustarHorario` (existe) + notificador | evento por afectado |
| C20 | **Sin sesión / sesión vencida** al confirmar el hold | El hold se asocia al navegador (`holdToken` HttpOnly) **antes** del login; al loguearse se reclama | Back | "Entrá con Google o con tu usuario; el hueco sigue siendo tuyo 12:40 más" | `reclamarHold` | login después del hold conserva el hold |
| C21 | **Teléfono ya usado** por otra identidad (Google con otro mail) | El teléfono es la llave de la ficha: segunda identidad pide verificación (post-venta: OTP; demo: aviso) | Back | "Ese número ya tiene cuenta. ¿Sos vos? Te mandamos un código" | `vincularFicha` | no se duplican fichas |
| C22 | **SSE se corta** (celu bloqueado, túnel) | `Last-Event-ID` + reconexión automática; el front repide el día completo si perdió > N eventos | Back | nada (se actualiza solo) | `sse.mjs` | reconexión recupera eventos perdidos |
| C23 | **Dos holds del mismo jugador** al mismo tiempo (abre dos pestañas) | Máximo `holdsPorIdentidad` = 1 vigente; el segundo responde "ya tenés uno: 19:30 Cancha 3" | Motor | mensaje con el hold vigente | `crearHold` | segundo hold rechazado |
| C24 | **Turno fijo** del club visto desde el turnero | Se ve ocupado, sin nombre; si el fijo libera "esta semana no venimos", el hueco aparece libre | Motor | hueco libre | `liberarFijo` + SSE | evento `disponibilidad` al liberar |
| C25 | Jugador con **marca roja** (deuda) quiere reservar | Puede reservar, **con seña obligatoria** (regla actual `requiereSena`); si el club lo decide, bloqueo (`config.politica.bloquearConDeuda`, default `false`) | Dueño | "Tenés un saldo pendiente de $X; este turno va con seña" | `requiereSena` (existe) + flag nuevo con tope | flag `true` rechaza; `false` exige seña |

**Fuera de alcance de esta pasada** (con el porqué): pago con tarjeta online (sin pasarela en demo; plugin `mercadopago` post-venta) · pago dividido online (requiere tarjeta guardada o deuda al titular, el modelo que más quejas junta — §4 #7) · partidos abiertos / buscar rival (otra fase; hoy el club los arma desde recepción) · OCR real de imágenes (adaptador simulado; post-venta con credenciales) · PWA offline (la disponibilidad sin red no tiene sentido; sí `manifest` para "agregar a inicio", que es gratis).

---

## 6. Conciliación de comprobantes por WhatsApp Business

**Post-venta:** WhatsApp Cloud API (Meta) con número del club. **Demo:** puertos/adaptadores simulados: un panel "Simular WhatsApp" en el turnero manda al back el mismo payload que mandaría Meta (firmado con un secreto de demo), rotulado **"Simulación de demo — en el club se conecta al WhatsApp Business"**.

### 6.1 Entrada: el webhook

- `GET /api/webhooks/whatsapp`: handshake `hub.mode=subscribe`, `hub.verify_token` (comparación en tiempo constante), responde `hub.challenge` **crudo** (sin JSON). El verify token **no es** el app secret (error común).
- `POST /api/webhooks/whatsapp`: verificar `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(**cuerpo crudo en bytes**, app secret), `timingSafeEqual`. Nunca re-serializar el JSON antes de firmar (Meta escapa no-ASCII; la firma cambia). Fuentes: [Hookdeck](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices) · [Webhook Relay](https://webhookrelay.com/blog/whatsapp-cloud-api-webhooks/) · SDK Python ([compare_digest](https://whatsapp-sdk.readthedocs.io/en/latest/_modules/whatsapp_sdk/services/webhooks.html)). **[INFERIDO el texto exacto de la doc oficial de Meta: no se pudo abrir desde acá; Opus verifica en developers.facebook.com antes de la fase real.]** Misma disciplina que ya usa el repo para Mercado Pago (`src/plugins/mercadopago/signature.ts`, SEC-3).
- Responder **200 rápido** y procesar después (cola en memoria en demo); reintentos de Meta → dedupe por `message.id`.
- Rate limit por IP y por `wa_id` (SEC-3); tamaño máximo del cuerpo; sólo `messages` de tipo `text`, `image`, `document` (PDF); lo demás se ignora con 200.

### 6.2 Lectura del comprobante (puerto `LectorComprobante`)

Salida normalizada, **siempre con `confianza` 0–1 por campo**:

```
{ monto, moneda:"ARS", fecha, hora?, opId, destino:{ alias?, cbu?, cvu?, titular? }, origen:{ titular?, cuit? }, banco?, referencia?, confianza:{...} }
```

- **Texto** (el jugador pega el texto del comprobante o escribe "transferí 21000, op 123456"): parser por expresiones regulares en castellano (`$ 21.000,00`, `21000`, "N° de operación", "Nro. de transacción", alias `xxx.yyy.zzz`, CBU 22 dígitos, CVU, fecha `dd/mm/aaaa`). **Determinista y testeado** (tabla de 20 comprobantes de ejemplo de los bancos/MP más comunes, redactados por nosotros, no copiados).
- **Imagen / PDF**: en demo, **adaptador simulado** que recibe los campos desde el panel de simulación (no hay OCR). Post-venta: adaptador OCR (Google Vision o Textract) → `[§C · credenciales + gasto]`. El contrato es el mismo objeto de arriba.
- El **código de referencia** `BP-<4 letras>` que el turnero pide poner en el concepto de la transferencia es el ancla principal; se busca en texto y en OCR.

### 6.3 Reglas de conciliación (`conciliarComprobante`, motor, puro)

| Regla | Resultado |
|---|---|
| `opId` ya registrado en el tenant | `duplicado` (no acredita; responde "ya lo teníamos") |
| `destino` presente y ≠ alias/CBU/CVU del club (`config.cobros`) | `rechazado` (comprobante ajeno) |
| `fecha` fuera de [creación del hold − 1 h, inicio del turno] | `revisar` |
| Candidata por código `BP-xxxx` → 1 reserva | candidata única |
| Sin código: por teléfono del remitente (`wa_id` ↔ ficha) + monto == seña o == total, 1 reserva pendiente | candidata única (confianza media) |
| 0 candidatas | `revisar` ("no sabemos de qué turno es") |
| ≥ 2 candidatas | `revisar` |
| `monto == sena.monto` | `conciliado` → `registrarPago({ medio:"transferencia", monto })` → `sena.pagada` |
| `monto < sena.monto` | `parcial` → pago parcial, seña sigue pendiente, aviso al jugador |
| `sena.monto < monto ≤ saldo` | `conciliado` (paga más del mínimo) |
| `monto > saldo` | `conciliado` por `saldo`, excedente a `monedero` (si tiene ficha) o `revisar` (si no) |
| confianza global < 0,7 (campos dudosos) | `revisar` aunque todo cierre |
| seña ya pagada (C17) | `revisar` |

Todo `revisar` crea una **alerta** `comprobante` en la bandeja de recepción (`alertas`, nivel media) con la acción "Aceptar / Rechazar", y el jugador ve "en revisión". **Ninguna conciliación automática toca caja sin pasar por `registrarPago`.**

### 6.4 Honestidad: dos niveles de verdad

- **Nivel 1 — pre-confirmado por comprobante.** Un comprobante **se puede falsificar** (editar una captura cuesta un minuto). En demo y en la primera etapa real, `sena.pagada=true` con `sena.origen="comprobante"` significa *"nos mostraron un comprobante que cierra"*. El turnero lo dice así: "Seña recibida (comprobante)". La recepción conserva la facultad de pedir el extracto si algo no cierra.
- **Nivel 2 — acreditado contra el movimiento real (post-venta, §C).** Con Mercado Pago: webhook `x-signature` ya implementado en el ERP (`src/plugins/mercadopago/signature.ts`) + consulta del pago por `data.id` ([docs MP](https://www.mercadopago.com.ar/developers/en/docs/automatic-payments-orders/notifications/orders)). Con banco: el dueño sube el extracto (CSV) o se integra la API del banco si la hay; `acreditarContraMovimiento(reservaId, movimientoId)` eleva `sena.origen` a `"acreditado"`. Ambos niveles se **ven distinto** en el backoffice (chip "comprobante" vs "acreditado") y en los KPI ("cobrado" sólo cuenta nivel 2 cuando el club activa el modo estricto; default: cuenta ambos, con el desglose).

### 6.5 Datos personales (demo y prod)

- **No se loguean comprobantes completos**: el log guarda `opId` **hasheado** (SHA-256 truncado), monto y resultado. Nada de CBU/CUIT/titular en logs.
- **Imágenes: no se guardan en demo** (se procesan en memoria y se descartan). Post-venta: retención máxima 90 días, sólo el adaptador OCR las toca, política escrita en `docs/seguridad/` antes de activar (revisión de Seguridad, ADR-068).
- El texto del comprobante se guarda **redactado** (regla de `src/integraciones/redaccion.ts`, reutilizable): CBU/CVU → últimos 4; CUIT → enmascarado.
- Tests: ninguna línea de log contiene 22 dígitos seguidos ni un CUIT (`redaccion.test` ya tiene el patrón).

---

## 7. Login práctico

| Opción | Cómo | Pros | Contras | Decisión |
|---|---|---|---|---|
| **Google (OpenID Connect)** | Authorization Code + **PKCE** + `state` (CSRF) + `nonce` (anti-replay, validado una sola vez); validar `iss`, `aud`, `exp`, firma (JWKS cacheado); `email_verified` obligatorio. Fuentes: [Google OIDC reference](https://developers.google.com/identity/openid-connect/reference) · [state/nonce/PKCE](https://workos.com/blog/state-nonce-pkce) | 1 toque, sin contraseña, mail verificado | Credenciales `client_id/secret` → **las pega el dueño** post-venta; en demo adaptador simulado ("Entrar como Juan (simulado)") | **Sí, principal** |
| **Usuario/contraseña** | `scrypt` de `node:crypto` con **N=2^17, r=8, p=1** (mínimo OWASP para scrypt; [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)) — reutilizar el formato `scrypt$salt$hash` de `src/lib/auth-password.ts` subiendo el costo si está por debajo; `timingSafeEqual`; mínimo 8 caracteres, lista negra de las 1.000 más comunes; **rate limit** por IP (reutilizar la interfaz `RateLimiter` de `src/lib/rate-limit.ts`: 10 fallos / 15′) + **lockout progresivo por cuenta** (5 fallos → 1′, 10 → 15′, 20 → aviso al club); sin enumeración de usuarios (mismo mensaje) | Funciona sin Google ni WhatsApp | Es la opción con más fricción y más soporte ("me olvidé la clave") | **Sí, respaldo** |
| **WhatsApp OTP** (código de 6 dígitos por WhatsApp) | Plantilla de autenticación de Meta; código con TTL 5′, 3 intentos, rate limit por teléfono | **Criollo y natural**: el teléfono ya es la identidad del club y la llave del comprobante; cero contraseña | Costo por mensaje y aprobación de plantilla (post-venta); dependencia de la Cloud API | **Recomendado post-venta como principal**; en demo, simulado (el código se muestra en pantalla rotulado "DEMO") |
| **Magic link por mail** | Link firmado (HMAC, TTL 15′, un uso) | Sin contraseña, barato | Mail no es el canal del jugador argentino; cae en spam | Sólo si el club no activa WhatsApp API |

**Sesión:** cookie `bp_sesion` **HttpOnly, Secure, SameSite=Lax**, id aleatorio de 32 bytes, store en memoria (demo) → tabla `Sesion` (prod); expiración 30 días deslizante; `POST /api/auth/logout` la invalida en el servidor. **CSRF:** toda mutación exige `Origin` (o `Sec-Fetch-Site: same-origin`) coincidente con el host permitido **y** `Content-Type: application/json` (los formularios HTML no pueden mandarlo cross-site sin preflight). **Hold previo al login:** cookie `bp_hold` (HttpOnly) con el id del hold; al iniciar sesión se reclama (`reclamarHold`, C20). **Identidad ↔ ficha:** la ficha del club (`clientes`) se vincula por teléfono; sin teléfono no hay reserva (es el canal del club). **Roles:** jugador (turnero) y staff (backoffice conectado: `recepcion`/`duenio`, con el PIN de 2 dígitos **sólo** como segundo factor de acciones sensibles encima de una sesión real — para producción el PIN sube a 4 dígitos, anotado en `REINGENIERIA.md §10`).

**Demo:** `auth/simulado.mjs` implementa los tres puertos (`ProveedorGoogle`, `EnviadorOTP`, `EnviadorMail`) y los rotula en pantalla. Las credenciales reales (Google, Meta, MP) **no existen en el repo** ni en la demo: FASE 2, las pega el dueño.

---

## 8. Arquitectura: front y back separados

### 8.1 Mapa de archivos (propuesta para Opus)

```
public/previews/breakpoint/turnero/        ← FRONT del jugador (estático, vanilla)
  index.html         marca del club + sello GSG (meta generator; crédito en el pie NO va acá: es vidriera del tenant)
  turnero.mjs        estado de pantalla + render (sin reglas de negocio)
  cliente-api.mjs    puerto: { config, disponibilidad, crearHold, confirmar, comprobante, cancelar, misTurnos, espera, eventos }
  api-http.mjs       adaptador HTTP (fetch + EventSource)          ─┐ se elige en runtime
  api-local.mjs      adaptador "servidor en el navegador": importa ../club/motor.mjs y corre el back-core en el mismo hilo ─┘
  turnero.css        tokens de ESTILOS.md (estilo `chapa` claro/oscuro), mobile-first 390 px
src/tenants/breakpoint/turnero/            ← BACK (Node, cero dependencias)
  servidor.mjs       node:http → estáticos + router; `node src/tenants/breakpoint/turnero/servidor.mjs` (puerto 8787)
  nucleo.mjs         PURO: estado + `aplicarComando` + vencimientos + versión; lo usan servidor.mjs y api-local.mjs
  router.mjs         PURO: (req normalizado) → (res normalizada); tabla de rutas de §8.3
  sesiones.mjs · idempotencia.mjs · sse.mjs · limites.mjs (rate limit, reutiliza la interfaz de src/lib/rate-limit.ts)
  auth/{google.mjs, password.mjs, otp.mjs, simulado.mjs}
  whatsapp/{webhook.mjs, lector.mjs, conciliar.mjs → delega en motor}, adaptadores/{simulados.mjs}
  *.test.ts          node:test (como motor-club.test.ts)
public/previews/breakpoint/club/motor.mjs  ← DOMINIO (se extiende, no se duplica): hold, comprobante, conciliación, política en texto
```

El empaquetador (`src/tenants/breakpoint/empaquetar.mjs`) sigue sirviendo el backoffice en `breakpoint.gsgapp.com.ar`; el turnero se empaqueta igual (`turnero/` → `src/tenants/breakpoint/sitio/turnero.html`) con el adaptador local embebido, para que la **demo pública funcione sin servidor** (ciclo demo a costo cero; el host del ERP es serverless y no sostiene un proceso con SSE). El back Node corre en local/CI y, cuando haya venta, en un host persistente (§11).

### 8.2 Presupuesto del front (se mide, no se promete)

- **JS ≤ 60 KB gz** sumando `turnero.mjs + cliente-api.mjs + api-http.mjs`; el adaptador local (motor incluido) se carga por `import()` sólo si no hay API, y su tamaño se mide aparte (meta: ≤ 40 KB gz adicionales). Test: `tamanio.test.ts` gzipea los archivos con `node:zlib` y falla si se pasa.
- **LCP < 1,5 s en 4G** (Playwright con `page.route` throttling + `PerformanceObserver`), **CLS 0** (alturas reservadas para la grilla y el contador), **sin fuentes web bloqueantes** (Archivo con `font-display: swap`, subset latino; o sistema si pesa), imágenes sólo el logo (SVG cuando el club lo pase; hoy la recreación CSS).
- `prefers-reduced-motion` apaga la cuenta regresiva animada (queda el número) y las transiciones.
- Mobile-first 390 px: un día por pantalla, canchas en pestañas o columnas apiladas; 1440 px: grilla cancha × hora como el backoffice, misma semántica de colores (libre / tomado / tuyo / descubierta).
- AA: contraste con los tokens de `chapa` (ya calculados en `ESTILOS.md`), foco visible, botones ≥ 44 px, `aria-live` para "se lo llevaron" y el contador, errores con `role="alert"`.

### 8.3 Contrato de API (todo JSON; errores `{ ok:false, codigo, motivo }`, `motivo` en criollo)

Códigos HTTP: 200 ok · 201 creado · 400 `datos_invalidos` · 401 `sin_sesion` · 403 `prohibido` / `origen_invalido` · 404 `no_existe` · 409 `hueco_ocupado` / `hold_vencido` / `estado_invalido` · 422 `regla_del_club` (motivo del motor) · 429 `demasiados_intentos` (con `Retry-After`) · 500 nunca con detalle.

| Método · ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|
| `GET /api/turnero/config` | — | — | `{ club:{nombre, canchas:[{id,nombre,cubierta}], horarios, paso, duracionTurno}, politica:{horasCancelacionLibre, senaPct, minutosHold, minutosParaSena, texto}, cobros:{ alias:"demo.breakpoint" (rotulado), mp:false }, modo:"demo"|"conectado" }` | — |
| `GET /api/turnero/disponibilidad?fecha=AAAA-MM-DD&duracion=90` | — | query | `{ fecha, version, huecos:[{canchaId, inicio, precio, franja:"valle"|"pico", libre:true|false}] }` (sin nombres; `libre:false` tapa reservas, holds, fijos, bloqueos, mantenimiento) | 400 fecha/duración · 422 día cerrado |
| `POST /api/turnero/holds` | opcional (sin sesión → `bp_hold` cookie) · `Idempotency-Key` | `{ canchaId, fecha, inicio, duracion, desdeEspera? }` | 201 `{ hold:{id, venceEn, precio, sena:{monto, obligatoria}, politicaTexto}, alternativas:[…] si falló }` | 409 `hueco_ocupado` (con `alternativas`) · 409 `ya_tenes_hold` · 422 regla · 429 |
| `POST /api/turnero/holds/:id/confirmar` | sesión + `Idempotency-Key` | `{ titular, telefono, jugadores?:[nombre×3], acepto:true }` | `{ reserva:{id, estado:"reservada", sena:{monto, pagada:false, referencia:"BP-ABCD", venceEn}, precio, cancelacionHasta} }` | 401 · 409 `hold_vencido` · 403 si el hold es de otro |
| `POST /api/turnero/reservas/:id/comprobante` | sesión + `Idempotency-Key` | `{ texto }` ó `{ simulado:{monto, opId, fecha, alias} }` (demo) | `{ resultado:"conciliado"|"parcial"|"revisar"|"duplicado"|"rechazado", sena:{…}, mensaje }` | 403 no es tu turno · 409 estado |
| `POST /api/turnero/reservas/:id/cancelar` | sesión + `Idempotency-Key` | `{}` | `{ aTiempo, devuelto, enSuspenso, mensaje }` | 403 · 409 `estado_invalido` |
| `GET /api/turnero/reservas/cancelar?t=<token>` | token firmado (HMAC, un uso, TTL hasta el inicio) | — | página mínima "¿Cancelás el turno del sábado 20:00?" → `POST` con el token | 410 token usado/vencido |
| `GET /api/turnero/mis-turnos` | sesión | — | `{ proximos:[…], pasados:[…], credito, faltas, holdVigente? }` | 401 |
| `POST /api/turnero/espera` | sesión + `Idempotency-Key` | `{ fecha, desde, hasta, duracion, soloCubierta }` | 201 `{ espera:{id} }` | 422 |
| `GET /api/turnero/eventos?fecha=…` | — (SSE, `text/event-stream`) | `Last-Event-ID` opcional | eventos `disponibilidad {fecha, canchaId, inicio, duracion, libre}` · `version {n}` · `ping` cada 25 s | 429 por IP (máx. 3 conexiones) |
| `GET /api/turnero/mis-eventos` | sesión (SSE) | — | `reserva_cambio {reservaId, estado, sena, motivo}` · `espera_oferta {canchaId, inicio, venceEn}` | 401 |
| `POST /api/auth/registro` · `POST /api/auth/login` · `POST /api/auth/logout` | — / — / sesión · rate limit | `{ usuario, clave, telefono }` / `{ usuario, clave }` | `{ ok, perfil:{nombre, telefono} }` (sin distinguir "no existe" de "clave mal") | 429 · 423 `bloqueado` (`Retry-After`) |
| `GET /api/auth/google` → `GET /api/auth/google/callback` | — | PKCE + state + nonce en cookie temporal | redirige a `/turnero/?entro=1` | 400 `state_invalido` |
| `POST /api/auth/otp/pedir` · `POST /api/auth/otp/verificar` | — · rate limit por teléfono | `{ telefono }` / `{ telefono, codigo }` | `{ ok }` / `{ ok, perfil }` | 429 · 400 |
| `GET /api/webhooks/whatsapp` · `POST /api/webhooks/whatsapp` | verify token / **X-Hub-Signature-256** | payload de Meta (crudo) | `hub.challenge` / `200` siempre que la firma valide | 403 firma inválida · 413 cuerpo |
| `GET /api/club/estado` | sesión staff | — | `{ version, estado }` (snapshot completo del motor **sin** PINs ni hashes) | 401/403 |
| `POST /api/club/comandos` | sesión staff + PIN cuando el motor lo pide + `Idempotency-Key` | `{ nombre:"checkIn"|"registrarPago"|…, args:[…], auth?:{usuarioId, pin} }` — **lista blanca** = exportaciones mutadoras del motor | `{ resultado, version }` (el `{ok, motivo}` del motor tal cual) | 400 nombre fuera de lista · 422 motivo del motor |
| `GET /api/club/eventos` | sesión staff (SSE) | `Last-Event-ID` | `cambio {version, comando, resumen}` (la pantalla repide `/estado` y hace morph) · `alerta {…}` | 401 |
| `POST /api/club/reloj` | sólo `modo:"demo"` | `{ deltaMin }` | `{ ahora }` | 403 en conectado real |

### 8.4 Serialización de reservas (DB-4) y tiempo real

- **Demo (Node):** `nucleo.aplicarComando(nombre, args)` es **sincrónica**: lee, valida (`validarHueco`) y escribe en la misma vuelta del event loop; el parseo del cuerpo (async) termina **antes** de llamarla. Así, 50 requests concurrentes al mismo hueco se aplican una por una y sólo la primera pasa. Regla para Opus: **ningún `await` dentro de `aplicarComando` ni dentro del motor**. Cada comando aplicado incrementa `version` y emite un evento.
- **Producción (Postgres/Neon, Gate 2):** `CREATE EXTENSION btree_gist` + `Reserva(tenantId, canchaId, durante tstzrange)` con `EXCLUDE USING gist (tenantId WITH =, canchaId WITH =, durante WITH &&) WHERE (estado IN ('pendiente','reservada','en_cancha'))` y rangos semiabiertos `[inicio, fin)` para que 20:00–21:30 y 21:30–23:00 no choquen ([Cybertec](https://cybertec-postgresql.com/en/?p=4305) · [sqlfordevs](https://sqlfordevs.com/non-overlapping-time-ranges)); escritura dentro de `tenantTransaction` con `Serializable` mientras la extensión no esté (ADR-004/023). La app sigue validando con el motor (mensaje criollo), pero **la BD es quien impide** el doble.
- **SSE:** un `Set` de respuestas por canal (`turnero:<fecha>`, `mis:<identidad>`, `club`), `ping` cada 25 s, `retry: 3000`, `id:` incremental = `version`; al reconectar con `Last-Event-ID` se mandan los eventos faltantes (buffer de 500) o `resync`. Sin dependencias: `res.writeHead(200, {'Content-Type':'text/event-stream', 'Cache-Control':'no-store', 'X-Accel-Buffering':'no'})`.
- **Vencimientos:** `setInterval(30 s)` → `vencerHolds` + `alertas` de seña; además se corre **antes** de responder cualquier lectura de disponibilidad (así la demo sin servidor también vence holds).

### 8.5 Backoffice en "modo conectado" sin romper el demo

Hoy `app.mjs` hace `E = M.generarDemo(HOY)` y llama `M.x(E, …)` directo. Cambio mínimo y reversible:

1. Un módulo `puente.mjs` con `ejecutar(nombre, ...args)`: en **modo demo** llama `M[nombre](E, ...args)` (como hoy); en **modo conectado** hace `POST /api/club/comandos` y, al recibir `version`, repide `GET /api/club/estado` → `E = snapshot` → `pintar()` (morph ya hace barato el repintado). Opus reemplaza las llamadas mutadoras por `ejecutar(...)` (una pasada mecánica; las lecturas puras siguen locales sobre `E`).
2. Detección: `?modo=conectado` o `fetch('/api/club/estado', {method:'HEAD'})` ok → conectado; si no, demo. La cinta de demo dice cuál es.
3. El **reloj de la demo (±30′)** sólo existe en demo o contra `POST /api/club/reloj` en back demo.
4. Lo que es del navegador (estilo, tema) queda en `localStorage` como hoy.
5. Test de contrato: el mismo recorrido de `motor-club.test.ts` corre **a través del router** (`router.test.ts`): cada comando de la lista blanca devuelve lo mismo que llamar al motor.

### 8.6 Extensiones al motor (con test; nada se duplica)

| Nueva función / campo | Qué hace | Nota |
|---|---|---|
| `ESTADOS.pendiente` + `OCUPA` lo incluye | Hold que ocupa el hueco | `reserva.vence = {fecha, min}`; `origen:"web"` |
| `crearHold(estado, datos, ahora)` | `validarHueco` + 1 hold por identidad + precio congelado + `referencia` `BP-xxxx` única | devuelve `alternativas` (3 huecos más cercanos) si falla por ocupado |
| `confirmarHold(estado, id, datos, ahora)` | `pendiente → reservada` con `requiereSena` y `sena.venceEn` | falla si venció |
| `vencerHolds(estado, ahora)` | pasa a `cancelada` (motivo "Hold vencido", sin falta) y devuelve ofertas de espera | idempotente |
| `reclamarHold(estado, id, identidad)` | asocia hold anónimo a la identidad logueada | — |
| `liberarPorSena(estado, id, auth, ahora)` | cancelación por club sin castigo cuando no llegó la seña | decisión humana |
| `cancelarPorCliente(estado, id, identidad, ahora)` | valida titular y delega en `cancelar` | — |
| `registrarComprobante` / `conciliarComprobante` | §6.3; guarda `comprobantes[]` con `opIdHash`, resultado, confianza | sólo `conciliado`/`parcial` llaman `registrarPago` |
| `acreditarContraMovimiento` | eleva `sena.origen` a `"acreditado"` | post-venta |
| `politicaParaReserva(estado, reserva)` | `{ cancelacionHasta, senaPct, texto }` en criollo | usado por API y WhatsApp |
| `politica.minutosHold` (5–30, default 15) · `politica.minutosParaSena` (30–1440, default 180) · `politica.bloquearConDeuda` (bool) · `config.cobros{alias, cbu?, cvu?, titular}` | reglas nuevas con topes en `LIMITES_POLITICA` | `ajustarPolitica` ya valida topes |
| `mensajeWhatsApp` tipos nuevos: `hold`, `confirmada`, `recordatorio_sena`, `comprobante_ok`, `comprobante_parcial`, `comprobante_revisar`, `cancelacion_link` | textos criollos | tabla-test: 1 transición → 1 mensaje |
| `alertas` tipo `comprobante` (revisar) y `hold_web` (informativo en la grilla) | bandeja | — |

---

## 9. Evaluación (sólo documento): reserva de mesa del bodegón «Delicias» / parrilla

**Demanda.** No hay dato público de Delicias. Contexto: en Argentina el mercado de reservas de restaurante lo lidera Meitre y Covermanager desembarca; cobrar la reserva por adelantado es polémico ([Cronista](https://www.cronista.com/clase/gourmet/es-una-estafa-me-quieren-cobrar-la-reserva-en-un-restaurante/)). Tasa media de no-show 3,3 % (TheFork 2025, Europa) y el recordatorio 24 h por WhatsApp baja ausencias hasta 40 % ([Qamarero](https://qamarero.com/blog/no-shows-en-restaurantes/)); un vendedor afirma 20–30 % de no-show en LatAm sin fuente ([Aurora Inbox](https://www.aurorainbox.com/en/2026/05/03/whatsapp-reservation-system-for-restaurants/)) **[INFERIDO, interés comercial]**. Un bodegón de club de barrio vive del **walk-in** del jugador que termina el partido: la demanda de reserva formal es, a priori, de **viernes/sábado noche y eventos** (torneos CPS, cumpleaños) **[INFERIDO, a confirmar con Rober]**.

**Modelo (mesa ≠ cancha).** La cancha es un recurso **indivisible con duración fija** (90′, grilla de 30′). La mesa es **capacidad por cubiertos y por franja**, con duración variable (una mesa de 4 puede ser 2 de 2; una parrilla de 8 se arma juntando), rotación por turno de cocina (20:30 / 22:30), y **sin "hueco" exacto**: se reserva "para 6 a las 21:00", no "la mesa 3". Objetos nuevos (ADR-055): `Mesa{capacidad, combinable}`, `TurnoSala{fecha, franja, cupoCubiertos}`, `ReservaMesa{cubiertos, franja, titular, estado}`; la asignación mesa↔reserva se resuelve el mismo día (sala), no al reservar. **No reutiliza `validarHueco`**: necesita un validador de cupo por franja (`cubiertosLibres(fecha, franja)`), más simple pero distinto.

**Combos cancha + mesa post-partido.** Es el caso con más valor y menos riesgo: al confirmar el turno de 20:00, "¿Les guardamos mesa para 4 a las 21:45?" → crea `ReservaMesa` ligada a la reserva de cancha (si el turno se cancela, la mesa también; si llueve y se suspende, también). Un evento, una regla, una línea en el WhatsApp de confirmación.

**Riesgos.** (1) Seña para mesa: culturalmente resistida; sin seña, no-show sin costo → arrancar **sin seña y con recordatorio**. (2) Doble sistema: si Delicias ya usa libreta/WhatsApp, el riesgo de "mesa prometida por teléfono que el sistema no ve" es el mismo del §4 #15 → sólo vale si la sala también carga en el backoffice (pestaña Buffet ya existe). (3) Capacidad real de cocina en noche de torneo (el cuello no es la mesa, es la parrilla). (4) Alcance: cada objeto nuevo es ABM + tests + pantalla; estimación 1 pasada de Opus completa, no "un botón".

**Recomendación.** **No construir ahora.** Hacer en esta pasada sólo lo gratis: en la confirmación del turno, el **texto** "¿Querés mesa después del partido? Escribile a Delicias: [WhatsApp]" (`mensajeWhatsApp("mesa_post_partido")`, link por el helper único). **Cuándo sí:** cuando (a) el club lo pida explícitamente o (b) tras 8 semanas de turnero con datos, los sábados muestren > 30 % de turnos de 20:00–22:00 (señal de demanda post-partido) **[umbral propuesto, a validar]**; entonces, fase propia con `ReservaMesa` + combo, sin seña, con recordatorio, Gate completo. Dejar la decisión registrada en el caso (`docs/metodologia/registro-casos/breakpoint.md`).

---

## 10. Plan de tests y criterios de aceptación

| Nivel | Qué | Herramienta | Criterio |
|---|---|---|---|
| **Unidad (motor)** | Cada fila de §5 (C1–C25) + cada regla de §6.3 + `politicaParaReserva` + tabla de mensajes + invariante global ampliado: "ningún par de reservas **ni holds** activos se pisa" (fuzz: 500 operaciones aleatorias con semilla) | `node:test` en `src/tenants/breakpoint/motor-club.test.ts` (se amplía) y `turnero/*.test.ts` | 100 % de filas con test; `npm test` verde |
| **Unidad (lector)** | 20 comprobantes de texto (MP, Galicia, Nación, Brubank, Santander, Ualá… redactados por nosotros) + 10 casos ruidosos | `node:test` | monto/opId/alias correctos; confianza < 0,7 en los ruidosos |
| **Unidad (seguridad)** | Firma `X-Hub-Signature-256` válida/inválida/ausente/cuerpo re-serializado; `state`/`nonce` inválidos; rate limit; lockout; cookie flags; `Origin` cruzado rechazado; token de cancelación de un uso | `node:test` | cada caso devuelve el código de §8.3 |
| **Integración del contrato** | Servidor en proceso (`servidor.mjs` en puerto efímero) + `fetch`: cada endpoint de §8.3 (happy + cada error); **concurrencia** 50→1; idempotencia; SSE recibe `disponibilidad` tras un hold y tras `vencerHolds`; `router.test.ts` compara router vs motor | `node:test` + `fetch` nativo + `EventSource` polyfill mínimo propio (o lectura del stream) | todos verdes; ningún 500 |
| **Paridad demo/conectado** | El mismo recorrido con `api-local.mjs` y con `api-http.mjs` da el mismo resultado | `node:test` | diff vacío |
| **E2E Playwright** (Chromium en `/opt/pw-browsers`, 1440 y 390 px, claro y oscuro) | (1) ver disponibilidad sin login → hold → login simulado → confirmar → comprobante simulado → "Seña recibida"; (2) cancelar a tiempo → crédito; (3) backoffice en otra pestaña carga un turno → el turnero lo ve sin recargar; (4) plan lluvia → el jugador ve "movido"; (5) hold vence → mensaje; (6) lista de espera → oferta; (7) `prefers-reduced-motion`; (8) teclado completo | `playwright` (ya en devDependencies) | 0 errores de consola; **sin scroll horizontal** en 390 px; foco visible en cada paso |
| **Accesibilidad** | Labels, `role="alert"`, `aria-live`, orden de foco, contraste (tokens ya calculados), zoom 200 % | Playwright + checklist manual del Gate (bloque 1); `@axe-core/playwright` **sólo si** se autoriza sumar la devDependency (si no, checklist) | sin violaciones AA |
| **Performance** | Tamaño gz de los `.mjs`; LCP con throttling 4G (1,6 Mbps / 150 ms RTT); CLS | `tamanio.test.ts` (`node:zlib`) + Playwright `PerformanceObserver` | ≤ 60 KB gz · LCP < 1,5 s · CLS = 0 |
| **Empaquetado** | `empaquetar.mjs` produce `sitio/turnero.html` al día (como hoy con el backoffice) | test existente ampliado | falla si la fuente cambió y no se re-empaquetó |

**Criterios de aceptación (Definición de terminado de la pasada):** todo lo anterior verde · `tsc` + `next build` del proyecto completo verdes (la deuda C1 de `REINGENIERIA.md §8` se salda acá) · Gate de Excelencia 4 bloques tildado en el handoff · la demo pública funciona **sin servidor** (adaptador local) y el back Node pasa el contrato · el documento `REINGENIERIA.md` suma una sección "Turnero" (Paso 7) y el caso en `registro-casos/breakpoint.md` suma 1 caso + 1 lección (ADR-047).

---

## 11. Camino a producción — reversible vs. §C (ADR-048) y lista provisional

| Paso | Tipo | Nota |
|---|---|---|
| Front + back + motor extendido + tests en la rama; empaquetado del turnero junto al backoffice | **Reversible** | Todo en `public/previews` + `src/tenants/breakpoint`; sin schema, sin deploy |
| Merge a `main` tras el Gate | Reversible (push-libre) | `tsc` + `next build` + `npm test` verdes |
| Publicar la demo (`breakpoint.gsgapp.com.ar/turnero` y/o `breakpoint-erp.vercel.app`) | **Gate 1** | OK explícito del dueño ("deployá"); la demo corre **sin servidor** (adaptador local) |
| Host persistente para el back Node (SSE + estado) | **§C · gasto** | Sólo post-venta; el host serverless actual no lo sostiene. Alternativa post-venta: portar el router a route handlers del ERP y el estado a Neon (entonces SSE vía función de streaming) |
| Modelos `Reserva` (+`pendiente`, `vence`, `referencia`, `origen`), `Comprobante`, `Sesion`, `IdentidadJugador`, `ListaEspera` con `tenantId`, RLS y **`EXCLUDE USING gist`** | **§C · Gate 2** | Migración aditiva propuesta por Data/DBA; `btree_gist` requiere permiso en Neon; la aplica el dueño |
| Credenciales Google OIDC (`client_id/secret`), Meta (app secret, verify token, token del número), Mercado Pago (`MP_WEBHOOK_SECRET`, access token), OCR | **§C · credenciales** | Las pega **siempre el dueño** (FASE 2); el repo sólo lee variables de entorno |
| Alias/CBU/CVU del club y número de WhatsApp real | **§C · datos del cliente** | Los carga el dueño del club en Ajustes; cero hardcode (DX-4) |
| Dominio propio (`turnos.breakpointpadel.com.ar` o el que elijan) | **§C · gasto post-venta** | Ciclo DEMO → VENTA → INVERSIÓN |
| Revisión de Seguridad (ADR-068) antes de activar webhook real, OCR y datos personales | **§C** | Checklist SEC-3 + política de retención escrita |

**Provisional a confirmar con el club (además de lo listado en `REINGENIERIA.md §9`):**
- Minutos de hold (15) y ventana para mandar la seña (3 h) · ¿seña siempre o sólo con faltas/sin ficha? (hoy: sin ficha = sí).
- Alias/CBU para transferencias, ¿Mercado Pago QR en el mostrador?, ¿aceptan efectivo como seña "pasando antes"?
- Qué canchas son descubiertas (la demo asume Cancha 4) y texto del "plan lluvia" que quieren que lea el jugador.
- ¿El jugador puede cancelar solo desde la web o quieren que siempre llame? (el plan asume que sí, con la regla visible).
- Número de WhatsApp del club para el turnero (hoy en la bio: 11 6187-0066 — **no se usa en demo**, se pide como dato del dueño).
- Horarios por día y precios reales (la demo usa valle $20.000/h, pico $28.000/h, de ejemplo).
- ¿Quieren login con Google, con WhatsApp, ambos? ¿Usuario/contraseña como respaldo?
- Delicias: ¿hoy toman reservas de mesa? ¿por qué canal? ¿los fines de semana se llena? (insumo de §9).
- Firma de la autorización de marca en ADR-034 (el dueño de GSG confirmó el 15/10; falta registrar dónde consta).

---

## 12. Nota de método

Plan elaborado con **Fable** por pedido explícito del dueño de GSG ("planificá con Fable y ejecutá con Opus"), como
excepción puntual a la norma *sólo Opus 5.5*; la **ejecución** (paso 6 de la skill: motor extendido, back, front,
tests, QA Playwright y Gate) corre en **Opus 5.5**. Sin commits en esta pasada; el único entregable es este documento.

### Fuentes (todas públicas; las marcadas † no se pudieron abrir desde este entorno y se citan por su extracto de búsqueda)

- Playtomic (jugador): [Dividir el pago](https://playerhelp.playtomic.com/hc/en-gb/articles/19832089052561-How-to-split-the-payment-of-a-reservation)† · [Pagos pendientes y deudas](https://playerhelp.playtomic.com/hc/en-gb/articles/19831869050769-Pending-Payments-and-charges)† · [Reembolsos](https://playerhelp.playtomic.com/hc/en-gb/articles/19832175736593-Refunds-and-when-you-will-receive-your-money)† · [FAQ jugadores](https://playerhelp.playtomic.com/hc/en-gb/articles/19831519179281-FAQ-Players-Playtomic)† · [No-show](https://playerhelp.playtomic.com/hc/en-gb/articles/43240624037393-What-happens-if-a-player-doesn-t-show-up)† · [Cancelar reserva](https://playerhelp.playtomic.com/hc/en-gb/articles/19832121593873-How-to-cancel-a-reservation)† · [Política partidos abiertos](https://playerhelp.playtomic.com/hc/en-gb/articles/19831672824465-Cancellation-Policy-for-Open-Matches-Padel-Tennis)†
- Playtomic (club): [Card on File](https://helpmanager.playtomic.com/hc/en-gb/articles/46647891110673-Card-on-File-CoF-your-guarantee-for-split-payment-bookings)† · [Split vs single](https://helpmanager.playtomic.com/hc/en-gb/articles/20535331224721-Split-Payment-vs-Single-payment)† · [Problemas comunes](https://helpmanager.playtomic.com/hc/en-gb/articles/20534585454097-How-to-Handle-Common-Booking-Issues-A-Quick-Guide-for-Your-Club)† · [Comunicación y notificaciones](https://helpmanager.playtomic.com/hc/en-gb/articles/20535292080145-Communication-and-notifications)† · [Partidos públicos y calendario](https://helpmanager.playtomic.com/hc/en-gb/articles/20535700374929-Understanding-When-Public-Matches-Occupy-Club-Calendar-Slots)†
- Reseñas Playtomic: [Trustpilot UK](https://uk.trustpilot.com/review/www.playtomic.io)† · [App Store US](https://apps.apple.com/us/app/playtomic/id1242321076?see-all=reviews)† · [App Store PT](https://apps.apple.com/pt/app/playtomic-play-padel/id1242321076)† · [youarepadel](https://youarepadel.com/en/playtomic-reviews-alternatives)† · [Doinsport sobre Playtomic](https://doinsport.com/en/blog/alternative-to-playtomic-which-management-software-to-choose-for-your-padel-club)
- MATCHi: [¿Cómo cancelo?](https://matchiplayers.zendesk.com/hc/en-gb/articles/11451781340061-How-do-I-cancel-a-booking) · [Reservé mal](https://matchiplayers.zendesk.com/hc/en-gb/articles/21837564144413-I-booked-the-wrong-time-what-should-I-do) · [Reembolso (admin)](https://matchi.zendesk.com/hc/en-gb/articles/11673921738013-Cancel-and-or-refund-booking) · [Padel Yard (lluvia sin reembolso)](https://www.matchi.se/facilities/g4pthepadelyard) · [Hove Beach Park (6 h, 25p split)](https://clubspark.lta.org.uk/hovebeachparktennis/COURTBOOKINGS)
- Matchpoint: [ES](https://tpcmatchpoint.com/software-gestion-clubs-padel.html) · [EN](https://tpcmatchpoint.com/en/padel-club-management-software.html) · Doinsport: [Les Pépites Tech](https://lespepitestech.com/blog/2020/09/29/87-interview-des-pepites-doinsport?page=71) · Padel Manager: [Clupik](https://clupik.com/blog/apps-jugadores-clubes-padel/), [Superprof](https://www.superprof.es/blog/mejores-apps-padel/)
- Argentina/LatAm: [ATC — Infonegocios](https://infonegocios.info/enfoque/se-cansaron-de-llamar-a-cada-club-para-poder-alquilar-una-cancha-y-crearon-una-app-asi-es-alquilatucancha) · [ATC one pager](https://www.cancilleria.gob.ar/userfiles/ut/2025-05_-_one_pager_atc.pdf) · [ATC Google Play](https://play.google.com/store/apps/details?id=com.alquilatucancha&hl=en)† · [Easycancha — Forbes](https://forbes.co/2025/11/06/negocios/esta-plataforma-mueve-us25-millones-al-mes-con-reservas-de-canchas-deportivas/) · [GTP](https://www.gestionatupadel.com/) · [Reservalo](https://reservalo.ar/san-juan/canchas-padel) · [Partido](https://partido.ar/glosario) · [CourtOps](https://www.courtops.net/) · [Turnero](https://www.turneroapps.com.ar/) · [Park Padel (app obligatoria)](https://parkpadel.com/download-app) · [Courtside (reseña)](https://mwm.ai/apps/courtside-padel-app/6737027746) · [CourtReserve waitlist](https://help.courtreserve.com/en/articles/7235129-court-waitlisting)
- Overbooking (patrón multi-canal): [Moder](https://support.moder.fi/support/solutions/articles/101000562671-overbooking-and-double-booking-the-most-common-causes-and-how-to-handle-them) · [Sirvoy](https://help.sirvoy.com/en_US/avoid-and-resolve-overbookings) · [Guía municipal SportFinder (asignación temporal)](https://www.ville-thorigne-fouillard.fr/wp-content/uploads/2025/12/Guide-SportFinder.pdf)
- Técnica: [Hookdeck — WhatsApp webhooks](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices) · [Webhook Relay](https://webhookrelay.com/blog/whatsapp-cloud-api-webhooks/) · [Mercado Pago notificaciones](https://www.mercadopago.com.ar/developers/en/docs/automatic-payments-orders/notifications/orders) · [Google OIDC reference](https://developers.google.com/identity/openid-connect/reference) · [state/nonce/PKCE](https://workos.com/blog/state-nonce-pkce) · [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) · [Cybertec — exclusion constraints](https://cybertec-postgresql.com/en/?p=4305) · [sqlfordevs](https://sqlfordevs.com/non-overlapping-time-ranges)
- Restaurantes (§9): [Cronista](https://www.cronista.com/clase/gourmet/es-una-estafa-me-quieren-cobrar-la-reserva-en-un-restaurante/) · [Qamarero](https://qamarero.com/blog/no-shows-en-restaurantes/) · [Aurora Inbox](https://www.aurorainbox.com/en/2026/05/03/whatsapp-reservation-system-for-restaurants/)
- Internas: `brain/20-lecciones/DB-4`, `SEC-3`, `DX-4`, `DX-1` · `src/plugins/mercadopago/signature.ts` · `src/lib/rate-limit.ts` · `src/lib/auth-password.ts` · `src/lib/whatsapp-cta.ts` · `src/integraciones/redaccion.ts`

— Elaborado por GSG
