// El formulario de contacto de la copia del sitio de MIA Producciones. El original publica en su WordPress, que acá
// no está: esto valida los mismos campos y abre el correo de la persona con el mensaje listo para comercial@.
// Provisional hasta que MIA decida a dónde tienen que llegar las consultas (docs/tenants/mia-producciones/README.md).
(function () {
  var DESTINO = "comercial@miaproducciones.com.ar";
  var form = document.querySelector("form[data-mia-contacto]");
  if (!form) return;
  var salida = form.querySelector(".wpcf7-response-output");

  function valor(nombre) {
    var campo = form.elements[nombre];
    return campo ? String(campo.value || "").trim() : "";
  }
  function avisar(texto) {
    if (!salida) return;
    salida.textContent = texto;
    salida.removeAttribute("aria-hidden");
    salida.setAttribute("role", "status");
    salida.style.display = "block";
  }
  function marcar(nombre, mal) {
    var campo = form.elements[nombre];
    if (campo) campo.setAttribute("aria-invalid", mal ? "true" : "false");
    return mal;
  }

  form.addEventListener("submit", function (evento) {
    evento.preventDefault();
    var email = valor("your-email");
    var faltan = [
      marcar("nombre", !valor("nombre")),
      marcar("your-email", !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)),
      marcar("whatsapp", !valor("whatsapp")),
      marcar("your-message", !valor("your-message")),
    ].some(Boolean);
    if (faltan) {
      avisar("Revisá los campos marcados: nombre, correo, WhatsApp y mensaje son obligatorios.");
      var primero = form.querySelector('[aria-invalid="true"]');
      if (primero) primero.focus();
      return;
    }
    var cuerpo = [
      "Nombre: " + valor("nombre"),
      valor("empresa") ? "Empresa: " + valor("empresa") : null,
      "Correo: " + email,
      "WhatsApp: " + valor("whatsapp"),
      "",
      valor("your-message"),
    ].filter(function (linea) { return linea !== null; }).join("\r\n");
    var copia = form.elements["acceptance-379"] && form.elements["acceptance-379"].checked;
    window.location.href =
      "mailto:" + DESTINO +
      "?subject=" + encodeURIComponent("Consulta desde la web: " + valor("nombre")) +
      (copia ? "&cc=" + encodeURIComponent(email) : "") +
      "&body=" + encodeURIComponent(cuerpo);
    avisar("Se abrió tu correo con el mensaje listo: falta que lo envíes desde ahí.");
  });
})();
