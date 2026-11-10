# Front por rubro — diagnóstico y plan de rondas (2026-11-10)

**Autor:** GSG-FABLE-FRONT-001 · **Orden del dueño (22:40 UTC):** «Revisá en general el front. Los rubros que
tenemos, qué podemos mejorar en cada rubro.»
**Alcance de hoy:** JUICIO (15 min, corte duro). **No se tocó código.** El recorrido pantalla por pantalla lo
sigue un agente Opus desde el relevo (§6).

> **Qué está verificado y qué no.** El mapa (§1) sale del código en `main` (`4ddcd7e`): listados de carpetas,
> ids de `src/blueprints/**` y `src/lib/admin-nav-items.ts`. Los referentes de mercado (§2) y las mejoras (§3)
> son **juicio de arquitectura sin recorrido en navegador ni búsqueda web hoy**: cada mejora es una HIPÓTESIS
> que la ronda 0 confirma o descarta con captura y medición. El estado sale de `docs/ESTADO-ACTUAL.md:239-248`
> para CH, Magra, Shine y A Dos Manos; el resto figura «a confirmar». **§1.1 corrige con evidencia de código
> varias hipótesis de §3: donde difieran, manda §1.1.**

## 1. Mapa de rubros (desde el código)

Familias de blueprint (`src/blueprints/`): **retail** (10 rubros), **agenda** (4), **gastronomía** (6),
**oficios** (5+), **servicios**, **genérico**, **facturita**.

| Familia | Rubro (id) | Negocio(s) | Vidriera pública | Backoffice propio | Estado |
|---|---|---|---|---|---|
| Agenda | `estetica` | CH Estética (`chestetica`) | `(site)`, `consulta`, `portal` | Agenda, Clientes, Lista de espera, Recordatorios, Vouchers, Comisiones, Caja | **VIVO en prod** |
| Agenda | `peluqueria`, `veterinaria`, `consultorio` | sin tenant | genérica | ídem agenda | preset |
| Retail | `carniceria` | Magra | `tienda/magra` (editorial: Despiece, Etiqueta, Ficha) | Lotes/Vacío, Despiece, Balanza, Vender, Caja rápida, Pedidos | alta hecha en Neon; **sin deploy del sitio**, faltan datos reales |
| Retail | `velas` | Shine Velas | `tienda/shine` (Aromas, EscenaVela) | Catálogo, Pedidos, Inventario | alta hecha en Neon; **sin deploy**; catálogo real 02/09 |
| Retail | `perfumeria` | Qué Bien Olés | `tienda/quebienoles` (Frasco 3D, Guía, recomendador) | ídem retail | demo — caso de referencia de `vidriera-de-autor` |
| Retail | `padel` | A Dos Manos | `tienda/adosmanos` (Pared, Enfrentadas, recomendador de pala) | ídem retail | alta hecha en Neon (20 productos); **sin deploy** |
| Retail | `supermercado` | (fit-gap) | `tienda/vidriera` genérica | Ofertas, Promociones, Proveedores, Compras | preset |
| Retail | `verduleria`, `dietetica`, `kiosco`, `fiambreria`, `indumentaria` | sin tenant | `tienda/vidriera` + `Storefront.tsx` | retail | preset |
| Gastronomía | `restaurante`, `cafeteria`, `panaderia`, `rotiseria`, `pizzeria`, `heladeria` | sin tenant | `pedido-online.tsx` | Pedidos, Caja | preset |
| Oficios | `plomeria`, `electricista`, `cerrajeria`, `refrigeracion`, `fletes` | sin tenant | genérica | Proyectos, Clientes, Caja | preset |
| Oficios | `taller` | Taller AGR | `src/app/taller` | `/admin/taller` | a confirmar |
| Vertical | `profe-padel` / club | Break Point Pádel | `clases`, `mis-clases`, `alumno`, `club-crudo` | `/admin/clases`, `/admin/club` | demo/preventa (DIA-DE-PRUEBA) |
| Vertical | `inmobiliaria` | (benchmark 13/10) | `inmobiliaria`, `propiedades`, `alquiler` | `/admin/inmobiliaria`, `liquidacion` | demo |
| Vertical | `productora` | MIA Producciones, BuscaTuFoto, Circuito WPE | `sitio-buscatufoto`, `entregables` | Proyectos | demo |
| Vertical | `servicios` / `facturita` | Matías Consoli | `facturita`, `contador` | Facturación | a confirmar |

**Hallazgo estructural:** `src/app/tienda/page.tsx` despacha a **cinco salidas**: `SiteReplica`, `Storefront.tsx`
(52 KB, la vieja), `vidriera/TiendaNueva` (la nueva), y los fronts de autor (`MagraFront`, `ShineFront`,
`QuebienolesVidriera`, `AdosmanosVidriera`). Cada mejora de conversión (bolsa, checkout, WhatsApp) hay que
hacerla varias veces. Es la deuda que más encarece todo lo de abajo.

