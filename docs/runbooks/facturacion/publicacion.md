# Publicar la suite de facturación automática (Facturita + consola del contador + motor)

**Para qué:** el paso a paso de este release, de `claude/facturacion-automatica` a producción. Queda listo
para el día en que el dueño diga «deployá»: nada de esto se ejecuta sin su OK.

El checklist general de cualquier release es [`docs/release/CHECKLIST-RELEASE.md`](../../release/CHECKLIST-RELEASE.md).
Este runbook lo baja a **este** release, con sus migraciones, sus variables y su host. Ante conflicto,
**gana el orden de este documento**.

> ⚠️ **Publicar arrastra a TODOS los negocios.** El proyecto `erp-ch` de Vercel sirve a todos con un
> solo deploy (ADR-070): CH, Magra, Break Point, WPE, la suite… Un merge a `main` es un deploy de
> producción para todos (CLAUDE.md, Gate 1). No hay un proyecto aparte para Facturita.

## Qué se publica

| Pieza | Dónde |
|---|---|
| Facturita como app: PWA, vidriera, planes, alta, legales en borrador | `src/app/facturita/**`, `public/facturita/**` |
| Consola del contador: abonos, lote del mes, CAE, rechazos, exportar | `src/app/contador/**`, `src/lib/cartera-*.ts` |
| Motor: reintentos, interruptor, firma por negocio o por delegación, NC, ABONO | `src/lib/arca-*.ts`, `src/lib/invoice-core.ts`, `src/lib/facturacion/**`, `src/plugins/arca/**` |
| Host de producto: la raíz de `facturita-gsg.vercel.app` abre la vidriera | `src/lib/producto-host.ts`, `src/proxy.ts` |
| Tren de releases, monitoreo y runbooks | `.github/workflows/release.yml`, `scripts/release/**`, `/api/ready`, `docs/runbooks/facturacion/**` |

## El orden (no se saltea ni se invierte)

**Migraciones → lote-deploy → variables → merge → verificación.** El código nuevo crea facturas usando
columnas y tablas que todavía no existen en Neon (`Invoice.descripcion`, `Invoice.abonoClave`, `ReglaFacturacion`
y `CobroFacturado`, que usan todos los caminos de Mercado Pago, turnos y extracto). Si el código
llega antes que la migración, `scripts/vercel-build.mjs` frena el build y no publica (prod no se
rompe), pero `main` queda trabado para todos hasta que se migre.

### 0. Antes de empezar
- [ ] **Auditoría GSG aprobada** sobre el tip que se va a publicar (veredicto en el PR).
- [ ] **Reporte LISTO:** `npm run release:preparar`, o los workflows `gates` y `release` en verde en el PR.
- [ ] **Decisiones del dueño tomadas:** Gate 2 (paso 2), textos legales aprobados, precios, CUIT de GSG para la
  delegación y número de `WHATSAPP_GSG`.

### 1. Backup de Neon (dueño)
- [ ] Neon Console → Branches → *Create branch* desde `main`, con el nombre `backup-pre-facturacion-automatica`.
  Es lo único que deshace un error de datos ([rollback.md §D](rollback.md)).

### 2. Migraciones: Gate 2 (dueño)
Tres migraciones **aditivas**. Están ensayadas sobre la cadena completa en un Postgres 16 local (célula del
motor, 2026-10-22). No tocan datos existentes.

| Carpeta | Qué hace |
|---|---|
| `prisma/migrations/20261022140000_invoice_abono_descripcion` | Suma a `Invoice` dos columnas nulables: `abonoClave` y `descripcion`. También un índice único `(tenantId, abonoClave)`: un abono, un mes, una sola factura. |
| `prisma/migrations/20261022140100_regla_facturacion` | Crea la tabla `ReglaFacturacion` (los abonos del contador), con llave a `CarteraCliente`, CHECKs y **RLS adentro de la migración**. |
| `prisma/migrations/20261022150000_cobro_facturado` | Crea la tabla `CobroFacturado` (regla R1, «una factura por cobro»): cada cobro —pago de MP, resto de un turno, crédito del extracto— queda atado a la factura que lo cubre, con índice único `(tenantId, clave)`, CHECKs y **RLS adentro**. |

- [ ] Sumarlas al final de `prisma/lote-deploy.txt`, con una línea de comentario fechada, como las anteriores:
  ```
  # AAAA-MM-DD: suite de facturación automática (Facturita + consola del contador + motor), publicación
  # pedida por el dueño. Aditivas: dos columnas nulables + índice único en "Invoice"; una tabla nueva
  # con RLS adentro ("ReglaFacturacion"); otra tabla nueva con RLS adentro ("CobroFacturado", una factura por cobro).
  20261022140000_invoice_abono_descripcion
  20261022140100_regla_facturacion
  20261022150000_cobro_facturado
  ```
  Sacá del lote las que ya estén aplicadas (si el build frena diciendo que no coinciden, la lista manda).
  Este cambio va **en el PR**, por pathspec.
