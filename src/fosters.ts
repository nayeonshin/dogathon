/** Foster-form samples and the email they become.
 *
 *  Same shape as applications.ts: a sample is FORM FIELDS, and `fosterFormToEmail`
 *  turns one into the intake-mailbox notification. Prefill on /foster and the
 *  email the agent sees stay one list. */
import { ORG } from "./dogs.js";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export const FOSTER_EXISTING_ROWS = [
  [
    "Elena Vasquez", "e.vasquez@example.com", "(415) 555-0211", "San Francisco", "Any",
    "2026-08-10", "2026-09-10", "Have fostered before", "Home most evenings",
    "House I own", "Fenced yard", "None", "None", "Yes, pills and drops are fine",
    "Yes, I can drive to vet appointments", "Repeat foster. Home visit already done.",
    daysAgo(8), "Home visit done", "Dana", daysAgo(3),
  ],
  [
    "Chris Nguyen", "chris.nguyen.sf@example.com", "(510) 555-0190", "Oakland", "Tofu",
    "2026-09-01", "2026-09-15", "First time", "Evenings and weekends",
    "Apartment or condo", "No yard", "None", "None", "Willing to learn",
    "Yes on weekends; weekdays only after 6pm", "First-time foster, small dog only.",
    daysAgo(3), "New", "", "",
  ],
  [
    "Jordan Hale", "jordan.hale@example.com", "(415) 555-0244", "San Francisco", "Marigold",
    "2026-08-24", "2026-09-21", "Have fostered before", "Home most of the day — I work remotely",
    "House I own", "Fenced yard", "One calm senior cat", "None", "Yes, pills and drops are fine",
    "Yes, I can drive to vet appointments", "Can take Marigold for about a month. Weekday mornings before 11am.",
    daysAgo(1), "New", "", "",
  ],
  [
    "Samira Chen", "samira.chen@example.com", "(628) 555-0312", "San Francisco", "Any",
    "2026-08-29", "2026-09-12", "First time", "Evenings and weekends. Out 9–5 weekdays.",
    "Apartment or condo", "No yard", "None", "None", "Willing to learn",
    "Yes on weekends; weekdays only after 6pm", "First time. Smaller dog for two weeks. Weekends only for a visit.",
    daysAgo(0), "New", "", "",
  ],
  [
    "Marcus Bell", "m.bell.oakland@example.com", "(510) 555-0288", "Oakland", "Juniper",
    "2026-09-01", "2026-11-30", "Have fostered before", "Home by 3pm most days",
    "House I rent", "Fenced yard", "A seven-year-old lab mix", "One teen, 14", "Yes",
    "Yes", "Can foster Juniper up to three months. Mid-week after 4pm.",
    daysAgo(2), "New", "", "",
  ],
];

export type FosterSample = {
  name: string;
  email: string;
  phone: string;
  city: string;
  dog: string;
  available_from: string;
  available_until: string;
  experience: string;
  hours: string;
  home: string;
  yard: string;
  pets: string;
  children: string;
  meds: string;
  transport: string;
  message: string;
};

const spam = (
  p: Pick<FosterSample, "name" | "email" | "message"> & Partial<FosterSample>,
): FosterSample => ({
  phone: "",
  city: "",
  dog: "Any",
  available_from: "",
  available_until: "",
  experience: "First time",
  hours: "N/A",
  home: "Other",
  yard: "No yard",
  pets: "",
  children: "",
  meds: "No",
  transport: "No",
  ...p,
});

/** Ten real foster applications. Same axes as adoption: every dog, mixed homes,
 *  and availability stated differently — including one that says nothing. */
