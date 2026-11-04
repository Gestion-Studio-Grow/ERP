# API de buscatufoto — contrato servidor ↔ app (`/api/btf/*`)

Rutas del ERP (`src/app/api/btf/…`) en el MISMO host de buscatufoto; la reescritura del host deja pasar `/api/btf`.
JSON siempre. Errores: `{ error: <codigo ErrorRepo | "no-autenticado" | "no-configurado">, mensaje }` con
401 / 403 / 404 / 409 (duplicado) / 422 (invalido, cupon, precio) / 503 (no-configurado). Dinero: ARS enteros.
Sesión del fotógrafo: cookie `btf_sesion` HttpOnly, SameSite=Lax, firmada HMAC-SHA256 con `BTF_SECRET` (payload
`fotografoId.exp`, 30 días). Tipos: `celula-negocios-digitales/buscatufoto/src/lib/tipos.ts`.

## Diferencias con los tipos de la app
- `Medio` por red: en vez de `previa`/`miniatura` (Blob) viene `previaUrl` y `miniaturaUrl` (string, bucket público)
  y además `subido: boolean`, `oculto: boolean`. Nunca viaja nada del original.
- `Fotografo` por red: sin `cobro.mpAccessToken`; trae `mpConfigurado: boolean`. Público (`/fotografos/:usuario`): sin email ni cobro.
- `Album` público (`/a/:slug`): sin `cupones` (se validan en el servidor con `cotizar`) y colaboradores sólo nombre+rol.
- `Pedido`: `estado: "pendiente" | "pagado"`, `metodo: "mercadopago" | "transferencia"`, `clave` sólo se devuelve
  al crearlo y al consultarlo con la clave. `Repositorio` suma `cotizar(albumId, items, cupon)`.

## Entorno (servidor)
`BTF_S3_ENDPOINT` · `BTF_S3_REGION` (`auto`) · `BTF_S3_KEY` · `BTF_S3_SECRET` · `BTF_S3_BUCKET_ORIGINALES` ·
`BTF_S3_BUCKET_PREVIAS` · `BTF_PREVIAS_URL_PUBLICA` · `BTF_SECRET` · `BTF_CODIGO_ALTA` · `FISCAL_MASTER_KEY`
(ya existe; cifra el token de MP). Sin tablas (P2021) o sin S3 → `configurado: false` y 503 en el resto.