- [ ] **Antes de cargar nada**, revisá que ningún otro frente haya sumado migraciones a `main` en el
  medio (choque de timestamps): `npm run release:preparar` lo marca.

### 3. Variables de entorno: Vercel → `erp-ch` → Settings → Environment Variables (dueño)
Las pega **siempre el dueño**, nunca el agente (SEC-1, ADR-041). Acá van sólo los nombres.

| Variable | Entorno | Para qué |
|---|---|---|
| `MIGRATE_DATABASE_URL` | Production | Cadena **directa** de Neon (sin `-pooler`), para que el build migre. Se saca después del deploy. |
| `ARCA_INVOICING_ENABLED` | Production | Llave global de la facturación con ARCA (`true` para emitir). |
| `ARCA_MODO` | Production | `homologacion` para arrancar; `real` sólo con el OK fiscal del dueño ([encender-arca-real.md](../encender-arca-real.md)). |
| `ARCA_CERT_PEM`, `ARCA_KEY_PEM` | Production | Certificado de GSG con el que firma la delegación (ADR-077 §6). |
| `FISCAL_MASTER_KEY`, `FISCAL_MASTER_KEY_ID` | Production | Cifrado de los certificados propios de cada negocio (ADR-066). |
| `CRON_SECRET` | Production | Para que corra el cron del outbox de ARCA. Sin él, `/api/health` lo marca. |
| `WHATSAPP_GSG` | Production **y** Preview | El alta de Facturita lo lee **al compilar**, así que tiene que estar antes del build. |
| `TENANT_HOST_MAP` | Production | **Sumarle** la entrada de abajo; nunca reemplazar el valor vigente (MT-6). |
| `FACTURACION_FLAGS` | Production | Opcional. Hoy los flags todavía no apagan la emisión ([flags.md](flags.md)). |

**Entrada de `TENANT_HOST_MAP` para Facturita** (el valor es `host=subdominio`, separado por `;`):
```
facturita-gsg.vercel.app=facturita
```
Abrí el valor vigente, agregale `;facturita-gsg.vercel.app=facturita` al final si no está, y guardá. No lo
reescribas de memoria: perderías los hosts de los otros negocios (MT-6). La raíz `/` de ese host ya abre
la vidriera por código (`src/lib/producto-host.ts`); el mapa resuelve el negocio para el resto de las rutas.

- [ ] Vercel → `erp-ch` → Settings → Domains: confirmá que `facturita-gsg.vercel.app` esté asignado al
  proyecto (runbook [golive-suite-3-productos.md §7](../golive-suite-3-productos.md)).

### 4. Merge: «deployá» (dueño)
- [ ] El dueño dice «deployá» → merge del PR a `main`. El build de producción:
  1. migra (con `MIGRATE_DATABASE_URL`) sólo si lo pendiente coincide con `lote-deploy.txt`;
  2. verifica los árbitros de plata y el aislamiento;
  3. compila. Si algo falla, **no publica** y lo dice.
- [ ] **No cancelar** un build que está migrando (P3009).
- [ ] Al terminar: sacar `MIGRATE_DATABASE_URL` de Production. No hace falta otro deploy para eso.

### 5. Verificación (orquestador o dueño)
- [ ] El workflow `release` → job `smoke` corre solo cuando Vercel termina. A mano:
  `npm run release:smoke -- https://facturita-gsg.vercel.app --commit <sha>`.
- [ ] `https://facturita-gsg.vercel.app/` muestra la vidriera de Facturita (no la home de otro negocio).
- [ ] `/facturita/app` sin sesión → login. `/facturita/manifest.webmanifest` → 200.
- [ ] En el celular: «Instalar» aparece (Android) y la app abre en `/facturita/app`.
- [ ] `/api/ready` → `arca.estado` en `ok` o `apagado` (no `critico`). `/api/health` → `arca.cronProtegido: true` y `arca.facturacion: true`.
- [ ] Una factura de prueba en **homologación** desde un negocio de prueba: sale el CAE de prueba.
- [ ] Consola del contador: `/contador/lote` abre y muestra la cartera; nada se emite sin el clic.
- [ ] Si algo falla: [rollback.md](rollback.md). Rollback de app en Vercel (instantáneo) + kill-switch de ARCA.

### 6. Después
- [ ] Tag de versión (`npm run release:notas -- --tag`; el tag lo pushea el dueño).
- [ ] Actualizar `docs/ESTADO-ACTUAL.md` (main, prod, migraciones aplicadas) y sacar las tres migraciones
  del lote en el próximo release.
- [ ] Retro (ADR-047): una entrada en `docs/lecciones-aprendidas/registro.md` si algo costó.

— Elaborado por GSG
