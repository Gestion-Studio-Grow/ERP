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

## Respuesta del ingeniero — v8

Base: HEAD `da7a9f69`. Commits: `7ec20279` (arreglo) y `29e76600` (tests). Se cambió sólo `devolverLiberadasPor` en `canchas-core.ts`, con su helper nuevo `quienOcupaElHueco`. El motor no se tocó: el diff contra la base no tiene nada en `src/lib` ni en `public`, así que `ORIGEN.json` y los sha256 siguen iguales. No se mueve plata: la devolución sólo cambia `excepciones` y `liberadasPor`, y baja turnos con `materializarFijos`.

**Falla 1 (MEDIA): CERRADA.** Antes de devolver una fecha, `quienOcupaElHueco` mira quién ocupa el hueco de ese fijo ese día, sin contarlo a él:
- otro fijo que juega esa fecha (`fijoJuegaEl`, esté o no bajado a la grilla);
- un turno vivo de la grilla (de un fijo, suelto o vendido en el mostrador);
- un bloqueo.

Con eso:
- **Lo ocupa otro fijo:** la entrada de `liberadasPor` se re-apunta a ése (`fijoId = otro.id`). La fecha sigue liberada, no se anuncia y vuelve cuando ése se vaya.
- **Lo ocupa un turno suelto, una venta del mostrador o un bloqueo:** la fecha sigue liberada, la entrada sale (no hay a quién esperar) y no se anuncia.
- **Hueco libre:** se devuelve. En la semana a la vista sólo se anuncia si el turno quedó de verdad en la grilla; si no se pudo bajar, la fecha vuelve a quedar liberada.

**Regla de quién recupera (determinística): el fijo más antiguo.** Las entradas se recorren ordenadas por fecha. En la misma fecha manda el orden de `estado.fijos`, que es el orden de alta (`crearFijo` hace `push`; la baja sólo filtra), y el ordenamiento es estable. El primero recupera la fecha. Al siguiente el hueco ya le figura ocupado por ése, y su entrada se re-apunta al que recuperó: si ése se va después, la recupera él. Es la misma regla en la previa y en el comando, en cualquier puesto.

**Falla 2 (BAJA): CERRADA** con el mismo chequeo. La fecha que el mostrador ya vendió no se asigna, así que tampoco se anuncia: no aparece en el mensaje, en `recuperan` de la previa ni en el WhatsApp.

| Caso del dictamen | Test del repo (`canchas-core.test.ts`, bloque «Dictamen v7») | Antes (código v7) | Ahora |
|---|---|---|---|
| A11 (Ana se va y dos recuperan la misma fecha) | v8-1: Pedro recupera d(4) y d(5), Juan (el más antiguo) d(6)…d(8). A Pedro esas fechas le quedan liberadas, esperando a Juan; cuando Juan se va, las recupera Pedro | falla | pasa |
| A10 (Ana a las 22:30 también juega) | v8-2: Juan no recupera ni se le avisa; la entrada pasa a Ana. Cuando Ana libera el d(5), Juan la recupera | falla | pasa |
| A9b (el mostrador ya vendió) | v8-3: se anuncia y se asigna sólo el d(5); el d(4) queda de Walk In | falla | pasa |
| A1b (aleatorio) | v8-4: 400 secuencias de 8 pasos (baja, pausa o liberar) sobre Juan pausado y Pedro y Ana heredados, con el tiempo avanzando. Además de los dobles, exige que la previa anuncie lo mismo que el comando, y que cada recuperación anunciada se juegue, que nadie más ocupe el hueco y que, en la semana a la vista, el turno esté en la grilla | **56 dobles nuevos** | **0 dobles, 0 anuncios falsos** |

Para probar que el test detecta la falla, se corrió el bloque v8 contra el `canchas-core.ts` de `da7a9f69`: los 4 fallan y el aleatorio da los mismos 56 dobles del dictamen.

**El archivo de adversariales del certificador** (`cert-v7/v7-fijos.test.ts`) se copió a `src/test/`, se corrió y se borró. Da 13/15: A1b, A9b, A10 y A11 pasan. Siguen fallando dos, ninguno de esta falla:
- **A3b:** es la observación BAJA de la v7, sólo por comando, y no se tocó.
- **A9:** se corta en la preparación, porque la guardia de la obs. 1 rechaza la pausa (el dictamen ya dice que el rechazo es correcto).

