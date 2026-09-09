/**
 * Punto de entrada para `node --test test/`: Node 22 resuelve el directorio a este
 * archivo. Importar cada *.test.mjs registra sus tests en este mismo proceso.
 * (`node --test` a secas, o con glob, también funciona.)
 */
import './profundidad.test.mjs';
import './costos.test.mjs';
import './estrategias.test.mjs';
import './motor.test.mjs';
import './exchanges.test.mjs';
import './registro.test.mjs';
import './servidor.test.mjs';
