// Google Apps Script for BCCS Client Portal - Multi-Purpose Logger
// This script receives data from the portal and writes it to the appropriate sheets

function doPost(e) {
  try {
    // Parse the request data
    const params = JSON.parse(e.postData.contents);
    
    // Get the spreadsheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Route based on action type
    if (params.action === "additionalContactEmail") {
      return handleAdditionalContactEmail(spreadsheet, params);
    }
    
    if (params.action === "clientUpload") {
      return handleClientUpload(spreadsheet, params);
    }
    
    if (params.action === "newProjectInspectionRequest") {
      return handleNewProjectInspectionRequest(spreadsheet, params);
    }
    
    if (params.action === "inspectionRequest") {
      return handleInspectionRequest(spreadsheet, params);
    }
    
    // Default: Handle as inspection request (for backward compatibility)
    return handleInspectionRequest(spreadsheet, params);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Helper function to get Contact ID from ALL sheet based on Opportunity ID
// ALL sheet has Contact ID in column AR
function getContactIdFromAllSheet(spreadsheet, opportunityId) {
  try {
    const allSheet = spreadsheet.getSheetByName("ALL");
    if (!allSheet) {
      return "";
    }
    
    // Get all data from ALL sheet
    const data = allSheet.getDataRange().getValues();
    
    // Find the column indices from headers (row 1)
    const headers = data[0];
    
    // Find Contact ID column by header name
    let contactIdCol = -1;
    for (let i = 0; i < headers.length; i++) {
      if (headers[i] === "Contact ID") {
        contactIdCol = i;
        break;
      }
    }
    
    // Find Opportunity ID column
    let oppIdCol = -1;
    for (let i = 0; i < headers.length; i++) {
      if (headers[i] === "Opp ID" || headers[i] === "Opportunity ID") {
        oppIdCol = i;
        break;
      }
    }
    
    // If columns not found, return empty
    if (contactIdCol === -1 || oppIdCol === -1) {
      Logger.log("Contact ID or Opp ID column not found");
      return "";
    }
    
    // Search for matching Opportunity ID
    for (let i = 1; i < data.length; i++) {
      if (data[i][oppIdCol] === opportunityId) {
        return data[i][contactIdCol] || "";
      }
    }
    
    return "";
  } catch (error) {
    Logger.log("Error getting Contact ID: " + error.toString());
    return "";
  }
}

// Existing projects - goes to "Inspection Requests" sheet
// Columns: A=Project Name, B=User Email, C=Inspection Type, D=Scheduled Date/Time, E=Inspector Name, F=Scheduled, G=Request Opp ID, H=Inspection Notes, I=Address, J=Contact ID
function handleInspectionRequest(spreadsheet, params) {
  const sheet = spreadsheet.getSheetByName("Inspection Requests");
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Inspection Requests sheet not found"
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const projectName = params.projectName || "";
  const userEmail = params.userEmail || "";
  const inspectionType = params.inspectionType || "";
  const scheduledDateTime = params.scheduledDateTime || "";
  const inspectorName = params.inspectorName || "";
  const scheduled = params.scheduled || "Scheduled";
  const opportunityId = params.opportunityId || "";
  const notes = params.notes || "";
  const address = params.address || "";
  
  // Get Contact ID from ALL sheet based on Opportunity ID
  let contactId = params.contactId || "";
  if (!contactId && opportunityId) {
    contactId = getContactIdFromAllSheet(spreadsheet, opportunityId);
  }
  
  // Append row with Contact ID in column J
  sheet.appendRow([projectName, userEmail, inspectionType, scheduledDateTime, inspectorName, scheduled, opportunityId, notes, address, contactId]);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Inspection request logged successfully",
    contactId: contactId
  })).setMimeType(ContentService.MimeType.JSON);
}

// New projects (no Opp ID) - goes to "New Project Inspection Requests" sheet
// Columns: Project Name, User Email, Inspection Type, Scheduled Date/Time, Inspector Name, Scheduled, Inspection Notes, Address
function handleNewProjectInspectionRequest(spreadsheet, params) {
  const sheet = spreadsheet.getSheetByName("New Project Inspection Requests");
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "New Project Inspection Requests sheet not found"
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const projectName = params.projectName || "";
  const userEmail = params.userEmail || "";
  const inspectionType = params.inspectionType || "";
  const scheduledDateTime = params.scheduledDateTime || "";
  const inspectorName = params.inspectorName || "";
  const scheduled = params.scheduled || "Scheduled";
  const notes = params.notes || "";
  const address = params.address || "";
  
  sheet.appendRow([projectName, userEmail, inspectionType, scheduledDateTime, inspectorName, scheduled, notes, address]);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "New project inspection request logged successfully"
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleAdditionalContactEmail(spreadsheet, params) {
  const sheet = spreadsheet.getSheetByName("Additional Contact Emails");
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Additional Contact Emails sheet not found"
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const email = params.email || "";
  const projectName = params.projectName || "";
  const company = params.company || "";
  const contactName = params.contactName || "";
  
  sheet.appendRow([email, projectName, company, contactName]);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Additional contact email logged successfully"
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleClientUpload(spreadsheet, params) {
  const sheet = spreadsheet.getSheetByName("Client Uploads");
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Client Uploads sheet not found"
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const company = params.company || "";
  const projectName = params.projectName || "";
  const email = params.email || "";
  const uploadLink = params.uploadLink || "";
  
  sheet.appendRow([company, projectName, email, uploadLink]);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Client upload logged successfully"
  })).setMimeType(ContentService.MimeType.JSON);
}