## Rutas
| Método y ruta | Quién | Cuerpo → respuesta |
|---|---|---|
| GET `/estado` | todos | `{ configurado, mp: boolean }` |
| POST `/ingreso/alta` | todos | `{ nombre, email, contrasena, codigo }` → 201 Fotografo + cookie. 403 si `codigo ≠ BTF_CODIGO_ALTA` |
| POST `/ingreso` · DELETE `/ingreso` | todos | `{ email, contrasena }` → Fotografo + cookie · borra cookie |
| GET `/yo` · PATCH `/yo` | fotógrafo | Fotografo · `{ nombre?, usuario?, bio?, instagram?, cobro?, marca? }` → Fotografo |
| PUT `/yo/mp` · DELETE `/yo/mp` | fotógrafo | `{ accessToken }` → se guarda cifrado (`sealSecret`) → `{ mpConfigurado: true }`. Nunca se devuelve |
| GET `/fotografos/:usuario` | todos | `{ fotografo (público), albumes: Album[] publicados }` |
| POST `/albumes` · GET `/albumes` | fotógrafo | `DatosAlbum & { consentimiento: true }` → 201 Album (sin consentimiento: 422) · mis álbumes |
| GET/PATCH/DELETE `/albumes/:id` | dueño | Album · cambios parciales → Album · borra álbum, medios, pedidos y objetos del almacén (best effort) |
| GET `/albumes/:id/medios` | dueño | Medio[] (incluye ocultos y no subidos) |
| POST `/albumes/:id/medios` | dueño | `{ nombreArchivo, tipo, ancho, alto, duracion, peso, dorsales, mimeOriginal, mimePrevia }` → 201 `{ medio, subir: { original, previa, miniatura } }` (PUT prefirmados, 10 min, `Content-Type` fijado) |
| POST `/medios/:id/confirmar` | dueño | → Medio con `subido: true` (sólo entonces es público) |
| PATCH `/medios/:id` · DELETE `/medios/:id` | dueño | `{ dorsales?, oculto? }` → Medio · borra fila y objetos |
| POST `/medios/:id/vistas` | dueño | → `{ previa, miniatura }` PUT prefirmados (rehacer marca) |
| GET `/medios/:id/original` | dueño | 302 a GET prefirmado (10 min) |
| GET `/a/:slug` | todos | `{ album (público), medios: Medio[] subidos y no ocultos, fotografo: { nombre, usuario, whatsapp?, mpConfigurado, cobro: { metodo, titular, alias } \| null } }` (`mpConfigurado`: conectó Mercado Pago; sin él el carrito sólo ofrece transferencia) |
| POST `/a/:slug/cotizar` | todos | `{ items, cupon }` → Cotizacion (`lib/precios.cotizar` en el servidor) |
| POST `/a/:slug/pedidos` | todos | `{ items, comprador, cupon, totalEsperado, metodo }` → 201 `{ pedido, pagar?: { initPoint } }`. Recalcula; si `total ≠ totalEsperado` → 422 `precio`. El cupón se **reserva al crear** (Serializable: `activo` y `usos < usosMax`, 0 = ilimitado; `usos + 1` en el mismo tx que inserta el pedido); si ya no alcanza → 422 `cupon`. Si MP no arma la preferencia, el pedido se descarta y el cupón se libera. Host que no es de buscatufoto (ni `localhost`) con MP → 400 `host` |
| GET `/pedidos/:id?clave=` | quien tiene la clave | Pedido. Si está pendiente y es MP, consulta MP antes de responder |
| GET `/descarga?pedido&clave&medio` | quien tiene la clave | 302 al GET prefirmado del original. Exige pagado + clave (comparación constante) + medio del pedido |
| POST `/mp/webhook` | Mercado Pago | `{ type:"payment", data:{ id } }` → busca el pago en MP con el token del fotógrafo del pedido (`external_reference`), marca pagado sólo si `approved` y `transaction_amount === total`. Siempre 200 |
| GET `/pedidos` · GET `/albumes/:id/pedidos` | dueño | Pedido[] (sin clave) |
| POST `/pedidos/:id/marcar-pagado` | dueño | sólo `transferencia` pendiente → Pedido pagado |

## Almacén (S3-compatible, firma SigV4 con `node:crypto`, sin dependencias)
Claves: originales `o/<fotografoId>/<albumId>/<medioId>.<ext>` (bucket privado); previas `p/<albumId>/<medioId>.<ext>`
y miniaturas `m/<albumId>/<medioId>.<ext>` (bucket público → `previaUrl = BTF_PREVIAS_URL_PUBLICA/p/...`).

## Mercado Pago (siempre con el token del fotógrafo)
Preferencia: `POST https://api.mercadopago.com/checkout/preferences` con `items` (1 ítem «N fotos de <álbum>»,
`unit_price = total`), `external_reference = pedidoId`, `notification_url = https://<host>/api/btf/mp/webhook`,
`back_urls` a `https://<host>/a/<slug>/pedido/<pedidoId>?clave=<clave>`, `auto_return: "approved"`,
`X-Idempotency-Key = pedidoId`. Verificación: `GET /v1/payments/{id}` y, para el re-chequeo del pedido,
`GET /v1/payments/search?external_reference=<pedidoId>`. El cupón se reserva al crear el pedido, no al pagar: marcar pagado no toca `usos`. El webhook sin `?pedido=` válido responde 200 y no hace nada (la `notification_url` siempre lo lleva).

— Elaborado por GSG
