/* =========================================================
   Resonancia — interacción, dashboard, encuesta, quiz y cerebro
   ========================================================= */

const PALETA = ["#1ed760", "#6fe0d0", "#5b6dff", "#ff5fa2", "#ffd166", "#b388ff", "#ff9559", "#7bd389"];

const TEXTO = {
  color: "#f1f3ef",
  fontFamily: "Inter, system-ui, sans-serif",
};

const EJE_BASE = {
  axisLine: { lineStyle: { color: "rgba(255,255,255,0.18)" } },
  axisTick: { lineStyle: { color: "rgba(255,255,255,0.18)" } },
  axisLabel: { color: "#9aa39c", fontFamily: TEXTO.fontFamily, fontSize: 11 },
  splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
};

const TOOLTIP = {
  backgroundColor: "rgba(13,19,17,0.92)",
  borderColor: "rgba(255,255,255,0.12)",
  borderWidth: 1,
  textStyle: { color: "#f1f3ef", fontFamily: TEXTO.fontFamily, fontSize: 12 },
  extraCssText: "backdrop-filter: blur(18px); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);",
};

// =========================================================
// Estado global
// =========================================================
const estado = {
  songs: { set_a: [], set_b: [] },
  activos: [],
  dataset: "set_a",
  manifest: null,
  insights: null,
  network: null,
  graficos: {},
  ultimoMatch: null,
  excluidos: new Set(),
};

// =========================================================
// Carga de datos
// =========================================================
async function cargarDatos() {
  const [manifest, a, b, insights, network] = await Promise.all([
    fetch("data/manifest.json").then((r) => r.json()),
    fetch("data/songs_a.json").then((r) => r.json()),
    fetch("data/songs_b.json").then((r) => r.json()),
    fetch("data/insights.json").then((r) => r.json()),
    fetch("data/network.json").then((r) => r.json()),
  ]);
  estado.manifest = manifest;
  estado.songs.set_a = a;
  estado.songs.set_b = b;
  estado.activos = a;
  estado.insights = insights;
  estado.network = network;
  pintarStats();
  pintarInsights();
}

function pintarStats() {
  const all = [...estado.songs.set_a, ...estado.songs.set_b];
  const generos = new Set();
  let yMin = Infinity, yMax = -Infinity;
  all.forEach((s) => {
    (s.genre || []).forEach((g) => generos.add(g));
    if (s.year && s.year < yMin) yMin = s.year;
    if (s.year && s.year > yMax) yMax = s.year;
  });
  document.getElementById("stat-a").textContent = estado.songs.set_a.length;
  document.getElementById("stat-b").textContent = estado.songs.set_b.length;
  document.getElementById("stat-anios").textContent = `${yMin}–${yMax}`;
  document.getElementById("stat-generos").textContent = generos.size;
}

function pintarInsights() {
  document.querySelectorAll(".tarjeta[data-insight]").forEach((card) => {
    const id = card.dataset.insight;
    const ins = estado.insights[id];
    const overlay = card.querySelector(".insight-overlay");
    if (!ins || !overlay) return;
    overlay.innerHTML = `
      <span class="ins-stat">${ins.stat}</span>
      <p class="ins-headline">${ins.headline}</p>
      <p class="ins-detail">${ins.detail}</p>
      <div class="ins-extra">${(ins.extra || []).map((e) => `<span>${e}</span>`).join("")}</div>
    `;
  });
}

// =========================================================
// Insights del dashboard: en táctil se abren con un toque
// (en desktop el hover/foco ya los revela)
// =========================================================
function inicializarInsights() {
  if (!window.matchMedia || !window.matchMedia("(hover: none)").matches) return;
  const cards = document.querySelectorAll(".tarjeta[data-insight]");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const yaAbierto = card.classList.contains("abierto");
      cards.forEach((c) => c.classList.remove("abierto"));
      if (!yaAbierto) card.classList.add("abierto");
    });
  });
  // Tocar fuera de cualquier tarjeta cierra el insight abierto
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".tarjeta[data-insight]")) {
      cards.forEach((c) => c.classList.remove("abierto"));
    }
  });
}

