import LegalRouteShell from '@/src/components/LegalRouteShell'

export default function SafetyPage() {
  return (
    <LegalRouteShell
      page="safety"
      eyebrow="Safer Room Guidelines"
      title="Use the room with judgment, not just curiosity."
      intro="Muhdikhai is built for unpredictable conversations. That only works when users understand how to protect themselves, leave fast when the vibe is off, and respect the person on the other side."
      highlights={[
        {
          kicker: 'Boundaries',
          title: 'Leave early, not late',
          copy: 'If a room feels wrong, exit immediately. Good safety design should make leaving frictionless.',
        },
        {
          kicker: 'Disclosure',
          title: 'Protect identifying details',
          copy: 'Do not rush into sharing personal information, off-platform handles, or anything you would not want attached to a bad interaction.',
        },
        {
          kicker: 'Escalation',
          title: 'Use reporting and moderation paths',
          copy: 'Safety is not just a policy page. It should be visible in the product through block, report, and moderation-aware flows.',
        },
      ]}
      sections={[
        {
          index: '01',
          title: 'Before you trust the room',
          paragraphs: [
            'Random chat works best when you keep a small protective distance at first. Let the room earn your trust instead of assuming good intent immediately.',
            'A good rule is simple: do not share personal contact details, location specifics, workplace information, or anything that would make a bad interaction harder to contain.',
          ],
          list: [
            'Start slow with new people',
            'Keep identity disclosure minimal at first',
            'Treat off-platform invites with caution',
          ],
        },
        {
          index: '02',
          title: 'If a conversation turns bad',
          paragraphs: [
            'You do not owe a stranger patience once the room becomes uncomfortable, manipulative, sexual without consent, threatening, or abusive. Leave. Report. Move on.',
            'The interface should support that instinct with visible exits, strong moderation language, and low-friction reporting paths.',
          ],
        },
        {
          index: '03',
          title: 'If the conversation is actually good',
          paragraphs: [
            'Even when the vibe is excellent, move carefully. If you choose to continue outside the random room, do it intentionally and avoid oversharing too quickly.',
            'Friend chat and continued contact should feel like a deliberate step forward, not a pressure move forced by the pace of the app.',
          ],
        },
      ]}
    />
  )
}
