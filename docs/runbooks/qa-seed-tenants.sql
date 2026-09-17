-- ============================================================================
-- SEED QA multi-tenant — WEB-ONLY (pegar en el SQL Editor de Neon, branch qa-empresa).
-- ============================================================================
-- Crea/actualiza 3 tenants demo por rubro (estetica-demo/velas-demo/padel-demo) + alinea
-- magra-demo. Idempotente y seguro de re-correr (ON CONFLICT). SOLO dev/QA, NUNCA prod.
--   Login FIJO de QA (autorizado, no secreto): admin@<slug> / ERP (hash scrypt REAL abajo).
--   modules = defaultModulesForBlueprint(rubro) (fuente canónica FU1).
-- Nota: `tenantId` de las filas hijas se resuelve por subquery del slug (robusto ante re-runs).

-- ── 1) TENANTS (upsert por slug) ────────────────────────────────────────────────────
INSERT INTO "Tenant" ("id","slug","name","profile","blueprintId","status","accentPreset","frontTheme","subdomain","modules","createdAt","updatedAt")
VALUES
  ('tnt_estetica_demo','estetica-demo','Estética DEMO','lite'::"TenantProfile",'servicios','TRIAL'::"TenantStatus",'rosa','dark','estetica',
     ARRAY['agenda','catalog','clients','waitlist','reminders','reports']::text[], now(), now()),
  ('tnt_velas_demo','velas-demo','Velas DEMO','lite'::"TenantProfile",'velas','TRIAL'::"TenantStatus",'ambar','light','velas',
     ARRAY['pos','catalog','clients','reports']::text[], now(), now()),
  ('tnt_padel_demo','padel-demo','Pádel DEMO','lite'::"TenantProfile",'padel','TRIAL'::"TenantStatus",'verde','light','padel',
     ARRAY['pos','catalog','clients','reports']::text[], now(), now())
ON CONFLICT ("slug") DO UPDATE SET
  "name"=EXCLUDED."name", "profile"=EXCLUDED."profile", "blueprintId"=EXCLUDED."blueprintId",
  "status"=EXCLUDED."status", "accentPreset"=EXCLUDED."accentPreset", "frontTheme"=EXCLUDED."frontTheme",
  "subdomain"=EXCLUDED."subdomain", "modules"=EXCLUDED."modules", "updatedAt"=now();

-- ── 2) USUARIOS OWNER (admin@<slug> / ERP) ──────────────────────────────────────────
-- Hash scrypt REAL de "ERP" (formato scrypt$salt$hash), verificado con verifyPassword.
INSERT INTO "User" ("id","tenantId","name","email","passwordHash","role","active","createdAt","updatedAt")
VALUES
  ('usr_estetica_owner',(SELECT id FROM "Tenant" WHERE slug='estetica-demo'),'Dueño — Estética DEMO','admin@estetica-demo',
     'scrypt$5e423dc88b294d1b839993eb6a48b391$ae9c09ef4069a3643ed03a3b30ccf7513a76a3925415124624f675e8ecda465d25826a47203e6a07824ec3463f1455dfe582b50249f85edcbbd327e3e30d2ea5','OWNER'::"UserRole",true,now(),now()),
  ('usr_velas_owner',(SELECT id FROM "Tenant" WHERE slug='velas-demo'),'Dueño — Velas DEMO','admin@velas-demo',
     'scrypt$5e423dc88b294d1b839993eb6a48b391$ae9c09ef4069a3643ed03a3b30ccf7513a76a3925415124624f675e8ecda465d25826a47203e6a07824ec3463f1455dfe582b50249f85edcbbd327e3e30d2ea5','OWNER'::"UserRole",true,now(),now()),
  ('usr_padel_owner',(SELECT id FROM "Tenant" WHERE slug='padel-demo'),'Dueño — Pádel DEMO','admin@padel-demo',
     'scrypt$5e423dc88b294d1b839993eb6a48b391$ae9c09ef4069a3643ed03a3b30ccf7513a76a3925415124624f675e8ecda465d25826a47203e6a07824ec3463f1455dfe582b50249f85edcbbd327e3e30d2ea5','OWNER'::"UserRole",true,now(),now())
ON CONFLICT ("tenantId","email") DO UPDATE SET
  "passwordHash"=EXCLUDED."passwordHash", "active"=true, "deletedAt"=NULL, "updatedAt"=now();

-- ── 3) CATÁLOGO MÍNIMO por rubro (para que el front/home no queden vacíos) ───────────

