# Flags por negocio de la suite de facturación

**Código:** `src/lib/flags/facturacion.ts` (núcleo puro, con tests). **Default: todo APAGADO.**

## Los flags

> ⚠️ **Hoy los flags NO apagan la emisión** (MP-13): sólo `/api/health` los lee; ningún camino de emisión
> consulta `flagActivo` todavía. Hasta que se cableen, para frenar **un** negocio la palanca real es pasarlo a
> homologación (`Tenant.arcaHomologacion = true`: con `ARCA_MODO=real` el motor lo corre como homologación,
> `modoEfectivoDelTenant`, y no sale ninguna factura con validez fiscal). Es un cambio de dato de producción:
> script con dry-run y `--apply` (DX-7), lo decide el dueño. Para frenar **todos**: la llave global (kill-switch B).


| Flag | Qué cambia (cuando se cablee) | Requiere además |
|---|---|---|
| `facturacion.automatica` | Las ventas cobradas se facturan solas en ARCA | `ARCA_INVOICING_ENABLED=true` |
| `facturacion.lote-mensual` | A fin de mes se arma y emite el lote pendiente | `facturacion.automatica` del mismo negocio + llave global |
| `facturita.pwa` | Facturita instalable en el celular | — |
| `arca.produccion` | Las facturas del negocio salen con validez fiscal | llave global + `ARCA_MODO=real` |

**Doble llave:** un flag prendido para un negocio no hace nada si la llave global está abajo. Así el
kill-switch de [incidentes.md](incidentes.md#la-palanca-de-emergencia-kill-switch) apaga a todos de un golpe.

## Cómo se prende para un negocio (hoy)

Variable de entorno `FACTURACION_FLAGS` en Vercel (Production), formato `flag=slug1,slug2;flag=slug`:

```
FACTURACION_FLAGS=facturacion.automatica=chestetica,magra;facturita.pwa=facturita
```

- Los slugs son los de `Tenant.slug` (en minúsculas).
- **Sin comodín:** `*` no prende a nadie (se cuenta como error). Cada negocio se nombra a propósito.
- Lo que no se entiende queda **apagado** y se cuenta en `/api/health` → `arca.flags.erroresDeConfig`.
- Cambiar la variable necesita **Redeploy** (es un deploy: lo decide el dueño).
- `/api/health` → `arca.flags.negociosPorFlag` dice cuántos negocios tienen cada flag (no cuáles).

## Cómo lo consulta el código

```ts
import { flagActivo } from "@/lib/flags/facturacion";
if (flagActivo("facturacion.automatica", tenant.slug)) { … }
// Para soporte: decidirFlag(...) devuelve también el motivo cuando está apagado.
```

## Hacia dónde va (pendiente, no de este frente)

El mecanismo de la casa para prender algo por negocio **sin deploy** son los interruptores de la consola
(`src/cambios/interruptores.ts`, estado en AuditLog, sólo escribe el operador). El núcleo de flags no
depende de la fuente: cuando la célula dueña de `src/cambios/` sume estas cuatro entradas al catálogo,
alcanza con pasarle a `decidirFlag` los encendidos leídos de ahí, y `FACTURACION_FLAGS` se retira (igual
que se retiró `APPS_INICIO`). Pedido anotado en `docs/release/GATE-plataforma.md §Pendientes`.

**Consumidores:** al cierre de este frente ningún camino de emisión consulta todavía estos flags (los
editan otras células en paralelo). Hasta que se cableen, prender un flag **no cambia nada** (MP-13: una
fundación sin consumidor no cuenta como avance de producto).

— Elaborado por GSG (Plataforma, publicación y mantenimiento)
