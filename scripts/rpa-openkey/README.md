# RPA de bajas de vouchers en OpenKey (CH · Tanda 2)

Diseño: `docs/tenants/ch/VOUCHERS-OPENKEY.md` § RPA. Hoy corre **sólo contra el OpenKey simulado**.

## Piezas
- `openkey-simulado.mjs`: OpenKey de mentira (node puro): login, listado, búsqueda, «Dar de baja» con confirmación, fallas inyectables (`OPENKEY_SIM_FALLAS` o `GET /__sim/fallar?tipo=&ruta=&veces=&numero=`).
- `rpa.mjs`: lee el CSV de `/admin/vouchers → Exportar`, toma los USADO sin «Baja en OpenKey», verifica antes y después de cada baja, nunca baja dos veces, 3 intentos con backoff, relogin. Escribe `numero;estado;resultado;fechaHora;detalle` (entra por «Importar foto de OpenKey»). Exit 0 ok · 1 fallas/alertas · 2 configuración.
- `selectores.mjs`: el único archivo que conoce la pantalla de OpenKey (provisional).
- `semilla-simulado.json` y `reporte-ejemplo.csv`: datos ficticios.

## Correrlo local
```bash
node scripts/rpa-openkey/openkey-simulado.mjs --puerto 4010 --semilla scripts/rpa-openkey/semilla-simulado.json &
OPENKEY_URL=http://127.0.0.1:4010 OPENKEY_USUARIO=simulado OPENKEY_CLAVE=simulado \
  node scripts/rpa-openkey/rpa.mjs --entrada scripts/rpa-openkey/reporte-ejemplo.csv --salida /tmp/resultado.csv
node --test scripts/rpa-openkey/rpa.test.mjs   # 10 pruebas contra el simulado
```
Opcionales: `RPA_INTENTOS` (3), `RPA_BACKOFF_MS` (2000), `RPA_TIMEOUT_MS` (20000), `RPA_HEADED=1`, `PW_CHROMIUM`.
Fuera de localhost se niega a correr salvo `RPA_PERMITIR_REAL=1`. Las credenciales van sólo por env y nunca se imprimen.

## En GitHub Actions
`.github/workflows/rpa-openkey.yml`: sólo manual (`workflow_dispatch`), `modo: simulado` por defecto, sube el CSV de
resultado como artifact. El `schedule` (~23:30 ART) está comentado.

## Qué falta para prenderlo [A VALIDAR]
- Autorización **escrita** de CH para automatizar su cuenta de OpenKey, y acceso real.
- Confirmar si OpenKey tiene API o exportación oficial (reemplazaría al scraping) y sus términos de uso.
- Calibrar `selectores.mjs` y los textos de estado contra el OpenKey real.
- Fuente del CSV de entrada en Actions: hoy es un archivo del repo; falta una exportación del ERP que el job pueda
  bajar sin credenciales nuevas, o subirla a mano. Nunca commitear datos reales.
- Cerrar el circuito: hoy el CSV de resultado se importa a mano (la importación ya marca `bajaOpenKeyEn`); automatizarlo es otra tanda.
- Secrets `OPENKEY_URL`, `OPENKEY_USUARIO`, `OPENKEY_CLAVE` (los pega el dueño) y variable `RPA_AVISO_ISSUE=1` para el aviso.
- Descomentar el `schedule` sólo después de todo lo anterior.
