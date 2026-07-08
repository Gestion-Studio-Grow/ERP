# Fundamentos y visión — estetica-erp

**Qué es este documento:** el criterio rector del producto. Fija la visión y las reglas de encuadre que **toda sesión** (feature, arquitectura, negocio, consolidación, seguridad) debe respetar para decidir alineada, sin re-litigar lo mismo en cada thread. Los ADR deciden el *cómo* de cada tema puntual; este doc fija el *marco* dentro del cual esos ADR son válidos. Si una decisión de sesión choca con esto, gana esto (o se cambia esto explícitamente, con su justificación).

> **Regla de una línea:** un solo Core multi-tenant. Cada cliente es un **tenant**; su rubro es un **Blueprint** (configuración); lo transversal (facturación, pagos) es un **Plugin**. Nunca un fork por cliente.

---

## 1. Visión del producto — multi-tenant explícito

estetica-erp es un **ERP SaaS multi-tenant estilo SAP Public Cloud**. El nombre es histórico (el piloto fue un spa); el producto es una **plataforma ERP genérica** y el spa "CH Estética" es su primer tenant.

Los tres ejes del modelo, sin ambigüedad:

1. **Un CORE único y compartido** por todos los clientes. Una sola base de código, un solo despliegue. Cada mejora se paga una vez y la reciben todos los tenants.
2. **Cada cliente = un TENANT** del mismo sistema, aislado por **datos** (`tenantId` en cada tabla + RLS, ADR-001 / ADR-018), **no** por despliegue ni por copia de código.
3. **Los rubros (verticales) se resuelven por BLUEPRINT + configuración; lo transversal, por PLUGINS** (ADR-002). Estética, carnicería, etc. son Blueprints sobre el mismo Core, no sistemas distintos.

> **NO forkeamos por cliente. NO forkeamos por rubro.** Un fork por cliente multiplica el mantenimiento por la cantidad de clientes (cada fix hay que portarlo N veces) y mata la economía del SaaS. Si algo "parece" necesitar un sistema aparte, primero se agota Blueprint + config + Plugin (§4). Levantar un código separado para un cliente es una **violación del modelo**, no una opción de diseño.

---

## 2. Promesa de producto (el pilar) y su guardrail

**La promesa de marca, hacia el cliente:**

> **"Si tu modelo de negocio no está acá, lo solucionamos."**
> **"Podemos solucionar todo e impulsarte con tecnología."**

Esta promesa es un pilar del producto: nadie queda afuera por "no tener el rubro". La sostiene, técnicamente, el Blueprint genérico/comodín (§4): cualquier negocio opera desde el día uno, aunque su vertical todavía no esté modelado en detalle.

**Guardrail anti-consultora (igual de importante que la promesa):**

> **"Lo solucionamos" = te acomodamos sobre lo que YA existe** — el Blueprint de tu rubro, o el genérico comodín, más configuración, módulos y plugins. **NO** significa desarrollo a medida para un solo cliente.

- El acomodamiento sale de **capacidades reutilizables del Core** que sirven a muchos tenants. Eso es producto, escala, y entra en el precio del SaaS.
- El desarrollo **exclusivo para un cliente** (una feature que solo le sirve a él y nadie más la va a usar) **rompe el modelo §1**: es un **proyecto aparte**, con su propio alcance, su precio y su ciclo — nunca se mete como código especial dentro del Core compartido.
- Frontera práctica para decidir: *¿esto lo puede reusar otro tenant del mismo arquetipo?* Si **sí** → es producto (Blueprint/config/módulo). Si **no** → es proyecto a medida, se cotiza y se aísla; no contamina el Core.

Sin este guardrail, "lo solucionamos" degenera en una consultora de software a medida disfrazada de SaaS — exactamente lo que §1 existe para evitar.

---

## 3. Modelo de tenants

