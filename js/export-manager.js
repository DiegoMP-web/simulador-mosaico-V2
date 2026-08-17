// js/export-manager.js
// Exporta el contenido SVG del container a PNG.
// En modo Tapetes, también exporta la retícula completa (SVG) y las piezas usadas
// separadas por: esquina, border, centro.

window.ExportManager = (() => {

  function downloadText(filename, text, mime = "image/svg+xml") {
    const blob = new Blob([text], { type: mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = filename;
    a.href = url;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function exportPNG({ containerId, fileName = "mosaico.png", meta = null }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Tomamos el primer SVG visible dentro del contenedor
    const svg = container.querySelector("svg");
    if (!svg) {
      console.warn("[ExportManager] No se encontró SVG para exportar.");
      return;
    }

    // Serializar SVG
    const cloned = svg.cloneNode(true);
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    // Asegura viewBox si falta
    if (!cloned.getAttribute("viewBox")) {
      const w = svg.getBoundingClientRect().width || 1000;
      const h = svg.getBoundingClientRect().height || 1000;
      cloned.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }

    const svgString = new XMLSerializer().serializeToString(cloned);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.decoding = "async";

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Tamaño base desde el SVG renderizado
      const rect = svg.getBoundingClientRect();
      const baseW = Math.max(800, Math.round(rect.width));
      const baseH = Math.max(800, Math.round(rect.height));

      // Footer
      const padding = 24;
      const lineH = 22;

      const lines = [];
      if (meta?.modelName) lines.push(`Modelo: ${meta.modelName}`);
      if (typeof meta?.colorsCount === "number") lines.push(`Colores usados: ${meta.colorsCount}`);
      if (meta?.colorsList?.length) {
        const joined = meta.colorsList.join(", ");
        const chunks = splitText(joined, 70);
        chunks.forEach((t, i) => lines.push(i === 0 ? `Colores: ${t}` : `         ${t}`));
      }

      const footerH = lines.length ? (padding + lines.length * lineH + padding) : 0;

      const canvas = document.createElement("canvas");
      canvas.width = baseW;
      canvas.height = baseH + footerH;

      const ctx = canvas.getContext("2d");

      // Fondo blanco total
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Dibuja imagen del mosaico centrada
      const scale = Math.min(baseW / img.width, baseH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const dx = (baseW - drawW) / 2;
      const dy = (baseH - drawH) / 2;

      ctx.drawImage(img, dx, dy, drawW, drawH);

      // Footer
      if (footerH) {
        const y0 = baseH;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, y0, baseW, footerH);

        ctx.strokeStyle = "rgba(0,0,0,.08)";
        ctx.beginPath();
        ctx.moveTo(0, y0);
        ctx.lineTo(baseW, y0);
        ctx.stroke();

        ctx.fillStyle = "#111";
        ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        let y = y0 + padding + 4;

        lines.forEach((t, idx) => {
          if (idx === 1) ctx.font = "600 15px system-ui, -apple-system, Segoe UI, Roboto, Arial";
          if (idx >= 2) ctx.font = "500 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
          ctx.fillText(t, padding, y);
          y += lineH;
        });
      }

      const a = document.createElement("a");
      a.download = fileName;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      console.warn("[ExportManager] Error cargando SVG como imagen.");
    };

    img.src = url;
  }

  function splitText(text, maxLen) {
    const words = String(text || "").split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? (cur + " " + w) : w;
      if (next.length > maxLen) {
        if (cur) lines.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);
    return lines;
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

  function applyRotation(svgEl, deg) {
    const rot = Number(deg || 0) % 360;
    if (!rot || !svgEl) return;
    const vb = svgEl.getAttribute("viewBox");
    let cx = 50, cy = 50;
    if (vb) {
      const parts = vb.split(/\s+/).map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        cx = parts[0] + parts[2] / 2;
        cy = parts[1] + parts[3] / 2;
      }
    }
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    while (svgEl.firstChild) g.appendChild(svgEl.firstChild);
    g.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);
    svgEl.appendChild(g);
  }

  async function getSvgTextForModel(model) {
    const direct = model?.svgPath || model?.path || null;
    if (direct) {
      const r = await fetch(direct);
      if (!r.ok) throw new Error(`HTTP ${r.status} al cargar: ${direct}`);
      return await r.text();
    }
    const url = window.getModelUrl(model);
    return await window.loadSvgText(url);
  }

  async function buildSvgStringForCell(cell) {
    if (!cell?.model) return null;
    const parser = new DOMParser();
    const svgText = await getSvgTextForModel(cell.model);
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) return null;

    applyColors(svgEl, cell.palette || {});
    applyRotation(svgEl, cell.rot || 0);

    svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return new XMLSerializer().serializeToString(svgEl);
  }

  function roleForPos(r, c, rows, cols) {
    const isTop = r === 0;
    const isBottom = r === rows - 1;
    const isLeft = c === 0;
    const isRight = c === cols - 1;
    const isCorner = (isTop || isBottom) && (isLeft || isRight);
    if (isCorner) return "esquina";
    if (isTop || isBottom || isLeft || isRight) return "border";
    return "centro";
  }

  async function exportTapete({ containerId = "preview-grid", gridState, rows, cols, fileBase = "tapete" }) {
    if (!gridState?.cells) return;

    // 1) PNG del grid (DOM actual)
    await exportPNG({ containerId, fileName: `${fileBase}.png`, meta: null });

    // 2) SVG completo
    const cellSize = 100;
    const w = cols * cellSize;
    const h = rows * cellSize;

    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    out += `<rect width="100%" height="100%" fill="#ffffff"/>`;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r}-${c}`;
        const cell = gridState.cells.get(key);
        if (!cell?.model) continue;

        const parser = new DOMParser();
        const svgText = await getSvgTextForModel(cell.model);
        const doc = parser.parseFromString(svgText, "image/svg+xml");
        const svgEl = doc.querySelector("svg");
        if (!svgEl) continue;

        applyColors(svgEl, cell.palette || {});
        applyRotation(svgEl, cell.rot || 0);

        const vb = svgEl.getAttribute("viewBox") || "0 0 100 100";
        const inner = svgEl.innerHTML;
        const x = c * cellSize;
        const y = r * cellSize;
        out += `<svg x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" viewBox="${vb}">${inner}</svg>`;
      }
    }

    out += `</svg>`;
    downloadText(`${fileBase}.svg`, out, "image/svg+xml");

    // 3) Piezas usadas por rol (deduplicadas por modelo+paleta+rot)
    const seen = { esquina: new Set(), border: new Set(), centro: new Set() };
    const counts = { esquina: 0, border: 0, centro: 0 };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r}-${c}`;
        const cell = gridState.cells.get(key);
        if (!cell?.model) continue;
        const role = roleForPos(r, c, rows, cols);
        const id = String(cell.model.id || cell.model.name || "model");
        const sig = `${id}|${Number(cell.rot || 0)}|${JSON.stringify(cell.palette || {})}`;
        if (seen[role].has(sig)) continue;
        seen[role].add(sig);

        const svgStr = await buildSvgStringForCell(cell);
        if (!svgStr) continue;
        counts[role] += 1;
        downloadText(`${fileBase}_${role}_${counts[role]}.svg`, svgStr, "image/svg+xml");
      }
    }
  }

  return { exportPNG, exportTapete };
})();
