# Aprendido construyendo el CRM comercial

Hasta 5 líneas por sesión: fecha · código de sesión · qué · `archivo:línea`. Lo más nuevo, arriba.

- 16/11/2026 · GSG-CRM-010 (session_01BtqRUJWsjqZ6cGejBtMq2b) · Un CHECK de la migración y una constante del motor tienen que decir lo mismo: el contacto anonimizado se llama «(baja)» en los dos (`src/lib/crm-comercial/motor.ts:553` ↔ CHECK de `ContactoComercial` en `prisma/migrations/20261116150000_crm_comercial/migration.sql`). Si no coinciden, la baja falla recién en Postgres.
- 16/11/2026 · GSG-CRM-010 · En un cambio de estado con versión, comprobá la versión ANTES de validar el estado: si no, la carrera que pierde contesta «estado inválido» en vez de «otro lo cambió» (`src/lib/crm-comercial/repo.ts` → `cambiarBorrador`).
- 16/11/2026 · GSG-CRM-010 · Topes por día del puesto: `createdAt` usa el reloj de la base, así que el test usa `new Date()` real y no una fecha fija (`src/lib/crm-comercial/repo.ts:172` `guardia`).
- 16/11/2026 · GSG-CRM-010 · La pertenencia se comprueba contra la ficha, no sólo contra el negocio: un contacto de otra marca del mismo negocio no se usa en un borrador ni se cuelga de la oportunidad (`repo.ts` → `escribirBorrador`, `crearContacto`; test E8 en `repo-postgres.test.ts`).
- 16/11/2026 · GSG-CRM-010 · Cola atómica: `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)` en un solo `$queryRaw`; dos sesiones nunca toman lo mismo (`repo.ts` → `tomarTarea`/`tomarPedido`; test E22).
