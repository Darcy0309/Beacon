import Link from "next/link";
import { Contact, LegalPage, Section } from "@/features/legal/legal-page";
import { legalOrganization } from "@/features/legal/organization";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const org = await legalOrganization();
  return { title: `Terms & Conditions — ${org.name}` };
}

/** Public, for the texting registration (A2P 10DLC campaign): the terms, with the SMS Terms the carriers ask for. */
export default async function TermsPage() {
  const org = await legalOrganization();
  const n = org.name;
  return (
    <LegalPage title="Terms & Conditions" org={org} updated="November 11, 2026">
      <p>
        These Terms &amp; Conditions apply to the services of {n} (&ldquo;{n},&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;), including the
        calls, emails and text messages we send about appointments. By using our services or agreeing to receive our messages, you agree
        to these terms.
      </p>

      <Section title="Our services">
        <p>
          {n} sets and manages business appointments between companies and the representatives of our clients. We contact you to arrange
          appointments you agree to, and to remind you of them.
        </p>
      </Section>

      <Section title="SMS Terms">
        <ul className="list-disc space-y-2 pl-6" data-sms-terms>
          <li>
            <strong>Program:</strong> {n} appointment messages. When you give us your mobile number and agree to receive texts, {n} may
            send you appointment reminders (for example, the day before your appointment), confirmations and replies to the messages you
            send us.
          </li>
          <li><strong>Message frequency varies</strong>, depending on your appointments and conversations with us.</li>
          <li><strong>Message and data rates may apply.</strong> Check with your mobile carrier for the details of your plan.</li>
          <li><strong>To opt out</strong>, reply STOP to any message. We will send one message to confirm, and then no more texts unless you sign up again.</li>
          <li><strong>For help</strong>, reply HELP to any message, or contact us using the details below.</li>
          <li>Carriers are not liable for delayed or undelivered messages.</li>
          <li>Agreeing to receive text messages is not a condition of any purchase.</li>
          <li>
            We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes. See
            our <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>.
          </li>
        </ul>
      </Section>

      <Section title="Your responsibilities">
        <p>
          You agree to give us accurate contact details and to tell us if your mobile number changes. Please let us know if you cannot
          keep an appointment, so that it can be rescheduled.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          How we collect and use your information is described in our{" "}
          <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          Our services are provided &ldquo;as is.&rdquo; To the fullest extent the law allows, {n} is not liable for indirect or
          consequential losses arising from the use of our services or messages, including messages that are delayed or not delivered.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>We may update these Terms &amp; Conditions from time to time. The date at the top shows when they last changed.</p>
      </Section>

      <Section title="Contact us">
        <p>Questions about these terms or our messages? Contact {n}:</p>
        <Contact org={org} />
      </Section>
    </LegalPage>
  );
}
