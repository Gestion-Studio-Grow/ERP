# Dictamen final (v6) · BP Tanda 3C · rama reing-bp-t3c · HEAD 035cc59d

Diff certificado: c072b982..035cc59d, mirado contra toda la tanda (576cef3a..HEAD), sólo en lo que toca este arreglo.
Riesgos atacados: datos y concurrencia. Todo se probó en memoria con el almacén real; nada se corrió contra Neon.

## Veredicto: CON OBSERVACIONES
Las 2 fallas medias de la v5 están cerradas. Quedan 5 observaciones bajas. Ninguna deja dos turnos en el mismo hueco ni mueve plata.

## Qué trae la Tanda 3C (576cef3a..035cc59d)
- **Motor** (`src/lib/club/motor.mjs`, copia controlada; `ORIGEN.json`, sha256 0c290a3d…, coincide con `public/previews/breakpoint/club/motor.mjs`). Los fijos tienen `desde`, `hasta` y `pausa`, más `fijoJuegaEl`, `fijoBajadoEl` y `darDeBajaFijo` (baja o pausa, con la plata de cada turno). También trae lo que necesitan las otras tandas: `autorizarNovedad` (3A), el desglose del archivo (3B), y fin de semana, feriados y horario de un día (3D).
- **BP-100…104**: hoja «Dar de baja» con previa sobre una copia, Confirmar, Deshacer y el aviso por WhatsApp. Incluye pausa y liberar una fecha. BP-101: «vuelve solo» al acortar una pausa.
- **BP-103/105**: «Fijo semanal» en el alta. Hay un test Postgres de la baja.
- **v6 (este diff)**:
  - Un solo guardián para todo fijo nuevo: `fijoQuePisaAlNuevo` (canchas-core.ts:242). Mira 80 semanas y se llama en `nuevoFijo` (:343), en el alta (alta-core.ts:344) y en «Hacer fijo» (cuenta-core.ts:592). Busqué con grep: no hay otra puerta de UI hacia `crearFijo`. El club vanilla (`sitio/club.html`) sólo lo usa en `generarDemo`.
  - Una pausa sin fecha de vuelta contra el fijo de otro se rechaza y no cambia nada (:451). Las fechas se liberan sólo cuando hay vuelta (:470).
  - Campo nuevo `Fijo.liberadasPor`, opcional (motor.d.mts:364), sin migración. Lo usa `devolverLiberadasPor` (:499).

## Verificación de lo declarado
- **Falla 1 v5 (idempotencia): CERRADA.** Con Pedro permanente, repetir la pausa da el mismo rechazo y el estado no cambia (repo «v5-2»). Si el choque es acotado, la réplica deja el mismo estado y dice lo mismo (repo «v5-2b»).
- **Falla 2 v5 (puertas sin guardián): CERRADA.** Mi v5-9, v5-10 y v5-11 originales ahora fallan porque las dos puertas rechazan, que es lo correcto. Con dos puestos creando un fijo en el mismo hueco (PC «Nuevo fijo», tablet sin red «Fijo semanal»), al re-aplicarse queda uno solo (v6-D4).
- **Mi v5-fijos.test.ts original contra HEAD da 5/12.** Las 7 diferencias son legítimas:
  - v5-1, v5-2, v5-5 y v5-6 armaban a Pedro permanente, y eso ahora se rechaza a propósito (Falla 1). El constructor les puso `hasta: d(5)` para que sigan probando la liberación con choque acotado. Lo comprobado no se debilitó.
  - v5-7 se endureció: ahora exige que la fecha quede para Juan.
  - v5-9, v5-10 y v5-11 eran los reproductores de la Falla 2.
  - «BP-101 (cert v4) 1»: `B.hasta = dV4(5)` es legítimo por la misma razón, y el caso permanente quedó cubierto en «v5-2».
- **`liberadasPor`**:
  - Una foto vieja sin el campo no rompe; la baja simplemente no devuelve nada. El campo sobrevive a serializar e hidratar (v6-1).
  - Dar de baja a Pedro dos veces no duplica ni vuelve a bajar turnos (v6-2).
  - Deshacer la baja de Pedro cuando ya subió revierte la devolución en la base y en la tablet, exacto (v6-D1).
  - Con dos puestos en ambos órdenes (tablet sin red), la fecha termina en Juan y `liberadasPor` queda vacío (v6-D2, v6-D3).
