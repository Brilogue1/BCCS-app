# Google Sheets Information

## Sheet Structure
- Sheet Name: "ALL" (gid=0)
- Contains project data with the following columns (observed from screenshot):
  - Opportunity Name
  - Contact Name
  - phone (lowercase)
  - email (lowercase)
  - pipeline
  - stage
  - Lead Value
  - assigned
  - Created on
  - Updated on
  - Followers
  - Notes
  - tags
  - Engagement Status

## Issue Found
The column names in the CSV export might be case-sensitive. The code is looking for "Email" (capitalized) but the actual column might be "email" (lowercase).

## Solution
Need to update the parseCSV function to handle case-insensitive column lookups.
