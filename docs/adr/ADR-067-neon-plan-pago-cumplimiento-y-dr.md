---
id: ADR-067
nivel: fundacional
dominio: [Plataforma, Datos, Seguridad]
depends_on: [ADR-001, ADR-005, ADR-007, ADR-023]
---
# ADR-067: Neon plan pago + cumplimiento Ley 25.326 + DR con RPO/RTO y PITR

**Estado:** Aceptado — **fundamento de infraestructura y cumplimiento**. Condición de la fase con **datos
reales** (POST-venta, ADR-030): el plan gratuito no soporta cobros, cumplimiento ni recuperación.
**Fecha:** 2026-07-10
**Depende de:** ADR-001 (multi-tenant/una DB por producto), ADR-005 (stack: Postgres/Neon), ADR-007 (economía
por escala), ADR-023 (restricciones del free plan como techo de piloto)
**Relacionado:** ADR-060 (DR por producto), ADR-062 (RLS línea base), ADR-066 (credenciales por tenant),
ADR-030 (inversión POST-venta) · `docs/estrategia/frente-seguridad*`

---

## Contexto

El piloto corre en **Neon free** (0.5 GB, `connection_limit` bajo, sin PITR útil) — techo explícito de piloto
(ADR-023). Al pasar a **datos reales con cobros** (ADR-030 INVERSIÓN), ese plan es insuficiente en tres ejes a
la vez: **capacidad** (storage/conexiones/compute), **cumplimiento** (datos personales de clientes argentinos →
**Ley 25.326** de Protección de Datos Personales) y **recuperación** (sin PITR, un borrado/corrupción no se
deshace). Con dos productos en dos bases (ADR-060), el perfil DR se decide por producto (la base empresa exige
más que la micro).

## Decisión

Al habilitar **datos reales** (POST-venta), la base productiva corre en **Neon plan pago** con un perfil de
**cumplimiento + DR** explícito:

1. **Neon plan pago** — dimensionado por producto (ADR-060): capacidad de storage/conexiones/compute acorde al
   volumen (micro = muchos tenants; empresa = dato más pesado/sensible). Sube el techo del free (ADR-023).
2. **Cumplimiento Ley 25.326** — tratamiento de datos personales conforme: base de datos **registrada** ante la
   autoridad de aplicación, **finalidad y consentimiento** (encaja con ADR-042), derechos ARCO (acceso/
   rectificación/supresión) operables, **retención** definida, y **datos en reposo cifrados**. Los datos
   personales de clientes de los tenants se tratan bajo esta ley — es requisito legal, no opcional.
3. **DR con RPO/RTO explícitos + PITR** — objetivos declarados por producto: **RPO** (cuánta pérdida de datos se
   tolera) y **RTO** (cuánto puede durar la caída) definidos y **probados**; **PITR** (point-in-time recovery)
   activo para deshacer un borrado/corrupción a un instante anterior. Backups verificados con **restore de
   prueba** (un backup no probado no es un backup).

> **En una línea:** *cobros y datos reales exigen plan pago + cumplimiento 25.326 + DR con PITR y RPO/RTO
> probados; el free plan es solo para el piloto sin datos reales.*

## Consecuencias

- **(+)** Habilita **cobros y datos reales** con base legal (25.326) y red de seguridad (PITR) → condición para
  facturar de verdad (ADR-030/066).
- **(+)** **DR por producto** (ADR-060): la base empresa puede tener RPO/RTO más estrictos sin encarecer la base
  micro de alto volumen.
- **(+)** PITR + restore probado = un incidente de datos (borrado accidental, corrupción) es **recuperable**,
  no fatal.
- **(−)** **Costo recurrente** de infra (plan pago × 2 bases) — se asume solo **POST-venta** (ADR-030): no se
  paga hasta que hay ingreso que lo sostenga.
- **(−)** Cumplimiento 25.326 es **trabajo continuo** (registro, ARCO, retención, DPA con Neon), no un check
  único. Requiere el gate humano de seguridad (Facundo, ADR-068).
- **(−)** Todo esto es **irreversible/infra** → **Gate del dueño** (ADR-041/048); el agente lo documenta y lo
  eleva, no lo ejecuta.

## Alternativas descartadas

- **Seguir en Neon free con datos reales.** Barato pero **ilegal/imprudente**: sin PITR, sin capacidad, sin
  base para cumplir 25.326 → un incidente es irrecuperable y un cobro sin cumplimiento es riesgo legal.
  Rechazada para la fase real.
- **Backups sin PITR ni restore probado** ("ya hace backup Neon"). Falsa sensación de seguridad: un backup no
  probado y sin punto-en-el-tiempo no cubre el borrado accidental. Rechazada: PITR + restore de prueba.
- **Autogestionar Postgres en un VPS para ahorrar.** Más control aparente pero traslada a GSG toda la operación
  DR/parches/HA — costo de mano de obra que la economía no soporta (ADR-007). Rechazada: Neon administrado.
- **Un solo plan/DR para ambos productos.** Rechazada por ADR-060: el DR se dimensiona por producto.

— Elaborado por GSG (Arquitecto de Solución / Seguridad — fundamento; la contratación del plan y el DR real son infra POST-venta = Gate del dueño)
