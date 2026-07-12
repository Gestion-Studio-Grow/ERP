# Veredicto — ¿nuestro backoffice reemplaza a Bistrosoft para MAGRA hoy?

**Respuesta corta:** **SÍ para operar el día a día** (vender, cobrar, stock, pedidos, compras, fiado,
reportes) **y ya lo superamos** en catálogo cárnico, margen por corte y finanzas. **NO todavía para el
reemplazo "sin perder nada"**: faltan 4 cosas acotadas, 3 de ellas detrás del **OK del dueño** (Gate 2/4).

Contexto y detalle en `analisis-brecha-bistrosoft.md` y `backoffice-carniceria-spec.md`.

---

## Lo que YA puede hacer hoy (verificado, renderizado)

- **Vender por kilo** con precio/kg y stock en kg (paridad con Bistrosoft; ambos lo tienen).
- **Catálogo cárnico** por góndolas (vaca/cerdo/pollo/achuras/preparados/gourmet) con **margen por corte** —
  esto **Bistrosoft no lo muestra**. *(construido este sprint, screenshot `01-catalogo-cortes.png`)*
- **Caja + arqueo, pedidos** (mostrador/online/delivery), **compras a proveedores** con costo
  *(screenshot `03-compras.png`: Estancia Don Ramón, Paladini)*, **fiado** (cuenta corriente), **cuentas a
  pagar** con cheque diferido, **devoluciones**, **libro IVA**, **reportes**.
- **Vidriera con marca propia** (dominio + identidad + WhatsApp), muy por encima de la carta genérica sin
  fotos en `borders.bistrosoft.com`.

## Lo que falta para el reemplazo TOTAL (y cuánto es)

| # | Falta | Tamaño | Depende de |
|---|---|---|---|
| 1 | **Encender `/admin/inventario`** (valuación + stock bajo ya existen, hoy gateado por flag) | **Chico** — 1 flag, reversible, sin schema | Nosotros |
| 2 | **`category` + `cost` en Product** (góndola editable + margen desde el día 1 sin cargar compras) | **Chico** — migración aditiva de 2 columnas | **Dueño (Gate 2)** |
| 3 | **Lotes / envasado al vacío** (fecha envasado, vencimiento, peso variable, trazabilidad, FEFO) + pantalla | **Mediano** — 1 tabla + `/admin/lotes` | **Dueño (Gate 2)** |
| 4 | **Despiece / rendimiento / merma** (media res → cortes, rentabilidad real) + pantalla | **Mediano** — 2 tablas + `/admin/despiece` | **Dueño (Gate 2)** |
| — | **ARCA en real** (cert emisor + homologación; hoy sandbox) | Config | **Dueño (Gate 4)** |
| — | **Multi-canal de precios** (mostrador/delivery/web distinto) — Bistrosoft lo tiene, nosotros no | Mediano | Nosotros (no bloqueante: MAGRA hoy usa 1 precio) |

**Los ítems 3 y 4 no son "para igualar" — son para SUPERAR:** Bistrosoft **no tiene** lotes/trazabilidad de
vacío ni despiece con rendimiento. Construirlos nos deja por encima en el rubro cárnico, no solo a la par.

## Riesgo de migración honesto

- **Bistrosoft ya factura en real** (ARCA) y **maneja balanza/peso nativo con 306 productos cargados**.
  Migrar significa: (a) importar su catálogo real (categorías, precios/kg, stock), (b) encender ARCA real
  antes de dejar de facturar por Bistrosoft. Nada de esto es un blocker técnico, pero es **trabajo de
  onboarding real**, no un flip de switch.
- El **multi-canal de precios** es la única capacidad donde Bistrosoft nos gana funcionalmente hoy; para
  MAGRA no muerde (un precio), pero hay que tenerlo en el radar.

## Recomendación

**Vendible hoy como "mejor backoffice + mejor vidriera para tu carnicería"**, con el catálogo de cortes,
margen y finanzas como demo. El reemplazo total se cierra con los 4 ítems de arriba, todos **especificados y
con la migración escrita** — el dueño aprueba y se ejecutan en orden (inventario → category/cost → lotes →
despiece), sin sorpresas de schema.

— Elaborado por GSG
