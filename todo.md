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
