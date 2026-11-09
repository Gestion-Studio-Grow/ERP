# Taller de stands de Ale — tenant aparte (GSG-MIA-004)

Slug `taller-ale` y nombre: **provisionales a confirmar**. Pedido del dueño (09/11/2026): la gestión de
proyectos de MIA no lleva los costos del armado del stand; el taller de Ale (socio) trabaja para MIA
pero con administración separada. Va como **otro tenant del mismo motor**, sin datos cruzados.

Plan hecho con Fable el 09/11/2026. Lo construido está marcado.

## Rubro y módulos
- Rubro nuevo `taller-stands` (no `productora`: ese blueprint arrastra 2FA y Google, el panel cerrado,
  el redirect del sitio y las consultas de MIA). Sin palabras clave: el onboarding por texto no cae acá.
- Preset: `proyectos, clients, catalog, inventario, reports, arca, taller-stands`.
- Un stand = un `Proyecto`. Presupuesto = `ProyectoPresupuesto/Item`. Costo real = `ProyectoGasto`.

## Tandas
| Tanda | Alcance | Estado |
|---|---|---|
| T1 (S) | Rubro, preset, descriptor `taller-stands` sin pantallas, flag `TALLER_STANDS_ENABLED` (apagado), alta idempotente sin usuarios (`scripts/taller-stands/alta-taller-ale.ts`), tests | **Hecha** |
| T2 (M) | `TallerPieza` (catálogo con costo interno) + `TallerDespiece` por stand + core + pantalla «Despiece» → pasa a presupuesto + papel para la productora sin costo ni margen | **Hecha** (migración `20261109130000_taller_piezas_despiece` escrita, sin aplicar: Gate 2) |
| T3 (M) | `TallerHora` (mano de obra); costo teórico contra real por rubro | Pendiente |
| T4 (M) | `TallerPedido`: compra de materiales que, recibida, entra como `ProyectoGasto` «Materiales» | Pendiente |
| T5 (L) | Cruce con MIA (abajo): se construye y queda **apagado**; certificado por subagentes antes del PR | Pendiente |
| T6 (M) | Stock real de materiales: pieza ↔ `Product`, el despiece consume del stock al armar | Pendiente |
| T7 (M) | Armador 3D: el cómputo de materiales del armador alimenta el despiece | Pendiente |

## Opción superadora (T5, opt-in, apagada)
MIA genera desde su proyecto un vínculo, y Ale lo pega. Ale le manda el presupuesto por link con
token (hasheado, de un solo uso y con vencimiento). Al aceptarlo, se inserta **un** `ProyectoGasto`
en MIA, idempotente por vínculo. Viaja sólo el precio, nunca el costo ni el margen de Ale.
Riesgo: es la única escritura entre tenants. Va en dos transacciones, cada una con su `tenantId` y
sin bypass de RLS, con rate limit y auditoría de los dos lados.

## Cómo correr el alta (local o rama de Neon, nunca producción)
```
TALLER_STANDS_ENABLED=1 npx tsx scripts/taller-stands/alta-taller-ale.ts                 # base local
TALLER_STANDS_ENABLED=1 npx tsx scripts/taller-stands/alta-taller-ale.ts --rama-neon ep-… # rama de prueba
```
Frena si el flag está apagado, si el host no es local ni el endpoint nombrado, o si RLS no está activo.

## Decisiones del dueño del 09/11/2026 (vía la orquestadora ORQ-005)
- Rubro `taller-stands`: aprobado. Plan de T1 a T4 aprobado; T5 se construye y queda apagado.
- A Ale no se le manda todavía nada: ni versión, ni usuario, ni acceso. El alta no crea usuarios.
- El cruce con MIA no se activa. Por ahora el presupuesto pasa a MIA a mano: exportación o impresión
  **sin costo ni margen**.
- Del lado de MIA acepta Dirección o el Dueño (rol configurable).
- Firmes: stock real de materiales (T6), valor hora por persona (T3) y armador 3D para el despiece (T7).

## Quedan para el dueño (owner-level: sólo se anotan)
1. Usuarios y credenciales de Ale, y cuándo se le da acceso.
2. Nombre comercial y CUIT del taller (hoy, provisionales a confirmar).
3. Activar el cruce con MIA (T5).
