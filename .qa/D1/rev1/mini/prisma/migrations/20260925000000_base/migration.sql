CREATE TABLE "Payment" (id text PRIMARY KEY, "tenantId" text NOT NULL, amount double precision NOT NULL);
CREATE TABLE "StockMovement" (id text PRIMARY KEY, "tenantId" text NOT NULL, "unitCost" double precision);
INSERT INTO "Payment" VALUES ('pay1','ch',3000), ('pay9','ch',1851.8505);
INSERT INTO "StockMovement" VALUES ('sm1','magra',1000.571429);
