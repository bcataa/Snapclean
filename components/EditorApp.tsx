"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import EditorToolbar from "@/components/EditorToolbar";
import type { CanvasEditorHandle, Tool } from "@/components/CanvasEditor";

const CanvasEditor = dynamic(() => import("@/components/CanvasEditor"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0f0f0f] text-zinc-500">
      Loading editor…
    </div>
  ),
});

export default function EditorApp() {
  const editorRef = useRef<CanvasEditorHandle>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");

  function handleToolChange(t: Tool) {
    setActiveTool(t);
  }

  return (
    <div id="editor-root" className="fixed inset-0 overflow-hidden bg-[#0f0f0f]">
      <EditorToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onSave={() => void editorRef.current?.saveToFile()}
        onDone={() => window.close()}
      />
      <CanvasEditor ref={editorRef} activeTool={activeTool} onToolChange={setActiveTool} />
    </div>
  );
}
