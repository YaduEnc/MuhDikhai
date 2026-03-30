import Link from 'next/link'
import styles from './pricing.module.css'

const FEATURES = [
  'Verified badge on profile and chat header',
  'Priority visibility in friend requests and Haveli cards',
  'Premium profile theme with cleaner identity card',
  'Cancel anytime',
]

export const metadata = {
  title: 'Pricing | MuhDikhai Plus',
  description: 'MuhDikhai Plus pricing: verified badge and advanced profile at ₹5 per month.',
}

export default function PricingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <Link href="/" className={styles.backLink}>
            ← Back to Home
          </Link>
        </div>

        <section className={styles.hero}>
          <span className={styles.eyebrow}>MuhDikhai Plus</span>
          <h1>Simple pricing. Real identity boost.</h1>
          <p>
            One clean plan for students who want a stronger profile presence.
          </p>
        </section>

        <section className={styles.card}>
          <div className={styles.planHead}>
            <h2>Plus Monthly</h2>
            <div className={styles.price}>
              <strong>₹5</strong>
              <span>/month</span>
            </div>
          </div>

          <ul className={styles.list}>
            {FEATURES.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>

          <div className={styles.actions}>
            <Link href="/app" className={styles.primaryBtn}>
              Continue to App
            </Link>
            <Link href="/terms" className={styles.secondaryLink}>
              Terms
            </Link>
            <Link href="/privacy" className={styles.secondaryLink}>
              Privacy
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
