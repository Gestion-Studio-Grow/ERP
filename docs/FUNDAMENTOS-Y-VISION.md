# Fundamentos y visión — estetica-erp

**Qué es este documento:** el criterio rector del producto. Fija la visión y las reglas de encuadre que **toda sesión** (feature, arquitectura, negocio, consolidación, seguridad) debe respetar para decidir alineada, sin re-litigar lo mismo en cada thread. Los ADR deciden el *cómo* de cada tema puntual; este doc fija el *marco* dentro del cual esos ADR son válidos. Si una decisión de sesión choca con esto, gana esto (o se cambia esto explícitamente, con su justificación).

> **Regla de una línea:** un solo sistema multi-tenant. Cada cliente es un **tenant** del mismo Core, nunca un fork ni una app aparte.

---

## 1. Visión del producto

estetica-erp es un **ERP SaaS multi-tenant estilo SAP Public Cloud**:

- **Un CORE único y compartido** por todos los clientes, más **configuración y extensión por tenant**. No hay una copia del código por cliente.
- **Cada cliente = un TENANT** del mismo sistema, aislado por datos (`tenantId` + RLS, ADR-001 / ADR-018), no por despliegue.
- Los **verticales de negocio** (estética, carnicería, etc.) se resuelven por **Blueprint / configuración / plugins sobre el Core** (ADR-002), **no** duplicando código ni levantando un sistema distinto por rubro.

El nombre "estetica-erp" es histórico (el piloto fue un spa); el producto es una **plataforma ERP multi-tenant genérica**, y el spa "CH Estética" es simplemente su primer tenant (ADR-010, Camino A: el piloto Next.js **evoluciona** hacia la plataforma, no se reescribe).

**Por qué así (SAP Public Cloud, no fork por cliente):** un fork por cliente multiplica el costo de mantenimiento por la cantidad de clientes —cada fix hay que portarlo N veces— y hace imposible la economía de un SaaS. Un Core compartido paga una vez cada mejora y la reciben todos los tenants. Es la única forma de que el negocio escale sin que el mantenimiento lo coma.

---

## 2. Modelo de tenants

- **Un tenant nuevo se modela SIEMPRE dentro del multi-tenant existente**, no como aplicación separada. La pregunta por defecto ante un cliente nuevo no es "¿qué app le armo?" sino "¿qué Blueprint/config/plugins de la plataforma lo cubren?".
- **`magra`** (carnicería premium, Canning) es la prueba de fuego de esta visión: es un **tenant** del mismo ERP con un Blueprint de rubro distinto (retail/carnicería en vez de servicios/turnos), **no** un producto aparte. Lo que difiere entre estética y carnicería (catálogo, unidades, flujo de venta) es **configuración y capabilities**, no código base duplicado.
  - *Estado hoy:* `magra` y `estetica-erp` viven como repos separados. La visión es **converger** `magra` a tenant de esta plataforma, con el mismo criterio con que ADR-010 convergió el piloto de spa. Mientras la convergencia no ocurra, es deuda conocida, no un modelo alternativo aprobado.
- **El aislamiento entre tenants es la línea roja de seguridad y de diseño:** ningún dato, query o pantalla cruza tenants. El backstop es RLS de Postgres (ADR-018); hasta activarlo, el aislamiento es a nivel aplicación con resolución de tenant fail-closed (ADR-015).

---

## 3. Plugins

- Las **integraciones externas son Plugins** bajo la plataforma Core/Blueprint/Plugin (ADR-002): se comunican con el Core por **eventos asíncronos (outbox pattern)** y **comandos públicos**, nunca tocando la base del Core directo.
- **`arca`** (facturación impositiva ARCA/AFIP) es el **primer Plugin** del ERP (ADR-002 / ADR-020): el Core emite `InvoiceCreated`, el Plugin ARCA obtiene el CAE y responde con el comando público `RegisterFiscalDocument(...)`. El *cálculo* de impuestos vive en el Core (es lógica de negocio); el Plugin se ocupa **solo** de la autorización fiscal externa (ADR-006, Tax Engine).
- **Doble naturaleza aceptada:** `arca` puede venderse **standalone** además de operar como Plugin del ERP. Eso no lo saca del modelo: standalone es un empaquetado comercial del mismo componente; integrado, entra por el contrato de Plugin de ADR-020. No se bifurca en dos códigos.

---

## 4. Metodología de estructura

- **Core / Blueprint / Plugin** (ADR-002) es la arquitectura de plataforma. Blueprint = configuración pura, cero schema propio. Plugin = evento/comando, cero acceso directo a datos del Core.
- **ADR-driven** (ADR-008): toda decisión estructural se persiste como ADR en `docs/adr/`, con `INDEX.md` como punto de entrada. Ninguna decisión importante vive solo en un chat.
- **Tablero de sesiones** (`docs/TABLERO-SESIONES.md`): un thread = un tema, arrancado con su comando `/sesion-*`. Si una sesión deriva a otro tipo, se anota y se abre la sesión correcta; no se resuelve fuera de lugar.
- **Provisioning por tenant** (ADR-019): el alta de un tenant es un **script operado, idempotente por `slug`, transaccional** (`scripts/provision-tenant.ts`) que siembra tenant + OWNER + catálogo mínimo editable. Portal self-service / panel super-admin / importador CSV están **diferidos** hasta que la frecuencia de altas los justifique.
- **Aislamiento / RLS** (ADR-018): RLS por `tenant_id` con `SET LOCAL app.current_tenant_id` por transacción (pooling-safe), como **gate duro previo al 2º tenant**. El alta del 2º tenant es un gate compuesto con el provisioning (ADR-019): son el mismo trabajo.

