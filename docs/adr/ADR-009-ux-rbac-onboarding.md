---
id: ADR-009
nivel: evolutiva
dominio: [Producto, UX]
depends_on: [ADR-002, ADR-003, ADR-006]
---
# ADR-009: Experiencia de Usuario, UI Metadata-Driven, Permisos y Onboarding

**Estado:** Propuesto
**Depende de:** ADR-002 (metadata/extensión), ADR-003 (capabilities piloto), ADR-006 (Metadata Engine)
**Origen:** revisión crítica de ADRs 001-008 — la dimensión UX estaba ausente por completo.

---

## 1. Principio rector de UX

**El usuario del piloto no es un "usuario de ERP".** Es la recepcionista o el dueño de una estética: sin capacitación formal en sistemas, frecuentemente desde el celular, cargando un turno mientras atiende el teléfono. Regla de diseño derivada:

> **Cada pantalla de la Fase 1 se diseña para la tarea más frecuente del rol menos técnico, no para la completitud del modelo de datos.**

Consecuencias concretas:
- **La agenda es el home**, no un dashboard de KPIs. El 90% de las interacciones diarias son: ver la agenda de hoy, crear un turno, cobrarlo. Esas tres acciones no pueden estar a más de 2 taps/clicks.
- **Crear un turno completo en menos de 30 segundos** es el benchmark de la Fase 1. Cliente por autocompletado (con alta rápida inline si no existe — nunca "andá primero a la pantalla de clientes"), servicio, profesional, horario, listo.
- **Mobile-first para operación, desktop para administración.** La agenda, el alta de turno y el cobro tienen que ser excelentes en un celular. La configuración (servicios, precios, reportes) puede asumir pantalla grande.
- El modelo de datos completo (Party, Orden, extensiones) queda **debajo** de la superficie: la recepcionista ve "Clientes" y "Turnos", jamás ve la palabra "Party" ni un JSONB.

## 2. UI Metadata-Driven (cierre de un agujero de ADR-006)

El Metadata Engine definía campos de extensión a nivel de datos, pero no cómo se renderizan. Sin esto, un campo agregado por Blueprint existe en la base y es invisible en pantalla — el mecanismo de extensión quedaba inutilizable en la práctica.

**Extensión del schema de `metadata_field_definition`:** además de tipo y validación, cada campo declara:

| Atributo de UI | Ejemplo |
|---|---|
| `label` / `help_text` | "Duración (minutos)" / "Tiempo que bloquea en la agenda" |
| `input_type` | number, select, toggle, fecha, texto |
| `display_order` y `group` | agrupa campos en secciones del formulario |
| `visibility` | visible / oculto / solo-lectura, por rol |
| `required_ui` | requerido en el formulario (independiente de la validación de datos) |

El frontend incluye **un solo componente `DynamicForm`** que recibe la metadata de la entidad y renderiza el formulario completo (campos estándar + extensiones) sin código específico por Blueprint. Esto es lo que hace que un Blueprint nuevo sea *realmente* solo configuración también en la pantalla, no solo en la base — sin esto, ADR-002 era verdad a medias.

**Límite deliberado:** el DynamicForm resuelve formularios de configuración y entidades. Las pantallas de alta frecuencia (la agenda, el flujo de cobro) **se diseñan a mano** — son el corazón de la experiencia y no se sacrifican a la genericidad. Metadata-driven para lo administrable, artesanal para lo que se usa 50 veces por día.

## 3. RBAC — permisos dentro del tenant (agujero de "Security by Design")

ADR-001 resolvió aislamiento *entre* tenants; faltaba el aislamiento *dentro* del tenant.

**Modelo: RBAC simple con roles predefinidos por Blueprint. No construir un editor de permisos granular custom en Fase 1** — es un clásico pozo de tiempo, y los negocios chicos no lo usan: quieren roles con nombres que entienden.

Roles del Blueprint "Servicios":

| Rol | Puede |
|---|---|
| **Dueño/Admin** | Todo, incluida configuración, precios, reportes financieros y gestión de usuarios. |
| **Recepción** | Agenda completa, alta de clientes, cobrar, emitir comprobante. NO ve reportes financieros ni configura precios. |
| **Profesional** | Solo su propia agenda (lectura + marcar completado/no-show). Vinculado al Party correspondiente (relación 0..1 de ADR-003). |

