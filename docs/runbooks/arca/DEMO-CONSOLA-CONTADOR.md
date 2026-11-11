# Demo de la consola del contador · 10 minutos · 05/11/2026

Relevado contra `origin/main` (b0dc696e). Sin migraciones: todo lo de abajo ya está en `main` y en Neon.

## Qué existe de verdad
- **/contador** (`src/app/contador/page.tsx`): monitor de la cartera, «El mes», monotributo y alta de cliente.
  Para entrar hace falta un OWNER (`cartera:manage`, page.tsx:71) de un negocio con el módulo `cartera` (page.tsx:82) y **sin** `multilocal` (page.tsx:86-96).
- Subrutas (`exigirEstudio`, `src/lib/cartera-gate.ts:31`): `/contador/abonos` (abono mensual), `/contador/lote` (vista previa y emisión del lote),
  `/contador/cliente/<id>/comprobantes` (CAE, nota de crédito), `/contador/cliente/<id>/recibidos` (compras, necesita un CSV de ARCA),
  `/contador/exportar` y `/contador/paquete` (descargas).
- **Factoque**: vidriera pública `/facturita` y app `/facturita/app` (emitir → facturas → PDF → anular con NC). La app exige `blueprintId="facturita"`
  (`src/lib/facturita-actions.ts:53-64`).
- **Ramas viejas** (`claude/facturacion-automatica-contador`, `-facturita`, `frente/producto-contador`, `integ/seg-contador`): no agregan nada de
  contador ni de Factoque que no esté en `main`. Son versiones anteriores. **«producto/facturin» no existe** ni en git ni en docs: no se perdió nada.

## Antes de la demo (🔒 lo prepara el dueño o un operador, ~20 min)
1. Un estudio demo: `npm run provision … --slug <estudio-demo> --blueprint generico`, módulos `cartera` + `arca` (`docs/runbooks/golive-suite-3-productos.md:47-58`).
   No hay ningún seed de estudio.
2. Dos o tres clientes en la cartera, **creados antes** desde `/operador/solicitudes`: en vivo, «Agregar cliente» sólo deja el pedido a Soporte
   (`src/lib/cartera-actions.ts:192-211`).
3. `ARCA_INVOICING_ENABLED=true` con `ARCA_MODO` sin setear (stub). Así los CAE salen simulados («STUB…»). Si no, el lote queda «pendiente».
4. Un negocio Factoque con los datos de `/facturita/app/cuenta#datos-para-facturas` cargados. Sin esos datos no sale el PDF.
5. Datos de prueba: se limpian al cerrar (`AGENTS.md`).

## Recorrido (10 min)
1. `/admin/login` como OWNER del estudio → `/contador`: cartera, semáforo del mes, monitor de monotributo (1,5 min).
2. Abrir un cliente → `/contador/cliente/<id>/comprobantes`: comprobantes con CAE y estado (1,5 min).
3. `/contador/abonos`: cargar un abono mensual a un cliente (1,5 min).
4. `/contador/lote`: vista previa del lote del mes → «Emitir el lote» → volver a comprobantes y ver los CAE (2 min).
5. `/contador/exportar?mes=AAAA-MM`: bajar el CSV para el estudio (1 min).
6. `/facturita` (vidriera) → logueado en el negocio Factoque, `/facturita/app`: emitir una factura (1,5 min).
7. `/facturita/app/facturas`: bajar el PDF con QR y anularla con nota de crédito (1 min).

## Callejones (no mostrarlos en vivo)
- «Agregar cliente» en la consola y `/facturita/alta`: terminan en «lo activa GSG», no crean nada al momento.
- `/contador/cliente/<id>/recibidos` sin un CSV de ARCA: vacío.
- ARCA en homologación o real sin el certificado del cliente: las facturas quedan esperando.
- Los CAE en stub dicen «STUB»: avisar que es el ambiente de demo.
- Aviso «provisional» de la tabla de monotributo (`MonitorMonotributo.tsx:123`): decir que se coteja con la tabla vigente de ARCA.

## Qué se puede integrar hoy sin migraciones
- Esta rama (`claude/arca-prueba-cliente-nuevo`): «Condición frente al IVA» y «Verificar con ARCA» en la ficha del operador.
  No toca la consola del contador, pero es lo que permite la prueba ARCA con el cliente (`PRUEBA-CLIENTE-NUEVO.md`).
- Ninguna rama vieja: `main` ya tiene todo lo de ellas.
