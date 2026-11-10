# Front por rubro — diagnóstico y plan de rondas (2026-11-10)

**Autor:** GSG-FABLE-FRONT-001 · **Orden del dueño (22:40 UTC):** «Revisá en general el front. Los rubros que
tenemos, qué podemos mejorar en cada rubro.»
**Alcance de hoy:** JUICIO (15 min, corte duro). **No se tocó código.** El recorrido pantalla por pantalla lo
sigue un agente Opus desde el relevo (§6).

> **Qué está verificado y qué no.** El mapa (§1) sale del código en `main` (`4ddcd7e`): listados de carpetas,
> ids de `src/blueprints/**` y `src/lib/admin-nav-items.ts`. Los referentes de mercado (§2) y las mejoras (§3)
> son **juicio de arquitectura sin recorrido en navegador ni búsqueda web hoy**: cada mejora es una HIPÓTESIS
> que la ronda 0 confirma o descarta con captura y medición. El estado vivo/demo sólo está confirmado para CH
> (`docs/ESTADO-ACTUAL.md:241`); el resto figura «a confirmar».

## 1. Mapa de rubros (desde el código)

Familias de blueprint (`src/blueprints/`): **retail** (10 rubros), **agenda** (4), **gastronomía** (6),
**oficios** (5+), **servicios**, **genérico**, **facturita**.

| Familia | Rubro (id) | Negocio(s) | Vidriera pública | Backoffice propio | Estado |
|---|---|---|---|---|---|
| Agenda | `estetica` | CH Estética (`chestetica`) | `(site)`, `consulta`, `portal` | Agenda, Clientes, Lista de espera, Recordatorios, Vouchers, Comisiones, Caja | **VIVO en prod** |
| Agenda | `peluqueria`, `veterinaria`, `consultorio` | sin tenant | genérica | ídem agenda | preset |
| Retail | `carniceria` | Magra | `tienda/magra` (editorial: Despiece, Etiqueta, Ficha) | Lotes/Vacío, Despiece, Balanza, Vender, Caja rápida, Pedidos | a confirmar (UAT-PRODUCCION existe) |
| Retail | `velas` | Shine Velas | `tienda/shine` (Aromas, EscenaVela) | Catálogo, Pedidos, Inventario | demo (catálogo real 02/09) |
| Retail | `perfumeria` | Qué Bien Olés | `tienda/quebienoles` (Frasco 3D, Guía, recomendador) | ídem retail | demo — caso de referencia de `vidriera-de-autor` |
| Retail | `padel` | A Dos Manos | `tienda/adosmanos` (Pared, Enfrentadas, recomendador de pala) | ídem retail | demo |
| Retail | `supermercado` | (fit-gap) | `tienda/vidriera` genérica | Ofertas, Promociones, Proveedores, Compras | preset |
| Retail | `verduleria`, `dietetica`, `kiosco`, `fiambreria`, `indumentaria` | sin tenant | `tienda/vidriera` + `Storefront.tsx` | retail | preset |
| Gastronomía | `restaurante`, `cafeteria`, `panaderia`, `rotiseria`, `pizzeria`, `heladeria` | sin tenant | `pedido-online.tsx` | Pedidos, Caja | preset |
| Oficios | `plomeria`, `electricista`, `cerrajeria`, `refrigeracion`, `fletes` | sin tenant | genérica | Proyectos, Clientes, Caja | preset |
| Oficios | `taller` | Taller AGR | `src/app/taller` | `/admin/taller` | a confirmar |
| Vertical | `profe-padel` / club | Break Point Pádel | `clases`, `mis-clases`, `alumno`, `club-crudo` | `/admin/clases`, `/admin/club` | demo/preventa (DIA-DE-PRUEBA) |
| Vertical | `inmobiliaria` | (benchmark 13/10) | `inmobiliaria`, `propiedades`, `alquiler` | `/admin/inmobiliaria`, `liquidacion` | demo |
| Vertical | `productora` | MIA Producciones, BuscaTuFoto, Circuito WPE | `sitio-buscatufoto`, `entregables` | Proyectos | demo |
| Vertical | `servicios` / `facturita` | Matías Consoli | `facturita`, `contador` | Facturación | a confirmar |

