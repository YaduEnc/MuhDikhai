import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="ssr-shell">
      <section className="hero">
        <p className="eyebrow">Server-Side Rendered Shell</p>
        <h1>MuhDikhai on Next.js 15</h1>
        <p>
          This page is rendered on the server for faster first paint and better crawlability.
          Realtime chat/calls stay client-side for stability.
        </p>
        <div className="hero-actions">
          <Link href="/app" className="btn-primary">Open App</Link>
          <Link href="/chat" className="btn-ghost">Open Chat Island</Link>
          <Link href="/admin" className="btn-ghost">Admin</Link>
        </div>
      </section>

      <section className="cards">
        <article className="card">
          <h3>SSR for Public Surfaces</h3>
          <p>Landing/legal/info routes are rendered server-side with App Router.</p>
        </article>
        <article className="card">
          <h3>Client Islands for Realtime</h3>
          <p>Socket.IO, WebRTC, and browser-only APIs are isolated to client components.</p>
        </article>
        <article className="card">
          <h3>Separate API Domain</h3>
          <p>Frontend and backend remain independent; API and socket contracts are unchanged.</p>
        </article>
      </section>

      <section className="legal-links">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/safety">Safety</Link>
      </section>
    </main>
  )
}
