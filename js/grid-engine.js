// js/grid-engine.js
// Modo retícula para Cenefas y Grupos.
// - Retícula fija (lienzo)
// - Click en celda vacía: coloca el modelo/patrón activo
// - No se pinta dentro del tapete (grid). El pintado sucede en el editor lateral.
// - Rotación por celda (90°)
// - Brocha/Patrón: una celda = (modelo + rot + paleta). Se puede copiar y estampar.
//   * SHIFT+click en celda con pieza => COPIAR patrón (brush)
//   * click => ESTAMPAR patrón en celda vacía (o con ALT reemplaza)
//   * ALT+click => reemplaza aunque ya tenga pieza

(function () {
  const svgCache = new Map(); // key -> svgText

  // Cambia a "xMidYMid slice" si quieres que se vea "con zoom" dentro de cada celda del tapete
  const GRID_PRESERVE = "xMidYMid slice";

  function isGridModel(model) {
    if (!model) return false;
    const folder = String(model.folder || "").toLowerCase();
    const cat = String(model.category || "").toUpperCase();
    const type = String(model.type || "").toUpperCase();
    const isCenefa = cat === "CENEFAS" || folder === "cenefas" || model.unit?.type === "frame_simple";
    const isGroup = type === "GROUP" || type === "GRUPO" || model.isGroup === true || cat === "GRUPOS" || folder === "grupos";
    return isCenefa || isGroup;
  }

  function createState(rows, cols) {
    return {
      rows,
      cols,
      cells: new Map(),
      selectedKey: null,

      // Brocha / patrón activo:
      // { model, rot, palette }
      brush: null,
      brushMode: "place", // "place" | "pick" (por ahora usamos shortcuts)
    };
  }

  function keyOf(r, c) {
    return `${r}-${c}`;
  }

  async function fetchText(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} al cargar: ${url}`);
    return await r.text();
  }

  async function getSvgForModel(model) {
    const key = String(model.id || model.name || "");
    if (svgCache.has(key)) return svgCache.get(key);

    const direct = model.svgPath || model.path || null;
    if (direct) {
      const txt = await fetchText(direct);
      svgCache.set(key, txt);
      return txt;
    }

    const url = window.getModelUrl(model);
    const txt = await window.loadSvgText(url);
    svgCache.set(key, txt);
    return txt;
  }

  function applyColors(svgEl, palette) {
    if (!svgEl || !palette) return;

    const tag = (el) => (el.tagName || "").toLowerCase();
    const isShape = (el) => ["path", "polygon", "rect", "circle", "ellipse"].includes(tag(el));

    const paint = (node, hex) => {
      if (!node || !hex) return;
      if (isShape(node)) node.setAttribute("fill", hex);
      node.querySelectorAll("*").forEach((el) => {
        if (isShape(el)) el.setAttribute("fill", hex);
      });
    };

    Object.entries(palette).forEach(([layerId, hex]) => {
      const node = svgEl.querySelector(`#${CSS.escape(layerId)}`);
      paint(node, hex);
    });
  }

  function findLayerId(target, svgRoot) {
    if (target && typeof target.closest === "function") {
      const el = target.closest("[id]");
      if (el && el.id && /^c\d+$/i.test(el.id)) return el.id;
    }
    let cur = target;
    while (cur && cur !== svgRoot) {
      if (cur.id && /^c\d+$/i.test(cur.id)) return cur.id;
      cur = cur.parentNode;
    }
    return null;
  }

  function setContainerGridStyle(container, rows, cols) {
    container.style.display = "grid";
    container.style.gap = "8px";
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    container.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    // Forzamos altura/anchura para evitar colapso por layout
    container.style.width = "560px";
    container.style.height = "560px";
    container.style.maxWidth = "100%";
    container.style.margin = "0 auto";
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function setBrushFromCell(state, key) {
    const cell = state.cells.get(key);
    if (!cell?.model) return false;
    state.brush = {
      model: cell.model,
      rot: Number(cell.rot || 0),
      palette: deepClone(cell.palette || {}),
    };
    state.brushMode = "place";
    return true;
  }

  function setBrushFromModel(state, model) {
    if (!model) return false;
    state.brush = { model, rot: 0, palette: {} };
    state.brushMode = "place";
    return true;
  }

  function placeBrushIntoCell(state, key, { overwrite = false } = {}) {
    if (!state.brush?.model) return false;

    const exists = !!state.cells.get(key)?.model;
    if (exists && !overwrite) return false;

    state.cells.set(key, {
      model: state.brush.model,
      rot: Number(state.brush.rot || 0),
      palette: deepClone(state.brush.palette || {}),
    });
    return true;
  }

  function sameModel(a, b) {
    if (!a || !b) return false;
    const ka = String(a.id || a.name || a.svgPath || a.path || "");
    const kb = String(b.id || b.name || b.svgPath || b.path || "");
    return ka !== "" && ka === kb;
  }

  // stringify estable (ordenando llaves) para comparar paletas
  function stableStringify(obj) {
    if (!obj) return "";
    const keys = Object.keys(obj).sort();
    const out = {};
    keys.forEach((k) => (out[k] = obj[k]));
    return JSON.stringify(out);
  }

  function sameBrushAsCell(cellData, brush) {
    if (!cellData?.model || !brush?.model) return false;
    if (!sameModel(cellData.model, brush.model)) return false;
    const r1 = Number(cellData.rot || 0);
    const r2 = Number(brush.rot || 0);
    if (r1 !== r2) return false;
    const p1 = stableStringify(cellData.palette || {});
    const p2 = stableStringify(brush.palette || {});
    return p1 === p2;
  }

  async function render({ container, state, brushModel, onPlace, onSelect }) {
    const rows = state.rows;
    const cols = state.cols;

    setContainerGridStyle(container, rows, cols);
    container.innerHTML = "";

    // Si llega un modelo seleccionado desde el panel, úsalo como brocha base
    // (El app.js puede precargar paletas en state.brush; aquí solo garantizamos que exista).
    if (brushModel && (!state.brush?.model || state.brush.model !== brushModel)) {
      // No sobreescribimos palette si ya viene en state.brush para ese mismo modelo.
      setBrushFromModel(state, brushModel);
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = keyOf(r, c);
        const cellData = state.cells.get(k);

        const cell = document.createElement("div");
        cell.className = "grid-cell";
        cell.dataset.key = k;

        cell.style.border = "1px solid var(--border, #e3e3e3)";
        cell.style.borderRadius = "12px";
        cell.style.background = "#fff";
        cell.style.overflow = "hidden";
        cell.style.cursor = "pointer";
        cell.style.position = "relative";

        if (state.selectedKey === k) {
          cell.style.outline = "2px solid #111";
          cell.style.outlineOffset = "2px";
        }

        if (cellData?.model) {
          const svgText = await getSvgForModel(cellData.model);
          cell.innerHTML = svgText;

          const svgEl = cell.querySelector("svg");
          if (svgEl) {
            svgEl.setAttribute("width", "100%");
            svgEl.setAttribute("height", "100%");
            svgEl.setAttribute("preserveAspectRatio", GRID_PRESERVE);
            svgEl.style.display = "block";

            const rot = Number(cellData.rot || 0);
            svgEl.style.transform = `rotate(${rot}deg)`;
            svgEl.style.transformOrigin = "50% 50%";

            // ✅ SOLO colores por celda (independientes)
            applyColors(svgEl, cellData.palette || {});

            // Importante: dentro del tapete NO permitimos clicks sobre capas.
            // La edición de color se hace solo en el editor lateral.
            svgEl.style.pointerEvents = "none";
          }
        }

        // Clic izquierdo: colocar o reemplazar con el diseño activo.
        cell.addEventListener("click", async (ev) => {
          ev.preventDefault();
          state.selectedKey = k;

          if (state.brush?.model) {
            const placed = placeBrushIntoCell(state, k, { overwrite: true });
            if (placed && typeof onPlace === "function") await onPlace(k);
          }

          if (typeof onSelect === "function") await onSelect(k);
          await render({ container, state, brushModel, onPlace, onSelect });
        });

        // Clic derecho: rotar 90°. No borra y funciona aunque haya una brocha activa.
        cell.addEventListener("contextmenu", async (ev) => {
          ev.preventDefault();
          const current = state.cells.get(k);
          if (!current?.model) return;

          state.selectedKey = k;
          current.rot = (Number(current.rot || 0) + 90) % 360;
          state.cells.set(k, current);

          if (typeof onSelect === "function") await onSelect(k);
          await render({ container, state, brushModel, onPlace, onSelect });
        });

        container.appendChild(cell);
      }
    }
  }

  function rotateSelected(state) {
    const k = state.selectedKey;
    if (!k) return;
    const cell = state.cells.get(k);
    if (!cell) return;
    cell.rot = ((Number(cell.rot || 0) + 90) % 360);
    state.cells.set(k, cell);
  }

  function clearSelected(state) {
    const key = state.selectedKey;
    if (!key) return false;
    const removed = state.cells.delete(key);
    state.selectedKey = null;
    return removed;
  }

  function clear(state) {
    state.cells.clear();
    state.selectedKey = null;
    state.brush = null;
  }

  window.GridEngine = {
    isGridModel,
    createState,
    render,
    rotateSelected,
    clearSelected,
    clear,
    setBrushFromCell,
    setBrushFromModel,
    placeBrushIntoCell,
  };
})();
