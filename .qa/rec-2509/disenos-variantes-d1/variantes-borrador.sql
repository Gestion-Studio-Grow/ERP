-- Prueba del borrador de ADR-102 contra un Postgres local efímero (no es la migración real: tablas mínimas).
\set ON_ERROR_STOP 0
CREATE ROLE rls_prueba NOLOGIN NOBYPASSRLS;
CREATE TABLE "Tenant" (id TEXT PRIMARY KEY);
CREATE TABLE "Product" (id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"(id), name TEXT NOT NULL, stock float8 NOT NULL DEFAULT 0);
INSERT INTO "Tenant" VALUES ('adosmanos'), ('magra'), ('beauty-spa');
INSERT INTO "Product" VALUES ('ch1','beauty-spa','Crema',3);
-- === subida (copiada del ADR) ===
CREATE TABLE "ProductGroup" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id"), "name" TEXT NOT NULL, "eje1" TEXT NOT NULL, "eje2" TEXT, "descripcion" TEXT, "imagenUrl" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE UNIQUE INDEX "ProductGroup_id_tenantId_key" ON "ProductGroup"("id", "tenantId");
CREATE INDEX "ProductGroup_tenantId_idx" ON "ProductGroup"("tenantId");
ALTER TABLE "Product" ADD COLUMN "groupId" TEXT, ADD COLUMN "sku" TEXT, ADD COLUMN "opcion1" TEXT, ADD COLUMN "opcion2" TEXT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_groupId_tenantId_fkey" FOREIGN KEY ("groupId", "tenantId") REFERENCES "ProductGroup"("id", "tenantId") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");
CREATE UNIQUE INDEX "Product_groupId_opcion1_opcion2_key" ON "Product"("groupId", "opcion1", "opcion2") NULLS NOT DISTINCT WHERE "groupId" IS NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_variante_completa" CHECK ("groupId" IS NULL OR "opcion1" IS NOT NULL);
ALTER TABLE "ProductGroup" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductGroup" USING ("tenantId" = current_setting('app.current_tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
GRANT SELECT, INSERT, UPDATE ON "ProductGroup" TO rls_prueba;
-- === casos ===
\echo '--- CASO 1: CH sin cambios (su producto sigue igual)'
SELECT id, "groupId", sku FROM "Product" WHERE "tenantId"='beauty-spa';
INSERT INTO "ProductGroup"(id,"tenantId",name,eje1,eje2,"updatedAt") VALUES ('g1','adosmanos','Zapatilla Pro','Talle','Color',now()), ('gm','magra','Kit asado','Tamaño',NULL,now());
INSERT INTO "Product"(id,"tenantId",name,"groupId",sku,opcion1,opcion2) VALUES ('p42n','adosmanos','Zapatilla Pro — 42 · Negro','g1','ZP-42-N','42','Negro'), ('p43n','adosmanos','Zapatilla Pro — 43 · Negro','g1','ZP-43-N','43','Negro');
\echo '--- CASO 2 (debe fallar): SKU repetido en el mismo negocio'
INSERT INTO "Product"(id,"tenantId",name,sku) VALUES ('x1','adosmanos','Otro','ZP-42-N');
\echo '--- CASO 3 (debe pasar): mismo SKU en otro negocio'
INSERT INTO "Product"(id,"tenantId",name,sku) VALUES ('x2','magra','Otro','ZP-42-N');
\echo '--- CASO 4 (debe fallar): combinación repetida en el modelo'
INSERT INTO "Product"(id,"tenantId",name,"groupId",opcion1,opcion2) VALUES ('x3','adosmanos','dup','g1','42','Negro');
INSERT INTO "Product"(id,"tenantId",name,"groupId",opcion1) VALUES ('m1','magra','Kit chico','gm','Chico');
\echo '--- CASO 5 (debe fallar): combinación repetida con el segundo eje vacío (NULLS NOT DISTINCT)'
INSERT INTO "Product"(id,"tenantId",name,"groupId",opcion1) VALUES ('m2','magra','Kit chico bis','gm','Chico');
\echo '--- CASO 6 (debe fallar): producto de magra colgado de un modelo de adosmanos (FK compuesta, como dueño y sin RLS)'
INSERT INTO "Product"(id,"tenantId",name,"groupId",opcion1) VALUES ('x4','magra','Robado','g1','44');
\echo '--- CASO 7 (debe fallar): variante sin opcion1'
INSERT INTO "Product"(id,"tenantId",name,"groupId") VALUES ('x5','adosmanos','sin talle','g1');
\echo '--- CASO 8 (debe fallar): borrar un modelo con variantes'
DELETE FROM "ProductGroup" WHERE id='g1';
\echo '--- CASO 9: RLS como rol sin BYPASSRLS con el negocio magra: ve 1 modelo (el suyo) y no puede crear uno de adosmanos'
BEGIN; SET LOCAL ROLE rls_prueba; SELECT set_config('app.current_tenant_id','magra',true);
SELECT id,"tenantId" FROM "ProductGroup";
INSERT INTO "ProductGroup"(id,"tenantId",name,eje1,"updatedAt") VALUES ('g9','adosmanos','X','T',now());
ROLLBACK;
\echo '--- CASO 10: stock del modelo calculado (suma de variantes)'
UPDATE "Product" SET stock = CASE id WHEN 'p42n' THEN 2 WHEN 'p43n' THEN 5 ELSE stock END;
SELECT g.name, sum(p.stock) AS stock_modelo FROM "ProductGroup" g JOIN "Product" p ON p."groupId"=g.id AND p."tenantId"=g."tenantId" WHERE g.id='g1' GROUP BY g.name;
-- === vuelta atrás (copiada del ADR) ===
ALTER TABLE "Product" DROP CONSTRAINT "Product_variante_completa";
DROP INDEX "Product_groupId_opcion1_opcion2_key";
DROP INDEX "Product_tenantId_sku_key";
ALTER TABLE "Product" DROP CONSTRAINT "Product_groupId_tenantId_fkey";
ALTER TABLE "Product" DROP COLUMN "opcion2", DROP COLUMN "opcion1", DROP COLUMN "sku", DROP COLUMN "groupId";
DROP TABLE "ProductGroup";
\echo '--- CASO 11: tras la vuelta atrás, las variantes quedan como productos sueltos con su stock'
SELECT id, "tenantId", name, stock FROM "Product" ORDER BY id;
\d "Product"
