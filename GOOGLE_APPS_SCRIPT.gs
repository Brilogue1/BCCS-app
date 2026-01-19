// Google Apps Script for BCCS Client Portal - Inspection Request Logger
// This script receives inspection data from the portal and writes it to the "Inspection Requests" sheet

function doPost(e) {
  try {
    // Parse the request data
    const params = JSON.parse(e.postData.contents);
    
    // Get the spreadsheet and the "Inspection Requests" sheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName("Inspection Requests");
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Inspection Requests sheet not found"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Extract the data from the request
    const projectName = params.projectName || "";
    const userEmail = params.userEmail || "";
    const inspectionType = params.inspectionType || "";
    const scheduledDateTime = params.scheduledDateTime || "";
    const inspectorName = params.inspectorName || "";
    const approved = params.approved || "pending";
    
    // Append the row to the sheet
    sheet.appendRow([projectName, userEmail, inspectionType, scheduledDateTime, inspectorName, approved]);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "Inspection request logged successfully"
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