// =========================================================
// Tabs + smooth scroll
// =========================================================
function activarVista(vista) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("activa", t.dataset.vista === vista));
  document.querySelectorAll(".vista").forEach((v) => {
    const activa = v.id === vista;
    v.classList.toggle("activa", activa);
    v.hidden = !activa;
  });
  setTimeout(() => Object.values(estado.graficos).forEach((g) => g && g.resize()), 60);
  if (vista === "cerebro" && !estado.graficos.brain) renderCerebro();
}

function inicializarNavegacion() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => activarVista(tab.dataset.vista));
  });

  // Anchors del hero (Dashboard, Quiz, etc.) → activan tab + scroll suave
  document.querySelectorAll("a[href^='#']").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href === "#") return;
    const targetId = href.slice(1);
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = a.dataset.tab || targetId;
      if (document.querySelector(`.tab[data-vista="${tabId}"]`)) activarVista(tabId);
      document.querySelector(".modulo").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

// =========================================================
// Dashboard
// =========================================================
function inicializarToggleDataset() {
  document.querySelectorAll(".toggle-dataset .opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".toggle-dataset .opt").forEach((b) => b.classList.toggle("activa", b === btn));
      const sel = btn.dataset.set;
      estado.dataset = sel;
      if (sel === "both") estado.activos = [...estado.songs.set_a, ...estado.songs.set_b];
      else estado.activos = estado.songs[sel];
      renderDashboard();
    });
  });
}

