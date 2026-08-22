export type DogSizeBand = "small" | "medium" | "large";
export type DogStatus = "available" | "foster_needed" | "in_foster" | "adoption_pending";

/** One dog shape shared by intake, foster placement, and the operator dashboard. */
export type DogRecord = {
  id: string;
  name: string;
  breed: string;
  age: string;
  sizeBand: DogSizeBand;
  status: DogStatus;
  summary: string;
  careNotes: string[];
  photoUrl?: string;
};

/** Five synthetic dogs form the complete demo inventory. Forms keep submitting
 *  readable names; the local record layer resolves each name to the stable id. */
export const DOGS: readonly DogRecord[] = [
  {
    id: "dog_luna",
    name: "Luna",
    breed: "Shepherd mix",
    age: "4 years",
    sizeBand: "large",
    status: "foster_needed",
    summary: "A thoughtful, people-oriented shepherd mix who relaxes once she is away from the busy kennel. Luna loves steady routines, quiet companionship, and patient walks where she can keep comfortable distance from unfamiliar dogs.",
    careNotes: [
      "Cat-free home required",
      "Handling level 2 or higher",
      "Medication given with food",
      "Use distance from unfamiliar dogs on walks",
    ],
    photoUrl: "https://images.unsplash.com/photo-1666357703014-1ee54923cdfb?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "dog_biscuit",
    name: "Biscuit",
    breed: "Beagle mix",
    age: "3 years",
    sizeBand: "medium",
    status: "available",
    summary: "A cheerful, food-motivated beagle mix who believes every walk is a scent-detective mission. Biscuit would thrive with an active family that enjoys games, reward-based training, and plenty of sniffing time.",
    careNotes: ["Daily enrichment", "Secure outdoor space preferred"],
    photoUrl: "https://images.unsplash.com/photo-1550079523-d0a53ff02f2b?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "dog_marigold",
    name: "Marigold",
    breed: "Pit bull terrier",
    age: "7 years",
    sizeBand: "large",
    status: "available",
    summary: "A mellow senior with a soft heart and an expert talent for finding the warmest sunbeam. Marigold prefers gentle introductions, cozy afternoons, and people who appreciate her calm, affectionate pace.",
    careNotes: ["Joint supplement with breakfast", "Prefers a quiet introduction"],
    photoUrl: "https://images.unsplash.com/photo-1637081648033-514ad390ec1e?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "dog_tofu",
    name: "Tofu",
    breed: "Chihuahua / dachshund",
    age: "1 year",
    sizeBand: "small",
    status: "adoption_pending",
    summary: "A tiny, affectionate comedian with a very large opinion of himself. Tofu is learning that new people are friends, and he will do best with someone who can continue his crate routine and celebrate his brave little wins.",
    careNotes: ["Slow introductions", "Continue crate-training routine"],
    photoUrl: "https://images.unsplash.com/photo-1744156268718-7476012356dc?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "dog_juniper",
    name: "Juniper",
    breed: "Border collie",
    age: "5 years",
    sizeBand: "medium",
    status: "in_foster",
    summary: "A bright, energetic border collie who is happiest when her brain and body both have a job. Juniper is looking for an experienced, active home ready for puzzle games, structured exercise, and a loyal adventure partner.",
    careNotes: ["High daily exercise", "Puzzle feeding recommended"],
    photoUrl: "https://images.unsplash.com/photo-1554235386-82e08c80c3ef?auto=format&fit=crop&w=900&q=80",
  },
];

export function findDog(reference: unknown): DogRecord | undefined {
  const value = String(reference ?? "").trim().toLocaleLowerCase();
  return DOGS.find((dog) => dog.id.toLocaleLowerCase() === value || dog.name.toLocaleLowerCase() === value);
}

export function requireDog(reference: unknown): DogRecord {
  const dog = findDog(reference);
  if (!dog) throw new Error("Select a dog from the current inventory");
  return structuredClone(dog);
}

/** The brand, in exactly one place.
 *
 *  Everything user-visible derives from this: the console, the public form, the
 *  agent's persona, the Sheet title, the OAuth consent screen. Renaming the
 *  operation should be a one-line change, not a grep. */
export const ORG = "MNR Dog Shelter";

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