- **Un tenant nuevo se modela SIEMPRE dentro del multi-tenant existente.** La pregunta por defecto ante un cliente nuevo no es "¿qué app le armo?" sino **"¿qué arquetipo/Blueprint lo cubre, y qué config/plugins le activo?"**.
- **`magra`** (carnicería premium, Canning) es el **2º tenant** y la prueba de que el modelo funciona en la práctica: está realizado **dentro de este repo** como el Blueprint **`carniceria`** (familia Retail/Mostrador, `src/blueprints/retail/rubros.ts`, en `main`), con alta vía provisioning `--blueprint=carniceria` y vidriera pública `/tienda` sobre la capability de POS/mostrador. **No** es una app aparte ni un fork: lo que difiere de estética (catálogo, unidades, flujo de venta/mostrador) es Blueprint + capabilities del Core, no código base duplicado.
- **El aislamiento entre tenants es la línea roja de seguridad y de diseño:** ningún dato, query o pantalla cruza tenants. El backstop es RLS de Postgres (ADR-018); hasta activarlo, el aislamiento es a nivel aplicación con resolución de tenant fail-closed (ADR-015).

---

## 4. Blueprints: verticales, arquetipos y el genérico comodín

Un **Blueprint** es **configuración pura sobre el Core** (ADR-002), no un fork: define qué vertical se da de alta, qué capabilities usa, su branding por defecto y cómo sembrar su catálogo mínimo editable (interfaz `Blueprint` en `src/blueprints/types.ts`; registry en `src/blueprints/index.ts`). **Cero schema propio:** solo parametriza y siembra modelos del Core que ya existen (`Service`, `Product`, `Box`, …).

### El Blueprint GENÉRICO / comodín (sostén de la promesa)

Todo negocio que **no encaje** en un vertical ya modelado arranca con un **blueprint base universal** y **opera desde el día uno**. Su piso funcional:

- **Facturación** (vía Plugin ARCA, §6) · **Clientes** · **Caja / cobros** · **Catálogo / servicios flexible** (ítems configurables, sin asumir un flujo de rubro) · **Branding por tenant**.

Este blueprint es lo que hace **verdadera** la promesa §2: sin él, "si tu rubro no está, lo solucionamos" dependería de que exista el vertical exacto. Con él, el vertical específico pasa a ser un **refinamiento** posterior, no un requisito de arranque.

> **Estado real:** hoy existen los blueprints `servicios` (piloto) y `carniceria` (`magra`); **el `generico` todavía no está construido**. Es el **próximo blueprint prioritario** — el que convierte la promesa de marca en algo operable para cualquier rubro. Hasta que exista, un rubro no modelado se cubre con el más cercano + config manual (deuda conocida).

### Arquetipos de Blueprint (segmentación de referencia)

Cada rubro real del mundo cae en **uno** de estos arquetipos. No se crea un Blueprint por cliente: se crea por **arquetipo**, cuando hay demanda repetida. El detalle de cada arquetipo se define en su propio ADR/feature cuando se construye; acá va solo la referencia de segmentación:

| Arquetipo | Rubros de ejemplo | Núcleo | Blueprint | Estado |
|---|---|---|---|---|
| **Agenda & Servicios** | spa/estética, peluquería, consultorio | turnos, profesionales, recursos, recordatorios | `servicios` | ✅ implementado (piloto) |
| **Retail / Mostrador** | carnicería, kiosco, tienda | catálogo, stock, POS/caja | `carniceria` | ✅ implementado (`magra`) |
| **Servicios profesionales & Oficios** | estudio contable, plomería, taller | presupuesto/orden de trabajo, sin stock pesado | — | ⏳ pendiente |
| **Gastronomía** | bar, restaurante | mesas/comandas, delivery | — | ⏳ pendiente |
| **Solo-facturación** | monotributista, freelance | emitir comprobantes + clientes, mínimo | — | ⏳ pendiente (≈ genérico recortado) |
| **Genérico / comodín** | cualquier rubro no modelado | base universal (arriba) | `generico` | ⏳ pendiente — **prioritario** |

**Regla de encuadre:** ante un cliente nuevo, cae en un arquetipo; si no cae claro en ninguno → **genérico**. Un rubro solo "asciende" a Blueprint propio cuando se repite lo suficiente como para justificar modelarlo (mismo criterio simple-y-correcto de §9 / ADR-006).

