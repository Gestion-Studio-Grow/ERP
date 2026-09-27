#!/bin/bash
# Uso: interruptor.sh <slug> encender|apagar  — SOLO en la copia privada erp_shine3d.
source "$SHINE3D_ENV"
case "$LAB_OWNER_URL" in *erp_shine3d*) ;; *) echo "base equivocada"; exit 1;; esac
psql "$LAB_OWNER_URL" -Atc "insert into \"AuditLog\"(id,\"tenantId\",entity,\"entityId\",action,actor,channel,\"createdAt\") select 'shine3d-'||md5(random()::text), id, 'Interruptor','diseno-nuevo','interruptor.$2','operator:laboratorio','operador', now() from \"Tenant\" where slug='$1' returning \"entityId\", action"
