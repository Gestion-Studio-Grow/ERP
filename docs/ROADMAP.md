# ROADMAP — estetica-erp (plataforma ERP multi-tenant)

**Qué es este documento:** mapa de producto a nivel plataforma. Responde cuatro
preguntas: (1) qué tiene HOY el core del ERP —verificado contra código, no de
memoria—, (2) qué le falta para ser una solución completa de mid-market y de sus
verticales, (3) **a qué mercado le vendemos y con qué arquetipos de blueprint lo
cubrimos**, y (4) en qué orden conviene construirlo. Complementa —no reemplaza—
a `docs/ANALISIS-BRECHAS.md` (brechas del vertical estética vs. Fresha/Zenoti/…)
y `BACKLOG.md` (lista operativa). Este doc sube la altura: mira la **plataforma**
y **todos los verticales** (estética, carnicería/retail, fiscal/contador).

- **Fecha:** 2026-07-05 · **Autor:** sesión de arquitectura/PMO (autónoma)
- **Método:** auditoría del código real — `prisma/schema.prisma` (29 modelos + 12
  enums, 20 migraciones), rutas `/admin` y `/app`, `src/lib/*-actions.ts`,
  `src/plugins/{arca,mercadopago}`, `src/blueprints/*`, `scripts/provision-tenant.ts`,
  ADR-001…025, `docs/FUNDAMENTOS-Y-VISION.md`, `docs/ANALISIS-BRECHAS.md`, `BACKLOG.md`.
- **Marco rector:** un solo Core multi-tenant; cada cliente = un tenant; verticales
  por Blueprint/config/Plugin, nunca fork (FUNDAMENTOS §1–§4, ADR-001/002).

> **Convención de estado:** **✅ TERMINADO** = funciona end-to-end en prod ·
> **🟡 A MEDIAS** = parcial, detrás de flag, o escrito-pero-no-aplicado ·
> **📐 SOLO DISEÑADO** = decidido en ADR / esbozado, sin código productivo ·
> **❌ NO EXISTE** = ni modelo ni código.

---

## 1. Estado del core hoy

### 1.1 Resumen de una línea

El **núcleo transaccional de servicios** (reservar · agenda · catálogo · clientes ·
cobro manual · comisiones · reseñas · recordatorios · RBAC · auditoría) está
**terminado y en producción**, a la par o por encima de la gama de entrada del
rubro. La **plataforma multi-tenant** está diseñada y a medio cablear: aislamiento
a nivel aplicación sí, **RLS de Postgres escrita pero SIN aplicar**, y el
provisioning **se niega a crear el 2º tenant hasta activar RLS**. La
**monetización real** (checkout, WhatsApp, facturación fiscal viva) está construida
al 60–90 % pero **apagada tras flags o credenciales pendientes**.

### 1.2 Inventario de capabilities (verificado)

