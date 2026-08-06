// js/group-engine.js
// Módulo independiente para familias/grupos de 3 a 6 piezas.
// Estructura esperada:
// assets/svg/grupos/<id-del-grupo>/meta.json
// assets/svg/grupos/<id-del-grupo>/pieza-a.svg ... pieza-f.svg

(function () {
  const metaCache = new Map();
  const svgCache = new Map();
  const stateCache = new Map();
  let currentState = null;

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status} al cargar: ${url}`);
    return response.json();
  }

  async function fetchText(url) {
    if (svgCache.has(url)) return svgCache.get(url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} al cargar: ${url}`);
    const text = await response.text();
    svgCache.set(url, text);
    return text;
  }

  function resolveRelative(metaPath, relativePath) {
    return new URL(relativePath, new URL(metaPath, window.location.href)).href;
  }

  function normalizeMeta(rawMeta, metaPath) {
    const meta = deepClone(rawMeta);
    const pieces = Array.isArray(meta.pieces) ? meta.pieces.slice(0, 6) : [];
    if (pieces.length < 1) {
      throw new Error(`El grupo ${meta.id || meta.name || metaPath} no contiene piezas.`);
    }
    meta.isDraft = pieces.length < 3;

    meta.id = String(meta.id || "grupo-sin-id");
    meta.name = String(meta.name || meta.id);
    meta.type = "group";
    meta.metaPath = metaPath;
    meta.pieces = pieces.map((piece, index) => {
      const id = String(piece.id || `pieza-${String.fromCharCode(97 + index)}`);
      const file = String(piece.file || `${id}.svg`);
      return {
        id,
        name: String(piece.name || `Pieza ${String.fromCharCode(65 + index)}`),
        file,
        svgPath: piece.svgPath || resolveRelative(metaPath, file)
      };
    });

    const defaultColumns = Math.min(3, meta.pieces.length);
    const columns = Math.max(1, Number(meta.layout?.columns || defaultColumns));
    const rows = Math.max(1, Number(meta.layout?.rows || Math.ceil(meta.pieces.length / columns)));
    const validIds = new Set(meta.pieces.map((piece) => piece.id));
    let order = Array.isArray(meta.layout?.order) ? meta.layout.order.filter((id) => validIds.has(id)) : [];
    meta.pieces.forEach((piece) => {
      if (!order.includes(piece.id)) order.push(piece.id);
    });
    meta.layout = { columns, rows, order };
    return meta;
  }

  async function loadMeta(model) {
    if (!model?.metaPath && !model?.groupMeta) throw new Error("Grupo sin metaPath/groupMeta.");
    const cacheKey = model.metaPath || model.id;
    if (metaCache.has(cacheKey)) return metaCache.get(cacheKey);
    const raw = model.groupMeta || await fetchJson(model.metaPath);
    const normalized = normalizeMeta(raw, model.metaPath || window.location.href);
    metaCache.set(cacheKey, normalized);
    return normalized;
  }

  async function loadRegistry(manifestPath = "assets/svg/grupos/manifest.json") {
    let manifest;
    try {
      manifest = await fetchJson(manifestPath);
    } catch (error) {
      console.warn("[GroupEngine] No se encontró manifest de grupos:", error.message);
      return [];
    }

    const entries = Array.isArray(manifest) ? manifest : (manifest.groups || []);
    const models = [];

    for (const entry of entries) {
      try {
        const metaPath = typeof entry === "string" ? resolveRelative(manifestPath, entry) : resolveRelative(manifestPath, entry.meta);
        const raw = await fetchJson(metaPath);
        const meta = normalizeMeta(raw, metaPath);
        const model = {
          id: meta.id,
          name: meta.name,
          type: "group",
          category: "GRUPOS",
          folder: "grupos",
          isGroup: true,
          metaPath,
          groupMeta: meta
        };
        models.push(model);
      } catch (error) {
        console.error("[GroupEngine] Error cargando grupo:", entry, error);
      }
    }

    window.MOSAIC_MODELS = window.MOSAIC_MODELS || [];
    models.forEach((model) => {
      if (!window.MOSAIC_MODELS.some((existing) => existing.id === model.id)) {
        window.MOSAIC_MODELS.push(model);
      }
    });
    return models;
  }

  async function selectGroup(model) {
    const meta = await loadMeta(model);
    if (currentState?.model?.id === model.id) return currentState;
    if (stateCache.has(model.id)) {
      currentState = stateCache.get(model.id);
      currentState.model = model;
      return currentState;
    }

    const palettes = {};
    meta.pieces.forEach((piece) => { palettes[piece.id] = {}; });
    currentState = {
      model,
      meta,
      palettes,
      selectedPieceId: meta.pieces[0].id
    };
    stateCache.set(model.id, currentState);
    return currentState;
  }

  function getCurrentState() {
    return currentState;
  }

  function getSelectedPiece() {
    if (!currentState) return null;
    return currentState.meta.pieces.find((piece) => piece.id === currentState.selectedPieceId) || null;
  }

  function selectPiece(pieceId) {
    if (!currentState) return false;
    if (!currentState.meta.pieces.some((piece) => piece.id === pieceId)) return false;
    currentState.selectedPieceId = pieceId;
    return true;
  }

  function resetCurrent() {
    if (!currentState) return;
    currentState.meta.pieces.forEach((piece) => { currentState.palettes[piece.id] = {}; });
    currentState.selectedPieceId = currentState.meta.pieces[0]?.id || null;
  }

  function isEditableShape(element) {
    return ["path", "polygon", "rect", "circle", "ellipse"].includes((element?.tagName || "").toLowerCase());
  }

  function applyColors(svgEl, palette) {
    Object.entries(palette || {}).forEach(([layerId, hex]) => {
      const node = svgEl.querySelector(`#${CSS.escape(layerId)}`);
      if (!node || !hex) return;
      if (isEditableShape(node)) node.setAttribute("fill", hex);
      node.querySelectorAll("path,polygon,rect,circle,ellipse").forEach((shape) => shape.setAttribute("fill", hex));
    });
  }

  function findLayerId(target, svgRoot) {
    let node = target;
    while (node && node !== svgRoot) {
      if (node.id && /^c\d+$/i.test(node.id)) return node.id;
      node = node.parentNode;
    }
    return null;
  }

  async function createPieceSvg(piece, palette = {}) {
    const text = await fetchText(piece.svgPath);
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) throw new Error(`SVG inválido: ${piece.svgPath}`);
    applyColors(svg, palette);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.display = "block";
    return svg;
  }

  async function buildCompositeSvg(state = currentState) {
    if (!state) return null;
    const { columns, rows, order } = state.meta.layout;
    const cellSize = 100;
    const outer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    outer.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    outer.setAttribute("viewBox", `0 0 ${columns * cellSize} ${rows * cellSize}`);
    outer.setAttribute("width", "100%");
    outer.setAttribute("height", "100%");
    outer.setAttribute("preserveAspectRatio", "xMidYMid meet");
    outer.classList.add("group-composite-svg");

    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("width", "100%");
    background.setAttribute("height", "100%");
    background.setAttribute("fill", "#cac6bf");
    outer.appendChild(background);

    for (let index = 0; index < order.length; index += 1) {
      const pieceId = order[index];
      const piece = state.meta.pieces.find((item) => item.id === pieceId);
      if (!piece) continue;
      const sourceSvg = await createPieceSvg(piece, state.palettes[piece.id] || {});
      const nested = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const col = index % columns;
      const row = Math.floor(index / columns);
      nested.setAttribute("x", String(col * cellSize));
      nested.setAttribute("y", String(row * cellSize));
      nested.setAttribute("width", String(cellSize));
      nested.setAttribute("height", String(cellSize));
      nested.setAttribute("viewBox", sourceSvg.getAttribute("viewBox") || "0 0 100 100");
      nested.setAttribute("preserveAspectRatio", "xMidYMid meet");
      nested.innerHTML = sourceSvg.innerHTML;
      outer.appendChild(nested);
    }
    return outer;
  }

  async function renderEditor({ container, activeColor, onChange }) {
    if (!container) return;
    if (!currentState) {
      container.innerHTML = '<div class="empty-state">Selecciona un grupo.</div>';
      return;
    }
    const piece = getSelectedPiece();
    if (!piece) return;
    container.innerHTML = "";
    const svg = await createPieceSvg(piece, currentState.palettes[piece.id] || {});
    svg.addEventListener("click", async (event) => {
      const layerId = findLayerId(event.target, svg);
      const color = typeof activeColor === "function" ? activeColor() : activeColor;
      if (!layerId || !color?.hex) return;
      currentState.palettes[piece.id] = currentState.palettes[piece.id] || {};
      currentState.palettes[piece.id][layerId] = color.hex;
      if (typeof onChange === "function") await onChange(piece.id, layerId, color.hex);
    });
    container.appendChild(svg);
  }

  async function renderPieceList({ container, onSelect }) {
    if (!container) return;
    container.innerHTML = "";
    if (!currentState) return;

    if (currentState.meta.isDraft) {
      const note = document.createElement("div");
      note.className = "group-draft-note";
      note.textContent = `Grupo en construcción: ${currentState.meta.pieces.length} pieza(s) cargada(s). El grupo final deberá tener de 3 a 6 piezas.`;
      container.appendChild(note);
    }

    for (const piece of currentState.meta.pieces) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `group-piece-card${piece.id === currentState.selectedPieceId ? " active" : ""}`;
      button.dataset.pieceId = piece.id;

      const thumb = document.createElement("div");
      thumb.className = "group-piece-thumb";
      const label = document.createElement("span");
      label.className = "group-piece-label";
      label.textContent = piece.name;
      button.append(thumb, label);
      container.appendChild(button);

      try {
        thumb.appendChild(await createPieceSvg(piece, currentState.palettes[piece.id] || {}));
      } catch (error) {
        thumb.innerHTML = '<span class="thumb-ph">Sin vista</span>';
      }

      button.addEventListener("click", async () => {
        selectPiece(piece.id);
        if (typeof onSelect === "function") await onSelect(piece.id);
      });
    }
  }

  async function renderPreview({ container }) {
    if (!container) return;
    container.innerHTML = "";
    if (currentState?.meta?.layout) {
      container.style.aspectRatio = `${currentState.meta.layout.columns} / ${currentState.meta.layout.rows}`;
      container.style.minHeight = "0";
    }
    const svg = await buildCompositeSvg();
    if (!svg) {
      container.innerHTML = '<div class="empty-state">Selecciona un grupo.</div>';
      return;
    }
    container.appendChild(svg);
  }

  async function createThumbnail(model) {
    const meta = await loadMeta(model);
    const palettes = {};
    meta.pieces.forEach((piece) => { palettes[piece.id] = {}; });
    return buildCompositeSvg({ model, meta, palettes, selectedPieceId: meta.pieces[0].id });
  }

  function getUsedHex() {
    if (!currentState) return [];
    const colors = [];
    Object.values(currentState.palettes).forEach((palette) => {
      Object.values(palette || {}).forEach((hex) => { if (hex) colors.push(String(hex).toLowerCase()); });
    });
    return colors;
  }

  function downloadText(fileName, content, mime = "image/svg+xml") {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 600);
  }

  async function svgToPngDownload(svg, fileName) {
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const text = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = Math.round(1200 * image.height / image.width);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const link = document.createElement("a");
    link.download = fileName;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function exportCurrent() {
    if (!currentState) return;
    const base = currentState.meta.id.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
    const composite = await buildCompositeSvg();
    const compositeText = new XMLSerializer().serializeToString(composite);
    downloadText(`${base}-grupo.svg`, compositeText);
    await svgToPngDownload(composite, `${base}-grupo.png`);

    for (const piece of currentState.meta.pieces) {
      const svg = await createPieceSvg(piece, currentState.palettes[piece.id] || {});
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      downloadText(`${base}-${piece.id}.svg`, new XMLSerializer().serializeToString(svg));
    }
  }

  window.GroupEngine = {
    loadRegistry,
    selectGroup,
    getCurrentState,
    getSelectedPiece,
    selectPiece,
    resetCurrent,
    renderEditor,
    renderPieceList,
    renderPreview,
    createThumbnail,
    getUsedHex,
    exportCurrent
  };
})();