**Verificación**
- `npx tsc --noEmit`: 406 errores, los mismos archivos y las mismas cantidades que la línea de base de la v7. Ninguno está en `canchas-core.ts` ni en su test.
- `canchas-core.test.ts`: 48/48 (el aleatorio tarda unos 26 s).
- Club + motor (`club/*.test.ts` + `src/lib/club/*.test.ts`): 727 tests, 638 ok, 87 salteados (Playwright o Postgres no instalados) y 2 fallas ajenas. Son las mismas dos de CRLF de la v7: el sha de la copia y el fixture de `anonimizar`.
- `fijos-postgres.test.ts` sobre PGlite en memoria, sin `.env` y sin `*DATABASE_URL`: 1/1, sin salteo.

**No se tocó** (observaciones BAJA de la v7, fuera de este pedido):
- la nota de `notaEn` en los botones «Avisar a … que recupera»;
- el texto «volvería el X, pero el X»;
- A3b, una pausa por comando con `desde` posterior.

**Sin verificar:**
- la pantalla «Hecho» en un navegador (Playwright no está instalado);
- la baja contra un Postgres real con `app_rls` y concurrencia de verdad (PGlite serializa).

## Dictamen del certificador — v8

Diff certificado: `da7a9f69..75031d40` (7ec20279 arreglo, 29e76600 tests, 75031d40 respuesta). Todo se probó en memoria con el motor y el almacén reales, y en PGlite. Nada se corrió contra Neon: no hay `.env` en el worktree y se borraron las `*DATABASE_URL` del entorno.

### Veredicto: CON OBSERVACIONES
Las dos fallas de la v7 están cerradas. Mi aleatorio propio no encontró ningún doble ni ningún anuncio falso que salga de la devolución. Quedan observaciones BAJA: una es nueva y de esta regla; otra es anterior a este diff. Ninguna deja dos turnos en la grilla, ninguna mueve plata y ninguna le avisa a dos titulares que juegan la misma fecha.

### Aleatorio propio, independiente del v8-4
Es otro generador (xorshift) con 9 semillas: 20261028, 424242, 9001, 31337, 2718, 777, 123456789, 55555 y 8080. Son **5.600 secuencias de 12 pasos** y **713 recuperaciones** (baja 385, pausa 279, liberar 49). Cuatro de las semillas van con «foco en la devolución»: más bajas y pausas, y ningún fijo permanente.

Cada corrida arranca con Juan pausado y de 3 a 5 fijos heredados de antes del guardián: a las 21:30, 22:00 o 22:30, algunos permanentes y algunos ya en pausa. Los pasos posibles:
- pausa;
- pausa con `desde` posterior (A3b), contada aparte;
- liberar, y **repetir la última acción** (liberar dos veces);
- baja;
- **deshacer** (vuelve a la foto previa, como el almacén);
- **venta del mostrador DESPUÉS de liberar**, a veces cancelando antes el turno del fijo;
- **bloqueo** (a veces cancelando lo que había) y quitar un bloqueo o una venta;
- **serializar e hidratar** con `textoDelEstado`;
- avanzar de 1 a 9 días y bajar la ventana (entra y sale de la semana a la vista).

| Invariante | Resultado |
|---|---|
| Dos fijos juegan el mismo hueco y fecha, causado por la **devolución** | **0** |
| Anuncio que no pasa (no juega, otro fijo, turno ajeno, bloqueo, o en la semana a la vista sin turno en la grilla) | **0** |
| Dos turnos vivos en la grilla | 0 |
| La devolución deja a un fijo «jugando» un hueco vendido o bloqueado | 0 |
| La previa anuncia algo distinto del comando | 0 |
| Misma fecha anunciada dos veces | 0 |
| Un rechazo cambia el estado / la previa muta el estado | 0 / 0 |
| La ida y vuelta serializar → hidratar cambia la foto | 0 |
| Fecha retenida con el hueco libre de todo, y el que espera no la juega | 0 (medido en 1.600 secuencias) |

Hubo dobles, pero ninguno de la devolución. Por origen:
- 301 vienen de la **pausa con choque en la grilla** (observación 2).
- 525 vienen de **pausas por comando con `desde` posterior**. Es la A3b de la v7, ya declarada; desde la hoja no se puede armar.