-- 3a) ESTÉTICA (servicios): categoría + 2 servicios + box + profesional + cliente + 1 turno HOY.
INSERT INTO "ServiceCategory" ("id","tenantId","name","order","createdAt","updatedAt")
VALUES ('scat_est',(SELECT id FROM "Tenant" WHERE slug='estetica-demo'),'Estética',0,now(),now())
ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name", "updatedAt"=now();

INSERT INTO "Service" ("id","tenantId","categoryId","name","durationMin","price","active","createdAt","updatedAt")
VALUES
  ('svc_est_corte',(SELECT id FROM "Tenant" WHERE slug='estetica-demo'),'scat_est','Corte y peinado',45,12000,true,now(),now()),
  ('svc_est_color',(SELECT id FROM "Tenant" WHERE slug='estetica-demo'),'scat_est','Coloración',90,28000,true,now(),now())
ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name", "price"=EXCLUDED."price", "durationMin"=EXCLUDED."durationMin", "updatedAt"=now();

INSERT INTO "Box" ("id","tenantId","name","active","createdAt","updatedAt")
VALUES ('box_est_1',(SELECT id FROM "Tenant" WHERE slug='estetica-demo'),'Box 1',true,now(),now())
ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name", "updatedAt"=now();

INSERT INTO "Professional" ("id","tenantId","name","boxId","commissionPercent","active","createdAt","updatedAt")
VALUES ('prof_est_ana',(SELECT id FROM "Tenant" WHERE slug='estetica-demo'),'Ana (DEMO)','box_est_1',0,true,now(),now())
ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name", "boxId"=EXCLUDED."boxId", "updatedAt"=now();

INSERT INTO "Client" ("id","tenantId","name","phone","createdAt","updatedAt")
VALUES ('cli_est_demo',(SELECT id FROM "Tenant" WHERE slug='estetica-demo'),'Cliente DEMO','11-5000-0000',now(),now())
ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name", "updatedAt"=now();

INSERT INTO "Appointment" ("id","tenantId","clientId","professionalId","serviceId","boxId","startsAt","endsAt","status","priceAtBooking","isResidentBooking","discountAmount","createdAt","updatedAt")
VALUES ('apt_est_hoy',(SELECT id FROM "Tenant" WHERE slug='estetica-demo'),'cli_est_demo','prof_est_ana','svc_est_corte','box_est_1',
        now() + interval '3 hours', now() + interval '3 hours 45 minutes','CONFIRMED'::"AppointmentStatus",12000,false,0,now(),now())
ON CONFLICT ("id") DO UPDATE SET "startsAt"=EXCLUDED."startsAt", "endsAt"=EXCLUDED."endsAt", "status"=EXCLUDED."status", "updatedAt"=now();

-- 3b) VELAS (retail): 4 productos por unidad (1 en stock bajo) + cliente.
INSERT INTO "Product" ("id","tenantId","name","unit","stock","lowStockAt","saleUnit","price","pricePerKg","trackStock","active","createdAt","updatedAt")
VALUES
  ('prd_vel_1',(SELECT id FROM "Tenant" WHERE slug='velas-demo'),'Vela Vainilla y Canela','unidades',2,5,'UNIT'::"ProductSaleUnit",8500,NULL,true,true,now(),now()),
  ('prd_vel_2',(SELECT id FROM "Tenant" WHERE slug='velas-demo'),'Vela Sándalo','unidades',20,5,'UNIT'::"ProductSaleUnit",9000,NULL,true,true,now(),now()),
  ('prd_vel_3',(SELECT id FROM "Tenant" WHERE slug='velas-demo'),'Difusor Coco y Vainilla','unidades',18,5,'UNIT'::"ProductSaleUnit",11000,NULL,true,true,now(),now()),
  ('prd_vel_4',(SELECT id FROM "Tenant" WHERE slug='velas-demo'),'Sahumerios de sándalo (x6)','unidades',40,5,'UNIT'::"ProductSaleUnit",3200,NULL,true,true,now(),now())
ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name", "stock"=EXCLUDED."stock", "price"=EXCLUDED."price", "updatedAt"=now();

INSERT INTO "Client" ("id","tenantId","name","phone","createdAt","updatedAt")
VALUES ('cli_vel_demo',(SELECT id FROM "Tenant" WHERE slug='velas-demo'),'Cliente DEMO','11-5000-0000',now(),now())
ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name", "updatedAt"=now();