function topGeneros(songs, n = 8) {
  const conteo = {};
  songs.forEach((s) => (s.genre || []).forEach((g) => (conteo[g] = (conteo[g] || 0) + 1)));
  return Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function popPorAnio(songs) {
  const acc = {};
  songs.forEach((s) => {
    if (!s.year) return;
    (acc[s.year] = acc[s.year] || []).push(s.popularity || 0);
  });
  return Object.entries(acc)
    .map(([y, arr]) => [Number(y), Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10])
    .sort((a, b) => a[0] - b[0]);
}

function promedioRasgos(songs) {
  const rasgos = ["danceability", "energy", "valence", "acousticness", "speechiness", "liveness"];
  return rasgos.map((r) => {
    const xs = songs.map((s) => s[r]).filter((v) => typeof v === "number");
    return [r, xs.reduce((a, b) => a + b, 0) / (xs.length || 1)];
  });
}

function histograma(values, binSize, min, max) {
  const bins = [];
  for (let x = min; x < max; x += binSize) bins.push({ x, count: 0 });
  values.forEach((v) => {
    const i = Math.min(bins.length - 1, Math.floor((v - min) / binSize));
    if (i >= 0) bins[i].count++;
  });
  return bins;
}

function renderDashboard() {
  const songs = estado.activos;

  // Popularidad por año
  const lineData = popPorAnio(songs);
  estado.graficos.line = estado.graficos.line || echarts.init(document.getElementById("chart-line"), null, { renderer: "canvas" });
  estado.graficos.line.setOption({
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    tooltip: { ...TOOLTIP, trigger: "axis" },
    xAxis: { type: "category", data: lineData.map((d) => d[0]), ...EJE_BASE },
    yAxis: { type: "value", name: "Popularidad", nameTextStyle: { color: "#9aa39c" }, ...EJE_BASE },
    series: [{
      name: "Popularidad media",
      type: "line",
      smooth: true,
      showSymbol: false,
      data: lineData.map((d) => d[1]),
      lineStyle: { width: 3, color: "#1ed760" },
      areaStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: "rgba(30,215,96,0.45)" }, { offset: 1, color: "rgba(30,215,96,0.0)" }],
        },
      },
    }],
  });

  // Top géneros
  const generos = topGeneros(songs);
  estado.graficos.genre = estado.graficos.genre || echarts.init(document.getElementById("chart-genre"));
  estado.graficos.genre.setOption({
    tooltip: { ...TOOLTIP, trigger: "item", formatter: "{b}: {c} canciones ({d}%)" },
    legend: { bottom: 0, textStyle: { color: "#9aa39c", fontFamily: TEXTO.fontFamily, fontSize: 11 } },
    series: [{
      type: "pie",
      radius: ["48%", "78%"],
      center: ["50%", "45%"],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: "#0d1311", borderWidth: 2 },
      label: { color: "#f1f3ef", fontFamily: TEXTO.fontFamily, fontSize: 11 },
      labelLine: { lineStyle: { color: "rgba(255,255,255,0.3)" } },
      data: generos.map(([g, c], i) => ({ name: g, value: c, itemStyle: { color: PALETA[i % PALETA.length] } })),
    }],
  });

  // Scatter
  const generosTop = generos.slice(0, 5).map(([g]) => g);
  const scatterSeries = generosTop.map((g, i) => ({
    name: g,
    type: "scatter",
    symbolSize: 7,
    itemStyle: { color: PALETA[i % PALETA.length], opacity: 0.7 },
    data: songs
      .filter((s) => (s.genre || []).includes(g) && typeof s.energy === "number" && typeof s.valence === "number")
      .slice(0, 220)
      .map((s) => [s.energy, s.valence, s.song, s.artist]),
  }));
  estado.graficos.scatter = estado.graficos.scatter || echarts.init(document.getElementById("chart-scatter"));
  estado.graficos.scatter.setOption({
    grid: { left: 45, right: 20, top: 30, bottom: 50 },
    tooltip: {
      ...TOOLTIP,
      formatter: (p) => `<strong>${p.value[2]}</strong><br>${p.value[3]}<br><span style="color:#9aa39c">Energía ${p.value[0].toFixed(2)} · Valencia ${p.value[1].toFixed(2)}</span>`,
    },
    legend: { bottom: 0, textStyle: { color: "#9aa39c", fontSize: 11 } },
    xAxis: { name: "Energía", nameTextStyle: { color: "#9aa39c" }, min: 0, max: 1, ...EJE_BASE },
    yAxis: { name: "Valencia", nameTextStyle: { color: "#9aa39c" }, min: 0, max: 1, ...EJE_BASE },
    series: scatterSeries,
  });

  // Radar
  const rasgos = promedioRasgos(songs);
  estado.graficos.radar = estado.graficos.radar || echarts.init(document.getElementById("chart-radar"));
  estado.graficos.radar.setOption({
    tooltip: TOOLTIP,
    radar: {
      indicator: rasgos.map(([k]) => ({ name: k, max: 1 })),
      axisName: { color: "#9aa39c", fontFamily: TEXTO.fontFamily, fontSize: 12 },
      splitArea: { areaStyle: { color: ["rgba(255,255,255,0.02)", "rgba(255,255,255,0.04)"] } },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.15)" } },
    },
    series: [{
      type: "radar",
      symbol: "circle",
      areaStyle: { color: "rgba(30,215,96,0.25)" },
      lineStyle: { color: "#1ed760", width: 2 },
      itemStyle: { color: "#1ed760" },
      data: [{ value: rasgos.map((r) => Math.round(r[1] * 1000) / 1000), name: "Promedio" }],
    }],
  });

  // Tempo
  const tempos = songs.map((s) => s.tempo).filter((v) => typeof v === "number");
  const bins = histograma(tempos, 10, 50, 220);
  estado.graficos.tempo = estado.graficos.tempo || echarts.init(document.getElementById("chart-tempo"));
  estado.graficos.tempo.setOption({
    grid: { left: 40, right: 20, top: 30, bottom: 35 },
    tooltip: { ...TOOLTIP, trigger: "axis" },
    xAxis: { type: "category", data: bins.map((b) => `${b.x}`), name: "BPM", nameTextStyle: { color: "#9aa39c" }, ...EJE_BASE },
    yAxis: { type: "value", ...EJE_BASE },
    series: [{
      type: "bar",
      data: bins.map((b) => b.count),
      itemStyle: {
        color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#6fe0d0" }, { offset: 1, color: "#1ed760" }] },
        borderRadius: [4, 4, 0, 0],
      },
      barCategoryGap: "12%",
    }],
  });
}

