import dynamic from "next/dynamic";
import Link from "next/link";

const SettingsPanel = dynamic(() => import("@/components/SettingsPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center text-zinc-500">
      Loading…
    </div>
  ),
});

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12">
      <div className="mb-8 flex w-full max-w-lg items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">Settings</h1>
        <Link
          href="/editor"
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
        >
          Back to Editor
        </Link>
      </div>
      <SettingsPanel />
    </div>
  );
}
