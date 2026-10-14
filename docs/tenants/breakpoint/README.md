# Break Point Pádel — negocio de la plataforma con su sitio en breakpoint.gsgapp.com.ar

Prospecto en preventa (club de pádel, Ezeiza). Su "sitio" es la **demo de gestión del club**
(recepción + dueño con cámaras, stock y turnos), en un solo archivo. **Es demo a costo cero:** datos de
ejemplo, sin persistencia ni credenciales (ciclo DEMO → VENTA → INVERSIÓN). Análisis y reglas:
[`REINGENIERIA.md`](REINGENIERIA.md).

Mismo mecanismo que Circuito WPE ([`../circuito-wpe/README.md`](../circuito-wpe/README.md)): **sin cambios de schema.**

| Pieza | Archivo |
|---|---|
| Fuente de la demo (la que se edita) | `public/previews/breakpoint/club/{index.html, app.mjs, motor.mjs}` |
| El sitio que sirve el ERP (generado, no se edita) | `src/tenants/breakpoint/sitio/index.html` |
| Empaquetador | `node src/tenants/breakpoint/empaquetar.mjs` |
| Registro del sitio (slug `breakpoint`, subdominio `breakpoint`) | `src/lib/sitio-estatico.ts` |
| Nombre y monograma del ingreso y del panel | `src/lib/branding.ts` → `TENANTS.breakpoint` |
| Tests (motor, empaquetado al día, registro del sitio) | `src/tenants/breakpoint/motor-club.test.ts` · `src/lib/sitio-estatico.test.ts` |

En `breakpoint.<dominio>`, `/` se reescribe a `/sitio-estatico` y el manejador sirve el archivo **sólo si el
host resuelve al negocio `breakpoint`**. Sin ese negocio en la base, responde 404 (falla cerrado): el código
puede estar publicado antes del alta sin exponer nada.

## Para que quede en vivo (dos pasos del dueño)

1. **Publicar** (Gate 1): merge de la rama a `main` + deploy del proyecto `erp-ch`. Antes: `tsc` + `next build`
   del proyecto completo en verde.
2. **Alta en producción** (consola: Soporte → Alta de negocio), como con WPE y el supermercado:

| Campo | Valor |
|---|---|
| Nombre del negocio | `Break Point Pádel` |
| Slug | `breakpoint` |
| Subdominio | `breakpoint` |
| Datos fiscales | vacíos, marcados *provisional a confirmar* |
| Certificado ARCA | **no** |

Verificación: `https://breakpoint.gsgapp.com.ar/` muestra la gestión del club; `/api/health` sigue ok; la ficha
de CH no cambió. **La clave del dueño que muestra el alta la copia el dueño; nadie más la lee.**

**Antes de mostrárselo al club:** autorización registrada de uso de marca (ADR-034) y logo vectorial oficial.

— Elaborado por GSG