- **UI**: la pausa rechazada aparece en la previa (`role="alert"`) y Confirmar queda deshabilitado. En la misma hoja hay otra fecha y «Dar de baja», así que no es un callejón sin salida.

## Observaciones (todas BAJA)
1. **«Vuelve» no garantiza que el choque sea acotado** (v6-3). Caso: Pedro es permanente pero liberó una fecha, la d(6). La pausa se acepta con «vuelve solo el d(6)», y desde d(7) Juan y Pedro siguen siendo permanentes en el mismo hueco. Sólo pasa con estados heredados: `main` deja crear fijos solapados (`nuevoFijo` valida una sola fecha y «Hacer fijo» ninguna). La pausa no empeora el solape, pero el mensaje lo calla. **Arreglo:** en :451, además de `!g.vuelve`, rechazar si el otro fijo sigue pisando después de `vuelve` (barrer como `fijoQuePisaAlNuevo`, excluyendo al propio fijo).
2. **Mensaje falso con Pedro acotado pero largo** (más de 8 fechas, v6-4). Se rechaza con «no tiene a qué volver» aunque vuelve el d(15). Es seguro, y pausar hasta d(14) funciona. Además «Elegí otra hora» no se puede hacer desde la hoja de pausa.
3. **Copia**: sale «Juan Fijo recuperan el…» (:490). El plural se arma por cantidad de fechas, no de titulares (v6-5; el test del repo v5-7 afirma la forma incorrecta). A Juan nadie le avisa por WhatsApp que recupera esas fechas.
4. **Pendiente declarado**: si Pedro sólo se pausa o libera la fecha, Juan no la recupera (v6-7). El hueco queda vacío; no hay doble turno ni plata en juego.
5. **Pendiente declarado**: nada vacía `liberadasPor`. Las entradas pasadas no tienen efecto y suman como mucho 8 por cada acortar.

## Historia de vueltas
- **Workflow:**
  - v1 Opus, CON OBS: los turnos cancelados no volvían; un «desde» posterior borraba la pausa.
  - v2 Opus, NO CERT: el sitio sin reempaquetar; la previa del Fijo semanal no veía nada; el turno quedaba libre hasta el próximo arranque.
  - v3 escalada a Fable, NO CERT: «vuelve solo» anunciaba una fecha ocupada.
- **Fuera del workflow:**
  - v4 NO CERT: no veía el fijo de otro todavía sin bajar.
  - v5 NO CERT: la pausa no era idempotente y había dos puertas sin guardián.
  - v6 CON OBSERVACIONES.

## Verificación n/n
- `npx tsc --noEmit`: 0 errores.
- Suites del club (`club/*.test.ts` + `src/lib/club/*.test.ts`): 717/718. La única falla es BP-056 («Tanda 2D en el navegador», selector Playwright con 2 coincidencias), conocida y ajena a este diff.
- Adversariales v6: núcleo 5/7 (v6-3 y v6-5 fallan, son las observaciones 1 y 3); dos puestos 4/4. v5 original: 5/12, explicado arriba.
- Los tests se copiaron a `src/test/`, se corrieron y se borraron: el árbol quedó limpio (`git status` vacío). Archivos: `cert-bp-t3C/v6-fijos.test.ts` y `cert-bp-t3C/v6-dos-puestos.test.ts`.

## Respuesta del ingeniero — v7

Base: HEAD `9ea994b8`. Las 5 observaciones son de código que escribió la 3C (guardia de la pausa, `liberadasPor`, textos de la baja), así que se cierran acá, cada una con su test (`canchas-core.test.ts`, bloque «Dictamen v6»). El motor no se tocó: `ORIGEN.json` y los sha256 siguen iguales. Ningún arreglo deja dos fijos jugando el mismo hueco ni mueve plata: sólo cambian `excepciones` y `liberadasPor`, y los turnos que se bajan pasan por `materializarFijos`.

