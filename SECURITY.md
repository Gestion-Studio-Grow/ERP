# Política de seguridad

**Este archivo tiene campos sin completar a propósito — son decisión de los founders de Gestión Studio Grow, no algo que se pueda inventar.**

## Cómo reportar una vulnerabilidad

Si encontrás una vulnerabilidad de seguridad en este proyecto, reportala a: **[EMAIL A DEFINIR]**

No abras un issue público en GitHub para vulnerabilidades no reveladas todavía — un issue público es visible para cualquiera antes de que se pueda corregir.

Tiempo de respuesta esperado: **[A DEFINIR]**

## Estado de seguridad conocido (verificado, no aspiracional)

Para que quien reporte algo sepa qué ya está identificado y qué no:

- El panel `/admin` usa autenticación con una sola contraseña compartida, sin usuarios ni roles individuales. Es un riesgo conocido, priorizado en `BACKLOG.md`.
- No hay MFA ni rate-limiting en el login todavía (ver AMD-005 en `docs/adr/AMENDMENTS-revision-critica.md`).
- El aislamiento multi-tenant es a nivel de aplicación (`tenantId` en cada tabla y query); Row-Level Security de Postgres está diferida a propósito hasta que exista un segundo tenant activo (ver `docs/adr/ADR-001-multi-tenant-strategy.md` y el estado real en `docs/adr/INDEX.md`).
- Hay audit trail de mutaciones de negocio (`AuditLog`), pero sin roles el campo `actor` no distingue entre personas.

Si tu reporte es sobre alguno de estos puntos ya conocidos, igual reportalo — ayuda a priorizar, pero no es una sorpresa para el equipo.