export const FOSTER_SAMPLES: FosterSample[] = [
  {
    name: "Jordan Hale",
    email: "jordan.hale@example.com",
    phone: "(415) 555-0244",
    city: "San Francisco",
    dog: "Marigold",
    available_from: "2026-08-24",
    available_until: "2026-09-21",
    experience: "Have fostered before",
    hours: "Home most of the day — I work remotely",
    home: "House I own",
    yard: "Fenced yard",
    pets: "One calm senior cat. They've shared a house with a dog before.",
    children: "None",
    meds: "Yes, pills and drops are fine",
    transport: "Yes, I can drive to vet appointments",
    message:
      "I've fostered two seniors for another rescue and would like to take Marigold " +
      "while she recovers. I can keep her for about a month. Weekday mornings before " +
      "11am are easiest for a home visit.",
  },
  {
    name: "Samira Chen",
    email: "samira.chen@example.com",
    phone: "(628) 555-0312",
    city: "San Francisco",
    dog: "Any",
    available_from: "2026-08-29",
    available_until: "2026-09-12",
    experience: "First time",
    hours: "Evenings and weekends. Out 9–5 weekdays.",
    home: "Apartment or condo",
    yard: "No yard",
    pets: "None",
    children: "None",
    meds: "Willing to learn",
    transport: "Yes on weekends; weekdays only after 6pm",
    message:
      "I want to try fostering for the first time and can take a smaller dog for two " +
      "weeks while you're between kennels. Weekends only for a visit.",
  },
  {
    name: "Marcus Bell",
    email: "m.bell.oakland@example.com",
    phone: "(510) 555-0288",
    city: "Oakland",
    dog: "Juniper",
    available_from: "2026-09-01",
    available_until: "2026-11-30",
    experience: "Have fostered before",
    hours: "Home by 3pm most days",
    home: "House I rent",
    yard: "Fenced yard",
    pets: "A seven-year-old lab mix of my own, good with other dogs.",
    children: "One teen, 14",
    meds: "Yes",
    transport: "Yes",
    message:
      "Juniper needs a job and I have a fenced yard plus a dog who likes company. " +
      "I can foster for up to three months. Mid-week after 4pm works.",
  },
  {
    name: "Leah Okonkwo",
    email: "leah.okonkwo@example.com",
    phone: "(415) 555-0330",
    city: "San Francisco",
    dog: "Biscuit",
    available_from: "2026-08-24",
    available_until: "",
    experience: "Have fostered before",
    hours: "Home after 5:30pm and all weekend",
    home: "House I own",
    yard: "Fenced yard",
    pets: "None right now",
    children: "Two kids, 8 and 11",
    meds: "Yes, pills and drops are fine",
    transport: "Yes, I can drive to vet appointments",
    message:
      "Biscuit sounds like a tennis-ball maniac, which is exactly the energy my kids " +
      "have after school. I can foster as long as you need. Any weekday after 6pm.",
  },
  {
    name: "Owen Park",
    email: "owen.park.sf@example.com",
    phone: "(628) 555-0411",
    city: "San Francisco",
    dog: "Tofu",
    available_from: "2026-08-25",
    available_until: "2026-09-08",
    experience: "First time",
    hours: "Work from home Tuesdays and Thursdays",
    home: "Apartment or condo",
    yard: "No yard",
    pets: "None",
    children: "None",
    meds: "Willing to learn",
    transport: "Yes on weekends; weekdays only after 6pm",
    message:
      "Fourth-floor walk-up, so a small dog is honest. I can cover a two-week gap " +
      "and I'm around most mornings.",
  },
  {
    name: "Rita Alvarez",
    email: "rita.alvarez@example.com",
    phone: "(510) 555-0377",
    city: "Berkeley",
    dog: "Biscuit",
    available_from: "2026-09-01",
    available_until: "2026-09-30",
    experience: "First time",
    hours: "Home by 4pm",
    home: "House I rent",
    yard: "Unfenced yard",
    pets: "None",
    children: "None",
    meds: "Willing to learn",
    transport: "Yes, I can drive to vet appointments",
    message:
      "Landlord approved a foster in writing. The yard isn't fenced so I'd leash-walk. " +
      "Wednesday afternoon is the only time I can do a home visit.",
  },
  {
    name: "Noah Greer",
    email: "noah.greer@example.com",
    phone: "(415) 555-0448",
    city: "San Francisco",
    dog: "Marigold",
    available_from: "2026-08-24",
    available_until: "2026-11-24",
    experience: "Have fostered before",
    hours: "Retired. Home all day.",
    home: "House I own",
    yard: "Fenced yard",
    pets: "None",
    children: "None",
    meds: "Yes, pills and drops are fine",
    transport: "Yes, I can drive to vet appointments",
    message:
      "Marigold is a sunbeam locator, and so am I. Happy to take a senior for a few " +
      "months. Weekends only for the visit.",
  },
  {
    name: "Amina Shah",
    email: "amina.shah@example.com",
    phone: "(628) 555-0502",
    city: "Daly City",
    dog: "Any",
    available_from: "2026-08-24",
    available_until: "",
    experience: "Have fostered before",
    hours: "Hybrid, three days in office",
    home: "Apartment or condo",
    yard: "No yard",
    pets: "A quiet rabbit, separate room",
    children: "None",
    meds: "Yes, pills and drops are fine",
    transport: "Yes, I can drive to vet appointments",
    message:
      "I've overflow-fostered for two other groups when kennels fill up. Open to " +
      "whoever needs a pause. No note here about when I can meet — just call me.",
  },
  {
    name: "Ben Ito",
    email: "ben.ito@example.com",
    phone: "(510) 555-0555",
    city: "Oakland",
    dog: "Juniper",
    available_from: "2026-09-05",
    available_until: "2026-10-05",
    experience: "First time",
    hours: "Out 8–4, then home",
    home: "House I rent",
    yard: "Fenced yard",
    pets: "None",
    children: "One toddler, 2",
    meds: "Willing to learn",
    transport: "Yes, I can drive to vet appointments",
    message:
      "We want to try fostering before we adopt. Juniper seems like she'd do well " +
      "with a job in the yard. Mid-week mornings if you can.",
  },
  {
    name: "Claire Dubois",
    email: "claire.dubois@example.com",
    phone: "(415) 555-0619",
    city: "San Francisco",
    dog: "Luna",
    available_from: "2026-08-28",
    available_until: "2026-09-11",
    experience: "Have fostered before",
    hours: "Home most mornings",
    home: "House I own",
    yard: "Fenced yard",
    pets: "Two cats, dog-savvy",
    children: "None",
    meds: "Yes, pills and drops are fine",
    transport: "Yes, I can drive to vet appointments",
    message:
      "Luna sounds thoughtful and my cats are dog-savvy, apparently. I can " +
      "take him for two weeks. Named day: next Friday after 10am.",
  },
];