| Obs. | Qué se hizo | Test |
|---|---|---|
| 1 (v6-3) | En la guardia de la pausa (`correrBajaFijo`), además de «sin vuelta», se rechaza la pausa si después de `vuelve` otro fijo sigue jugando el mismo hueco. El barrido es `otroFijoQueSigue`, 80 semanas, igual que `fijoQuePisaAlNuevo`. Mensaje: «Juan volvería el …, pero el … el hueco sigue siendo del fijo de Pedro (martes 22:00): se pisarían». La pausa rechazada no cambia nada, y repetirla da el mismo mensaje. | v7-1 |
| 2 (v6-4) | `vueltaDelFijo` mira 80 semanas en lugar de 8 fechas: con Pedro acotado pero largo, se acepta y dice la vuelta real. Si hay más de 4 fechas, el mensaje y el WhatsApp las resumen («No vuelven 11 fechas, del … al …»). «Elegí otra hora» pasa a ser «Dalo de baja o liberá sólo las fechas que no viene», que se puede hacer desde esa misma hoja. | v7-2, cert v4-3 y v5-2 ajustados |
| 3 (v6-5) | El plural va por titular («Juan Fijo recupera el … y el …; Ana recupera el …»). La previa trae `recuperan` con una línea por fecha («la recupera Juan»). `textoAvisoRecupera` arma el WhatsApp para el que recupera, y la pantalla «Hecho» suma un botón «Avisar a Juan que recupera su turno» por cada uno (`FijosYEspera.tsx`). | v7-3, v5-7 corregido |
| 4 (v6-7) | `devolverLiberadasPor` sirve para los tres casos. Las fechas que se le habían liberado a otro fijo vuelven a ese otro en tres situaciones: cuando Pedro se da de baja (desde la fecha de la baja), cuando se pausa (las fechas dentro de la pausa) y cuando libera una fecha (esa fecha). Si después Pedro acorta su pausa, la fecha que Juan ya recuperó se le libera a Pedro como un choque acotado. Nunca quedan dos. | v7-4 |
| 5 | `liberadasPor` se poda cuando una baja, pausa o liberación sale bien: se sacan las fechas pasadas. Lo rechazado no toca nada. Si queda vacío, el campo desaparece, también al devolver. Como sólo se agrega al confirmar una pausa, la lista nunca guarda fechas pasadas más allá de la confirmación siguiente. | v7-5 |

**Ajustes a tests anteriores, por las observaciones (no reabren v5/v6):**
- v5-3: Pedro pasa a ser `hasta: d(4)`. Con Pedro permanente, el d(5) lo jugaban los dos, que es justo la obs. 1.
- v5-4b: la vigencia se verifica con `vueltaDelFijo` y la pausa ahora se rechaza, porque el d(5) lo jugarían los dos. Antes Pedro perdía ese día sin aviso, igual que en el caso «1b».
- cert v4-3: anuncia la vuelta real (d(13), que está libre), no `null`.

**Verificación**
- `npx tsc --noEmit`: 406 errores, todos preexistentes por paquetes que faltan (`playwright` y otros). Ninguno en `canchas-core.ts`, su test ni `FijosYEspera.tsx`.
- `canchas-core.test.ts`: 44/44.
- Club + motor (`club/*.test.ts` + `src/lib/club/*.test.ts`): 723 tests, 634 ok, 87 salteados (Playwright o Postgres no instalados) y 2 fallas ajenas. Las dos vienen del checkout con CRLF (`core.autocrlf=true`): `copia.test.ts` da otro sha256 y el fixture de `anonimizar` no coincide. Los blobs de git dan `0c290a3d…`, igual a `ORIGEN.json`.
- Postgres de la baja (`fijos-postgres.test.ts`) sobre PGlite en memoria, con el arnés de `n2/s2-paquete-gate2`: 1/1, sin salteo. PGlite no reproduce la concurrencia real ni, con seguridad, el rol `app_rls`.
- Adversariales v6: los archivos originales no están en el árbol (se borraron tras la v6). v6-3, v6-4, v6-5 y v6-7 se reprodujeron, según lo que describe este dictamen, como v7-1 a v7-4.

