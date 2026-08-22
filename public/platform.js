"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const organizations = {
  harbor: {
    name: "Harbor Hope Rescue",
    initials: "HH",
    user: "Rahul · Harbor Hope",
    cases: {
      adoption: [
        {
          id: "ADP-1048",
          title: "Maya Chen + Juniper",
          subtitle: "Application has been screened and is ready for staff review.",
          status: "Ready for approval",
          priority: "normal",
          updated: "6m",
          animal: "Juniper · D-118",
          person: "Maya Chen",
          source: "Gmail application",
          freshness: "Fresh|6 min ago",
          owner: "Tara · Adoption",
          actions: [
            { id: "a1", icon: "S", title: "Add applicant to the shared pipeline", detail: "Create a Google Sheets row with applicant, animal, and screening result.", evidence: "Source: application email · idempotency key ADP-1048:SHEETS:v1" },
            { id: "a2", icon: "C", title: "Hold meet-and-greet slot", detail: "Propose Saturday at 11:00 AM after checking the coordinator calendar.", evidence: "Source: staff calendar · no invitation until applicant confirms" },
          ],
          reminders: [
            { when: "Today", title: "Review application", detail: "Due 4:00 PM · assigned to Tara" },
            { when: "24h", title: "Follow up if no decision", detail: "Escalate to adoption lead" },
          ],
          receipts: [
            { kind: "success", title: "Application parsed", detail: "Gmail message msg_7721 · succeeded", status: "succeeded" },
            { kind: "simulated", title: "Screening proposal stored", detail: "No external action · simulated", status: "simulated" },
          ],
          events: [
            { title: "Case ready for staff review", detail: "Workflow proposed two next actions.", time: "1:54 PM" },
            { title: "Application screened", detail: "Required fields present; no final adoption decision made.", time: "1:52 PM" },
            { title: "Case created", detail: "Received from the shared Gmail adapter.", time: "1:49 PM" },
          ],
        },
        {
          id: "ADP-1047",
          title: "Owen Diaz + Clover",
          subtitle: "Applicant clarification requested; waiting for response.",
          status: "Waiting for response",
          priority: "normal",
          updated: "32m",
          animal: "Clover · D-104",
          person: "Owen Diaz",
          source: "Google Form",
          freshness: "Fresh|32 min ago",
          owner: "Nia · Adoption",
          actions: [
            { id: "a3", icon: "G", title: "Send missing-information email", detail: "Ask for landlord approval and household schedule; staff may edit the draft.", evidence: "Source: two unanswered application fields · idempotency key ADP-1047:GMAIL:v1" },
          ],
          reminders: [{ when: "Tomorrow", title: "Check for applicant reply", detail: "9:00 AM · assigned to Nia" }],
          receipts: [{ kind: "failed", title: "Draft creation failed", detail: "Provider timeout; no message sent", status: "failed" }],
          events: [
            { title: "Gmail adapter returned an error", detail: "Outcome recorded as failed; safe retry available.", time: "1:28 PM" },
            { title: "Clarification proposed", detail: "Workflow found two missing fields.", time: "1:27 PM" },
          ],
        },
      ],
      foster: [
        {
          id: "FST-302",
          title: "Luna · urgent placement",
          subtitle: "Two compatible foster responses need coordinator review.",
          status: "Waiting for response",
          priority: "urgent",
          updated: "3m",
          animal: "Luna · D-203",
          person: "2 foster responses",
          source: "Shelterluv export",
          freshness: "Stale|exported 3h ago",
          owner: "Leo · Foster",
          actions: [
            { id: "f1", icon: "G", title: "Send targeted outreach to 4 fosters", detail: "Personalized Gmail drafts for qualified, recently available fosters.", evidence: "Foster rules supplied by workflow · roster checked 3 hours ago" },
            { id: "f2", icon: "C", title: "Offer two handoff windows", detail: "4:30 PM or 5:15 PM today after a staff calendar check.", evidence: "Times are proposals · invitation requires selected foster and staff approval" },
          ],
          reminders: [
            { when: "45m", title: "No-response escalation", detail: "Expand outreach only after coordinator review" },
            { when: "6 PM", title: "Placement deadline checkpoint", detail: "Notify foster lead if unconfirmed" },
          ],
          receipts: [
            { kind: "success", title: "Availability responses routed", detail: "2 yes · 1 no · 1 unopened", status: "succeeded" },
            { kind: "simulated", title: "Shelterluv reconciliation pending", detail: "Manual update receipt required", status: "simulated" },
          ],
          events: [
            { title: "Second response received", detail: "Response attached to the case without selecting a foster.", time: "1:57 PM" },
            { title: "Outreach campaign approved", detail: "Approved by Leo; four messages dispatched.", time: "1:18 PM" },
            { title: "Urgent placement case created", detail: "Source export age flagged for review.", time: "1:06 PM" },
          ],
        },
      ],
    },
  },
  mission: {
    name: "Mission Valley Shelter",
    initials: "MV",
    user: "Ari · Mission Valley",
    cases: {
      adoption: [
        {
          id: "ADP-883",
          title: "Priya Shah + Maple",
          subtitle: "Meet-and-greet is confirmed; system-of-record update remains open.",
          status: "In progress",
          priority: "normal",
          updated: "11m",
          animal: "Maple · MV-81",
          person: "Priya Shah",
          source: "Public application",
          freshness: "Fresh|11 min ago",
          owner: "Ari · Adoption",
          actions: [{ id: "m1", icon: "S", title: "Prepare Shelterluv update packet", detail: "Produce the approved fields for manual reconciliation.", evidence: "Source: confirmed appointment · no live Shelterluv write" }],
          reminders: [{ when: "Sat", title: "Meet-and-greet reminder", detail: "9:00 AM · email after approval" }],
          receipts: [{ kind: "success", title: "Calendar invitation created", detail: "Google Calendar event evt_218 · succeeded", status: "succeeded" }],
          events: [
            { title: "Applicant confirmed appointment", detail: "Reply routed through shared Gmail adapter.", time: "1:46 PM" },
            { title: "Calendar event created", detail: "Approved by Ari; receipt evt_218 stored.", time: "1:40 PM" },
          ],
        },
      ],
      foster: [
        {
          id: "FST-771",
          title: "Biscuit · weekend foster",
          subtitle: "One potential foster has an availability conflict to resolve.",
          status: "Needs information",
          priority: "urgent",
          updated: "4m",
          animal: "Biscuit · MV-92",
          person: "Jordan Lee",
          source: "Google Form + roster",
          freshness: "Fresh|4 min ago",
          owner: "Sam · Foster",
          actions: [{ id: "m2", icon: "G", title: "Ask foster to confirm Sunday coverage", detail: "Draft a one-question availability email to Jordan.", evidence: "Source conflict: response says Monday; roster says Sunday" }],
          reminders: [{ when: "30m", title: "Availability clarification", detail: "Escalate if no reply" }],
          receipts: [{ kind: "simulated", title: "Conflict recorded", detail: "No action executed while source facts disagree", status: "simulated" }],
          events: [{ title: "Availability conflict detected", detail: "Case moved to needs information.", time: "1:56 PM" }],
        },
        {
          id: "FST-770",
          title: "Poppy · medical foster",
          subtitle: "Staff has paused outreach pending a medical handling review.",
          status: "Reviewing",
          priority: "normal",
          updated: "26m",
          animal: "Poppy · MV-74",
          person: "Unassigned",
          source: "Staff request",
          freshness: "Fresh|26 min ago",
          owner: "Sam · Foster",
          actions: [{ id: "m3", icon: "!", title: "Route to qualified staff reviewer", detail: "Assign a review task; do not make a medical or placement decision.", evidence: "Medical handling is outside automated decision policy" }],
          reminders: [{ when: "Today", title: "Medical review checkpoint", detail: "Due 3:30 PM" }],
          receipts: [],
          events: [{ title: "Automation paused", detail: "Named staff review required before outreach.", time: "1:34 PM" }],
        },
      ],
    },
  },
};

