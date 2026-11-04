# buscatufoto — producto de GSG servido por el ERP en su propio host

**Qué es:** plataforma para que fotógrafos de eventos vendan sus fotos y videos, y la gente se encuentre por
número de dorsal y compre. Dos modos: **demo** (datos en el navegador, IndexedDB, pagos y WhatsApp
simulados) y **servidor** (`/api/btf`, datos en Neon, archivos en un almacén S3-compatible, cobro con el
Mercado Pago del fotógrafo). La app elige sola: si `/api/btf/estado` dice `configurado:false`, sigue en demo.

**Direcciones:** `https://buscatufoto.gsgapp.com.ar` (por el comodín `*.gsgapp.com.ar` del proyecto
`erp-ch`) y `https://buscatufoto-erp.vercel.app`.

## Cómo está enganchado (sin tocar a los demás negocios)

| Pieza | Dónde |
|---|---|
| Fuente de la app (Next 16, con su PRODUCT.md, DESIGN.md y QA) | `celula-negocios-digitales/buscatufoto/` (fuera del tsconfig y del lint del ERP) |
| Exportación compilada que se sirve | `src/tenants/buscatufoto/sitio/` |
| Reglas: host, rutas comodín, tipos | `src/lib/sitio-buscatufoto.ts` (+ `.test.ts`) |
| Manejador | `src/app/sitio-buscatufoto/[[...ruta]]/route.ts` |
| Reescritura por host y trazado de archivos | `next.config.ts` |

- Decide **sólo el host** (`buscatufoto.<dominio>` o `buscatufoto-erp.vercel.app`): en cualquier otro, el
  manejador da 404. No hay negocio en la base, no toca Neon, ni sesión, ni RLS.
- Los recursos de Next de buscatufoto van bajo `/btf/_next/…` (su `assetPrefix`) para no chocar con los del ERP.
- Las rutas dinámicas (`/a/<álbum>`, `/a/<álbum>/pedido/<id>`, `/f/<usuario>`, `/panel/albumes/<id>`) se
  exportan una vez con el comodín `_`; el cliente lee el valor real de la URL.

## Cómo se actualiza

```bash
cd celula-negocios-digitales/buscatufoto
npm ci && BTF_EXPORT=1 npx next build          # genera out/
rm -rf ../../src/tenants/buscatufoto/sitio && cp -r out ../../src/tenants/buscatufoto/sitio
cd ../.. && node --import tsx --test src/lib/sitio-buscatufoto.test.ts
```

## Servidor (`/api/btf`)

| Pieza | Dónde |
|---|---|
| Rutas | `src/app/api/btf/` (contrato: `celula-negocios-digitales/buscatufoto/docs/API.md`) |
| Lógica (sesión, S3 SigV4, precios, validación, mapeo) | `src/lib/btf/` (+ tests) |
| Modelos | `BtfFotografo`, `BtfAlbum`, `BtfMedio`, `BtfPedido` en `prisma/schema.prisma` |
| Migración | `prisma/migrations/20261104120000_buscatufoto_servidor` — **escrita SIN aplicar (Gate 2)** |

Sin `tenantId`: buscatufoto es producto de GSG, no un tenant; el acceso es sólo por servidor y filtrado por
`fotografoId` (RLS N/A, deuda anotada). Sin tablas (P2021) o sin S3 → `configurado:false` y 503 en el resto.

**Variables de entorno**

| Variable | Para qué |
|---|---|
| `BTF_S3_ENDPOINT` · `BTF_S3_REGION` (`auto`) · `BTF_S3_KEY` · `BTF_S3_SECRET` | Almacén S3-compatible (Cloudflare R2) |
| `BTF_S3_BUCKET_ORIGINALES` · `BTF_S3_BUCKET_PREVIAS` | Bucket privado de originales · bucket público de previas |
| `BTF_PREVIAS_URL_PUBLICA` | URL pública del bucket de previas |
| `BTF_SECRET` | Firma de la cookie de sesión |
| `BTF_CODIGO_ALTA` | Código de invitación para dar de alta fotógrafos |
| `FISCAL_MASTER_KEY` | Ya existe; cifra el token de Mercado Pago (`sealSecret`) |

**Pasos del dueño para encender (PLAN-ENTREGA §C)**

1. Cuenta Cloudflare + 2 buckets (`btf-previas` público, `btf-originales` privado) + token de API + CORS
   (`PUT` desde el host de buscatufoto).
2. Secretos en Vercel: `BTF_S3_*`, `BTF_SECRET`, `BTF_CODIGO_ALTA` (y la master key ya existente).
3. `prisma migrate deploy` (Gate 2).
4. Push a `main` = deploy (Gate 1).
5. Del fotógrafo: su Access Token de MP y confirmar que el organizador tiene los consentimientos.
6. Comisión de GSG y planes: números (provisional a confirmar).

## Límites declarados

En modo demo, un usuario técnico puede leer IndexedDB: la protección real del original existe sólo en modo
servidor (bucket privado + URL firmada tras el pago). El modo servidor no anda hasta que el dueño haga los
pasos de arriba (migración sin aplicar). La limpieza a 90 días del evento es provisional a confirmar y la
corre el dueño. Textos legales: borrador provisional a confirmar por un abogado. Los números de planes y la
comisión de GSG son provisionales a confirmar. Detalle en `celula-negocios-digitales/buscatufoto/PRODUCT.md`.

— Elaborado por GSG