**Reproducción de la v7:** mi `cert-v7/v7-fijos.test.ts` original contra HEAD da 13/15. A1b (400 secuencias), A9b, A10 y A11 pasan. Siguen fallando A3b (observación conocida) y A9. La A9 se corta en la preparación por el rechazo «se pisarían» de la obs. 1 de la v6, que es correcto. Coincide con lo que declara el ingeniero.

### Juicio sobre «la fecha espera a ese fijo»
- **No hay retención para siempre.** Cada entrada es de una fecha, y `podarLiberadasPor` la saca cuando la fecha pasa. En 1.600 secuencias no apareció ninguna fecha retenida con el hueco libre.
- **Si el cliente de Pedro cancela ese turno desde la grilla** (en lugar de «liberar»), Juan sigue esperando a Pedro y el mostrador puede vender el hueco (caso C2). Si Pedro se da de baja después y el hueco sigue libre, Juan lo recupera. Es un caso de negocio razonable: la cancelación suelta no es «irse del fijo». El dictamen lo describe como «vuelve cuando ése se vaya». **No es falla.**
- **Si lo ocupa un turno suelto o un bloqueo, nadie lo recupera, aunque después se libere.** Está documentado y es seguro (no hay doble). **No es falla.**

### Observaciones (todas BAJA)
1. **Nueva, de esta regla: la entrada que espera puede quedar apuntando a un fijo que ya no juega esa fecha, y entonces no recupera el más antiguo** (caso C4, determinista). Hubo 196 entradas así en el aleatorio, siempre con el hueco ocupado por otro fijo.
   - **Caso:** Juan (el más antiguo) espera a Pedro el 1/12 y el 8/12. Después Pedro se pausa, y esas fechas se le liberan por chocar con Tomi (`{fecha, fijoId: Tomi}`). La entrada de Juan sigue apuntando a Pedro. Cuando Tomi se da de baja, **Pedro recupera el 1/12 y el 8/12, y Juan no**.
   - No hay doble ni anuncio falso, pero contradice «recupera el fijo más antiguo».
   - **Arreglo sugerido:** cuando la pausa agrega `{D, otro}` a `f.liberadasPor`, re-apuntar a `otro` las entradas de los demás que esperaban a `f` en D.
   - Hace falta un trío de fijos heredados solapados.
2. **Anterior a este diff (está igual en `035cc59d` y en `da7a9f69`): la pausa no libera las fechas que chocan con el turno ya bajado de otro fijo** (caso C1, determinista). La salida de `vueltaDelFijo` es «chocan sin fijoId», porque `validarHueco` corta antes de `otroFijoQuePisa`.
   - **Caso:** Juan acorta su pausa. El d(0) y el d(1) ya están en la grilla de Pedro (heredado). El mensaje dice bien «No vuelven … se pisan con otros turnos», pero `fijoJuegaEl` da que juegan los dos.
   - La tarjeta de Juan muestra «20/10 sin bajar».
   - Si Pedro libera el d(0), al bajar la ventana Juan vuelve a la grilla sin aviso, aunque se le dijo que no venía.
   - Grilla con un solo turno y sin plata en juego.
   - **Arreglo sugerido:** en `correrBajaFijo`, liberar también los choques cuyo turno es de otro fijo (`turno.fijoId`), anotándolo en `liberadasPor`.
3. Siguen abiertas, como declara el ingeniero, las BAJA de la v7: `notaEn` en «Avisar a … que recupera», el texto «volvería el X, pero el X» y la A3b (sólo por comando).