let activeOrg = "harbor";
let activeWorkflow = "adoption";
let activeCaseId = organizations.harbor.cases.adoption[0].id;
const actionStates = new Map();
let toastTimer;

function currentOrganization() { return organizations[activeOrg]; }
function visibleCases() { return currentOrganization().cases[activeWorkflow]; }
function currentCase() { return visibleCases().find((item) => item.id === activeCaseId) || visibleCases()[0]; }

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function titleCase(value) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function renderOrganization() {
  const org = currentOrganization();
  $("#org-name").textContent = org.name;
  $("#org-avatar").textContent = org.initials;
  $("#privacy-org").textContent = org.name;
  $("#case-count").textContent = String(org.cases.adoption.length + org.cases.foster.length);
  $("#organization").value = activeOrg;
  renderCounts();
  renderCases();
  renderNetworkForOrganization();
}

function renderCounts() {
  const allCases = [...currentOrganization().cases.adoption, ...currentOrganization().cases.foster];
  const approvals = allCases.flatMap((item) => item.actions).filter((action) => !actionStates.has(`${activeOrg}:${action.id}`)).length;
  const reminders = allCases.flatMap((item) => item.reminders).length;
  $("#approval-count").textContent = String(approvals);
  $("#reminder-count").textContent = String(reminders);
}

