import LegalRouteShell from '@/src/components/LegalRouteShell'

export default function TermsPage() {
  return (
    <LegalRouteShell
      page="terms"
      eyebrow="Hosted Access Terms"
      title="The boundaries that keep the product usable."
      intro="Muhdikhai is designed to feel loose and alive inside the room, but access to the hosted product still depends on rules around respectful conduct, moderation, and responsible use of account-based features."
      highlights={[
        {
          kicker: 'Access',
          title: 'Use is conditional, not absolute',
          copy: 'Access to the hosted service can depend on following product rules, moderation requirements, and account integrity expectations.',
        },
        {
          kicker: 'Conduct',
          title: 'Harassment is not part of the vibe',
          copy: 'Abusive behavior, coercion, threats, impersonation, and repeated evasion of moderation boundaries are incompatible with the product.',
        },
        {
          kicker: 'Features',
          title: 'Realtime tools still have limits',
          copy: 'Chat, calls, media, vanish features, and friend interactions are all part of the experience, but none of them remove responsibility for conduct.',
        },
      ]}
      sections={[
        {
          index: '01',
          title: 'Who the hosted service is for',
          paragraphs: [
            'The hosted product is for users who can participate responsibly in unpredictable, realtime conversation spaces. Account access is tied to the expectation that you use the service without abusing other participants or the platform itself.',
            'Using the product means accepting that moderation, safety enforcement, and account actions can be necessary to keep the environment usable for everyone else.',
          ],
        },
        {
          index: '02',
          title: 'What is not allowed',
          paragraphs: [
            'The product is not a shield for harassment, impersonation, exploitation, or evasion of moderation. Features that make the room feel more free do not cancel responsibility for what you do inside it.',
          ],
          list: [
            'Harassment, threats, hate, or coercive behavior',
            'Attempts to bypass moderation or repeatedly re-enter after enforcement',
            'Misuse of media, calls, or profile identity to manipulate others',
          ],
        },
        {
          index: '03',
          title: 'Product evolution and enforcement',
          paragraphs: [
            'Muhdikhai will keep evolving. That means interfaces, moderation patterns, and feature behavior may change as the product gets better at balancing spontaneity with safety.',
            'Continued use of the hosted product should always be understood as conditional on respecting those evolving boundaries.',
          ],
        },
      ]}
    />
  )
}
