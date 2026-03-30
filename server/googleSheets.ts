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
  // Export with range A:BB to ensure all columns are included
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}&range=A:BB`;
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
  // Updated 2026-02-10: Fixed multi-line quoted field handling
  const logicalRows = splitCSVRows(csv);
  console.log('[CSV DEBUG] Total logical rows:', logicalRows.length);
  if (logicalRows.length === 0) return [];

  const headers = parseCSVLine(logicalRows[0]!).map(h => h.trim().replace(/^"|"$/g, ''));
  console.log('[CSV DEBUG] Headers found:', JSON.stringify(headers.slice(0, 50)));
  console.log('[CSV DEBUG] Total headers count:', headers.length);
  console.log('[CSV DEBUG] All headers:', headers);
  if (headers.length < 30) {
    console.log('[CSV DEBUG] WARNING: Only', headers.length, 'columns found. Expected at least 50+');
  }
  const rows: SheetRow[] = [];

  for (let i = 1; i < logicalRows.length; i++) {
    const line = logicalRows[i]!;
    if (!line.trim()) continue;
    const values = parseCSVLine(line);
    const row: SheetRow = {};
    
    headers.forEach((header, index) => {
      // Use column index as key to avoid duplicate header issues
      const colKey = `__col_${index}`;
      row[colKey] = values[index] || '';
      // Only set header-based keys if not already set (first occurrence wins)
      if (!(header in row)) {
        row[header] = values[index] || '';
      }
      if (!(header.toLowerCase() in row)) {
        row[header.toLowerCase()] = values[index] || '';
      }
    });
    
    // Debug: log Elvis completed inspections and IDs
    if (row['Opportunity Name']?.toLowerCase().includes('elvis') || row['opportunity name']?.toLowerCase().includes('elvis')) {
      console.log('[CSV DEBUG] Elvis row keys:', Object.keys(row).filter(k => k.toLowerCase().includes('id') || k.toLowerCase().includes('completed')));
      console.log('[CSV DEBUG] Elvis opportunityId:', JSON.stringify(row['Opportunity ID'] || row['opportunity id']));
      console.log('[CSV DEBUG] Elvis contactId:', JSON.stringify(row['Contact ID'] || row['contact id']));
      console.log('[CSV DEBUG] Elvis COMPLETED INSPECTIONS:', JSON.stringify(row['COMPLETED INSPECTIONS']));
      console.log('[CSV DEBUG] Elvis completed inspections:', JSON.stringify(row['completed inspections']));
    }
    
    rows.push(row);
  }

  return rows;
}

/**
 * Split CSV text into logical rows, handling multi-line quoted fields
 * A newline inside a quoted field is part of the field value, not a row separator
 */
function splitCSVRows(csv: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i]!;

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // Skip \r in \r\n
      if (char === '\r' && csv[i + 1] === '\n') {
        i++;
      }
      if (current.trim()) {
        rows.push(current);
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    rows.push(current);
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
    const webhookUrl = 'https://script.google.com/macros/s/AKfycbwvNST4bSLr_y_y4FPLQYGoQIA84C1k6gm1hU-fettg9RRkB-T3lVw4FliahYWkcF2n/exec';
    
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
 * Columns: A=Company, B=Project Name, C=Email, D=File Name, E=Drive Link, F=Opp ID, G=Contact ID, H=Upload Date
 */
export async function appendClientUpload(
  company: string,
  projectName: string,
  email: string,
  fileName: string,
  uploadLink: string, // S3 URL
  opportunityId?: string,
  contactId?: string
): Promise<boolean> {
  try {
    // Send data to Google Apps Script webhook
    const webhookUrl = 'https://script.google.com/macros/s/AKfycbwvNST4bSLr_y_y4FPLQYGoQIA84C1k6gm1hU-fettg9RRkB-T3lVw4FliahYWkcF2n/exec';
    
    const response = await axios.post(webhookUrl, {
      action: 'clientUpload',
      company,
      projectName,
      email,
      fileName,
      uploadLink,
      opportunityId,
      contactId,
    }, {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      maxRedirects: 5,
    });
    
    if (response.data.success) {
      console.log(`[Client Upload] Successfully logged to Google Sheets: Company: ${company}, Project: ${projectName}, Email: ${email}, File: ${fileName}, Opp ID: ${opportunityId}`);
      return true;
    } else {
      console.error('[Error] Google Apps Script returned error:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('[Error] Failed to append client upload to Google Sheets:', error);
    console.log(`[Client Upload - Fallback] Company: ${company}, Project: ${projectName}, Email: ${email}, File: ${fileName}`);
    return false;
  }
}

/**
 * Append inspection data to the Inspection Requests sheet using Google Sheets API
 * Columns: A=Project Name, B=User Email, C=Inspection Type, D=Scheduled Date/Time, E=Inspector Name, F=Scheduled, G=Request Opp ID, H=Inspection Notes, I=Address, J=Contact ID
 */
export async function appendInspectionRequest(
  projectName: string,
  userEmail: string,
  inspectionType: string,
  scheduledDateTime: string,
  inspectorName: string,
  scheduled: string = 'Scheduled',
  opportunityId: string = '',
  notes: string = '',
  address: string = '',
  contactId: string = ''
): Promise<boolean> {
  try {
    // Send data to Google Apps Script webhook
    const webhookUrl = 'https://script.google.com/macros/s/AKfycbwvNST4bSLr_y_y4FPLQYGoQIA84C1k6gm1hU-fettg9RRkB-T3lVw4FliahYWkcF2n/exec';
    
    const payload = {
      action: 'inspectionRequest',
      projectName,
      userEmail,
      inspectionType,
      scheduledDateTime,
      inspectorName,
      scheduled,
      opportunityId,
      notes,
      address,
      contactId,
    };
    
    console.log('[Inspection Request] Payload being sent:', JSON.stringify(payload, null, 2));
    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      maxRedirects: 5,
    });
    
    if (response.data.success) {
      console.log(`[Inspection Request] Successfully logged to Google Sheets: Project: ${projectName}, Email: ${userEmail}, Type: ${inspectionType}, DateTime: ${scheduledDateTime}, Inspector: ${inspectorName}, Scheduled: ${scheduled}, OppID: ${opportunityId}, ContactID: ${contactId}, Notes: ${notes}, Address: ${address}`);
      return true;
    } else {
      console.error('[Error] Google Apps Script returned error:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('[Error] Failed to append inspection request to Google Sheets:', error);
    console.log(`[Inspection Request - Fallback] Project: ${projectName}, Email: ${userEmail}, Type: ${inspectionType}, DateTime: ${scheduledDateTime}, Inspector: ${inspectorName}, Scheduled: ${scheduled}, OppID: ${opportunityId}, ContactID: ${contactId}, Notes: ${notes}, Address: ${address}`);
    return false;
  }
}

/**
 * Append new project inspection request to the New Project Inspection Requests sheet
 * Columns: A=Project Name, B=User Email, C=Inspection Type, D=Scheduled Date/Time, E=Inspector Name, F=Scheduled, G=Inspection Notes, H=Address
 */
export async function appendNewProjectInspectionRequest(
  projectName: string,
  userEmail: string,
  inspectionType: string,
  scheduledDateTime: string,
  inspectorName: string,
  scheduled: string = 'Scheduled',
  notes: string = '',
  address: string = ''
): Promise<boolean> {
  try {
    // Send data to Google Apps Script webhook
    const webhookUrl = 'https://script.google.com/macros/s/AKfycbwvNST4bSLr_y_y4FPLQYGoQIA84C1k6gm1hU-fettg9RRkB-T3lVw4FliahYWkcF2n/exec';
    
    const response = await axios.post(webhookUrl, {
      action: 'newProjectInspectionRequest',
      projectName,
      userEmail,
      inspectionType,
      scheduledDateTime,
      inspectorName,
      scheduled,
      notes,
      address,
    }, {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      maxRedirects: 5,
    });
    
    if (response.data.success) {
      console.log(`[New Project Inspection Request] Successfully logged to Google Sheets: Project: ${projectName}, Email: ${userEmail}, Type: ${inspectionType}, DateTime: ${scheduledDateTime}, Inspector: ${inspectorName}, Scheduled: ${scheduled}, Notes: ${notes}, Address: ${address}`);
      return true;
    } else {
      console.error('[Error] Google Apps Script returned error:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('[Error] Failed to append new project inspection request to Google Sheets:', error);
    console.log(`[New Project Inspection Request - Fallback] Project: ${projectName}, Email: ${userEmail}, Type: ${inspectionType}, DateTime: ${scheduledDateTime}, Inspector: ${inspectorName}, Scheduled: ${scheduled}, Notes: ${notes}, Address: ${address}`);
    return false;
  }
}

/**
 * Update the Report Link (column M) for a row in the Past Inspections sheet.
 * Uses the Google Apps Script webhook with a new action type.
 * sheetRowIndex is the 0-based data row index (row 0 = first data row after header = sheet row 2)
 */
export async function updatePastInspectionReportLink(
  sheetRowIndex: number,
  reportLink: string,
  projectName: string,
  inspectionType: string
): Promise<boolean> {
  try {
    const webhookUrl = 'https://script.google.com/macros/s/AKfycbw3_l-eNE91Fp1eLYXNu03erqtgtkUVt7nTu5gGO08tjOjwL9N963ZaSW7pMpMA4r9N/exec';
    
    const response = await axios.post(webhookUrl, {
      action: 'updateReportLink',
      sheetGid: PAST_INSPECTIONS_SHEET_GID,
      rowIndex: sheetRowIndex + 2, // +2 because: +1 for header row, +1 for 1-based indexing
      column: 'M',
      value: reportLink,
      projectName,
      inspectionType,
    }, {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      maxRedirects: 0, // Don't follow redirects - 302 means success for Apps Script
      validateStatus: (status: number) => status >= 200 && status < 400, // Accept 302 as success
    });
    
    // Google Apps Script returns 302 redirect on success
    if (response.status === 302 || response.status === 200) {
      console.log(`[Report Link] Successfully updated column M for row ${sheetRowIndex + 2}: ${projectName} - ${inspectionType}`);
      return true;
    } else if (response.data?.success) {
      console.log(`[Report Link] Successfully updated column M for row ${sheetRowIndex + 2}: ${projectName} - ${inspectionType}`);
      return true;
    } else {
      console.error('[Error] Google Apps Script returned error:', response.data?.error);
      return false;
    }
  } catch (error) {
    console.error('[Error] Failed to update report link in Google Sheets:', error);
    console.log(`[Report Link - Fallback] Row: ${sheetRowIndex + 2}, Link: ${reportLink}, Project: ${projectName}, Type: ${inspectionType}`);
    return false;
  }
}
