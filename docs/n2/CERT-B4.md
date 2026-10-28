# CERT-B4 · Caja completa del club (Break Point)

- **Rama:** `n2/b4-caja-club`. Base certificada: `f708522` (`origin/main` `a48c3f0` + merge de `origin/reing-bp-t3c` `9ea994b`, sin conflictos).
- **Riesgo:** plata y concurrencia. El certificador adversarial trabajó sobre el diff, en Opus. `escaladoAFable`: no.
- **Veredicto final: CERTIFICA.** No quedan fallas altas ni medias.

## Vueltas de certificación

| Vuelta | Commit | Veredicto | Hallazgos |
|---|---|---|---|
| 1 | `d4625c6` | NO CERTIFICA | **F1 alta:** un día trabajado por turnos que pasó el mediodía no se podía cerrar. **F2 media:** recepción, con PIN de 2, todavía podía hacer egresos y cierres por el camino viejo. **F3 media:** un conteo hecho sin internet podía aplicarse a otro turno. |
| 2 | `a742be2` | NO CERTIFICA | F1, F2 y F3 cerradas. **F2' media:** el egreso viejo se salteaba el largo de firma si llegaba con un `firmaId` inexistente. |
| 3 | `9b76199` | **CERTIFICA** | F2' cerrada. Los 7 ataques de la vuelta 3 pasan y los 8 de la vuelta 2 también. |

**Después de la certificación**, en `4ea7d89`:

- **Arqueo a ciegas:** recepción ya no ve el importe de los movimientos del turno abierto (`caja-core.ts:157`, `:171`; `CajaDelClub.tsx:148-215`).
- **Nombre del jugador (B4-C5):** la cuenta muestra el campo «Nombre o teléfono de Jugador N», con sugerencias de las fichas.
- **Revisión:** fue liviana, porque el cambio sólo toca la pantalla y una función de vista pura. Los tests de `caja-core` y `cuenta-core` pasan 59/59.

## Verificación

- `tsc --noEmit` en 0.
- Suites `src/lib/club/*.test.ts` y `src/app/admin/(dashboard)/club/*.test.ts`: **732/735**.
- Las 3 fallas son de `cuenta-y-buffet-pantalla.test.ts` (Playwright, *strict mode*: «Lucas Fernández, Cancha» encuentra 2 botones). **Fallan igual en la base `f708522`**: vienen de antes y dependen de la fecha de la demo.

## Criterios

| Criterio | Estado |
|---|---|
| C1 · cierre por turno a ciegas, billetes, motivo, consolidación del día | CUMPLE |
| C2 · corregir medio | CUMPLE |
| C3 · retiro y egresos por categoría | CUMPLE |
| C4 · firma con PIN de 4 | CUMPLE |
| C5 · nombre del jugador | CUMPLE en la UI; obligatorio sólo si `config.caja.pedirNombreJugador` |
| C6 · archivo del día | CUMPLE |
| C7 · sin internet | CUMPLE |
| C8 · evento de caja | PREPARADO |

C8: no existe un canal de eventos en `src/lib`. El comando ya arma `caja.turno.cerrada@1` en su resultado y queda listo para cuando exista B1.

## Observaciones abiertas (bajas o de alcance)

> Vuelta 4: el destino de cada una está en «Respuesta del ingeniero — vuelta 4». Se corrigieron 2, 4 y 5; se traspasaron 3 (a B9) y 6 (a Q3); 1 y 7 quedan como preguntas para la PMO.

1. **La pantalla vanilla `src/tenants/breakpoint/sitio/club.html` (:7448-7481, :8297-8299) no cumple D-16, y esto es de antes del diff.**
   - Todavía ofrece «Egreso en efectivo» con PIN de 2.
   - Tiene un cierre que muestra lo esperado.
   - `M.egresoCaja` y `M.cerrarCaja` del motor no validan el largo de firma.
   - **Falta decidir el alcance:** alinearla en otra tanda o retirarla.