**Hallazgo estructural:** hay **tres motores de vidriera retail** conviviendo — `Storefront.tsx` (52 KB),
`vidriera/Vidriera.tsx` (28 KB) y los cuatro fronts de autor. Cada mejora de conversión (bolsa, checkout,
WhatsApp) hay que hacerla hasta 3 veces. Es la deuda que más encarece todo lo de abajo.

## 2. Referente por rubro (a igualar o superar)

| Rubro | AR / LatAm | Global | Qué hace mejor que nosotros (hipótesis) |
|---|---|---|---|
| Estética / agenda | AgendaPro, Reservo | Fresha, Booksy | Reserva en 3 toques sin cuenta, seña online, recordatorio WhatsApp con reprogramar |
| Carnicería | Tiendanube de carnicerías boutique, Pedix | Porter Road, Crowd Cow | Venta por peso clara («$ x kg · ~$ la pieza»), packs, franja de entrega |
| Velas / deco | Tiendanube | Diptyque, Boy Smells | Foto grande, cross-sell por aroma, regalo con dedicatoria |
| Perfumería | Juleriaque | Sephora, Scentbird | Buscador por notas, decants/muestras, cuotas visibles |
| Pádel tienda | Padel Nuestro AR | Padel Nuestro, PadelMarket | Comparador y filtro por nivel/forma/balance |
| Pádel club | ATC Sports, Playtomic | Playtomic | Reserva de cancha y clase en 2 toques, pago partido |
| Supermercado / almacén | Pedix, Rappi Turbo | Instacart | Repetir compra, sustituciones, búsqueda tolerante |
| Gastronomía | PedidosYa, Pedix, Fudo | Toast, Square Online | Menú QR rápido, modificadores, estado del pedido en vivo |
| Inmobiliaria | Tokko Broker, ZonaProp | Zillow | Mapa + filtros, ficha con contacto WhatsApp prellenado |
| Oficios / taller | Workiz (poco local) | Jobber, Housecall Pro | Presupuesto aprobable por link, seguimiento del trabajo |
| Productora / foto | — | Pixieset, Pic-Time | Galería privada rápida, selección y compra de fotos |
| Facturita | Facturante, Contabilium, Xubio | — | Factura en 30 s desde el celular, estado ARCA legible |

## 3. Mejoras de mayor impacto en venta, por rubro

Marcas: **[QW]** = quick win de bajo riesgo (copy, orden, tamaño de toque, sin lógica de plata).

**Transversal (aplica a todos, va primero)**
1. **Un solo embudo de compra**: bolsa → datos → entrega → pago (MP / transferencia con alias copiable) →
   «Gracias» con botón de WhatsApp prellenado. Hoy hay 3 implementaciones.
2. **WhatsApp-first medible**: botón flotante con mensaje prellenado por contexto (producto, turno, propiedad). **[QW]**
3. **Precio argentino claro**: «transferencia −x %», cuotas, total con envío antes del último paso. **[QW]**
4. **Móvil primero**: objetivo de toque ≥ 44 px, barra de acción pegada abajo con zona segura, sin scroll horizontal a 360 px.
5. **Performance**: LCP móvil ≤ 2,5 s en vidrieras; el 3D/animación carga diferido (método `vidriera-de-autor`).

**Estética — CH (vivo; lo estético lo cubre ESTETICA-001, acá sólo se lista)**
1. Reserva pública sin cuenta en ≤ 3 pasos con seña por MP/transferencia.
2. Recordatorio por WhatsApp con «confirmar / reprogramar» de un toque.
3. Backoffice: «Hoy» como primera pantalla en el celular (ya existe modo simple: `admin-nav-items.ts:269`); medir que cobrar un turno sea ≤ 3 toques.
4. [QW] Vouchers y reseñas visibles en la vidriera como prueba social.

