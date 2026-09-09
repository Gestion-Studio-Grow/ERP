# Nota técnica — Armador de presupuestos de viaje: fuente de datos, conectores y snapshot de oferta

**Tipo:** nota técnica (diseño + prueba de viabilidad), no ADR numerado — evita colisión de numeración
con la rama en paralelo. Si se adopta como decisión, se promueve a ADR con su número al mergear.
**Fecha:** 2026-09-09 · **Rama:** `claude/azimut-viajes-consolidacion-gfh9nv` · **Célula:** Ingeniero de
Backoffice (ejecución, Sonnet) · **Estado:** esqueleto vertical construido detrás de flag **OFF**, migración
**escrita y SIN aplicar** (Gate 2), sin deploy.
**Depende de:** ADR-002 (Core/Blueprint/Plugin) · ADR-017 (RBAC) · ADR-018 (RLS) · ADR-054 (catálogo de
módulos) · ADR-055 (variante: objeto se crea una vez y se asigna) · ADR-057 (dinero).

---

## 0. Calibración (ADR-052) — principios que guiaron esta pasada

- **Fuente de datos legítima o nada.** Sin scraping. Solo APIs con términos claros. Si sin contrato comercial
  no hay módulo viable, se dice con esas palabras.
- **Capability nativa del Core, no tabla del blueprint** (ADR-002 mecanismo B): "presupuesto de viaje con
  opciones congeladas" es un concepto nuevo y reutilizable por cualquier agencia. El conector externo es la
  parte hexagonal (port + adapters), mismo molde que `src/plugins/pagos`.
- **`tenantId` en toda entidad**, predicado explícito y `tenantTransaction`; dinero `Decimal(14,2)` en DB,
  `number` + `round2` en memoria (ADR-057).
- **Invariante dura del snapshot** — ningún precio sin `capturadoEn` ni `baseOcupacion` — defendida en
  tres capas: tipo, core y schema (`NOT NULL` sin default).
- **Reversible:** flag `VIAJES_ENABLED` default OFF, capability solo OWNER, migración sin aplicar, cero
  cambios en `docs/` existentes. Zona de de-sesgo (ADR-046): código estándar y preciso; copy en criollo
  claro (ADR-080).

---

## 1. La fuente de datos — lo primero, antes que el código

### 1.1 Advertencia de método (honesta)

Esta sesión **no pudo verificar en vivo**: el egreso web (curl/fetch) está denegado por la política del
entorno y no hay herramienta de búsqueda. Lo que sigue es el estado de las plataformas según el
conocimiento del modelo (corte mediados de 2026), con cada dato que cambia seguido marcado **[verificar]**.
**Antes de firmar con una agencia, el dueño (o el Arquitecto) debe confirmar los ítems [verificar] en los
portales de desarrolladores.** El diseño de abajo NO depende de esos números: depende de tres hechos
estructurales que son estables (§1.4).

### 1.2 Lo que se descarta y por qué

**Scrapear Booking / Kayak / Despegar / Google Flights: NO.** Viola términos de uso, se rompe con cada
cambio de HTML, termina en bloqueo de IP y —lo peor para una agencia— entrega precios que no se pueden
defender ante el cliente (sin id de oferta, sin vigencia). Fuera de la mesa.

### 1.3 Comparativa de vías legítimas