### Verificación n/n
- **Motor:** el diff no toca `src/lib` ni `public`. El blob de `src/lib/club/motor.mjs` y el de `public/previews/breakpoint/club/motor.mjs` dan `0c290a3d…`, en HEAD y en `da7a9f69`, igual a `ORIGEN.json`.
- **`npx tsc --noEmit`:** 406 errores, los mismos archivos y cantidades que la línea de base de la v7 (`diff` vacío). 0 en `canchas-core.ts` y en su test. Todos vienen de módulos no instalados (`playwright`, `three` y otros).
- **`canchas-core.test.ts`:** 48/48.
- **Club + motor** (`club/*.test.ts` + `src/lib/club/*.test.ts`): 727 tests, 638 ok, 87 salteados y 2 fallas. Las dos son las de CRLF ya conocidas: el sha de la copia y el fixture de `anonimizar`.
- **`fijos-postgres.test.ts`** sobre PGlite en memoria (lanzador del scratchpad, sin `*DATABASE_URL`): 1/1, sin salteo.
- **Adversariales:** `cert-v8/v8-fuzz.test.ts` y `cert-v8/v8-casos.test.ts` (C1–C4), en el scratchpad del certificador. Se copiaron a `src/test/`, se corrieron y se borraron; `git status` quedó limpio. Para C1 se puso un momento el `canchas-core.ts` de `035cc59d` y de `da7a9f69`, y se restauró con `git checkout`.

### Verificación pendiente
- La pantalla «Hecho» con los botones «Avisar a … que recupera» en un navegador (Playwright no está instalado).
- La baja contra un Postgres real con `app_rls` y concurrencia de verdad (PGlite serializa).

### Historia
- v7 NO CERTIFICA: dobles en la devolución (MEDIA) y anuncio falso (BAJA).
- v8 CON OBSERVACIONES: las dos están cerradas (0 en 5.600 secuencias). Queda una BAJA nueva de orden en la espera (obs. 1) y una BAJA anterior en la pausa (obs. 2).

Veredicto final: CON OBSERVACIONES

## Respuesta del ingeniero — v9

Base: HEAD `558e3f87`. Commits: `af596c39` (arreglo), `97d5d582` (nota de los botones) y `5482838f` (tests). El motor no se tocó: el diff no tiene nada en `src/lib` ni en `public`, así que `ORIGEN.json` y los sha256 siguen iguales. No se mueve plata: los arreglos sólo cambian `excepciones` y `liberadasPor`, rechazan antes de tocar nada, o bajan turnos con `materializarFijos`.

Se cierran las cinco BAJA abiertas: las dos de la v8 y las tres de la v7.

| Obs. | Qué se hizo | Test |
|---|---|---|
| v8-1 · C4 (la espera apunta a un fijo que ya no juega) | «La fecha espera a ese fijo» vale sólo mientras ese fijo juega esa fecha. **(a)** Cuando la pausa le suelta a Pedro fechas por choque (`nuevas`), las esperas de los demás a Pedro en esas fechas entran en la devolución en el acto: el que las esperaba las recupera o pasa a esperar al que las juega (Tomi). **(b)** En `devolverLiberadasPor`, una entrada que espera a un fijo que no juega esa fecha (pausado, dado de baja, liberada o que ya no está) entra en la misma ronda si su hueco se pisa con el del que se va, y manda la antigüedad. **(c)** «Liberar el fijo» desde la grilla (`ciclo-core.ts`) también devuelve, con la misma regla, y lo dice en el mensaje. | v9-1 (el caso del dictamen: recupera Juan, no Pedro), v9-2 (foto heredada con la espera vieja), v9-3 (desde la grilla) |
| v8-2 · C1 (acortar la pausa contra el turno de otro fijo ya en la grilla) | `vueltaDelFijo` reconoce el turno ya bajado de otro fijo como choque con ese fijo (`fijoId`). Con vuelta, la fecha se le libera al pausado y espera a ése: la previa dice «no vuelve: se pisa con el fijo de Pedro», la tarjeta la muestra «liberado» y, si Pedro la suelta, Juan la recupera con aviso y con su turno en la grilla. Sin vuelta, la pausa se rechaza con la regla que ya había (`role="alert"`, Confirmar deshabilitado) y no cambia nada. | v9-4 (se ajusta), v9-5 (se bloquea) |
| v7 · texto «volvería el X, pero el X» | Si el choque es el mismo día de la vuelta, dice «Juan no puede volver el X: ese día el hueco también es del fijo de Pedro (…) y se pisarían». Si el otro fijo es acotado, ofrece «Pausalo hasta el {su último día} y vuelve el …», probado antes sobre una copia: sólo se ofrece si funciona. | v9-6 (el texto, y la pausa ofrecida sale como se dijo) |
| v7 · A3b (pausa por comando con `desde` posterior) | Queda como precondición del comando: si la pausa nueva arranca después que la anterior y des-pausaría una fecha que ya es de otro fijo (la recuperó, o la juega), se rechaza sin tocar nada y dice desde cuándo pausarlo. Sin nadie en esas fechas, pasa igual que antes. | v9-7 |
| v7 · `notaEn` en «Avisar a … que recupera» | Cada botón anuncia su nota (`aria-describedby`). Si es la misma que la del titular (la demo, o los dos sin celular), comparte el texto y sale una sola vez. Si es otra, va al lado de su botón. El «Hecho» pasó a `HechoDeLaBaja.tsx`, sin CSS, para probarlo sin navegador. | `hecho-de-la-baja.test.ts`, 3 tests con `renderToStaticMarkup` |

