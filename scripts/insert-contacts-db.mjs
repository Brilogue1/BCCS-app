import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const require = createRequire(import.meta.url);
const { parse } = require('csv-parse/sync');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database connection from environment
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

// Parse DATABASE_URL
const url = new URL(DATABASE_URL);
const dbConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: url.password,
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
    
    const password = generatePassword(companyName);
    const name = [firstName, lastName].filter(Boolean).join(' ') || companyName;
    const openId = generateOpenId();
    
    try {
      const [result] = await connection.execute(
        `INSERT INTO users (openId, email, name, company, password, loginMethod, role, createdAt, updatedAt, lastSignedIn) 
         VALUES (?, ?, ?, ?, ?, 'password', 'user', NOW(), NOW(), NOW()) 
         ON DUPLICATE KEY UPDATE name=?, company=?, password=?`,
        [openId, email, name, companyName, password, name, companyName, password]
      );
      
      if (result.affectedRows === 1) {
        inserted++;
      } else if (result.affectedRows === 2) {
        updated++;
      }
    } catch (err) {
      console.error(`Error inserting ${email}:`, err.message);
      errors++;
    }
  }
  
  await connection.end();
  
  console.log(`\nResults:`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total processed: ${records.length}`);
}

main().catch(console.error);