| Proveedor | Qué devuelve | Vuelos | Hoteles | Cómo se entra | Ambiente de prueba | Límites / costo | Veredicto para GSG |
|---|---|---|---|---|---|---|---|
| **Amadeus Self-Service** (developers.amadeus.com) | Flight Offers Search/Price, Flight Create Orders, Hotel List, Hotel Search v3, Hotel Booking, Airport/City Search, Inspiration/Cheapest Date | Sí (GDS Amadeus; buena cobertura de líneas tradicionales; low-cost parcial) | Sí (contenido GDS + algunos agregadores; tarifas públicas, no netas) | **Registro self-serve, sin contrato.** Se crea la app, se obtienen `client_id/secret` al instante | **Sí: `test.api.amadeus.com`, gratis**, con datos parciales y cacheados (precios orientativos, no confirmables) | Test: cuota mensual gratis por API + rate limit **[verificar: ~10 req/s test, cuota mensual por API]**. Producción: pago por llamada más allá de una cuota gratis mensual **[verificar: del orden de centavos de EUR/USD por llamada]**. **Reservar (Create Orders) en producción exige acuerdo con un consolidador/IATA**; buscar y cotizar no | **Arrancar acá.** Único que cubre vuelos + hoteles, sin contrato, con sandbox y docs de primera. Sirve para COTIZAR (que es lo que hace el módulo), no para emitir |
| **Duffel** | Flights API (búsqueda + orden + ticketing, NDC + GDS) y **Stays** (hoteles) | Sí, y **emite** (Duffel es el IATA/merchant) | Sí (Stays) | Registro self-serve; **hay que verificar si una empresa argentina puede onboardear y cobrar** **[verificar: países soportados para cuenta/payout]** | Sí (aerolínea ficticia "Duffel Airways", sin costo) | Búsqueda gratis; cobra **por orden emitida** **[verificar: fee fija por orden + % en Stays]** | **Plan B** si la agencia quiere EMITIR desde el ERP. Riesgo: disponibilidad para Argentina y cobertura de Aerolíneas Argentinas |
| **Kiwi.com Tequila** | Búsqueda + reserva vía Kiwi, modelo afiliado | Sí (fuerte en low-cost) | No | Antes self-serve; **en 2024 cerró el alta a nuevos partners** **[verificar estado actual]** | Sí (era) | Gratis, revenue-share | **Descartado** salvo que reabra. No apto para B2B |
| **Skyscanner Partners (Travel APIs)** | Precios en vivo de OTAs con deep-links (no reserva) | Sí | Sí (deep-link) | **Solo con acuerdo de partner**; apuntan a negocios con volumen | Con aprobación | Gratis pero con aprobación y métricas de tráfico | **No realista** para una agencia chica. Es metabuscador, no B2B |
| **Hotelbeds (HBX) APItude** | Bedbank: **tarifas netas B2B** de hoteles (lo que una agencia realmente revende con markup) | No | Sí (el mayor bedbank) | **Contrato comercial**: la agencia tiene que ser agencia registrada (legajo Min. Turismo en AR), con línea de crédito/depósito y account manager | Sí: sandbox gratis al registrarse en el portal de desarrolladores **[verificar]** | Sin costo por request en sandbox; producción según contrato | **Fase 2**, con las credenciales de la agencia (FASE 2 de credenciales: las pega el dueño/cliente, nunca el agente). Es el "precio real" de hotelería |
| **TravelgateX** | Switch/marketplace GraphQL hacia cientos de proveedores | No | Sí (agregador) | Suscripción **y** contratos propios de la agencia con cada proveedor | Sí | Suscripción mensual **[verificar]** | **No es fuente**: es un enchufe hacia contratos que la agencia todavía no tiene |
| **RateHawk / Emerging Travel** (mención) | Bedbank con API, fuerte en LATAM, tarifas netas | No | Sí | Alta de agencia con verificación; API tras aprobación **[verificar]** | Sí | Sin costo por request; margen en la tarifa | **Alternativa a Hotelbeds** en Fase 2, más liviana de onboardear |

### 1.4 Los tres hechos estructurales (estables, no dependen de [verificar])

1. **Cotizar ≠ reservar.** Para **buscar y cotizar** vuelos y hoteles existe una vía **self-serve y gratuita
   en sandbox** (Amadeus Self-Service). Para **emitir/reservar** en producción hace falta un tercero con
   licencia (consolidador IATA, o un merchant como Duffel).
2. **Tarifa pública ≠ tarifa neta.** Lo que devuelven Amadeus/Duffel son tarifas públicas. La agencia
   argentina gana con la **tarifa neta** de mayoristas/bedbanks (Hotelbeds, RateHawk, mayoristas locales), y
   esas **solo llegan por contrato comercial de la agencia** — el ERP puede conectarlas después, con las
   credenciales del cliente.
3. **Los mayoristas locales** (Ola, Juliá, Piamonte, etc.) operan por portal B2B y casi no exponen API
   pública. Por eso el módulo tiene que soportar **carga manual asistida** con el mismo snapshot: el
   operador copia el precio del portal del mayorista y lo guarda con base de ocupación + fecha de captura.

### 1.5 Recomendación

**Arrancar con Amadeus Self-Service (ambiente test) + carga manual con snapshot**, detrás del port
`ProveedorOfertas`. Por qué:

- Es la **única** opción que cubre vuelos y hoteles **sin contrato**, con sandbox gratis y `client_id` al
  instante: el módulo se puede demostrar hoy (DEMO a costo cero) y encender en producción con pago por uso.
- El módulo **cotiza**; no emite. Eso es exactamente lo que Amadeus permite sin acuerdo con consolidador.
- El port deja **Duffel** (si la agencia quiere emitir desde el ERP) y **Hotelbeds/RateHawk** (tarifa neta,
  Fase 2 con credenciales de la agencia) como adapters futuros sin tocar el core.

**Dicho con todas las letras:** *sin contrato comercial NO hay tarifas netas ni emisión desde el ERP;
CON registro self-serve SÍ hay un módulo viable de cotización y armado de presupuestos, que es donde hoy
la agencia pierde tiempo y comete el error del caso real.* Eso es lo que se construyó.

---

## 2. Diseño técnico

### 2.1 Capas

```
/admin/viajes (page + ViajesForms)          ← UI mínima, SAP Fiori (rol-based, a11y, criollo)
        │ useActionState
src/lib/viajes-actions.ts ("use server")    ← gate compuesto + validación + tenantTransaction + audit
        │
src/lib/viajes/glue.ts (server)             ← exigirViajes · proveedorParaTenant · loaders Prisma
src/lib/viajes/core.ts (PURO)               ← congelarOferta · validarPrecio · cantidadBasePara · totales
        │ solo el port
src/plugins/ofertas-viaje/port.ts           ← ProveedorOfertas · OfertaVuelo/OfertaHotel · PrecioOferta
src/plugins/ofertas-viaje/cache.ts          ← ProveedorConCache (decorador): caché + cuota
src/plugins/ofertas-viaje/registry.ts       ← RegistroProveedoresOfertas (clave → fábrica)
src/plugins/ofertas-viaje/amadeus/adapter.ts← adapter REAL (OAuth2 + Flight Offers v2 + Hotel Search v3)
src/plugins/ofertas-viaje/stub.ts           ← adapter en memoria, determinístico (dev/test/demo)
```

**Regla de dependencias:** el core y las actions importan **solo el port**; los adapters importan del port,
nunca al revés. El resto del ERP no sabe de qué proveedor vino el dato: solo ve `proveedor: string` en el
snapshot, que se persiste para trazabilidad.

### 2.2 El port `ProveedorOfertas`

```ts
interface ProveedorOfertas {
  readonly clave: string;                                   // "amadeus" | "stub" | "manual" …
  buscarVuelos(b: BusquedaVuelos): Promise<ResultadoBusqueda<OfertaVuelo>>;
  buscarHoteles(b: BusquedaHoteles): Promise<ResultadoBusqueda<OfertaHotel>>;
}
interface PrecioOferta {            // los 4 campos son OBLIGATORIOS
  monto: number; moneda: Moneda; baseOcupacion: BaseOcupacion; capturadoEn: InstanteISO; vigenteHasta?: InstanteISO;
}
type BaseOcupacion = "POR_PERSONA_EN_DOBLE" | "POR_PERSONA_EN_SINGLE" | "POR_PERSONA_EN_TRIPLE"
                   | "POR_HABITACION" | "POR_PASAJERO" | "TOTAL";
```

Cada adapter **normaliza**: Amadeus vuelos → `POR_PASAJERO` (precio del adulto en `travelerPricings`),
Amadeus hoteles v3 → `POR_HABITACION` (una oferta = una habitación por toda la estadía). Ofertas sin precio
se **descartan**: nunca se inventa un precio.

### 2.3 Snapshot de oferta (la invariante)

Al guardar una opción, `congelarOferta(tipo, oferta, { grupo, ahora })` produce:

| Campo | Origen | Regla |
|---|---|---|
| `precio`, `moneda` | `oferta.precio` | `round2`; ISO-4217 de 3 letras |
| `baseOcupacion` | `oferta.precio` | **obligatoria**; enum cerrado |
| `cantidadBase` | `cantidadBasePara(base, grupo)` | por persona → personas; por habitación → habitaciones; total → 1 |
| `precioTotal` | `round2(precio × cantidadBase)` | calculado al congelar, no después |
| `capturadoEn` | `oferta.precio.capturadoEn` | **obligatoria**; no puede ser futura (+5 min de tolerancia) |
| `vigenteHasta` | `lastTicketingDate` (vuelos) / null | si existe, ≥ captura |
| `proveedor`, `referenciaProveedor` | oferta | para re-cotizar/reservar después |
| `detalle` (JSON) | la oferta normalizada entera | lo que se vio, congelado |