| Dominio | Capability / pantalla | Estado | Evidencia |
|---|---|---|---|
| **Agenda** | Grilla diaria por profesional + vista lista, reprogramación, anti-doble-reserva transaccional con buffer | ✅ | `turnos/`, `booking-core.ts` (`assertSlotAvailable`) |
| Agenda | Horarios por profesional/día, francos por persona (`ProfessionalBlock`) y por box (`BoxBlock`) | ✅ | `WorkingHours`, `catalog-actions.ts` |
| Agenda | Recursos con capacidad (máquinas/gabinetes), anti-overbooking real | ✅ | `Resource`/`ServiceResource`, `createAppointment` |
| **Reserva pública** | Categoría→servicio→profesional→horario, cancelar/reprogramar el propio turno, precio "vecino" opcional | ✅ | `app/(site)/reserva/`, `client-actions.ts`, ADR-013 |
| **Catálogo** | Servicios con categorías en árbol, precio, duración, seña visible, boxes, recursos, cupones | ✅ | `catalogo/` (6 secciones), ADR-014 |
| Catálogo | Stock de **insumos** con descuento automático al **completar turno** + alerta de stock bajo | ✅ | `Product`, `ServiceProduct`, consumo en `completeAppointment` |
| **Clientes** | Ficha (contacto, notas libres, historial, total gastado), buscador con acentos | ✅ | `clientes/`, `client-actions.ts` |
| **POS / Órdenes** | Venta de mostrador + vidriera pública, por unidad o por kg, estados PENDING→DELIVERED, retiro/envío | ✅ (venta) | `pedidos/`, `order-actions.ts`, `app/carniceria/` |
| POS / Órdenes | Descuento de stock al vender, cuenta corriente, cobro integrado | ❌ | `createOrder` **no toca `Product.stock`**; `paid` es boolean manual |
| **Lista de espera** | Anotar, avisar (manual), convertir hueco→turno reusando disponibilidad real | ✅ | `espera/`, `waitlist-actions.ts`, `WaitlistEntry` |
| **Comisiones** | Por profesional + override por (profesional,servicio) + liquidación por período congelada e idempotente | ✅ | `commission-actions.ts`, `CommissionPayout` |
| **Reseñas** | 1–5★ + comentario, moderación desde admin, testimonios en la web | ✅ | `resenas/`, `Review` |
| **Recordatorios / avisos** | Panel por servicio/canal, plantillas editables, difusión de novedades por profesional | ✅ (infra) | `recordatorios/`, `MessageTemplate`, `notifications.ts` |
| Recordatorios | Envío **email real** (Resend) | ✅ | `notifications.ts` (`RESEND_API_KEY`) |
| Recordatorios | Envío **WhatsApp real** | 🟡 | simulado (`console.log`, `sent:false`) — falta proveedor Meta/Twilio |
| **Pagos** | Registro de pago con método y estado, precio congelado al reservar | ✅ (manual) | `Payment`, `confirmPayment` (tipeado a mano) |
| Pagos | **Checkout online + seña que se hace cumplir** | 🟡 | `Payment` tiene `mpPaymentId`/`mpPreferenceId` sin usar; sin SDK ni preferencia ni webhook de cobro |
| **Localización** | Ficha editable de ubicación/contacto/horarios del negocio | ✅ | `localizacion/`, `BusinessSettings`, `settings.ts` |
| **RBAC** | 3 roles (OWNER/RECEPTION/PROFESSIONAL), mapa capability→rol en código, `requireCapability` server-side | ✅ | `capabilities.ts`, `authz.ts`, ADR-017 |
| **Auditoría** | Log append-only con actor real, acción, entidad, cambios | ✅ | `AuditLog`, `audit.ts`, `auditoria/` |
| **Reportes** | Ingresos por día/profesional/servicio + comisiones a liquidar | ✅ (básico) | `reportes/`, `getReportData` |
| Reportes | No-show, retención/recurrencia, rentabilidad hora-silla, export Excel/PDF | ❌ | no hay nada de eso en `reportes/page.tsx` |
| **Multi-tenant (datos)** | `tenantId` en las 29 tablas, soft-delete en catálogo, zona horaria por tenant, resolución fail-closed | ✅ | schema, `tenant.ts`, ADR-001/015 |
| **Multi-tenant (aislamiento DB)** | RLS de Postgres (`SET LOCAL app.current_tenant_id` por transacción, rol sin `BYPASSRLS`) | 🟡 | escrito y verificado offline en `prisma/rls/` + `rls.ts`, **NO aplicado a prod, extensión apagada** (ADR-018) |
| **Provisioning** | Alta de tenant idempotente, transaccional, aditiva, con blueprint (`--blueprint`) | ✅ (script) | `scripts/provision-tenant.ts`, ADR-019 |
| Provisioning | Alta del **2º tenant** en prod | 🚧 bloqueado | el script **se niega** a crear la 2ª fila `Tenant` hasta que RLS esté activo (gate ADR-018/019) |
| **Blueprints (verticales)** | `servicios` (estética) y `carniceria` (retail) como config pura sobre el Core, sin schema propio | ✅ | `src/blueprints/`, ADR-002/003 |
| **Plugin ARCA** (facturación electrónica) | Lado Plugin: dominio, catálogos WSFEv1, validación, port/stub AFIP, manifest, handler | 🟡 | `src/plugins/arca/`; **lado Core (Invoice+Outbox) detrás de flag `ARCA_INVOICING_ENABLED` OFF y migración no aplicada a prod** (fiscal.ts, ADR-022/024) |
| **Plugin Mercado Pago** (ingesta ADR-025) | Ingesta de feed de ingresos, clasificador por reglas, reconciliación, notificación, webhook | 🟡 | `src/plugins/mercadopago/` + `api/webhooks/mercadopago`; depende de OAuth de MP y del gate fiscal |
| **Consola super-admin** (operación plataforma) | Panel de operador separado del RBAC de tenant | 📐 | ADR-021 lo diseña (Fase 1 = al 2º tenant); hoy solo el script operado, sin panel |
| **Feature flags por tenant** | Activar/desactivar capabilities por cliente | 📐 | hoy son env globales (`ARCA_INVOICING_ENABLED`); ADR-006 define la tabla, sin implementar |

