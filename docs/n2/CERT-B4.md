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

## Certificador — vuelta 4

- **Rango:** `70cd126a..f42b7797` sobre `origin/n2/b4-caja-club`. Worktree `C:/n2b4`, sin `.env` ni base remota.
- **Tests adversariales propios:** 11, en el scratchpad de la sesión (`b4v4/cert-b4-v4.test.ts`), no en el repo. Pasan 11/11; cuatro registran lo observado (A5, B2, B3, C1 segundo conteo).
- **Este veredicto reemplaza el «Veredicto final» del encabezado del documento.**

Veredicto final: NO CERTIFICA

### Fallas

**F4 · media · El sitio reempaquetado en `f5e64621` no es el que sale del empaquetador.**
- [VERIFICADO] `club.html` y `turnero.html` perdieron todas sus directivas `"use strict"`: 8 y 7 en `70cd126a~1`, 0 en `f5e64621` y `HEAD`. En `origin/main` hay 8.
- [VERIFICADO] En un export LF limpio (`git -c core.autocrlf=false archive`), `motor-club.test.ts` + `copia.test.ts`:
  - en la base `70cd126a~1`: **77/77**;
  - en `HEAD`: **76/77**. Falla «el sitio … está empaquetado con la última versión».
- Con el mismo esbuild (0.28.1), `armarSitio` sobre la fuente de `HEAD` da el sitio commiteado **más** esas 15 directivas. Sin ellas, es igual.
- Consecuencia:
  - La afirmación «el sitio commiteado es exactamente el que sale de `armarSitio`» es falsa en esta máquina.
  - El guardián de deriva queda rojo en un checkout limpio. Q3-C1 pide suites verdes.
  - El `/club` de producción y el turnero público pasan a correr el bundle inline en modo no estricto, un cambio que nadie pidió.
- Arreglo: reempaquetar sobre un checkout LF (`node src/tenants/breakpoint/empaquetar.mjs`) y mostrar `motor-club.test.ts` verde en un export limpio.

**F5 · media · plata/D-16 · Por la acción del servidor, quien no es dueño baja la firma de caja a 2.**
- `guardarFotoDelClub` (`estado-actions.ts:104-127`) acepta la foto entera de cualquier usuario con `agenda:manage`. La red G8 (`src/lib/club/delicado.ts`) conserva usuarios, PIN y sal, pero **no** `config.caja.largoPinFirma`.
- [VERIFICADO] Ataque B3:
  1. Una foto de no-dueño con `config.caja.largoPinFirma = 2` pasa por `conservarLoDelicado` con `corregido = false` y queda guardada con 2.
  2. Sobre lo guardado, `retiroCajaFuerte` de recepción con su PIN de 2 da `ok: true`.
- La vuelta 4 dice «sólo lo cambia un dueño (permiso `configurar`)». Eso vale en el puesto, no en el servidor.
- Contexto: el modo foto ya deja escribir cualquier movimiento (deuda G10, cabecera de `estado-actions.ts`). Pero esta clave es de la familia «PIN», que G8 sí protege, y un solo campo apaga D-16 para siempre.
- Arreglo: en `conservarLoDelicado`, si guarda un no-OWNER, mantener `estado.config.caja.largoPinFirma` de la foto vigente, con un test en `delicado.test.ts`.

### Lo que se probó y resistió