---

## 5. La venta como experiencia hiper-personalizada (fundamento de diseño de producto)

**Principio rector:** en todo momento el cliente debe sentir que el producto es **PARA esa persona/empresa** — no un software genérico donde "entra a la fuerza". Esto es un **fundamento de diseño de producto, no solo de marketing**: se implementa en el sistema, no en el discurso comercial.

Cómo se materializa (los cuatro pilares de la experiencia):

1. **Descubrimiento pre-alta:** antes de crear el tenant se releva rubro y necesidad, y eso **elige el arquetipo/Blueprint** correcto. El cliente no "configura un ERP genérico": el sistema ya llega orientado a su negocio.
2. **Branding por tenant:** nombre, datos, identidad visual propios desde el minuto uno (`BusinessSettings` + `brandingDefaults` del Blueprint). La instancia se ve **suya**, no una plantilla.
3. **Blueprint de su rubro:** arranca con el catálogo/flujo de SU negocio ya sembrado (`seedCatalog`), no con pantallas vacías.
4. **Configurador guiado:** un onboarding que lo va **acomodando sobre lo que ya existe** (config/módulos/genérico), reforzando el guardrail de §2 (acomodar, no desarrollar a medida).

> **Estado real:** ya son reales el branding por tenant (`BusinessSettings`, `brandingDefaults`) y el catálogo sembrado por Blueprint (`seedCatalog`). El **descubrimiento pre-alta** y el **configurador guiado** son visión: hoy el alta es un script operado (ADR-019), sin portal self-service (diferido). La experiencia hiper-personalizada es el norte que guía cómo evolucionan el onboarding y el provisioning.

---

## 6. Plugins (lo transversal / horizontal)

- Los **plugins son capacidades horizontales** que sirven a cualquier vertical, integradas bajo Core/Blueprint/Plugin (ADR-002): se comunican con el Core por **eventos asíncronos (outbox pattern)** y **comandos públicos**, nunca tocando la base del Core directo.
- **`arca`** (facturación impositiva ARCA/AFIP) es el **primer Plugin** del ERP (ADR-002 / ADR-020 / ADR-022): el Core emite `InvoiceCreated`, el Plugin obtiene el CAE y responde con el comando público `RegisterFiscalDocument(...)`. El *cálculo* de impuestos vive en el Core (lógica de negocio); el Plugin hace **solo** la autorización fiscal externa (ADR-006). Es transversal a todos los arquetipos: facturar lo necesitan el spa, la carnicería y el genérico por igual — por eso es Plugin y no Blueprint.
- **Doble naturaleza aceptada:** `arca` puede venderse **standalone** además de operar como Plugin del ERP. No lo saca del modelo: standalone es un empaquetado comercial del mismo componente; integrado, entra por el contrato de Plugin de ADR-020. No se bifurca en dos códigos.

---

## 7. Metodología de estructura

- **Core / Blueprint / Plugin** (ADR-002) es la arquitectura de plataforma. Blueprint = configuración pura, cero schema propio. Plugin = evento/comando, cero acceso directo a datos del Core.
- **ADR-driven** (ADR-008): toda decisión estructural se persiste como ADR en `docs/adr/`, con `INDEX.md` como punto de entrada. Ninguna decisión importante vive solo en un chat.
- **Tablero de sesiones** (`docs/TABLERO-SESIONES.md`): un thread = un tema, arrancado con su comando `/sesion-*`. Si una sesión deriva a otro tipo, se anota y se abre la sesión correcta.
- **Provisioning por tenant** (ADR-019): el alta es un **script operado, idempotente por `slug`, transaccional** (`scripts/provision-tenant.ts`) que siembra tenant + OWNER + el catálogo del Blueprint elegido (`--blueprint`). Portal self-service / panel super-admin / importador CSV están **diferidos** hasta que la frecuencia de altas los justifique.
- **Aislamiento / RLS** (ADR-018): RLS por `tenant_id` con `SET LOCAL app.current_tenant_id` por transacción (pooling-safe), como **gate duro previo al 2º tenant**, compuesto con el provisioning (ADR-019). Es además la palanca de performance del check ADR-023 (enciende los índices multi-tenant).

