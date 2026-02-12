import axios from 'axios';
import fs from 'fs';

const code = fs.readFileSync('server/googleSheets.ts', 'utf8');
const match = code.match(/SHEET_ID\s*=\s*['"]([^'"]+)['"]/);
const sheetId = match ? match[1] : '';
const gidMatch = code.match(/ALL_SHEET_GID\s*=\s*['"]([^'"]+)['"]/);
const gid = gidMatch ? gidMatch[1] : '0';

// Copy exact functions from googleSheets.ts
function splitCSVRows(csv) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && csv[i + 1] === '\n') i++;
      if (current.trim()) rows.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) rows.push(current);
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(csv) {
  const logicalRows = splitCSVRows(csv);
  console.log('Total logical rows:', logicalRows.length);
  
  const headers = parseCSVLine(logicalRows[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  
  for (let i = 1; i < logicalRows.length; i++) {
    const line = logicalRows[i];
    if (!line.trim()) continue;
    const values = parseCSVLine(line);
    const row = {};
    
    headers.forEach((header, index) => {
      const colKey = `__col_${index}`;
      row[colKey] = values[index] || '';
      if (!(header in row)) {
        row[header] = values[index] || '';
      }
      if (!(header.toLowerCase() in row)) {
        row[header.toLowerCase()] = values[index] || '';
      }
    });
    
    rows.push(row);
  }
  return rows;
}

// Now simulate the getString function
function getString(value, maxLength) {
  if (!value || value.trim() === '') return '';
  const trimmed = value.trim();
  return maxLength ? trimmed.substring(0, maxLength) : trimmed;
}

async function main() {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const csv = response.data;
  
  // Check raw CSV around Elvis
  console.log('\n=== RAW CSV ANALYSIS ===');
  const rawIdx = csv.indexOf('Elvis');
  if (rawIdx >= 0) {
    console.log('Raw CSV around Elvis (200 chars before H column):');
    // Find the line
    const lineStart = csv.lastIndexOf('\n', rawIdx) + 1;
    const lineEnd = csv.indexOf('\n', rawIdx);
    const rawLine = csv.substring(lineStart, lineEnd > 0 ? lineEnd : lineStart + 500);
    console.log('Raw line length:', rawLine.length);
  }
  
  const rows = parseCSV(csv);
  
  for (const row of rows) {
    const name = row['opportunity name'] || row['Opportunity Name'] || '';
    if (name.toLowerCase().includes('elvis')) {
      console.log('\n=== ELVIS ROW ===');
      const completedRaw = row['completed inspections'] || row['COMPLETED INSPECTIONS'] || '';
      const completedViaGetString = getString(row['completed inspections'] || row['COMPLETED INSPECTIONS']);
      const addressRaw = row['address'] || row['Address'] || '';
      
      console.log('completedInspections raw:', JSON.stringify(completedRaw));
      console.log('completedInspections via getString:', JSON.stringify(completedViaGetString));
      console.log('completedInspections length:', completedViaGetString.length);
      console.log('address:', JSON.stringify(addressRaw));
      console.log('Has \\n:', completedViaGetString.includes('\n'));
      console.log('Has \\r\\n:', completedViaGetString.includes('\r\n'));
      
      // Also check via column index
      console.log('\nVia column index:');
      console.log('__col_7 (H):', JSON.stringify(row['__col_7']));
      console.log('__col_13 (N):', JSON.stringify(row['__col_13']));
      console.log('__col_30 (AE):', JSON.stringify(row['__col_30']));
    }
  }
}

main().catch(console.error);