**Aleatorio (v9-8).** Hay 5 semillas (7, 20261028, 424242, 9001 y 31337). Cada una corre 60 secuencias de 10 pasos con 3 a 5 fijos: Juan pausado y heredados de antes del guardián a las 21:30, 22:00 o 22:30, casi siempre ya bajados a la grilla. Los pasos posibles son pausa, pausa por comando con `desde` posterior, liberar, baja, «Liberar el fijo» desde la grilla, avanzar el tiempo y bajar la ventana, deshacer, y serializar e hidratar. Sobre 1.973 acciones salen 115 recuperaciones, 53 fechas C1, 19 esperas C4, 96 pausas A3b y 95 liberaciones desde la grilla. Resultados:
- **Dobles que figuran: 0.** Se cuenta lo que figura, no sólo lo que se asigna: un turno vivo de la grilla o un fijo que juega esa fecha sin bajar, porque su turno cancelado por la pausa vuelve con la ventana.
- **Anuncios de algo que no se asignó: 0.** El que recupera juega esa fecha, nadie más la ocupa y, en la semana a la vista, tiene su turno en la grilla. La previa anuncia lo mismo que el comando.
- **Rechazos que cambian el estado: 0.**
- **Fechas retenidas: 0.** No queda ninguna espera a un fijo que no juega con el hueco libre.
- **Contra el código de `558e3f87`:** los 8 tests v9 fallan, y el aleatorio da 129 dobles.

**Lo que el invariante no cuenta, a propósito:** un fijo sin bajar contra un turno suelto o del mostrador. Es lo cerrado en la v3 («no vuelve: se pisa con otro turno»): la grilla nunca lo baja encima y no se tocó.

**Verificación**
- `npx tsc --noEmit`: 406 errores, la misma cantidad que la línea de base. Ninguno está en los archivos tocados (`canchas-core.ts`, `ciclo-core.ts`, `FijosYEspera.tsx`, `HechoDeLaBaja.tsx` y sus tests). Todos vienen de módulos que faltan (`playwright` y otros).
- `canchas-core.test.ts`, `hecho-de-la-baja.test.ts` y `ciclo-core.test.ts`: 75/75.
- Club + motor (`club/*.test.ts` + `src/lib/club/*.test.ts`): 738 tests, 649 ok, 87 salteados (Playwright o Postgres no instalados) y 2 fallas ajenas. Son las mismas dos de CRLF: el sha de la copia y el fixture de `anonimizar`.
- `fijos-postgres.test.ts` sobre PGlite en memoria, sin `.env` y sin `*DATABASE_URL`: 1/1, sin salteo.

**Sin verificar:**
- la pantalla «Hecho» y la hoja en un navegador (Playwright no está instalado; la nota se probó con `renderToStaticMarkup`);
- la baja contra un Postgres real con `app_rls` y concurrencia de verdad (PGlite serializa).

## Dictamen del certificador — v9

Diff certificado: `558e3f87..7b506752` (af596c39 arreglo, 97d5d582 nota de los botones, 5482838f tests, 7b506752 respuesta). Todo se probó en memoria con el motor y el almacén reales, y en PGlite. Nada se corrió contra Neon: no hay `.env` en el worktree y se borraron las `*DATABASE_URL` del entorno.