### 1.3 Veredicto por bloque

- **Servicios/estética (piloto):** ✅ **terminado y operando** en prod (tenant único
  real, CH Estética). Es el vertical más maduro.
- **Retail/carnicería:** 🟡 **vende pero no gestiona** — POS y vidriera funcionan,
  pero sin descuento de stock, sin compras/reposición, sin caja. Sirve para demo
  end-to-end; no para operar un negocio de stock en serio.
- **Fiscal/contador (arca+MP):** 🟡 **construido, apagado** — mucho código real, cero
  facturación viva en prod (flag OFF + credenciales/homologación ARCA pendientes).
- **Plataforma multi-tenant:** 🟡 **diseño completo, un cable suelto** — el diseño
  (RLS + provisioning + super-admin) está decidido y en gran parte escrito; falta
  el **acto de Gate 2** (aplicar RLS en branch de Neon → prod) que desbloquea todo
  lo multi-cliente.

---

## 2. Detección de gaps

### 2.1 Gaps de ERP mid-market genérico

| Capacidad esperada en un ERP | Estado | Nota |
|---|---|---|
| **Inventario / stock con movimientos** | 🟡 parcial | hay `Product.stock` + consumo por servicio; **no** hay ledger de movimientos, **no** baja al vender por POS, **no** sube por compra |
| **Compras / proveedores (Supplier, PO)** | ❌ | sin `Supplier`/`Purchase`/`PurchaseOrder`; no hay ciclo de reposición ni costos de compra |
| **Caja / tesorería (apertura, arqueo, movimientos)** | ❌ | no hay concepto de caja diaria, cierre ni conciliación de efectivo |
| **Cuenta corriente de clientes (saldos, fiado, crédito)** | ❌ | el pago es por turno/orden; no hay saldo acumulado ni límite de crédito |
| **Cuenta corriente de proveedores (CxP)** | ❌ | derivado de la ausencia de compras |
| **Contabilidad / libro mayor / asientos** | ❌ (fuera de alcance) | el IVA se calcula en Core (`fiscal.ts`) sin persistir asientos; el Tax Engine (ADR-006) está diferido |
| **Gastos operativos (expenses)** | ❌ | no se registran costos; los reportes son solo de ingresos |
| **Facturación electrónica viva** | 🟡 | Plugin ARCA construido pero apagado (ver §1.2) |
| **Integración de cobros (checkout online)** | 🟡 | columnas MP presentes sin usar; sin SDK/preferencia/webhook de cobro |
| **Reportes / BI con profundidad** | ❌ | solo ingresos + comisiones; sin no-show/retención/rentabilidad/export |
| **Roles y permisos finos / custom** | 🟡 | 3 roles fijos con mapa en código (sólido y suficiente hoy); sin roles a medida ni permisos por sucursal |
| **Notificaciones multicanal reales** | 🟡 | email real; WhatsApp simulado; sin SMS/push |
| **Importador de datos (CSV clientes/catálogo)** | ❌ | diferido explícitamente (ADR-019 §2.c) hasta tener datos reales que migrar |
| **Portal / app del cliente** | ❌ | hoy acceso solo por link de turno; sin login ni "mis turnos/pedidos" |
| **Multi-sucursal / runtime multi-tenant** | 🟡 | modelo de datos listo; falta activar RLS + resolución por subdominio + selector de tenant + auth por tenant |
| **Consola de operación de plataforma** | 📐 | ADR-021, no construida |

