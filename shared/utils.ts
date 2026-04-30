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
