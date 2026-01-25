import axios from 'axios';

const SHEET_ID = '1by8YXY2Ra63K6XrT2y0w-o7Wb7gFNN1ICzVYntTNagU';
const ALL_SHEET_GID = '0';
const LOGINS_SHEET_GID = '5432432';
const INSPECTION_REQUESTS_SHEET_GID = '353951797';
const PAST_INSPECTIONS_SHEET_GID = '1544581649'; // Past Inspections sheet

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
      // Also add lowercase version for case-insensitive lookups
      row[header.toLowerCase()] = values[index]?.trim() || '';
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
export async function validateCredentials(email: string, password: string): Promise<{ valid: boolean; role?: string; company?: string }> {
  try {
    const credentials = await fetchLoginCredentials();
    console.log('[DEBUG] Credentials fetched, count:', credentials.length);
    console.log('[DEBUG] Looking for email:', email);
    
    const user = credentials.find(row => {
      const emailMatch = row['Email']?.toLowerCase() === email.toLowerCase();
      const passwordMatch = row['Password:'] === password;
      if (emailMatch) {
        console.log('[DEBUG] Email matched:', row['Email'], 'Password in sheet:', row['Password:'], 'Provided:', password);
      }
      return emailMatch && passwordMatch;
    });
    
    if (!user) {
      console.log('[DEBUG] No matching user found');
      return { valid: false };
    }
    
    // Check if user has admin role from the sheet (Admin? column)
    const isAdmin = user['Admin?']?.toUpperCase() === 'YES';
    const role = isAdmin ? 'admin' : 'user';
    
    // Get company assignment from Column C
    const company = user['Company'] || 'ALL';
    
    return { valid: true, role, company };
  } catch (error) {
    console.error('Error validating credentials:', error);
    return { valid: false };
  }
}


/**
 * Fetch past inspections from the Past Inspections sheet
 */
export async function fetchPastInspections(): Promise<SheetRow[]> {
  try {
    const csv = await fetchSheetAsCSV(PAST_INSPECTIONS_SHEET_GID);
    return parseCSV(csv);
  } catch (error) {
    console.error('Error fetching past inspections from Google Sheets:', error);
    throw new Error('Failed to fetch past inspections from Google Sheets');
  }
}

/**
 * Append additional contact email to the "Additional Contact Emails" sheet
 * Columns: A=Additional Contact Emails, B=Project Name, C=Company, D=Contact Name
 */
export async function appendNewProjectEmail(
  email: string,
  projectName: string,
  company: string,
  contactName: string = ''
): Promise<boolean> {
  try {
    // Send data to Google Apps Script webhook
    const webhookUrl = 'https://script.google.com/macros/s/AKfycbxNxpCKHxrIE5YdR6BxFnHQYYUgzM91ZGLuJPanXbRtFzmwuS2X7Jl--RcV4ketwAFW/exec';
    
    const response = await axios.post(webhookUrl, {
      action: 'additionalContactEmail',
      email,
      projectName,
      company,
      contactName,
    }, {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      maxRedirects: 5,
    });
    
    if (response.data.success) {
      console.log(`[Additional Contact Email] Successfully logged to Google Sheets: Email: ${email}, Project: ${projectName}, Company: ${company}, Contact: ${contactName}`);
      return true;
    } else {
      console.error('[Error] Google Apps Script returned error:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('[Error] Failed to append additional contact email to Google Sheets:', error);
    console.log(`[Additional Contact Email - Fallback] Email: ${email}, Project: ${projectName}, Company: ${company}, Contact: ${contactName}`);
    return false;
  }
}

/**
 * Append client upload data to the Client Uploads sheet
 * Columns: A=Company, B=Project Name, C=Email, D=Upload Link
 */
export async function appendClientUpload(
  company: string,
  projectName: string,
  email: string,
  uploadLink: string
): Promise<boolean> {
  try {
    // Send data to Google Apps Script webhook
    const webhookUrl = 'https://script.google.com/macros/s/AKfycbxNxpCKHxrIE5YdR6BxFnHQYYUgzM91ZGLuJPanXbRtFzmwuS2X7Jl--RcV4ketwAFW/exec';
    
    const response = await axios.post(webhookUrl, {
      action: 'clientUpload',
      company,
      projectName,
      email,
      uploadLink,
    }, {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      maxRedirects: 5,
    });
    
    if (response.data.success) {
      console.log(`[Client Upload] Successfully logged to Google Sheets: Company: ${company}, Project: ${projectName}, Email: ${email}, Link: ${uploadLink}`);
      return true;
    } else {
      console.error('[Error] Google Apps Script returned error:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('[Error] Failed to append client upload to Google Sheets:', error);
    console.log(`[Client Upload - Fallback] Company: ${company}, Project: ${projectName}, Email: ${email}, Link: ${uploadLink}`);
    return false;
  }
}

/**
 * Append inspection data to the Inspection Requests sheet using Google Sheets API
 * Columns: A=Project Name, B=User Email, C=Inspection Type, D=Scheduled Date/Time, E=Inspector Name, F=Approved, G=Opportunity ID, H=Notes
 */
export async function appendInspectionRequest(
  projectName: string,
  userEmail: string,
  inspectionType: string,
  scheduledDateTime: string,
  inspectorName: string,
  approved: string = 'pending',
  opportunityId: string = '',
  notes: string = ''
): Promise<boolean> {
  try {
    // Send data to Google Apps Script webhook
    const webhookUrl = 'https://script.google.com/macros/s/AKfycbxNxpCKHxrIE5YdR6BxFnHQYYUgzM91ZGLuJPanXbRtFzmwuS2X7Jl--RcV4ketwAFW/exec';
    
    const response = await axios.post(webhookUrl, {
      projectName,
      userEmail,
      inspectionType,
      scheduledDateTime,
      inspectorName,
      approved,
      opportunityId,
      notes,
    }, {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      maxRedirects: 5,
    });
    
    if (response.data.success) {
      console.log(`[Inspection Request] Successfully logged to Google Sheets: Project: ${projectName}, Email: ${userEmail}, Type: ${inspectionType}, DateTime: ${scheduledDateTime}, Inspector: ${inspectorName}, Approved: ${approved}, Notes: ${notes}`);
      return true;
    } else {
      console.error('[Error] Google Apps Script returned error:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('[Error] Failed to append inspection request to Google Sheets:', error);
    console.log(`[Inspection Request - Fallback] Project: ${projectName}, Email: ${userEmail}, Type: ${inspectionType}, DateTime: ${scheduledDateTime}, Inspector: ${inspectorName}, Approved: ${approved}, Notes: ${notes}`);
    return false;
  }
}
