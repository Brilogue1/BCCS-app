// Google Apps Script for BCCS Client Portal
// Simple version: Pull Contact ID from ALL sheet column AR based on Opportunity ID

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    if (params.action === "inspectionRequest") {
      return handleInspectionRequest(spreadsheet, params);
    }
    
    if (params.action === "newProjectInspectionRequest") {
      return handleNewProjectInspectionRequest(spreadsheet, params);
    }
    
    if (params.action === "additionalContactEmail") {
      return handleAdditionalContactEmail(spreadsheet, params);
    }
    
    if (params.action === "clientUpload") {
      return handleClientUpload(spreadsheet, params);
    }
    
    return handleInspectionRequest(spreadsheet, params);
    
  } catch (error) {
    Logger.log("Error: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleInspectionRequest(spreadsheet, params) {
  const sheet = spreadsheet.getSheetByName("Inspection Requests");
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Inspection Requests sheet not found"
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Get Contact ID from ALL sheet based on Opportunity ID
  let contactId = "";
  if (params.opportunityId) {
    contactId = getContactIdFromAllSheet(spreadsheet, params.opportunityId);
  }
  
  // Append row: A=Project Name, B=User Email, C=Inspection Type, D=Scheduled Date/Time, 
  // E=Inspector Name, F=Scheduled, G=Request Opp ID, H=Inspection Notes, I=Address, J=Contact ID
  sheet.appendRow([
    params.projectName || "",
    params.userEmail || "",
    params.inspectionType || "",
    params.scheduledDateTime || "",
    params.inspectorName || "",
    params.scheduled || "Scheduled",
    params.opportunityId || "",
    params.notes || "",
    params.address || "",
    contactId  // Column J
  ]);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Inspection request logged successfully",
    contactId: contactId
  })).setMimeType(ContentService.MimeType.JSON);
}

function getContactIdFromAllSheet(spreadsheet, opportunityId) {
  try {
    const allSheet = spreadsheet.getSheetByName("ALL");
    if (!allSheet) {
      Logger.log("ALL sheet not found");
      return "";
    }
    
    const data = allSheet.getDataRange().getValues();
    if (data.length < 2) {
      Logger.log("ALL sheet has no data");
      return "";
    }
    
    const headers = data[0];
    
    // Find column indices
    let oppIdCol = -1;
    let contactIdCol = -1;
    
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toString().trim().toLowerCase();
      if (header.includes("opp") && header.includes("id")) {
        oppIdCol = i;
      }
      if (header.includes("contact") && header.includes("id")) {
        contactIdCol = i;
      }
    }
    
    Logger.log("Opp ID Col: " + oppIdCol + ", Contact ID Col: " + contactIdCol);
    Logger.log("Looking for Opportunity ID: " + opportunityId);
    
    if (oppIdCol === -1 || contactIdCol === -1) {
      Logger.log("Could not find required columns");
      return "";
    }
    
    // Search for matching Opportunity ID
    for (let i = 1; i < data.length; i++) {
      const opp = data[i][oppIdCol].toString().trim();
      if (opp === opportunityId) {
        const contactId = data[i][contactIdCol].toString().trim();
        Logger.log("Found Contact ID: " + contactId + " for Opp ID: " + opportunityId);
        return contactId;
      }
    }
    
    Logger.log("Opportunity ID not found in ALL sheet");
    return "";
    
  } catch (error) {
    Logger.log("Error in getContactIdFromAllSheet: " + error.toString());
    return "";
  }
}

function handleNewProjectInspectionRequest(spreadsheet, params) {
  const sheet = spreadsheet.getSheetByName("New Project Inspection Requests");
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "New Project Inspection Requests sheet not found"
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  sheet.appendRow([
    params.projectName || "",
    params.userEmail || "",
    params.inspectionType || "",
    params.scheduledDateTime || "",
    params.inspectorName || "",
    params.scheduled || "Scheduled",
    params.notes || "",
    params.address || ""
  ]);
  
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
  
  sheet.appendRow([
    params.email || "",
    params.projectName || "",
    params.company || "",
    params.contactName || ""
  ]);
  
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
  
  // Append row: A=Company, B=Project Name, C=Email, D=File Name, E=Upload Link (S3), F=Opp ID, G=Contact ID
  sheet.appendRow([
    params.company || "",
    params.projectName || "",
    params.email || "",
    params.fileName || "",
    params.uploadLink || "",
    params.opportunityId || "",
    params.contactId || ""
  ]);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Client upload logged successfully"
  })).setMimeType(ContentService.MimeType.JSON);
}

function uploadFileToDrive(base64Data, fileName, mimeType) {
  try {
    // Get the "Client Uploads" folder
    const folders = DriveApp.getFoldersByName("Client Uploads");
    if (!folders.hasNext()) {
      Logger.log("Client Uploads folder not found");
      return "";
    }
    
    const folder = folders.next();
    
    // Decode base64 to bytes
    const bytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    
    // Upload file to Drive
    const file = folder.createFile(blob);
    
    // Make file accessible via link
    file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
    
    // Return the file link
    const fileId = file.getId();
    return "https://drive.google.com/file/d/" + fileId + "/view";
    
  } catch (error) {
    Logger.log("Error in uploadFileToDrive: " + error.toString());
    return "";
  }
}
