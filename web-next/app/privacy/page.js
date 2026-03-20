import LegalRouteShell from '@/src/components/LegalRouteShell'

export default function PrivacyPage() {
  return (
    <LegalRouteShell
      page="privacy"
      eyebrow="Hosted Product Privacy"
      title="Privacy that matches the actual flow."
      intro="Muhdikhai asks for Google sign-in and a short profile setup on the hosted app. That identity layer exists to make rooms feel safer and more intentional, while the stranger-chat experience still aims to stay lightweight and ephemeral."
      highlights={[
        {
          kicker: 'Identity',
          title: 'You enter with a real session',
          copy: 'The hosted experience begins with Google sign-in, then a small onboarding profile so rooms do not feel fully anonymous in the worst way.',
        },
        {
          kicker: 'Rooms',
          title: 'Stranger chat is not a feed',
          copy: 'The product is designed around present-tense interactions, not endless browsing of past random encounters.',
        },
        {
          kicker: 'Control',
          title: 'Different layers, different expectations',
          copy: 'Random rooms, friend chat, reactions, calls, and media features can carry different visibility and persistence expectations.',
        },
      ]}
      sections={[
        {
          index: '01',
          title: 'What the hosted experience asks from you',
          paragraphs: [
            'The hosted version of Muhdikhai uses sign-in and onboarding because completely context-free entry creates worse outcomes for trust and moderation. We keep the setup small on purpose: enough identity to feel accountable, not enough to feel like a bloated social network.',
            'Your profile details are used to shape the in-app experience, such as how you appear in rooms and how features like friend chat or reputation systems can work more reliably.',
          ],
        },
        {
          index: '02',
          title: 'What random rooms are designed to feel like',
          paragraphs: [
            'Random rooms are meant to feel immediate, atmospheric, and disposable in the good sense. The product direction is not to turn those encounters into a permanent, scrollable archive.',
            'That distinction matters. Stranger chat should feel lighter than a traditional social app, even when the hosted experience still uses account infrastructure around it.',
          ],
          list: [
            'Short path from sign-in to first room',
            'No endless stranger-feed framing',
            'Cleaner expectations between random rooms and friend chat',
          ],
        },
        {
          index: '03',
          title: 'Where privacy expectations change',
          paragraphs: [
            'Not every part of the product behaves the same way. Friend chat, moderation systems, abuse prevention, and account actions naturally have different operational needs than a one-off random room.',
            'The important part is clarity: the app should tell users when they are in a more ephemeral mode and when they are moving into something with stronger identity or continuity.',
          ],
        },
      ]}
    />
  )
}
