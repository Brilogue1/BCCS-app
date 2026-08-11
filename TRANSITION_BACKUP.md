# BCCS Client Portal — Transition Source Backup

This repository is the source-code backup for the BCCS Client Portal before the August 2026 platform transition.

## Repository Scope

This repository contains the React, Express, tRPC, Drizzle, Tailwind, Google Sheets, and GoHighLevel integration source code. It intentionally does **not** include database exports, credentials, `.env` files, S3-backed customer uploads, inspection report PDFs, or other client data.

## Offline Recovery Materials

A separate restricted backup package contains the database SQL export, the S3-backed report/project-file archive, checksums, and recovery notes. Keep those materials outside GitHub and in controlled storage because they contain customer and project information.

## Restore Summary

1. Clone this repository.
2. Install dependencies with `pnpm install`.
3. Configure deployment environment variables securely.
4. Restore the separate database and object-storage backup.
5. Run the application using the scripts in `package.json`.

> Do not commit credential files, database dumps, report PDFs, or project uploads to this repository.
