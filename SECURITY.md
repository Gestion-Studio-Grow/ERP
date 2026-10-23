# Política de seguridad

**Este archivo tiene campos sin completar a propósito — son decisión de los founders de Gestión Studio Grow, no algo que se pueda inventar.**

## Cómo reportar una vulnerabilidad

Si encontrás una vulnerabilidad de seguridad en este proyecto, reportala a: **[EMAIL A DEFINIR]**

No abras un issue público en GitHub para vulnerabilidades no reveladas todavía — un issue público es visible para cualquiera antes de que se pueda corregir.

Tiempo de respuesta esperado: **[A DEFINIR]**

## Estado de seguridad conocido (verificado, no aspiracional)

Para que quien reporte algo sepa qué ya está identificado y qué no:

- El panel `/admin` tiene usuarios por negocio con rol (`OWNER`, `RECEPTION`, `PROFESSIONAL`; `UserRole` en
  `prisma/schema.prisma`) y permisos por capacidad (`src/lib/capabilities.ts`). El `actor` de `AuditLog` es `user:<id>`
  cuando hay sesión (`src/lib/audit-core.ts:85`).
- El login tiene límite de intentos (`adminLoginGuard`, `src/lib/rate-limit.ts`), pero **en memoria y por instancia**:
  no se comparte entre instancias serverless. Todavía no hay MFA.
- El aislamiento multi-tenant tiene dos capas: `tenantId` en cada tabla y query (`withTenantScope`) y Row-Level Security
  de Postgres con el rol `app_rls`, que se activa con `RLS_ENFORCEMENT` (`src/lib/db.ts`). Según `docs/ESTADO-ACTUAL.md`
  está enforced en producción; el valor de la variable en Vercel no se ve desde el repo.

Si tu reporte es sobre alguno de estos puntos ya conocidos, igual reportalo — ayuda a priorizar, pero no es una sorpresa para el equipo.

## Frontera cliente / servidor (copia por ingeniería reversa)

Lo que corre en el servidor (Server Actions, Prisma, ARCA, cobros) no se puede extraer; lo que baja al navegador sí,
aunque esté minificado. Lo cuidan:

- `src/lib/frontera-cliente.test.ts` (corre con `npm test` y por lo tanto en `npm run gates`):
  - recorre los imports de cada archivo `"use client"` y falla si alcanzan código de servidor (`*.server.*`,
    `server-only`, Prisma) o un motor de negocio fuera de su carpeta;
  - falla si un script de lo que se sirve tal cual (`public/`, las carpetas de los sitios estáticos) es una copia de
    código del ERP no declarada en `src/lib/club/ORIGEN.json`.
- `mensajeParaLaPantalla` (`src/lib/prisma-errors.ts`): las Server Actions no devuelven el mensaje de un error de la
  base (trae tablas, columnas y restricciones); va al log y la persona ve un texto genérico.

Excepción conocida y acotada: el motor del club (`src/lib/club/motor.mjs`) corre en el navegador a propósito, por el
modo sin internet del mostrador (G9), y sólo desde `/admin/club`. Durante el piloto su fuente vive en
`public/previews/breakpoint/club/motor.mjs`, legible sin login: sacarlo de ahí y pasarlo al servidor es el back
separado (G10, `docs/tenants/breakpoint/PARIDAD-REACT.md`).
