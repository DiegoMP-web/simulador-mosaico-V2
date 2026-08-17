// js/pattern-engine.js
// Render de mosaicos cuadrados (grid) y hexagonales (layout por coordenadas)

function getRotation(model, r, c) {
  if (!model || !model.rotate) return 0;

  const rr = r % 2;
  const cc = c % 2;

  // Patrón 2x2 estándar:
  // [0, 90]
  // [270, 180]
  if (rr === 0 && cc === 0) return 0;
  if (rr === 0 && cc === 1) return 90;
  if (rr === 1 && cc === 0) return 270;
  return 180;
}

function paintNode(node, hex) {
  if (!node || !hex) return;

  const tag = (el) => (el.tagName || "").toLowerCase();
  const isShape = (el) => ["path", "polygon", "rect", "circle", "ellipse"].includes(tag(el));

  if (isShape(node)) node.setAttribute("fill", hex);

  node.querySelectorAll("*").forEach((el) => {
    if (isShape(el)) el.setAttribute("fill", hex);
  });
}

function applyColors(svgEl, palette) {
  if (!svgEl || !palette) return;

  Object.entries(palette).forEach(([layerId, hex]) => {
    const node = svgEl.querySelector(`#${CSS.escape(layerId)}`);
    paintNode(node, hex);
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

async function renderPattern({
  container,
  model,
  view,
  palette,
  selectedTileKey,
  onTileSelect,
  onLayerClick
}) {
  if (!container) return;
  container.innerHTML = "";

  if (!model) {
    container.innerHTML = '<div class="empty-state">Elige un modelo para comenzar.</div>';
    return;
  }

  const isHex = model?.folder === "hex";

  // =========================
  // 🧱 CENEFAS (frame_simple)
  // =========================
  const isCenefa = !!(
    model &&
    (model.shape === "cenefa" ||
      model.shape === "CENEFAS" ||
      model.unit?.type === "frame_simple")
  );
  if (isCenefa) {
    await renderFrameSimple(container, model);
    return;
  }

  const modelUrl = window.getModelUrl(model);
  const svgText = await window.loadSvgText(modelUrl);

  // =========================
  // ⬡ HEX: layout por coordenadas + tiles recortados a hex (clip-path)
  // Views esperadas: 1 / 3 / 16
  // =========================
  if (isHex) {
    container.style.position = "relative";
    container.style.display = "block";
    container.style.setProperty("--grid-rows", "1");
    container.style.setProperty("--grid-cols", "1");

    // ✅ HEX: para evitar corrimientos y scroll horizontal, NO dependemos del ancho CSS.
    // Calculamos el tamaño del patrón (totalW/totalH), le damos ese tamaño al contenedor
    // y lo centramos con margin:auto. Así las piezas siempre quedan centradas y sin overflow.
    const padding = 18;

    // coords axiales (q,r)
    let coords = [];
    if (view === 1) {
      coords = [{ q: 0, r: 0 }];
    } else if (view === 3) {
      coords = [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 1 },
      ];
    } else {
      // 16 (4x4)
      for (let q = 0; q < 4; q++) {
        for (let r = 0; r < 4; r++) coords.push({ q, r });
      }
    }

    const SQRT3 = Math.sqrt(3);

    // axial -> pixel (flat-top)
    // x = size * 3/2 * q
    // y = size * sqrt(3) * (r + q/2)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const points = coords.map(({ q, r }) => {
      const ux = 1.5 * q;
      const uy = SQRT3 * (r + q / 2);
      minX = Math.min(minX, ux);
      minY = Math.min(minY, uy);
      maxX = Math.max(maxX, ux);
      maxY = Math.max(maxY, uy);
      return { q, r, ux, uy };
    });

    const spanX = (maxX - minX) + 2;      // (max-min) + tileW/size
    const spanY = (maxY - minY) + SQRT3;  // (max-min) + tileH/size

    // Tamaños razonables por vista (min/max) para que no se vea desproporcionado vs cuadrados
    const minSize = (view === 1) ? 160 : (view === 3) ? 115 : 80;
    const maxSize = (view === 1) ? 220 : (view === 3) ? 155 : 105;

    // 1) Tamaño objetivo por vista (se ajusta al ancho disponible para evitar scroll)
    const target = (view === 1) ? 210 : (view === 3) ? 150 : 105;
    let size = Math.max(Math.min(target, maxSize), minSize);

    // Si el patrón no cabe en el wrapper, reducimos size proporcionalmente.
    const availableW = container.parentElement?.clientWidth || window.innerWidth || 900;
    const wantW = (spanX * size) + padding * 2;
    if (wantW > availableW - 8) {
      const scale = Math.max(0.35, (availableW - padding * 2 - 8) / (spanX * size));
      size = size * scale;
    }

    const tileW = 2 * size;
    const tileH = SQRT3 * size;

    // 2) Dimensiones finales del patrón (en px)
    const totalW = spanX * size;
    const totalH = spanY * size;

    const finalW = Math.round(totalW + padding * 2);
    const finalH = Math.round(totalH + padding * 2);

    container.style.width = `${finalW}px`;
    container.style.height = `${finalH}px`;
    container.style.margin = "0 auto";

    // 3) Offset para que el patrón “arranque” en padding, compensando minX/minY
    const offsetX = padding - (minX * size);
    const offsetY = padding - (minY * size);

    points.forEach(({ q, r, ux, uy }) => {
      const key = `${q},${r}`;

      const tile = document.createElement("div");
      tile.className = "tile hex";
      tile.dataset.key = key;

      tile.style.position = "absolute";
      tile.style.left = `${offsetX + ux * size}px`;
      tile.style.top = `${offsetY + uy * size}px`;
      tile.style.width = `${tileW}px`;
      tile.style.height = `${tileH}px`;
      tile.style.overflow = "hidden";

      if (key === selectedTileKey) tile.classList.add("selected");

      tile.innerHTML = svgText;

      const svgEl = tile.querySelector("svg");
      if (svgEl) {
        svgEl.setAttribute("width", "100%");
        svgEl.setAttribute("height", "100%");
        svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svgEl.style.display = "block";

        applyColors(svgEl, palette);

        // rotación hex por ahora 0
        svgEl.style.transform = "rotate(0deg)";
        svgEl.style.transformOrigin = "50% 50%";
      }

      tile.addEventListener("click", (ev) => {
        if (typeof onTileSelect === "function") onTileSelect(key);

        const svg = tile.querySelector("svg");
        if (!svg) return;

        const layerId = findLayerId(ev.target, svg);
        if (layerId && typeof onLayerClick === "function") onLayerClick(layerId, key);
      });

      container.appendChild(tile);
    });

    return;
  }

  // =========================
  // 🟦 CUADRADOS: grid original (1/4/24)
  // =========================
  let rows, cols;
  if (view === 1) { rows = 1; cols = 1; }
  else if (view === 4) { rows = 2; cols = 2; }
  else { rows = 4; cols = 6; } // 24

  container.style.setProperty("--grid-rows", rows);
  container.style.setProperty("--grid-cols", cols);

  container.style.position = "";
  container.style.display = "";
  container.style.height = "";
  container.style.width = "";
  container.style.margin = "";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r}-${c}`;

      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.key = key;
      if (key === selectedTileKey) tile.classList.add("selected");

      tile.innerHTML = svgText;

      const svgEl = tile.querySelector("svg");
      if (svgEl) {
        svgEl.setAttribute("width", "100%");
        svgEl.setAttribute("height", "100%");
        svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

        applyColors(svgEl, palette);

        const rot = getRotation(model, r, c);
        svgEl.style.transform = `rotate(${rot}deg)`;
        svgEl.style.transformOrigin = "50% 50%";
        svgEl.style.display = "block";
      }

      tile.addEventListener("click", (ev) => {
        if (typeof onTileSelect === "function") onTileSelect(key);

        const svg = tile.querySelector("svg");
        if (!svg) return;

        const layerId = findLayerId(ev.target, svg);
        if (layerId && typeof onLayerClick === "function") onLayerClick(layerId, key);
      });

      container.appendChild(tile);
    }
  }
}

window.renderPattern = renderPattern;
