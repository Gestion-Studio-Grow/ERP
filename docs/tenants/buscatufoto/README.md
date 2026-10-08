# buscatufoto — producto de GSG servido por el ERP en su propio host

**Qué es:** plataforma para que fotógrafos de eventos vendan sus fotos y videos, y la gente se encuentre por
número de dorsal y compre. Demo funcional sin servidor: los datos viven en el navegador (IndexedDB), con
pagos y WhatsApp en modo demostración.

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

## Límites declarados

La protección real del original exige backend (hoy un usuario técnico puede leer IndexedDB). Los números
de planes son provisionales a confirmar. Detalle en `celula-negocios-digitales/buscatufoto/PRODUCT.md`.

— Elaborado por GSG