Implementación: permisos como claims en el JWT (junto al `tenant_id` de ADR-005), verificación en la capa de comandos del Core (no solo en el frontend — ocultar un botón no es seguridad). Los roles se definen como parte del Blueprint (configuración, coherente con ADR-002); la granularidad custom por tenant queda para cuando un cliente Mid-Market la pida y la pague.

## 4. Audit Trail (obligatorio para un sistema con datos fiscales)

Toda mutación sobre entidades de negocio registra: quién (user_id), cuándo, qué entidad, qué cambió (diff antes/después), desde dónde (canal/IP).

- Implementación de bajo costo: tabla `audit_log` append-only poblada desde la misma capa de comandos del Core que ya centraliza las mutaciones (ADR-002) — un solo punto de intercepción, no triggers dispersos por tabla.
- Con `tenant_id` + RLS como todo lo demás.
- **No es feature de Fase 3: es Fase 1.** Retrofitear auditoría después de tener datos productivos deja un agujero histórico permanente, y en disputas del mundo real ("yo nunca cancelé ese turno", "ese precio no lo cambié yo") es lo que salva la relación con el cliente.

## 5. Onboarding / Alta de tenant (la primera experiencia ES el producto)

El flujo de provisioning estaba relegado a "próximos pasos" — error: para un SaaS self-service es la pantalla donde se gana o pierde cada cliente nuevo.

**Flujo objetivo (Fase 1 puede ser semi-manual, pero se diseña ya para self-service):**

1. Registro → crea tenant + usuario Admin (transaccional: o se crea todo o nada).
2. **Wizard de 4 pasos, máximo 10 minutos:** datos del negocio → servicios que ofrece (con catálogo sugerido por Blueprint: "Corte", "Color", "Manicura" precargados como plantilla editable — nunca una pantalla vacía) → profesionales y horarios de atención → listo, agenda funcionando.
3. **Importación de datos existentes:** nadie arranca de cero — todo negocio tiene su lista de clientes en un Excel o en el teléfono. Importador CSV/Excel simple (nombre, teléfono, email) con vista previa y tolerancia a datos sucios. Sin esto, la migración desde "el cuaderno o la planilla" se convierte en carga manual de 300 clientes, y ahí se abandona el producto.
4. **Datos demo opcionales:** poblar la agenda con turnos de ejemplo borrables, para que la primera impresión sea un sistema vivo y no una pantalla vacía. Los estados vacíos ("todavía no tenés turnos") siempre incluyen la acción para resolverlos, nunca solo el mensaje.

## 6. Métrica de éxito UX del piloto

No es "cuántas features tiene": es **(a)** tiempo desde registro hasta primer turno real cargado < 15 minutos sin ayuda, y **(b)** la recepcionista elige usar el sistema en vez del cuaderno a la segunda semana. Si (b) falla, ninguna decisión de los ADRs 001-008 importa.

---

## Enmienda 2026-07-05 — Retención de `AuditLog` (ADR-023 F8)

El audit trail (§4, `src/lib/audit.ts`) es **append-only**: cada mutación agrega una fila y
nada la borra. La versión original de este ADR no fijó **retención**, y la auditoría ADR-023
(F8) lo marcó como el candidato #1 a agotar los ~0.5 GB del plan free de Neon — con el
agravante de que **cuando el storage se llena se cae la escritura** (deja de ser un problema
de auditoría y pasa a ser de disponibilidad).

**Decisión:** el `AuditLog` tiene una **ventana de retención de ~12–18 meses** (default **18**,
holgado para comparaciones interanuales y auditorías tardías; `AUDIT_RETENTION_MONTHS` en
`src/lib/audit-retention.ts`). La purga (`purgeAuditLogs`) borra lo anterior al corte,
platform-wide, idempotente, aprovechando `@@index([tenantId, createdAt])` (sin migración). Se
opera con `npm run purge-audit` (**default dry-run**; borra real solo con `--apply`) — **no** se
dispara desde el runtime. El día que el storage sea la restricción real (gate a plan pago,
ADR-007), se acorta la ventana. La activación (cron o corrida manual periódica) queda como
tarea operativa; el mecanismo ya está listo.
