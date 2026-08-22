/** All the demo content, in one place.
 *
 *  A sample is a set of FORM FIELDS, not an email. `formToEmail` turns one into
 *  the notification the intake mailbox receives, which means the public form at
 *  /apply and the console's fallback "Send application" button are fed by the
 *  same data — there is no second copy to drift.
 */
import { ORG } from "./dogs.js";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Applicants already mid-pipeline, so the Sheet isn't empty on a projector. */
export const EXISTING_ROWS = [
  ["Rosalind Ferreira", "r.ferreira.sf@example.com", "(415) 555-0182", "Marigold", daysAgo(9), "Meet & greet done", "Dana", daysAgo(2)],
  ["Kwame Boateng", "kboateng.home@example.com", "(510) 555-0147", "Luna", daysAgo(6), "Reference check", "Ivy", ""],
  ["Sofia Mendelsohn-Park", "sofia.mp@example.com", "(628) 555-0119", "Juniper", daysAgo(4), "Scheduled", "Dana", daysAgo(-1)],
  ["Terrence Whitlock", "twhitlock42@example.com", "(415) 555-0164", "Marigold", daysAgo(2), "New", "", ""],
];

/** One submission of the public form. Field names match the `name` attributes
 *  in public/apply.html, so a sample pours straight into the form. */
export type FormSample = {
  name: string;
  email: string;
  phone: string;
  dog: string;
  home: string;
  yard: string;
  household: string;
  message: string;
};

/** Ten real applications.
 *
 *  Varied on three axes the agent has to cope with: every dog on the roster
 *  appears, the living situations run from a fenced half-acre to a fourth-floor
 *  walk-up, and each states its availability differently — a named weekday,
 *  weekends only, mornings, "mid-week", or nothing at all. That last kind is
 *  the interesting one: the agent has to fall back to a default.
 *
 *  Numbers stay in the 555 range and addresses in example.com on purpose. */