### Veredicto: CON OBSERVACIONES
Los cinco cierres se sostienen en lo que prometen puntualmente: C4, el texto, A3b contra otro fijo y las notas. Mi aleatorio no encontró dobles de la devolución, de liberar (desde la hoja o desde la grilla), de la baja ni de la A3b. Tampoco anuncios falsos ni fechas retenidas. Pero el título de C1, «la pausa no deja dos fijos figurando», no es cierto en general: sigue pasando cuando el hueco tiene además un bloqueo o un turno suelto (obs. 1). Es anterior a este diff y no deja dos turnos en la grilla ni mueve plata. Igual cambia quién juega, así que no es cosmética.

### Aleatorio propio, independiente del v9-8
Otro generador (xorshift) con 6 semillas: 11, 20261029, 4242, 99991, 8675309 y 1618. Son **4.200 secuencias de 14 pasos** (58.800 pasos), corridas contra HEAD y contra `558e3f87` con las mismas semillas.

**Invariante: TODA ocupación que figura en el hueco contra toda otra.** Cuenta turnos vivos (de un fijo o sueltos), ventas del mostrador, bloqueos y fijos que juegan esa fecha sin bajar, en 72 semanas. Se anotan los pares **nuevos** que deja cada acción, por tipo: FF (fijo contra fijo), FS (fijo contra turno suelto) y FB (fijo contra bloqueo).

Pasos posibles:
- pausa desde hoy, **pausa acortada** (1.218 veces) y pausas encimadas;
- pausa por comando con `desde` posterior (A3b);
- liberar desde la hoja, y **liberar dos veces** (repetir);
- «Liberar el fijo» **desde la grilla** (5.696 veces), y de nuevo sobre el mismo turno (1.887 veces, sin cambio);
- baja;
- **deshacer** (sólo la última acción, como el almacén);
- **venta del mostrador DESPUÉS de liberar**, con el control del alta (918 sobre la fecha recién liberada);
- el cliente cancela el turno de un fijo;
- bloqueo, y quitar un bloqueo o una venta;
- **serializar e hidratar** con `textoDelEstado`;
- avanzar de 1 a 9 días y bajar la ventana.

Hubo 253 recuperaciones y 342 rechazos A3b.

| Resultado | HEAD | `558e3f87` |
|---|---|---|
| Pares FF nuevos por la A3b | **0** | 470 (415 sin aviso) |
| Pares FS/FB nuevos por la A3b | 1 (anunciado) | 11 |
| Pares FF nuevos por la pausa, en fechas «no vuelve: se pisan con otros turnos» (obs. 1) | 37 | 36 |
| Pares FS/FB nuevos por la pausa (anunciados / sin aviso, después de la vuelta) | 30 / 6 | 29 / 6 |
| Pares FB nuevos por un **bloqueo** sobre fijos sin bajar (motor, fuera del diff) | 4.365 | 4.368 |
| Pares nuevos de cualquier tipo por devolución, liberar (hoja o grilla), baja, venta, cancelación o ventana | **0** | 0 |
| Dos turnos vivos en la grilla | 0 | 0 |
| Anuncio que no pasa (recupera o «vuelve solo el X» con otra ocupación figurando, o sin turno en la semana a la vista) | 0 | 0 |
| Previa ≠ comando / previa muta / rechazo cambia | 0 / 0 / 0 | 0 / 0 / 0 |
| Ida y vuelta serializar → hidratar cambia la foto | 0 | 0 |
| Fecha retenida (espera a uno que no juega y el hueco libre de todo) | 0 | 0 |
| Liberar dos veces cambia algo o anuncia | 0 | 0 |

El ingeniero informó «129 dobles» contra el código anterior. Su aleatorio no tiene ventas ni bloqueos, y su invariante no cuenta bloqueos ni fijo contra turno suelto. Por eso no vio la obs. 1.

