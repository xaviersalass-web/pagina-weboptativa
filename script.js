const pasos = [...document.querySelectorAll(".paso")];
const relato = document.querySelector(".relato");
const lienzo = document.querySelector("#lienzo");
const barraProgreso = document.querySelector("#barra-progreso");
const rotuloEtapa = document.querySelector("#rotulo-etapa");
const rotuloTitulo = document.querySelector("#rotulo-titulo");

const titulos = {
  territorio: ["Escena 1", "Ubicar el territorio"],
  cambio: ["Escena 2", "Mostrar el cambio"],
  contraste: ["Escena 3", "Comparar casos"],
  detalle: ["Escena 4", "Acercarse al detalle"]
};

function activarPaso(pasoActivo) {
  pasos.forEach((paso) => paso.classList.toggle("activo", paso === pasoActivo));

  const escena = pasoActivo.dataset.escena;
  const [etapa, titulo] = titulos[escena];

  lienzo.dataset.escena = escena;
  rotuloEtapa.textContent = etapa;
  rotuloTitulo.textContent = titulo;
}

function actualizarProgreso() {
  const inicio = relato.offsetTop;
  const final = relato.offsetTop + relato.offsetHeight - window.innerHeight;
  if (final <= inicio) return;

  const avance = (window.scrollY - inicio) / (final - inicio);
  const porcentaje = Math.min(100, Math.max(0, avance * 100));

  barraProgreso.style.width = `${porcentaje}%`;
}

const observador = new IntersectionObserver(
  (entradas) => {
    const visible = entradas
      .filter((entrada) => entrada.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (visible) {
      activarPaso(visible.target);
    }
  },
  {
    root: null,
    threshold: [0.35, 0.5, 0.65]
  }
);

pasos.forEach((paso) => observador.observe(paso));
window.addEventListener("scroll", actualizarProgreso, { passive: true });
window.addEventListener("resize", actualizarProgreso);

activarPaso(pasos[0]);
actualizarProgreso();
