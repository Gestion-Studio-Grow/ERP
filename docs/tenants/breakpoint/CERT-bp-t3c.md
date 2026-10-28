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