Se defiende en **tres capas**: el tipo (`PrecioOferta` sin opcionales), el core (`SnapshotInvalidoError`
con la lista de motivos) y el schema (`NOT NULL` sin default en `capturadoEn`/`baseOcupacion`). Test que
lo cierra: *"hotel por habitación NO se multiplica por personas (el caso real)"* → 600, no 1800.

**Seguridad del snapshot:** la action de guardar **no acepta el precio desde el navegador**. Recibe la
clave de la búsqueda + la referencia de la oferta y **re-lee la oferta del caché del servidor**. Si el
caché venció, pide volver a buscar. Un precio guardado siempre es uno que el sistema capturó.

### 2.4 Schema Prisma (aditivo, todo con `tenantId`)

- `PresupuestoViaje` — cabecera: título, destino, fechas, `adultos/ninos/habitaciones` (el grupo que
  define `cantidadBase`), `estado` (BORRADOR/ENVIADO/ACEPTADO/VENCIDO/CANCELADO), `clientId?` → **`Client`
  del Core** (dato maestro que se asigna, no se duplica — ADR-055), `creadoPor` (audit ADR-017).
- `OpcionPresupuestoViaje` — el snapshot (§2.3). `precio`/`precioTotal` `Decimal(14,2)` (ADR-057).
- `ConsumoProveedorViaje` — cuota diaria `(tenantId, proveedor, dia)` única.
- `CacheBusquedaViaje` — `(tenantId, proveedor, clave)` única + `expiraEn` indexado. **Por tenant a
  propósito**: RLS la cubre sola y las búsquedas revelan a dónde viajan los clientes de la agencia.

`gate:rls` (cobertura estática) pasa: 42 modelos protegibles. Migración
`prisma/migrations/20260909120000_add_viajes_presupuestos/` (+ `rollback.sql`) generada por
`prisma migrate diff` desde el schema, **sin tocar Neon**. Aplicarla es **Gate 2** del dueño; tras aplicar,
re-ejecutar `prisma/rls/0001_enable_rls.sql` en el mismo deploy.

### 2.5 Server actions y rutas bajo `/admin`, con RBAC

- Capability nueva **`viajes:manage`** (solo OWNER; RECEPTION/PROFESSIONAL no la tienen).
- **Gate compuesto** `exigirViajes()` en página y en TODAS las actions: (1) flag `VIAJES_ENABLED`, (2)
  `requireCapability("viajes:manage")`, (3) módulo `viajes` **asignado** en `Tenant.modules` (chequeo duro,
  independiente del flag del registry — mismo patrón que Cartera). Flag OFF → la página responde **404**.
- Actions: `crearPresupuestoAction`, `buscarOfertasAction`, `guardarOpcionAction` (`useActionState`; los
  errores se **devuelven**, no se lanzan). Toda escritura en `tenantTransaction({ tenantId })`; pertenencia
  del presupuesto verificada con predicado `tenantId`; `auditAdmin` en cada mutación.
- Estado honesto: P2021/P2022 (migración sin aplicar) → mensaje "falta aplicar la migración (paso del
  dueño)", nunca pantalla rota.

### 2.6 Caché y control de gasto

- `claveBusqueda(tipo, búsqueda)` = sha256 del JSON canónico (claves ordenadas, sin `undefined`): la
  misma búsqueda pedida dos veces dentro del TTL (**15 min vuelos / 30 min hoteles**) = **una** llamada.
- `ProveedorConCache` decora cualquier proveedor: **caché → cuota → llamada**. Una búsqueda cacheada
  **no consume cuota**; con cuota agotada lanza `CuotaAgotadaError` **antes** de llamar.
- Cuota diaria por tenant y proveedor: `VIAJES_CUOTA_DIARIA` (default 50). En hoteles, `maxResultados`
  limita cuántos `hotelIds` se cotizan (cada uno cuesta).
