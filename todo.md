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