### 2.2 Gaps por vertical

**Estética / salón** (el más maduro — brechas ya detalladas en `ANALISIS-BRECHAS.md`):
checkout+seña que se hace cumplir · WhatsApp real · reportes profundos ·
paquetes/bonos/membresías · ficha de cliente enriquecida (tags, fotos
antes/después, profesional preferido, consentimiento) · turnos recurrentes ·
gift cards · fidelidad/puntos · sync Google Calendar · portal del cliente.

**Carnicería / retail** (el que más ERP-core le falta):
descuento de stock al vender (❌, hoy no baja) · **compras y reposición** con
proveedores · **caja/tesorería** de mostrador · balanza/etiquetas de peso ·
cuenta corriente (fiado, típico de barrio) · listas de precios y promociones ·
logística de reparto (zonas, ruteo) · costos y margen por corte.

**Fiscal / monotributista-contador** (arca + ingesta MP, ADR-025):
homologación + certificado digital ARCA (🔑) · OAuth de Mercado Pago (🔑) ·
**panel del contador** para operar su cartera (multi-cliente = multi-tenant) ·
notas de crédito/débito (hoy `Invoice` solo factura) · alertas fiscales
(vencimientos, recategorización monotributo) · facturación masiva desde el feed ·
reportes fiscales / libro IVA.

### 2.3 Riesgos técnicos abiertos (de ADR-023, priorizados)

- 🔴 **F2 — Overbooking TOCTOU:** check-then-insert sin nivel Serializable; bug
  latente de doble-reserva bajo concurrencia. Fix barato (nivel de transacción).
- 🔴 **F1 — Índices sin `tenantId` en el WHERE:** se activan de la mano de RLS.
- 🟠 **F3 — Reportes agregan histórico en JS** en vez de en la DB; degrada al crecer.
- 🟡 **F8 — `AuditLog` append-only vs. storage 0.5 GB** de Neon free: definir retención.

---

## 3. Capa estratégica: segmentación por arquetipos de blueprint

La táctica (features del §4) sirve a una estrategia de mercado: **no vendemos un
software por rubro, vendemos una plataforma que absorbe rubros por configuración**.
Cada negocio nuevo debería resolverse eligiendo un **arquetipo de blueprint** y
ajustando config —catálogo, unidades, flujo, branding—, **no** escribiendo código
de base (FUNDAMENTOS §2, ADR-002/003). Un arquetipo es la "forma" de operar;
un rubro es un preset sobre esa forma.

> **Estado en código (verificado):** el registro de blueprints
> (`src/blueprints/index.ts`) tiene hoy **2**: `servicios` (default) y `carniceria`.
> El resto de los arquetipos de abajo son **📐 estrategia/diseño**, todavía sin
> preset propio. El valor del enfoque es que sumarlos es *config*, no un producto nuevo.

### 3.1 Arquetipos y el mercado local argentino

| Arquetipo | Cómo opera | Rubros AR que absorbe | Reusa del Core | Estado |
|---|---|---|---|---|
| **Agenda & Servicios** | turno con profesional/recurso en el tiempo | estética/salón, salud/consultorios, veterinaria, gimnasios/estudios, spa | agenda, boxes/recursos, profesionales, reservas, recordatorios, comisiones | ✅ (vía `servicios` / CH Estética) |
| **Retail / Mostrador** | venta de producto por unidad o peso, POS + vidriera | carnicería, verdulería, dietética, kiosco, indumentaria, ferretería | POS/órdenes, catálogo producto, canales COUNTER/ONLINE, fulfillment | 🟡 (vía `carniceria` / magra — falta stock+caja, ver §2) |
| **Servicios profesionales & Oficios** | trabajo/visita presupuestado, sin stock ni turnera rígida | contadores, plomeros, técnicos, electricistas, freelancers | clientes, órdenes/presupuesto, cobro, facturación | 📐 diseño |
| **Gastronomía** | comanda/mesa/delivery, alta rotación | bar, resto, cafetería, rotisería | POS/órdenes, fulfillment, catálogo | 📐 diseño — **entra tarde** (incumbentes fuertes: Fudo, Bistrosoft, Maxirest) |
| **Solo-facturación / digital** | no vende por el ERP, solo factura/concilia ingresos | monotributista, vendedor de ML/MP, servicios digitales | Plugin arca + ingesta MP (ADR-025) | 🟡 (código de arca/MP presente, apagado) |
| **Genérico / comodín** | mínimo común (clientes + ítems + cobro + factura) | cualquier rubro que aún no tiene preset propio | clientes, catálogo, órdenes, arca | 📐 diseño — **red de contención** |