export const GENUINE_SAMPLES: FormSample[] = [
  {
    name: "Priya Raghunathan",
    email: "priya.raghunathan@example.com",
    phone: "(415) 555-0134",
    dog: "Biscuit",
    home: "House I own",
    yard: "Fenced yard",
    household: "Two kids, 6 and 9. No other pets right now.",
    message:
      "We lost our beagle Rusty last spring and the house has been far too quiet. " +
      "The yard is fully fenced, six feet, and I work from home three days a week. " +
      "Biscuit's tennis ball habit sounds like a perfect match for our nine-year-old, " +
      "who has been campaigning hard. Weekend afternoons are best for us.",
  },
  {
    name: "Devon Okafor",
    email: "d.okafor@example.com",
    phone: "(628) 555-0207",
    dog: "Tofu",
    home: "Apartment or condo",
    yard: "No yard",
    household: "Just me. No other pets.",
    message:
      "I'm on the fourth floor of a walk-up in the Mission, so a small dog is the " +
      "honest answer for me. I run most mornings along the Embarcadero and would " +
      "happily take a co-pilot. My building allows dogs under 25 pounds and I can " +
      "send the lease addendum. Any weekday after 6pm works.",
  },
  {
    name: "Hannah Lindqvist",
    email: "hannah.lindqvist@example.com",
    phone: "(510) 555-0188",
    dog: "Luna",
    home: "House I rent",
    yard: "Unfenced yard",
    household: "Me and my partner. No kids, no pets.",
    message:
      "Full disclosure, this would be our first dog and we want to do it properly. " +
      "We've been reading, we've budgeted for training classes, and our landlord has " +
      "already said yes in writing. The yard isn't fenced, so we'd leash-walk until " +
      "we can put one up. Saturday morning is the only time we're both free.",
  },
  {
    name: "Marcus Delacroix-Reyes",
    email: "mdreyes@example.com",
    phone: "(415) 555-0291",
    dog: "Juniper",
    home: "House I own",
    yard: "Fenced yard",
    household: "My wife and me, plus Scout, a seven-year-old border collie.",
    message:
      "Scout needs a colleague. He's a working line collie and he has run out of jobs " +
      "to do at our place, so we thought a second one might sort each other out. We do " +
      "agility twice a week and have a half-acre fenced. Happy to bring Scout along for " +
      "the introduction. I'm free most weekdays between 10 and 2.",
  },
  {
    name: "Rosalind Amherst",
    email: "r.amherst@example.com",
    phone: "(628) 555-0142",
    dog: "Marigold",
    home: "Apartment or condo",
    yard: "No yard",
    household: "Just me. I'm retired.",
    message:
      "I read that Marigold is seven and I want to say plainly that this is exactly why " +
      "I'm writing. I'm 71, I walk two miles every morning, and a retired racer who " +
      "would rather nap than train for a marathon sounds like my kind of company. " +
      "Mornings are best for me, any day of the week.",
  },
  {
    name: "Tomás Iglesias-Cheng",
    email: "tic.sf@example.com",
    phone: "(415) 555-0176",
    dog: "Marigold",
    home: "House I own",
    yard: "Fenced yard",
    household: "Me and my husband. No kids, no other pets.",
    message:
      "We've had two pit bulls before, both seniors when we got them, and we're not " +
      "looking to be talked out of it. Marigold's sunbeam habit is a selling point — " +
      "we have a south-facing living room she can have all to herself. We're around " +
      "all day Sunday and flexible after that.",
  },
  {
    name: "Nadia Okonkwo",
    email: "nadia.okonkwo@example.com",
    phone: "(510) 555-0233",
    dog: "Biscuit",
    home: "Apartment or condo",
    yard: "Fenced yard",
    household: "Me and my sister. She's the one who found your Instagram.",
    message:
      "Our building has a shared dog run, fully fenced, and I work from home five days " +
      "a week doing support, so I'm at a desk but present. We'd want to know how " +
      "Biscuit does being alone for a couple of hours at a stretch. Thursday or Friday " +
      "this week would suit us.",
  },
  {
    name: "Bea Sullivan",
    email: "sullivan.family@example.com",
    phone: "(628) 555-0165",
    dog: "Biscuit",
    home: "House I own",
    yard: "Fenced yard",
    household: "Three kids — 4, 8 and 11 — and a very tolerant cat named Admiral.",
    message:
      "We're after a family dog and everything I've read about Biscuit suggests he'd be " +
      "fine with the chaos. The cat is the open question and I'd rather find out before " +
      "than after. Big fenced yard, someone home most afternoons. It would have to be a " +
      "weekend so all three kids can come.",
  },
  {
    name: "Wen Zhao",
    email: "wzhao.ranch@example.com",
    phone: "(707) 555-0119",
    dog: "Juniper",
    home: "Other",
    yard: "Fenced yard",
    household: "Me, my brother, and two barn cats who run the place.",
    message:
      "We have twelve acres up past Petaluma with sheep, and we're looking for a dog " +
      "that actually wants the work rather than one who'll be bored by it. Juniper " +
      "inventing her own jobs sounds like a dog who'd be happier here than in a flat. " +
      "Mid-week is easiest — we're up early either way.",
  },
  {
    name: "T. Nakamura",
    email: "t.nakamura.88@example.com",
    phone: "",
    dog: "Marigold",
    home: "Other",
    yard: "No yard",
    household: "",
    message: "hi is marigold still available? saw her on instagram. i love pitties. thanks",
  },
];

/** Form spam.
 *
 *  The form is public, so junk arrives through it wearing the same subject line
 *  as a real application. Deliberately not all easy: the wholesale supplier and
 *  the pet photographer both talk fluently about dogs and rescues, so keyword
 *  matching won't save you. Only reading the thing works. */
