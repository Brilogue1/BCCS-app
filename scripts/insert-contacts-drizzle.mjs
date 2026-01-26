// This script needs to be run from the server context
// Run with: pnpm tsx scripts/insert-contacts-drizzle.mjs

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { parse } = require('csv-parse/sync');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database connection
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  console.error('Make sure you are running this from the project directory with dotenv loaded');
  process.exit(1);
}

console.log('Connecting to database...');

// Parse DATABASE_URL
const url = new URL(DATABASE_URL);
const dbConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 4000,
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false }
};

// Read the CSV file
const csvPath = path.join(__dirname, '..', 'Export_Contacts_ByCompany_Jan_2026_12_08_PM.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Parse CSV
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

// Function to generate password from company name
function generatePassword(companyName) {
  if (!companyName || companyName.trim() === '') {
    return null;
  }
  
  const cleaned = companyName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  
  return `${cleaned}2025!`;
}

function generateOpenId() {
  return 'local_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function main() {
  const connection = await mysql.createConnection(dbConfig);
  console.log('Connected to database');
  
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  // Process unique emails only
  const seenEmails = new Set();
  
  for (const record of records) {
    const email = record['Email']?.trim()?.toLowerCase();
    const firstName = record['First Name']?.trim() || '';
    const lastName = record['Last Name']?.trim() || '';
    const companyName = record['Company Name']?.trim() || '';
    
    if (!email) {
      skipped++;
      continue;
    }
    
    if (!companyName) {
      skipped++;
      continue;
    }
    
    if (seenEmails.has(email)) {
      skipped++;
      continue;
    }
    seenEmails.add(email);
    
    const password = generatePassword(companyName);
    const name = [firstName, lastName].filter(Boolean).join(' ') || companyName;
    const openId = generateOpenId();
    
    try {
      const [result] = await connection.execute(
        `INSERT INTO users (openId, email, name, company, password, loginMethod, role, createdAt, updatedAt, lastSignedIn) 
         VALUES (?, ?, ?, ?, ?, 'password', 'user', NOW(), NOW(), NOW()) 
         ON DUPLICATE KEY UPDATE name=VALUES(name), company=VALUES(company), password=VALUES(password)`,
        [openId, email, name, companyName, password]
      );
      
      if (result.affectedRows === 1) {
        inserted++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
      
      if ((inserted + updated) % 50 === 0) {
        console.log(`Progress: ${inserted} inserted, ${updated} updated...`);
      }
    } catch (err) {
      console.error(`Error inserting ${email}:`, err.message);
      errors++;
    }
  }
  
  await connection.end();
  
  console.log(`\n=== Results ===`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total processed: ${records.length}`);
}

main().catch(console.error);
