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

