# Propuesta de migración (DRY-RUN, NO aplicada) — categoría de Producto

**Estado:** 🟡 **PROPUESTA — elevada al dueño. NO aplicada. Requiere Gate 2.**
**Fecha:** 2026-07-07 · **Opus (T2)**
**Contexto:** módulo Servicios/Catálogo bajo principio de variante (ADR-055). El ABM de asignación **servicio↔profesional** se construyó sin migración; **producto↔categoría** necesita esquema nuevo.
**Firma:** — Elaborado por GSG

---

## Resumen ejecutivo (1 línea)

Hoy **`Product` no tiene categoría** en el schema (solo `Service` tiene `ServiceCategory`).
Para dar el ABM de asignación **producto↔categoría** (variante, igual que servicio↔profesional)
hace falta **una tabla + una columna nuevas**. Es **aditivo y reversible en esquema**, pero
aplicar la migración es **Gate 2** (irreversible sobre Neon) → se deja escrito y **sin aplicar**.

## Por qué NO se aplica ahora

- **Irreversible (Gate 2):** cualquier `migrate deploy` sobre Neon está fuera del mandato de T2.
- **Neon plan free:** evitar cambios de esquema hasta confirmar el valor.
- **El ABM principal ya se entregó sin esto:** servicio↔profesional (el fix-forward de A-1/DX-6)
  usa la relación implícita `ProfessionalServices` existente → cero migración.

## Qué agregaría (propuesta Prisma — NO está en `schema.prisma`)

Espeja el patrón de `ServiceCategory` (mismo objeto-maestro + asignación, argentinizado).
Todo **aditivo/nullable** → sin backfill; los productos existentes quedan sin categoría (válido).

```prisma
// PROPUESTA — NO copiar a schema.prisma sin OK del dueño (Gate 2).
model ProductCategory {
  id        String    @id @default(cuid())
  tenant    Tenant    @relation(fields: [tenantId], references: [id])
  tenantId  String
  name      String
  order     Int       @default(0)
  products  Product[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([tenantId, order])
}

// dentro de model Product { ... }  (columna + relación, aditivas/nullable)
  category    ProductCategory? @relation(fields: [categoryId], references: [id])
  categoryId  String?
  @@index([categoryId])

// dentro de model Tenant { ... }  (relación inversa)
  productCategories ProductCategory[]
```

## Coherencia con RLS (ADR-018)

`ProductCategory` lleva `tenantId` y entra al régimen RLS como cualquier tabla del Core (misma
policy por GUC de tenant). Debe sumarse al coverage de RLS (`prisma/rls/`, `npm run gate:rls`) en
la misma tanda. La asignación producto↔categoría es 1-N (un producto, una categoría), como
servicio↔categoría — se resuelve con `categoryId` (sin tabla de join).

## Plan de aplicación (cuando/si des el OK — Gate 2)

1. Agregar los modelos/campos a `prisma/schema.prisma` (aditivos).
2. `prisma migrate dev --create-only` en **local/branch de Neon** (nunca `migrate dev` contra el
   pooler de prod) para generar el SQL.
3. Revisar el SQL: solo `CREATE TABLE` + `ADD COLUMN categoryId` nullable + índices; **cero**
   `DROP`/`NOT NULL` sobre columnas existentes.
4. Sumar la policy RLS + coverage; `npm run gate:rls` verde.
5. **`prisma migrate deploy`** a Neon — **lo autorizás vos** (Gate 2).
6. Recién entonces: ABM de categorías de producto + selector de categoría en el form de producto
   + (opcional) sección de asignación producto↔categoría, con su propio Gate de Excelencia.

## Recomendación

**No aplicar todavía.** El ABM de asignación clave (servicio↔profesional) ya está entregado y
resuelve A-1/DX-6. Traer la categoría de producto cuando el catálogo retail lo pida de verdad
(hoy los productos del spa son insumos sin categoría; el retail agrupa por rubro, no por
categoría de producto todavía).

— Elaborado por GSG
