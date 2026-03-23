"use client";

import type { Tool } from "@/components/CanvasEditor";
import type { CSSProperties } from "react";
import {
  MousePointer,
  Square,
  Circle,
  ArrowRight,
  Slash,
  Type,
  PenLine,
  ScanText,
  Highlighter,
  Droplets,
  Crop,
  PanelTop,
  Moon,
  Hash,
  Search,
  Pin,
} from "lucide-react";

type Props = {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  onSave: () => void;
  onDone: () => void;
};

const tools: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "select" },
  { id: "rectangle", label: "Rectangle", icon: "rectangle" },
  { id: "roundedRectangle", label: "Rounded Rectangle", icon: "roundedRectangle" },
  { id: "circle", label: "Circle", icon: "circle" },
  { id: "arrow", label: "Arrow", icon: "arrow" },
  { id: "line", label: "Line", icon: "line" },
  { id: "draw", label: "Draw", icon: "draw" },
  { id: "text", label: "Text", icon: "text" },
  { id: "highlight", label: "Highlight", icon: "highlight" },
  { id: "blur", label: "Blur", icon: "blur" },
  { id: "crop", label: "Crop", icon: "crop" },
  { id: "background", label: "Background", icon: "background" },
  { id: "shadow", label: "Shadow", icon: "shadow" },
  { id: "number", label: "Number", icon: "number" },
  { id: "zoom", label: "Zoom", icon: "zoom" },
  { id: "pin", label: "Pin", icon: "pin" },
];

const toolIcons = {
  select: MousePointer,
  rectangle: Square,
  roundedRectangle: ScanText,
  circle: Circle,
  arrow: ArrowRight,
  line: Slash,
  draw: PenLine,
  text: Type,
  blur: Droplets,
  highlight: Highlighter,
  crop: Crop,
  background: PanelTop,
  shadow: Moon,
  number: Hash,
  zoom: Search,
  pin: Pin,
} as const;

type AppRegionStyle = CSSProperties & {
  WebkitAppRegion?: "drag" | "no-drag";
};

const dragStyle: AppRegionStyle = {
  top: 0,
  height: 48,
  paddingTop: 0,
  background: "rgba(40,40,40,0.85)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  WebkitAppRegion: "drag",
};

const noDragStyle: AppRegionStyle = {
  WebkitAppRegion: "no-drag",
};

export default function EditorToolbar({
  activeTool,
  onToolChange,
  onSave,
  onDone,
}: Props) {
  return (
    <div
      className="fixed left-0 z-[9999] flex w-full items-center justify-between border-b border-white/[0.08] px-4"
      style={dragStyle}
    >
      <div className="flex min-w-[86px] items-center gap-2" aria-hidden />

      <div
        className="absolute left-1/2 flex -translate-x-1/2 items-center gap-[6px]"
        style={noDragStyle}
      >
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            onClick={() => onToolChange(t.id)}
            className={btnCls(activeTool === t.id || (activeTool === "rect" && t.id === "rectangle"))}
            style={noDragStyle}
          >
            {(() => {
              const Icon = toolIcons[t.id as keyof typeof toolIcons];
              return <Icon size={16} strokeWidth={2} color="#fff" />;
            })()}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-[10px]" style={noDragStyle}>
        <button
          type="button"
          title="Save as..."
          onClick={onSave}
          className="rounded-[8px] bg-white/10 px-3 py-1.5 text-[13px] text-white/95 transition-colors hover:bg-white/15"
          style={noDragStyle}
        >
          Save as...
        </button>
        <button
          type="button"
          title="Done"
          onClick={onDone}
          className="rounded-[8px] bg-[#2f6df6] px-3.5 py-1.5 text-[13px] text-white transition-colors hover:bg-[#245de0]"
          style={noDragStyle}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function btnCls(active: boolean) {
  const base = "flex h-7 w-7 items-center justify-center rounded-[6px] text-white transition-colors";
  if (active) return `${base} bg-[#2f6df6]`;
  return `${base} bg-transparent hover:bg-white/10`;
}
