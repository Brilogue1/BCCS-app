/**
 * One-time cleanup: delete inspectionReports DB records that no longer
 * have a matching row in the Past Inspections Google Sheet.
 *
 * Matching logic: opportunityId + sheetRowIndex must both exist in the sheet.
 * If sheetRowIndex is null (old records), fall back to opportunityId + inspectionType match.
 */

import axios from 'axios';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const SHEET_ID = '1by8YXY2Ra63K6XrT2y0w-o7Wb7gFNN1ICzVYntTNagU';
const PAST_INSPECTIONS_GID = '1544581649';

async function fetchPastInspectionsCSV() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${PAST_INSPECTIONS_GID}`;
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    responseType: 'text',
  });
  return response.data;
}

function parseCSV(csv) {
  const lines = csv.split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    row.__rowIndex = i - 1; // 0-based data row index
    rows.push(row);
  }
  return rows;
}

async function main() {
  console.log('Fetching Past Inspections sheet...');
  const csv = await fetchPastInspectionsCSV();
  const rows = parseCSV(csv);
  console.log(`Sheet has ${rows.length} data rows`);

  // Build set of valid (opportunityId, rowIndex) and (opportunityId, inspectionType) combos
  const validByRowIndex = new Set(); // "oppId|rowIndex"
  const validByOppType = new Set();  // "oppId|inspectionType"

  for (const row of rows) {
    const oppId = (row['opportunity id'] || row['__col_5'] || row['__col_6'] || '').trim();
    const inspType = (row['inspection type'] || row['__col_7'] || row['__col_8'] || '').trim().toUpperCase();
    const rowIdx = row.__rowIndex;
    if (oppId) {
      validByRowIndex.add(`${oppId}|${rowIdx}`);
      if (inspType) validByOppType.add(`${oppId}|${inspType}`);
    }
  }

  console.log(`Valid sheet combos: ${validByRowIndex.size} by row index, ${validByOppType.size} by opp+type`);

  // Connect to DB
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [dbReports] = await conn.query('SELECT id, opportunityId, inspectionType, sheetRowIndex FROM inspectionReports');
  console.log(`DB has ${dbReports.length} inspection reports`);

  const toDelete = [];
  for (const report of dbReports) {
    const oppId = (report.opportunityId || '').trim();
    const inspType = (report.inspectionType || '').trim().toUpperCase();
    const rowIdx = report.sheetRowIndex;

    if (!oppId) {
      // No opportunityId — can't match, leave it
      continue;
    }

    let isValid = false;
    if (rowIdx !== null && rowIdx !== undefined) {
      isValid = validByRowIndex.has(`${oppId}|${rowIdx}`);
    } else {
      // Fallback: match by oppId + inspectionType
      isValid = validByOppType.has(`${oppId}|${inspType}`);
    }

    if (!isValid) {
      toDelete.push(report.id);
      console.log(`  → Will DELETE: id=${report.id} oppId=${oppId} type=${inspType} rowIdx=${rowIdx}`);
    }
  }

  console.log(`\nTotal to delete: ${toDelete.length}`);

  if (toDelete.length > 0) {
    const placeholders = toDelete.map(() => '?').join(',');
    const [result] = await conn.query(`DELETE FROM inspectionReports WHERE id IN (${placeholders})`, toDelete);
    console.log(`Deleted ${result.affectedRows} records.`);
  } else {
    console.log('Nothing to delete — DB is already in sync with the sheet.');
  }

  await conn.end();
  console.log('Done.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