| Ataque | Resultado |
|---|---|
| A1 · Correcciones encadenadas en cobros de cargos: dos pagos parciales iguales en el mismo minuto, cuenta a cargo de otra, ida y vuelta de medio | Caja por medio = pagos por medio después de cada paso. Total sin cambio. |
| A2 · `corregirMedio` con el id de un movimiento de **otro** estado, inexistente, vacío o `__proto__` | Rechazado. La foto queda idéntica. |
| A3 · Corregir en un turno **contado y sin firmar**, en uno firmado y en un día cerrado con el cierre viejo | Rechazado (`m.turno` se sella al contar). La foto queda idéntica. |
| A4 · Débito, monedero, egreso, mismo medio, medio inventado | Rechazado, sin tocar nada. |
| B1 · Reglas con recepción (con su PIN, sin PIN, con el PIN de un dueño) y re-aplicada por `correrComando` | Rechazado. La foto queda idéntica y la firma sigue en 4. |
| C1 · 10 conteos inválidos: sin número o huella, otro número u otra huella, sin efectivo, cantidad distinta, día ajeno, billetes negativos o fraccionarios. Más un segundo conteo con uno pendiente de firma | Todos rechazados. **La foto queda idéntica byte a byte** en cada uno. |
| F1′ · Turno contado a las 23:00, firmado al día siguiente a las 13:00, y cierre de ese día | Pasa. F1 sigue cerrada. |
| F2′ · Recepción con PIN de 2 en egreso, cierre, retiro, egreso por categoría y cierre del día, directo y por `correrComando` (`VERSION_ESTADO` 1), también con el PIN rellenado (`" 33 "`, `"0033"`, NBSP) | Todo rechazado y la foto queda idéntica. F2 sigue cerrada. |

### Observaciones bajas

- **A5 · `corregirMedio` puede dejar el cajón en negativo.**
  - Se cobran $X en efectivo, un dueño firma el retiro de $X y después recepción corrige ese cobro a MP: el efectivo esperado del cajón queda en −$X.
  - `retiroCajaFuerte` impide exactamente eso. Caja = cobrado sigue valiendo, y el cierre lo muestra como diferencia con motivo y firma.
  - Sugerencia: rechazar la corrección de efectivo a otro medio si deja el cajón por debajo de 0.
- **B2 · Un dueño con el PIN viejo de 2 (`pinDesactualizado`) puede guardar «Reglas» y bajar la firma a 2.**
  - `configura` no mira el PIN.
  - Lo frena sólo la pantalla, que obliga a elegir un PIN nuevo antes de operar.
- **[A VALIDAR] de la obs. 3 (otra persona firma la espera).**
  - Por lectura de `CierreDeCaja.tsx:315-345` y `CajaDelClub.tsx:296-299`: la espera se manda con el operador del momento.
  - Con `firmaId` vacío, el PIN de la persona anterior no coincide con la nueva: falla, y cuenta como PIN malo. No hay atajo.
  - Con `firmaId` elegido, firma quien se eligió, con su propio PIN. Sólo puede quedar mal el «responsable».
  - Es baja y se puede quedar en B9.
- `cobrarDeuda` (`motor.mjs:1291`) guarda «Pago (Efectivo)» en el texto de la cuenta corriente. Una corrección de medio no lo actualiza. Es de antes de B4 y no mueve plata.

### Juicio sobre los traspasos y las preguntas (`PLAN-REINGENIERIA-N2.md`, `origin/main` `da9b8f8`)

- **Obs. 3 → B9-C4 / B9-C1.** Los IDs existen (líneas 967 y 970), pero ninguno de los dos criterios dice esto:
  - B9-C4 habla de un corte parcial **en efectivo**.
  - B9-C1 habla de la **cola** local. La espera con MP no está en la cola.
  - El traspaso es aceptable si la PMO agrega a B9 el criterio que propone el ingeniero: la espera sobrevive a recargar y a bloquear, sin PIN.
  - Ojo: B4-C7 («cerrar con MP se encola») sigue siendo de B4.
- **Obs. 6 → Q3-C1.** El ID existe (línea 1060) y el criterio alcanza: `copia.test.ts` y `motor-club.test.ts` detectan la deriva (F4 lo prueba). §9.3 (línea 1205) no tiene ninguna regla sobre la copia del motor, así que citarlo no suma.
- **Obs. 1 (pantalla vanilla `/club` con PIN de 2) → pregunta legítima. No es falla de B4.**
  - Hoy permite mover plata en producción: `app.mjs:2592` y `:2594`, igual en `origin/main`.
  - Pero es el sistema del club de hoy y el plan B del pase (`PASE-AL-ERP.md`, «Si algo falla: volver al club de hoy»).
  - B4 no lo empeora, salvo F4. El plan le da a B4 el ERP (`config-usuarios.tsx`, archivos propios de B4) y no el vanilla.
  - Es una **excepción legítima del plan B**, siempre que quede escrita.
  - Como es una excepción a **D-16, que es decisión del dueño**, la PMO la tiene que llevar al dueño: no la cierra sola.
  - Retirar el vanilla necesita un ID nuevo.
