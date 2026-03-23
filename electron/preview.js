(() => {
  const root = document.getElementById("root");
  const card = document.getElementById("card");
  const img = document.getElementById("img");
  const thumb = document.getElementById("thumb");
  const controls = document.getElementById("controls");
  const editor = document.getElementById("editor");
  const canvas = document.getElementById("editorCanvas");
  const btnDoneEdit = document.getElementById("btnDoneEdit");
  const toolRect = document.getElementById("toolRect");
  const toolArrow = document.getElementById("toolArrow");
  const toolText = document.getElementById("toolText");
  const btnCopy = document.getElementById("btnCopy");
  const btnSave = document.getElementById("btnSave");
  const btnEdit = document.getElementById("btnEdit");
  const btnClose = document.getElementById("btnClose");
  const btnPin = document.getElementById("btnPin");

  let autoHideTimer = null;
  let expandTimer = null;
  let collapseTimer = null;
  let pinned = false;
  let expanded = false;
  let editMode = false;
  let closing = false;
  let sourceDataUrl = "";

  let activeTool = "rect";
  let isDrawing = false;
  let dragStart = null;
  let dragCurrent = null;
  let annotations = [];
  let baseImage = null;
  let imageRect = null;
  let rafId = 0;

  const HIDE_MS = 5000;
  const FADE_MS = 220;
  const HOVER_EXPAND_DELAY_MS = 100;
  const HOVER_COLLAPSE_DELAY_MS = 150;
  const ctx = canvas.getContext("2d");

  function clearAutoHide() {
    if (!autoHideTimer) return;
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  function clearHoverTimers() {
    if (expandTimer) {
      clearTimeout(expandTimer);
      expandTimer = null;
    }
    if (collapseTimer) {
      clearTimeout(collapseTimer);
      collapseTimer = null;
    }
  }

  function scheduleAutoHide() {
    clearAutoHide();
    if (pinned || editMode) return;
    autoHideTimer = setTimeout(() => {
      requestClose();
    }, HIDE_MS);
  }

  function setExpanded(v) {
    if (editMode) return;
    expanded = v;
    if (expanded) {
      card.classList.add("expanded");
      controls.classList.add("visible");
      window.previewAPI.expand();
    } else {
      card.classList.remove("expanded");
      controls.classList.remove("visible");
      window.previewAPI.collapse();
    }
  }

  function setTool(tool) {
    activeTool = tool;
    toolRect.classList.toggle("active", tool === "rect");
    toolArrow.classList.toggle("active", tool === "arrow");
    toolText.classList.toggle("active", tool === "text");
    canvas.style.cursor = tool === "text" ? "text" : "crosshair";
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderNow();
  }

  function computeImageRect() {
    if (!baseImage) return null;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const iw = baseImage.naturalWidth || baseImage.width;
    const ih = baseImage.naturalHeight || baseImage.height;
    if (!cw || !ch || !iw || !ih) return null;
    const scale = Math.min(cw / iw, ch / ih);
    const width = iw * scale;
    const height = ih * scale;
    const x = (cw - width) / 2;
    const y = (ch - height) / 2;
    return { x, y, width, height };
  }

  function drawArrow(shape, drawingContext) {
    const { x1, y1, x2, y2 } = shape;
    const headLen = 12;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    drawingContext.strokeStyle = "#60a5fa";
    drawingContext.lineWidth = 3;
    drawingContext.lineCap = "round";
    drawingContext.lineJoin = "round";
    drawingContext.beginPath();
    drawingContext.moveTo(x1, y1);
    drawingContext.lineTo(x2, y2);
    drawingContext.stroke();
    drawingContext.beginPath();
    drawingContext.moveTo(x2, y2);
    drawingContext.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    drawingContext.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    drawingContext.closePath();
    drawingContext.fillStyle = "#60a5fa";
    drawingContext.fill();
  }

  function drawRect(shape, drawingContext) {
    const x = Math.min(shape.x1, shape.x2);
    const y = Math.min(shape.y1, shape.y2);
    const w = Math.abs(shape.x2 - shape.x1);
    const h = Math.abs(shape.y2 - shape.y1);
    drawingContext.strokeStyle = "#22c55e";
    drawingContext.lineWidth = 3;
    drawingContext.strokeRect(x, y, w, h);
  }

  function drawText(shape, drawingContext) {
    drawingContext.fillStyle = "#ffffff";
    drawingContext.font = "600 18px -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";
    drawingContext.textBaseline = "top";
    drawingContext.fillText(shape.text, shape.x, shape.y);
  }

  function renderNow() {
    if (!ctx) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "rgba(10,12,16,0.65)";
    ctx.fillRect(0, 0, cw, ch);

    if (baseImage) {
      imageRect = computeImageRect();
      if (imageRect) {
        ctx.drawImage(baseImage, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
      }
    }

    for (const shape of annotations) {
      if (shape.type === "rect") drawRect(shape, ctx);
      if (shape.type === "arrow") drawArrow(shape, ctx);
      if (shape.type === "text") drawText(shape, ctx);
    }

    if (isDrawing && dragStart && dragCurrent) {
      const draft = {
        type: activeTool,
        x1: dragStart.x,
        y1: dragStart.y,
        x2: dragCurrent.x,
        y2: dragCurrent.y,
      };
      if (draft.type === "rect") drawRect(draft, ctx);
      if (draft.type === "arrow") drawArrow(draft, ctx);
    }
  }

  function render() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(renderNow);
  }

  function exportEditedDataUrl() {
    if (!baseImage || !imageRect) return sourceDataUrl || img.src;
    const out = document.createElement("canvas");
    out.width = Math.round(imageRect.width);
    out.height = Math.round(imageRect.height);
    const octx = out.getContext("2d");
    octx.drawImage(baseImage, 0, 0, out.width, out.height);
    const sx = out.width / imageRect.width;
    const sy = out.height / imageRect.height;

    for (const shape of annotations) {
      if (shape.type === "rect") {
        const x = (Math.min(shape.x1, shape.x2) - imageRect.x) * sx;
        const y = (Math.min(shape.y1, shape.y2) - imageRect.y) * sy;
        const w = Math.abs(shape.x2 - shape.x1) * sx;
        const h = Math.abs(shape.y2 - shape.y1) * sy;
        octx.strokeStyle = "#22c55e";
        octx.lineWidth = 3;
        octx.strokeRect(x, y, w, h);
      } else if (shape.type === "arrow") {
        const x1 = (shape.x1 - imageRect.x) * sx;
        const y1 = (shape.y1 - imageRect.y) * sy;
        const x2 = (shape.x2 - imageRect.x) * sx;
        const y2 = (shape.y2 - imageRect.y) * sy;
        drawArrow({ x1, y1, x2, y2 }, octx);
      } else if (shape.type === "text") {
        const x = (shape.x - imageRect.x) * sx;
        const y = (shape.y - imageRect.y) * sy;
        octx.fillStyle = "#ffffff";
        octx.font = "600 18px -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";
        octx.textBaseline = "top";
        octx.fillText(shape.text, x, y);
      }
    }
    return out.toDataURL("image/png");
  }

  function persistEditedImage() {
    const dataUrl = exportEditedDataUrl();
    sourceDataUrl = dataUrl;
    img.src = dataUrl;
    window.previewAPI.updateData(dataUrl);
  }

  function enterEditMode() {
    if (editMode) return;
    editMode = true;
    clearAutoHide();
    clearHoverTimers();
    controls.classList.remove("visible");
    thumb.style.opacity = "0";
    window.previewAPI.setEditMode(true);
    editor.classList.add("visible");
    setTimeout(() => {
      editor.classList.add("fade-in");
      thumb.style.display = "none";
      resizeCanvas();
      render();
    }, 24);
  }

  function exitEditMode() {
    if (!editMode) return;
    persistEditedImage();
    editMode = false;
    editor.classList.remove("fade-in");
    setTimeout(() => {
      editor.classList.remove("visible");
      thumb.style.display = "flex";
      setTimeout(() => {
        thumb.style.opacity = "1";
      }, 10);
    }, 180);
    window.previewAPI.setEditMode(false);
    if (!pinned) scheduleAutoHide();
  }

  function getCanvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pointInImage(p) {
    if (!imageRect) return true;
    return (
      p.x >= imageRect.x &&
      p.y >= imageRect.y &&
      p.x <= imageRect.x + imageRect.width &&
      p.y <= imageRect.y + imageRect.height
    );
  }

  function loadBaseImage(dataUrl) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.src = dataUrl;
    });
  }

  function requestClose() {
    if (closing) return;
    closing = true;
    clearHoverTimers();
    clearAutoHide();
    root.classList.remove("show");
    setTimeout(() => {
      window.previewAPI.closeNow();
      closing = false;
    }, FADE_MS);
  }

  function setPinned(v) {
    pinned = v;
    btnPin.classList.toggle("active", pinned);
    window.previewAPI.pin(pinned);
    if (pinned) clearAutoHide();
    else scheduleAutoHide();
  }

  card.addEventListener("mouseenter", () => {
    clearAutoHide();
    if (editMode) return;
    if (collapseTimer) {
      clearTimeout(collapseTimer);
      collapseTimer = null;
    }
    if (!expanded && !expandTimer) {
      expandTimer = setTimeout(() => {
        expandTimer = null;
        setExpanded(true);
      }, HOVER_EXPAND_DELAY_MS);
    }
  });

  card.addEventListener("mouseleave", () => {
    if (editMode || pinned) return;
    if (expandTimer) {
      clearTimeout(expandTimer);
      expandTimer = null;
    }
    if (!collapseTimer) {
      collapseTimer = setTimeout(() => {
        collapseTimer = null;
        setExpanded(false);
        scheduleAutoHide();
      }, HOVER_COLLAPSE_DELAY_MS);
    }
  });

  btnCopy.addEventListener("click", () => {
    if (editMode) persistEditedImage();
    window.previewAPI.copy();
    btnCopy.classList.add("pulse");
    setTimeout(() => btnCopy.classList.remove("pulse"), 240);
    scheduleAutoHide();
  });

  btnSave.addEventListener("click", () => {
    if (editMode) persistEditedImage();
    window.previewAPI.save();
    scheduleAutoHide();
  });

  btnEdit.addEventListener("click", () => {
    console.log("EDIT CLICKED");
    window.previewAPI.edit();
  });

  btnDoneEdit.addEventListener("click", () => {
    exitEditMode();
  });

  btnPin.addEventListener("click", () => {
    setPinned(!pinned);
  });

  btnClose.addEventListener("click", () => {
    requestClose();
  });

  toolRect.addEventListener("click", () => setTool("rect"));
  toolArrow.addEventListener("click", () => setTool("arrow"));
  toolText.addEventListener("click", () => setTool("text"));

  canvas.addEventListener("mousedown", (e) => {
    if (!editMode) return;
    const p = getCanvasPoint(e);
    if (!pointInImage(p)) return;
    if (activeTool === "text") {
      const value = window.prompt("Text");
      if (value && value.trim()) {
        annotations.push({ type: "text", x: p.x, y: p.y, text: value.trim() });
        render();
      }
      return;
    }
    isDrawing = true;
    dragStart = p;
    dragCurrent = p;
    render();
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!isDrawing || !editMode) return;
    dragCurrent = getCanvasPoint(e);
    render();
  });

  window.addEventListener("mouseup", () => {
    if (!isDrawing || !dragStart || !dragCurrent) return;
    if (activeTool === "rect" || activeTool === "arrow") {
      annotations.push({
        type: activeTool,
        x1: dragStart.x,
        y1: dragStart.y,
        x2: dragCurrent.x,
        y2: dragCurrent.y,
      });
    }
    isDrawing = false;
    dragStart = null;
    dragCurrent = null;
    render();
  });

  window.addEventListener("resize", () => {
    if (editMode) resizeCanvas();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (editMode) {
        exitEditMode();
        return;
      }
      requestClose();
      return;
    }
    if (!editMode) return;
    if (e.key.toLowerCase() === "r") setTool("rect");
    if (e.key.toLowerCase() === "a") setTool("arrow");
    if (e.key.toLowerCase() === "t") setTool("text");
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      annotations.pop();
      render();
    }
  });

  window.previewAPI.onShow(async (data) => {
    sourceDataUrl = data.dataUrl;
    img.src = sourceDataUrl;
    baseImage = await loadBaseImage(sourceDataUrl);
    annotations = [];
    imageRect = null;
    pinned = false;
    expanded = false;
    editMode = false;
    closing = false;
    clearHoverTimers();
    clearAutoHide();
    setTool("rect");
    editor.classList.remove("fade-in");
    editor.classList.remove("visible");
    thumb.style.display = "flex";
    thumb.style.opacity = "1";
    btnPin.classList.remove("active");
    controls.classList.remove("visible");
    card.classList.remove("expanded");
    root.classList.remove("show");
    void root.offsetWidth;
    root.classList.add("show");
    scheduleAutoHide();
  });

  window.previewAPI.onForcePin((value) => {
    setPinned(Boolean(value));
  });

  card.addEventListener("transitionend", (e) => {
    if (e.propertyName === "transform" && editMode) {
      resizeCanvas();
      render();
    }
  });
})();

