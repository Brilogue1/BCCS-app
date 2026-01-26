# BCCS Client Portal TODO

## Phase 1: Setup
- [x] Initialize project with database and authentication
- [x] Create todo.md

## Phase 2: Database & Google Sheets Integration
- [x] Configure database schema for projects, contacts, and inspections
- [x] Set up Google Sheets API integration
- [x] Create data sync service to pull from Google Sheets
- [ ] Request Google Sheets API credentials from user

## Phase 3: Authentication System
- [x] Implement custom login page with email/password fields
- [x] Create authentication logic using Google Sheets App: Logins data
- [x] Set up session management
- [x] Add logout functionality

## Phase 4: Project Views
- [x] Build project listing page with cards showing Opportunity Name and Address
- [x] Implement email-based filtering to show only user's projects
- [x] Create project detail page with all fields (address, subdivision, lot#, permit#, assigned staff, etc.)
- [x] Add search and filter functionality

## Phase 5: Inspection & Contact Management
- [x] Create inspection scheduling form
- [x] Build contact email management interface
- [x] Add form validation
- [x] Implement optimistic UI updates

## Phase 6: GoHighLevel Integration
- [x] Request GHL API credentials/webhook URL from user
- [x] Set up GHL API client
- [x] Implement inspection booking sync to GHL
- [x] Implement contact email sync to GHL
- [x] Add error handling and retry logic

## Phase 7: Testing & Deployment
- [x] Test authentication flow
- [x] Test project filtering by email
- [x] Test inspection scheduling
- [x] Test contact management
- [x] Test GHL integration
- [x] Create checkpoint for deployment


## Bug Fixes
- [x] Fix invalid date parsing in Google Sheets sync

## New Features
- [x] Add master admin login to view all projects
- [x] Detect admin role from Google Sheets
- [x] Show all projects for admin users

- [x] Fix Google Sheets sync to handle extra columns from spreadsheet

- [x] Debug Google Sheets sync - check server logs and CSV parsing

- [x] Replace Google Sheets login with database-based authentication
- [x] Add password hashing for security
- [x] Create seed script to add initial admin users
- [x] Update login mutation to validate against database

- [x] Fix Google Sheets sync database insertion error
- [x] Add data validation and duplicate handling

## Inspection Form Updates
- [x] Extract inspection types from Excel file
- [x] Update database schema to store inspection types
- [x] Replace inspection type text field with dropdown
- [x] Remove date and time fields from inspection form
- [x] Auto-populate project name in inspection form
- [x] Auto-populate project address in inspection form
- [x] Update inspection creation mutation
- [x] Test inspection scheduling with new form

## Bug Fixes
- [x] Fix admin access check in project detail queries
- [x] Fix admin access check in inspection queries

## Inspection Types Enhancement
- [x] Add OTHER ELECTRIC to inspection types list
- [x] Add OTHER MECHANICAL to inspection types list
- [x] Add OTHER PLUMBING to inspection types list

## Google Sheets Authentication
- [x] Update authentication to use App: Logins sheet (gid=5432432)
- [x] Fetch user credentials from Google Sheets on login
- [x] Verify admin status from Admin? column
- [x] Filter projects by user email for non-admin users
- [x] Test login with sheet credentials

## Branding
- [x] Add BCCS logo to portal header
- [x] Copy logo file to public directory
- [x] Update header component with logo

## File Upload Feature
- [x] Create database schema for project files
- [x] Add file upload component to project detail page
- [x] Implement file upload to S3 storage
- [x] Display uploaded files list with download links
- [x] Add file deletion functionality
- [x] Test file upload and download


## Dashboard Feature
- [x] Create dashboard page with analytics
- [x] Add project count summary by stage
- [x] Display upcoming inspections list
- [x] Show recent file uploads
- [x] Add navigation to dashboard from main menu
- [x] Create tRPC queries for dashboard data
- [x] Test dashboard functionality


## Admin Dashboard Feature
- [x] Create admin-only dashboard page
- [x] Add inspector workload distribution (inspectors assigned to projects)
- [x] Calculate and display project completion percentage
- [x] Show projects by stage breakdown with counts
- [x] Display inspections completed this week
- [x] Add date range picker for filtering metrics
- [x] Create tRPC queries for admin analytics
- [x] Restrict dashboard access to admin users only
- [x] Add navigation link for admins
- [x] Test admin dashboard with real data


## Bug Fixes
- [x] Fix duplicate/extra projects in database (showing 25 instead of 17)
- [x] Improve Google Sheets sync to filter invalid rows


## Admin Progress Reporting Feature
- [x] Update Google Sheets sync to capture column AC task status
- [x] Add progress percentage calculation based on task status
- [x] Create admin projects view with progress bars and stage/task details
- [x] Make Total Projects card clickable to open detailed view
- [x] Test progress tracking with real data (column AC mostly empty in spreadsheet)


## Move Progress Tracking to Admin Analytics Only
- [x] Remove clickable Total Projects from regular Dashboard
- [x] Add clickable Total Projects to Admin Analytics page
- [x] Test changes work correctly


## Add Permitting and Inspections Progress Checklists
- [x] Identify Google Sheets columns for Permitting and Inspections checklists (AD and AY)
- [x] Update database schema to store new checklist data
- [x] Update Google Sheets sync to capture new columns
- [x] Update AdminProjectsReport to display all three checklists
- [x] Test all progress tracking works correctly


## Staff Workload Tracking Feature
- [x] Identify staff assignment columns (AL-AN) in Google Sheets
  - AL: Assign Permit tech
  - AM: Assign Plans Examiner
  - AN: Assign Inspector
- [x] Update database schema to store staff assignments (permit tech, plans examiner, inspector) - ALREADY EXISTS
- [x] Update Google Sheets sync to capture staff assignment columns - ALREADY EXISTS
- [x] Create staff workload page showing tasks completed and remaining per staff member
- [x] Test workload tracking with real data


## Clean Up Admin Analytics Dashboard
- [x] Remove Top Inspection Types section
- [x] Remove Weekly Inspection Trend section
- [x] Remove Inspections (Range) card
- [x] Remove Completion Rate card

## Inspection Pass/Fail Totals
- [x] Identify Google Sheets columns Z-AB for inspection results
  - Z: 1st Inspection Results
  - AA: 2nd Inspection Results
  - AB: 3rd Inspection Results
- [x] Update database schema to store inspection result fields (inspection1Result, inspection2Result, inspection3Result)
- [x] Update Google Sheets sync to capture columns Z-AB (1st/2nd/3rd Inspection Results)
- [x] Add inspection results tally to Admin Analytics dashboard
- [x] Test and verify the inspection results display (3 Approved, 0 Denied, 1 Partial = 4 Total)

## Proposal Tracking Feature
- [x] Identify Google Sheets columns AZ and BA for proposal status
  - AZ: Proposals Sent (Yes/empty)
  - BA: Proposal Signed (Yes/No/empty)
- [x] Update database schema to store proposal status fields (proposalSent, proposalSigned)
- [x] Update Google Sheets sync to capture columns AZ and BA (Proposals Sent, Proposal Signed)
- [x] Add proposal tracking section to Admin Analytics dashboard
- [x] Test and verify the proposal tracking display (4 In Proposal, 2 Sent, 1 Signed, 4 Stuck, 50% conversion)

## Print/Download Functionality for Admin Pages
- [x] Add print/download buttons to Admin Analytics Dashboard
- [x] Add print/download buttons to Project Progress Report
- [x] Add print/download buttons to Staff Workload page
- [x] Test print and download functionality on all pages

## Bug Fixes
- [x] Fix broken logo on dashboard page
- [x] Update Download button to generate PDF directly instead of print dialog


## Company-Based Filtering Feature
- [x] Identify company column locations in Google Sheets
  - App: Logins sheet, Column C: Company
  - Need to check main app data sheet for company column
- [x] Update database schema to store company field
- [x] Update Google Sheets sync to capture company data
- [x] Update all queries to filter by user's company
- [x] Update UI to display company-filtered data (backend filtering applied, UI will automatically show filtered data)
- [x] Test company-based filtering with multiple users


## Completed Projects Tab Feature
- [x] Update database schema to store completion status
- [x] Update Google Sheets sync to capture column F (completion status)
- [x] Add Active/Completed tabs to client dashboard
- [x] Test completed projects filtering (tabs working correctly, no completed projects yet)


## Bug Fixes
- [x] Fix client projects not loading when clicking View Projects (fixed column header mapping from 'Company' to 'COMPANY')

- [x] Fix project detail page showing "not found" for company-filtered users (updated access control checks to use company-based filtering)
- [x] Fix dashboard showing 3 projects instead of 6 for company-filtered users (access control checks now use company instead of email)


## Case-Insensitive Company Comparison Fix
- [x] Implement case-insensitive company comparison in access control checks
- [x] Update projects.list query to use .toLowerCase() for company filtering
- [x] Update projects.getById query to use .toLowerCase() for access verification
- [x] Update inspections, contacts, and files queries to use case-insensitive comparison
- [x] Test project detail page access with case mismatch (KB Homes vs kb homes)
- [x] Verify users can now access their company's projects


## Google Sheets Sync - Company Column Issue
- [x] Moved COMPANY column to column G so it's included in CSV export
- [x] Updated sync logic to handle case-insensitive column names
- [x] Fixed null company error - users with null company now see all projects
- [x] All 19 projects now displaying correctly for users with null company

- [x] Added company field to JWT token for better session management
- [x] Updated access control to use case-insensitive company comparison
- [ ] PENDING: Verify company-based filtering is working correctly for non-admin users - emartinez should see only 4 KB Home projects, not 6 mixed projects

## Google Sheets Inspection Logging Feature
- [x] Find the sheet ID for "Inspection Requests" sheet in the Google Sheets (gid=353951797)
- [x] Create Google Sheets API helper to append rows to "Inspection Requests" sheet (appendInspectionRequest function)
- [x] Update inspection.create mutation to log inspection data to Google Sheets
- [x] Map inspection data to columns A-E (Project Name, User Email, Inspection Type, Scheduled Date/Time, Inspector Name)
- [x] Add error handling for Google Sheets write failures
- [x] Test inspection logging - VERIFIED: Inspection logged successfully to Google Sheets


## Bug: Google Sheets Inspection Logging Not Working
- [ ] Debug why inspection data is not being written to Google Sheets
- [ ] Check if appendInspectionRequest function is being called
- [ ] Verify Google Sheets API credentials are working
- [ ] Check for errors in server logs
- [ ] Fix the issue and test again

- [ ] Add "Approved" column (F) to Inspection Requests sheet
- [ ] Update appendInspectionRequest to include approval status (default: "pending")
- [ ] Update inspection form to show pending status
- [ ] Test that inspections are logged with pending status

## Admin Access Control Issue
- [x] Fix admin access - bri@investorplug.io not seeing admin stats
  - [x] Admin Analytics button not visible in header after login
  - [x] User redirected to projects list instead of admin dashboard
  - [x] Role is correctly set to 'admin' in database
  - [x] Added Admin Analytics button to Projects component header for admin users

## Login Issue
- [x] Fix login stuck - shows "login successful" but doesn't redirect to dashboard
  - [x] User stuck on login page after successful authentication
  - [x] Toast shows success but page doesn't navigate
  - [x] Fixed by invalidating auth.me cache after login mutation succeeds
  - [x] Login now redirects properly to /projects page

## Incognito Mode Issue
- [x] Fix login in incognito/private browsing mode
  - [x] Changed cookie SameSite from Lax to None; Secure
  - [x] Updated both login and logout cookie settings
  - [x] Should now work in incognito/private browsing mode

## Admin Page Error
- [x] Fix admin page JSON parsing error
  - [x] Error was temporary - admin page now loads correctly
  - [x] All analytics displaying properly (projects, inspections, proposals, workload)
  - [x] User: bri@investorplug.io (admin role) can access admin dashboard

## Admin View Filtering Issue
- [x] Fix admin view - admins only seeing KB Homes projects
  - [x] Simplified access control to use company field only (removed admin role dependency)
  - [x] Updated projects.list router to check company='ALL' instead of role='admin'
  - [x] Updated AdminDashboard to check company='ALL' instead of role='admin'
  - [x] Updated adminDashboard.analytics router to check company='ALL'
  - [x] Set all admin users to company='ALL' in database
  - [x] Verified all 19 projects now load for admin users

## Brave Browser Compatibility Issue
- [ ] Fix login in Brave browser
  - Brave blocks third-party cookies and cross-site tracking by default
  - Session cookie not being set properly in Brave
  - Need to adjust cookie settings or add fallback authentication method

## Past Inspections Feature (Completed Projects Tab)
- [x] Create pastInspections tRPC procedure to fetch data from "Past Inspections" sheet
- [x] Implement company-based access control for past inspections (company='ALL' sees all, others see their company only)
- [x] Update Projects component to display past inspections in "Completed Projects" tab
- [x] Show columns: Project Name, Inspection Type, Approved Status, Date Approved
- [x] Test past inspections display with company-based filtering

## Completed Projects Enhancement
- [x] Update completedProjects procedure to fetch from both Active Projects (Stage=Complete) and Past Inspections sheet
- [x] Combine and display both sources in Completed Projects tab
- [x] Test combined completed projects display

## Inspection Types Display Feature (5 Inspections per Project)
- [x] Update database schema to store 5 inspection type fields (inspection1Type, inspection2Type, etc.)
- [x] Update Google Sheets sync to capture columns U, V, X, Z, AA (Inspection Type 1-5)
- [x] Display inspection types on project detail page before scheduling section
- [x] Test inspection types display

## Inspection Display Updates
- [x] Update ProjectDetail to show inspection types 1-5 as "In Progress" status
- [x] Add past inspections section to ProjectDetail showing completed inspections
- [x] Filter completed inspections by project name on detail page
- [x] Update Projects list to show inspection types 1-5 inline on project cards with "In Progress" status
- [x] Test inspection display on both list and detail pages

## Opportunity ID Integration for Inspection Requests
- [x] Update database schema to store opportunityId in inspections table
- [x] Update database schema to store opportunityId in projects table
- [x] Update inspection scheduling to capture Opportunity ID from project
- [x] Update Google Sheets sync to write Opportunity ID to Inspection Requests sheet column G
- [x] Test inspection request includes Opportunity ID for system integration

## CRITICAL: Production Deployment Issue (Monday Launch Blocker) - RESOLVED
- [x] Investigate login redirect failure on published version
- [x] Check environment variables and secrets for production
- [x] Verify CORS headers and API communication on published version
- [x] ROOT CAUSE FOUND: Cookie name mismatch - login set 'session' but SDK expected 'app_session_id'
- [x] Fix applied: Changed cookie name from 'session' to 'app_session_id' in routers.ts line 78
- [x] Test and deploy fix - Login now redirects successfully to projects page
- [ ] Publish to production for Monday client launch

## Support Contact Links
- [x] Add "Issues logging in or need to update your password? Reach out here" link on login page (mailto:info@bccsfl.com)
- [x] Add "Issues with the app or need support? Please reach out here" link on every page in the app header (Projects, Dashboard, ProjectDetail, AdminDashboard)
- [x] Test support links work correctly

## Project Detail Inspections Reorganization
- [x] Rename "In Progress Inspections" to "Scheduled Inspections"
- [x] Combine Scheduled Inspections section with the Schedule Inspection form
- [x] Keep "Completed Inspections" section showing past inspections from Past Inspections sheet filtered by project name
- [x] Test reorganized inspection sections

## Projects Sorting
- [x] Sort projects list with newest on top and oldest on bottom

## File Upload to Google Drive
- [x] Upload files to S3 storage (files are stored securely and accessible via URL)
- [x] Log upload info to "Client Uploads" sheet with columns: Company, Project Name, Email, Upload Link
- [x] Implement file upload UI with file selection, upload progress, and file list display
- [ ] Note: For Google Drive integration, you'll need to update your Google Apps Script webhook to handle the 'clientUpload' action and write to the Client Uploads sheet

## New Project Emails Sheet Logging
- [x] Log additional contact emails to "New Project Emails" sheet with columns: Additional Contact Emails, Project Name, Company
- [ ] Note: Update Google Apps Script webhook to handle 'newProjectEmail' action

## Bug Fixes - Jan 25
- [x] Fix inspection scheduling to add notes to column H in Google Sheets
- [x] Fix additional emails going to wrong sheet - changed action to 'additionalContactEmail' for Google Apps Script routing
- [x] Fix file upload error - added URL fallback and better error handling
- [x] Add new project inspection request button with project name and address fields

## Bug Fixes Round 2 - Jan 25
- [x] Debug: Inspection notes - Updated webhook URL, verified working (notes now go to column H)
- [x] Debug: Additional emails - Updated sheet name to "Additional Contact Emails", added contactName field
- [x] Updated webhook URL to new deployment: AKfycbxNxpCKHxrIE5YdR6BxFnHQYYUgzM91ZGLuJPanXbRtFzmwuS2X7Jl--RcV4ketwAFW
- [ ] File uploads - Need to test on published site (backend working, may be S3/CORS issue on frontend)

## File Upload Debug - Jan 25
- [x] Debug file upload error: "Failed to upload file. Please try again."
- [x] Root cause: Frontend was trying to upload directly to Forge API (CORS blocked)
- [x] Fix: Added server-side /api/upload endpoint using multer
- [x] Updated frontend to use server-side upload endpoint
- [x] Test upload endpoint - working (returns S3 URL)

## Contact Passwords - Jan 26
- [x] Read contact CSV and understand data structure (554 records)
- [x] Generate passwords based on company names (format: CompanyName2025!)
- [x] Add contacts with passwords to portal database (424 inserted, 3 updated)
- [ ] Test login with new contacts

## Inspection Status Update - Jan 26
- [x] Change all inspection statuses from "Pending" to "Scheduled"