- **Obs. 7 (e2e de caja) → no es una pregunta para la PMO.**
  - [VERIFICADO] B4 sacó «Tendría que haber», que está en `origin/main` (`CajaDelClub.tsx:81`) y ya no en la rama, y `uat-paridad.e2e.ts` §8 (`:1276-1290`) y §10 (`:1418-1426`) dependen de ese texto.
  - Reescribirlos es trabajo de B4, y se puede hacer en esta máquina.
  - Lo único que necesita otra máquina es **correrlos**: eso es verificación pendiente, no una decisión de la PMO.

### Corridas

- `tsc --noEmit`: 406 errores. **0 en los 11 archivos `.ts`/`.tsx`/`.mts` tocados.** El resto viene de módulos que faltan en el `node_modules` compartido: `playwright` 99, `three` 3, `pdf-lib` 2, `qrcode` 2.
- `src/app/admin/(dashboard)/club/*.test.ts`: 658 tests. 579 pasan, 0 fallan, 79 omitidos (Playwright).
- `src/lib/club/*.test.ts` + `src/tenants/breakpoint/*.test.ts`: 188 tests. 178 pasan, 1 falla, 9 omitidos (Postgres).
  - La falla es el empaquetado.
  - En este checkout CRLF falla por el fin de línea.
  - En un export LF limpio sigue fallando por F4, y en la base, no.
- PGlite no hizo falta: ningún cambio toca la base. B3 se probó sobre `conservarLoDelicado`, que es puro.

### Verificación pendiente (no se puede correr acá)

- `test:club-paridad`, `test:club-pase` y `test:club-uat`, con §8 y §10 reescritos. Playwright no arranca en esta máquina.
- Postgres real: RLS y dos puestos guardando a la vez. PGlite no lo prueba.
- QA clic por clic en tablet del recorrido B4 del plan (línea 881).

### Para la vuelta 5 (mirar sólo esto)

1. F4: sitio reempaquetado y `motor-club.test.ts` verde en un export LF limpio.
2. F5: `largoPinFirma` protegido en G8, con su test.
3. Sugerido, no bloquea: la guarda de A5 y la reescritura de §8 y §10.

## Respuesta del ingeniero — vuelta 5

- **Rango:** `0d4b802c..a19bfe59` sobre `n2/b4-caja-club`. Worktree `C:/n2b4`, sin `.env` ni base remota. Sin push.
- **Commits:** `fc8c50fc` (F4), `ac818ce7` (F4, copias del motor), `4e983403` (F5, servidor), `7b13e847` (F5, pantalla), `a19bfe59` (e2e §8 y §10).
- F1 y F2 no se tocaron: sus tests siguen en verde (caja-core, comandos-core, motor).

### F4 · sitio reempaquetado distinto del build — cerrada

- [VERIFICADO] **Causa:** no era el fin de línea sino el tsconfig. esbuild conserva los `"use strict"` de los módulos que envuelve porque `tsconfig.json` tiene `strict: true`. Con el mismo esbuild 0.28.1 y `tsconfigRaw: "{}"`, el turnero sale con 0 directivas; con el tsconfig de la raíz, con 7. El sitio de `f5e64621` se armó sin ese tsconfig.
- [VERIFICADO] **El fin de línea también rompía:** en un checkout CRLF (`core.autocrlf=true`) `empaquetar.mjs` ni siquiera corría («app.mjs ya no importa el motor como espera el empaquetador»). La salida de esbuild sí es igual con CRLF o LF.
- **Arreglo** (`src/tenants/breakpoint/empaquetar.mjs`):
  - lee la fuente con LF (`leerTexto`) aunque el checkout sea CRLF;
  - le pasa a esbuild `tsconfig: <raíz>/tsconfig.json` explícito, y falla si no está.
