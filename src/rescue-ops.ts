import { randomUUID } from "node:crypto";

import { GENUINE_SAMPLES, type FormSample as AdoptionFormFields } from "./applications.js";
import { DOGS, findDog, requireDog, type DogRecord } from "./dogs.js";
import { FOSTER_SAMPLES, type FosterSample as FosterFormFields } from "./fosters.js";

export type RecordSource = "synthetic_seed" | "public_form" | "demo_email";

export type PersonRecord = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  city?: string;
  createdAt: string;
  updatedAt: string;
};

export type AdoptionApplicationRecord = {
  id: string;
  personId: string;
  dogId: string;
  status: "pending_triage" | "in_review" | "scheduled" | "closed";
  housing: string;
  outdoorSpace: string;
  household: string;
  message: string;
  source: RecordSource;
  submittedAt: string;
};

export type FosterApplicationRecord = {
  id: string;
  personId: string;
  preferredDogId?: string;
  preferredDogLabel: string;
  status: "pending_triage" | "needs_review" | "approved" | "declined";
  availability: { start?: string; end?: string };
  experience: string;
  hoursHome: string;
  housing: string;
  outdoorSpace: string;
  otherPets: string;
  children: string;
  medication: string;
  vetTransport: string;
  notes: string;
  source: RecordSource;
  submittedAt: string;
};

/** Safety-sensitive values are intentionally unknown until a staff member
 *  reviews the original foster application and confirms them. */
export type FosterProfileReview = {
  applicationId: string;
  personId: string;
  status: "needs_review" | "active" | "inactive";
  capacityMaximum: number | null;
  hasCats: boolean | null;
  hasDogs: boolean | null;
  handlingLevel: number | null;
  medicationCapable: boolean | null;
  distanceMiles: number | null;
  availabilityConfirmedAt: string | null;
};

export type SharedActivityEvent = {
  id: string;
  type: "adoption_application_received" | "foster_application_received";
  personId: string;
  dogId?: string;
  recordId: string;
  summary: string;
  at: string;
};

export type RescueOpsState = {
  dogs: DogRecord[];
  people: PersonRecord[];
  adoptionApplications: AdoptionApplicationRecord[];
  fosterApplications: FosterApplicationRecord[];
  fosterProfileReviews: FosterProfileReview[];
  activity: SharedActivityEvent[];
};

const text = (value: unknown, max = 4000) => String(value ?? "").trim().slice(0, max);
const optional = (value: unknown, max = 4000) => text(value, max) || undefined;

export class RescueOpsStore {
  private readonly state: RescueOpsState = {
    dogs: structuredClone([...DOGS]),
    people: [],
    adoptionApplications: [],
    fosterApplications: [],
    fosterProfileReviews: [],
    activity: [],
  };

  constructor(
    private readonly clock: () => Date = () => new Date(),
    seedSyntheticRecords = true,
  ) {
    if (seedSyntheticRecords) this.seed();
  }

  snapshot(): RescueOpsState {
    return structuredClone(this.state);
  }

  private upsertPerson(input: Record<string, unknown>) {
    const email = text(input.email, 160).toLocaleLowerCase();
    const name = text(input.name, 120);
    if (!name || !email) throw new Error("Name and email are required");
    const now = this.clock().toISOString();
    const existing = this.state.people.find((person) => person.email.toLocaleLowerCase() === email);
    if (existing) {
      existing.name = name;
      existing.phone = optional(input.phone, 60) ?? existing.phone;
      existing.city = optional(input.city, 80) ?? existing.city;
      existing.updatedAt = now;
      return existing;
    }
    const person: PersonRecord = {
      id: randomUUID(),
      name,
      email,
      phone: optional(input.phone, 60),
      city: optional(input.city, 80),
      createdAt: now,
      updatedAt: now,
    };
    this.state.people.push(person);
    return person;
  }

  recordAdoptionApplication(input: Record<string, unknown>, source: RecordSource = "public_form") {
    const dog = requireDog(input.dog);
    const person = this.upsertPerson(input);
    const submittedAt = this.clock().toISOString();
    const record: AdoptionApplicationRecord = {
      id: randomUUID(),
      personId: person.id,
      dogId: dog.id,
      status: "pending_triage",
      housing: text(input.home, 120),
      outdoorSpace: text(input.yard, 120),
      household: text(input.household, 300),
      message: text(input.message),
      source,
      submittedAt,
    };
    this.state.adoptionApplications.push(record);
    this.state.activity.push({
      id: randomUUID(),
      type: "adoption_application_received",
      personId: person.id,
      dogId: dog.id,
      recordId: record.id,
      summary: `${person.name} applied to adopt ${dog.name}`,
      at: submittedAt,
    });
    return structuredClone(record);
  }

  recordFosterApplication(input: Record<string, unknown>, source: RecordSource = "public_form") {
    const preferredDogLabel = text(input.dog, 60) || "Any";
    const acceptsAnyDog = preferredDogLabel.toLocaleLowerCase() === "any";
    const dog = acceptsAnyDog ? undefined : findDog(preferredDogLabel);
    if (!acceptsAnyDog && !dog) throw new Error("Select a dog from the current inventory");
    const person = this.upsertPerson(input);
    const submittedAt = this.clock().toISOString();
    const record: FosterApplicationRecord = {
      id: randomUUID(),
      personId: person.id,
      preferredDogId: dog?.id,
      preferredDogLabel,
      status: "pending_triage",
      availability: {
        start: optional(input.available_from, 40),
        end: optional(input.available_until, 40),
      },
      experience: text(input.experience, 120),
      hoursHome: text(input.hours, 200),
      housing: text(input.home, 120),
      outdoorSpace: text(input.yard, 120),
      otherPets: text(input.pets, 300),
      children: text(input.children, 200),
      medication: text(input.meds, 120),
      vetTransport: text(input.transport, 120),
      notes: text(input.message),
      source,
      submittedAt,
    };
    this.state.fosterApplications.push(record);
    this.state.fosterProfileReviews.push({
      applicationId: record.id,
      personId: person.id,
      status: "needs_review",
      capacityMaximum: null,
      hasCats: null,
      hasDogs: null,
      handlingLevel: null,
      medicationCapable: null,
      distanceMiles: null,
      availabilityConfirmedAt: null,
    });
    this.state.activity.push({
      id: randomUUID(),
      type: "foster_application_received",
      personId: person.id,
      dogId: dog?.id,
      recordId: record.id,
      summary: `${person.name} applied to foster ${dog?.name ?? "any dog"}`,
      at: submittedAt,
    });
    return structuredClone(record);
  }

  private seed() {
    const adoptionSeeds = GENUINE_SAMPLES.slice(0, 2) as AdoptionFormFields[];
    const fosterSeeds = FOSTER_SAMPLES.slice(0, 2) as FosterFormFields[];
    for (const application of adoptionSeeds) {
      this.recordAdoptionApplication(application, "synthetic_seed");
    }
    for (const application of fosterSeeds) {
      this.recordFosterApplication(application, "synthetic_seed");
    }
  }
}