### 1.1 Verificado en código (grep sobre `main`, 22:46 UTC) — corrige hipótesis de §3

| Hecho | Evidencia | Consecuencia |
|---|---|---|
| **La unificación ya está empezada**: la vidriera nueva pone la estructura y cada marca pone el dato (`MarcaId = magra · shinevelas · adosmanos · generica`) | `src/app/tienda/vidriera/marcas.ts:2,14` | D1 no es «¿unificamos?» sino «¿terminamos la migración y retiramos `Storefront.tsx`?» |
| La vidriera nueva se enciende por interruptor (`disenoNuevo`) o porque el rubro la declara (supermercado) | `src/app/tienda/page.tsx:176-179` | Los rubros retail sin interruptor siguen cayendo en la vieja |
| Qué Bien Olés y A Dos Manos quedan **fuera** de la vidriera nueva a propósito (conservan su front de autor) | `vidriera/marcas.ts:182-190` | Su bolsa/checkout es propio: toda mejora de embudo se repite ahí |
| **WhatsApp ya está en todas las salidas retail**: la vieja (`WhatsAppCtaProvider`, pide el número si falta), la nueva, `pedido-online.tsx` y los cuatro fronts de autor (Shine: `Bolsa`, `Ficha`, `Pie`) | `Storefront.tsx:16,93-98`; grep sin distinguir mayúsculas `whatsapp` | La mejora transversal 2 no es «agregar el botón» sino **medir** que el mensaje salga prellenado con contexto. Corrige una primera lectura errónea de este mismo documento |
| Mercado Pago, cuotas y transferencia en la vidriera común aparecen **sólo** en `TiendaNueva` | grep `mercado ?pago`, `cuotas`, `transferencia`: 0 coincidencias en `Storefront.tsx`, `ShineFront.tsx`, `MagraFront.tsx`, `pedido-online.tsx` | Quien cae en la vieja no ve medios de pago ni precio transferencia (a confirmar en navegador) |
| Cuotas y precio transferencia ya existen en **A Dos Manos** | `adosmanos/Precio.tsx`, `Bolsa.tsx`, `promesas.ts` | La mejora «[QW] cuotas y transferencia» de A Dos Manos está **ya resuelta**; sin coincidencias en los fronts de autor de Magra, Shine y QBO |
| «Repetir pedido» no existe en ninguna vidriera | grep `repetir`: sólo `magra/Despiece.tsx` y `shine/catalogo.ts`, otro sentido | Hipótesis de Magra y supermercado confirmada como faltante |
| `prefers-reduced-motion` está contemplado en los cuatro fronts de autor y en la vidriera nueva | `*/estilos.ts`, `vidriera.module.css` | Criterio de a11y de movimiento: ya cubierto en CSS; falta verificarlo en navegador |
| **CH ya tiene reserva pública con seña**: `BookingModal`, `reserva/BookingForm`, `confirmacion/[id]`, `turno/[id]` con reseña, y WhatsApp en `_ch/ChFront.tsx` | `src/app/(site)/_ch/*`, `src/app/(site)/reserva/*` | La mejora 1 de CH no es «construir» sino **medir pasos y abandono** del flujo existente |
| WhatsApp en backoffice está extendido (15 archivos en `admin/(dashboard)`) | grep `wa.me` | El canal existe; falta medir si el recordatorio trae «confirmar / reprogramar» |

**Lectura:** la deuda no es de ideas sino de **migración a medio hacer**. El mayor retorno por peso gastado es
terminar de mover los rubros a `TiendaNueva` y que QBO, A Dos Manos y Shine reutilicen su bolsa/pago en vez de
mantener una propia.

**Imágenes y peso (conteo, sin medir en navegador):** `src/app/tienda` tiene 14 `<img>` crudos contra 11
archivos con `next/image`, y 30 de 54 componentes son de cliente; `(site)` de CH, 8 `<img>` y 16 de 36 de
cliente; `inmobiliaria/page.tsx:102` y `clases/_cabecera.tsx:43` usan `<img>` crudo. Son candidatos de LCP para
la ronda 0, no un diagnóstico: algunos son deliberados (`taller/marco.tsx:88` lo justifica en comentario).

### 1.2 Verticales: qué existe y qué falta (grep sin distinguir mayúsculas, 22:47 UTC)

Conteos de archivos con la palabra, no recorrido: dicen si algo **existe**, no si anda bien.