- **Fin de línea fijado:** `src/tenants/breakpoint/sitio/.gitattributes` (`*.html text eol=lf`) y `src/lib/club/.gitattributes` (`motor.mjs` y `dominio/*.mjs` con `eol=lf`). Esto último hacía falta porque `copia.test.ts` compara sha256 byte a byte: en un clon CRLF limpio fallaba con 76/77 aunque nadie hubiera tocado la copia.
- **Sitio regenerado con el empaquetador oficial** (`node src/tenants/breakpoint/empaquetar.mjs`), no a mano. `club.html` vuelve a tener 8 `"use strict"` y `turnero.html` 7. `index.html` no cambia.
- [VERIFICADO] **Corridas en clones limpios** del scratchpad (`git clone`, sin worktrees nuevos), `motor-club.test.ts` + `copia.test.ts`:

  | Clon | Commit | Resultado |
  |---|---|---|
  | `core.autocrlf=false` | `fc8c50fc` | 77/77 |
  | `core.autocrlf=false` | `ac818ce7` | 77/77 |
  | `core.autocrlf=false` | `a19bfe59` | 77/77 |
  | `core.autocrlf=true` | `ac818ce7` | 77/77 |
  | `C:/n2b4` (CRLF) | `a19bfe59` | 77/77 |

  - En los tres clones limpios, volver a correr el empaquetador deja `git status` vacío.
  - El sitio que arma el checkout CRLF es igual, byte a byte, al que arma el clon LF.

### F5 · firma de caja en 2 por la acción del servidor — cerrada

- **Servidor:** `conservarLoDelicado` (`src/lib/club/delicado.ts`) aplica a quien no es OWNER del ERP. Además de usuarios, PIN y sal, ahora deja como en la foto vigente todo `CONFIG_DELICADA`:
  - `config.caja`: `largoPinFirma` (D-16) y `pedirNombreJugador`;
  - `config.tarifas`: los precios por hora;
  - `config.politica`: seña, cancelación, faltas, tolerancia y apertura;
  - `config.bloqueoMin`;
  - `config.cobro`: el alias de la seña;
  - `config.contactos`: el celular al que van las aprobaciones del dueño;
  - `caja.fondo`.
- **Por qué esos campos:** son todos los que escriben «Reglas y precios» y «Avisos» (`configuracion-core.ts` `ejecutar`, casos `reglas` y `avisos`), más el fondo (`ajustarFondo`). [VERIFICADO] Ningún camino de recepción los escribe: busqué las asignaciones en `motor.mjs` y en `club/*.ts(x)`.
- **Valor nuevo de la base:** si la base no tenía el campo, recepción no puede estrenarlo. Se borra y vale el de fábrica (firma de 4).
- **Pantalla:** `config-reglas.tsx` sólo ofrece los formularios de Avisos y de Reglas en el puesto del dueño (`puestoDeDuenio`). En otro puesto muestra «Esto se hace desde el puesto del dueño». Sin esto, un dueño del club que guardara desde la tablet de recepción vería el cambio en pantalla y la base lo desharía. Los e2e y los tests de pantalla que editan reglas usan OWNER.
- **Tests:**
  - `delicado.test.ts`, +3 casos:
    - el ataque B3 completo (sin la red, recepción firma el retiro; con la red, `pinCorto`);
    - recepción no estrena la firma en 2;
    - un guardado sin cambios pasa tal cual.
    - El caso 1 de antes usaba `caja.fondo` como «lo que sí pasa»: ahora usa el nombre de un cliente.
  - `estado-actions-g8.test.ts`, nuevo y adversarial:
    - llama a `guardarFotoDelClub` (la acción real) con una sesión **RECEPTION**;
    - reemplaza sólo la guardia, el negocio y el repositorio, que quedan en memoria con versión optimista;
    - comprueba que la firma sigue en 4, que los precios, la seña, el fondo y el alias no cambian, que lo demás se guarda, que queda el `console.warn` de G8 y que el retiro con PIN de 2 se rechaza por `pinCorto`;
    - comprueba también que la dueña sí la cambia.
  - [VERIFICADO] **Prueba de mutación:** con `conservarConfigDelicada` apagada, fallan los 3 tests F5.
- [A VALIDAR] **Postgres real con RLS:** la misma acción contra la base no se probó, porque `estado-postgres.test.ts` se saltea sin Postgres. Se cierra corriéndolo en CI.

