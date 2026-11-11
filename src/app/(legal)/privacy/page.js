import { Contact, LegalPage, Section } from "@/features/legal/legal-page";
import { legalOrganization } from "@/features/legal/organization";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const org = await legalOrganization();
  return { title: `Privacy Policy — ${org.name}` };
}

/** Public, for the texting registration (A2P 10DLC campaign): what we collect, why, and the SMS promise. */
export default async function PrivacyPolicyPage() {
  const org = await legalOrganization();
  const n = org.name;
  return (
    <LegalPage title="Privacy Policy" org={org} updated="November 11, 2026">
      <p>
        This Privacy Policy explains how {n} (&ldquo;{n},&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) collects, uses and protects
        information about the businesses and people we contact, including when we send text messages (SMS) about appointments.
      </p>

      <Section title="Information we collect">
        <ul className="list-disc space-y-1 pl-6">
          <li>Business contact details: your name, business name, business address, email address and phone numbers, including mobile numbers.</li>
          <li>Appointment details: the date, time and the representative you are meeting, and notes about the appointment you asked for.</li>
          <li>Communications: the calls, emails and text messages between you and us, and your replies to them (for example, confirming or rescheduling an appointment).</li>
          <li>Your messaging choices: whether you agreed to receive text messages, and any request to stop them.</li>
        </ul>
      </Section>

      <Section title="How we use your information">
        <ul className="list-disc space-y-1 pl-6">
          <li>To schedule, confirm, remind you of and reschedule appointments you agreed to.</li>
          <li>To answer your questions and messages, and to provide customer care.</li>
          <li>To keep records of our conversations with you, and to improve our service.</li>
          <li>To meet legal requirements, including honoring requests to stop messages.</li>
        </ul>
      </Section>

      <Section title="Text messages (SMS)">
        <p>
          If you give us your mobile number and agree to receive text messages, {n} may text you about your appointments (for example,
          a reminder the day before, which you can reply to with Y to confirm, N to cancel or R to reschedule) and reply to messages
          you send us. Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time, or HELP for help.
        </p>
        <p className="font-semibold" data-sms-promise>
          We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.
        </p>
        <p>
          No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging
          originator opt-in data and consent are not shared with any third parties, other than the service providers that deliver our
          messages for us.
        </p>
      </Section>

      <Section title="How we share information">
        <p>
          We do not sell personal information. We share it only with the service providers that help us run our business (such as our
          phone, text messaging, email and hosting providers), who may use it only to provide those services to us; with the business
          you have an appointment with, so that they can meet you; and when the law requires it.
        </p>
      </Section>

      <Section title="How we protect information">
        <p>
          Your information is kept in secure systems with access limited to the people who need it for their work, protected by
          passwords and two-factor authentication. We keep it only as long as we need it for the purposes above, or as the law requires.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          You can stop text messages at any time by replying STOP. You may also ask us to see, correct or delete the information we hold
          about you by contacting us below.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>We may update this Privacy Policy from time to time. The date at the top shows when it last changed.</p>
      </Section>

      <Section title="Contact us">
        <p>Questions about this Privacy Policy or your information? Contact {n}:</p>
        <Contact org={org} />
      </Section>
    </LegalPage>
  );
}
