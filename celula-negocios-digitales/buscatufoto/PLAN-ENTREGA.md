# buscatufoto — plan de entrega al primer fotógrafo (04/11/2026)

**Orden del dueño:** «ya tengo el fotógrafo; hay que terminar el producto y entregárselo». Fotógrafo y fecha del
evento: *provisional a confirmar por el dueño*. Rama `claude/buscatufoto-entrega`. Nada se despliega ni se contrata sin OK.

## Problema y opción elegida
Hoy todo vive en el navegador del fotógrafo (IndexedDB): el comprador no ve el álbum y no hay cobro. Comparé:
- **Asistida a mano** (Drive + link de WhatsApp + transferencia + mandar originales uno a uno): $0, pero ~3 h del
  fotógrafo por evento, originales viajando por WhatsApp y sin control de quién pagó. No es producto.
- **Elegida — servidor en el ERP mismo + almacén S3-compatible + Checkout Pro del fotógrafo.** Mínimo que vende:
  el ERP (ya desplegado en `erp-ch`) suma rutas `/api/btf/*` en el host de buscatufoto; los bytes NO pasan por
  Vercel (subida y descarga con URL firmadas directo al almacén). Costo marginal US$ 0/mes (abajo).

## Arquitectura mínima
1. **Datos (Neon):** modelos aditivos `BtfFotografo`, `BtfAlbum`, `BtfMedio`, `BtfPedido` (JSON para paquetes,
   escalones, cupones, colaboradores, marca, cotización). Migración escrita **sin aplicar** (Gate 2). Si la tabla no
   existe (P2021) `/api/btf/estado` responde `configurado:false` y la app sigue en demo (IndexedDB). Sin `tenantId`:
   buscatufoto es producto de GSG, no un tenant; acceso sólo por servidor, filtrado por `fotografoId` (deuda anotada: RLS N/A).
2. **Almacén:** Cloudflare R2 (S3; 10 GB y egreso gratis). Dos buckets: `btf-previas` público (previa ≤1280 px y
   miniatura, ya marcadas en el navegador) y `btf-originales` privado. Firma SigV4 a mano con `node:crypto` (sin
   dependencias): PUT prefirmado para subir (10 min) y GET prefirmado para bajar (10 min). Descartado Vercel Blob
   (1 GB gratis: un evento son ~2,5 GB de originales).
3. **Cobro — Mercado Pago del fotógrafo, nunca la cuenta de GSG.** El fotógrafo pega su Access Token de producción
   en «Cobros»; se guarda cifrado con `sealSecret` (`src/lib/fiscal/cert-crypto.ts`, master key del entorno). El
   servidor crea la preferencia de Checkout Pro con ESE token (`external_reference` = id del pedido, `notification_url`
   = `/api/btf/mp/webhook`), el webhook consulta `/v1/payments/{id}` con el mismo token y marca pagado sólo si
   `approved` y el monto coincide; la página del pedido re-verifica contra MP (cubre webhooks perdidos). GSG no toca
   la plata: su comisión se cobra aparte al fotógrafo (*provisional*). Alternativa criolla: «transferencia» deja el
   pedido pendiente con alias + WhatsApp y el fotógrafo lo marca pagado desde Ventas.
4. **Descarga:** `/api/btf/descarga?pedido&clave&medio` verifica pedido pagado + clave (comparación constante) +
   medio del pedido → 302 a la URL firmada. El original jamás se lista ni se sirve sin eso.
5. **Cliente (app estática):** `RepositorioRemoto` implementa el mismo contrato `Repositorio` (`src/lib/repo/tipos.ts`);
   `obtenerRepo()` elige remoto si `/api/btf/estado` dice configurado. Subida: marca en el navegador (ya hecha) →
   metadata → 3 PUT firmados → confirmar. Ingreso: email + contraseña (scrypt de `src/lib/auth-password.ts`), cookie
   HttpOnly firmada; alta sólo con código de invitación (`BTF_CODIGO_ALTA`) que el dueño le pasa al fotógrafo.
6. **Enrutado:** la reescritura `/:ruta*` del host deja pasar `/api/btf/*` (test en `src/lib/sitio-buscatufoto.test.ts`).

## Datos de personas y menores (Ley 25.326)
- Responsable del tratamiento: el fotógrafo; GSG es encargado (lo dice `/privacidad` y los Términos). Del comprador se
  guarda sólo nombre, email y WhatsApp (entrega del pedido). Nunca se guardan tarjetas: las ve MP.
- Al crear el álbum el fotógrafo tilda y queda registrado (fecha): «el organizador tiene el consentimiento de los
  participantes y de los responsables de los menores para tomar y vender imágenes del evento».
- **Retiro de fotos:** en cada foto pública «Pedir que saquen esta foto» (WhatsApp al fotógrafo con el id) y en el
  panel «Ocultar»: la foto desaparece del álbum y de la descarga. Sin dorsal ni nombre se busca; no hay reconocimiento facial.
- **Retención:** originales y previas se borran a los 90 días del evento (`scripts/btf-limpieza.mjs`, lo corre el
  dueño; *provisional*). Pedidos quedan sin archivos.

## Costo mensual estimado (provisional)
R2 US$ 0 hasta 10 GB (~3 eventos) y US$ 0,015/GB-mes después · Neon: KB de metadata, gratis · Vercel: sólo
funciones chicas (firmas, webhook), dentro del plan actual · MP: la comisión la paga el fotógrafo en su cuenta
(~6,3 % + IVA con acreditación inmediata; verificar en la cuenta). **GSG: US$ 0 marginal.**

## §C — lo que sólo el dueño ejecuta (se arma listo-para-OK)
1. Cuenta Cloudflare + 2 buckets + token de API + CORS (`PUT` desde el host de buscatufoto). 2. Secretos en Vercel:
`BTF_S3_*`, `BTF_SECRET`, `BTF_CODIGO_ALTA` (y master key ya existente). 3. `prisma migrate deploy` (Gate 2).
4. Push a `main` = deploy (Gate 1). 5. Del fotógrafo: su Access Token de MP y confirmar que el organizador tiene
los consentimientos. 6. Comisión de GSG y planes: números.

## Tandas (1–2 `gsg-ingeniero` en Opus, brief ≤ 2 KB; certificación sólo plata + datos)
T1 servidor base: schema + migración + `src/lib/btf/` (db tolerante, SigV4, sesión) + estado/ingreso/álbumes/medios.
T2 plata: pedidos + preferencia MP + webhook + verificación + descarga firmada + transferencia. T3 cliente:
`RepositorioRemoto`, subida firmada, checkout, pedido, ocultar/retiro, consentimiento; reexportar el sitio.
T4 certificación adversarial del diff + QA clic por clic fotógrafo → comprador → pago → descarga + docs.

— Elaborado por GSG