### e2e de caja (obs. 7)

- **`uat-paridad.e2e.ts` §8,** reescrito según `CierreDeCaja.tsx`:
  - cuenta a ciegas billete por billete y los otros medios;
  - lo esperado lo saca del motor (`turnoDeCajaAbierto`), porque la pantalla no lo muestra;
  - firma con un PIN malo (no firma) y después con el de Majo;
  - «Cerrar el día».
  - Checks nuevos o cambiados: `8.a-ciegas` (antes de contar no se ve lo esperado; después, «cuadra»), `8.caja` (turno firmado por Majo y cierre del día con diferencia 0) y `8.caja-una-vez` (corte «Cerrada», sin otro «Cerrar el día»).
- **§10:** el bucle cierra con `cerrarCajaQueQuedo`, que cubre tres casos: la caja abierta por turno, una atrasada por turnos y una atrasada sin turnos (efectivo a ciegas con firma).
- **`club-pantalla.test.ts`:** la rama de la caja atrasada todavía usaba el rótulo y el PIN de 2 de antes de B4. Se corrigió.
- **Pendiente:** se revisaron contra el código de la pantalla, pero **no se corrieron**. En esta máquina falta `playwright` y Chromium no arranca. **Hay que correrlos en CI o en la nube:** `test:club-paridad`, `test:club-pase` y `test:club-uat`.

### Verificación (vuelta 5)

- **`npx tsc --noEmit`:** 406 errores, la misma cantidad que en la vuelta 4. Ninguno está en líneas de B4: los de `uat-paridad.e2e.ts` y `club-pantalla.test.ts` son los de siempre, porque falta `playwright`.
- **`src/lib/club/*.test.ts` + `src/tenants/breakpoint/*.test.ts`:** 191 tests. Pasan 182, fallan 0 y se saltean 9 (Postgres).
- **`src/app/admin/(dashboard)/club/*.test.ts`:** 660 tests. Pasan 581, fallan 0 y se saltean 79 (Playwright).
- **No verificado acá:** los e2e (Playwright), Postgres real con RLS y dos puestos, y el QA clic por clic en tablet.
- **Fuera de alcance, sin tocar:** las observaciones bajas A5 (`corregirMedio` puede dejar el cajón en negativo) y B2 (un dueño con `pinDesactualizado` puede guardar Reglas).

## Certificador — vuelta 5

- **Rango:** `0d4b802c..a43e36a1` (6 commits, `fc8c50fc`…`a43e36a1`). Worktree `C:/n2b4`, sin `.env` ni base remota.
- **Tests adversariales propios:** en el scratchpad de la sesión (`b4v5/cert-b4-v5.test.ts` y `b4v5/cert-b4-v5-accion.test.ts`), no en el repo. El segundo usa los mismos dobles que `estado-actions-g8.test.ts` (guardia, negocio y repositorio en memoria) y llama a `guardarFotoDelClub` tal cual.
- **Este veredicto reemplaza el «Veredicto final» del encabezado del documento.**

Veredicto final: NO CERTIFICA

### Fallas

**F6 · media · plata/D-16 · Recepción se pone un PIN propio de 4 dígitos por el servidor y firma retiros, egresos y cierres.**
- [VERIFICADO] Ataque V5-A, por la acción real con sesión RECEPTION:
  1. La dueña guarda el club con `config.caja.largoPinFirma = 4` y los PIN con hash.
  2. Recepción manda la foto con su propio usuario (`u-lu`) con `pin = hashPin("4444", salPin)` y `pinLargo: 2`.
  3. `conservarLoDelicado` lo acepta como «PIN propio válido para su rol» (`delicado.ts:99`: para un PIN con hash sólo mira `pinLargo`, que declara el navegador y el servidor no puede comprobar). `corregido = false`: no queda ni el `console.warn` de G8.
  4. Sobre lo guardado, `retiroCajaFuerte` de Lu con `"4444"` da `ok: true` y queda «firma: Lu (recepción tarde)». Lo mismo `egresoPorCategoria` y, por la pantalla, `ejecutarCaja` `retiro` (`pin: "bueno"`, `duenio: false`).
  5. Pasa igual con una base con PIN en claro, estrenando una sal válida.
