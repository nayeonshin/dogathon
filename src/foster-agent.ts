import { Agent } from "@mastra/core/agent";

import { MODEL } from "./config.js";
import {
  fallbackOutreach,
  type FosterProfile,
  type UrgentFosterRequest,
} from "./foster.js";

const copyAgent = new Agent({
  id: "foster-copy",
  name: "Foster placement copy assistant",
  model: MODEL,
  instructions: `You draft concise, warm messages for a dog rescue's foster-placement staff.
Use only the facts supplied. Never claim a message was sent, a placement was approved,
or a calendar event was created. Never change eligibility, safety rules, or staff choices.
Return only the message body, with no label, markdown, or commentary.`,
});

async function draft(prompt: string, fallback: string): Promise<string> {
  try {
    const result = await copyAgent.generate(prompt, { maxSteps: 1 });
    const text = result.text
      .replace(/^subject:.*\r?\n+/i, "")
      .replace(/^draft preview[^\r\n]*\r?\n+/i, "")
      .trim();
    return text || fallback;
  } catch (error) {
    console.warn(`[warn] foster copy generation failed; using fallback: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

export async function generateOutreachMessages(
  request: UrgentFosterRequest,
  profiles: FosterProfile[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(profiles.map(async (profile) => {
    const fallback = fallbackOutreach(request, profile);
    const prompt = `Draft a targeted foster outreach preview under 95 words.

Foster: ${profile.displayName}
Dog: ${request.dog.name}, ${request.dog.breed}, ${request.dog.age}
Need: ${request.durationDays} days, ${request.start} through ${request.end}
Handoff: ${request.handoffLocation}
Dog summary: ${request.dog.summary}
Care notes: ${request.dog.careNotes.join("; ")}
Why shortlisted: current availability covers the stay, capacity is open, household restrictions pass, and handling/medication qualifications match.
Required close: Ask them to review the foster page and respond Yes, No, or Maybe. Make clear this is a request, not a confirmed placement.`;
    return [profile.id, await draft(prompt, fallback)] as const;
  }));
  return Object.fromEntries(entries);
}

export async function generatePlacementMessage(
  kind: "confirmation" | "reminder",
  request: UrgentFosterRequest,
  profile: FosterProfile,
  selectedSlot?: string,
): Promise<string> {
  const firstName = profile.displayName.split(" ")[0];
  const slotText = selectedSlot
    ? new Date(selectedSlot).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })
    : "the staff-approved handoff time";
  const fallback = kind === "confirmation"
    ? `Hi ${firstName} - staff selected you as ${request.dog.name}'s primary foster. The proposed handoff is ${slotText} at ${request.handoffLocation}. This is a preview for staff review and has not been sent.`
    : `Hi ${firstName} - a reminder for ${request.dog.name}'s foster handoff at ${slotText}, ${request.handoffLocation}. Please bring any questions for the care team. This is a preview for staff review and has not been sent.`;
  const prompt = `Draft a ${kind} preview under 70 words for ${profile.displayName}.
Dog: ${request.dog.name}. Handoff: ${slotText} at ${request.handoffLocation}.
Care notes: ${request.dog.careNotes.join("; ")}.
Explicitly say this is a staff-review preview and has not been sent.`;
  return draft(prompt, fallback);
}
