Veredicto final: CON OBSERVACIONES (sin fallas alta/media)

# Dictamen de certificación — Tanda P2 (catálogo de eventos v1 y emisión desde el Core)

Diff: `5aed9fd..n2/p2-eventos` (base = `origin/main` 90297d9 + merge de `origin/n2/s2-paquete-gate2`; tip bad124a) ·
Riesgos: datos, plata · 3 vueltas de certificación (2 de corrección en Opus) · `escaladoAFable`: no · Fecha 2026-10-28.
Todo corrió en el Postgres 16 local efímero (localhost:5433). Ninguna migración aplicada fuera de él. Nada contra Neon.

## Resumen
- Verificación final: `tsc --noEmit` 0 errores · `src/eventos/*.test.ts` + `src/lib/*.test.ts` 1221/1221.
- Test Postgres (`src/eventos/emitir-postgres.test.ts`), con y sin `N2_hub.sql`, rol SIN bypass de RLS, dos negocios:
  el evento de A no se ve desde B, un rollback no deja fila, doble emisión del mismo hecho = 1 fila.
- Eventos emitidos en esta tanda: `pedido.creado@1`, `pedido.cobrado@1`, `pedido.cancelado@1`, `factura.autorizada@1`,
  `factura.rechazada@1` (más `InvoiceCreated` legado, sin cambios). El resto del catálogo queda declarado con su tanda.
- Fuera de la lista de archivos (a revisar por el dueño):
  - `prisma/pending-gate2/N2_hub.sql` (+7, sin aplicar): backfill `clave ← payload._clave` antes del UNIQUE, para que
    los eventos emitidos antes de la migración no se dupliquen después. Aditivo e idempotente; cambia el paquete Gate 2 de S2.
  - `src/lib/arca-envios-concurrencia-postgres.test.ts`: cuenta sólo `InvoiceCreated` como envío a ARCA.
- Fallas abiertas (todas bajas, redacción de texto libre en P2-C6): soft hyphen U+00AD, separadores de 4+ caracteres,
  DNI con comas, recorte antes de redactar, sobre-enmascarado de números largos.

---

# Respuesta del ingeniero — vuelta 4 · e661a65..2df7dda (n2/p2-eventos)

Pide: CERTIFICA con 0 fallas. Todo lo abierto tras la vuelta 3 queda corregido acá o traspasado con motivo.
Base: PGlite (`scripts/qa/p2-pglite.mjs`, nunca Neon, sin `.env`). Fecha 2026-10-28.

## Commits
- `6442aa8` fix · redacción (F4, F5, O1) + adversariales reconstruidos.
- `70b3b92` perf · dedupe por índice con N2_hub (v2-d).
- `e47c2bf` feat · `pedido.cobrado` por cobranza y fiado; `factura.autorizada` con `clase`.
- `682416d` test · base efímera de la vuelta 4 sobre PGlite.
- `2df7dda` docs · reglas 6 y 7 de `eventos.md` (traspaso a P3, `externalRef`).