- **Causa:** `firmarCaja` (`motor.mjs:2849-2851`) decide la firma por el largo del PIN **tipeado**, no por el rol de quien firma. Lo mismo el chequeo del egreso y el cierre viejos en `caja-core.ts:418`. La pantalla, en cambio, ya usa el rol (`puedeFirmarCierres`, `caja-core.ts:157-161`: `largoPin(u.rol) >= largoFirmaCaja`).
- **Por qué es de B4:** la red G8 de PIN es del 21/10, pero hasta B4 un PIN de 4 en un usuario de recepción no le daba nada. Con D-16, el largo pasó a ser el permiso. Es la misma familia y el mismo modelo de amenaza que F5: un pedido armado a mano desde la tablet apaga D-16 para siempre, ahora sólo para ese usuario.
- **Arreglo sugerido:**
  - En `firmarCaja`, exigir además `largoPin(f.usuario.rol) >= largo`, el mismo criterio de `puedeFirmarCierres`. Lo mismo en `caja-core.ts:418` para `egreso` y `cerrar`.
  - Test: recepción con PIN con hash de 4 y `pinLargo: 2` no firma `retiro`, `egresoCategoria`, `cerrarTurno`, `cerrarDia`, `egreso` ni `cerrar`, tanto directo como por `correrComando`.
  - Si el cambio va en `motor.mjs`: es copia controlada. Hay que repetir la copia a la fuente, `empaquetar.mjs` y el sha (obs. 6).

### F4 y F5 de la vuelta 4: cerradas

- **F4 · cerrada.** [VERIFICADO]
  - Clones limpios de `a43e36a1` con `core.autocrlf=false` y `=true`. En los dos, `node src/tenants/breakpoint/empaquetar.mjs` deja `git status` vacío.
  - Los tres HTML dan el mismo sha256 en los dos clones (`club.html` `2499e70f…`, `index.html` `9bdc88de…`, `turnero.html` `a279ee44…`). `club.html` tiene 8 `"use strict"` y `turnero.html` 7.
  - `copia.test.ts` + `motor-club.test.ts`: **77/77** en cada clon.
  - Los `.gitattributes` alcanzan exactamente 7 archivos: `motor.mjs`, los 3 de `dominio/` y los 3 HTML del sitio. Los 7 ya estaban con LF en el índice, así que no renormalizan nada ajeno ni cambian otro archivo. Efecto menor: en un checkout CRLF que ya existía, esos archivos aparecen como «modificados» sin diferencias hasta que se refresca el índice (`C:/n2b4` lo muestra hoy). No rompe nada.
- **F5 · cerrada.** [VERIFICADO]
  - El ataque B3 de la vuelta 4 ahora da `corregido = true` y no deja guardado `largoPinFirma`. El retiro de Lu con `"33"` se rechaza.
  - V5-C, formas raras: `config.caja` como array, `null`, texto, número, con `__proto__`, `largoPinFirma` como texto, claves duplicadas en el JSON (gana la última, igual que en el repositorio), y una base sin `config.caja`. En todos, la firma queda en 4.
  - El repositorio guarda la foto hidratada (`estado-repo.ts:223-226`, `hidratarEstado`), que exige `usuarios`, `config` y `caja`. No hay forma de esquivar la red mandando una foto sin usuarios.
  - **El dueño sigue pudiendo todo:** OWNER no pasa por `conservarLoDelicado` (`estado-actions.ts:117`), y el test de la dueña baja la firma a 2. V5-D: sin cambios delicados, el texto pasa byte a byte.
  - **Otra acción del servidor:** no hay. `estado-actions.ts` es el único `"use server"` del club y no hay rutas `/api` que escriban la foto. `revisar…` y `restaurar…` son sólo OWNER.

### F1 y F2 de la vuelta 1: siguen cerradas

- Los 11 ataques de la vuelta 4 (`b4v4/cert-b4-v4.test.ts`) pasan 11/11 sobre `a43e36a1`.
- F1′: un turno contado a las 23:00 y firmado al día siguiente a las 13:00 se cierra.
- F2′: recepción con PIN de 2 no hace egreso ni cierre por el camino viejo, directo, por `correrComando` ni con el PIN rellenado.

