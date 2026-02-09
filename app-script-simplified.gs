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
  const contactId = params.contactId || ""; // Contact ID passed directly from backend
  
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
