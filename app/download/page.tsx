"use client";

const owner = process.env.NEXT_PUBLIC_GH_OWNER;
const repo = process.env.NEXT_PUBLIC_GH_REPO;
const releaseDmgUrl =
  owner && repo
    ? `https://github.com/${owner}/${repo}/releases/latest/download/SnapClean-mac.dmg`
    : null;
const downloadUrl =
  process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL ||
  releaseDmgUrl ||
  "https://github.com";

export default function DownloadPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Download SnapClean for macOS</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Click the button below to download the latest macOS installer (.dmg).
        </p>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 active:scale-[0.98]"
        >
          Download Installer
        </a>
        <p className="mt-4 text-xs text-zinc-500">
          Set <code>NEXT_PUBLIC_GH_OWNER</code> and <code>NEXT_PUBLIC_GH_REPO</code> (or
          <code> NEXT_PUBLIC_MAC_DOWNLOAD_URL</code>) to power this link.
        </p>
      </div>
    </main>
  );
}