### Refutación de los cinco cierres (casos propios, `cert-v9/v9-casos.test.ts`)
| Cierre | Caso | Resultado |
|---|---|---|
| C4 | K1: Juan (el más antiguo) y Ana esperan a Pedro el d(0); Pedro lo libera **desde la grilla**, y la segunda vez sobre el mismo turno; después Juan lo libera desde la grilla | Se sostiene: recupera Juan con su turno en la grilla y Ana pasa a esperar a Juan. La segunda liberación no cambia nada. Cuando Juan lo libera, lo recupera Ana. |
| C1 | K6: el d(3) bloqueado (torneo) y Pedro (heredado) lo juega sin bajar; Juan acorta la pausa | **Se refuta (obs. 1).** |
| C1 «sin vuelta se bloquea» | K2: Juan acotado al d(0); el turno de Pedro (fijo de las 21) **movido** al hueco de Juan, y ningún fijo solapado | **Se refuta en el borde (obs. 2).** |
| Texto «volvería…» | K4: choque el mismo día de la vuelta, con Pedro acotado | Se sostiene: dice «no puede volver el mar 20/10…», ofrece «Pausalo hasta el mar 10/11 … y vuelve el mar 17/11», y hacer eso da exactamente esa vuelta, sin dobles. |
| A3b | K3b: la fecha del medio es de otro fijo | Se sostiene: rechaza sin tocar nada, y seguir la sugerencia «Pausalo desde el …» pasa sin dobles. |
| A3b | K3: la fecha del medio es un turno **suelto** | Pasa sin aviso (obs. 3). |
| Notas de los botones | K5, con `renderToStaticMarkup`: el titular con celular y dos que recuperan sin celular; y todos sin celular | Se sostiene: cada `aria-describedby` apunta a un id que existe. Si la nota es la misma, se comparte una sola vez. |

### Observaciones (todas BAJA)
1. **C1 a medias: la pausa sigue dejando dos fijos figurando cuando en el hueco hay además un bloqueo o un turno suelto.** Es anterior a este diff: está igual en `558e3f87`.
   - **Dónde:** `vueltaDelFijo` (canchas-core.ts:265-269). Si `validarHueco` falla y el ocupante de la grilla no es un fijo, anota el choque sin `fijoId` y hace `continue`. No mira a un fijo que juega esa fecha detrás del bloqueo o del turno suelto, así que la fecha no se le libera al pausado.
   - **Caso K6:** el mensaje dice bien «No vuelven el mar 10/11 ni el mar 17/11». Pero el 10/11 figuran Juan y Pedro sin bajar.
   - **Consecuencia:** al levantarse el torneo y bajar la ventana, el turno es de **Juan**, a quien se le dijo que no venía. A Pedro, que sí juega, le sale «No entraron: Pedro el 10/11: se pisa con Juan».
   - Son 37 en el aleatorio. Hace falta un fijo heredado solapado más un bloqueo o una venta en esa fecha.
   - **Arreglo sugerido:** en esa rama, buscar también `otroFijoQuePisa(…, f.id)` y llevar su `fijoId`. Así `correrBajaFijo` la libera y la anota en `liberadasPor` como cualquier choque con un fijo.
2. **«Sin vuelta, Confirmar se bloquea» tiene un borde.** El control previo sólo corre si hay otro **fijo solapado** en la lista (canchas-core.ts:523).
   - **Caso K2:** el turno de Pedro, de otro horario, se movió al hueco de Juan, y Juan es acotado. La pausa pasa sin vuelta y no libera nada, con el mensaje «No vuelve el mar 20/10: se pisa con el fijo de Pedro (21:00)». Juan y el turno de Pedro figuran a la vez.
   - Si Pedro cancela ese turno, Juan vuelve a la grilla sin aviso.
   - La hora del mensaje es la del fijo de Pedro, no la del turno movido (cosmético).
   - El estado es el mismo en `558e3f87`. Requiere «mover» y un fijo acotado.
3. **A3b contra un turno suelto** (sólo por comando; la hoja no lo arma). La fecha del medio vuelve a jugar sin aviso aunque el mostrador la vendió (K3: `chocan=[]`; el fijo sin bajar figura con «Walk In»).
   - Es la clase cerrada en la v3, pero allí se avisaba «no vuelve».
   - Igual en `558e3f87`.
4. **Fuera del diff:** «Bloquear» (`bloquear` del motor, vía `ejecutarCanchas`) sólo mira turnos vivos. Bloquea encima de fijos sin bajar, y al llegar la semana esos fijos «no entran».
   - Sale en 4.365 pares nuevos, igual en las dos versiones.
   - Lo mismo para las 6 FS/FB sin aviso de la pausa: son fechas posteriores a la vuelta, que `vueltaDelFijo` no recorre.

Ninguna observación deja dos turnos vivos en la grilla ni toca plata.