- El resultado cacheado conserva el `capturadoEn` **original** — nunca se "rejuvenece" un precio.
- **Límite honesto de esta pasada:** caché y cuota corren **en memoria por proceso**. En serverless
  (Vercel) cada instancia arranca vacía → la cuota no es tope duro. Las tablas `CacheBusquedaViaje` /
  `ConsumoProveedorViaje` ya están en el schema y el puerto es el mismo: la versión Prisma reemplaza las dos
  instancias de `glue.ts` sin tocar el core (siguiente pasada, tras Gate 2).

### 2.7 Activación por tenant (ADR-054/055)

- Descriptor `viajesModule` (`src/modules/descriptors/viajes.ts`) en el catálogo: `kind: "capability"`,
  `rubros: ["agencia-viajes"]`, `dependencias: [clients]`, `flag: "VIAJES_ENABLED"`, migración aditiva
  declarada, `configSchema` con los secretos de Amadeus (`secreto: true`, nunca al repo).
- **Variante:** `resolverActivacion` lo rechaza como incompatible para `servicios`, `carniceria`,
  `generico`, `facturita`; lo activa solo para `agencia-viajes`. Test que lo cierra en `rollout.test.ts`.
- **Rollout por flag:** `filtrarPorFlagDeRollout(modules, catalogo, env)` (`src/modules/rollout.ts`) es el
  primer consumidor real del campo `flag` del descriptor. El layout del dashboard lo usa para pasar
  `assignedModules` al shell.
- **Nav:** ítem `/admin/viajes` con `requiereAsignacion: true` (eje nuevo en `ShellItem`): se muestra
  **solo** si el módulo está asignado **y** el flag prendido, aunque el gating del registry esté OFF. Sin esto,
  el gating legado mostraría "Presupuestos de viaje" a **todo** OWNER — el antipatrón DX-6. Grupo de nav:
  Operación. El gating por-URL (`rutaPermitidaParaModulos`) ya lo cubre para productos con tienda.
- **Cómo se enciende para una agencia:** (a) provisionar el tenant con `blueprintId = "agencia-viajes"`
  (blueprint **config-only** pendiente — ver §4), (b) asignar `modules: [..., "clients", "viajes"]` desde
  la consola de operador, (c) `VIAJES_ENABLED=1` en env, (d) opcional `VIAJES_PROVEEDOR=amadeus` +
  credenciales (las pega el dueño). Sin credenciales, el stub responde y **lo dice en pantalla**.

---

## 3. Qué se construyó en esta pasada (esqueleto vertical, flag OFF)

| Pieza | Archivos |
|---|---|
| Port + registro + stub + caché/cuota + adapter Amadeus real | `src/plugins/ofertas-viaje/{port,registry,stub,cache,index}.ts`, `src/plugins/ofertas-viaje/amadeus/adapter.ts` |
| Core puro del snapshot + flags | `src/lib/viajes/{core,flags}.ts` |
| Glue server + actions | `src/lib/viajes/glue.ts`, `src/lib/viajes-actions.ts` |
| Pantalla | `src/app/admin/(dashboard)/viajes/{page,ViajesForms}.tsx` |
| Catálogo / RBAC / nav / rollout | `src/modules/descriptors/viajes.ts`, `src/modules/{catalog,rollout,nav-groups,index}.ts`, `src/lib/{capabilities,admin-nav-items}.ts`, `AdminShell.tsx`, `layout.tsx` |
| Schema + migración (sin aplicar) | `prisma/schema.prisma`, `prisma/migrations/20260909120000_add_viajes_presupuestos/{migration,rollback}.sql` |
| Tests (58 nuevos) | `core.test.ts`, `flags.test.ts`, `cache.test.ts`, `stub.test.ts`, `amadeus/adapter.test.ts`, `rollout.test.ts` |

**Vallas:** `tsc` ✅ · `npm test` ✅ **1243/1243** · `gate:rls` ✅ · `next build` ✅ (`/admin/viajes` ƒ) ·
eslint de los archivos tocados ✅. Con `VIAJES_ENABLED` sin setear el backoffice es **byte-idéntico** para
CH/Magra/Shine/ADM (ítem filtrado, ruta 404, actions rechazan).

---

## 4. Lo que falta (siguiente pasada, por orden)

1. **Blueprint `agencia-viajes`** (config-only, ADR-002 §3): capabilities centrales `clients` + `viajes`,
   branding por defecto, seed mínimo. Hoy el descriptor ya lo referencia; sin el blueprint el provisioning
   no puede sembrar ese rubro.
