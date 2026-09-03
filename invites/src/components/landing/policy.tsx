import type { Settings } from '@/lib/settings-defaults';

/**
 * The three policy pages. The refund and privacy statements come from
 * Settings so the owner can edit them; the terms are the operating rules of
 * the product itself.
 */
export function PolicyBody({ kind, s }: { kind: 'terms' | 'privacy' | 'refund'; s: Settings }) {
  if (kind === 'refund') {
    return (
      <div className="prose-site mt-6 text-[color:var(--color-ink-700)]">
        <p>{s['policy.refund']}</p>
        <p>To request a refund where one applies, message us on Messenger or Viber with your order reference. Refunds go back to the original payment method; e-wallet refunds can take a few days to settle.</p>
      </div>
    );
  }
  if (kind === 'privacy') {
    return (
      <div className="prose-site mt-6 text-[color:var(--color-ink-700)]">
        <p>{s['policy.privacy']}</p>
        <p><b>What we collect.</b> Your name, email and mobile number to run your account; the details you put on an invitation; and, when you use the guest list, the names and contact details of the people you invite. Guests who RSVP give us their name, their response and whatever they choose to write.</p>
        <p><b>How it is used.</b> Only to show the invitation to the people you send it to, to record RSVPs for you, and to contact you about your order. We do not sell or share guest data with anyone.</p>
        <p><b>How it is protected.</b> Personal links are long random tokens; a guest can see only their own row. Payment card details never touch our servers — PayMongo handles them. Proof-of-payment screenshots are stored privately and shown only to staff verifying them.</p>
        <p><b>Your rights under RA 10173.</b> You may ask for a copy of your data, correct it, or have it deleted. Deleting an invitation removes its guest list, RSVPs and guestbook. Message us at {s['business.email']} or on Messenger.</p>
        <p><b>Retention.</b> Invitations expire after the validity period in your package, and their data is removed on request or when the account is deleted.</p>
      </div>
    );
  }
  return (
    <div className="prose-site mt-6 text-[color:var(--color-ink-700)]">
      <p>By purchasing an invitation from {s['business.name']} you agree to the following.</p>
      <p><b>What you buy.</b> A one-time licence to publish one invitation at one link for the validity period of your package, counted from your event date. There is no subscription and no renewal fee. Link extensions are available on request.</p>
      <p><b>Your content.</b> You are responsible for the names, photos and text on your invitation and for having the right to use them. We may remove content that is unlawful or abusive.</p>
      <p><b>Done-For-You.</b> Turnaround times are counted in working days from the moment we receive complete details. Revision rounds are as stated on your package; small corrections after approval are handled with goodwill.</p>
      <p><b>Availability.</b> We aim for the invitation to be reachable at all times and back everything up daily, but we cannot guarantee uninterrupted service and are not liable for indirect losses.</p>
      <p><b>Refunds.</b> {s['policy.refund']}</p>
      <p><b>Contact.</b> {s['business.email']}, or Messenger and Viber from any page.</p>
    </div>
  );
}
