import { crearVela } from "/home/user/erp-shine3d/src/app/tienda/shine/vela-escena";
import { CERA_DEL_CATALOGO } from "/home/user/erp-shine3d/src/app/tienda/shine/vela-reglas";
(window as any).montar = async (encendida: boolean, encuadre: "columna" | "sangre", ancho: number, alto: number) => {
  const c = document.getElementById("c") as HTMLCanvasElement;
  c.style.width = ancho + "px"; c.style.height = alto + "px";
  const v = await crearVela({ lienzo: c, ancho, alto, dpr: 2, cera: CERA_DEL_CATALOGO, movimiento: true, calidad: "alta", adaptar: false, encuadre, encendida });
  v.activo(true);
  (window as any).vela = v;
  return true;
};
