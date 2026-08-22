/** One-time setup: build the adopter and foster Sheets in YOUR OWN Google
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
import { FOSTER_HEADERS, FOSTER_SHEET_TITLE, HEADERS, ORG, SHEET_TITLE } from "./dogs.js";
import { EXISTING_ROWS } from "./applications.js";
import { FOSTER_EXISTING_ROWS } from "./fosters.js";

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
async function findSheet(title: string, contains: string): Promise<{ id: string; url: string } | null> {
  const out = await run("GoogleSheets_SearchSpreadsheets", {
    spreadsheet_contains: [contains],
    limit: 50,
  });
  const sheets = (out?.spreadsheets ?? []) as Record<string, string>[];
  const hit = sheets.find((s) => s.name === title);
  return hit ? { id: hit.id, url: hit.url } : null;
}

async function buildSheet(title: string, headers: readonly string[], existing: string[][]) {
  const rows = [headers as unknown as string[], ...existing].map((row) => ({
    values: row.map((cell) => ({ userEnteredValue: { stringValue: cell } })),
  }));

  const created = await run("GoogleSheets_CreateOrEditSpreadsheet", {
    title,
    requests: [
      { updateCells: { start: { sheetId: 0, rowIndex: 0, columnIndex: 0 }, rows } },
      {
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
        },
      },
      { updateSheetProperties: { properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } } } },
      {
        autoResizeDimensions: {
          dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: headers.length },
        },
      },
    ],
  });
  return created;
}

async function seedOne(
  label: string,
  title: string,
  contains: string,
  headers: readonly string[],
  existing: string[][],
  force: boolean,
) {
  const found = await findSheet(title, contains);
  if (found && !force) {
    console.log(`  ${label} already seeded: ${found.url}`);
    return;
  }
  const created = await buildSheet(title, headers, existing);
  const url =
    (created?.spreadsheet_url as string | undefined) ??
    (created?.url as string | undefined) ??
    (created?.spreadsheetId || created?.spreadsheet_id
      ? `https://docs.google.com/spreadsheets/d/${created.spreadsheetId ?? created.spreadsheet_id}/edit`
      : null);
  const located = await findSheet(title, contains);
  console.log(`  ${label} ready: ${url ?? located?.url ?? "(check your Drive)"}`);
  if (created && !url) console.log(`  ${JSON.stringify(created).slice(0, 500)}`);
}

const force = process.argv.includes("--force");
const fosterOnly = process.argv.includes("--foster");

console.log(`\nSeeding ${ORG} into ${ARCADE_USER_ID}\n`);

if (!fosterOnly) {
  await seedOne("Adopter Pipeline", SHEET_TITLE, "Adopter Pipeline", HEADERS, EXISTING_ROWS, force);
}
await seedOne(
  "Foster applications",
  FOSTER_SHEET_TITLE,
  "Foster applications",
  FOSTER_HEADERS,
  FOSTER_EXISTING_ROWS,
  force || fosterOnly,
);

console.log("\n  Next: npm run dev\n");