// =========================================================
// Encuesta (mock — sustituible)
// =========================================================
const ENCUESTA = {
  p1: [["La letra", 38], ["La melodía", 46], ["El ritmo", 32], ["Los recuerdos", 26]],
  p2: [["Energético", 41], ["Relajado", 34], ["Nostálgico", 28], ["Romántico", 22], ["Triste", 17]],
  p3: [["2000–2004", 18], ["2005–2009", 26], ["2010–2014", 44], ["2015–2020", 54]],
  p4: {
    indicadores: ["Letra", "Melodía", "Ritmo", "Energía", "Voz", "Producción"],
    valores: [4.1, 4.6, 4.4, 4.2, 4.0, 3.8],
  },
};

function renderEncuesta() {
  estado.graficos.p1 = estado.graficos.p1 || echarts.init(document.getElementById("chart-poll-1"));
  estado.graficos.p1.setOption({
    grid: { left: 110, right: 30, top: 20, bottom: 20 },
    tooltip: { ...TOOLTIP, trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value", ...EJE_BASE },
    yAxis: { type: "category", data: ENCUESTA.p1.map((d) => d[0]), ...EJE_BASE },
    series: [{
      type: "bar",
      data: ENCUESTA.p1.map((d, i) => ({ value: d[1], itemStyle: { color: PALETA[i % PALETA.length], borderRadius: [0, 6, 6, 0] } })),
      barCategoryGap: "30%",
      label: { show: true, position: "right", color: "#9aa39c" },
    }],
  });

  estado.graficos.p2 = estado.graficos.p2 || echarts.init(document.getElementById("chart-poll-2"));
  estado.graficos.p2.setOption({
    tooltip: { ...TOOLTIP, trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { bottom: 0, textStyle: { color: "#9aa39c", fontSize: 11 } },
    series: [{
      type: "pie",
      radius: ["55%", "82%"],
      center: ["50%", "45%"],
      itemStyle: { borderColor: "#0d1311", borderWidth: 2 },
      label: { color: "#f1f3ef", fontSize: 11 },
      data: ENCUESTA.p2.map(([n, v], i) => ({ name: n, value: v, itemStyle: { color: PALETA[i % PALETA.length] } })),
    }],
  });

  estado.graficos.p3 = estado.graficos.p3 || echarts.init(document.getElementById("chart-poll-3"));
  estado.graficos.p3.setOption({
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    tooltip: { ...TOOLTIP, trigger: "axis" },
    xAxis: { type: "category", data: ENCUESTA.p3.map((d) => d[0]), ...EJE_BASE },
    yAxis: { type: "value", ...EJE_BASE },
    series: [{
      type: "bar",
      data: ENCUESTA.p3.map((d) => d[1]),
      itemStyle: {
        color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#1ed760" }, { offset: 1, color: "#0c8a3e" }] },
        borderRadius: [8, 8, 0, 0],
      },
    }],
  });

  estado.graficos.p4 = estado.graficos.p4 || echarts.init(document.getElementById("chart-poll-4"));
  estado.graficos.p4.setOption({
    tooltip: TOOLTIP,
    radar: {
      indicator: ENCUESTA.p4.indicadores.map((n) => ({ name: n, max: 5 })),
      axisName: { color: "#9aa39c", fontSize: 12 },
      splitArea: { areaStyle: { color: ["rgba(255,255,255,0.02)", "rgba(255,255,255,0.04)"] } },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.15)" } },
    },
    series: [{
      type: "radar",
      areaStyle: { color: "rgba(111,224,208,0.25)" },
      lineStyle: { color: "#6fe0d0", width: 2 },
      itemStyle: { color: "#6fe0d0" },
      data: [{ value: ENCUESTA.p4.valores, name: "Importancia media" }],
    }],
  });
}

// =========================================================
// Quiz + recomendador
// =========================================================
const PREGUNTAS = [
  {
    id: "danceability",
    titulo: "¿Bailas mientras escuchas?",
    desc: "Tu necesidad de moverte con la música.",
    opciones: [
      { label: "Apenas, escucho concentrado", desc: "Pista para sentarse y poner play", value: 0.25 },
      { label: "A veces, según el tema", desc: "Equilibrio entre cabeza y cuerpo", value: 0.5 },
      { label: "Casi siempre, marco el ritmo", desc: "Pies, manos, lo que sea", value: 0.75 },
      { label: "Necesito una pista de baile", desc: "100% baile", value: 0.92 },
    ],
  },
  {
    id: "energy",
    titulo: "¿Qué nivel de energía buscas?",
    desc: "De íntimo y calmado a explosivo.",
    opciones: [
      { label: "Susurro acústico", desc: "Bajo perfil, mucho aire", value: 0.2 },
      { label: "Medio, con cuerpo", desc: "Producción cálida", value: 0.5 },
      { label: "Alto, con pegada", desc: "Te despierta el día", value: 0.78 },
      { label: "Máximo voltaje", desc: "Pared de sonido", value: 0.95 },
    ],
  },
  {
    id: "valence",
    titulo: "¿Qué emoción quieres sentir?",
    desc: "La valencia es el «brillo» emocional de una canción.",
    opciones: [
      { label: "Melancolía", desc: "Lluvia, café, ventana", value: 0.15 },
      { label: "Reflexivo", desc: "Ni triste ni feliz", value: 0.4 },
      { label: "Optimista", desc: "Buen ánimo", value: 0.7 },
      { label: "Euforia pura", desc: "Sonrisa fija", value: 0.92 },
    ],
  },
  {
    id: "tempo",
    titulo: "¿Velocidad preferida?",
    desc: "Los BPM marcan el pulso.",
    opciones: [
      { label: "Lento (70–95 BPM)", desc: "Balada, R&B", value: 82 },
      { label: "Medio (95–115 BPM)", desc: "Mid-tempo, indie", value: 105 },
      { label: "Movido (115–135 BPM)", desc: "Pop, rock", value: 125 },
      { label: "Rápido (>135 BPM)", desc: "Dance, electrónica", value: 145 },
    ],
  },
  {
    id: "genre",
    titulo: "¿Hacia qué género te inclinas?",
    desc: "Solo te empuja un poco — el algoritmo decide el resto.",
    opciones: [
      { label: "Pop", desc: "Hooks, voces, brillo", value: "pop" },
      { label: "Rock", desc: "Guitarras, batería real", value: "rock" },
      { label: "Hip-Hop / R&B", desc: "Beat y palabra", value: "hip hop" },
      { label: "Electrónica / Dance", desc: "Sintetizadores", value: "dance" },
      { label: "Latino", desc: "Reguetón, latin pop", value: "latin" },
      { label: "Sin preferencia", desc: "Sorpréndeme", value: null },
    ],
  },
];

const PESOS = { danceability: 1.2, energy: 1.2, valence: 1.0, tempo: 0.6, genre: 1.5 };

const respuestas = JSON.parse(localStorage.getItem("resonancia.respuestas") || "{}");
let pasoActual = 0;

function guardarRespuestas() {
  localStorage.setItem("resonancia.respuestas", JSON.stringify(respuestas));
}

function pintarPregunta() {
  const p = PREGUNTAS[pasoActual];
  const contenedor = document.getElementById("quiz-content");
  contenedor.innerHTML = `
    <div class="pregunta">
      <p class="kicker">Pregunta ${pasoActual + 1}</p>
      <h3>${p.titulo}</h3>
      <p style="color: var(--muted)">${p.desc}</p>
      <div class="opciones">
        ${p.opciones.map((o, i) => `
          <button class="opcion ${respuestas[p.id] !== undefined && JSON.stringify(respuestas[p.id]) === JSON.stringify(o.value) ? "elegida" : ""}" data-i="${i}">
            <strong>${o.label}</strong>
            <span class="op-desc">${o.desc}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
  contenedor.querySelectorAll(".opcion").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.i);
      respuestas[p.id] = p.opciones[i].value;
      guardarRespuestas();
      contenedor.querySelectorAll(".opcion").forEach((b) => b.classList.toggle("elegida", b === btn));
    });
  });

  document.getElementById("quiz-bar").style.width = `${((pasoActual + 1) / PREGUNTAS.length) * 100}%`;
  document.getElementById("quiz-paso").textContent = pasoActual + 1;
  document.getElementById("quiz-back").disabled = pasoActual === 0;
  document.getElementById("quiz-next").textContent = pasoActual === PREGUNTAS.length - 1 ? "Ver mi canción ✨" : "Siguiente →";
}

