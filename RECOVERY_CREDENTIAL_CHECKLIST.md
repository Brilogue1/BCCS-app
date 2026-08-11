# BCCS Client Portal — Credential and Integration Recovery Checklist

This checklist identifies what must be retained or recreated to restore the portal. It deliberately contains **secret names only**—never token, password, API-key, or database-URL values.

## Critical Recovery Materials Already Exported

| Material | Recovery role | Storage guidance |
|---|---|---|
| `BCCS_Client_Portal_Transition_Backup_2026-08-11_Source_and_Data.zip` | Source, configuration, database SQL export, and recovery notes | Keep encrypted and access-controlled. |
| `BCCS_Client_Portal_Transition_Backup_2026-08-11_Remote_Assets.zip` | 3,073 S3-backed inspection reports and project uploads | Keep encrypted and access-controlled. |
| GitHub `Brilogue1/BCCS-app` | Source-code history only | Keep repository private or restrict access. It must never contain database exports or customer files. |

## Required Credentials and Configuration

| System | Required secret/configuration | Current application expectation | Recovery action |
|---|---|---|---|
| Database | `DATABASE_URL` | Server database connection | Provision the replacement MySQL/TiDB database, import `bccs_portal_database.sql`, then store its new connection URL as a production secret. |
| Application sessions | `JWT_SECRET` | Signs local session cookies | Preserve it only if existing browser sessions must remain valid; otherwise generate a new high-entropy value and have users sign in again. |
| GoHighLevel | `GHL_API_KEY`, `GHL_LOCATION_ID`; optional `GHL_WEBHOOK_URL` | `server/ghl.ts` uses these exact variable names | Recreate/retrieve the Location ID and private integration token or webhook. **Important:** the current platform exposes `GHL_API_TOKEN`, while the code reads `GHL_API_KEY`; validate and align the variable name during restoration. |
| Google Sheets read access | Spreadsheet ownership/access for BCCS workflow spreadsheet | The app reads CSV exports from spreadsheet ID `1by8YXY2Ra63K6XrT2y0w-o7Wb7gFNN1ICzVYntTNagU` | Preserve ownership and sharing settings. The read path uses public/link access rather than a Google API key. |
| Google Apps Script writes | Apps Script project ownership, deployment permissions, and active web-app deployment URLs | Inspection requests, reschedules, report links, plans, and uploads use Apps Script webhooks | Make the BCCS Google account an owner, copy/export the Apps Script source, preserve all deployment URLs or update the application/webhook configuration after redeploying. |
| Object storage | Replacement storage credentials and bucket configuration | Current app uses platform-managed `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` | These are platform-managed and are **not portable credentials**. Re-upload the exported assets to replacement S3/object storage and adapt `server/storage.ts` or configure a supported storage service. |
| Platform OAuth | `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID` | Framework-level Manus OAuth configuration | These values are platform-specific. For a non-Manus host, retain the existing local email/password login or replace OAuth with a new provider; do not expect the Manus OAuth secrets to migrate. |
| Mail delivery | Mailgun private API key, sending domain, DNS records, templates, suppression/unsubscribe settings | No `MAILGUN_*` variable is used by this codebase | Preserve this separately in Mailgun. Email likely originates through GoHighLevel/Apps Script workflows rather than the portal server. Export Mailgun domain/DNS details and workflow settings. |
| Domains and DNS | Registrar login; DNS zone records for `app.bccsfl.com` and any replacement app hostname | Production domain routing is managed outside the source code | Keep registrar control, export DNS records, and update CNAME/A records only after the replacement host is ready. |

## External Workflow Inventory to Preserve

The database/source backup alone cannot reproduce settings held in third-party systems. Before transition, save or grant owner access to the following:

1. The BCCS Google Sheet and every relevant tab, including **All**, **App: Logins**, **Inspection Requests**, **Past Inspections**, **Rescheduled Inspections**, and upload/report tracking tabs.
2. The Google Apps Script project(s), deployment history, web-app settings, and any script properties.
3. GoHighLevel location, custom inspection fields, workflows, pipelines, webhooks, email/SMS templates, users, and automation triggers.
4. Mailgun sending domain verification, DNS records (SPF, DKIM, DMARC), account access, templates, suppression lists, and event webhook configuration.
5. DNS/registrar configuration and the email inboxes used for BCCS operational notifications.

## Secure Handling Rules

> Never add `.env` files, database dumps, customer uploads, report PDFs, Google credentials, Mailgun keys, or GoHighLevel tokens to GitHub—especially while `BCCS-app` is public.

Store actual secret values in a password manager or the replacement host's encrypted secrets manager. Record the account owner, login URL, credential location, renewal date, and recovery contact for every external system.

## Minimum Restore Order

1. Secure the backups and provision new database plus object storage.
2. Import the SQL export and restore the asset archive.
3. Deploy source code with non-production secrets first.
4. Reconnect Google Sheets/App Script and GoHighLevel in a staging environment.
5. Test login, project sync, inspection request, report link, upload, and notification flows.
6. Configure Mailgun/DNS and then route `app.bccsfl.com` to the validated replacement.