function renderCases() {
  const cases = visibleCases();
  if (!cases.some((item) => item.id === activeCaseId)) activeCaseId = cases[0].id;
  $("#case-list-label").textContent = `${titleCase(activeWorkflow)} cases`;
  $("#case-items").innerHTML = cases.map((item) => `
    <button class="case-item${item.id === activeCaseId ? " is-selected" : ""}" type="button" data-case-id="${escapeHtml(item.id)}" aria-pressed="${item.id === activeCaseId}">
      <span class="priority ${item.priority === "urgent" ? "" : "normal"}" aria-label="${item.priority} priority"></span>
      <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.status)}</small></span>
      <time>${escapeHtml(item.updated)}</time>
    </button>`).join("");
  $$("[data-case-id]", $("#case-items")).forEach((button) => button.addEventListener("click", () => {
    activeCaseId = button.dataset.caseId;
    renderCases();
  }));
  renderCaseDetail();
}

function renderCaseDetail() {
  const item = currentCase();
  $("#case-id").textContent = item.id;
  $("#case-workflow").textContent = activeWorkflow === "adoption" ? "Adoption intake" : "Foster placement";
  $("#case-title").textContent = item.title;
  $("#case-subtitle").textContent = item.subtitle;
  $("#case-status").textContent = item.status;
  $("#animal-name").textContent = item.animal;
  $("#person-name").textContent = item.person;
  $("#source-name").textContent = item.source;
  const [freshnessState, freshnessDetail] = item.freshness.split("|");
  $("#freshness").innerHTML = `<span class="freshness ${freshnessState === "Fresh" ? "fresh" : "stale"}">${escapeHtml(freshnessState)}</span> ${escapeHtml(freshnessDetail)}`;
  $("#case-owner").textContent = item.owner;
  renderActions(item);
  renderReminders(item);
  renderReceipts(item);
  renderTimeline(item);
}

