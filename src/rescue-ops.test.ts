import assert from "node:assert/strict";
import test from "node:test";

import { DOGS } from "./dogs.js";
import { RescueOpsStore } from "./rescue-ops.js";

const now = new Date("2026-08-22T18:00:00.000Z");
const emptyStore = () => new RescueOpsStore(() => new Date(now), false);

test("shared inventory contains exactly five uniquely identified dogs", () => {
  assert.equal(DOGS.length, 5);
  assert.equal(new Set(DOGS.map((dog) => dog.id)).size, 5);
  assert.equal(new Set(DOGS.map((dog) => dog.name)).size, 5);
  assert.ok(DOGS.some((dog) => dog.id === "dog_luna" && dog.status === "foster_needed"));
});

test("adoption form fields create linked person, dog, application, and activity records", () => {
  const store = emptyStore();
  const application = store.recordAdoptionApplication({
    name: "Alex Rivera",
    email: "alex@example.com",
    phone: "(415) 555-0101",
    dog: "Biscuit",
    home: "Apartment or condo",
    yard: "No yard",
    household: "One adult, no pets",
    message: "Evening walks and weekend hikes.",
  });
  const state = store.snapshot();
  assert.equal(state.people.length, 1);
  assert.equal(application.dogId, "dog_biscuit");
  assert.equal(application.personId, state.people[0].id);
  assert.equal(application.household, "One adult, no pets");
  assert.equal(state.activity[0].recordId, application.id);
});

test("foster form fields remain intact while safety fields await staff review", () => {
  const store = emptyStore();
  const application = store.recordFosterApplication({
    name: "Maya Chen",
    email: "maya@example.com",
    phone: "(510) 555-0123",
    city: "Oakland",
    dog: "Luna",
    available_from: "2026-08-24",
    available_until: "2026-09-05",
    experience: "Have fostered before",
    hours: "Home most days",
    home: "House I own",
    yard: "Fenced yard",
    pets: "One senior cat",
    children: "None",
    meds: "Yes, pills and drops are fine",
    transport: "Yes, I can drive to vet appointments",
    message: "Available for a home visit Tuesday.",
  });
  const state = store.snapshot();
  const review = state.fosterProfileReviews[0];
  assert.equal(application.preferredDogId, "dog_luna");
  assert.equal(application.otherPets, "One senior cat");
  assert.equal(state.people[0].city, "Oakland");
  assert.equal(review.status, "needs_review");
  assert.equal(review.hasCats, null);
  assert.equal(review.medicationCapable, null);
  assert.equal(review.handlingLevel, null);
});

test("the same email resolves to one shared person across both workflows", () => {
  const store = emptyStore();
  store.recordAdoptionApplication({ name: "Taylor Kim", email: "Taylor@Example.com", dog: "Tofu" });
  store.recordFosterApplication({ name: "Taylor Kim", email: "taylor@example.com", city: "Berkeley", dog: "Any" });
  const state = store.snapshot();
  assert.equal(state.people.length, 1);
  assert.equal(state.people[0].city, "Berkeley");
  assert.equal(state.adoptionApplications[0].personId, state.fosterApplications[0].personId);
});

test("unknown dogs are rejected without leaving partial records", () => {
  const store = emptyStore();
  assert.throws(
    () => store.recordAdoptionApplication({ name: "Casey", email: "casey@example.com", dog: "Unknown" }),
    /current inventory/i,
  );
  assert.equal(store.snapshot().people.length, 0);
});