### Observaciones

- **O1 · e2e §8: el «a ciegas» no prueba C1 para recepción.** Revisado contra `CierreDeCaja.tsx` y `CajaDelClub.tsx`:
  - Los rótulos, roles y botones coinciden con la pantalla, también los de §10 y `club-pantalla.test.ts`.
  - El flujo contar → ver la diferencia → PIN malo no firma → firmar → cerrar el día está bien armado.
  - Pero `8.a-ciegas` corre como **Majo (dueña)**, que por diseño ve «Efectivo en el cajón» (`CajaDelClub.tsx:288`, `veEsperado`).
  - Además mira sólo la región «Cierre del turno», que no muestra lo esperado a nadie.
  - Y no prueba nada si el efectivo es 0 o justo un billete (`!DENOMINACIONES.includes`).
  - Tampoco se prueba que el PIN de 2 de recepción no firme: el PIN malo es `1111`, de 4.
  - **Sugerencia:**
    - contar como Lu y afirmar sobre **toda la página** que no aparecen `pesos(efectivo)` ni los ingresos, y que se ve `[data-caja="a-ciegas"]`;
    - intentar firmar con `"33"`;
    - firmar eligiendo a Majo en «Firma».
  - No bloquea: el criterio C1 ya lo cubren `caja-core.test.ts` y los tests de pantalla.
- **O2 · baja · config fuera de `CONFIG_DELICADA`.** [VERIFICADO] V5-B: desde recepción pasan `config.finde`, `feriados` y `corteCaja`, los precios de `productos`, y `clientes[].cc` (`habilitada` y `limite`).
  - `cc` y `fiados` son aprobaciones de un dueño guardadas como dato. Es la misma deuda G10 del modo foto, no de B4.
  - La PMO la tiene que ver junto con G10 y B9.
- **O3 · baja · la corrección del servidor es silenciosa para la tablet.**
  - `guardarFotoDelClub` responde `{ ok, version }` sin decir que corrigió.
  - El puesto sigue operando con su copia local hasta que recarga o choca (`guardado-en-la-base.ts:340`).
  - No abre plata nueva, porque para tener la copia local tocada ya hace falta G10. Pero confunde.

### Corridas

- `tsc --noEmit`: 406 errores, igual que en la vuelta 4.
  - **0 en `delicado.ts`, `estado-actions.ts`, `config-reglas.tsx`, `estado-actions-g8.test.ts` y `delicado.test.ts`.**
  - Los de `uat-paridad.e2e.ts` y `club-pantalla.test.ts` son todos TS2307, TS7006 o TS7031: falta `playwright` en el `node_modules` compartido.
- `src/lib/club/*.test.ts` + `src/tenants/breakpoint/*.test.ts`: 191 tests. Pasan 182, fallan 0 y se saltean 9 (Postgres).
- `src/app/admin/(dashboard)/club/*.test.ts`: 660 tests. Pasan 581, fallan 0 y se saltean 79 (Playwright).
- Propios:
  - `cert-b4-v5`: V5-A falla 2/2. Es el registro de F6.
  - V5-B, V5-C y V5-D pasan.
  - `cert-b4-v5-accion` (F6 por la acción real) falla 1/1.

### Verificación pendiente (no se puede correr acá)

- `npm run test:club-paridad`, `npm run test:club-pase` y `npm run test:club-uat`, con `playwright` y Chromium.
- `node --import tsx --test src/lib/club/estado-postgres.test.ts src/lib/club/caja-turnos-postgres.test.ts`, con Postgres real (RLS y dos puestos).
- QA clic por clic en la tablet del recorrido B4.

### Para la vuelta 6 (mirar sólo esto)

1. F6: la firma por rol en `firmarCaja` y en `caja-core.ts:418`, con su test, y la copia del motor resincronizada (`copia.test.ts` + `motor-club.test.ts` en verde).
2. Sugerido, no bloquea: O1, el «a ciegas» de §8 como recepción.