function inicializarQuiz() {
  document.getElementById("quiz-back").addEventListener("click", () => {
    if (pasoActual > 0) { pasoActual--; pintarPregunta(); }
  });
  document.getElementById("quiz-next").addEventListener("click", () => {
    const p = PREGUNTAS[pasoActual];
    if (respuestas[p.id] === undefined) {
      const opt = document.querySelector("#quiz-content .opcion");
      if (opt) opt.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
        250
      );
      return;
    }
    if (pasoActual < PREGUNTAS.length - 1) { pasoActual++; pintarPregunta(); }
    else mostrarResultado();
  });
  document.getElementById("res-otra").addEventListener("click", () => {
    pasoActual = 0;
    Object.keys(respuestas).forEach((k) => delete respuestas[k]);
    estado.excluidos.clear();
    guardarRespuestas();
    document.getElementById("resultado").hidden = true;
    pintarPregunta();
  });
  document.getElementById("res-otra-cancion").addEventListener("click", () => {
    if (estado.ultimoMatch) estado.excluidos.add(claveCancion(estado.ultimoMatch));
    mostrarResultado();
  });
  pintarPregunta();
}

const claveCancion = (s) => `${s.artist}|${s.song}`.toLowerCase();

function recomendar() {
  const pool = [...estado.songs.set_a, ...estado.songs.set_b];
  const objetivo = {
    danceability: respuestas.danceability,
    energy: respuestas.energy,
    valence: respuestas.valence,
    tempo: respuestas.tempo,
  };
  const generoPref = respuestas.genre;

  let mejor = null;
  let mejorDist = Infinity;
  let porQue = {};

  for (const s of pool) {
    if (typeof s.danceability !== "number") continue;
    if (estado.excluidos.has(claveCancion(s))) continue;
    const dD = PESOS.danceability * Math.pow(s.danceability - objetivo.danceability, 2);
    const dE = PESOS.energy * Math.pow(s.energy - objetivo.energy, 2);
    const dV = PESOS.valence * Math.pow(s.valence - objetivo.valence, 2);
    const dT = PESOS.tempo * Math.pow((s.tempo - objetivo.tempo) / 100, 2);
    let dG = 0;
    let matchG = false;
    if (generoPref) {
      matchG = (s.genre || []).some((g) => g.toLowerCase().includes(generoPref));
      dG = PESOS.genre * (matchG ? 0 : 0.6);
    }
    let d = dD + dE + dV + dT + dG;
    d += Math.random() * 0.005;
    if (d < mejorDist) {
      mejorDist = d;
      mejor = s;
      porQue = { dD, dE, dV, dT, dG, matchG };
    }
  }
  return { match: mejor, porQue, distancia: mejorDist };
}