**Sin verificar:** la pantalla «Hecho» con el botón nuevo en un navegador (Playwright no está instalado: `fijos-pantalla.test.ts` queda salteado).

**Para la PMO:** el criterio B7-C2 de `PLAN-REINGENIERIA-N2.md` («Observaciones 1–5 de CERT-bp-t3c cerradas con test cada una») queda cubierto por esta v7 si se certifica. B7 conserva C1 (garantía) y C3 (+14).

## Dictamen del certificador — v7

Diff certificado: `9ea994b8..60e16f23` (7d834f0f, 98b3f299, 60e16f23). Todo se probó en memoria con el motor y el almacén reales y en PGlite; nada se corrió contra Neon (sin `.env` en el worktree).

### Veredicto: NO CERTIFICA
Las 5 observaciones de la v6 están cerradas tal como se pidieron, pero la devolución de fechas (`devolverLiberadasPor`), que la obs. 4 extendió a la pausa y a «liberar», deja **dos fijos jugando el mismo hueco** y les manda a los dos el WhatsApp de «volvés a tener tu turno».

### Fallas
1. **MEDIA: la devolución no mira quién más juega esa fecha** (`canchas-core.ts`, `devolverLiberadasPor`). Saca la fecha de `excepciones` sin preguntar si otro fijo sigue en el hueco. `liberadasPor` guarda un solo fijo por fecha, aunque la fecha la ocupaban varios o la cedieron varios.
   - **A11 (determinista):** Pedro está acotado d(4)…d(9) y Ana acotada d(2)…d(8), los dos heredados, más Juan pausado. Pausan Pedro, Ana y Juan (la hoja acepta las tres pausas) y ahí `dobles = []`. Después «Dar de baja» a Ana desde d(4): Juan y Pedro recuperan los dos el 1/12, el 8/12 y el 15/12. Quedan 3 dobles nuevos, y la previa arma un WhatsApp para cada uno.
   - **A10:** Pedro a las 21:30 y Ana a las 22:30 no se pisan entre sí, pero los dos pisan a Juan. Cuando Pedro se va, Juan recupera fechas que juega Ana.
   - **Fuzz A1b** (400 secuencias al azar de baja, pausa y liberar sobre tres fijos heredados, con el tiempo avanzando): 56 dobles nuevos en 27 corridas. Por acción: 35 en la baja, 12 en la pausa y 9 en liberar. **Todos salen de la devolución.** Ni la guardia de la pausa ni la poda crearon dobles.
   - En la grilla no hay dos turnos: `materializarFijos` valida y el segundo queda como conflicto. Pero los dos titulares quedan avisados de que juegan.
   - En la baja, el defecto ya estaba en la v6: es el mismo filtro, según el diff. La v7 lo extiende a la pausa y a liberar, y le suma el aviso.
   - **Arreglo sugerido:** antes de devolver una fecha a `g`, correr `otroFijoQuePisa(estado, hueco de g en esa fecha, g.id)` y, dentro de la ventana, `validarHueco`. Si alguien la sigue ocupando, la entrada se re-apunta a ese otro (`fijoId = otro.id`) y no se anuncia. Hay que recorrer en orden estable, para que la recupere uno solo. Cubrirlo con A10 y A11.
2. **BAJA: se anuncia una recuperación que no pasa** (A9b). Pedro canceló aparte su turno del d(4) y el mostrador vendió ese hueco. Cuando Pedro se da de baja, Juan «recupera el mar 17/11», tanto en el mensaje como en el WhatsApp. `materializarFijos` falla en silencio y el fijo de Juan queda «jugando» una fecha que es de otro. Se arregla con el mismo cambio: validar el hueco y anunciar sólo lo que de verdad se bajó.

