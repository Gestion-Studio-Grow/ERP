-- ROLLBACK de D9 (add_collection_settlement). Manual (§C). Orden inverso.
-- Entidad nueva sin dependientes → revierte estructura pura, sin tocar Payment/Order.

-- DROP de la tabla (arrastra sus 3 FKs y sus 2 índices).
DROP TABLE IF EXISTS "Collection";

-- DROP del enum (ya sin columnas que lo usen).
DROP TYPE IF EXISTS "CollectionOriginType";
