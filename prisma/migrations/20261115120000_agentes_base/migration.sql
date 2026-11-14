-- Equipo de agentes, tanda 1 (docs/tenants/mia-producciones/agentes/03 §3). ADITIVA: sólo crea 11
-- tablas nuevas, sus índices, llaves foráneas, CHECKs, políticas de RLS y un REVOKE sobre una tabla
-- nueva. No toca ninguna tabla existente, no agrega columnas a ninguna y no crea enums (los estados
-- son TEXT validado en código y con CHECK acá, como SupportTicket). Plata en micro-dólares enteros.
-- SIN APLICAR (Gate 2 del dueño): el código tolera su ausencia (`tablasDeAgentes`, estado.server.ts).

-- CreateTable
CREATE TABLE "AgentePuesto" (
    "tenantId" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "pausadoPor" TEXT,
    "pausadoEl" TIMESTAMP(3),
    "niveles" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentePuesto_pkey" PRIMARY KEY ("tenantId","puesto")
);

-- CreateTable
CREATE TABLE "AgentePedido" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "frecuente" TEXT,
    "argumentos" JSONB,
    "texto" TEXT,
    "clave" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "pedidoEl" TIMESTAMP(3) NOT NULL,
    "venceEl" TIMESTAMP(3) NOT NULL,
    "tomadoHasta" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "respondidoEl" TIMESTAMP(3),
    "respuesta" TEXT,
    "recorte" JSONB,
    "filas" JSONB,
    "motivo" TEXT,
    "conModelo" BOOLEAN NOT NULL DEFAULT false,
    "respondidoPor" TEXT,

    CONSTRAINT "AgentePedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgenteCompromiso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "entidad" TEXT,
    "entidadId" TEXT,
    "clave" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "creadoPor" TEXT NOT NULL,
    "revisadoEl" TIMESTAMP(3),
    "cerradoEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgenteCompromiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgenteNota" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "autor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgenteNota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentePropuesta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "tarea" TEXT NOT NULL,
    "herramienta" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "argumentos" JSONB NOT NULL,
    "resumen" JSONB NOT NULL,
    "texto" TEXT,
    "huella" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "venceEl" TIMESTAMP(3) NOT NULL,
    "decididaPor" TEXT,
    "decididaEl" TIMESTAMP(3),
    "resultado" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentePropuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgenteParte" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "equipo" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "numeros" JSONB NOT NULL,
    "intro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgenteParte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgenteContador" (
    "tenantId" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "tope" TEXT NOT NULL,
    "sujeto" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "n" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AgenteContador_pkey" PRIMARY KEY ("tenantId","puesto","tope","sujeto","periodo")
);

-- CreateTable
CREATE TABLE "AgenteAccion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "herramienta" TEXT,
    "detalle" JSONB,
    "nivel" INTEGER,
    "actor" TEXT NOT NULL,
    "pedidoId" TEXT,
    "propuestaId" TEXT,
    "proveedor" TEXT,
    "modelo" TEXT,
    "tokensEntrada" INTEGER,
    "tokensSalida" INTEGER,
    "microUsd" INTEGER,
    "ms" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgenteAccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgenteGasto" (
    "tenantId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "gastado" INTEGER NOT NULL DEFAULT 0,
    "comprometido" INTEGER NOT NULL DEFAULT 0,
    "llamadas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AgenteGasto_pkey" PRIMARY KEY ("tenantId","periodo")
);

-- CreateTable
CREATE TABLE "AgenteReserva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "estimado" INTEGER NOT NULL,
    "venceEl" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTA',
    "real" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgenteReserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgenteAjuste" (
    "tenantId" TEXT NOT NULL,
    "objetivoSeg" INTEGER,
    "topeMicroUsd" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedPor" TEXT,

    CONSTRAINT "AgenteAjuste_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE INDEX "AgentePedido_tenantId_estado_venceEl_idx" ON "AgentePedido"("tenantId", "estado", "venceEl");

-- CreateIndex
CREATE INDEX "AgentePedido_tenantId_userId_pedidoEl_idx" ON "AgentePedido"("tenantId", "userId", "pedidoEl");

