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