2. Si en la cola hay un `contarTurno` de antes del deploy, sin `numero` ni `huella`, se aplica la regla vieja (cantidad + medios).
3. Un cierre con MP en espera guarda el PIN en la memoria de la pestaña. Si se recarga, hay que volver a hacerlo.
4. `corregirMedio` no cambia el medio en los pagos de cuentas de cargos (en los pagos del turno, sí). `cobrarParte` no lleva el nombre del jugador.
5. `largoPinFirma` y `pedirNombreJugador` todavía no se configuran desde la pantalla; sólo desde la foto.
6. **Integración:** `motor.mjs` es una copia controlada (`ORIGEN.json` fijado en `d4625c6`). Si otra tanda toca el motor, hay que repetir la copia a la fuente, `empaquetar.mjs` y el sha.
7. Los e2e `ensayo-pase` y `uat` que usan el egreso o el cierre viejos no se corrieron.

## Decisiones del dueño

- **D-16:** la firma lleva PIN de 4 dígitos. Es un valor **provisional, a confirmar con el dueño**, y se configura en `config.caja.largoPinFirma`.
- **Alcance de la pantalla vanilla `club.html`:** ver la observación 1.

## Respuesta del ingeniero — vuelta 4

Objetivo: que las 7 observaciones abiertas queden en cero. Cada una se corrigió con su test (si es de B4 según `PLAN-REINGENIERIA-N2.md` §5, Tanda B4) o tiene destino: un ID y un criterio del plan, o una pregunta concreta para la PMO.

### Destino de cada observación

| # | Observación | Destino | Dónde |
|---|---|---|---|
| 1 | Pantalla vanilla `club.html` sin D-16 | **Pregunta para la PMO** (ver abajo). En el ERP no hay hueco. | — |
| 2 | `contarTurno` sin `numero` ni `huella` cae en la regla vieja | **Corregida (B4-C1/C7).** Sin número ni huella del turno, no se aplica: se vuelve a contar. | `70cd126` |
| 3 | El cierre con MP en espera tiene el PIN sólo en la memoria de la pestaña | **Traspasada a B9-C4** (y B9-C1). | — |
| 4a | `corregirMedio` no corrige el pago de las cuentas de cargos | **Corregida (B4-C2)** en el motor. | `34a3083`, `f5e6462` |
| 4b | `cobrarParte` no lleva el nombre del jugador | **Corregida (B4-C5).** | `e40ef50` |
| 5 | `largoPinFirma` y `pedirNombreJugador` sólo se configuran desde la foto | **Corregida (B4-C4/C5).** Ahora se configuran en «Reglas y precios». | `5c79c69` |
| 6 | Copia controlada de `motor.mjs` | **Traspasada a Q3-C1** (y §9.3). | — |
| 7 | Los e2e `ensayo-pase` y `uat` no se corrieron | **Pregunta para la PMO**: en esta máquina no se pueden correr (ver abajo). | — |

### Lo que se corrigió

**2 · Conteo sin número ni huella** (`caja-core.ts`, en `sinFirma`)
- `numero` y `huella` pasan a ser obligatorios en `AccionCaja.contarTurno`.
- Sin ellos, la respuesta es «Este conteo no dice de qué turno es: volvé a contar».
- [VERIFICADO] Ningún puesto de producción pudo encolar uno así: `git branch -r --contains d4625c6` sólo devuelve `origin/n2/b4-caja-club`. La caja por turnos no está en `main`.
- **Test adversarial:** `caja-core.test.ts`, «F3 (vuelta 4)».
  - Se prueban 6 variantes: sin los dos, sólo número, sólo huella, número como texto, huella vacía y número `NaN`.
  - Todas van sobre otro turno con la misma cantidad y los mismos medios.
  - Ninguna sella el turno. El conteo de la pantalla, con número y huella, sigue pasando.

**4a · `corregirMedio` en cuentas de cargos**
- El cambio está en la fuente del piloto (`public/previews/breakpoint/club/motor.mjs`).
- `pagarCuenta` y `cobrarCuentaYSusCargos` guardan `cuentaId` en el movimiento de caja.
- `corregirMedio` cambia el medio del pago de **esa** cuenta, buscando el mismo medio, monto y minuto.
- Un movimiento viejo sin `cuentaId` se corrige sólo en la caja, como antes.
- Copia: `scripts/club-resync.mjs --ref HEAD --apply`; `ORIGEN.json` quedó en `34a3083`.
- `motor.d.mts` suma `MovimientoCaja.cuentaId`.
- El sitio se reempaquetó: `club.html` y también `turnero.html`, que trae el motor.
- `respaldo-ejemplo.json` se rearmó, porque `anonimizar.test.ts` lo exige reproducible. El diff sólo suma `cuentaId`.
- **Test:** `motor.test.ts`, «B4-C2 (vuelta 4)».
  - Dos cobros iguales en el mismo minuto: sólo cambia la cuenta corregida.
  - Cobro de una cuenta con otra a su cargo: cada movimiento corrige su propia cuenta.
  - Un movimiento viejo no rompe.
  - La plata de la caja no cambia.