---

## 5. Restricciones de plataforma (marco de escalado)

Estas restricciones son de diseño, no solo operativas: acotan qué se puede recomendar y hasta dónde llega el piloto.

- **Neon en PLAN GRATUITO.** Es el techo del piloto (1 a pocos tenants), no la plataforma de escala.
  - **El storage (~0.5 GB) es el primer techo que se toca** —antes que compute o conexiones—, porque tablas append-only como `AuditLog` y `Payment` crecen monótono. Vigilar el % de storage es una métrica de gate a plan pago.
  - Compute chico + autosuspend (scale-to-zero): la latencia percibida suele ser el **cold start**, no el SQL. Conexiones limitadas: el **pooler es obligatorio** y `connection_limit` va **bajo**.
  - **No correr queries pesadas, benchmarks ni escaneos contra la DB de producción.** El análisis de performance se hace **leyendo `prisma/schema.prisma` y `prisma/migrations/` del repo** (estático), no golpeando la base real.
- **Nada de deploy a producción / Netlify sin OK explícito.** El auto-publish de Netlify está apagado (`stop_builds`): el push a `main` (GitHub) es el destino por defecto del trabajo y **no** publica ni gasta créditos. Publicar es decisión explícita de negocio (ver `docs/METODO-ROLES.md`).
- **Demos a costo 0, en local.** Mostrar algo funcionando se hace con build/preview local, no desplegando a prod.

**Corolario de arquitectura:** el objetivo del trabajo de performance/escala en esta etapa **no** es "aguantar escala en Neon free" —no da—, es quedar **scale-ready a costo cero**: que el día de migrar a Neon pago / RDS (ADR-005, ADR-007), encender RLS haga rendir los índices que ya existen, los reportes ya agreguen en la DB, y no haya deuda de correctitud arrastrada. Se **prepara** el terreno; no se escala sobre el free plan.

---

## 6. Criterio rector de decisión

1. **Simple-y-correcto-ahora por sobre elegante-y-especulativo-para-una-escala-que-no-existe** (ADR-006, precedente: 4 de 8 motores diferidos). Ante dos caminos, gana el más simple que sea correcto hoy, dejando el camino de escape documentado para cuando la escala real lo exija.
2. **Todo tenant nuevo se modela dentro del multi-tenant**, nunca como app separada (§2). Si algo parece necesitar un sistema aparte, primero se agota Blueprint + config + Plugin.
3. **El aislamiento entre tenants no se negocia** (§2). Cualquier feature que pueda filtrar datos cross-tenant se frena hasta resolver el aislamiento.
4. **Cada decisión estructural termina en un ADR**; cada tenant nuevo pasa por el provisioning de ADR-019; cada integración externa entra por el contrato de Plugin de ADR-020.
5. **El costo manda sobre la velocidad** mientras la plataforma esté en free plan (§5): se minimizan deploys, consumo de compute y conexiones.

---

## 7. Checklist de encuadre para abrir cualquier sesión

Antes de decidir/implementar, verificar que el trabajo no viole el marco:

- [ ] ¿Esto se resuelve como **tenant + Blueprint/config/Plugin** del Core, o estoy por duplicar código / armar una app aparte? (Si es lo segundo → parar, replantear.)
- [ ] ¿Preserva el **aislamiento por tenant** (`tenantId` en cada tabla y query; compatible con RLS de ADR-018)?
- [ ] ¿Elijo la opción **simple-y-correcta-hoy** o me estoy yendo a resolver una escala inexistente?
- [ ] ¿Respeta las **restricciones de free plan** (sin queries pesadas a prod, sin deploy sin OK, cuidando storage/compute)?
- [ ] Si es decisión estructural, ¿queda como **ADR + fila en INDEX**?

---

## Referencias

`docs/adr/INDEX.md` (índice) · ADR-001 (multi-tenant) · ADR-002 (Core/Blueprint/Plugin) · ADR-003 (business capabilities) · ADR-005 (stack) · ADR-006 (motores / simple-y-correcto) · ADR-007 (análisis financiero) · ADR-008 (tablero / ADR-driven) · ADR-010 (convergencia piloto→plataforma, Camino A) · ADR-015 (resolución de tenant fail-closed) · ADR-018 (activación RLS) · ADR-019 (provisioning) · ADR-020 (contrato de API pública / Plugins) · ADR-021 (consola super-admin) · `docs/TABLERO-SESIONES.md` · `docs/METODO-ROLES.md`