### Verificación n/n
- **Motor:** el diff no toca `src/lib` ni `public`. El blob de `src/lib/club/motor.mjs` y el de `public/previews/breakpoint/club/motor.mjs` es `cda5b06d`, igual en HEAD y en `558e3f87`. Su sha256 es `0c290a3d…`, igual a `ORIGEN.json`.
- **`npx tsc --noEmit`:** 406 errores propios del repo, los mismos archivos y cantidades que la línea de base de la v8. 0 en los archivos tocados. Mientras corría, la cuenta daba 412: los 6 de más eran de mis archivos temporales, ya borrados.
- **`canchas-core.test.ts` + `hecho-de-la-baja.test.ts` + `ciclo-core.test.ts`:** 75/75.
- **Club + motor:** 738 tests, 649 ok, 87 salteados y 2 fallas. Son las dos de CRLF ya conocidas: el fixture de `anonimizar` y el sha de la copia.
- **`fijos-postgres.test.ts`** sobre PGlite en memoria, sin `*DATABASE_URL`: 1/1, sin salteo.
- **No se reabre nada de v3 a v8:** mis `cert-v7/v7-fijos.test.ts` y `cert-v8/v8-casos.test.ts` contra HEAD dan 18/19.
  - Pasan A1b (400 secuencias), A2–A8, A9b, A10–A12, A3b y C1–C4.
  - Sigue la A9 de siempre: se corta en la preparación por el rechazo «se pisarían», que es correcto.
- **Adversariales:** `cert-v9/v9-fuzz.test.ts` y `cert-v9/v9-casos.test.ts`, en el scratchpad del certificador.
  - Se copiaron a `src/test/` y se corrieron. La versión base usó copias `zz-base-*` del código de `558e3f87`.
  - Después se borraron, y `git status` quedó limpio.

### Verificación pendiente
- La pantalla «Hecho» y la hoja en un navegador (Playwright no está instalado).
- La baja contra un Postgres real con `app_rls` y concurrencia de verdad (PGlite serializa).

### Historia
- v7 NO CERTIFICA: dobles en la devolución (MEDIA) y anuncio falso (BAJA).
- v8 CON OBSERVACIONES: C4 (orden de la espera) y C1 (turno de otro fijo en la grilla).
- v9 CON OBSERVACIONES: se cierran C4, A3b contra un fijo (470 → 0), el texto y las notas.
  - C1 queda cerrado para el turno de otro fijo en la grilla, pero no cuando un bloqueo o un turno suelto tapan al otro fijo (obs. 1, anterior al diff).
  - Hay un borde del bloqueo sin vuelta (obs. 2) y la A3b contra un turno suelto (obs. 3).

Veredicto final: CON OBSERVACIONES

## Respuesta del ingeniero — v10
Commit `6866f30e`. Se cierran las tres BAJA; la obs. 4 (`bloquear` del motor) queda fuera. No se tocó `src/lib` ni `public`.
1. **C1 con bloqueo o turno suelto** (canchas-core.ts:272): si lo de la grilla no es de un fijo, `vueltaDelFijo` busca `otroFijoQuePisa(…, f.id)` y lleva su `fijoId`. `correrBajaFijo` libera la fecha y la anota en `liberadasPor`. Test v10-1 (K6): al levantar el torneo, el d(3) es de Pedro; 0 dobles.
2. **Sin vuelta con turno movido** (canchas-core.ts:537): el control previo corre también si hay en el hueco un turno vivo de otro fijo. `ocupanteDeLaGrilla` devuelve la hora del turno y el choque la usa. Test v10-2 (K2): se rechaza sin tocar nada y dice «(22:00)», no «(21:00)».
3. **A3b contra turno suelto** (canchas-core.ts:517): la fecha del medio ocupada por un suelto o un bloqueo entra en `chocan`. Previa y mensaje dicen «No vuelve el …: se pisa con otro turno (…)». Sin anotarla (lo de la v3). Test v10-3 (K3, fuera de la ventana; dentro, el motor ya lo decía).
- Los tres tests fallan sobre `c2067544` y pasan con el arreglo.
- `canchas-core` + `ciclo-core` + `hecho-de-la-baja`: 78 pass / 0 fail. v9-8 sigue en 0 (c1=53, a3b=96).
- `tsc` sin errores en los archivos tocados.
- No verificado: la hoja en el navegador y el aleatorio del certificador (`cert-v9`) contra este commit.
