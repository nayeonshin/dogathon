/** One-time setup: build the adopter Sheet in YOUR OWN Google
 *  account. Nothing is shared — no common credentials, no common state.
 *
 *      npm run seed
 *
 *  Inbound applications are NOT seeded here. The server's "Send demo email"
 *  button provides those on demand, so you can trigger a triage run whenever
 *  you want instead of racing a pre-filled inbox.
 */
import Arcade from "@arcadeai/arcadejs";
import { ARCADE_API_KEY, ARCADE_USER_ID } from "./config.js";
import { HEADERS, ORG, SHEET_TITLE } from "./dogs.js";
import { EXISTING_ROWS } from "./applications.js";

const arcade = new Arcade({ apiKey: ARCADE_API_KEY });

async function run(toolName: string, input: Record<string, unknown>) {
  const auth = await arcade.tools.authorize({ tool_name: toolName, user_id: ARCADE_USER_ID });
  if (auth.status !== "completed") {
    console.log(`\n  Authorize ${toolName}:\n  ${auth.url}\n`);
    await arcade.auth.waitForCompletion(auth);
  }
  const result = await arcade.tools.execute({
    tool_name: toolName,
    input,
    user_id: ARCADE_USER_ID,
  });
  if (!result.success) {
    throw new Error(`${toolName} failed: ${JSON.stringify(result.output?.error)}`);
  }
  return result.output?.value as Record<string, unknown>;
}

/** `spreadsheet_contains` does NOT reliably filter on the title — it returns
 *  unrelated sheets — so match the name here instead of trusting the API. */
async function findSheet(): Promise<{ id: string; url: string } | null> {
  const out = await run("GoogleSheets_SearchSpreadsheets", {
    spreadsheet_contains: ["Adopter Pipeline"],
    limit: 50,
  });
  const sheets = (out?.spreadsheets ?? []) as Record<string, string>[];
  const hit = sheets.find((s) => s.name === SHEET_TITLE);
  return hit ? { id: hit.id, url: hit.url } : null;
}

async function buildSheet() {
  const rows = [HEADERS as unknown as string[], ...EXISTING_ROWS].map((row) => ({
    values: row.map((cell) => ({ userEnteredValue: { stringValue: cell } })),
  }));

  await run("GoogleSheets_CreateOrEditSpreadsheet", {
    title: SHEET_TITLE,
    requests: [
      { updateCells: { start: { sheetId: 0, rowIndex: 0, columnIndex: 0 }, rows } },
      {
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
        },
      },
      { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } } } },
      {
        autoResizeDimensions: {
          dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: HEADERS.length },
        },
      },
    ],
  });
}

const force = process.argv.includes("--force");

console.log(`\nSeeding ${ORG} into ${ARCADE_USER_ID}\n`);

const existing = await findSheet();
if (existing && !force) {
  console.log(`  Already seeded: ${existing.url}`);
  console.log("  Re-run with --force to create a second copy.\n");
} else {
  await buildSheet();
  const created = await findSheet();
  console.log(`  Sheet ready: ${created?.url ?? "(check your Drive)"}\n`);
}

console.log("  Next: npm run dev\n");
