/** The roster.
 *
 *  One place to change the dogs. The seeder, the agent instructions and the
 *  README all refer to these, so edit here and nowhere else. */
export const DOGS = [
  { name: "Biscuit", breed: "Beagle mix", age: 3, note: "Will trade a kidney for a tennis ball." },
  { name: "Marigold", breed: "Pit bull terrier", age: 7, note: "Senior. Professional sunbeam locator." },
  { name: "Tofu", breed: "Chihuahua / dachshund", age: 1, note: "Small, loud, deeply convinced he is large." },
  { name: "Juniper", breed: "Border collie", age: 5, note: "Needs a job or she will invent one." },
  { name: "Waffles", breed: "Labrador mix", age: 2, note: "Has never met a stranger, only future friends." },
  { name: "Olive", breed: "Greyhound", age: 9, note: "Retired racer. Now a couch with opinions." },
] as const;

/** The brand, in exactly one place.
 *
 *  Everything user-visible derives from this: the console, the public form, the
 *  agent's persona, the Sheet title, the OAuth consent screen. Renaming the
 *  operation should be a one-line change, not a grep. */
export const ORG = "Mateo's Dog System";

/** NOTE: this is matched against the live Sheet by title. Change ORG and the
 *  agent will look for a Sheet that does not exist yet — re-run `npm run seed`. */
export const SHEET_TITLE = `${ORG} — Adopter Pipeline`;

export const HEADERS = [
  "Applicant Name",
  "Email",
  "Phone",
  "Dog of Interest",
  "Application Date",
  "Status",
  "Assigned Volunteer",
  "Meet & Greet",
] as const;

export const FOSTER_SHEET_TITLE = `${ORG} — Foster applications`;

export const FOSTER_HEADERS = [
  "Applicant Name",
  "Email",
  "Phone",
  "City",
  "Dog (or Any)",
  "Available from",
  "Available until",
  "Experience",
  "Hours home",
  "Housing",
  "Outdoor space",
  "Other pets",
  "Children",
  "Medication",
  "Vet transport",
  "Notes",
  "Application Date",
  "Status",
  "Assigned Volunteer",
  "Home Visit",
] as const;