function explicacion(match, pq) {
  if (!match) return "";
  const tu = respuestas;
  const partes = [];
  const cerca = (a, b, t) => Math.abs(a - b) < t;
  if (cerca(match.danceability, tu.danceability, 0.12))
    partes.push(`tu bailabilidad ideal (${tu.danceability.toFixed(2)}) coincide con la de la canción (${match.danceability.toFixed(2)})`);
  if (cerca(match.energy, tu.energy, 0.12))
    partes.push(`la energía está casi en tu nivel (${match.energy.toFixed(2)} vs ${tu.energy.toFixed(2)})`);
  if (cerca(match.valence, tu.valence, 0.15))
    partes.push(`comparten el mismo color emocional (valencia ${match.valence.toFixed(2)})`);
  if (Math.abs(match.tempo - tu.tempo) < 12)
    partes.push(`viven en el mismo rango de BPM (${Math.round(match.tempo)} vs ${tu.tempo})`);
  if (pq.matchG && respuestas.genre)
    partes.push(`además pertenece al género que pediste (<strong>${respuestas.genre}</strong>)`);
  if (partes.length === 0)
    partes.push(`es el mejor compromiso entre tus 5 respuestas según la distancia ponderada en el espacio de 2.000 canciones`);
  return `Elegida porque ${partes.join("; ")}.`;
}

