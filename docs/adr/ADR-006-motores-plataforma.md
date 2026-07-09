---
id: ADR-006
nivel: evolutiva
dominio: [Arquitectura, IA]
depends_on: [ADR-002, ADR-005]
---
# ADR-006: Motores de Plataforma (Metadata, Workflow, Rules, Tax, Integration, AI, Feature Flags, Marketplace)

**Depende de:** ADR-002 (Core/Blueprint/Plugin), ADR-005 (stack)

Evaluación de la lista original: es la estructura correcta, pero **no todos los motores se construyen ahora**. Construir los ocho desde el día 1 es la forma más segura de no terminar nunca el piloto. Prioridad real:

| Motor | Estado en el MVP | Diseño |
|---|---|---|
| **Metadata Engine** | **Construir ahora** — es lo que habilita el mecanismo A de ADR-002 (campos de extensión). | Tabla `metadata_field_definition` (tenant_id, entidad, field_key, tipo, validación JSON Schema) + columna `extension_data JSONB` en las entidades del Core. Validación en la app con `ajv` antes de persistir. |
| **Workflow Engine** | **Construir versión mínima ahora** — los estados de Turno/Orden/Factura ya lo necesitan. | Máquina de estados por entidad, definida como configuración (estados + transiciones + guards), no si-hardcodeados desatados por todo el código. No hace falta un motor genérico de BPMN — con una libería liviana tipo XState en el backend alcanza. |
| **Rules Engine** | **Diferir a versión de parámetros simples.** Un motor de reglas genérico (tipo JSON Logic evaluado dinámicamente) es sobre-ingeniería para el piloto. | Reglas como configuración plana por tenant (ej. `cancelacion_horas_previas: 24`, `descuento_maximo_pct: 20`). Solo si en Fase 2-3 aparece un patrón real de reglas condicionales complejas y variadas, se sube de nivel a un evaluador genérico. |
| **Tax Engine** | **Construir en Fase 2**, como extensión del Rules Engine, no como motor aparte. | Tablas de alícuotas de IVA configurables + reglas por jurisdicción (Convenio Multilateral). El Plugin ARCA se ocupa *solo* de la autorización fiscal (CAE), no del cálculo de impuestos — el cálculo vive en el Core porque es lógica de negocio, no integración externa. |
| **Integration Engine** | **Ya está definido** — es la formalización del patrón Plugin de ADR-002. | Cada Plugin declara un manifiesto: eventos que consume, comandos que expone, schema de configuración. Registro central de manifiestos en el Core. |
| **AI Engine** | **Capa delgada, detrás de feature flag, con control de costo por tenant desde el día 1.** | Wrapper interno sobre la API de Claude, usado puntualmente (ej. asistencia en carga de catálogo, futura búsqueda en lenguaje natural). No se invierte en esto hasta que el piloto esté validado — es la parte más fácil de sobre-invertir sin retorno inmediato. |
| **Feature Flags** | **Construir ahora, versión simple.** | Tabla `feature_flag` (tenant_id, flag_key, enabled, config JSONB). Nada de LaunchDarkly ni similar — a este volumen de tenants es gasto sin necesidad. |
| **Marketplace** | **Diferir por completo.** | No tiene sentido hasta que existan terceros desarrollando Plugins — hoy los Plugins los construye el equipo. Construir un Marketplace ahora es la definición de deuda técnica por anticipación: infraestructura para un caso de uso que no existe todavía. |

## Regla general de este ADR
De los 8 motores de la visión original, **4 se construyen para el piloto** (Metadata, Workflow básico, Feature Flags, Integration/Plugin) y **4 se difieren o se simplifican** (Rules como config plana, Tax como extensión del anterior, AI como capa delgada, Marketplace directamente afuera). Esto no es resignar la visión — es secuenciarla para que el piloto exista antes de que se termine el presupuesto.
