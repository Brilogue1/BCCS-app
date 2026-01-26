import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { parse } = require('csv-parse/sync');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  
  // Clean company name: remove special chars, spaces, convert to title case
  const cleaned = companyName
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  
  // Add a suffix for security
  return `${cleaned}2025!`;
}

// Generate a unique openId for each user
function generateOpenId() {
  return 'local_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Process contacts
const contacts = [];
const skipped = [];

for (const record of records) {
  const email = record['Email']?.trim();
  const firstName = record['First Name']?.trim() || '';
  const lastName = record['Last Name']?.trim() || '';
  const companyName = record['Company Name']?.trim() || '';
  const phone = record['Phone']?.trim() || '';
  const contactId = record['Contact Id']?.trim() || '';
  
  // Skip if no email
  if (!email) {
    skipped.push({ reason: 'No email', record });
    continue;
  }
  
  // Skip if no company name (can't generate password)
  if (!companyName) {
    skipped.push({ reason: 'No company name', email, record });
    continue;
  }
  
  const password = generatePassword(companyName);
  const name = [firstName, lastName].filter(Boolean).join(' ') || companyName;
  
  contacts.push({
    email: email.toLowerCase(),
    name,
    company: companyName,
    password,
    phone,
    ghlContactId: contactId,
    openId: generateOpenId(),
  });
}

// Remove duplicates by email (keep first occurrence)
const uniqueContacts = [];
const seenEmails = new Set();

for (const contact of contacts) {
  if (!seenEmails.has(contact.email)) {
    seenEmails.add(contact.email);
    uniqueContacts.push(contact);
  }
}

console.log(`Total records in CSV: ${records.length}`);
console.log(`Contacts with email and company: ${contacts.length}`);
console.log(`Unique contacts (by email): ${uniqueContacts.length}`);
console.log(`Skipped: ${skipped.length}`);

// Output sample contacts
console.log('\n--- Sample Contacts (first 10) ---');
for (const contact of uniqueContacts.slice(0, 10)) {
  console.log(`Email: ${contact.email}`);
  console.log(`  Name: ${contact.name}`);
  console.log(`  Company: ${contact.company}`);
  console.log(`  Password: ${contact.password}`);
  console.log('');
}

// Generate SQL insert statements for the 'users' table (correct table name)
const sqlStatements = [];
for (const contact of uniqueContacts) {
  const escapedEmail = contact.email.replace(/'/g, "''");
  const escapedName = contact.name.replace(/'/g, "''");
  const escapedCompany = contact.company.replace(/'/g, "''");
  const escapedPassword = contact.password.replace(/'/g, "''");
  const escapedOpenId = contact.openId.replace(/'/g, "''");
  
  // Check if user exists by email, if so update, otherwise insert
  sqlStatements.push(
    `INSERT INTO users (openId, email, name, company, password, loginMethod, role, createdAt, updatedAt, lastSignedIn) ` +
    `VALUES ('${escapedOpenId}', '${escapedEmail}', '${escapedName}', '${escapedCompany}', '${escapedPassword}', 'password', 'user', NOW(), NOW(), NOW()) ` +
    `ON DUPLICATE KEY UPDATE name='${escapedName}', company='${escapedCompany}', password='${escapedPassword}';`
  );
}

// Write SQL file
const sqlPath = path.join(__dirname, 'insert-contacts.sql');
fs.writeFileSync(sqlPath, sqlStatements.join('\n'));
console.log(`\nSQL file written to: ${sqlPath}`);
console.log(`Total SQL statements: ${sqlStatements.length}`);

// Also output a CSV with passwords for reference
const outputCsv = ['Email,Name,Company,Password'];
for (const contact of uniqueContacts) {
  outputCsv.push(`"${contact.email}","${contact.name}","${contact.company}","${contact.password}"`);
}
const csvOutputPath = path.join(__dirname, 'contacts-with-passwords.csv');
fs.writeFileSync(csvOutputPath, outputCsv.join('\n'));
console.log(`Password reference CSV written to: ${csvOutputPath}`);