**Por qué el genérico importa:** es la **red de contención comercial**. Permite dar
de alta a un cliente cuyo rubro todavía no tiene arquetipo fino, sin decirle que no
y sin forkear: entra con lo mínimo (clientes + ítems + cobro + factura) y después se
lo "asciende" a un preset cuando exista. Convierte "no tenemos tu rubro" en "arrancá
hoy y lo afinamos".

**Por qué gastronomía va tarde:** el arquetipo Retail/Órdenes lo cubre técnicamente,
pero el rubro tiene **incumbentes locales fuertes y features caras** (comanda a
cocina, mesas, control de mozos, delivery integrado). Es entrada de bajo ROI hasta
tener la plataforma madura; se mira después de los tres arquetipos con menos fricción.

### 3.2 Segmento y encuadre

- **Segmento:** PyME argentina —mono/multi-tenant chico a mid-market—, no enterprise.
  El diferencial es **cobertura de rubro por configuración + fiscalidad AR nativa
  (arca)**, no profundidad vertical de nicho.
- **La fiscalidad es horizontal, no un rubro:** todo negocio AR factura. Por eso
  **arca no es un arquetipo más sino una capa transversal** que sirve a todos —y de
  paso es un producto vendible standalone al monotributista/contador (ADR-022/025).

### 3.3 Orden de construcción de blueprints

El orden sigue "menor esfuerzo incremental × mayor mercado desbloqueado", y explota
que cada arquetipo nuevo es **preset sobre el Core**, no desarrollo:

1. **arca (horizontal) — primero y transversal.** Encender la fiscalidad sirve a
   *todos* los arquetipos a la vez y abre el segmento solo-facturación ya. Máxima
   palanca por ser común denominador.
2. **Agenda & Servicios — casi listo.** El arquetipo ya opera vía CH Estética;
   falta empaquetarlo como preset reusable y sumar presets de rubro (veterinaria,
   salud, gym) que son casi solo catálogo + branding.
3. **Retail / Mostrador — en curso.** magra prueba el arquetipo; el trabajo es
   volverlo blueprint reusable y cerrar los gaps de ERP-retail (stock al vender,
   caja, compras — §2). Desbloquea la familia carnicería/verdulería/dietética/kiosco.
4. **Servicios profesionales & Oficios.** Preset liviano sobre clientes + órdenes/
   presupuesto + arca; poco código nuevo una vez que Retail dejó el flujo de orden
   pulido. Gran mercado de baja competencia de software.
5. **Gastronomía — al final.** Solo cuando la plataforma esté madura y con apetito
   de pelear un rubro con incumbentes.

> **Regla operativa:** rubro nuevo dentro de un arquetipo existente = **una sesión de
> config** (catálogo + unidades + branding + flags), no una sesión de desarrollo. El
> desarrollo se gasta en *arquetipos* y en *capabilities del Core*, no en *rubros*.

### 3.4 Sprint en curso (2026-07)

Foco actual —construcción en paralelo de la base que habilita el orden de arriba—:

- **Retail → blueprint reusable:** generalizar `magra`/`carniceria` de tenant puntual
  a arquetipo Retail/Mostrador parametrizable (cierra §2: stock al vender, caja).
- **Blueprint Genérico / comodín:** la red de contención para altas de cualquier rubro.
- **Onboarding-experiencia:** el alta hoy es un script operado (`provision-tenant.ts`);
  el sprint la lleva hacia una experiencia de alta guiada (elegir arquetipo → sembrar
  → primeros pasos). Base del futuro portal/consola (ADR-019/021).
