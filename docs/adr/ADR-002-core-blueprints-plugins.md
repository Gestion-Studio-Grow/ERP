---
id: ADR-002
nivel: fundacional
dominio: [Arquitectura]
depends_on: [ADR-001]
---
# ADR-002: Estructura Core / Business Capabilities / Blueprints / Plugins

**Estado:** Propuesto
**Fecha:** 2026-07-01
**Depende de:** ADR-001 (multi-tenant: shared schema + tenant_id + RLS)

---

## 1. Problema a resolver
Definir cómo se relacionan cuatro conceptos sin que el sistema termine forkeado en versiones distintas por vertical:
- **Core:** lo que es común a cualquier ERP (Party, Producto, Stock, Orden, Factura, Pago, Ledger, Usuario/Auth).
- **Business Capabilities:** módulos de negocio opcionales (Scheduling/Turnos, POS, Manufactura, etc.).
- **Blueprints:** paquetes de configuración por vertical (ej. "Servicios").
- **Plugins:** integraciones externas (ARCA, Mercado Pago, WhatsApp).

La pregunta crítica que resolvés vos hoy: **¿dónde vive el schema nuevo cuando un vertical necesita algo que el Core no tiene?**

## 2. Decisión sobre Plugins ↔ Core (ya tomada por vos): eventos asíncronos

Plugins **nunca** acceden directo a la base ni al código del Core. Se comunican en dos direcciones:

- **Core → Plugin:** Core publica eventos de dominio (`InvoiceCreated`, `PaymentReceived`) en una tabla **outbox**, dentro de la misma transacción que la operación de negocio. Un worker de background lee esa tabla y los despacha al event bus. Esto es obligatorio — sin outbox, si el proceso muere entre "guardar la factura" y "publicar el evento", el Plugin de ARCA nunca se entera de que existe esa factura y quedás con estado inconsistente sin posibilidad de detectarlo.
- **Plugin → Core:** el Plugin nunca escribe directo. Llama a un **comando público del Core** (ej. `RegisterFiscalDocument(invoiceId, cae, vencimientoCae)`), que es la única puerta de entrada para que un resultado externo (el CAE que devuelve ARCA) impacte el dominio.

**Infraestructura recomendada para esta etapa (1-100 clientes):** no vayas a Kafka. Es sobre-ingeniería del mismo tipo que evitamos en ADR-001. Con Postgres + un job runner liviano (pg-boss o graphile-worker) el patrón outbox + worker anda perfecto y no suma un componente de infraestructura nuevo para operar. Kafka o Redis Streams entran en el radar recién cuando el volumen de eventos por segundo empiece a doler — no antes.

## 3. Decisión sobre Blueprints: ¿entidades propias o solo configuración?

**Recomendación: Blueprints NO definen entidades propias. Solo activan, configuran y parametrizan Business Capabilities que viven en el Core.**

Esto es lo que vos ya conocés de SAP, aunque con otro nombre: un **Scope Item de SAP Best Practices no crea tablas nuevas** — activa una combinación de objetos estándar (BSEG, VBAK, etc.) con configuración específica (parametrización de tipos de documento, workflows, campos visibles). El Scope Item es 100% configuración, cero schema propio. Es exactamente el mismo principio que te recomiendo acá.

### Por qué NO conviene que el Blueprint tenga su propio schema:

1. **Evita duplicación entre verticales.** Si "Servicios" (estética/spa/gimnasio) define su propia tabla de "Turno" y mañana un Blueprint de "Consultorios Médicos" necesita algo 90% igual, terminás con dos tablas casi idénticas mantenidas por separado. Eso *es* un fork, aunque no lo llames así.
2. **El versionado se vuelve manejable.** Si el schema vive en Business Capabilities (que son parte del Core, versionadas centralmente), un cambio de modelo se testea una vez y sirve para todos los Blueprints que usan esa capability. Si viviera en cada Blueprint, cada uno evoluciona a su ritmo y se desincroniza.
3. **Multi-tenant se simplifica.** Como en ADR-001 dijimos que `tenant_id` vive en cada tabla del Core, si el schema nuevo lo mete un Blueprint por afuera, tenés que replicar toda la disciplina de RLS y tenant_id fuera del camino controlado.

