// Vidriera compartida (ronda 2, P0-3, sistema común §4.10). La marca pone color, letra, radio y voz; esto pone la
// conducta: bolsa que no se pierde, precio visto que viaja, hoja con «atrás» que cierra, barra fija única, errores
// junto al botón, salto al contenido y la confirmación del pedido.
export { CLAVE_BOLSA, CLAVE_ENVIO } from "./claves";
export { limpiarBolsaGuardada, renglonesDelPedido, mandaPreciosVistos, TOPE_GUARDADO, type BolsaSimple, type RenglonDelPedido } from "./bolsa";
