# Google Apps Script Update — Plans Upload Action

You need to add the `plansUpload` case to your existing Google Apps Script.

## Steps

1. Go to [script.google.com](https://script.google.com)
2. Open the script that handles the existing webhook (the one at `AKfycbwvNST4bSLr_y_y4FPLQYGoQIA84C1k6gm1hU-fettg9RRkB-T3lVw4FliahYWkcF2n`)
3. Find your `doPost(e)` function and add the `plansUpload` case shown below
4. Click **Deploy → Manage Deployments → Edit (pencil icon) → New Version → Deploy**

---

## Code to Add

Find the section in `doPost` that looks like:

```js
if (data.action === 'clientUpload') {
  // ... existing code
}
```

Add this **new case** right after it:

```js
if (data.action === 'plansUpload') {
  try {
    var parentFolder = DriveApp.getFolderById(data.parentFolderId);
    
    // Create subfolder named after the address (+ project name if provided)
    var newFolder = parentFolder.createFolder(data.folderName);
    var folderUrl = newFolder.getUrl();
    
    // Upload each file from S3 URL into the new Drive folder
    var fileNames = [];
    if (data.files && data.files.length > 0) {
      for (var i = 0; i < data.files.length; i++) {
        var f = data.files[i];
        try {
          var response = UrlFetchApp.fetch(f.url);
          var blob = response.getBlob().setName(f.fileName);
          newFolder.createFile(blob);
          fileNames.push(f.fileName);
        } catch (fileErr) {
          Logger.log('Failed to upload file ' + f.fileName + ': ' + fileErr);
        }
      }
    }
    
    // Log to Client Uploads sheet
    var ss = SpreadsheetApp.openById('1by8YXY2Ra63K6XrT2y0w-o7Wb7gFNN1ICzVYntTNagU');
    var uploadSheet = ss.getSheetByName('Client Uploads');
    if (uploadSheet) {
      uploadSheet.appendRow([
        data.company || '',
        data.folderName,
        data.uploaderEmail || '',
        fileNames.join(', '),
        folderUrl,
        '',  // Opp ID (blank — no opp number for plans uploads)
        '',  // Contact ID
        new Date().toLocaleDateString('en-US')
      ]);
    }
    
    // Send notification email
    var subject = 'New Plans Uploaded: ' + data.address;
    var body = 'New plans have been uploaded to Google Drive.\n\n'
      + 'Address: ' + data.address + '\n'
      + 'Uploaded by: ' + (data.uploaderEmail || 'Unknown') + '\n'
      + 'Files: ' + (fileNames.length > 0 ? fileNames.join(', ') : 'None') + '\n'
      + 'Drive Folder: ' + folderUrl + '\n\n'
      + 'Click the link above to view the uploaded files.';
    
    GmailApp.sendEmail(data.notifyEmail, subject, body, {
      cc: data.ccEmail || '',
      name: 'BCCS Client Portal'
    });
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, folderUrl: folderUrl }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    Logger.log('plansUpload error: ' + err);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

## Important Notes

- The **sheet name** must be exactly `Client Uploads` (check your sheet tab name matches)
- After saving, click **Deploy → Manage Deployments → Edit → New Version → Deploy** to publish the new version
- The existing webhook URL stays the same — no changes needed in the portal