| Rubro | Ya existe | Sin coincidencias (falta, a confirmar) |
|---|---|---|
| Gastronomía (`tienda/pedido-online.tsx`, 7 KB) | WhatsApp (9 menciones); seguimiento por enlace (`src/app/seguimiento/[token]`) | modificadores/aclaraciones/notas: 0 · demora, horario, abierto/cerrado: 0 · Mercado Pago/transferencia: 0 |
| Pádel club (`clases`, `mis-clases`, `alumno`) | cancelar (6 archivos); pago/seña/transferencia (4) | «recuperar» clase: 0 · «lista de espera / en espera»: 0 |
| Inmobiliaria (5 `.tsx` en `inmobiliaria`, `propiedades`, `alquiler`) | filtro, mapa y expensas (1 archivo cada uno); WhatsApp | es chica: medir calidad de galería y ficha antes de sumar |
| Taller (`src/app/taller`) | presupuesto (4), aprobar/aceptar (1), fotos (1), seguimiento/estado (5), WhatsApp (4) | nada evidente: es de **medir**, no de construir |
| Facturita (`src/app/facturita`) | es una app instalable (manifiesto, service worker, `InstalarApp.tsx`); ARCA en 30 archivos; rechazos contemplados (10) | medir los «30 segundos» en celular |
| Backoffice — modo simple | `RUTAS_DEL_MODO_SIMPLE` = Hoy, Agenda, Clientes, Caja (`src/lib/admin-nav-items.ts:269`) | **es de agenda**: no incluye `/admin/vender` ni `/admin/pedidos`. El mostrador (`vender/`: `MostradorDeVenta`, `PedidoDesdeWhatsApp`, `ProtocoloSinSenal`, `TeclasPorGondola`) está construido pero el recorte simple no lo trae para retail |

**Mejora nueva que sale de acá (retail, backoffice):** un modo simple de mostrador — Hoy, Vender, Pedidos, Caja —
para carnicería, almacén y kiosco. Es recorte de menú (reversible, sin plata): candidato a quick win de la ronda 3.

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
2. **WhatsApp-first medible**: el CTA **ya existe** en todas las salidas (§1.1); falta verificar que el mensaje salga prellenado con contexto (producto, turno, propiedad). **[QW]**
3. **Precio argentino claro**: «transferencia −x %», cuotas, total con envío antes del último paso. **[QW]**
4. **Móvil primero**: objetivo de toque ≥ 44 px, barra de acción pegada abajo con zona segura, sin scroll horizontal a 360 px.
5. **Performance**: LCP móvil ≤ 2,5 s en vidrieras; el 3D/animación carga diferido (método `vidriera-de-autor`).

**Estética — CH (vivo; lo estético lo cubre ESTETICA-001, acá sólo se lista)**
1. Reserva pública: **ya existe con seña** y tiene al menos 4 pasos (`src/app/(site)/_ch/BookingModal.tsx:111`). La mejora es medir abandono por paso y probar bajarla a 3 (vecino/a + servicio en uno).
2. Recordatorio por WhatsApp con «confirmar / reprogramar» de un toque.
3. Backoffice: «Hoy» en el celular **ya existe** (modo simple, `admin-nav-items.ts:269`); medir que cobrar un turno sea ≤ 3 toques.
4. [QW] Vouchers y reseñas visibles en la vidriera como prueba social.

**Carnicería — Magra**
1. Precio por kg + estimado por pieza y selector de peso/corte en la ficha.
2. Packs y «repetir mi pedido» (recompra semanal es el negocio).
3. Franja de entrega/retiro elegible antes de pagar.
4. [QW] Sello de origen/trazabilidad (Lotes → Etiqueta) arriba del pliegue.
5. Backoffice: Vender + Balanza usable con una mano y guantes (botones grandes, alto contraste), y **modo simple de mostrador** (§1.2, D6): hoy el recorte simple no trae Vender ni Pedidos.

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
3. Cuotas y precio transferencia: **ya resuelto** (`adosmanos/Precio.tsx`). Queda llevarlo a Magra, Shine y QBO.

**Pádel club — Break Point**
1. Reservar clase/cancha en 2 toques desde el celular, con estado claro (confirmada / en espera).
2. Vista «mis clases»: cancelar **ya existe**; «recuperar» clase y lista de espera, sin coincidencias (§1.2).
3. Backoffice del profe: grilla del día legible al sol (contraste, tamaño).

**Supermercado / almacén / kiosco / verdulería / dietética / fiambrería / indumentaria (vidriera genérica)**
1. Búsqueda tolerante a errores + categorías pegadas arriba.
2. Sumar/restar cantidad desde la tarjeta sin entrar a la ficha.
3. «Repetir última compra». Indumentaria: talle/color con stock por variante.
4. [QW] Estados vacíos y de error en criollo con salida (nunca callejón).