function renderActions(item) {
  const host = $("#action-cards");
  host.innerHTML = item.actions.map((action) => {
    const state = actionStates.get(`${activeOrg}:${action.id}`);
    return `<article class="action-card ${state || ""}" data-action-card="${escapeHtml(action.id)}">
      <span class="action-icon" aria-hidden="true">${escapeHtml(action.icon)}</span>
      <div class="action-copy"><strong>${escapeHtml(action.title)}</strong><p>${escapeHtml(action.detail)}</p><small>${escapeHtml(action.evidence)}</small></div>
      <div class="action-controls">
        ${state ? `<span class="action-decision ${state}">${state === "approved" ? "Approved · simulated" : "Rejected"}</span>` : `<button class="danger-button" type="button" data-reject="${escapeHtml(action.id)}">Reject</button><button class="primary-button" type="button" data-approve="${escapeHtml(action.id)}">Approve</button>`}
      </div>
    </article>`;
  }).join("");
  $$('[data-approve]', host).forEach((button) => button.addEventListener("click", () => decideAction(item, button.dataset.approve, "approved")));
  $$('[data-reject]', host).forEach((button) => button.addEventListener("click", () => decideAction(item, button.dataset.reject, "rejected")));
}

function decideAction(item, actionId, decision) {
  actionStates.set(`${activeOrg}:${actionId}`, decision);
  const action = item.actions.find((candidate) => candidate.id === actionId);
  if (decision === "approved") {
    item.receipts.unshift({ kind: "simulated", title: `${action.title} approved`, detail: `Approved by ${currentOrganization().user}; provider dispatch simulated`, status: "simulated" });
    item.events.unshift({ title: "Action approved", detail: `${action.title} · named approval recorded.`, time: "Now" });
  } else {
    item.events.unshift({ title: "Action rejected", detail: `${action.title} · no provider action executed.`, time: "Now" });
  }
  showToast(decision === "approved" ? "Named approval recorded. Demo dispatch returned a simulated receipt." : "Action rejected. No provider action ran.");
  renderCounts();
  renderCaseDetail();
}

function renderReminders(item) {
  $("#case-reminders").innerHTML = item.reminders.length ? item.reminders.map((reminder, index) => `
    <div class="reminder-item"><span class="when">${escapeHtml(reminder.when)}</span><span><strong>${escapeHtml(reminder.title)}</strong><small>${escapeHtml(reminder.detail)}</small></span><button class="text-button" type="button" data-snooze="${index}">Snooze</button></div>`).join("") : "<p class=\"section-meta\">No open reminders.</p>";
  $$('[data-snooze]', $("#case-reminders")).forEach((button) => button.addEventListener("click", () => {
    const reminder = item.reminders[Number(button.dataset.snooze)];
    reminder.when = "+1h";
    reminder.detail = `${reminder.detail.split(" · ")[0]} · rescheduled by ${currentOrganization().user}`;
    item.events.unshift({ title: "Reminder rescheduled", detail: `${reminder.title} moved by one hour.`, time: "Now" });
    showToast("Reminder moved by one hour and recorded on the timeline.");
    renderCaseDetail();
  }));
}

function renderReceipts(item) {
  const host = $("#receipt-list");
  host.innerHTML = item.receipts.length ? item.receipts.map((receipt, index) => `
    <div class="receipt-item ${receipt.kind}"><span class="receipt-icon ${receipt.kind}" aria-hidden="true">${receipt.kind === "failed" ? "!" : receipt.kind === "success" ? "✓" : "○"}</span><span><strong>${escapeHtml(receipt.title)}</strong><small>${escapeHtml(receipt.detail)}</small></span>${receipt.kind === "failed" ? `<button class="text-button" type="button" data-retry="${index}">Safe retry</button>` : `<span class="receipt-status">${escapeHtml(receipt.status)}</span>`}</div>`).join("") : "<p class=\"section-meta\">No receipts yet.</p>";
  $$('[data-retry]', host).forEach((button) => button.addEventListener("click", () => {
    const receipt = item.receipts[Number(button.dataset.retry)];
    receipt.kind = "simulated";
    receipt.status = "simulated";
    receipt.detail = "Retry evaluated with the same idempotency key; no duplicate action created";
    item.events.unshift({ title: "Safe retry evaluated", detail: "Existing idempotency key reused; demo provider returned simulated.", time: "Now" });
    showToast("Safe retry reused the original idempotency key. No duplicate was created.");
    renderCaseDetail();
  }));
}