-- 3c) PÁDEL (retail): 4 productos por unidad (1 en stock bajo) + cliente.
INSERT INTO "Product" ("id","tenantId","name","unit","stock","lowStockAt","saleUnit","price","pricePerKg","trackStock","active","createdAt","updatedAt")
VALUES
  ('prd_pad_1',(SELECT id FROM "Tenant" WHERE slug='padel-demo'),'Pala Adidas RX Series','unidades',2,5,'UNIT'::"ProductSaleUnit",129900,NULL,true,true,now(),now()),
  ('prd_pad_2',(SELECT id FROM "Tenant" WHERE slug='padel-demo'),'Zapatillas Asics Gel-Padel Pro','unidades',12,5,'UNIT'::"ProductSaleUnit",189900,NULL,true,true,now(),now()),
  ('prd_pad_3',(SELECT id FROM "Tenant" WHERE slug='padel-demo'),'Tubo de pelotas Head Padel Pro (x3)','unidades',40,5,'UNIT'::"ProductSaleUnit",12900,NULL,true,true,now(),now()),
  ('prd_pad_4',(SELECT id FROM "Tenant" WHERE slug='padel-demo'),'Overgrips Bullpadel (pack x3)','unidades',50,5,'UNIT'::"ProductSaleUnit",7900,NULL,true,true,now(),now())
ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name", "stock"=EXCLUDED."stock", "price"=EXCLUDED."price", "updatedAt"=now();

INSERT INTO "Client" ("id","tenantId","name","phone","createdAt","updatedAt")
VALUES ('cli_pad_demo',(SELECT id FROM "Tenant" WHERE slug='padel-demo'),'Cliente DEMO','11-5000-0000',now(),now())
ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name", "updatedAt"=now();

-- ── 4) Alinear MAGRA-DEMO (ya existe) a la convención ───────────────────────────────
UPDATE "Tenant"
   SET "subdomain"='magra',
       "modules"=ARRAY['pos','catalog','clients','reports','arca']::text[],
       "updatedAt"=now()
 WHERE slug='magra-demo';

INSERT INTO "User" ("id","tenantId","name","email","passwordHash","role","active","createdAt","updatedAt")
VALUES ('usr_magra_owner',(SELECT id FROM "Tenant" WHERE slug='magra-demo'),'Dueña — Magra DEMO','admin@magra-demo',
        'scrypt$5e423dc88b294d1b839993eb6a48b391$ae9c09ef4069a3643ed03a3b30ccf7513a76a3925415124624f675e8ecda465d25826a47203e6a07824ec3463f1455dfe582b50249f85edcbbd327e3e30d2ea5','OWNER'::"UserRole",true,now(),now())
ON CONFLICT ("tenantId","email") DO UPDATE SET
  "passwordHash"=EXCLUDED."passwordHash", "active"=true, "deletedAt"=NULL, "updatedAt"=now();

-- ── Listo. Qué hace falta para VERLOS (y qué NO hay que prender) ───────────────────
--
-- ⚠️ CORRECCIÓN 2026-09-17. Este archivo decía "prender MODULE_REGISTRY_ENABLED (+
-- NAV_GROUPING_ENABLED/PROFILES_ENABLED)". Era una instrucción PELIGROSA y está retirada:
-- los tres flags son GLOBALES del deploy, no por tenant (src/modules/flags.ts), así que
-- prender cualquiera afecta a TODOS los tenants de la base — incluida `beauty-spa`, el
-- único cliente vivo en producción.
--
-- Concretamente con MODULE_REGISTRY_ENABLED=on: el menú del backoffice pasa a armarse
-- SÓLO con `Tenant.modules[]` (src/lib/module-gating.ts:27-43 → resolverActivacion, que
-- parte de lo asignado y sólo RESTA, src/modules/activation.ts:12-16,77). `beauty-spa` tiene
-- `modules = {}` y `blueprintId = NULL` → el set de módulos activos queda VACÍO → se queda
-- SIN MENÚ. Comprobalo antes de discutirlo:
--     SELECT slug, modules, "blueprintId" FROM "Tenant" WHERE slug = 'beauty-spa';
--
-- El eje de gating que SÍ está en uso es el RUBRO (`blueprintId` → isRetail/carniceriaOnly,
-- src/lib/carniceria/rubro.ts:26-37). Por eso este seed ya setea `blueprintId` en cada
-- tenant: con eso solo, cada demo abre con su cara (mostrador vs. agenda) y no hace falta
-- tocar ningún flag.
--
-- Para verlos alcanza con:
--   1. TENANT_HOST_MAP mapeando cada host al `subdomain` de arriba (estetica/velas/padel/
--      magra). Es UNA sola variable concatenada con `;` — ver el procedimiento de edición
--      en docs/runbooks/alta-magra.md (Paso 8): perder una entrada tira el fail-closed de
--      src/lib/tenant.ts:150-154 en el tenant afectado.
--   2. Nada más. Ningún flag.
