// js/app.js
// Categorías + miniaturas + paleta global replicada + export PNG

document.addEventListener("DOMContentLoaded", async () => {
  let currentModelId = "";
  let currentView = 1;

  let activeColor = null;
  const globalPalette = {}; // layerId -> hex

  const modelSelect = document.getElementById("model-select");
  const modelGrid = document.getElementById("model-grid");
  const tapeteUsedPanel = document.getElementById("tapete-used");
  const tapeteUsedGrid = document.getElementById("tapete-used-grid");
  const modelSearch = document.getElementById("model-search");
  let categoryTabs = document.getElementById("category-tabs");
  let subcategoryTabs = document.getElementById("subcategory-tabs");

  const previewGrid = document.getElementById("preview-grid");
  const paletteEl = document.getElementById("palette");

  const btn1 = document.getElementById("view-1-tile");
  const btn4 = document.getElementById("view-4-tiles");
  const btn24 = document.getElementById("view-24-tiles");

  // Editor de pieza (solo en modo tapete/retícula)
  const tileEditor = document.getElementById("tile-editor");
  const tapeteLayout = document.getElementById("tapete-layout");
  const tapeteLeftcol = document.getElementById("tapete-leftcol");

  // Editor independiente para grupos de 3 a 6 piezas
  const groupLayout = document.getElementById("group-layout");
  const groupEditor = document.getElementById("group-editor");
  const groupPieceList = document.getElementById("group-piece-list");
  const groupPreview = document.getElementById("group-preview");

  const rotateCellBtn = document.getElementById("rotate-cell-btn");
  const tapeteRotateWrap = document.getElementById("tapete-rotate-wrap");

  const resetBtn = document.getElementById("reset-btn");
  const exportBtn = document.getElementById("export-btn");

  const metaModelPill = document.getElementById("meta-model-pill");
  const metaViewPill = document.getElementById("meta-view-pill");
  const selectedColorPill = document.getElementById("selected-color-pill");
  const usedCountPill = document.getElementById("used-count-pill");
  const usedColorsEl = document.getElementById("used-colors");

  const PRIMARY_ORDER = ["CUADRADOS", "HEXAGONALES", "TAPETES", "GRUPOS"];
  const TAPETE_PRIMARY = "TAPETES";
  const PRIMARY_LABEL = {
    CUADRADOS: "Cuadrados",
    HEXAGONALES: "Hexagonales",    GRUPOS: "Grupos",
    TAPETES: "Tapetes"
  };

  const SUBCAT_ORDER = ["ALL_SUB", "GEOMETRICOS", "ORGANICOS", "FLORALES", "CLASICOS", "MODERNOS"];
  const SUBCAT_LABEL = {
    ALL_SUB: "Todas",
    GEOMETRICOS: "Geométricos",
    ORGANICOS: "Orgánicos",
    FLORALES: "Florales",
    CLASICOS: "Clásicos",
    MODERNOS: "Modernos"
  };

  let activePrimary = "CUADRADOS";
  let activeSubcategory = "ALL_SUB";

  // ---------- Retícula (módulo tapete) ----------
  // Pedido: 6x6
  const GRID_ROWS = 6;
  const GRID_COLS = 6;

  // OJO: GridEngine puede cargarse después de app.js (orden de <script>).
  // Creamos el estado de la retícula de forma *perezosa* cuando ya exista GridEngine.
  let gridState = null;
  function ensureGridState() {
    if (!gridState && window.GridEngine && typeof window.GridEngine.createState === "function") {
      gridState = window.GridEngine.createState(GRID_ROWS, GRID_COLS);
    }
    return gridState;
  }

  // Memoria de paletas por modelo (solo para modo tapete):
  // key(modelId) -> { layerId: hex }
  const tapeteModelPalette = {};

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function getModelKey(model) {
    return String(model?.id || model?.name || "");
  }

  function setTapeteBrushForModel(model) {
    const gs = ensureGridState();
    if (!gs || !window.GridEngine) return;
    const key = getModelKey(model);
    const pal = tapeteModelPalette[key] ? deepClone(tapeteModelPalette[key]) : {};
    // Setea brocha con paleta recordada
    gs.brush = { model, rot: 0, palette: pal };
    // Al elegir un modelo desde panel, editamos la brocha (no una celda específica)
    gs.selectedKey = null;
  }

  // --- Tapetes: panel de modelos usados ---
  function getTapeteUsedModelKeys() {
    const gs = ensureGridState();
    if (!gs?.cells) return [];
    const used = new Set();
    for (const cell of gs.cells.values()) {
      const m = cell?.model;
      if (!m) continue;
      used.add(getModelKey(m));
    }
    return Array.from(used);
  }

  function applyPaletteToSvgElement(svgEl, palette) {
    if (!svgEl || !palette) return;
    const isShape = (el) => {
      const t = (el.tagName || "").toLowerCase();
      return ["path", "polygon", "rect", "circle", "ellipse"].includes(t);
    };
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

  async function buildThumbSvg(model, palette, rot) {
    const url = window.getModelUrl(model);
    const txt = await window.loadSvgText(url);
    const doc = new DOMParser().parseFromString(txt, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) return "";
    applyPaletteToSvgElement(svg, palette || {});

    const vb = (svg.getAttribute("viewBox") || "").split(/\s+/).map(Number);
    if (vb.length === 4 && rot) {
      const cx = vb[0] + vb[2] / 2;
      const cy = vb[1] + vb[3] / 2;
      const g = doc.createElementNS("http://www.w3.org/2000/svg", "g");
      while (svg.firstChild) g.appendChild(svg.firstChild);
      g.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);
      svg.appendChild(g);
    }

    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    return new XMLSerializer().serializeToString(svg);
  }

  async function renderTapeteUsedPanel() {
    if (!tapeteUsedPanel || !tapeteUsedGrid) return;

    const show = isTapeteMode();
    tapeteUsedPanel.style.display = show ? "" : "none";
    if (!show) {
      tapeteUsedGrid.innerHTML = "";
      return;
    }

    const keys = getTapeteUsedModelKeys().slice(-6);
    tapeteUsedGrid.innerHTML = "";

    for (const key of keys) {
      const m = getModels().find(x => getModelKey(x) === key);
      if (!m) continue;

      const card = document.createElement("button");
      card.className = "model-card" + (gridState?.brush?.model && getModelKey(gridState.brush.model) === key ? " used-active" : "");
      card.type = "button";

      const thumb = document.createElement("div");
      thumb.className = "thumb";
      thumb.innerHTML = "<div class='thumb-ph'>Cargando…</div>";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = (m.displayName || m.name || "");

      card.appendChild(thumb);
      card.appendChild(name);

      card.addEventListener("click", async () => {
        setTapeteBrushForModel(m);
        await renderTileEditor();
        await redraw();
      });

      tapeteUsedGrid.appendChild(card);

      // thumb SVG coloreado
      try {
        const pal = tapeteModelPalette[key] ? deepClone(tapeteModelPalette[key]) : {};
        const svgStr = await buildThumbSvg(m, pal, 0);
        thumb.innerHTML = svgStr || "<div class='thumb-ph'>Sin vista previa</div>";
      } catch {
        thumb.innerHTML = "<div class='thumb-ph'>Sin vista previa</div>";
      }
    }
  }

  // Modo tapete (retícula). Se activa al entrar a Cenefas y se mantiene
  // aunque el usuario seleccione CUADRADOS (para rellenar el centro).
  let tapeteMode = false;

  function isTapeteMode() {
    return activePrimary === TAPETE_PRIMARY && !!window.GridEngine;
  }

  function isGroupMode() {
    return activePrimary === "GRUPOS" && !!window.GroupEngine;
  }

  function isGroupModel(model) {
    const folder = String(model?.folder || "").toLowerCase();
    const category = String(model?.category || "").toUpperCase();
    const type = String(model?.type || "").toUpperCase();
    return folder === "grupos" || category === "GRUPOS" || type === "GROUP" || type === "GRUPO" || model?.isGroup === true;
  }

  function applyModeLayout() {
    const tapete = isTapeteMode();
    const group = isGroupMode();
    document.body.classList.toggle("is-tapete-mode", tapete);
    document.body.classList.toggle("is-group-mode", group);
    if (tapeteLeftcol) tapeteLeftcol.setAttribute("aria-hidden", tapete ? "false" : "true");
    if (tapeteRotateWrap) tapeteRotateWrap.style.display = tapete ? "" : "none";
    if (tapeteUsedPanel && !tapete) tapeteUsedPanel.style.display = "none";
    if (groupLayout) groupLayout.setAttribute("aria-hidden", group ? "false" : "true");
  }

  function ensureCurrentModelFromFilteredList() {
    const visible = getFilteredModels();
    if (!visible.length) {
      currentModelId = "";
      return null;
    }
    if (!visible.some((m) => m.id === currentModelId)) {
      currentModelId = visible[0].id;
      if (modelSelect) modelSelect.value = currentModelId;
    }
    const selected = getModelById(currentModelId);
    if (isTapeteMode() && selected) setTapeteBrushForModel(selected);
    return selected;
  }

  // Instrucciones dinámicas (panel "¿Cómo editar?")
  function updateHelpSteps() {
    const ol = document.querySelector('.panel-help .help-steps ol');
    if (!ol) return;

    if (isGroupMode()) {
      ol.innerHTML = [
        "<li>Selecciona una familia en la categoría <strong>Grupos</strong>.</li>",
        "<li>Selecciona una de sus piezas A–F debajo del editor.</li>",
        "<li>Elige un color y pinta únicamente en la pieza grande de la izquierda.</li>",
        "<li>Cada pieza conserva su propia combinación de colores.</li>",
        "<li>La vista completa del grupo se actualiza automáticamente.</li>",
        "<li>Descargar diseño exporta el grupo completo y cada pieza individual.</li>"
      ].join("");
      return;
    }

    if (activePrimary === TAPETE_PRIMARY && isTapeteMode()) {
      ol.innerHTML = [
        "<li>Selecciona una pieza de Cenefa o Centro.</li>",
        "<li>Edita sus colores únicamente en el mosaico grande de la izquierda.</li>",
        "<li>Clic izquierdo en la retícula: colocar o reemplazar.</li>",
        "<li>Clic derecho en una celda ocupada: rotar 90°.</li>",
        "<li>El botón <strong>Vaciar celda</strong> elimina únicamente la celda seleccionada.</li>",
        "<li>Cuando termines, usa <strong>Descargar diseño</strong>.</li>"
      ].join("");
      return;
    }

    // Default (mosaico normal)
    ol.innerHTML = [
      "<li>Selecciona un modelo.</li>",
      "<li>Selecciona un color.</li>",
      "<li>Haz clic en el área del mosaico que quieras pintar.</li>",
      "<li>Cuando termines, usa <strong>Descargar diseño</strong>.</li>"
    ].join("");
  }

  function resetPreviewGridInlineStyles() {
    if (!previewGrid) return;
    previewGrid.style.display = "";
    previewGrid.style.gap = "";
    previewGrid.style.gridTemplateColumns = "";
    previewGrid.style.gridTemplateRows = "";
    previewGrid.style.width = "";
    previewGrid.style.height = "";
    previewGrid.style.maxWidth = "";
    previewGrid.style.margin = "";
    previewGrid.style.aspectRatio = "";
  }

  async function renderTileEditor() {
    if (!tileEditor) return;
    if (!isTapeteMode()) {
      tileEditor.style.display = "none";
      tileEditor.innerHTML = "";
      return;
    }

    tileEditor.style.display = "block";

    const k = gridState?.selectedKey;
    const cell = k ? gridState.cells.get(k) : null;

    // Si hay celda seleccionada, editamos esa pieza.
    // Si NO hay celda, editamos la brocha (modelo seleccionado) para luego estampar.
    const targetModel = cell?.model || gridState?.brush?.model || null;
    if (!targetModel) {
      tileEditor.innerHTML = `<div class="empty-state">Selecciona un modelo o una celda para editar.</div>`;
      return;
    }

    const targetPalette = cell?.model
      ? deepClone(cell.palette || {})
      : deepClone(gridState?.brush?.palette || {});

    await renderWithEngine({
      container: tileEditor,
      model: targetModel,
      view: 1,
      palette: targetPalette,
      onLayerClick: async (layerId) => {
        if (!activeColor) return;

        // 1) Si editamos celda: se guarda en esa celda y se vuelve brocha (para replicar)
        if (cell?.model) {
          cell.palette = cell.palette || {};
          cell.palette[layerId] = activeColor.hex;
          gridState.cells.set(k, cell);

          // Brocha = lo que acabas de editar
          gridState.brush = { model: cell.model, rot: Number(cell.rot || 0), palette: deepClone(cell.palette || {}) };

          // Memoria por modelo
          tapeteModelPalette[getModelKey(cell.model)] = deepClone(cell.palette || {});
        } else {
          // 2) Si editamos brocha: se guarda en la brocha y en memoria del modelo
          gridState.brush = gridState.brush || { model: targetModel, rot: 0, palette: {} };
          gridState.brush.palette = gridState.brush.palette || {};
          gridState.brush.palette[layerId] = activeColor.hex;
          tapeteModelPalette[getModelKey(targetModel)] = deepClone(gridState.brush.palette);
        }

        updateInfoBar();
        await redraw();
      }
    });
  }

  function getTapeteUsedHex() {
    if (!isTapeteMode() || !gridState) return [];
    const all = [];
    gridState.cells.forEach((cell) => {
      if (!cell?.palette) return;
      Object.values(cell.palette).forEach((hex) => {
        if (hex) all.push(String(hex).toLowerCase());
      });
    });
    return all;
  }

  // ---------- Datos ----------
  function getModels() { return window.MOSAIC_MODELS || []; }
  function getModelById(id) { return getModels().find(m => m.id === id) || null; }
  function isHexModel(model) { return model?.folder === "hex"; }

  // UI: quitar SOLO sufijo " Hex"
  function displayModelName(model) {
    const raw = (model?.name || model?.id || "").trim();
    return raw.replace(/\sHex$/i, "");
  }

  // ---------- Botones de vista dinámicos ----------
  function bindDynamicViewButton(btn){
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const v = Number(btn.dataset.view || 0);
      if (!v) return;
      currentView = v;
      await redraw();
    });
  }
  bindDynamicViewButton(btn1);
  bindDynamicViewButton(btn4);
  bindDynamicViewButton(btn24);

  function syncViewButtonsForModel(model) {
    // En modo tapete: no usamos vistas 1/4/24. Se usa retícula fija.
    if (isTapeteMode() || isGroupMode()) {
      if (btn1) btn1.style.display = "none";
      if (btn4) btn4.style.display = "none";
      if (btn24) btn24.style.display = "none";
      currentView = 1;
      return;
    } else {
      if (btn1) btn1.style.display = "";
      if (btn4) btn4.style.display = "";
      if (btn24) btn24.style.display = "";
    }

    const hex = isHexModel(model);

    if (hex) {
      // HEX: 1 / 3 / 16
      if (btn1) { btn1.dataset.view = "1";  btn1.textContent = "1 pieza"; }
      if (btn4) { btn4.dataset.view = "3";  btn4.textContent = "3 piezas"; }
      if (btn24) { btn24.dataset.view = "16"; btn24.textContent = "16 piezas"; btn24.style.display = ""; }

      if (![1,3,16].includes(currentView)) currentView = 1;
    } else {
      // CUADRADOS: 1 / 4 / 24
      if (btn1) { btn1.dataset.view = "1";  btn1.textContent = "1 pieza"; }
      if (btn4) { btn4.dataset.view = "4";  btn4.textContent = "4 piezas"; }
      if (btn24) { btn24.dataset.view = "24"; btn24.textContent = "24 piezas"; btn24.style.display = ""; }

      if (![1,4,24].includes(currentView)) currentView = 1;
    }
  }

  function applyViewLayout(view) {
    document.body.dataset.view = String(view);
    if (!previewGrid) return;

    const model = getModelById(currentModelId);
    if (isTapeteMode() || isGroupMode()) {
      // Tapetes y grupos controlan su propio layout
      previewGrid.style.removeProperty("--grid-cols");
      previewGrid.style.removeProperty("--grid-rows");
      return;
    }
    const hex = isHexModel(model);

    let cols = 2, rows = 2;

    if (hex) {
      if (view === 1) { cols = 1; rows = 1; }
      else if (view === 3) { cols = 2; rows = 2; }
      else { cols = 4; rows = 4; } // 16
    } else {
      if (view === 1) { cols = 1; rows = 1; }
      else if (view === 4) { cols = 2; rows = 2; }
      else { cols = 6; rows = 4; } // 24
    }

    previewGrid.style.setProperty("--grid-cols", String(cols));
    previewGrid.style.setProperty("--grid-rows", String(rows));
  }

  function setActiveViewButton() {
    const buttons = [btn1, btn4, btn24].filter(Boolean);
    buttons.forEach(b => { b.classList.remove("btn-primary"); b.classList.add("btn-outline"); });

    const active = buttons.find(b => Number(b.dataset.view) === Number(currentView));
    if (active) {
      active.classList.add("btn-primary");
      active.classList.remove("btn-outline");
    }
  }

  function findColorMetaByHex(hex){
    const list = window.CBA_COLORS || [];
    const h = (hex || "").toLowerCase();
    return list.find(c => (c.hex || "").toLowerCase() === h) || null;
  }

  function setMeta() {
    const model = getModelById(currentModelId);
    const modelLabel = model ? displayModelName(model) : "—";
    if (metaModelPill) metaModelPill.textContent = `Modelo: ${modelLabel}`;

    if (metaViewPill) {
      if (isGroupMode()) {
        const count = window.GroupEngine?.getCurrentState()?.meta?.pieces?.length || model?.groupMeta?.pieces?.length || 0;
        metaViewPill.textContent = `Vista: Grupo${count ? ` de ${count} piezas` : ""}`;
        return;
      }
      if (isTapeteMode()) {
        metaViewPill.textContent = `Vista: Retícula ${GRID_ROWS}x${GRID_COLS}`;
        return;
      }
      const label =
        currentView === 1 ? "1 pieza" :
        currentView === 3 ? "3 piezas" :
        currentView === 4 ? "4 piezas" :
        currentView === 16 ? "16 piezas" :
        currentView === 24 ? "24 piezas" :
        `${currentView} piezas`;
      metaViewPill.textContent = `Vista: ${label}`;
    }
  }

  function updateInfoBar(){
    if (selectedColorPill) {
      if (!activeColor) selectedColorPill.textContent = "Color seleccionado: —";
      else {
        selectedColorPill.innerHTML = `
          <span class="swatch-mini" style="background:${activeColor.hex}"></span>
          Color seleccionado: ${activeColor.id ? activeColor.id + " - " : ""}${activeColor.name} (${activeColor.hex})
        `;
      }
    }

    const usedHex = isGroupMode()
      ? (window.GroupEngine?.getUsedHex?.() || [])
      : isTapeteMode()
        ? getTapeteUsedHex()
        : Object.values(globalPalette).filter(Boolean).map(h => String(h).toLowerCase());
    const uniqueHex = Array.from(new Set(usedHex));

    if (usedCountPill) usedCountPill.textContent = `Colores usados: ${uniqueHex.length}`;

    if (usedColorsEl) {
      usedColorsEl.innerHTML = "";
      if (uniqueHex.length === 0) {
        usedColorsEl.innerHTML = `<div style="font-size:13px;color:#666;">Aún no has aplicado colores al mosaico.</div>`;
        return;
      }
      uniqueHex.forEach(hex => {
        const meta = findColorMetaByHex(hex);
        const label = meta ? `${meta.id ? meta.id + " - " : ""}${meta.name}` : hex;
        const chip = document.createElement("div");
        chip.className = "used-chip";
        chip.innerHTML = `
          <span class="swatch-mini" style="background:${hex}"></span>
          <span class="chip-text">${label}</span>
        `;
        usedColorsEl.appendChild(chip);
      });
    }
  }

  // ---------- Paleta ----------
  function renderPalette() {
    if (!paletteEl) return;

    const colors = window.CBA_COLORS || [];
    paletteEl.innerHTML = "";

    if (!colors.length) {
      paletteEl.innerHTML = `<div style="font-size:12px;color:#666;">No hay colores en <code>js/colors.js</code></div>`;
      return;
    }

    colors.forEach((c, idx) => {
      const btn = document.createElement("button");
      btn.className = "color-swatch";
      btn.style.background = c.hex;
      btn.title = `${c.id ? c.id + " - " : ""}${c.name} (${c.hex})`;

      btn.addEventListener("click", () => {
        paletteEl.querySelectorAll(".color-swatch").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        activeColor = c;
        updateInfoBar();
      });

      paletteEl.appendChild(btn);

      if (idx === 0 && !activeColor) {
        activeColor = c;
        btn.classList.add("active");
      }
    });
  }

  // ---------- Motor ----------
  async function renderWithEngine({ container, model, view, palette, onLayerClick }) {
    try {
      if (typeof window.renderPattern === "function") {
        await window.renderPattern({ container, model, view, palette, onLayerClick });
        return;
      }
      container.innerHTML = `<div class="empty-state">No encuentro el motor de render.</div>`;
    } catch (err) {
      console.error("Render error:", err);
      container.innerHTML = `<div class="empty-state">Error cargando SVG. Abre Console para ver detalle.</div>`;
    }
  }

  async function renderGroupModule(model) {
    if (!window.GroupEngine || !groupEditor || !groupPieceList || !groupPreview) return;
    await window.GroupEngine.selectGroup(model);

    await window.GroupEngine.renderEditor({
      container: groupEditor,
      activeColor: () => activeColor,
      onChange: async () => {
        updateInfoBar();
        await renderGroupModule(model);
      }
    });

    await window.GroupEngine.renderPieceList({
      container: groupPieceList,
      onSelect: async () => { await renderGroupModule(model); }
    });
    await window.GroupEngine.renderPreview({ container: groupPreview });
  }

  async function redraw() {
    applyModeLayout();
    applyViewLayout(currentView);
    setActiveViewButton();
    setMeta();
    updateInfoBar();

    if (!previewGrid) return;

    const model = getModelById(currentModelId);
    if (!model) {
      previewGrid.innerHTML = `<div class="empty-state">Elige un modelo para comenzar.</div>`;
      return;
    }

    // Mostrar/ocultar acción de celda solo en Tapetes
    if (tapeteRotateWrap) tapeteRotateWrap.style.display = isTapeteMode() ? "" : "none";

    // --- Modo Grupos (3 a 6 piezas, sin retícula) ---
    if (isGroupMode()) {
      try {
        await renderGroupModule(model);
        setMeta();
        updateInfoBar();
      } catch (err) {
        console.error("Group render error:", err);
        if (groupPreview) groupPreview.innerHTML = `<div class="empty-state">Error cargando el grupo. Abre Console para ver detalle.</div>`;
      }
      return;
    }

    // --- Modo retícula (Tapetes) ---
    if (isTapeteMode()) {
      try {
        const gs = ensureGridState();
        if (!gs) {
          previewGrid.innerHTML = `<div class="empty-state">Cargando modo tapete… (GridEngine no disponible)</div>`;
          return;
        }
        await window.GridEngine.render({
          container: previewGrid,
          state: gs,
          // Importante: la "brocha" manda (para replicar patrones copiando desde celdas)
          brushModel: gs?.brush?.model || model,
          onPlace: async (cellKey) => {
            // Cada vez que colocas una pieza, actualizamos memoria por modelo y panel de usados
            const c = cellKey ? gs.cells.get(cellKey) : null;
            if (c?.model) {
              tapeteModelPalette[getModelKey(c.model)] = deepClone(c.palette || {});
            }
            renderTapeteUsedPanel();
          },
          onSelect: async (cellKey) => {
            // Al seleccionar una celda con pieza, esa pieza se vuelve la brocha activa
            const c = cellKey ? gs.cells.get(cellKey) : null;
            if (c?.model) {
              gs.brush = { model: c.model, rot: 0, palette: deepClone(c.palette || {}) };
            }
            renderTapeteUsedPanel();
            await renderTileEditor();
          },
        });
        await renderTileEditor();
      } catch (err) {
        console.error("Grid render error:", err);
        previewGrid.innerHTML = `<div class="empty-state">Error cargando cenefa/grupo. Abre Console para ver detalle.</div>`;
      }
      return;
    }

    // Salimos de tapete: limpiar estilos inline del contenedor para no afectar mosaicos normales.
    resetPreviewGridInlineStyles();
    if (tileEditor) { tileEditor.style.display = "none"; tileEditor.innerHTML = ""; }

    await renderWithEngine({
      container: previewGrid,
      model,
      view: currentView,
      palette: globalPalette,
      onLayerClick: async (layerId) => {
        if (!activeColor) return;
        globalPalette[layerId] = activeColor.hex;
        updateInfoBar();
        await redraw();
      }
    });
  }

  // ---------- Miniaturas ----------
  async function createModelThumbSVG(model) {
    if (isGroupModel(model) && window.GroupEngine?.createThumbnail) {
      try {
        return await window.GroupEngine.createThumbnail(model);
      } catch (error) {
        console.warn("[TDM] group thumb error:", model?.id, error);
        return null;
      }
    }

    const tmp = document.createElement("div");
    tmp.style.width = "160px";
    tmp.style.height = "160px";
    tmp.style.overflow = "hidden";
    tmp.style.position = "absolute";
    tmp.style.left = "-99999px";
    tmp.style.top = "-99999px";
    document.body.appendChild(tmp);

    try {
      await renderWithEngine({ container: tmp, model, view: 1, palette: {}, onLayerClick: () => {} });
      const svg = tmp.querySelector("svg");
      if (!svg) return null;

      const cloned = svg.cloneNode(true);
      cloned.removeAttribute("width");
      cloned.removeAttribute("height");
      cloned.setAttribute("preserveAspectRatio", "xMidYMid meet");
      return cloned;
    } catch (e) {
      console.warn("[TDM] thumb error:", model?.id, e);
      return null;
    } finally {
      tmp.remove();
    }
  }

  function setActiveModelCard(id) {
    if (!modelGrid) return;
    modelGrid.querySelectorAll(".model-card").forEach(card => {
      card.classList.toggle("active", card.dataset.modelId === id);
    });
  }

  

  // Filtra modelos por categoría (Cuadrados / Hexagonales / Tapetes / Grupos)
  // Tapetes tiene subcategorías: Cenefa y Centro.
  function getFilteredModels() {
    const term = (modelSearch?.value || "").trim().toLowerCase();
    const folderOf = (m) => String(m.folder || "").toLowerCase();
    const catOf = (m) => String(m.category || "").toUpperCase();
    const typeOf = (m) => String(m.type || "").toUpperCase();

    // Heurísticas tolerantes a datos incompletos
    const isHex = (m) => {
      const f = folderOf(m);
      const c = catOf(m);
      const t = typeOf(m);
      return f === "hex" || f === "hexagonales" || c === "HEXAGONALES" || t === "HEX";
    };

    const isCenefa = (m) => {
      const f = folderOf(m);
      const c = catOf(m);
      return (
        c === "CENEFAS" ||
        f === "cenefas" ||
        m.unit?.type === "frame_simple" ||
        /cenefa/i.test(String(m.id || m.name || ""))
      );
    };

    const isGroup = (m) => {
      const f = folderOf(m);
      const c = catOf(m);
      const t = typeOf(m);
      return c === "GRUPOS" || f === "grupos" || t === "GROUP" || t === "GRUPO" || m.isGroup === true;
    };

    // Todo lo que NO es hex/cenefa/grupo se considera cuadrado
    const isSquare = (m) => !isHex(m) && !isCenefa(m) && !isGroup(m);

    const matchesTerm = (m) => {
      if (!term) return true;
      const id = String(m.id || "").toLowerCase();
      const name = String(m.name || m.title || "").toLowerCase();
      return id.includes(term) || name.includes(term);
    };

    let list = getModels().slice().filter(matchesTerm);

    if (activePrimary === "CUADRADOS") {
      list = list.filter(isSquare);

      // subcategorías de cuadrados: SUB_<CATEGORY>
      if (activeSubcategory && activeSubcategory !== "ALL_SUB") {
        const want = activeSubcategory.replace(/^SUB_/, "");
        list = list.filter((m) => catOf(m) === want);
      }

      return list;
    }

    if (activePrimary === "HEXAGONALES") {
      return list.filter(isHex);
    }

    if (activePrimary === "GRUPOS") {
      return list.filter(isGroup);
    }

    if (activePrimary === TAPETE_PRIMARY) {
      // Tapetes: Cenefa / Centro
      if (activeSubcategory === "TAPETE_CENTRO") {
        return list.filter(isSquare);
      }
      // Default: Cenefa
      return list.filter(isCenefa);
    }

    return list;
  }
  async function renderModelGrid(models) {
    if (!modelGrid) return;
    modelGrid.innerHTML = "";

    for (const m of models) {
      const card = document.createElement("div");
      card.className = "model-card";
      card.dataset.modelId = m.id;

      const thumb = document.createElement("div");
      thumb.className = "model-thumb";
      thumb.innerHTML = `<div style="font-size:12px;color:#777;padding:8px;text-align:center;">Cargando…</div>`;

      const name = document.createElement("div");
      name.className = "model-name";
      name.textContent = displayModelName(m);

      card.appendChild(thumb);
      card.appendChild(name);

      card.addEventListener("click", async () => {
        currentModelId = m.id;
        if (modelSelect) modelSelect.value = m.id;

        // En tapete: el modelo seleccionado se edita en el panel lateral y se usa como brocha
        // con su paleta recordada (para replicar patrones).
        if (isTapeteMode()) {
          setTapeteBrushForModel(m);
        } else if (isGroupMode() && window.GroupEngine) {
          await window.GroupEngine.selectGroup(m);
        }

        syncViewButtonsForModel(m);

        setActiveModelCard(m.id);
        setMeta();
        await redraw();
      });

      modelGrid.appendChild(card);

      const svgEl = await createModelThumbSVG(m);
      if (svgEl) {
        thumb.innerHTML = "";
        thumb.appendChild(svgEl);
      } else {
        thumb.innerHTML = `<div style="font-size:12px;color:#777;padding:8px;text-align:center;">Sin vista previa</div>`;
      }
    }

    if (currentModelId) setActiveModelCard(currentModelId);
  }

  function loadModelsIntoSelect() {
    if (!modelSelect) return;
    modelSelect.innerHTML = `<option value="">Elige un modelo...</option>`;
    getModels().forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = displayModelName(m);
      modelSelect.appendChild(opt);
    });
  }

  function ensureCategoryTabs() {
    if (categoryTabs) return;
    if (!modelSearch || !modelSearch.parentElement) return;

    categoryTabs = document.createElement("div");
    categoryTabs.id = "category-tabs";
    categoryTabs.className = "category-tabs";
    modelSearch.insertAdjacentElement("afterend", categoryTabs);
  }

  
  function ensureSubcategoryTabs() {
    if (subcategoryTabs) return;
    if (!categoryTabs || !categoryTabs.parentElement) return;

    subcategoryTabs = document.createElement("div");
    subcategoryTabs.id = "subcategory-tabs";
    subcategoryTabs.className = "category-tabs subcategory-tabs";
    categoryTabs.insertAdjacentElement("afterend", subcategoryTabs);
  }

  function renderSubcategoryTabs() {
    ensureSubcategoryTabs();
    if (!subcategoryTabs) return;

    // Tapetes: subcategorías Cenefa / Centro
    if (activePrimary === TAPETE_PRIMARY) {
      subcategoryTabs.style.display = "";
      subcategoryTabs.innerHTML = "";

      const TAPETE_SUBS = ["TAPETE_CENEFA", "TAPETE_CENTRO"];
      const TAPETE_LABELS = { TAPETE_CENEFA: "Cenefa", TAPETE_CENTRO: "Centro" };

      if (!activeSubcategory || !TAPETE_SUBS.includes(activeSubcategory)) {
        activeSubcategory = "TAPETE_CENEFA";
      }

      TAPETE_SUBS.forEach((sub) => {
        const btn = document.createElement("button");
        btn.className = "tab" + (sub === activeSubcategory ? " active" : "");
        btn.dataset.subcat = sub;
        btn.textContent = TAPETE_LABELS[sub] || sub;

        btn.addEventListener("click", async () => {
          activeSubcategory = sub;
          subcategoryTabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
          btn.classList.add("active");
          const visible = getFilteredModels();
          ensureCurrentModelFromFilteredList();
          await renderModelGrid(visible);
          syncViewButtonsForModel(getModelById(currentModelId));
          await redraw();
        });

        subcategoryTabs.appendChild(btn);
      });
      return;
    }

    // Cuadrados (normal): subcategorías existentes
    if (activePrimary !== "CUADRADOS") {
      subcategoryTabs.innerHTML = "";
      subcategoryTabs.style.display = "none";
      activeSubcategory = "ALL_SUB";
      return;
    }

    subcategoryTabs.style.display = "";
    subcategoryTabs.innerHTML = "";
    SUBCAT_ORDER.forEach((sub) => {
      const btn = document.createElement("button");
      btn.className = "tab" + (sub === activeSubcategory ? " active" : "");
      btn.dataset.subcat = sub;
      btn.textContent = SUBCAT_LABEL[sub] || sub;

      btn.addEventListener("click", async () => {
        activeSubcategory = sub;
        subcategoryTabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        btn.classList.add("active");
        await renderModelGrid(getFilteredModels());
      });

      subcategoryTabs.appendChild(btn);
    });
  }