**Gastronomía (`pedido-online.tsx`)**
1. Menú por QR que abre en < 2 s, con modificadores y notas (**confirmado faltante** por grep, §1.2).
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
| **2** | Terminar la migración a `TiendaNueva` (transversal 1–3) y retirar `Storefront.tsx` | Ya está empezada: paga una vez, cobran 10 rubros |
| **3** | Magra (cierre para pasar a vivo) | El más cercano a venta real |
| **4** | Break Point (preventa) | Demo que tiene que cerrar venta |
| **5** | QBO, A Dos Manos, Shine: conversión sobre el front de autor | Ya lindos; falta que vendan |
| **6** | Inmobiliaria, gastronomía, oficios, productora, facturita | Sin cliente firmado: DEMO → VENTA → INVERSIÓN |

Una ronda = 1 o 2 constructores, un frente a la vez; lo que toque plata (checkout, seña) lleva certificación adversarial.

## 5. Criterios de aceptación medibles (por ronda)

- **Lighthouse móvil** (4G lenta, Moto G): Performance ≥ 85 en vidrieras, Accesibilidad ≥ 95; LCP ≤ 2,5 s, CLS ≤ 0,1, INP ≤ 200 ms.
- **a11y AA**: contraste ≥ 4,5:1 en texto; todo operable por teclado; foco visible; `prefers-reduced-motion` respetado.
- **Toques**: comprar desde la tarjeta ≤ 5 toques hasta «pagar»; reservar turno ≤ 3 pasos (hoy ≥ 4 en CH); cobrar en backoffice ≤ 3 toques.
- **360 px**: sin scroll horizontal; objetivos de toque ≥ 44 px; barra de acción con zona segura.
- **WhatsApp**: cada vidriera tiene ≥ 1 CTA con mensaje prellenado contextual; verificado clic por clic.
- **Pago**: MP y transferencia (alias copiable + total) visibles antes de confirmar; «Gracias» con siguiente paso.
- **Criollo**: cero textos en inglés o tecnicismos en pantallas de cliente; estados vacíos con salida.
- **Confiabilidad**: `tsc` + suites en verde (resumen `n/n`), ningún test rojo nuevo por nombre contra `main`.

## 6. Relevo para Opus (ronda 0)

1. `npm run brain`; leer sólo §1 y §3 de este archivo.
2. Por cada fila de §1 con vidriera: levantar local, capturar 360/768/1280, Lighthouse móvil, y anotar por
   hipótesis de §3: **confirmada / descartada / ya resuelta** con `archivo:línea`. Partir de §1.1. Usar
   `node .claude/scripts/mapa-codigo.mjs src/app/tienda --a /tmp/mapa-front.md` (**ojo: `--a` es el archivo de
   SALIDA**, no un filtro; con un nombre suelto deja un volcado en la raíz del repo). No leer `Storefront.tsx` entero.
3. Confirmar la columna «Estado» contra `docs/ESTADO-ACTUAL.md` y `docs/tenants/*` (hoy sólo CH está verificado).
4. Listar qué tenant/rubro cae hoy en cada salida de `tienda/page.tsx:150-200` (réplica, vieja, nueva, autor)
   y qué le falta a `TiendaNueva` para absorber a los que siguen en `Storefront.tsx` (insumo de D1).
5. Entregar `docs/sprints/FRONT-RONDA-0-HALLAZGOS.md` (tabla, ≤ 300 palabras de resumen) y recién ahí abrir ronda 1.
6. **No tocar** lo que tienen abierto ERP-001 (PR #126), ERP-002 (PR #125) ni `claude/fable-estetica-5-rondas`.

## 7. Decisiones para el dueño

| # | Decisión | Opciones | Recomendada |
|---|---|---|---|
| D1 | Vidriera retail (la unificación ya empezó, §1.1) | (a) terminar la migración a `TiendaNueva`, retirar `Storefront.tsx` y que los fronts de autor reutilicen bolsa/pago · (b) seguir con cinco salidas | **(a)** |
| D2 | Primer frente | (a) CH (vivo) · (b) Magra · (c) demos de preventa | **(a)**, después Magra |
| D3 | Rubros sin cliente (gastronomía, oficios, 5 retail) | (a) congelar front hasta tener venta · (b) pulir igual | **(a)** — DEMO → VENTA → INVERSIÓN |
| D4 | Seña online en reservas (CH, Break Point) | (a) MP + transferencia · (b) sólo transferencia con comprobante | **(a)**, sandbox primero (plata: Opus alto + certificación) |
| D5 | Presupuesto de performance como gate | (a) Lighthouse móvil ≥ 85 bloquea integrar vidrieras · (b) informativo | **(a)** |
| D6 | Modo simple para retail (§1.2) | (a) recorte Hoy · Vender · Pedidos · Caja por familia de rubro · (b) dejar el de agenda para todos | **(a)** |

## 8. Límites respetados

Sólo este documento. Nada a `main`, sin Neon/Vercel/secretos, sin dependencias, nada binario. Marcas: sólo
las que ya figuran en el repo.