function renderTimeline(item) {
  $("#event-timeline").innerHTML = item.events.map((event) => `<li><span><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail)}</p></span><time>${escapeHtml(event.time)}</time></li>`).join("");
}

function renderApprovalQueue() {
  const cards = [...currentOrganization().cases.adoption, ...currentOrganization().cases.foster].flatMap((item) => item.actions.map((action) => ({ item, action }))).filter(({ action }) => !actionStates.has(`${activeOrg}:${action.id}`));
  $("#approval-queue").innerHTML = cards.length ? cards.map(({ item, action }) => `<article class="standalone-card"><span class="eyebrow">${escapeHtml(item.id)} · ${escapeHtml(item.owner)}</span><h3>${escapeHtml(action.title)}</h3><p>${escapeHtml(action.detail)}</p><small>${escapeHtml(action.evidence)}</small><div class="button-row"><button class="secondary-button" type="button" data-open-case="${escapeHtml(item.id)}" data-open-workflow="${currentOrganization().cases.adoption.includes(item) ? "adoption" : "foster"}">Open case</button></div></article>`).join("") : "<article class=\"standalone-card\"><h3>Queue clear</h3><p>No actions are waiting for approval in this organization.</p></article>";
  $$('[data-open-case]', $("#approval-queue")).forEach((button) => button.addEventListener("click", () => openCase(button.dataset.openWorkflow, button.dataset.openCase)));
}

function renderReminderQueue() {
  const reminders = [...currentOrganization().cases.adoption, ...currentOrganization().cases.foster].flatMap((item) => item.reminders.map((reminder) => ({ item, reminder })));
  $("#reminder-queue").innerHTML = reminders.map(({ item, reminder }) => `<article class="standalone-card"><span class="eyebrow">${escapeHtml(reminder.when)} · ${escapeHtml(item.id)}</span><h3>${escapeHtml(reminder.title)}</h3><p>${escapeHtml(reminder.detail)}</p><div class="button-row"><button class="secondary-button" type="button" data-reminder-case="${escapeHtml(item.id)}" data-reminder-workflow="${currentOrganization().cases.adoption.includes(item) ? "adoption" : "foster"}">Open case</button></div></article>`).join("");
  $$('[data-reminder-case]', $("#reminder-queue")).forEach((button) => button.addEventListener("click", () => openCase(button.dataset.reminderWorkflow, button.dataset.reminderCase)));
}

function openCase(workflow, caseId) {
  activateView("cases");
  selectWorkflowTab(workflow);
  activeCaseId = caseId;
  renderCases();
}

