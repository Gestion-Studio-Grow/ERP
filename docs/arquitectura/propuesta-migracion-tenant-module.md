# Propuesta de migración (DRY-RUN, NO aplicada) — tabla `TenantModule`

**Estado:** 🟡 **PROPUESTA — elevada al dueño. NO aplicada. Requiere Gate 2.**
**Fecha:** 2026-07-07 · **Opus (reingeniería)**
**Contexto:** fundación del repositorio de módulos (ADR-054/055, `docs/arquitectura/repositorio-de-modulos.md`)
**Firma:** — Elaborado por GSG

---

## Resumen ejecutivo (1 línea)

La fundación **NO necesita esta migración para funcionar** (usa la columna
`Tenant.modules[]` que ya existe). Esta tabla se propone **solo si** más adelante hace
falta **config rica por tenant** (credenciales/parametrización por módulo) y **pin de
versión** por tenant. Queda **escrita como propuesta**, sin aplicar, para tu OK.

## Por qué NO se aplica ahora

- **No es necesaria:** la activación por tenant ya se resuelve con `Tenant.modules[]`
  (string array) + el catálogo en código. El resolver (`resolverActivacion`) funciona
  entero sin tabla nueva.
- **Es irreversible (Gate 2):** cualquier `migrate deploy` sobre Neon está fuera del
  mandato de esta tarea (reversible/flags). Aplicar una migración es lo único irreversible
  y lo decidís vos.
- **Neon plan free:** evitar cambios de esquema y escaneos innecesarios hasta que el valor
  esté confirmado.

## Qué agregaría (propuesta de modelo Prisma — NO está en `schema.prisma`)

Modelo **aditivo** (no toca ninguna tabla existente; `Tenant.modules[]` puede convivir o
migrarse después). Todo nullable/defaulted → sin backfill obligatorio.

```prisma
// PROPUESTA — NO copiar a schema.prisma sin OK del dueño (Gate 2).
model TenantModule {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  moduleId  String   // id del ModuleDescriptor (catálogo en código)
  enabled   Boolean  @default(true)     // asignación (variante) explícita
  version   String?  // pin de versión del módulo para este tenant (semver); null = la del catálogo
  config    Json?    // config por tenant NO sensible (los secretos siguen en env/vault, ADR-041)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, moduleId])   // un renglón por (tenant, módulo)
  @@index([tenantId])
}
```

Y en `Tenant`, la relación inversa (aditiva):

```prisma
// dentro de model Tenant { ... }
tenantModules  TenantModule[]
```

## Coherencia con RLS (ADR-018)

`TenantModule` lleva `tenantId` y **entra en el régimen RLS** como cualquier tabla del
Core: su policy usa el mismo GUC de tenant (el aislamiento no se evade). Debe sumarse al
**coverage de RLS** (`prisma/rls/`, `npm run gate:rls`) en la misma tanda que la migración.

## Plan de aplicación (cuando/si des el OK — Gate 2)

1. Agregar el modelo a `prisma/schema.prisma` (aditivo).
2. `prisma migrate dev --create-only` **en local/branch de Neon** para generar el SQL
   (nunca `migrate dev` contra el pooler de prod — lección de DB/migraciones).
3. Revisar el SQL (debe ser solo `CREATE TABLE` + índices; **cero** `DROP`/`ALTER` sobre
   tablas existentes).
4. Sumar la policy RLS + actualizar el coverage; `npm run gate:rls` verde.
5. **`prisma migrate deploy`** a Neon — **esto lo autorizás vos** (Gate 2).
6. Recién entonces, cablear el resolver para leer `TenantModule` en vez de
   `Tenant.modules[]` (detrás del flag, con su propio Gate de Excelencia).

## Recomendación

**No aplicar todavía.** La fundación entrega valor sin esta tabla. Traerla solo cuando
aparezca la necesidad real de **config por módulo por tenant** o **pin de versión**
(p. ej. al hacer ARCA/MP "reales"). Mientras tanto, `Tenant.modules[]` alcanza.

— Elaborado por GSG
