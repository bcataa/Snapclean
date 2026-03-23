import dynamic from "next/dynamic";

const EditorApp = dynamic(() => import("@/components/EditorApp"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">
      Loading…
    </div>
  ),
});

export default function EditorPage() {
  return <EditorApp />;
}