## Verificación
- `tsc --noEmit`: 403 errores, todos preexistentes por paquetes que faltan (playwright y otros), en `src/app/**` y tests de navegador. En archivos de P2: 0. [VERIFICADO]
- `src/eventos/*.test.ts` + `src/lib/*.test.ts` + `settlement` + `debts` + `fiado.test.ts`: 1279 tests, 1161 pasan, 106 salteados (de base, sin Postgres local) y 12 fallan.
  - Las 12 fallas están en 7 archivos ajenos a P2: comprobante-pdf, ensayo-lote-neon, guardia-bundle-cliente, rechazo-de-dominio, seguridad-hallazgos, sitio-estatico y vercel-build.
  - Las causas son de Windows: rutas con `\`, CRLF y paquetes que faltan. Ninguno de esos archivos importa código tocado en P2 (verificado con grep), y ninguno cambió en `5aed9fd..HEAD`. [VERIFICADO]
- Los adversariales `v2-redaccion.test.ts` y `v3-raya.test.ts` no estaban ni en la rama ni en el disco. Se reconstruyeron en `src/eventos/redaccion-adversarial.test.ts`, con los mismos ids y textos del dictamen: 9/9. Con el `esquema.ts` de la vuelta 3, 6 de esos 9 fallan, así que los tests discriminan. [VERIFICADO]
- Sobre PGlite, `emitir-postgres.test.ts` da 1/1 con y sin N2_hub, y `src/eventos/vuelta4-postgres.test.ts` da 1/1. [VERIFICADO]

## Destino de cada punto
| Punto | Destino | Evidencia |
|---|---|---|
| F4 · DNI con comas, separadores de 4+ | **Corregido.** Entre dígitos va cualquier cantidad de espacios (también `\n`), `.` `,` `/` `()`, rayas `\p{Pd}`, `−` e invisibles `\p{Cf}`. `$ # ·` y las letras cortan la tirada (`esquema.ts`, `RE_DIGITOS`). | C6-f, C6-g |
| F5 · recorte antes de redactar | **Corregido.** Primero se redacta y después se recorta a 500. Un texto de más de 4000 se mira hasta ahí y descarta la cola partida (email o tirada). | C6-h, obs-largo, «borde >4000» |
| O1 · guion blando U+00AD | **Corregido** (lo cubre `\p{Cf}`, junto con U+200B, las marcas bidi, U+2060 y U+FEFF). | v3-obs |
| O2 · sobre-enmascarado | **Aceptado por diseño.** «1042 – 12500» y un teléfono tienen la misma forma: gana el dato personal. Se pierde un dato, pero no se filtra nada. | v3-obs2 fija el comportamiento |
| Nuevo, encontrado acá: emoji partido por el corte | **Corregido.** `slice(0,500)` dejaba un sustituto suelto, que jsonb rechaza, y eso tumbaba la venta o la anulación. | vuelta4 §4: jsonb rechaza `"a\ud83d"`; con el arreglo, la emisión pasa |
| v2-d · costo de la dedupe con N2_hub | **Corregido.** Ahora busca `clave = $3 OR (clave IS NULL AND payload->>'clave' = $3)` y N2_hub crea el índice parcial `(tenantId, payload->>'clave') WHERE clave IS NULL`. El plan es BitmapOr de los dos índices, sin Seq Scan. | `scripts/qa/p2-costo-dedupe-pglite.mjs`, 200k filas: 75,98 ms → 0,567 ms. Con 20k: 8,10 ms → 0,546 ms (plano) |
| v2-d · costo sin N2_hub (Neon hoy) | **Traspasado a Q3 / Gate 2 (D-01).** Sin la migración no hay índice posible. El costo es lineal: 7,95 ms con 20k filas del negocio y 73,35 ms con 200k (WASM). Recomendación: no prender P2 en producción sin N2_hub, o hacerlo sabiendo que crece unos 0,37 ms cada 1k filas. | mismo script |
| Filas con clave NULL tras N2_hub (probe viejo) | **Corregido.** La dedupe las ve por el índice parcial. N2_hub trae un PASO POSTERIOR (re-backfill a los 2 minutos, `NOT EXISTS` por el UNIQUE, idempotente); está en el README del paquete. El backfill principal queda sin `NOT EXISTS` porque sin el UNIQUE sería cuadrático. | vuelta4: fila tardía vista; paso posterior 1 → 0 filas; el duplicado queda NULL sin chocar |
| `pedido.cobrado` · `collection-repo.ts:118` | **Corregido.** Emite en la tx del cobro cuando ESE cobro pasa el pedido a pago (CAS `paid:false→true`), con monto = total del pedido y medio = el del cobro que cierra el saldo. | vuelta4 a–e: parcial no emite; botón y cobranza dan 1 fila; rollback no deja fila |
| `pedido.cobrado` · `clientes/fiado.ts:130` | **Corregido con criterio.** Entregar al fiado NO emite: no entró plata, igual que la venta a cuenta de `insertOrder`. Emite el cobro que salda la deuda de ese pedido (`applyCollectionInTx`, origen RECEIVABLE con `orderId`). Una deuda sin pedido no emite. El catálogo lo dice en `cuando`. | vuelta4 f |
| `factura.autorizada` sin NC | **Corregido en parte.** Se agrega `clase` (FACTURA/NOTA_DEBITO/NOTA_CREDITO/OTRO) por el tipo de ARCA, con la tabla de `contador/recibidos-formato.ts`. El comprobante asociado queda **traspasado a M4** (M4-C6: «`factura.*` para la NC»); hoy no se emiten NC. | test de clase; `emitir-postgres` con tipo 11 → FACTURA |
| `processedAt` NULL hasta P3 | **Traspaso a P3 confirmado y documentado.** Va como regla 6 de `eventos.md`. ARCA sólo toma `InvoiceCreated` (`arca-reserva.ts:111`). El monitor cuenta `attempts ≥ umbral` y estos eventos tienen 0. Para P3 queda decidir qué hace con lo acumulado. `reset-golive` los avisa como pendientes y los borra, que es lo correcto antes de un go-live. | `arca-reserva.ts:107-115`, `cartera-core.ts:375`, `reset-golive.ts:425` |
| `texto/id ≤ 2000`, `lista ≤ 1000` | **Traspasado a P4.** El POS ya tope a 300 renglones (`supermercado/ticket-caja.ts:128`). Sólo la API pública (`external-orders`) no tiene tope de renglones ni de largo de `externalRef`, y validar esa entrada es de P4 (archivos `src/app/api/public/v1/**`, P4-C3). Antes de P2, un `externalRef` de más de 2700 bytes ya fallaba en el índice btree. | — |
| `externalRef` no se redacta | **Por diseño.** Es la referencia del integrador para cruzar con su sistema: redactarla le saca el uso. Está documentado como regla 7 de `eventos.md`. | — |
| `.qa/facturacion-escala/*.txt` | No son de P2. Hoy el worktree está limpio. | — |