### Observaciones (BAJA)
- `FijosYEspera.tsx`, botones «Avisar a … que recupera»: el comentario dice que la nota (demo o sin celular) va con cada botón, pero no se pasa `notaEn` ni se muestra la nota.
- El rechazo de la obs. 1 puede decir «volvería el 20/10, pero el 20/10 …». Pasa cuando la vuelta es un turno que la pausa re-bajó a la grilla y el otro fijo todavía sin bajar juega ese día (A9: el rechazo es correcto, el texto confunde). Además, la salida no ofrece lo que sí funciona con un fijo acotado: pausar hasta después de su último día.
- A3b, sólo por comando: una pausa nueva con `desde` posterior reemplaza la anterior (`darDeBajaFijo`) y des-pausa fechas que otro ya recuperó; la guardia mira sólo después de `hasta`. Desde la hoja no se puede armar (`desde` = hoy), y tampoco re-aplicando (el comando lleva su `ahora`). Hay que dejarlo como precondición del comando.
- Se tocaron 5 tests viejos, no 4, porque v5-7 también cambió.

### Los tests viejos ajustados, antes y después
Ninguno se aflojó:
- **cert v4-3:** antes pedía `vuelve = null` y 8 choques. Ahora pide `vuelve = dV4(13)` y además **que esté libre** (lo verifica con `validarHueco` o con un turno propio), 10 choques y el texto.
- **v5-2:** sólo cambia el texto de la salida.
- **v5-3:** Pedro pasa de permanente a `hasta: d(4)`. El caso original, Pedro permanente con pausa en el d(4), ahora se rechaza sin cambiar nada (A12).
- **v5-4b:** antes aceptaba `vuelve d(4)` y callaba que el d(5) lo jugaban los dos. Ahora la pausa se rechaza y la foto queda intacta. Es más estricto.
- **v5-7:** el plural va por titular; el resto sigue igual.

### Lo que pasó
Adversariales A1–A12: 9 de 15 pasan.
- Recuperación en cadena (A1).
- Deshacer en el almacén real después de recuperar (A2): la foto vuelve exacta.
- Pausa sobre pausa, más corta y más larga, idempotente (A3).
- Liberar dos veces y desde dos puestos (A4).
- Foto vieja sin el campo, que no agrega `[]` (A5).
- Serializar e hidratar en el medio (A6).
- La poda no borra lo de hoy ni lo de adelante, no toca nada en la previa ni en un rechazo (A7).
- El WhatsApp de quien recupera lleva su celular, su nombre y su horario; al titular no se lo toca, y si Juan está pausado no se le avisa (A8).
- El caso original de v5-3 (A12).

### Verificación n/n
- **Motor:** `ORIGEN.json` da 0c290a3d… y es igual al blob de `public/previews/breakpoint/club/motor.mjs` y de `src/lib/club/motor.mjs`, en HEAD y en la base. La copia de trabajo da 6ff259b1… por el CRLF. El diff no toca `src/lib` ni `public`.
- **`npx tsc --noEmit`:** 406 errores, 0 en los 3 archivos tocados. Todos vienen de módulos que no están instalados: `playwright` (99 de tipo TS2307, más los TS7006/7031 y TS2769 que arrastra), `three`, `qrcode` y `pdf-lib`.
- **Club + motor:** 723 tests, 634 ok, 87 salteados y 2 fallas, las dos por CRLF:
  - la copia del sha;
  - el fixture de `anonimizar`, que es igual al texto generado si se le saca el CR.
- **`fijos-postgres.test.ts` sobre PGlite en memoria:** 1/1, sin salteo, con el lanzador del scratchpad copiado de `n2s2/scripts/qa/gate2-pglite.mjs` y `*DATABASE_URL` borradas del entorno.
- **Adversariales:** `cert-v7/v7-fijos.test.ts`, en el scratchpad del certificador. Se copiaron a `src/test/`, se corrieron y se borraron; `git status` quedó limpio.

### Verificación pendiente
- La pantalla «Hecho» con los botones nuevos en un navegador (Playwright no está instalado).
- La baja contra un Postgres real con `app_rls` y concurrencia de verdad (PGlite serializa).

### Historia
- v7 NO CERTIFICA: la devolución de fechas deja dos fijos en el hueco (Falla 1, MEDIA) y anuncia recuperaciones que no pasan (Falla 2, BAJA).

Veredicto final: NO CERTIFICA