function selectWorkflowTab(workflow) {
  activeWorkflow = workflow;
  $$("[role=tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.workflow === workflow)));
  activeCaseId = visibleCases()[0].id;
  renderCases();
}

function activateView(viewName) {
  $$("[data-view-panel]").forEach((panel) => {
    const active = panel.dataset.viewPanel === viewName;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  $$("[data-view]").forEach((button) => {
    const active = button.dataset.view === viewName;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  const headings = {
    cases: ["Cases needing attention", "One shared control plane for adoption, foster, and partner handoffs."],
    approvals: ["Approval queue", "Named human decisions before consequential external actions."],
    reminders: ["Reminder queue", "Follow-ups, deadlines, and escalation across both workflows."],
    network: ["Partner network", "Limited, permissioned capacity exchange between organizations."],
  };
  $("#workspace-title").textContent = headings[viewName][0];
  $("#workspace-summary").textContent = headings[viewName][1];
  if (viewName === "approvals") renderApprovalQueue();
  if (viewName === "reminders") renderReminderQueue();
}

function resetNetworkSteps() {
  $("#offer-step").className = "flow-step active";
  $("#grant-step").className = "flow-step";
  $("#handoff-step").className = "flow-step";
  $("#offer-step-text").textContent = "One partner response";
  $("#grant-step-text").textContent = "Awaiting named approval";
  $("#handoff-step-text").textContent = "Not scheduled";
  $("#offer-card").hidden = false;
  $("#grant-card").hidden = true;
  $("#handoff-receipt").hidden = true;
}

function renderNetworkForOrganization() {
  resetNetworkSteps();
  const offer = $("#offer-card");
  if (activeOrg === "harbor") {
    $(".offer-org strong", offer).textContent = "Mission Valley Shelter";
    $(".offer-org small", offer).textContent = "Verified partner · replied 8 min ago";
    $(".offer-org .org-avatar", offer).textContent = "MV";
    $("#review-offer").textContent = "Review offer";
    $("#decline-offer").hidden = false;
    $("#review-offer").disabled = false;
  } else {
    $(".offer-org strong", offer).textContent = "Your capacity offer to Harbor Hope";
    $(".offer-org small", offer).textContent = "Limited request summary · submitted 8 min ago";
    $(".offer-org .org-avatar", offer).textContent = "MV";
    $("#review-offer").textContent = "Awaiting Harbor Hope";
    $("#decline-offer").hidden = true;
    $("#review-offer").disabled = true;
  }
}

$("#organization").addEventListener("change", (event) => {
  activeOrg = event.target.value;
  activeWorkflow = "adoption";
  activeCaseId = currentOrganization().cases.adoption[0].id;
  selectWorkflowTab("adoption");
  renderOrganization();
  const currentView = $(".nav-item.is-active").dataset.view;
  activateView(currentView);
  showToast(`Switched to the synthetic ${currentOrganization().name} workspace.`);
});

$$("[data-view]").forEach((button) => button.addEventListener("click", () => activateView(button.dataset.view)));
$$("[role=tab]").forEach((tab, index, tabs) => {
  tab.addEventListener("click", () => selectWorkflowTab(tab.dataset.workflow));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    tabs[next].focus();
    tabs[next].click();
  });
});

$("#add-reminder").addEventListener("click", () => {
  const item = currentCase();
  item.reminders.push({ when: "+2h", title: "Coordinator checkpoint", detail: `Added by ${currentOrganization().user}` });
  item.events.unshift({ title: "Reminder scheduled", detail: "Coordinator checkpoint in two hours.", time: "Now" });
  showToast("Reminder added to this case.");
  renderCounts();
  renderCaseDetail();
});

$("#notification-button").addEventListener("click", () => {
  activateView("reminders");
  $("#workspace").focus();
});

$("#review-offer").addEventListener("click", () => {
  if (activeOrg !== "harbor") return;
  $("#offer-card").hidden = true;
  $("#grant-card").hidden = false;
  $("#offer-step").className = "flow-step done";
  $("#grant-step").className = "flow-step active";
  $("#offer-step-text").textContent = "Offer selected for review";
  $("#approver-name").value = currentOrganization().user;
  $("#approver-name").focus();
});

$("#cancel-grant").addEventListener("click", () => resetNetworkSteps());
$("#decline-offer").addEventListener("click", () => {
  $("#offer-card").hidden = true;
  $("#offer-step").className = "flow-step done";
  $("#offer-step-text").textContent = "Offer declined";
  showToast("Offer declined. Private data remained unshared.");
});

$("#approve-grant").addEventListener("click", () => {
  const approver = $("#approver-name").value.trim();
  if (!approver) {
    $("#approver-name").setAttribute("aria-invalid", "true");
    $("#approver-name").focus();
    showToast("Enter a named approver before recording the share grant.");
    return;
  }
  $("#approver-name").removeAttribute("aria-invalid");
  $("#grant-card").hidden = true;
  $("#handoff-receipt").hidden = false;
  $("#receipt-approver").textContent = approver;
  $("#grant-step").className = "flow-step done";
  $("#handoff-step").className = "flow-step done";
  $("#grant-step-text").textContent = `Approved by ${approver}`;
  $("#handoff-step-text").textContent = "4:30 PM · simulated receipt";
  showToast("Share grant and simulated handoff receipt recorded. No live data was sent.");
});

renderOrganization();
