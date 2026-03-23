"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useCallback,
} from "react";

const PLACEHOLDER_W = 800;
const PLACEHOLDER_H = 500;

export type Tool =
  | "select"
  | "rectangle"
  | "roundedRectangle"
  | "line"
  | "arrow"
  | "draw"
  | "rect"
  | "roundedRect"
  | "circle"
  | "text"
  | "blur"
  | "highlight"
  | "number"
  | "marker"
  | "crop"
  | "background"
  | "shadow"
  | "zoom"
  | "pin";

export type CanvasEditorHandle = {
  loadImage: (file: File) => Promise<void>;
  loadImageFromDataUrl: (dataUrl: string) => Promise<void>;
  setActiveTool: (tool: Tool) => void;
  deleteSelected: () => void;
  clearAll: () => Promise<void>;
  copyToClipboard: () => Promise<void>;
  saveToFile: () => Promise<void>;
  download: (options: { watermark: boolean }) => void;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type Props = {
  onToolChange?: (tool: Tool) => void;
  activeTool?: Tool;
};

const CanvasEditor = forwardRef<CanvasEditorHandle, Props>(
  function CanvasEditor({ onToolChange, activeTool }, ref) {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = useRef<any>(null);
    const pendingImageRef = useRef<string | null>(null);
    const lastImageRef = useRef<string | null>(null);
    const fabricRef = useRef<any>(null);
    const initRef = useRef<Promise<any> | null>(null);
    const toolRef = useRef<Tool>("select");
    const currentToolRef = useRef<Tool>("select");
    const isDrawingRef = useRef(false);
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const currentRef = useRef<any>(null);
    const markerCount = useRef(0);
    const drawingState = useRef<{ startX: number; startY: number; obj: any } | null>(null);
    const rafPendingRef = useRef(false);
    const defaultShadowEnabledRef = useRef(false);
    const backgroundPaddingRef = useRef(0);
    const pinnedRef = useRef(false);

    // ─── Canvas init ──────────────────────────────────────────────────
    const disposingRef = useRef<Promise<any> | null>(null);

    const getCanvas = useCallback(async () => {
      if (typeof window === "undefined") throw new Error("No window");
      if (canvasRef.current) return canvasRef.current;
      if (initRef.current) return initRef.current;

      // If a previous instance is still disposing (React Strict Mode),
      // wait for it to finish before creating a new one.
      if (disposingRef.current) {
        await disposingRef.current;
        disposingRef.current = null;
      }

      initRef.current = (async () => {
        const fabric = await import("fabric");
        const el = canvasElRef.current;
        if (!el) throw new Error("Canvas element missing");

        // Never initialize without disposing any previous instance.
        if (canvasRef.current) {
          await canvasRef.current.dispose();
          canvasRef.current = null;
          fabricRef.current = null;
        }

        const canvas = new fabric.Canvas(el, {
          width: window.innerWidth,
          height: window.innerHeight,
          enableRetinaScaling: true,
          preserveObjectStacking: true,
          selection: true,
        });
        if ((fabric as any).PencilBrush) {
          canvas.freeDrawingBrush = new (fabric as any).PencilBrush(canvas);
          if (canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.width = 3;
            canvas.freeDrawingBrush.color = "#ef4444";
          }
        }
        canvas.selection = true;
        canvas.perPixelTargetFind = true;
        canvas.targetFindTolerance = 8;
        if (typeof (canvas as any).setBackgroundColor === "function") {
          (canvas as any).setBackgroundColor("#1a1a1a", canvas.renderAll.bind(canvas));
        } else {
          canvas.backgroundColor = "#1a1a1a";
          canvas.renderAll();
        }
        canvasRef.current = canvas;
        fabricRef.current = canvas;
        return canvas;
      })();
      return initRef.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Lifecycle ────────────────────────────────────────────────────
    useEffect(() => {
      let disposed = false;
      void getCanvas().then((canvas) => {
        if (disposed) return;
        canvas.on("mouse:down", (opt: any) => onMouseDown(opt, canvas));
        canvas.on("mouse:move", (opt: any) => onMouseMove(opt, canvas));
        canvas.on("mouse:up", (opt: any) => onMouseUp(opt, canvas));
        canvas.on("selection:created", () => canvas.renderAll());
        canvas.on("selection:updated", () => canvas.renderAll());
        if (pendingImageRef.current) {
          const queued = pendingImageRef.current;
          pendingImageRef.current = null;
          void loadImageIntoCanvas(queued);
        }
      });
      return () => {
        disposed = true;
        const c = canvasRef.current ?? fabricRef.current;
        canvasRef.current = null;
        fabricRef.current = null;
        initRef.current = null;
        if (c) {
          disposingRef.current = c.dispose();
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getCanvas]);

    // ─── Delete key ───────────────────────────────────────────────────
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key !== "Delete") return;
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        deleteSelectedObjects();
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, []);

    function deleteSelectedObjects() {
      const c = fabricRef.current;
      if (!c) return;
      const active = c.getActiveObject();
      if (active && !(active as any)._isBackground) {
        c.remove(active);
      }
      c.getActiveObjects().forEach((o: any) => {
        if (!(o as any)._isBackground) c.remove(o);
      });
      c.discardActiveObject();
      c.requestRenderAll();
    }

    function makeInteractive(obj: any) {
      obj.set({
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        cornerColor: "#2f6df6",
        borderColor: "#2f6df6",
        cornerSize: 8,
        padding: 6,
      });
    }

    function bringToFront(canvas: any, obj: any) {
      if (!canvas || !obj) return;
      if (typeof canvas.bringObjectToFront === "function") {
        canvas.bringObjectToFront(obj);
      } else if (typeof canvas.bringToFront === "function") {
        canvas.bringToFront(obj);
      } else if (typeof obj.bringToFront === "function") {
        obj.bringToFront();
      }
    }

    function normalizeToolName(t: Tool): Tool {
      if (t === "rectangle") return "rect";
      if (t === "roundedRectangle") return "roundedRect";
      if (t === "number") return "marker";
      return t;
    }

    function makeShadow(fabric: any) {
      return new fabric.Shadow({
        color: "rgba(0,0,0,0.35)",
        blur: 16,
        offsetX: 0,
        offsetY: 6,
      });
    }

    async function applyShadowToSelection() {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObjects();
      if (!active.length) {
        defaultShadowEnabledRef.current = !defaultShadowEnabledRef.current;
        return;
      }
      const fabric = await import("fabric");
      active.forEach((obj: any) => {
        obj.set({ shadow: makeShadow(fabric) });
      });
      canvas.renderAll();
    }

    async function addZoomLensAt(pointerX: number, pointerY: number) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const sourceCanvas: HTMLCanvasElement | undefined = canvas.lowerCanvasEl;
      if (!sourceCanvas) return;
      const lensSize = 84;
      const sourceSize = 42;
      const sx = Math.max(0, Math.round(pointerX - sourceSize / 2));
      const sy = Math.max(0, Math.round(pointerY - sourceSize / 2));

      const out = document.createElement("canvas");
      out.width = lensSize;
      out.height = lensSize;
      const ctx = out.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, lensSize, lensSize);
      ctx.save();
      ctx.beginPath();
      ctx.arc(lensSize / 2, lensSize / 2, lensSize / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        sourceCanvas,
        sx,
        sy,
        sourceSize,
        sourceSize,
        0,
        0,
        lensSize,
        lensSize
      );
      ctx.restore();
      ctx.beginPath();
      ctx.arc(lensSize / 2, lensSize / 2, lensSize / 2 - 2, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      const dataUrl = out.toDataURL("image/png");
      const fabric = await import("fabric");
      const imageCtor = (fabric as any).Image;
      const fabricImageCtor = (fabric as any).FabricImage;
      let lensImage: any = null;
      if (imageCtor?.fromURL && imageCtor.fromURL.length >= 2) {
        lensImage = await new Promise((resolve) => {
          imageCtor.fromURL(dataUrl, (img: any) => resolve(img));
        });
      } else if (fabricImageCtor?.fromURL) {
        lensImage = await fabricImageCtor.fromURL(dataUrl, { crossOrigin: "anonymous" });
      }
      if (!lensImage) return;
      lensImage.set({
        left: Math.round(pointerX - lensSize / 2),
        top: Math.round(pointerY - lensSize / 2),
      });
      makeInteractive(lensImage);
      canvas.add(lensImage);
      bringToFront(canvas, lensImage);
      canvas.setActiveObject(lensImage);
      canvas.renderAll();
    }

    // ─── Tool switching ──────────────────────────────────────────────
    function setTool(t: Tool) {
      const normalized = normalizeToolName(t);
      toolRef.current = normalized;
      currentToolRef.current = normalized;
      onToolChange?.(t);
      const c = fabricRef.current;
      if (!c) return;
      c.isDrawingMode = normalized === "draw";
      c.selection = normalized === "select";
      c.defaultCursor = normalized === "select" ? "default" : "crosshair";
      c.perPixelTargetFind = true;
      c.targetFindTolerance = 8;
      if (normalized === "draw") {
        if (c.freeDrawingBrush) {
          c.freeDrawingBrush.width = 3;
          c.freeDrawingBrush.color = "#ef4444";
        }
      }
      c.getObjects().forEach((o: any) => {
        if (o._isBackground) return;
        if (normalized === "select" || normalized === "pin") {
          makeInteractive(o);
        } else {
          o.selectable = false;
          o.evented = false;
        }
      });
      c.discardActiveObject();
      c.renderAll();

      if (normalized === "background") {
        backgroundPaddingRef.current = backgroundPaddingRef.current > 0 ? 0 : 48;
        const queued = lastImageRef.current;
        if (queued) void applyBackgroundImage(queued, false);
        setTool("select");
        return;
      }

      if (normalized === "shadow") {
        void applyShadowToSelection().then(() => {
          setTool("select");
        });
        return;
      }

      if (normalized === "pin") {
        pinnedRef.current = !pinnedRef.current;
        void window.electronAPI?.setEditorPinned?.(pinnedRef.current);
        setTool("select");
      }
    }

    useEffect(() => {
      if (!activeTool) return;
      const normalized = normalizeToolName(activeTool);
      currentToolRef.current = normalized;
      setTool(activeTool);
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.isDrawingMode = normalized === "draw";
      canvas.selection = normalized === "select";
      canvas.defaultCursor = normalized === "select" ? "default" : "crosshair";
      canvas.renderAll();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTool]);

    // ─── Apply background image ──────────────────────────────────────
    const applyBackgroundImage = useCallback(
      async (dataUrl: string, clearObjects = false) => {
        const fabric = await import("fabric");
        const canvas = await getCanvas();
        if (!canvas) return;

        const applyImage = (img: any) => {
          if (clearObjects) {
            canvas.clear();
          }
          if (typeof (canvas as any).setBackgroundColor === "function") {
            const bgColor = backgroundPaddingRef.current > 0 ? "#0f172a" : "#1a1a1a";
            (canvas as any).setBackgroundColor(bgColor, canvas.renderAll.bind(canvas));
          } else {
            canvas.backgroundColor = backgroundPaddingRef.current > 0 ? "#0f172a" : "#1a1a1a";
          }
          const targetWidth = Math.max(1, canvas.getWidth() - backgroundPaddingRef.current * 2);
          const targetHeight = Math.max(1, canvas.getHeight() - backgroundPaddingRef.current * 2);
          const scale = Math.min(
            targetWidth / (img.width ?? PLACEHOLDER_W),
            targetHeight / (img.height ?? PLACEHOLDER_H)
          );
          img.set({
            originX: "center",
            originY: "center",
            left: canvas.getWidth() / 2,
            top: canvas.getHeight() / 2,
            scaleX: scale,
            scaleY: scale,
            selectable: false,
            evented: false,
          });
          (img as any)._isBackground = true;
          if (typeof (canvas as any).setBackgroundImage === "function") {
            (canvas as any).setBackgroundImage(img, () => {
              canvas.renderAll();
            });
          } else {
            (canvas as any).backgroundImage = img;
            canvas.renderAll();
          }
          markerCount.current = 0;
        };

        const imageCtor = (fabric as any).Image;
        const fabricImageCtor = (fabric as any).FabricImage;
        if (imageCtor?.fromURL && imageCtor.fromURL.length >= 2) {
          imageCtor.fromURL(dataUrl, (img: any) => {
            if (!img) return;
            applyImage(img);
          });
          return;
        }
        if (fabricImageCtor?.fromURL) {
          const img = await fabricImageCtor.fromURL(dataUrl, { crossOrigin: "anonymous" });
          if (img) applyImage(img);
        }
      },
      [getCanvas]
    );

    const loadImageIntoCanvas = useCallback(
      async (dataUrl: string) => {
        lastImageRef.current = dataUrl;
        await applyBackgroundImage(dataUrl, true);
      },
      [applyBackgroundImage]
    );

    useEffect(() => {
      const onResize = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (typeof canvas.setDimensions === "function") {
          canvas.setDimensions({ width: window.innerWidth, height: window.innerHeight });
        } else {
          // Fabric API compatibility fallback
          if (typeof canvas.setWidth === "function") {
            canvas.setWidth(window.innerWidth);
          } else {
            canvas.width = window.innerWidth;
          }
          if (typeof canvas.setHeight === "function") {
            canvas.setHeight(window.innerHeight);
          } else {
            canvas.height = window.innerHeight;
          }
        }
        const queued = lastImageRef.current;
        if (queued) {
          void applyBackgroundImage(queued, false);
        } else {
          canvas.renderAll();
        }
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, [applyBackgroundImage]);

    // ─── Clipboard image load (CleanShot-style) ──────────────────────
    const loadLatestClipboardImage = useCallback(async () => {
      const api = window.electronAPI;
      if (!api?.readClipboardImage) return;
      const dataUrl = await api.readClipboardImage();
      if (!dataUrl) return;
      if (!dataUrl.startsWith("data:image/")) return;
      console.log("📋 Loaded from clipboard");
      if (!canvasRef.current) {
        pendingImageRef.current = dataUrl;
        void getCanvas();
        return;
      }
      await loadImageIntoCanvas(dataUrl);
    }, [getCanvas, loadImageIntoCanvas]);

    useEffect(() => {
      void loadLatestClipboardImage();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const handlePaste = async () => {
        await loadLatestClipboardImage();
      };

      window.addEventListener("paste", handlePaste);
      return () => window.removeEventListener("paste", handlePaste);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const unsubscribe = window.electronAPI?.onClipboardImageUpdated?.(() => {
        void loadLatestClipboardImage();
      });
      return () => {
        if (typeof unsubscribe === "function") unsubscribe();
      };
    }, [loadLatestClipboardImage]);

    // ─── Mouse handlers ──────────────────────────────────────────────
    async function onMouseDown(opt: any, canvas: any) {
      const tool = currentToolRef.current;
      if (tool === "select" || tool === "draw" || tool === "background" || tool === "shadow" || tool === "pin") return;
      const pointer = canvas.getScenePoint(opt.e);
      const roundedX = Math.round(pointer.x);
      const roundedY = Math.round(pointer.y);
      const fabric = await import("fabric");

      if (tool === "zoom") {
        await addZoomLensAt(roundedX, roundedY);
        return;
      }

      if (tool === "text") {
        const text = new fabric.IText("Text", {
          left: roundedX, top: roundedY,
          fontSize: 24, fill: "#ffffff",
          fontFamily: "system-ui, sans-serif", fontWeight: "500",
          cornerStyle: "circle", transparentCorners: false,
          selectable: true, evented: true, hasControls: true, hasBorders: true,
        });
        canvas.add(text);
        bringToFront(canvas, text);
        canvas.setActiveObject(text);
        text.enterEditing();
        canvas.renderAll();
        return;
      }

      if (tool === "marker") {
        markerCount.current++;
        const n = markerCount.current;
        const bg = new fabric.Circle({
          radius: 16, fill: "#ef4444",
          originX: "center", originY: "center",
          left: roundedX, top: roundedY,
        });
        const lbl = new fabric.FabricText(String(n), {
          fontSize: 16, fill: "#ffffff",
          fontFamily: "system-ui, sans-serif", fontWeight: "700",
          originX: "center", originY: "center",
          left: roundedX, top: roundedY,
        });
        const group = new fabric.Group([bg, lbl], {
          left: roundedX - 16, top: roundedY - 16,
          cornerStyle: "circle", transparentCorners: false,
        });
        makeInteractive(group);
        canvas.add(group);
        bringToFront(canvas, group);
        canvas.setActiveObject(group);
        canvas.renderAll();
        return;
      }

      const ds: { startX: number; startY: number; obj: any } = {
        startX: roundedX, startY: roundedY, obj: null,
      };

      if (tool === "arrow" || tool === "line") {
        ds.obj = new fabric.Line(
          [roundedX, roundedY, roundedX, roundedY],
          { stroke: "#ef4444", strokeWidth: 3, selectable: false, evented: false }
        );
        canvas.add(ds.obj);
        bringToFront(canvas, ds.obj);
      } else if (
        tool === "rect" || tool === "roundedRect" || tool === "blur" ||
        tool === "highlight" || tool === "crop"
      ) {
        const withFill = tool === "highlight" || (tool === "rect" && !!opt?.e?.shiftKey);
        const fills: Record<string, string> = {
          rect: withFill ? "rgba(59,130,246,0.12)" : "rgba(0,0,0,0)",
          roundedRect: "rgba(59,130,246,0.12)",
          blur: "rgba(0,0,0,0.4)",
          highlight: "rgba(255,230,0,0.35)",
          crop: "rgba(255,255,255,0.08)",
        };
        const strokes: Record<string, string> = {
          rect: "rgba(59,130,246,0.95)",
          roundedRect: "rgba(59,130,246,0.95)",
          blur: "rgba(255,255,255,0.0)",
          highlight: "rgba(255,220,0,0.0)",
          crop: "rgba(255,255,255,0.6)",
        };
        ds.obj = new fabric.Rect({
          left: roundedX, top: roundedY, width: 0, height: 0,
          fill: fills[tool], stroke: strokes[tool],
          strokeWidth: tool === "crop" ? 2 : 1,
          strokeDashArray: tool === "crop" ? [6, 4] : undefined,
          selectable: false, evented: false,
          cornerStyle: "circle", transparentCorners: false,
          rx: tool === "roundedRect" ? 10 : 0,
          ry: tool === "roundedRect" ? 10 : 0,
        });
        canvas.add(ds.obj);
        bringToFront(canvas, ds.obj);
      } else if (tool === "circle") {
        ds.obj = new fabric.Circle({
          left: roundedX, top: roundedY, radius: 0,
          fill: "rgba(59,130,246,0.2)", stroke: "rgba(59,130,246,0.8)",
          strokeWidth: 2, selectable: false, evented: false,
          cornerStyle: "circle", transparentCorners: false,
        });
        canvas.add(ds.obj);
        bringToFront(canvas, ds.obj);
      }

      drawingState.current = ds;
      isDrawingRef.current = true;
      startRef.current = { x: roundedX, y: roundedY };
      currentRef.current = ds.obj;
      if (ds.obj) {
        canvas.renderAll();
      }
    }

    function onMouseMove(opt: any, canvas: any) {
      if (!isDrawingRef.current) return;
      const ds = drawingState.current;
      if (!ds?.obj || !startRef.current || !currentRef.current) return;
      const pointer = canvas.getScenePoint(opt.e);
      const roundedX = Math.round(pointer.x);
      const roundedY = Math.round(pointer.y);
      const dx = Math.abs(roundedX - ds.startX);
      const dy = Math.abs(roundedY - ds.startY);
      if (dx < 2 && dy < 2) return;
      const tool = currentToolRef.current;

      if (tool === "arrow" || tool === "line") {
        ds.obj.set({ x2: roundedX, y2: roundedY });
      } else if (tool === "circle") {
        const deltaX = roundedX - ds.startX;
        const deltaY = roundedY - ds.startY;
        ds.obj.set({
          radius: Math.sqrt(deltaX * deltaX + deltaY * deltaY) / 2,
          left: Math.round(Math.min(ds.startX, roundedX)),
          top: Math.round(Math.min(ds.startY, roundedY)),
        });
      } else {
        ds.obj.set({
          left: Math.round(Math.min(ds.startX, roundedX)),
          top: Math.round(Math.min(ds.startY, roundedY)),
          width: Math.abs(roundedX - ds.startX),
          height: Math.abs(roundedY - ds.startY),
        });
      }
      if (!rafPendingRef.current) {
        rafPendingRef.current = true;
        requestAnimationFrame(() => {
          canvas.renderAll();
          rafPendingRef.current = false;
        });
      }
    }

    async function onMouseUp(_opt: any, canvas: any) {
      const ds = drawingState.current;
      if (!ds?.obj) return;
      const tool = currentToolRef.current;

      ds.obj.setCoords();
      makeInteractive(ds.obj);

      if (tool === "arrow") {
        const fabric = await import("fabric");
        const line = ds.obj;
        const { x1, y1, x2, y2 } = line;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const hl = 14;
        const head = new fabric.Polygon(
          [{ x: 0, y: 0 }, { x: -hl, y: hl / 2.5 }, { x: -hl, y: -hl / 2.5 }],
          {
            left: x2, top: y2,
            angle: (angle * 180) / Math.PI,
            fill: "#ef4444", originX: "center", originY: "center",
            selectable: false, evented: false,
          }
        );
        canvas.remove(line);
        const grp = new fabric.Group([line, head], {
          cornerStyle: "circle", transparentCorners: false,
        });
        makeInteractive(grp);
        canvas.add(grp);
        bringToFront(canvas, grp);
        canvas.setActiveObject(grp);
      } else if (tool === "blur") {
        const fabric = await import("fabric");
        const r = ds.obj;
        const left = Math.round(r.left);
        const top = Math.round(r.top);
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        canvas.remove(r);
        if (w > 8 && h > 8) {
          const cropped = canvas.toDataURL({
            format: "png",
            left,
            top,
            width: w,
            height: h,
          });
          const imageCtor = (fabric as any).Image;
          const fabricImageCtor = (fabric as any).FabricImage;
          let img: any = null;
          if (imageCtor?.fromURL && imageCtor.fromURL.length >= 2) {
            img = await new Promise((resolve) => {
              imageCtor.fromURL(cropped, (loaded: any) => resolve(loaded));
            });
          } else if (fabricImageCtor?.fromURL) {
            img = await fabricImageCtor.fromURL(cropped, { crossOrigin: "anonymous" });
          }
          if (img) {
            const blurFilterCtor = (fabric as any).filters?.Blur;
            if (blurFilterCtor) {
              img.filters = [new blurFilterCtor({ blur: 0.35 })];
              if (typeof img.applyFilters === "function") img.applyFilters();
            }
            img.set({
              left,
              top,
              selectable: true,
              evented: true,
            });
            makeInteractive(img);
            canvas.add(img);
            bringToFront(canvas, img);
            canvas.setActiveObject(img);
          }
        }
      } else if (tool === "crop") {
        const r = ds.obj;
        const left = Math.round(r.left);
        const top = Math.round(r.top);
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        canvas.remove(r);
        if (w > 10 && h > 10) {
          const du = canvas.toDataURL({ format: "png", left, top, width: w, height: h });
          await loadImageIntoCanvas(du);
        }
        setTool("select");
        drawingState.current = null;
        isDrawingRef.current = false;
        startRef.current = null;
        currentRef.current = null;
        return;
      } else {
        if (defaultShadowEnabledRef.current && !(ds.obj as any)._isBackground) {
          const fabric = await import("fabric");
          ds.obj.set({ shadow: makeShadow(fabric) });
        }
        canvas.setActiveObject(ds.obj);
      }

      canvas.renderAll();
      drawingState.current = null;
      isDrawingRef.current = false;
      startRef.current = null;
      currentRef.current = null;
    }

    // ─── Imperative handle ───────────────────────────────────────────
    useImperativeHandle(
      ref,
      () => ({
        async loadImage(file: File) {
          if (!file.type.match(/^image\/(png|jpeg|jpg)$/i)) {
            alert("Please upload a PNG or JPG image.");
            return;
          }
          await loadImageIntoCanvas(await readFileAsDataUrl(file));
        },
        async loadImageFromDataUrl(dataUrl: string) {
          if (!dataUrl?.startsWith("data:image/")) return;
          if (!canvasRef.current) {
            pendingImageRef.current = dataUrl;
            void getCanvas();
            return;
          }
          await loadImageIntoCanvas(dataUrl);
        },
        setActiveTool: setTool,
        deleteSelected: deleteSelectedObjects,
        async clearAll() {
          const canvas = await getCanvas();
          const toRemove = canvas.getObjects().filter((o: any) => !o._isBackground);
          toRemove.forEach((o: any) => canvas.remove(o));
          canvas.discardActiveObject();
          canvas.renderAll();
        },
        async copyToClipboard() {
          const canvas = await getCanvas();
          const dataUrl = canvas.toDataURL({ format: "png", multiplier: 1 });
          const dataURLtoBlob = (du: string) => {
            const [meta, b64] = du.split(",");
            const mime = meta.match(/data:(.*);base64/)?.[1] || "image/png";
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: mime });
          };
          if ("clipboard" in navigator && "ClipboardItem" in window) {
            const blob = dataURLtoBlob(dataUrl);
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          }
        },
        async saveToFile() {
          const canvas = await getCanvas();
          const link = document.createElement("a");
          link.download = "screenshot.png";
          link.href = canvas.toDataURL({ format: "png", multiplier: 1 });
          link.click();
        },
        async download(options: { watermark: boolean }) {
          const fabric = await import("fabric");
          const canvas = await getCanvas();
          if (!canvas.getObjects().length) {
            alert("Upload an image first.");
            return;
          }
          canvas.discardActiveObject();
          canvas.renderAll();
          let wm: any = null;
          if (options.watermark) {
            wm = new fabric.FabricText("SnapClean", {
              fontSize: 13, fill: "rgba(255,255,255,0.35)",
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontWeight: "500", originX: "right", originY: "bottom",
              left: canvas.getWidth() - 10, top: canvas.getHeight() - 8,
              selectable: false, evented: false,
            });
            canvas.add(wm);
            canvas.renderAll();
          }
          const dataUrl = canvas.toDataURL({ format: "png", multiplier: 1 });
          if (wm) { canvas.remove(wm); canvas.renderAll(); }
          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = `snapclean-${Date.now()}.png`;
          link.click();
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [getCanvas, loadImageIntoCanvas]
    );

    return (
      <canvas
        ref={canvasElRef}
        className="fixed inset-0 h-screen w-screen"
      />
    );
  }
);

export default CanvasEditor;