-- CreateIndex
CREATE UNIQUE INDEX "AgentePedido_tenantId_id_key" ON "AgentePedido"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentePedido_tenantId_userId_clave_key" ON "AgentePedido"("tenantId", "userId", "clave");

-- CreateIndex
CREATE INDEX "AgenteCompromiso_tenantId_estado_fecha_idx" ON "AgenteCompromiso"("tenantId", "estado", "fecha");

-- CreateIndex
CREATE INDEX "AgenteNota_tenantId_puesto_activa_idx" ON "AgenteNota"("tenantId", "puesto", "activa");

-- CreateIndex
CREATE INDEX "AgentePropuesta_tenantId_estado_venceEl_idx" ON "AgentePropuesta"("tenantId", "estado", "venceEl");

-- CreateIndex
CREATE UNIQUE INDEX "AgentePropuesta_tenantId_id_key" ON "AgentePropuesta"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgenteParte_tenantId_equipo_dia_key" ON "AgenteParte"("tenantId", "equipo", "dia");

-- CreateIndex
CREATE INDEX "AgenteAccion_tenantId_createdAt_idx" ON "AgenteAccion"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AgenteAccion_tenantId_pedidoId_idx" ON "AgenteAccion"("tenantId", "pedidoId");

-- CreateIndex
CREATE INDEX "AgenteReserva_tenantId_estado_venceEl_idx" ON "AgenteReserva"("tenantId", "estado", "venceEl");

-- AddForeignKey
ALTER TABLE "AgentePuesto" ADD CONSTRAINT "AgentePuesto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentePedido" ADD CONSTRAINT "AgentePedido_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenteCompromiso" ADD CONSTRAINT "AgenteCompromiso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenteNota" ADD CONSTRAINT "AgenteNota_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenteParte" ADD CONSTRAINT "AgenteParte_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenteContador" ADD CONSTRAINT "AgenteContador_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenteAccion" ADD CONSTRAINT "AgenteAccion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenteAccion" ADD CONSTRAINT "AgenteAccion_tenantId_pedidoId_fkey" FOREIGN KEY ("tenantId", "pedidoId") REFERENCES "AgentePedido"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenteAccion" ADD CONSTRAINT "AgenteAccion_tenantId_propuestaId_fkey" FOREIGN KEY ("tenantId", "propuestaId") REFERENCES "AgentePropuesta"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenteGasto" ADD CONSTRAINT "AgenteGasto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenteReserva" ADD CONSTRAINT "AgenteReserva_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgenteAjuste" ADD CONSTRAINT "AgenteAjuste_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Valores válidos (texto validado también en la base) ─────────────────────────────────────────
ALTER TABLE "AgentePuesto" ADD CONSTRAINT "AgentePuesto_estado_check" CHECK ("estado" IN ('ACTIVO', 'PAUSADO'));
ALTER TABLE "AgentePedido" ADD CONSTRAINT "AgentePedido_tipo_check" CHECK ("tipo" IN ('LISTA', 'LIBRE'));
ALTER TABLE "AgentePedido" ADD CONSTRAINT "AgentePedido_estado_check"
  CHECK ("estado" IN ('RECIBIDO', 'EN_CURSO', 'RESPONDIDO', 'NECESITA_PERSONA', 'SIN_RESPONDER', 'EN_BANDEJA'));
ALTER TABLE "AgentePedido" ADD CONSTRAINT "AgentePedido_texto_check" CHECK ("texto" IS NULL OR char_length("texto") <= 1000);
ALTER TABLE "AgentePedido" ADD CONSTRAINT "AgentePedido_intentos_check" CHECK ("intentos" >= 0);
ALTER TABLE "AgentePedido" ADD CONSTRAINT "AgentePedido_recorte_check" CHECK ("recorte" IS NULL OR jsonb_typeof("recorte") = 'object');
ALTER TABLE "AgenteCompromiso" ADD CONSTRAINT "AgenteCompromiso_estado_check" CHECK ("estado" IN ('ABIERTO', 'CUMPLIDO', 'ROTO', 'CANCELADO'));
ALTER TABLE "AgenteNota" ADD CONSTRAINT "AgenteNota_texto_check" CHECK (char_length("texto") <= 500);
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_estado_check"
  CHECK ("estado" IN ('PENDIENTE', 'EJECUTADA', 'RECHAZADA', 'VENCIDA', 'FALLIDA'));