function mostrarResultado() {
  const { match, porQue } = recomendar();
  if (!match) return;
  estado.ultimoMatch = match;
  const box = document.getElementById("resultado");
  box.hidden = false;
  document.getElementById("res-song").textContent = match.song;
  document.getElementById("res-artist").textContent = match.artist;
  document.getElementById("res-year").textContent = `Año ${match.year}`;
  document.getElementById("res-genre").textContent = (match.genre || []).join(" · ") || "—";
  document.getElementById("res-pop").textContent = `Popularidad ${match.popularity}`;

  const rasgos = [
    ["Bailabilidad", match.danceability],
    ["Energía", match.energy],
    ["Valencia", match.valence],
    ["Acústica", match.acousticness],
    ["Tempo", Math.min(1, (match.tempo || 0) / 200)],
  ];
  document.getElementById("res-feats").innerHTML = rasgos.map(([k, v]) => `
    <div class="feat">
      <div class="feat-label">${k}</div>
      <div class="feat-bar"><span style="width:${Math.round((v || 0) * 100)}%"></span></div>
    </div>
  `).join("");

  document.getElementById("res-explicacion").innerHTML = explicacion(match, porQue);

  // Links de servicios
  const q = encodeURIComponent(`${match.song} ${match.artist}`);
  const spotifyUrl = `https://open.spotify.com/search/${q}`;
  const appleUrl = `https://music.apple.com/us/search?term=${q}`;
  document.getElementById("res-spotify").href = spotifyUrl;
  document.getElementById("res-apple").href = appleUrl;

  // QR para escanear que abre la búsqueda de Spotify
  const qrSize = 200;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&margin=4&color=000000&bgcolor=ffffff&data=${encodeURIComponent(spotifyUrl)}`;
  document.getElementById("res-qr").src = qrUrl;
  document.getElementById("res-qr").alt = `Escanea para escuchar ${match.song}`;

  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

// =========================================================
// Cerebro sonoro (red Obsidian-style)
// =========================================================
function renderCerebro() {
  if (!estado.network) return;
  const el = document.getElementById("chart-brain");
  if (!el) return;
  estado.graficos.brain = echarts.init(el);

  const { nodes, links, categories } = estado.network;

  estado.graficos.brain.setOption({
    backgroundColor: "transparent",
    tooltip: {
      ...TOOLTIP,
      formatter: (p) => {
        if (p.dataType === "edge") {
          const v = typeof p.value === "number" ? `<br><span style="color:#9aa39c">similitud ${p.value.toFixed(2)}</span>` : "";
          return `${p.data.source} ↔ ${p.data.target}${v}`;
        }
        const m = p.data.meta || {};
        if (m.type === "song") {
          return `
            <div style="max-width:280px">
              <strong style="font-size:13px">${p.data.name}</strong>
              <div style="color:#9aa39c; font-size:11px; margin-top:2px">${m.artist} · ${m.year}</div>
              <div style="margin-top:8px; color:#1ed760; font-weight:700">Popularidad ${m.popularity}</div>
              <div style="color:#9aa39c; font-size:11px; margin-top:4px">${(m.genres || []).join(" · ")}</div>
              <div style="display:flex; gap:8px; margin-top:8px; font-size:11px; color:#9aa39c">
                <span>Energía ${m.energy?.toFixed?.(2) ?? "—"}</span>
                <span>Valencia ${m.valence?.toFixed?.(2) ?? "—"}</span>
                <span>BPM ${Math.round(m.tempo ?? 0)}</span>
              </div>
            </div>`;
        }
        if (m.type === "artist") {
          return `
            <div>
              <strong style="font-size:13px">${p.data.name}</strong>
              <div style="color:#9aa39c; font-size:11px; margin-top:2px">${m.songs} canciones · pop. media ${m.avg_popularity}</div>
              <div style="color:#6fe0d0; font-size:11px; margin-top:4px">Género: ${m.top_genre || "—"}</div>
            </div>`;
        }
        return `<strong>${p.data.name}</strong><br><span style="color:#9aa39c">${m.count} canciones</span>`;
      },
    },
    legend: [{
      data: categories.map((c) => c.name),
      bottom: 16,
      textStyle: { color: "#9aa39c", fontFamily: TEXTO.fontFamily, fontSize: 12 },
      itemGap: 24,
    }],
    series: [{
      type: "graph",
      layout: "force",
      roam: true,
      draggable: true,
      animation: true,
      animationDurationUpdate: 600,
      animationEasingUpdate: "cubicOut",
      data: nodes.map((n) => ({
        ...n,
        itemStyle: {
          color: categories[n.category].color,
          shadowBlur: 16,
          shadowColor: categories[n.category].color,
          borderColor: "rgba(255,255,255,0.18)",
          borderWidth: 1,
        },
      })),
      links: links.map((l) => ({
        ...l,
        lineStyle: { color: "rgba(255,255,255,0.12)", curveness: 0.18, width: 1 },
      })),
      categories,
      label: {
        show: true,
        position: "right",
        color: "#f1f3ef",
        fontFamily: TEXTO.fontFamily,
        fontSize: 11,
        formatter: (p) => (p.data.meta?.type === "song" ? "" : p.data.name),
      },
      labelLayout: { hideOverlap: true },
      emphasis: {
        focus: "adjacency",
        scale: true,
        label: { show: true, fontWeight: 700 },
        itemStyle: { shadowBlur: 28 },
        lineStyle: { width: 2.5, color: "rgba(30,215,96,0.85)" },
      },
      force: {
        repulsion: [120, 380],
        edgeLength: [40, 140],
        gravity: 0.12,
        friction: 0.18,
      },
    }],
  });

  // Click en nodo → si es género, filtra el dashboard a ese género
  estado.graficos.brain.on("click", (p) => {
    if (p.dataType !== "node") return;
    const m = p.data.meta || {};
    if (m.type === "genre") {
      // Cambiar a "ambos" y mostrar feedback visual
      document.querySelectorAll(".toggle-dataset .opt").forEach((b) => b.classList.toggle("activa", b.dataset.set === "both"));
      estado.activos = [...estado.songs.set_a, ...estado.songs.set_b];
      renderDashboard();
      activarVista("dashboard");
      document.querySelector(".modulo").scrollIntoView({ behavior: "smooth" });
    }
  });
}

// =========================================================
// Resize global
// =========================================================
window.addEventListener("resize", () => {
  Object.values(estado.graficos).forEach((g) => g && g.resize());
});

// =========================================================
// Boot
// =========================================================
async function boot() {
  inicializarNavegacion();
  inicializarToggleDataset();
  inicializarInsights();
  inicializarQuiz();
  await cargarDatos();
  renderDashboard();
  renderEncuesta();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