export const SPAM_SAMPLES: FormSample[] = [
  {
    name: "Digital Growth Partners",
    email: "outreach@digitalgrowthpartners.test",
    phone: "(000) 000-0000",
    dog: "Biscuit",
    home: "Other",
    yard: "No yard",
    household: "N/A",
    message:
      "Hi there! I was reviewing your website and noticed several CRITICAL SEO issues " +
      "holding back your rankings. Our team can get you to page 1 of Google for " +
      "'dog adoption near me' in 30 days, guaranteed. We work with 200+ nonprofits. " +
      "Ask about our backlink packages and AI content engine. Reply STOP to opt out.",
  },
  {
    name: "asdf",
    email: "asdf@asdf.test",
    phone: "1",
    dog: "Marigold",
    home: "Other",
    yard: "No yard",
    household: "",
    message: "asdf\n\ntest test\n\naaaaaaaaaa",
  },
  {
    name: "Bradley Vance",
    email: "b.vance@apexyieldcapital.test",
    phone: "(212) 555-0100",
    dog: "Marigold",
    home: "Other",
    yard: "No yard",
    household: "",
    message:
      "Quick question — is your organization holding any treasury in stablecoins yet? " +
      "We're onboarding a small number of 501(c)(3)s into a tokenized yield product " +
      "returning 14-18% APY, fully collateralized. Minimum allocation is $25k. Happy " +
      "to send the deck. This window closes Friday.",
  },
  {
    name: "PawsomeSupply Wholesale",
    email: "accounts@pawsomesupply.test",
    phone: "(888) 555-0143",
    dog: "Biscuit",
    home: "Other",
    yard: "No yard",
    household: "N/A",
    message:
      "Greetings from PawsomeSupply! We manufacture kennels, martingale collars, " +
      "orthopedic beds and bulk kibble for shelters and rescues across North America. " +
      "Rescue partners receive 40% off at MOQ 500 units, free freight over $2,000. " +
      "Our 2026 catalogue is attached. Who handles procurement for your facility?",
  },
  {
    name: "Studio Lumen",
    email: "hello@studiolumen.test",
    phone: "(415) 555-0900",
    dog: "Tofu",
    home: "Other",
    yard: "No yard",
    household: "",
    message:
      "Hello! I'm a pet photographer building out my portfolio and I'd love to shoot " +
      "your adoptable dogs. First session free, then $180 per dog for edited images, " +
      "with a 20% rescue discount on packages of ten or more. Great listings get " +
      "adopted faster — let me know which dogs you'd like to start with!",
  },
  {
    name: "Accounts Receivable",
    email: "billing@invoice-settlement.test",
    phone: "",
    dog: "Biscuit",
    home: "Other",
    yard: "No yard",
    household: "",
    message:
      "FINAL NOTICE: Invoice #48812 for domain and directory listing services remains " +
      "unpaid at $487.00. Payment is now 61 days overdue and this account is scheduled " +
      "for referral to collections. Settle immediately via the payment portal to avoid " +
      "suspension of your listing. Do not reply to this address.",
  },
  {
    name: "Guest Post Team",
    email: "editor@petlifestylehub.test",
    phone: "",
    dog: "Juniper",
    home: "Other",
    yard: "No yard",
    household: "",
    message:
      "Hi, I hope this finds you well. I run a pet lifestyle blog with 80k monthly " +
      "readers and I'd like to contribute a free guest article to your site — " +
      "'10 Signs You're Ready To Adopt'. All we ask is one do-follow link to our " +
      "sponsor in the author bio. We can cross-publish your content too. Shall I send " +
      "the draft?",
  },
];

/** A submission from the public form at /apply, or one of the samples above.
 *
 *  Rendered into a plausible form-notification email. The agent must not be able
 *  to tell a sample from a hand-typed submission, or a genuine one from spam —
 *  that's the whole claim being demonstrated.
 *
 *  Every single-line field is stripped of CR/LF before it reaches a subject
 *  line, and everything is length-capped: the form is "public", so treat it
 *  like it is. */
export type FormSubmission = Record<string, unknown>;

const line = (v: unknown, max = 200) =>
  String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

const block = (v: unknown, max = 4000) =>
  String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

export function formToEmail(f: FormSubmission): { subject: string; body: string } {
  const name = line(f.name, 120) || "(no name given)";
  const dog = line(f.dog, 60) || "unspecified";

  const body = `A new application was submitted through the ${ORG} website.

Applicant: ${name}
Email: ${line(f.email, 160) || "(none)"}
Phone: ${line(f.phone, 60) || "(none)"}
Dog of interest: ${dog}

Housing: ${line(f.home, 120) || "(not answered)"}
Outdoor space: ${line(f.yard, 120) || "(not answered)"}
Others at home: ${line(f.household, 300) || "(not answered)"}

In their own words:
${block(f.message) || "(left blank)"}

--
Sent automatically by the adoption application form.`;

  return { subject: `New adoption application: ${dog} — ${name}`, body };
}