function renderCategoryTabs() {
    ensureCategoryTabs();
    if (!categoryTabs) return;

    categoryTabs.innerHTML = "";

    // En el módulo Tapetes solo mostramos la categoría Tapetes.
    const cats = PRIMARY_ORDER;

    cats.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "tab" + (cat === activePrimary ? " active" : "");
      btn.dataset.cat = cat;
      btn.textContent = PRIMARY_LABEL[cat] || cat;

      btn.addEventListener("click", async () => {
        activePrimary = cat;

        if (cat === TAPETE_PRIMARY) {
          tapeteMode = true;
          if (!activeSubcategory || !String(activeSubcategory).startsWith("TAPETE_")) {
            activeSubcategory = "TAPETE_CENEFA";
          }
        } else {
          tapeteMode = false;
          activeSubcategory = "ALL_SUB";
        }

        categoryTabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        btn.classList.add("active");

        renderSubcategoryTabs();
        const visible = getFilteredModels();
        ensureCurrentModelFromFilteredList();
        await renderModelGrid(visible);
        updateHelpSteps();
        applyModeLayout();

        syncViewButtonsForModel(getModelById(currentModelId));
        await redraw();
      });

      categoryTabs.appendChild(btn);
    });

    renderSubcategoryTabs();
    updateHelpSteps();
  }


  modelSearch?.addEventListener("input", async () => {
    await renderModelGrid(getFilteredModels());
  });

  resetBtn?.addEventListener("click", async () => {
    if (isGroupMode()) {
      window.GroupEngine?.resetCurrent?.();
    }

    // Si estamos en tapete, limpiar completamente la retícula.
    if (isTapeteMode()) {
      if (window.GridEngine?.clear) window.GridEngine.clear(gridState);
      else if (gridState) {
        gridState.cells.clear();
        gridState.selectedKey = null;
        gridState.brush = null;
      }

      // 🔁 Reset real del modo tapete:
      // - borrar memorias de paletas por modelo (volver a monocromático)
      // - borrar brocha actual
      Object.keys(tapeteModelPalette).forEach(k => delete tapeteModelPalette[k]);
      if (gridState) gridState.brush = null;
    }
    Object.keys(globalPalette).forEach(k => delete globalPalette[k]);
    updateInfoBar();
    await renderTileEditor();
    await redraw();
  });

  rotateCellBtn?.addEventListener("click", async () => {
    if (!isTapeteMode() || !gridState || !window.GridEngine) return;
    window.GridEngine.clearSelected(gridState);
    await redraw();
  });

  exportBtn?.addEventListener("click", async () => {
    const model = getModelById(currentModelId);

    // Grupos: exportar composición completa + cada pieza con sus colores
    if (isGroupMode() && window.GroupEngine?.exportCurrent) {
      await window.GroupEngine.exportCurrent();
      return;
    }

    // Tapetes: exportar retícula completa + piezas (esquina/border/centro)
    if (isTapeteMode() && window.ExportManager?.exportTapete) {
      await window.ExportManager.exportTapete({
        containerId: "preview-grid",
        fileBase: "tapete",
        state: gridState,
        getPaletteForModel: (m) => {
          const key = getModelKey(m);
          return tapeteModelPalette[key] ? deepClone(tapeteModelPalette[key]) : {};
        },
        getCellPalette: (cell) => deepClone(cell?.palette || {})
      });
      return;
    }

    // Mosaico normal: export PNG visible
    const usedHex = (isTapeteMode() ? getTapeteUsedHex() : Object.values(globalPalette)).filter(Boolean);
    const uniqueHex = Array.from(new Set(usedHex.map(h => h.toLowerCase())));

    const usedColors = uniqueHex.map(hex => {
      const meta = findColorMetaByHex(hex);
      return meta ? `${meta.id ? meta.id + " - " : ""}${meta.name}` : hex;
    });

    const modelLabel = model ? displayModelName(model) : "mosaico";

    window.ExportManager?.exportPNG({
      containerId: "preview-grid",
      fileName: `${modelLabel.replace(/\s+/g,"_")}.png`,
      meta: {
        modelName: modelLabel,
        colorsCount: uniqueHex.length,
        colorsList: usedColors
      }
    });
  });

  // ---------- Init ----------
  // Carga los grupos declarados en assets/svg/grupos/manifest.json.
  if (window.GroupEngine?.loadRegistry) {
    try { await window.GroupEngine.loadRegistry(); }
    catch (error) { console.error("No fue posible cargar el registro de grupos:", error); }
  }

  loadModelsIntoSelect();
  renderPalette();
  renderCategoryTabs();
  setMeta();
  updateInfoBar();

  const initialModels = getFilteredModels();
  ensureCurrentModelFromFilteredList();
  renderModelGrid(initialModels).then(async () => {
    syncViewButtonsForModel(getModelById(currentModelId));
    if (currentModelId) setActiveModelCard(currentModelId);
    applyModeLayout();
    await redraw();
  });
});