Archivos fuera de la lista del plan (sólo líneas de emisión o documentación): `src/lib/settlement/collection-repo.ts`, `prisma/pending-gate2/README.md` y `prisma/schema.prisma` (comentario `// N2:`). Además `N2_hub.sql` suma un índice: el paquete de S2 cambia, sin aplicar.

## Lo que NO se pudo verificar
- **RLS:** PGlite corre como superusuario. Las aserciones de aislamiento de `emitir-postgres` se saltean en PGlite (el test lo dice) y valen sólo contra el Postgres del arnés o CI. [A VALIDAR: correr `emitir-postgres` y `vuelta4-postgres` en CI]
- **Concurrencia real:** PGlite atiende una consulta por vez. No se probó la carrera botón «Cobrar» contra cobranza Serializable sobre el mismo pedido (se espera 40001 y reintento por el UPDATE del pedido), ni la de dos procesos durante la ventana del probe. `fiado-postgres.test.ts` falla igual con y sin estos cambios en «dos entregas a la vez» por la misma limitación. [A VALIDAR en CI]
- **Tiempos de Neon:** los ms son de WASM y sirven para comparar entre sí. Las 200k filas se midieron fuera del arnés porque PGlite se traba armando índices sobre tablas de más de unas 40k filas; en el arnés N2_hub se aplicó sobre 20k.

## Fuera de esta vuelta (no observado por el certificador)
- P2-C2: `pedido.confirmado/listo/entregado`, `stock.*`, `producto.actualizado`, `cliente.creado`, `deuda.vencida`, `caja.*` figuran «pendiente · tanda de …» sin un ID de tanda del plan, aunque sus archivos están en la lista de P2. Lo tiene que decidir el certificador o la PMO.

---

# Dictamen · vuelta 3 · P2 eventos · 3398b52..bad124a (n2/p2-eventos)

Veredicto: CON OBSERVACIONES. F3' (raya del autocorrector) quedó cerrada. No hay fallas alta ni media en lo corregido.