ALTER TABLE "AgenteContador" ADD CONSTRAINT "AgenteContador_n_check" CHECK ("n" >= 0);
ALTER TABLE "AgenteAccion" ADD CONSTRAINT "AgenteAccion_tipo_check"
  CHECK ("tipo" IN ('LECTURA', 'RESPUESTA', 'VENCIDO', 'PROPUESTA', 'DECISION', 'EJECUCION', 'DERIVACION', 'TOPE', 'RECHAZO', 'ERROR', 'PAUSA', 'LECTURA_GSG', 'RESPUESTA_GSG'));
ALTER TABLE "AgenteGasto" ADD CONSTRAINT "AgenteGasto_montos_check" CHECK ("gastado" >= 0 AND "comprometido" >= 0 AND "llamadas" >= 0);
ALTER TABLE "AgenteReserva" ADD CONSTRAINT "AgenteReserva_estado_check" CHECK ("estado" IN ('ABIERTA', 'CERRADA', 'VENCIDA'));
ALTER TABLE "AgenteReserva" ADD CONSTRAINT "AgenteReserva_montos_check" CHECK ("estimado" >= 0 AND ("real" IS NULL OR "real" >= 0));

-- ── Únicos parciales (a mano; precedente 20261104122000_contabilidad_ola1/migration.sql:191) ──
-- Un compromiso ABIERTO por clave y una propuesta PENDIENTE por herramienta y entidad: dos toques
-- o dos corridas no abren dos iguales. Las altas usan createMany({ skipDuplicates }) y miran count.
CREATE UNIQUE INDEX "AgenteCompromiso_tenantId_puesto_clave_abierto_key"
  ON "AgenteCompromiso"("tenantId", "puesto", "clave") WHERE "estado" = 'ABIERTO';
CREATE UNIQUE INDEX "AgentePropuesta_tenantId_herr_entidad_pendiente_key"
  ON "AgentePropuesta"("tenantId", "herramienta", "entidad", "entidadId") WHERE "estado" = 'PENDIENTE';

-- ── RLS en la misma migración (patrón 20261106120000_support_ticket/migration.sql:54-58) ────────
ALTER TABLE "AgentePuesto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgentePuesto";
CREATE POLICY tenant_isolation ON "AgentePuesto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AgentePedido" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgentePedido";
CREATE POLICY tenant_isolation ON "AgentePedido"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AgenteCompromiso" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgenteCompromiso";
CREATE POLICY tenant_isolation ON "AgenteCompromiso"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AgenteNota" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgenteNota";
CREATE POLICY tenant_isolation ON "AgenteNota"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AgentePropuesta" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgentePropuesta";
CREATE POLICY tenant_isolation ON "AgentePropuesta"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AgenteParte" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgenteParte";
CREATE POLICY tenant_isolation ON "AgenteParte"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AgenteContador" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgenteContador";
CREATE POLICY tenant_isolation ON "AgenteContador"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AgenteAccion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgenteAccion";
CREATE POLICY tenant_isolation ON "AgenteAccion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AgenteGasto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgenteGasto";
CREATE POLICY tenant_isolation ON "AgenteGasto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AgenteReserva" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgenteReserva";
CREATE POLICY tenant_isolation ON "AgenteReserva"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AgenteAjuste" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgenteAjuste";
CREATE POLICY tenant_isolation ON "AgenteAjuste"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── El registro no se edita ni se borra, tampoco en la base (03 §3) ────────────────────────────
-- El rol de la app recibe UPDATE y DELETE sobre toda tabla nueva por privilegios por defecto
-- (prisma/rls/0002_app_role.sql:63-64). Acá se los quita a AgenteAccion. El DO mira primero que el
-- rol exista (en una base sin 0002 no existe). prisma/rls/0002_app_role.sql repite este REVOKE
-- dentro de su transacción, porque su línea 58 los volvería a dar si alguien lo corre de nuevo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    REVOKE UPDATE, DELETE ON "AgenteAccion" FROM app_rls;
  END IF;
END
$$;