---

## 8. Restricciones de plataforma (marco de escalado)

Restricciones de diseño, no solo operativas: acotan qué se recomienda y hasta dónde llega el piloto.

- **Neon en PLAN GRATUITO.** Techo del piloto (1 a pocos tenants), no la plataforma de escala.
  - **El storage (~0.5 GB) es el primer techo** —antes que compute o conexiones—: tablas append-only (`AuditLog`, `Payment`) crecen monótono. Vigilar el % de storage es métrica de gate a plan pago (ADR-023 F8).
  - Compute chico + autosuspend: la latencia percibida suele ser el **cold start**, no el SQL. Conexiones limitadas: el **pooler es obligatorio** y `connection_limit` va **bajo**.
  - **No correr queries pesadas, benchmarks ni escaneos contra la DB de producción.** El análisis se hace **leyendo `prisma/schema.prisma` y `prisma/migrations/`** (estático), no golpeando la base real.
- **Nada de deploy a producción / Netlify sin OK explícito.** Auto-publish apagado (`stop_builds`): el push a `main` (GitHub) es el destino por defecto y **no** publica ni gasta créditos. Publicar es decisión explícita de negocio (`docs/METODO-ROLES.md`).
- **Demos a costo 0, en local.** Mostrar algo funcionando se hace con build/preview local, no desplegando a prod.

**Corolario:** el trabajo de performance en esta etapa **no** busca aguantar escala en Neon free —no da—, sino quedar **scale-ready a costo cero** para el día de migrar a plan pago / RDS (ADR-005, ADR-007, ADR-023).

---

## 9. Criterio rector de decisión

1. **Simple-y-correcto-ahora por sobre elegante-y-especulativo-para-una-escala-que-no-existe** (ADR-006). Gana el camino más simple que sea correcto hoy, con la salida documentada para cuando la escala real lo exija.
2. **Todo tenant nuevo se modela dentro del multi-tenant** (§1/§3), nunca como app separada. Se agota Blueprint + config + Plugin antes de pensar en algo aparte.
3. **La promesa se cumple acomodando, no desarrollando a medida** (§2). Reusable por otros tenants → producto; exclusivo de uno → proyecto aparte, cotizado y aislado.
4. **Cada rubro cae en un arquetipo; lo que no encaja va al genérico** (§4). No se crea Blueprint por cliente.
5. **La personalización es de producto, no de discurso** (§5): descubrimiento, branding, blueprint de rubro y configurador son features, no promesas de venta.
6. **El aislamiento entre tenants no se negocia** (§3).
7. **Cada decisión estructural termina en un ADR**; cada tenant pasa por el provisioning de ADR-019; cada integración transversal entra por el contrato de Plugin de ADR-020.
8. **El costo manda sobre la velocidad** mientras la plataforma esté en free plan (§8).

---

## 10. Filosofía GROW-AR — un Core, dos motores, crecé sin migrar (ADR-058)

Síntesis vigente que **mezcla** esta visión con lo mejor de SAP (GROW / Fiori / Public Cloud) y con el
modelo de dos perfiles que construimos. **No reemplaza nada de §1–§9: los extiende.** Detalle y el porqué
en **ADR-058**.

> **Una línea:** *un solo Core, dos motores (comerciante ↔ empresa), y **crecés sin migrar**: el mismo
> tenant, el mismo proceso, se enciende más profundo a medida que tu negocio crece — lo mejor de SAP,
> argentinizado.*

Cinco principios (cada uno mezcla una capa):

1. **Activar, no programar** (SAP Public Cloud → nuestra fundación de módulos, ADR-054): el valor se
   entrega **encendiendo** capacidades de mejor práctica que ya existen en el Core, no desarrollando a
   medida. Refuerza el guardrail anti-consultora de §2.
