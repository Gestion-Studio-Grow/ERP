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
| T2 (M) | `TallerPieza` (catálogo con costo interno) + `TallerDespiece` por stand + core + pantalla «Despiece» → pasa a presupuesto | Pendiente |
| T3 (M) | `TallerHora` (mano de obra); costo teórico contra real por rubro | Pendiente |
| T4 (M) | `TallerPedido`: compra de materiales que, recibida, entra como `ProyectoGasto` «Materiales» | Pendiente |
| T5 (L, opt-in) | Cruce con MIA (abajo) | Sólo con OK del dueño |

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

## Decisiones del dueño (owner-level: no se hacen sin su OK)
1. Confirmar el rubro nuevo `taller-stands` (recomendado).
2. ¿Ale lleva stock real de materiales o sólo compras por stand?
3. ¿Valor hora por persona o único?
4. Usuarios y credenciales de Ale; nombre comercial y CUIT del taller.
5. Activar el cruce con MIA (T5) y quién acepta del lado de MIA.
6. ¿Ale usa el armador 3D o sólo el despiece?
