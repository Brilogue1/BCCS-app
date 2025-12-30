import axios from 'axios';

const SHEET_ID = '1by8YXY2Ra63K6XrT2y0w-o7Wb7gFNN1ICzVYntTNagU';
const ALL_SHEET_GID = '0';
const LOGINS_SHEET_GID = '5432432';

interface SheetRow {
  [key: string]: string | undefined;
}

/**
 * Fetch data from Google Sheets using CSV export (no API key needed)
 * Sheet must be shared with "Anyone with the link can view"
 */
async function fetchSheetAsCSV(gid: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });
  return response.data;
}

/**
 * Parse CSV string into array of objects
 */
function parseCSV(csv: string): SheetRow[] {
  const lines = csv.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0]!.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: SheetRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const values = parseCSVLine(line);
    const row: SheetRow = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || '';
    });
    
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

/**
 * Fetch all projects from the ALL sheet
 */
export async function fetchAllProjects(): Promise<SheetRow[]> {
  try {
    const csv = await fetchSheetAsCSV(ALL_SHEET_GID);
    return parseCSV(csv);
  } catch (error) {
    console.error('Error fetching projects from Google Sheets:', error);
    throw new Error('Failed to fetch projects from Google Sheets');
  }
}

/**
 * Fetch login credentials from App: Logins sheet
 */
export async function fetchLoginCredentials(): Promise<SheetRow[]> {
  try {
    const csv = await fetchSheetAsCSV(LOGINS_SHEET_GID);
    return parseCSV(csv);
  } catch (error) {
    console.error('Error fetching login credentials from Google Sheets:', error);
    throw new Error('Failed to fetch login credentials');
  }
}

/**
 * Validate user credentials against Google Sheets
 */
export async function validateCredentials(email: string, password: string): Promise<{ valid: boolean; role?: string }> {
  try {
    const credentials = await fetchLoginCredentials();
    const user = credentials.find(row => 
      row['Email']?.toLowerCase() === email.toLowerCase() &&
      row['Password:'] === password
    );
    
    if (!user) {
      return { valid: false };
    }
    
    // Check if user has admin role from the sheet (Admin? column)
    const isAdmin = user['Admin?']?.toUpperCase() === 'YES';
    const role = isAdmin ? 'admin' : 'user';
    
    return { valid: true, role };
  } catch (error) {
    console.error('Error validating credentials:', error);
    return { valid: false };
  }
}