2. **Dos motores sobre un mismo proceso** (lo que construimos): cada proceso es **un `ScopeItem` con
   perfiles `lite` (comerciante) y `enterprise` (empresa)**. El perfil es **ortogonal al rubro** (Blueprint,
   §4) y al aislamiento (§3). No son dos productos ni dos códigos.
3. **Crecé sin migrar** (la promesa nueva, invariante duro): **`enterprise ⊇ lite`** — subir de perfil es
   **aditivo** (se encienden pasos/campos/controles, nunca se reescribe ni se migra de sistema). El que
   crece **no cambia de ERP**: crece dentro del mismo tenant. Es la forma sana de cumplir la promesa de §2.
4. **Argentinizado y humano donde corresponde** (Fiori + ADR-044/046): rigor y diseño Fiori, pero en
   criollo claro, fiscal ARCA, Mercado Pago/transferencia, WhatsApp-first; humano en venta/atención,
   estándar y preciso en código/fiscal/cálculos.
5. **Personalización ASIMÉTRICA por perfil** (§5 + ADR-034 + ADR-058 P5): **micro `lite` → máxima
   personalización vía preset-IA** (cada negocio se siente suyo; la personalización vende el self-serve y
   hace el alta auto-servible, condición de costo a escala). **Pyme `enterprise` → se estandariza, menos
   personalización, para dar CARÁCTER** (producto opinado y consistente → baja mano de obra por cliente,
   refuerza el anti-rechazo enterprise, da identidad de marca). *Al comerciante lo enamoramos haciéndolo
   sentir único; a la empresa la convencemos con un estándar de carácter fuerte.*

> **Estado real:** hoy existe la **fundación de módulos** (ADR-054/055, `src/modules/`). El **motor de
> perfiles `ScopeItem.{lite,enterprise}`** es **fundamento documentado, no construido** — reingeniería
> posterior con su Gate (definir ≠ construir). Esta §10 fija el marco; no describe código ya escrito.

---

## 11. Checklist de encuadre para abrir cualquier sesión

- [ ] ¿Esto se resuelve como **tenant + Blueprint/config/Plugin** del Core, o estoy por duplicar código / armar una app aparte? (Lo segundo → parar.)
- [ ] Si es un pedido de "solucionar algo raro de un cliente: ¿es **reusable por otros** (producto) o **exclusivo de uno** (proyecto aparte, §2)?
- [ ] ¿El rubro **cae en un arquetipo** (§4)? Si no, ¿va al **genérico**?
- [ ] ¿El proceso se piensa como **un `ScopeItem` con perfiles lite/enterprise** (§10, ADR-058), respetando **`enterprise ⊇ lite`** (aditivo, "crecé sin migrar")? ¿No estoy armando dos productos para el mismo proceso?
- [ ] ¿Refuerza la **experiencia hiper-personalizada** (§5) o la degrada (pantallas vacías, genérico sin branding)?
- [ ] ¿Preserva el **aislamiento por tenant** (`tenantId` en cada tabla y query; compatible con RLS de ADR-018)?
- [ ] ¿Respeta las **restricciones de free plan** (§8) y elige la opción **simple-y-correcta-hoy**?
- [ ] Si es decisión estructural, ¿queda como **ADR + fila en INDEX**?

---

## Referencias

`docs/adr/INDEX.md` · ADR-001 (multi-tenant) · ADR-002 (Core/Blueprint/Plugin) · ADR-003 (business capabilities) · ADR-005 (stack) · ADR-006 (simple-y-correcto) · ADR-007 (financiero) · ADR-008 (tablero) · ADR-010 (convergencia piloto→plataforma) · ADR-015 (tenant fail-closed) · ADR-018 (RLS) · ADR-019 (provisioning) · ADR-020 (contrato de API / Plugins) · ADR-022 (Plugin ARCA) · ADR-023 (performance multi-tenant) · Código: `src/blueprints/` (registry + `types.ts`) · `scripts/provision-tenant.ts` · `docs/TABLERO-SESIONES.md` · `docs/METODO-ROLES.md`