**4b · «Sólo la cancha» de «Jugador N»**
- La acción `cobrarParte` (`cuenta-core.ts`) lleva `quien` y pasa por `prepararQuien`, igual que `cobrarJugador`.
- La pantalla (`CuentaDelTurno.tsx`) lo manda desde el botón «Sólo la cancha».
- **Test adversarial:** `cuenta-core.test.ts`, «B4-C5 (vuelta 4)».
  - Con `pedirNombreJugador`, cobrar sin decir quién es se rechaza y no entra plata.
  - Un cobro fallido devuelve el nombre «Jugador 2» y no crea ficha.
  - Con nombre y teléfono, el nombre queda en el movimiento y se crea la ficha.
  - Sin la opción, el cobro funciona como siempre.

**5 · Configuración en «Reglas y precios»** (`configuracion-core.ts`, `config-reglas.tsx`)
- «PIN que firma cierres, retiros y egresos»: 2 o 4 dígitos (`LARGOS_DE_FIRMA`).
  - Son los largos de PIN que existen (`LARGO_PIN`).
  - Uno más largo dejaría la caja sin nadie que pueda firmar.
- «Pedir nombre o teléfono de Jugador 2, 3 y 4 al cobrar».
- Sólo lo cambia un dueño (permiso `configurar`). Se aplica entero o nada.
- Una acción de antes, sin estos campos, no los toca.
- **Test adversarial:** `configuracion-core.test.ts`, «B4-C4/C5 (vuelta 4)».
  - Recepción intenta bajar la firma a su PIN de 2: rechazado.
  - Largos 6, 8, 3, 0, vacío, `4.0x` y −4: rechazados, sin aplicar nada.
  - La acción vieja no cambia la caja.
  - El dueño la pone en 2 y la vuelve a 4. Con 4, recepción ya no firma un retiro.

**F1 y F2 no se reabren.**
- No se tocó `cerrarCaja`, `cerrarDiaCaja` ni la guarda de firma del egreso y el cierre viejos (`caja-core.ts:418`).
- Las pruebas de F1, F2, F2' y F3 de las vueltas 1 a 3 pasan.
- La firma configurable sólo la cambia un dueño, y su valor de fábrica sigue siendo 4.

### Traspasos

**3 → B9-C4** («Borrador al bloquear… corte parcial de caja (B4) usable sin red») **y B9-C1** («recargar sin internet abre el club con la cola local intacta»).
- Hoy el cierre en espera vive en un `useRef` (`CierreDeCaja.tsx:315`) y la pantalla avisa «no recargues la página» (`:356`).
- Guardar ahí el PIN sería peor: la cola nunca lleva PIN (`comandoSinPin`).
- Criterio que se pide a B9:
  - El cierre en espera sobrevive a recargar y a bloquear, **sin el PIN**.
  - Al volver la señal, pide la firma de nuevo.
- [A VALIDAR en B9] Si la pantalla se bloquea y entra otra persona antes de que vuelva la señal, el envío de la espera puede firmar como la persona nueva, con el PIN de la anterior. Se cierra leyendo `CierreDeCaja.tsx` junto con `bloqueo-core.ts`.

**6 → Q3-C1** («cada PR entra con `tsc` limpio y suites verdes corridas por script») **y §9.3.**
- La deriva ya la detectan los tests:
  - `src/lib/club/copia.test.ts`: el sha de `ORIGEN.json`.
  - `motor-club.test.ts`: el sitio empaquetado contra la fuente.
- Cada tanda que toca el motor (B1, B5, B7, B8, B10, B11) y cada merge que choque en el motor tienen que hacer tres pasos:
  1. `node scripts/club-resync.mjs --ref <commit de la fuente> --apply`.
  2. Reempaquetar.
  3. Rearmar `respaldo-ejemplo.json` si cambia la forma de la foto.

### Preguntas para la PMO

**Obs. 1 — ¿Qué se hace con la pantalla vanilla `/club` (el club de hoy) frente a D-16?**

