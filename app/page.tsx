"use client";

import Link from "next/link";

const directMacDownloadUrl =
  process.env.NEXT_PUBLIC_MAC_DOWNLOAD_URL ||
  "https://github.com/bcataa/Snapclean/releases/latest/download/SnapClean-mac.dmg";

const features = [
  {
    icon: "⚡",
    title: "Instant Capture",
    desc: "Global shortcut freezes the screen and lets you select any area in milliseconds.",
  },
  {
    icon: "📋",
    title: "Auto Copy",
    desc: "Screenshots are copied to clipboard immediately — paste anywhere.",
  },
  {
    icon: "🖼️",
    title: "Clean Preview",
    desc: "Floating thumbnail lets you Edit, Copy, or dismiss without interruption.",
  },
  {
    icon: "✏️",
    title: "Built-in Editor",
    desc: "Arrows, shapes, text, blur, highlights, numbered markers — no extra app needed.",
  },
];

const steps = [
  { num: "1", title: "Press Shortcut", desc: "⌘⇧S freezes the screen with a selection overlay." },
  { num: "2", title: "Select Area", desc: "Drag to choose the exact region you need." },
  { num: "3", title: "Copy or Edit", desc: "Instantly paste, or annotate in the built-in editor." },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-950 text-zinc-100">
      {/* ── Nav ── */}
      <nav className="flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold tracking-tight">SnapClean</span>
        <Link
          href="/editor"
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
        >
          Open Editor
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="flex max-w-3xl flex-col items-center gap-6 px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-1.5 text-xs font-medium text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          macOS Desktop App
        </div>
        <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Take clean screenshots
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            instantly
          </span>
        </h1>
        <p className="max-w-lg text-lg text-zinc-400">
          Fast, clean, and powerful screen capture with a built-in annotation
          editor. Like CleanShot — free and open source.
        </p>
        <div className="flex gap-4 pt-2">
          <a
            href={directMacDownloadUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-blue-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 hover:shadow-blue-500/30 active:scale-[0.98]"
          >
            Download for Mac
          </a>
          <Link
            href="/editor"
            className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-7 py-3 text-sm font-semibold text-zinc-200 transition-all hover:border-zinc-600 hover:bg-zinc-700/80 active:scale-[0.98]"
          >
            Try Editor
          </Link>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="w-full max-w-4xl px-6 py-20">
        <h2 className="mb-12 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          How it works
        </h2>
        <div className="grid gap-8 sm:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.num}
              className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-8 text-center"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/20 text-lg font-bold text-blue-400">
                {s.num}
              </span>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="text-sm text-zinc-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="w-full max-w-4xl px-6 py-16">
        <h2 className="mb-12 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          Everything you need
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-6"
            >
              <span className="text-2xl">{f.icon}</span>
              <h3 className="mt-3 text-base font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-zinc-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="flex w-full max-w-3xl flex-col items-center gap-5 px-6 py-20 text-center">
        <h2 className="text-2xl font-semibold sm:text-3xl">Ready to capture?</h2>
        <p className="text-zinc-500">Download SnapClean and start screenshotting.</p>
        <a
          href={directMacDownloadUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-blue-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 active:scale-[0.98]"
        >
          Download for Mac
        </a>
      </section>

      {/* ── Footer ── */}
      <footer className="w-full border-t border-zinc-800/60 py-8 text-center text-xs text-zinc-600">
        SnapClean — Open source screenshot tool
      </footer>
    </div>
  );
}