**Carnicería — Magra**
1. Precio por kg + estimado por pieza y selector de peso/corte en la ficha.
2. Packs y «repetir mi pedido» (recompra semanal es el negocio).
3. Franja de entrega/retiro elegible antes de pagar.
4. [QW] Sello de origen/trazabilidad (Lotes → Etiqueta) arriba del pliegue.
5. Backoffice: Vender + Balanza usable con una mano y guantes (botones grandes, alto contraste).

**Velas — Shine**
1. Cross-sell por aroma y «armá tu regalo» con dedicatoria.
2. [QW] Stock y tiempo de entrega visibles en la tarjeta.
3. Foto real como LCP optimizado; la escena de vela, diferida.

**Perfumería — Qué Bien Olés**
1. Recomendador por notas como entrada principal → resultado con «agregar» directo.
2. Decants/muestras como producto de entrada + cuotas visibles.
3. [QW] Confianza: original garantizado, cambio, medios de pago, arriba del pliegue.
4. Frasco 3D: verificar presupuesto de carga en gama media (Moto G).

**Pádel tienda — A Dos Manos**
1. Comparador (`Enfrentadas`) accesible desde toda ficha; filtros por nivel/forma/balance/precio.
2. Recomendador de pala con resultado comprable y compartible por WhatsApp.
3. [QW] Cuotas y precio transferencia en la tarjeta.

**Pádel club — Break Point**
1. Reservar clase/cancha en 2 toques desde el celular, con estado claro (confirmada / en espera).
2. Vista «mis clases» con cancelar/recuperar sin llamar.
3. Backoffice del profe: grilla del día legible al sol (contraste, tamaño).

**Supermercado / almacén / kiosco / verdulería / dietética / fiambrería / indumentaria (vidriera genérica)**
1. Búsqueda tolerante a errores + categorías pegadas arriba.
2. Sumar/restar cantidad desde la tarjeta sin entrar a la ficha.
3. «Repetir última compra». Indumentaria: talle/color con stock por variante.
4. [QW] Estados vacíos y de error en criollo con salida (nunca callejón).

**Gastronomía (`pedido-online.tsx`)**
1. Menú por QR que abre en < 2 s, con modificadores y notas.
2. Estado del pedido en vivo + aviso por WhatsApp.
3. [QW] Horario/abierto-cerrado y demora estimada arriba.

**Inmobiliaria**
1. Listado con filtros + mapa; ficha con WhatsApp prellenado («Consulto por {dirección}»).
2. Galería rápida (imágenes responsivas) y datos clave (expensas, m², requisitos) arriba.
3. [QW] Liquidación al propietario legible en el celular.

**Oficios / taller**
1. Presupuesto por link aprobable desde el celular + seña.
2. `seguimiento` del trabajo con estados y fotos.
3. [QW] Pedir turno/visita con WhatsApp prellenado.

**Productora / foto**
1. Galería privada rápida con selección y compra.
2. [QW] Entregables con vencimiento y descarga clara.

**Facturita / servicios**
1. Facturar en ≤ 30 s desde el celular (cliente frecuente, último concepto).
2. Estado ARCA en criollo («Autorizada», «Rechazada: falta X») con acción de corrección.

## 4. Orden de ataque recomendado

| Ronda | Qué | Por qué primero |
|---|---|---|
| **0** | Recorrido Opus con capturas 360/768/1280 + Lighthouse móvil por pantalla de §1; confirma o descarta cada hipótesis de §3 | Sin línea de base no hay «medible» |
| **1** | CH Estética: reserva pública + «Hoy» móvil | Único vivo: es donde hoy entra o se pierde plata |
| **2** | Embudo único de compra (transversal 1–3) sobre `tienda/vidriera` | Paga una vez, cobran 10 rubros |
| **3** | Magra (cierre para pasar a vivo) | El más cercano a venta real |
| **4** | Break Point (preventa) | Demo que tiene que cerrar venta |
| **5** | QBO, A Dos Manos, Shine: conversión sobre el front de autor | Ya lindos; falta que vendan |
| **6** | Inmobiliaria, gastronomía, oficios, productora, facturita | Sin cliente firmado: DEMO → VENTA → INVERSIÓN |