Hechos [VERIFICADO]:
- En el ERP no hay hueco: toda la caja pasa por `ejecutarCaja` (`comandos-core.ts:113`). El egreso y el cierre viejos exigen el largo de firma (`caja-core.ts:418`).
- El único camino que llega a `M.egresoCaja` y `M.cerrarCaja` sin esa guarda es `app.mjs` del vanilla (`:2592`, `:2594`).
- El vanilla es el **plan B del pase** y el link del aprobador (`docs/tenants/breakpoint/PASE-AL-ERP.md:115`, `:150-154`, `:169-181`).
- Su texto le promete a recepción «egreso en efectivo, cierre de caja» (`app.mjs:1021`).
- Su cierre arranca con lo esperado ya cargado (`app.mjs:1774`).
- Varios tests del motor fijan hoy que recepción egresa y cierra: `motor-club.test.ts:269-271`, `pin-por-rol.test.ts:102`, `motor.test.ts:688`.

Opciones:
- **(A) Alinearla ahora.**
  - Qué cambia: el motor exige el largo de firma en `egresoCaja` y `cerrarCaja`, y el cierre del vanilla pasa a ser a ciegas.
  - Costo: el plan B cambia de reglas. Recepción ya no cierra ni egresa sin un dueño. Hay que cambiar esos tests y el texto.
- **(B) Retirarla cuando el pase quede firme** y dejar sólo `#aprobar`.
  - El plan no tiene una tanda para esto: necesita un ID nuevo.
- **(C) Dejarla como excepción explícita a D-16** mientras sea plan B.

Recomendación: **(C) ahora y (B) después del pase.** El ERP ya cumple D-16. Cambiar las reglas del plan B en medio del pase agrega riesgo al día del cambio.

**Obs. 7 — ¿Quién reescribe y corre los e2e de caja?**

[VERIFICADO] Acá no se pueden correr:
- `playwright` no está en el `node_modules` compartido.
- Con un Playwright temporal en el scratchpad, `chromium-1228` no arranca (`browserType.launch: spawn UNKNOWN`).

[VERIFICADO] Lectura del código:
- `uat-paridad.e2e.ts` §8 (`:1280`) y §10 (`:1418`) cierran la caja del ERP con el formulario viejo: «Tendría que haber» y «Efectivo contado» con lo esperado a la vista. **Con B4 van a fallar:** el cierre ahora es por turno y a ciegas. Hay que reescribirlos así: contar → firmar con PIN de 4 → cerrar el día.
- `ensayo-pase.e2e.ts` A3 cierra en el vanilla con un dueño (PIN de 4): no lo afecta B4.

Opciones:
- **(A)** Una vuelta 5 de B4 en una máquina con Playwright, que reescriba §8 y §10 y corra `test:club-pase`, `test:club-paridad` y `test:club-uat`.
- **(B)** Que lo haga la tanda de corrección que abre Q2. Q2-C2 recorre «caja por turno», pero Q2 no toca código.

Recomendación: **(A)**, antes del PR de B4 (Q3-C1).

### Verificación (vuelta 4)

**`npx tsc --noEmit`: 406 errores, ninguno de B4.**
- Son 99 + 7 de módulos que faltan en el `node_modules` compartido: `playwright`, `three`, `pdf-lib`, `qrcode`.
- El resto son tipos `any` en cascada de esos mismos archivos.
- 0 errores en los archivos tocados.

**Tests**
- `src/app/admin/(dashboard)/club/*.test.ts`: 658 tests; **579 pasan, 0 fallan, 79 omitidos.** Los omitidos son las pantallas con Playwright, que no está instalado.
- `src/lib/club/*.test.ts` + `src/tenants/breakpoint/*.test.ts`: 188 tests; **178 pasan, 1 falla, 9 omitidos.** Los omitidos son los de Postgres.
- La falla es «el sitio … está empaquetado con la última versión». Es del entorno: el checkout de Windows tiene CRLF y el empaquetador busca `import … from "./motor.mjs";\n`. Pasa lo mismo sin los cambios de esta vuelta.
- Comprobado aparte: el sitio commiteado es exactamente el que sale de `armarSitio` sobre la fuente LF de `HEAD`. `index.html`, `club.html` y `turnero.html` son iguales.

**No verificado**
- Nada en el navegador: no hay `.env` ni base, por decisión.
- PGlite no hizo falta: ningún cambio toca la base. RLS y concurrencia quedan fuera, como en la vuelta 3.