### Entonces, ¿cómo maneja un Blueprint algo que el Core no tiene?

Dos mecanismos, en este orden de preferencia:

| Mecanismo | Cuándo usarlo | Ejemplo |
|---|---|---|
| **A. Campos de extensión (metadata-driven, JSONB validado por schema)** sobre una entidad del Core existente | Cuando lo que falta es *dato adicional* sobre algo que ya existe | "Servicios" necesita que un Producto tenga `duracion_minutos` y `requiere_profesional` → se agregan como campos de extensión sobre la entidad Producto del Core, no una tabla nueva. |
| **B. Nueva Business Capability** (con su propio schema, pero versionada y compartida en el Core, no en el Blueprint) | Cuando el concepto es genuinamente nuevo y reutilizable entre varios Blueprints | "Turno/Cita" no existe en un ERP genérico → se crea la capability **Scheduling**, que vive en el Core como módulo opcional. El Blueprint "Servicios" simplemente la activa y la configura (duración default, recursos = profesionales, reglas de superposición). Mañana el Blueprint "Consultorios" activa la misma capability con otra configuración. |

La regla práctica para vos: **si al diseñar "Servicios" pensás "necesito una tabla nueva", la pregunta correcta no es "¿la meto en el Blueprint?" sino "¿esto es una Business Capability nueva del Core, o un campo de extensión sobre algo que ya existe?"** El Blueprint nunca es la respuesta a esa pregunta — es solo el que decide *qué capabilities prender* y *cómo configurarlas* para ese vertical.

## 4. Arquitectura resultante (capas)

```
┌─────────────────────────────────────────────┐
│                  PLUGINS                     │  ← ARCA, MP, WhatsApp, Shopify...
│   (solo consumen eventos / llaman comandos)  │
└───────────────────▲───────────────┬──────────┘
                     │ eventos       │ comandos
                     │ (outbox)      │ (API pública)
┌───────────────────┴───────────────▼──────────┐
│                    CORE                       │
│  ┌──────────────────────────────────────┐    │
│  │ Business Capabilities (DDD, modular)  │    │
│  │  Party · Producto · Stock · Orden ·   │    │
│  │  Factura · Pago · Ledger · Scheduling │    │
│  │  (cada una: entidades + reglas propias)│    │
│  └──────────────────────────────────────┘    │
│  Metadata Engine · Feature Flags · tenant_id  │
│  + RLS (ADR-001)                              │
└───────────────────▲───────────────────────────┘
                     │ activa/configura (sin schema propio)
┌───────────────────┴───────────────────────────┐
│                 BLUEPRINTS                     │
│   "Servicios": activa Scheduling + POS +       │
│   Factura simple, define workflows y           │
│   defaults, agrega campos de extensión         │
└─────────────────────────────────────────────────┘
```

## 5. Riesgos si no se respeta esta separación
- Si permitís que un Blueprint meta tablas propias "para ir rápido" en el piloto, ese atajo se vuelve permanente — nadie vuelve después a refactorizarlo hacia una Capability compartida. Es la forma más común en que un "no quiero forks" termina en forks igual.
- Los campos de extensión (mecanismo A) tienen que tener un límite claro: si una entidad acumula 15 campos de extensión que en realidad son un sub-dominio completo con su propia lógica, es señal de que en verdad necesitás el mecanismo B (Capability nueva), no seguir apilando JSONB.

## 6. Impacto a 5-10 años
Con esta separación, agregar un tercer, cuarto o décimo Blueprint (Consultorios, Gimnasios, Talleres) es trabajo de **configuración**, no de desarrollo de schema nuevo cada vez — que es exactamente la propiedad que buscás para no forkear la plataforma.
