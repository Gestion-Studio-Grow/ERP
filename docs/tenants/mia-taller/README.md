# MIA Taller — negocio propio (GSG-MIA-004 → GSG-MIA-045)

Slug y link `mia-taller`, nombre «MIA Taller»: **provisionales a confirmar** (antes `taller-ale`). Pedido del dueño
(09/11/2026): la gestión de proyectos de MIA no lleva los costos del armado del stand; el taller de Ale (socio)
trabaja para MIA pero con administración separada. Va como **otro tenant del mismo motor**, sin datos cruzados.

## Negocio propio (T5 del 16/11, GSG-MIA-045 · criterio V9)
Orden del dueño del 16/11: «mi taller tiene que estar subido también y tiene que estar construido». Modelo B
(`Factory-GSG 00-ESTADO/DECISION-ARM-MIA-2026-11-16.md`): ARM-MIA adelante, MIA Producciones y MIA Taller detrás,
cada uno con su link, sus usuarios, sus proyectos y su administración.
- Rama `gsg-mia-045-taller`: la cadena #71 → #80 al día con `main` (170e56f3).
- El alta carga `subdomain = mia-taller` (sin eso no había link: el negocio se resuelve por subdominio).
- Marca del ingreso: sólo el nombre «MIA Taller» y el monograma «MT», acento neutro del motor (`src/lib/branding.ts`).
- Aislamiento de los tres negocios: `src/lib/taller-stands/negocio-propio-postgres.test.ts` (rol `app_rls`).
- **Placeholders, provisional a confirmar:** CUIT y razón social (no se cargan; la facturación avisa «Falta el
  CUIT»), dominio público (hoy sólo `mia-taller.<dominio de la app>`), valor hora (lo carga el taller por persona en
  «Valores hora»; no hay ningún valor en el código).
- **No incluye:** el cruce Taller ↔ ARM/Producciones (T4, asignación entre negocios) ni la ficha de stand (T6).

Plan hecho con Fable el 09/11/2026. Lo construido está marcado.

## Rubro y módulos
- Rubro nuevo `taller-stands` (no `productora`: ese blueprint arrastra 2FA y Google, el panel cerrado,
  el redirect del sitio y las consultas de MIA). Sin palabras clave: el onboarding por texto no cae acá.
- Preset: `proyectos, clients, catalog, inventario, reports, arca, taller-stands`.
- Un stand = un `Proyecto`. Presupuesto = `ProyectoPresupuesto/Item`. Costo real = `ProyectoGasto`.

## Tandas
| Tanda | Alcance | Estado |
|---|---|---|
| T1 (S) | Rubro, preset, descriptor `taller-stands` sin pantallas, flag `TALLER_STANDS_ENABLED` (apagado), alta idempotente sin usuarios (`scripts/taller-stands/alta-mia-taller.ts`), tests | **Hecha** |
| T2 (M) | `TallerPieza` (catálogo con costo interno) + `TallerDespiece` por stand + core + pantalla «Despiece» → pasa a presupuesto + papel para la productora sin costo ni margen | **Hecha** (migración `20261116200000_taller_piezas_despiece` escrita, sin aplicar: Gate 2) |
| T3 (M) | `TallerHora` (mano de obra); costo teórico contra real por rubro | **Hecha** (migración `20261116201000_taller_horas`, sin aplicar: Gate 2) |
| T4 (M) | `TallerPedido`: compra de materiales que, recibida, entra como `ProyectoGasto` «Materiales» | **Hecha** (migración `20261116202000_taller_pedidos`, sin aplicar: Gate 2) |
| T5 (L) | Cruce con MIA (abajo): se construye y queda **apagado**; certificado por subagentes antes del PR | **En pausa** por orden del dueño (09/11/2026): no se construye ni apagado hasta que decida activar la conexión con MIA |
| T6 (M) | Stock real de materiales: pieza ↔ `Product`, el despiece consume del stock al armar | **Hecha** (migración `20261116203000_taller_consumo`, sin aplicar: Gate 2) |
| T7 (M) | Armador 3D: el cómputo de materiales del armador alimenta el despiece | Pendiente |

## Opción superadora (T5, opt-in, apagada)
MIA genera desde su proyecto un vínculo, y Ale lo pega. Ale le manda el presupuesto por link con
token (hasheado, de un solo uso y con vencimiento). Al aceptarlo, se inserta **un** `ProyectoGasto`
en MIA, idempotente por vínculo. Viaja sólo el precio, nunca el costo ni el margen de Ale.
Riesgo: es la única escritura entre tenants. Va en dos transacciones, cada una con su `tenantId` y
sin bypass de RLS, con rate limit y auditoría de los dos lados.

## Cómo correr el alta (local o rama de Neon, nunca producción)
```
TALLER_STANDS_ENABLED=1 npx tsx scripts/taller-stands/alta-mia-taller.ts                 # base local
TALLER_STANDS_ENABLED=1 npx tsx scripts/taller-stands/alta-mia-taller.ts --rama-neon ep-… # rama de prueba
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
