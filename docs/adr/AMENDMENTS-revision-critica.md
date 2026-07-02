# AMENDMENTS — Revisión crítica de ADRs 001-008

Correcciones y agregados puntuales. No reemplazan los ADRs originales; se leen junto con ellos.

## ADR-001 (Multi-tenant)
- **Agregar procedimiento de restore por tenant.** El ADR menciona que el restore selectivo "es más laborioso" pero no lo resuelve. Definir desde el día 1: backups lógicos periódicos + script probado de export/import filtrado por `tenant_id` (`COPY ... WHERE tenant_id = X`). Un backup que nunca se probó restaurar no es un backup. Probar el restore de un tenant individual **antes** de tener el segundo cliente productivo.
- **Soft-delete por defecto en entidades de negocio** (`deleted_at`), no DELETE físico: necesario para el audit trail (ADR-009) y para el derecho a arrepentimiento del cliente ("borré un servicio por error").

## ADR-002 (Core/Blueprint/Plugin)
- **Versionado y compatibilidad de eventos:** el contrato de cada evento del outbox (`InvoiceCreated`, etc.) lleva versión explícita en el payload (`schema_version`). Regla: los cambios a eventos publicados son solo aditivos (agregar campos opcionales); un cambio breaking = evento nuevo con otro nombre/versión, conviviendo con el viejo hasta migrar consumidores. Sin esto, el primer cambio de contrato rompe silenciosamente los Plugins.
- **Idempotencia obligatoria en consumidores:** todo Plugin debe tolerar recibir el mismo evento dos veces (el outbox garantiza *at-least-once*, no *exactly-once*). Cada evento lleva `event_id` único; el consumidor registra los procesados.

## ADR-003 (Capabilities del piloto)
- Al Turno le faltó un dato operativo con impacto directo en UX: **notas libres** (la recepcionista SIEMPRE anota "quiere el mismo tono de la vez pasada") y **precio pactado al momento de la reserva** (el precio del servicio puede cambiar entre la reserva y el cobro; congelar el precio en el turno evita la discusión con el cliente).

## ADR-004 (Scheduling)
- **Horarios de atención y ausencias del profesional** quedaron fuera del modelo: el constraint evita superposiciones pero no impide reservar a las 3 AM o cuando el profesional está de vacaciones. Agregar `horario_atencion` (por profesional, por día de semana) y `bloqueo_agenda` (vacaciones, feriados, franco). El bloqueo se modela como un registro más en la misma estructura de rangos — el mismo `EXCLUDE` lo hace incompatible con turnos, gratis.
- **Zona horaria:** definir ya que todo se persiste en UTC (`TSTZRANGE` ya lo hace) y la zona del tenant es configuración del tenant, no del servidor. Argentina es una sola zona hoy, pero hardcodearla es el tipo de deuda que duele si aparece un cliente uruguayo o cambia la normativa horaria.

## ADR-005 (Stack)
- Al auth custom le faltan dos mínimos no negociables para un sistema con datos fiscales: **MFA opcional (TOTP)** al menos para el rol Admin, y **rate limiting en el login** (el Redis de la misma tabla del stack lo resuelve). No es Fase 3: los ataques de credential stuffing no esperan a que tengas 100 clientes.

## ADR-006 (Motores)
- El Metadata Engine queda **extendido por ADR-009**: la definición de campo incluye atributos de rendering de UI (label, input_type, orden, visibilidad por rol). Sin esa mitad, los campos de extensión eran invisibles en pantalla.

## ADR-007 (Financiero)
- Faltó una línea de costo: **email transaccional** (confirmaciones de turno, recuperación de contraseña, invitaciones de usuario). Resend/SES: ~$0 a 1-10 clientes, $10-30/mes a 100, $100-300/mes a 1.000. Menor, pero es un servicio más a integrar y conviene que entre por la puerta de Plugins/Integration como todo lo externo.

## ADR-008 (Tokens)
- Sin cambios de fondo. Agregado práctico: sumar `AMENDMENTS.md` y `ADR-009` al flujo del INDEX — el índice sigue siendo el único punto de entrada de cada sesión nueva.
