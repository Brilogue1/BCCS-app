/**
 * Normalize a company name for comparison.
 * Strips punctuation (commas, periods, apostrophes), collapses multiple spaces,
 * and lowercases — so "Trimm Roofing, LLC" matches "Trimm Roofing LLC".
 */
export function normalizeCompany(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .replace(/[,.']/g, '')   // remove commas, periods, apostrophes
    .replace(/\s+/g, ' ')    // collapse multiple spaces
    .trim()
    .toLowerCase();
}

/**
 * Returns true if two company names refer to the same company,
 * using normalized comparison.
 */
export function companiesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeCompany(a) === normalizeCompany(b);
}

/**
 * Sections that need a prefix prepended to the inspection name
 * so the full name is descriptive (e.g. "ELECTRICAL ROUGH" not just "ROUGH").
 * BUILDING and MISC names are already self-descriptive, so they are excluded.
 */
const SECTIONS_NEEDING_PREFIX = new Set(['ELECTRICAL', 'MECHANICAL', 'PLUMBING', 'GAS']);

/**
 * Build the full display/submission name for a required inspection.
 * For trade sections (Electrical, Mechanical, Plumbing, Gas),
 * prepend the section so e.g. "Rough" becomes "ELECTRICAL ROUGH".
 * Building and Misc section names are already descriptive and returned as-is.
 */
export function buildFullInspectionName(section: string, name: string): string {
  const sectionUpper = (section || '').toUpperCase().trim();
  const nameUpper = (name || '').toUpperCase().trim();
  if (SECTIONS_NEEDING_PREFIX.has(sectionUpper)) {
    // Avoid double-prefixing if the name already starts with the section word
    if (nameUpper.startsWith(sectionUpper)) return nameUpper;
    return `${sectionUpper} ${nameUpper}`;
  }
  return nameUpper;
}

/**
 * Normalize an inspection type for deduplication comparison.
 * Removes filler words (OR, AND, THE), punctuation, slashes, and extra spaces
 * so minor wording differences like "AND OR FOOTER" vs "AND FOOTER" still match.
 */
export function normalizeInspectionType(type: string | null | undefined): string {
  if (!type) return '';
  return type
    .toUpperCase()
    .replace(/[/\-]/g, ' ')          // slashes and dashes to spaces
    .replace(/\b(OR|AND|THE)\b/g, '') // remove filler words
    .replace(/[^A-Z0-9 ]/g, '')      // remove remaining punctuation
    .replace(/\s+/g, ' ')            // collapse spaces
    .trim();
}