Una ronda = 1 o 2 constructores, un frente a la vez; lo que toque plata (checkout, seña) lleva certificación adversarial.

## 5. Criterios de aceptación medibles (por ronda)

- **Lighthouse móvil** (4G lenta, Moto G): Performance ≥ 85 en vidrieras, Accesibilidad ≥ 95; LCP ≤ 2,5 s, CLS ≤ 0,1, INP ≤ 200 ms.
- **a11y AA**: contraste ≥ 4,5:1 en texto; todo operable por teclado; foco visible; `prefers-reduced-motion` respetado.
- **Toques**: comprar desde la tarjeta ≤ 5 toques hasta «pagar»; reservar turno ≤ 3 pasos; cobrar en backoffice ≤ 3 toques.
- **360 px**: sin scroll horizontal; objetivos de toque ≥ 44 px; barra de acción con zona segura.
- **WhatsApp**: cada vidriera tiene ≥ 1 CTA con mensaje prellenado contextual; verificado clic por clic.
- **Pago**: MP y transferencia (alias copiable + total) visibles antes de confirmar; «Gracias» con siguiente paso.
- **Criollo**: cero textos en inglés o tecnicismos en pantallas de cliente; estados vacíos con salida.
- **Confiabilidad**: `tsc` + suites en verde (resumen `n/n`), ningún test rojo nuevo por nombre contra `main`.

## 6. Relevo para Opus (ronda 0)

1. `npm run brain`; leer sólo §1 y §3 de este archivo.
2. Por cada fila de §1 con vidriera: levantar local, capturar 360/768/1280, Lighthouse móvil, y anotar por
   hipótesis de §3: **confirmada / descartada / ya resuelta** con `archivo:línea`. Usar
   `node .claude/scripts/mapa-codigo.mjs src/app/tienda --a <archivo>`; no leer `Storefront.tsx` entero.
3. Confirmar la columna «Estado» contra `docs/ESTADO-ACTUAL.md` y `docs/tenants/*` (hoy sólo CH está verificado).
4. Verificar qué rutas usa de verdad cada motor de vidriera (`Storefront` vs `vidriera/Vidriera` vs autor) y
   proponer cuál queda como único embudo (insumo de la decisión D1).
5. Entregar `docs/sprints/FRONT-RONDA-0-HALLAZGOS.md` (tabla, ≤ 300 palabras de resumen) y recién ahí abrir ronda 1.
6. **No tocar** lo que tienen abierto ERP-001 (PR #126), ERP-002 (PR #125) ni `claude/fable-estetica-5-rondas`.

## 7. Decisiones para el dueño

| # | Decisión | Opciones | Recomendada |
|---|---|---|---|
| D1 | Motores de vidriera retail | (a) unificar el embudo de compra en uno y que los fronts de autor sólo vistan · (b) seguir con tres | **(a)** |
| D2 | Primer frente | (a) CH (vivo) · (b) Magra · (c) demos de preventa | **(a)**, después Magra |
| D3 | Rubros sin cliente (gastronomía, oficios, 5 retail) | (a) congelar front hasta tener venta · (b) pulir igual | **(a)** — DEMO → VENTA → INVERSIÓN |
| D4 | Seña online en reservas (CH, Break Point) | (a) MP + transferencia · (b) sólo transferencia con comprobante | **(a)**, sandbox primero (plata: Opus alto + certificación) |
| D5 | Presupuesto de performance como gate | (a) Lighthouse móvil ≥ 85 bloquea integrar vidrieras · (b) informativo | **(a)** |

## 8. Límites respetados

Sólo este documento. Nada a `main`, sin Neon/Vercel/secretos, sin dependencias, nada binario. Marcas: sólo
las que ya figuran en el repo.