## Verificación
- tsc --noEmit: exit 0.
- src/eventos/*.test.ts: 17/17.
- v3-raya.test.ts: 5/5 en la rama corregida (v3-a..e). Fallan las 2 observaciones (v3-obs, v3-obs2).
- v2-redaccion.test.ts: C6-d y C6-e (F3') pasan ahora. Siguen fallando C6-f, C6-g, C6-h y la obs de largo, o sea F4 y F5 (bajas de la vuelta 2, que no estaban en esta corrección).

## Cerrada (con evidencia)
- F3' · esquema.ts:58 `RE_DIGITOS = /\+?\d(?:[\s.\/()\p{Pd}−]{0,3}\d){5,}/gu`.
  - «11 – 5566 – 7788» y «11 5566 – 7788» salen como «******7788» (v3-a).
  - También se enmascaran con em dash, figure dash, horizontal bar, U+2010, U+2011 (el guion de WhatsApp), fullwidth, small hyphen, ⸺ y el signo menos, juntos o con espacios (v3-b).
  - Lo mismo con NBSP, narrow NBSP y thin space, y con el número copiado de WhatsApp entre U+202A y U+202C (v3-c).
  - En factura.rechazada, el DocNro/CUIT escrito con rayas sale enmascarado (v3-d).
  - Regresión: los textos cortos, las rayas sueltas, los emojis y el email quedan bien (v3-e).

## Observaciones (bajas, no bloquean)
- O1 · el soft hyphen U+00AD entre dígitos («11­5566­7788», pegado desde Word) sale en claro. Repro: v3-raya.test.ts › v3-obs.
  Arreglo: usar como separador `[^\p{L}\p{N}\n]` (lo sugerido en la vuelta 2), o sumar `­​` a la clase.
- O2 · sobre-enmascarado: «pedido 1042 – 12500 pesos» sale como «pedido ******2500 pesos». Pasaba igual antes con «-»; la raya sólo lo extiende.
  Se pierde dato, pero no se filtra nada. Repro: v3-obs2.
- F4 y F5 (vuelta 2, bajas) siguen abiertas: los separadores de 4 o más caracteres, la coma en el DNI y el recorte antes de redactar. Repro: v2-redaccion.test.ts › C6-f/g/h/obs.
- Los cambios en .qa/facturacion-escala/*.txt del worktree no son del certificador (ya estaban en la vuelta 2).


---

# Dictamen · vuelta 2 · P2 eventos · 77c3315..3398b52 (n2/p2-eventos)

Veredicto: NO CERTIFICA (1 media, 2 bajas). F1 (fiscal) y F2 (dedupe en la transición) quedan cerradas. F3 (redacción) está cerrada a medias.

## Verificación
- tsc --noEmit: exit 0.
- Suites del diff + adversariales de la vuelta 1: 27/27 (las 3 fallas de la vuelta 1 ya no se reproducen).
- v2-postgres.test.ts: v2-a, v2-b, v2-c ok. v2-d (costo) falla y queda como observación.
- v2-redaccion.test.ts: 2/7 (la regresión pasa; fallan C6-d/e/f/g/h y la obs de largo).

## Cerradas (con evidencia)
- F1: markInvoiceRejected con un motivo de más de 3000 caracteres deja la factura REJECTED, y el evento sale recortado.
  registerFiscalDocument con caeVencimiento "2026-11-07" deja la factura AUTHORIZED con su CAE, sin evento, y no toca InvoiceCreated (v2-c).
- F2: probe en false cacheado + N2_hub aplicada → el proceso viejo escribe clave NULL. Las 3 reemisiones simultáneas con
  columnas dan 1 fila, y B no ve la fila de A (v2-a). Al revés, un proceso ciego ante una fila escrita con columnas no la duplica (v2-b).

## Fallas
### F3' · media · P2-C6: la redacción sigue dejando teléfonos en claro con la raya «–»
- Dónde: src/eventos/esquema.ts:58 (RE_DIGITOS `[\s.\-/()]{0,3}`).
- Qué: «11 – 5566 – 7788» sale entero, y «11 5566 – 7788» sale como «******5566 – 7788». La raya la pone el autocorrector del teclado. Es la misma rama que F3.
- Repro: v2-redaccion.test.ts › C6-d, C6-e.
- Arreglo: tomar como separador cualquier carácter que no sea letra ni dígito (`/\+?\d(?:[^\p{L}\p{N}\n]{0,3}\d){5,}/gu`) y agregar estos casos a catalogo.test.ts.

### F4 · baja · P2-C6: DNI con comas y separadores de 4 o más caracteres
- «DNI 30,123,456» y «11  -  5566  -  7788» salen enteros. Repro: C6-f, C6-g. El arreglo de F3' cubre la coma; para el segundo caso, `{0,4}`.

### F5 · baja · P2-C6: se recorta antes de redactar
- esquema.ts:69: con slice(0,500) antes del replace, un DNI que cae en el corte deja 5 dígitos en claro («…30123»). Además, el resultado puede pasar de 500 caracteres (748).
- Repro: C6-h y «obs · el texto redactado puede pasar de 500». Arreglo: redactar primero y recortar después: `redactar(texto.slice(0, 2000)).slice(0, 500)`.

## Observaciones
- Regresión de costo: el chequeo `payload->>'clave'` ahora corre también con N2_hub y hace un Seq Scan del outbox del negocio. Con 200k
  filas, cada emisión tarda 46.9 ms dentro de la transacción de la venta, con el candado tomado (v2-d). Sugerencia: en modo columnas,
  `clave = $3 OR (clave IS NULL AND payload->>'clave' = $3)`, más un índice parcial en N2_hub `("tenantId", (payload->>'clave')) WHERE clave IS NULL`.
- Las filas que escribe un proceso con el probe viejo después de N2_hub quedan con clave NULL: el backfill corrió antes. El código las ve, pero el UNIQUE no.
- Los cambios en .qa/facturacion-escala/*.txt del worktree son de las 03:18, de antes de esta vuelta: no son del certificador.


---

# Dictamen · certificación adversarial P2 (eventos) · 5aed9fd..n2/p2-eventos (77c3315)

Veredicto: NO CERTIFICA (3 fallas media). Riesgos atacados: datos y plata.

## Verificación
- tsc --noEmit: exit 0.
- Suites del diff (catalogo, emitir-postgres, arca-envios-concurrencia-postgres): 16/16.
- npm test completo: 6809/6816; 6 fallas FUERA del diff (Playwright club «Lucas Fernández» x4, pie-pegado-zona-segura,
  cron recordatorios por RESEND/WhatsApp sin configurar, redondeos-locales con 50 líneas de club/pedidos; ninguna en los 13 archivos).
- Adversariales: redaccion-y-limites.test.ts 0/4 (4 fallas reproducidas); adversarial-postgres.test.ts: ataque 1 ok, ataques 2 y 3 fallan.

## Fallas

### F1 · media · plata/fiscal: un motivo de rechazo de ARCA > 2000 caracteres deja la factura PENDING para siempre
- Dónde: src/eventos/esquema.ts (textoLibre valida `length <= 2000` ANTES de recortar a 500 en redactarTextoLibre);
  src/eventos/del-core.ts emitirFacturaRechazada; src/lib/invoice-core.ts:489-497; el motivo lo arma arca-dispatch.ts:399 sin recortar.
- Qué: EventoInvalido tumba la transacción de markInvoiceRejected: la factura no pasa a REJECTED, el envío queda abierto, se
  reintenta contra ARCA hasta morir y la venta no se puede refacturar (reabrirSiRechazada pide REJECTED). Antes del diff se grababa.
  Mismo patrón en registerFiscalDocument: una validación del evento puede impedir guardar un CAE ya otorgado.
- Reproducción: adversarial-postgres.test.ts › «ataque 2» (EventoInvalido, factura PENDING); redaccion-y-limites.test.ts › «límite · factura.rechazada…».
- Arreglo: textoLibre acepta cualquier string y recorta al redactar (o recortar motivo/nombre a 500 en del-core antes de emitir);
  test con motivo de 3000 caracteres en markInvoiceRejected.

### F2 · media · datos: la dedupe (P2-C4) no sobrevive la transición sin→con N2_hub
- Dónde: src/eventos/emitir.ts (SQL_INSERTAR_CON_COLUMNAS / SQL_YA_ESTA); prisma/pending-gate2/N2_hub.sql:176-179 (sin backfill).
- Qué: lo emitido sin columnas queda con clave NULL; aplicada N2_hub, reemitir el mismo hecho escribe otra fila (ON CONFLICT no ve
  el NULL). Al revés, un proceso con el probe en false (TTL 60 s) busca `payload._clave`, que las filas en modo columnas no tienen.
  Pega a los emisores futuros que reintentan (aviso de MP repetido → pago.acreditado doble).
- Reproducción: adversarial-postgres.test.ts › «ataque 3» (2 filas; r2 = escrito/columnas).
- Arreglo: en N2_hub, backfill `UPDATE "OutboxEvent" SET "clave" = "payload"->>'_clave' WHERE "clave" IS NULL AND "payload" ? '_clave'`
  antes del UNIQUE; en los dos modos, candado + chequeo por `payload->>'clave'` (el sobre lo trae siempre).

### F3 · media · datos personales (P2-C6): la redacción deja teléfonos/DNI en claro
- Dónde: src/eventos/esquema.ts RE_DIGITOS (`[\s.\-/]?` = un solo separador entre dígitos).
- Qué: «11 - 5566 - 7788» sale entero; «11 5566 - 7788» → «******5566 - 7788»; «DNI 30  123  456» sale entero. Va al webhook de terceros.
- Reproducción: redaccion-y-limites.test.ts › C6-a, C6-b, C6-c.
- Arreglo: separadores de hasta 3 caracteres (`[\s.\-/()]{0,3}`), con esos casos en catalogo.test.ts.

## Observaciones (no bloquean)
- Ataque 1 superado: probe en frío y 6 transacciones simultáneas de dos negocios con 2 conexiones: sin bloqueo, cada evento en su negocio.
- pedido.cobrado no sale por collection-repo.ts:118 (cobro parcial que salda) ni por clientes/fiado.ts:130, y el catálogo no lo anota como pendiente.
- factura.autorizada no distingue nota de crédito (no trae clase ni asociado): un suscriptor contable la sumaría como venta.
- Sin columnas, SQL_YA_ESTA recorre el outbox del negocio por JSON sin índice: 2 veces por venta dentro de la transacción. Los eventos
  quedan processedAt NULL hasta P3 (reset-golive los avisa como pendientes).
- texto/id ≤ 2000 y lista ≤ 1000 renglones pueden rechazar una venta legítima; externalRef no se redacta (si fuera un teléfono de WhatsApp).


---

