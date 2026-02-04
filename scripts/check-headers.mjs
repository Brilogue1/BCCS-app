import axios from 'axios';

const SHEET_ID = '1by8YXY2Ra63K6XrT2y0w-o7Wb7gFNN1ICzVYntTNagU';
const ALL_SHEET_GID = '0';

async function fetchHeaders() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${ALL_SHEET_GID}`;
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  
  const csv = response.data;
  const firstLine = csv.split('\n')[0];
  const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  console.log('Total columns:', headers.length);
  
  // Look for opportunity-related columns
  console.log('\n--- Opportunity-related columns ---');
  headers.forEach((h, i) => {
    if (h.toLowerCase().includes('opp') || h.toLowerCase().includes('opportunity')) {
      console.log(`Column index ${i}: "${h}"`);
    }
  });
  
  // Show column AQ (index 42)
  console.log('\n--- Column AQ (index 42) ---');
  console.log('AQ:', headers[42] || 'NOT FOUND');
  
  // Show columns around AQ
  console.log('\n--- Columns 40-50 ---');
  for (let i = 40; i < 50 && i < headers.length; i++) {
    console.log(`Index ${i}: "${headers[i]}"`);
  }
  
  // Also check first row data for column 42
  const secondLine = csv.split('\n')[1];
  if (secondLine) {
    const values = secondLine.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    console.log('\n--- First data row for columns 40-50 ---');
    for (let i = 40; i < 50 && i < values.length; i++) {
      console.log(`Index ${i}: "${values[i]}"`);
    }
  }
}

fetchHeaders().catch(console.error);
