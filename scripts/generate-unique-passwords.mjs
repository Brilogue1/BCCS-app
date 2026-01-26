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

// Function to clean company name for password
function cleanCompanyName(companyName) {
  if (!companyName || companyName.trim() === '') {
    return 'User';
  }
  
  const cleaned = companyName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  
  return cleaned || 'User';
}

// Track company counts for unique passwords
const companyCounters = {};

// Process contacts
const contacts = [];
const skipped = [];

for (const record of records) {
  const email = record['Email']?.trim()?.toLowerCase();
  const firstName = record['First Name']?.trim() || '';
  const lastName = record['Last Name']?.trim() || '';
  const companyName = record['Company Name']?.trim() || '';
  
  // Skip if no email
  if (!email) {
    skipped.push({ reason: 'No email', record });
    continue;
  }
  
  // Skip if no company name
  if (!companyName) {
    skipped.push({ reason: 'No company name', email, record });
    continue;
  }
  
  const name = [firstName, lastName].filter(Boolean).join(' ') || companyName;
  const cleanedCompany = cleanCompanyName(companyName);
  
  // Increment counter for this company
  if (!companyCounters[companyName]) {
    companyCounters[companyName] = 0;
  }
  companyCounters[companyName]++;
  
  // Generate unique password: CompanyName1!, CompanyName2!, etc.
  const password = `${cleanedCompany}${companyCounters[companyName]}!`;
  
  contacts.push({
    email,
    name,
    company: companyName,
    password,
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
console.log('\n--- Sample Contacts (first 20) ---');
for (const contact of uniqueContacts.slice(0, 20)) {
  console.log(`${contact.email} | ${contact.company} | ${contact.password}`);
}

// Output a CSV with unique passwords
const outputCsv = ['Email,Name,Company,Password'];
for (const contact of uniqueContacts) {
  outputCsv.push(`"${contact.email}","${contact.name}","${contact.company}","${contact.password}"`);
}
const csvOutputPath = path.join(__dirname, 'contacts-unique-passwords.csv');
fs.writeFileSync(csvOutputPath, outputCsv.join('\n'));
console.log(`\nUnique password CSV written to: ${csvOutputPath}`);
console.log(`Total contacts: ${uniqueContacts.length}`);
