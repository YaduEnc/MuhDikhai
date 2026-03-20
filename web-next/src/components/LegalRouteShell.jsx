import Link from 'next/link'

const PAGE_LINKS = [
    { key: 'privacy', label: 'Privacy', href: '/privacy' },
    { key: 'safety', label: 'Safety', href: '/safety' },
    { key: 'terms', label: 'Terms', href: '/terms' },
]

export default function LegalRouteShell({
    page,
    eyebrow,
    title,
    intro,
    highlights = [],
    sections = [],
}) {
    return (
        <main className="legal-route-shell">
            <div className="legal-route-bg" />

            <section className="legal-route-hero">
                <div className="legal-route-topbar">
                    <Link href="/" className="legal-route-home">
                        <span>←</span>
                        <span>Back to Muhdikhai</span>
                    </Link>

                    <div className="legal-route-tabs" aria-label="Legal navigation">
                        {PAGE_LINKS.map((item) => (
                            <Link
                                key={item.key}
                                href={item.href}
                                className={`legal-route-tab ${item.key === page ? 'is-active' : ''}`}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="legal-route-panel">
                    <div className="legal-route-panel-copy">
                        <span className="legal-route-eyebrow">{eyebrow}</span>
                        <h1>{title}</h1>
                        <p>{intro}</p>
                    </div>

                    <div className="legal-route-highlight-grid">
                        {highlights.map((item) => (
                            <article key={item.title} className="legal-route-highlight-card">
                                <span className="legal-route-highlight-kicker">{item.kicker}</span>
                                <h2>{item.title}</h2>
                                <p>{item.copy}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="legal-route-content">
                {sections.map((section) => (
                    <article key={section.title} className="legal-route-section-card">
                        <div className="legal-route-section-head">
                            <span className="legal-route-section-index">{section.index}</span>
                            <h2>{section.title}</h2>
                        </div>

                        <div className="legal-route-section-body">
                            {(section.paragraphs || []).map((paragraph) => (
                                <p key={paragraph}>{paragraph}</p>
                            ))}

                            {section.list?.length ? (
                                <ul className="legal-route-list">
                                    {section.list.map((item) => (
                                        <li key={item}>
                                            <span className="legal-route-list-dot" />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    </article>
                ))}
            </section>

            <section className="legal-route-related">
                <div className="legal-route-related-card">
                    <div>
                        <span className="legal-route-eyebrow">Connected Reading</span>
                        <h2>These pages now work as one legal system.</h2>
                        <p>
                            Privacy explains what the hosted product does with your presence,
                            Safety explains how to use it wisely, and Terms define the boundary
                            conditions for access and conduct.
                        </p>
                    </div>

                    <div className="legal-route-related-links">
                        {PAGE_LINKS.filter((item) => item.key !== page).map((item) => (
                            <Link key={item.key} href={item.href} className="legal-route-related-link">
                                <span>{item.label}</span>
                                <span>→</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>
        </main>
    )
}