2. **Caché + cuota persistidas** (Prisma) detrás de los mismos puertos, y un barrido de `expiraEn`.
3. **Carga manual asistida** (proveedor `manual`): formulario con base de ocupación **obligatoria** y
   `capturadoEn = ahora`, para precios de mayoristas locales.
4. **Presupuesto para el cliente:** selección de opciones, markup/comisión, exportar a PDF/WhatsApp
   (WhatsApp-first, ADR-044), pasar a ENVIADO/ACEPTADO; vencer opciones automáticamente.
5. **Hotel Search por geocódigo / nombre** (Amadeus `by-geocode`) y `Flight Offers Price` para re-confirmar
   antes de enviar.
6. Adapters **Duffel** (emisión) y **Hotelbeds/RateHawk** (neta) cuando la agencia traiga sus contratos.

---

## 5. Gate de Excelencia — autochequeo del frente (antes del Gate en Opus, ADR-040)

1. **SAP Fiori + argentino:** rol-based (`viajes:manage` server-side + módulo asignado + flag) ✅ ·
   coherente (mismo molde que Caja/Cartera: `useActionState`, `Field`, `SubmitButton`, `PageHeader`,
   `SectionGroup`, `Badge`, `EmptyState`) ✅ · simple (una pantalla: crear → buscar → guardar) ✅ · adaptable
   (grids responsive, tokens, sin hex) ✅ · accesibilidad (labels reales, `role="alert"`/`status`, `caption`
   `sr-only`, `scope` en tablas, `tabular-nums`) ✅ · consistencia (no duplica patrones; reusa `round2`,
   `fmtNumberAR`, `fmtDateTimeAr`) ✅ · argentino (copy en voseo, "por persona en doble", monedas USD/ARS/EUR,
   fecha DD/MM/AAAA TZ Argentina) ✅.
2. **Sello GSG:** backoffice ya lleva el crédito en el footer; este doc firma "— Elaborado por GSG"; el
   commit lleva el trailer. ✅
3. **Arquitectura:** capas con regla de dependencias (core/actions → solo port) ✅ · testabilidad (core puro,
   adapters con transporte inyectable, 58 tests sin red ni DB) ✅ · multi-tenant (`tenantId` en 4 tablas,
   `tenantTransaction`, caché por tenant) ✅ · deuda anotada (§2.6 memoria por proceso; §4) ✅.
4. **Confiabilidad:** tsc+build+test verdes ✅ · errores devueltos, no lanzados; P2021 honesto ✅ · **no
   rompe prod**: flag OFF, migración sin aplicar, sin deploy, sin secretos ✅.

**N/A declarados:** no hay copy de venta ni WhatsApp saliente en esta pasada (zona humana ADR-046 no
aplica todavía).

---

## 6. Las 3 cosas que más condicionan la viabilidad técnica

1. **Cotizar sí, emitir no — hasta que haya un tercero con licencia.** Con Amadeus Self-Service el ERP
   puede buscar y armar presupuestos desde el día uno (sandbox gratis, producción por uso). **Reservar/emitir
   desde el ERP exige un consolidador IATA o un merchant tipo Duffel**, cuya disponibilidad para una empresa
   argentina hay que **[verificar]** antes de prometerlo. Si el cliente compra "emisión desde el ERP", eso es
   contrato comercial, no código.
2. **La tarifa que vende una agencia argentina es la neta del mayorista, y esa no llega sin contrato.** El
   módulo es viable porque el snapshot acepta **cualquier** fuente —API pública, bedbank con contrato, o carga
   manual del portal del mayorista— con la misma disciplina (base + captura). Pero el valor comercial pleno
   (tarifa neta automática) depende de que la agencia traiga sus credenciales de Hotelbeds/RateHawk (FASE 2:
   las pega el dueño, nunca el agente).
3. **El control de gasto por request solo es tope duro con persistencia.** En serverless la cuota en
   memoria es una defensa parcial. Antes de encender `AMADEUS_ENV=production` hace falta **Gate 2** (aplicar
   la migración) y cablear `ConsumoProveedorViaje`/`CacheBusquedaViaje` — o el pago por llamada puede
   escaparse en una mañana de búsquedas repetidas. Hasta entonces: ambiente **test** (gratis, orientativo) y
   `VIAJES_CUOTA_DIARIA` bajo.

— Elaborado por GSG