export const FOSTER_SPAM: FosterSample[] = [
  spam({
    name: "FosterLeadz CRM",
    email: "sales@fosterleadz.test",
    phone: "(888) 555-0100",
    message:
      "We build CRM software for animal rescues. Book a demo this week and get 30% " +
      "off annual billing. This form seemed like the fastest way to reach intake.",
  }),
  spam({
    name: "asdf",
    email: "asdf@asdf.test",
    phone: "1",
    dog: "Marigold",
    message: "asdf\n\ntest test\n\naaaaaaaaaa",
  }),
  spam({
    name: "Bradley Vance",
    email: "b.vance@apexyieldcapital.test",
    phone: "(212) 555-0100",
    dog: "Marigold",
    message:
      "Quick question — is your organization holding any treasury in stablecoins yet? " +
      "We're onboarding a small number of 501(c)(3)s into a tokenized yield product " +
      "returning 14-18% APY. Minimum allocation is $25k. This window closes Friday.",
  }),
  spam({
    name: "PawsomeSupply Wholesale",
    email: "accounts@pawsomesupply.test",
    phone: "(888) 555-0143",
    dog: "Biscuit",
    message:
      "We manufacture kennels and bulk kibble for shelters. Rescue partners get 40% " +
      "off at MOQ 500. Who handles procurement for your foster network?",
  }),
  spam({
    name: "Studio Lumen",
    email: "hello@studiolumen.test",
    phone: "(415) 555-0900",
    dog: "Tofu",
    message:
      "Pet photographer here — I'd love to shoot your foster dogs for listings. First " +
      "session free, then $180 a dog. Great photos get fosters placed faster!",
  }),
  spam({
    name: "Accounts Receivable",
    email: "billing@invoice-settlement.test",
    dog: "Biscuit",
    message:
      "FINAL NOTICE: Invoice #48812 for directory listing services remains unpaid at " +
      "$487.00. This account is scheduled for collections. Do not reply to this address.",
  }),
  spam({
    name: "Guest Post Team",
    email: "editor@petlifestylehub.test",
    dog: "Juniper",
    message:
      "I'd like to contribute a free guest article, '10 Signs You're Ready To Foster'. " +
      "All we ask is one do-follow link to our sponsor in the author bio.",
  }),
];

export type FormSubmission = Record<string, unknown>;

const line = (v: unknown, max = 200) =>
  String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

const block = (v: unknown, max = 4000) =>
  String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

export function fosterFormToEmail(f: FormSubmission): { subject: string; body: string } {
  const name = line(f.name, 120) || "(no name given)";
  const dog = line(f.dog, 60) || "any";

  const body = `A new FOSTER application was submitted through the ${ORG} website.

Applicant: ${name}
Email: ${line(f.email, 160) || "(none)"}
Phone: ${line(f.phone, 60) || "(none)"}
City: ${line(f.city, 80) || "(not answered)"}
Dog they can foster: ${dog}

Available from: ${line(f.available_from, 40) || "(not answered)"}
Available until: ${line(f.available_until, 40) || "(open-ended)"}
Experience: ${line(f.experience, 120) || "(not answered)"}
Hours at home: ${line(f.hours, 200) || "(not answered)"}
Housing: ${line(f.home, 120) || "(not answered)"}
Outdoor space: ${line(f.yard, 120) || "(not answered)"}
Other pets: ${line(f.pets, 300) || "(not answered)"}
Children: ${line(f.children, 200) || "(not answered)"}
Can administer medication: ${line(f.meds, 120) || "(not answered)"}
Can transport to the vet: ${line(f.transport, 120) || "(not answered)"}

In their own words:
${block(f.message) || "(left blank)"}

--
Sent automatically by the foster application form.`;

  return { subject: `New foster application: ${dog} — ${name}`, body };
}