- **Capa fiscal arca:** encender la fiscalidad horizontal (Gate 2 — lado Core del
  Plugin, §4-#9) que sirve a todos los arquetipos.
- **Sistema de diseño:** primitivos UI + tokens con branding por tenant, para que
  cada arquetipo/tenant se vea propio sin forkear front (hoy `src/components/ui` +
  `branding.ts`, con theming por tenant aún parcial).

Estos cinco frentes son *habilitadores de plataforma*: no agregan un rubro, agrandan
la superficie sobre la que después cada rubro entra como config.

---

## 4. Roadmap priorizado

Orden por **palanca ÷ esfuerzo ÷ riesgo**, agrupado por horizonte. 🔑 = bloqueado
por credencial/decisión del dueño. Esfuerzo: S≤1 · M=2–3 · L=4–6 · XL>6 jornadas.

### MVP-plataforma — "poder dar de alta clientes reales" (desbloquea todo lo demás)

> Sin esto, el producto es un sistema de un solo tenant. Es el gate que convierte
> "software de CH Estética" en "SaaS con clientes". Sirve a **todos los verticales/segmentos**.

| # | Feature | Por qué | Esf. |
|---|---|---|---|
| 1 | **Activar RLS de Postgres** (Gate 2: ensayo en branch de Neon → prod) | backstop de aislamiento a nivel DB; hoy es solo app-level. Prerrequisito duro del 2º tenant (ADR-018) | L |
| 2 | **Desbloquear alta del 2º tenant** (resolución por subdominio/sesión + quitar el gate del provisioning) | el script ya siembra tenant+OWNER+blueprint; falta resolver el tenant por request y levantar el candado (ADR-015/019) | M |
| 3 | **Consola super-admin mínima** (envoltura del provisioning + salud read-only, conexión propia `BYPASSRLS`) | operar altas y ver salud sin tocar el proceso que sirve tenants (ADR-021) | M |
| 4 | **Feature flags por tenant** (tabla `feature_flag`) | activar facturación/WhatsApp/verticales por cliente en vez de por env global (ADR-006) | S–M |
| 5 | **Fix F2 (Serializable en reserva)** | cerrar el bug latente de doble-reserva antes de tener carga real (ADR-004/023) | S |

### v1 — "monetizar y operar el día a día" (foco estética, valor inmediato)

| # | Feature | Por qué / a quién sirve | Esf. |
|---|---|---|---|
| 6 | 🔑 **Checkout Mercado Pago + seña que se hace cumplir** | ataca el no-show, el mayor drenaje de plata; convierte `depositAmount` (ya visible) en cobro real. Estética/retail | L |
| 7 | 🔑 **WhatsApp real** (recordatorios + difusión) | infra ya construida; solo falta el proveedor. Máximo valor por esfuerzo. Todos | S–M |
| 8 | **Reportes profundos + export** (no-show, retención, rentabilidad hora-silla, Excel/PDF) | decisiones de negocio que hoy se hacen a mano; incluye fix F3. Todos | M–L |
| 9 | 🔑 **Facturación ARCA viva** (aplicar migración Invoice/Outbox + worker + `RegisterFiscalDocument` + credenciales) | encender el Plugin ya escrito; obligación legal AR. Todos los verticales AR | L |

### v1+ — "profundidad de ERP y vertical retail"

| # | Feature | Por qué / a quién sirve | Esf. |
|---|---|---|---|
| 10 | **Inventario con movimientos + baja de stock al vender** | cierra el agujero del POS retail; base de todo control de stock. Carnicería/retail | M |
| 11 | **Compras / proveedores / reposición** (Supplier, PurchaseOrder, entrada de stock) | sin compras no hay ciclo de inventario real ni costo/margen. Retail (y estética para insumos) | L |
| 12 | **Caja / tesorería** (apertura, movimientos, arqueo/cierre) | control de efectivo de mostrador; imprescindible en retail. Carnicería/retail | M |
| 13 | **Cuenta corriente de clientes** (saldos, fiado, crédito) | venta a cuenta, típica del barrio; fideliza. Retail (y planes en estética) | M |
| 14 | **Paquetes / bonos / membresías** | ingreso adelantado + fidelización; idealmente sobre checkout (#6). Estética/gimnasios | L |
| 15 | **Ficha de cliente enriquecida** (tags/segmentos, fotos antes/después, prof. preferido, consentimiento) | personalización y marketing segmentado. Estética | M |
| 16 | **Panel del contador (arca)** — operación multi-cliente sobre el feed MP (ADR-025) | monetiza el vertical fiscal; reusa la arquitectura multi-tenant. Contadores/monotributistas | L |

### Visión — "diferenciadores y escala"

| # | Feature | Por qué / a quién sirve | Esf. |
|---|---|---|---|
| 17 | **Portal / app del cliente** (login, "mis turnos/pedidos", historial) | autogestión; reduce carga de mostrador. Todos | L |
| 18 | **Turnos recurrentes** + **sync Google Calendar** del profesional | clientes de mantenimiento; evita doble-agenda. Estética | M+M |
| 19 | **Fidelidad / puntos** + **gift cards / vouchers** | retención y estacionalidad; sobre checkout. Estética/retail | L |
| 20 | **Importador CSV** (clientes/catálogo) con vista previa | acelera el alta de tenants con datos reales (ADR-019 §2.c). Todos | M |
| 21 | **Multi-sucursal real** (UI/selector de tenant, permisos por sucursal) | cadenas con >1 local; la base de datos ya está lista. Mid-market alto | XL |
| 22 | **Nuevos verticales por Blueprint** (consultorios, gimnasios, indumentaria) | prueba y capitaliza el modelo Core/Blueprint sin código nuevo de base. Expansión | M c/u |
| 23 | **Dashboards / BI** y **marketplace de plugins** | analítica ejecutiva y ecosistema de integraciones (ADR-006). Mid-market | XL |

---

## 5. Resumen para el dueño

- **¿El core está "terminado"?** El **núcleo de servicios/estética sí** (agenda,
  clientes, catálogo, cobro manual, comisiones, reseñas, recordatorios, RBAC,
  auditoría) — está en producción y compite bien. La **plataforma multi-tenant no**:
  está diseñada y casi cableada, pero le falta el paso de Gate 2 (activar RLS).
- **¿Podemos dar de alta tenants hoy?** **No en prod todavía.** El script de alta
  funciona, pero **se niega a crear el 2º tenant hasta activar RLS de Postgres**
  (candado de seguridad deliberado). Hoy operamos un solo tenant real; el 2º está a
  ~1 sesión de arquitectura (ensayo RLS en branch de Neon + resolución por subdominio).
- **Además hay valor "apagado tras un interruptor":** checkout de Mercado Pago,
  WhatsApp real y facturación ARCA están construidos al 60–90 % pero esperan
  credenciales/homologación o un flag — no son features por hacer de cero.
- **Las 3–4 palancas de mayor retorno para lo próximo:** (1) **activar RLS y abrir
  el alta multi-tenant** (desbloquea el negocio SaaS entero); (2) **checkout MP +
  seña** (ataca el no-show, mayor impacto en ingresos); (3) **WhatsApp real**
  (casi gratis, la infra ya existe); (4) **inventario+caja para retail** (convierte
  a carnicería de "demo que vende" en "ERP que gestiona").
- **La estrategia de mercado (§3):** no vendemos por rubro, cubrimos rubros por
  configuración sobre **arquetipos de blueprint** (Agenda&Servicios ✅, Retail 🟡,
  Oficios/Gastronomía/Genérico 📐), con **arca (fiscalidad) como capa horizontal**.
  El **sprint en curso** construye justo los habilitadores de eso: Retail reusable +
  blueprint Genérico + onboarding-experiencia + capa fiscal arca + sistema de diseño.
  Rubro nuevo dentro de un arquetipo = una sesión de config, no de desarrollo.

---

*Fuentes verificadas en código a 2026-07-05. Los ítems 🔑 dependen de una acción
del dueño (credenciales/decisión). Este roadmap no compromete fechas: ordena por
palanca, no por calendario.*
