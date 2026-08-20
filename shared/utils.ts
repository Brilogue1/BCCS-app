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
 * Maps the two GHL CRM dropdown values (Property Type + Work Type) to the
 * corresponding permitTypes.json key (permitType + subType).
 * Returns null if the combination is not in the auto-trigger list.
 */
export type PermitLookupResult = {
  permitType: string;
  subType: string;
};

const CRM_LOOKUP: Record<string, Record<string, PermitLookupResult>> = {
  RESIDENTIAL: {
    'NEW CONSTRUCTION': {
      permitType: 'BUILDING SINGLE FAMILY RESIDENTIAL',
      subType: 'NEW BUILDING / DUPLEX / TOWNHOUSE / ACCESSORY DWELLING',
    },
    'ADDITION / REMODEL': {
      permitType: 'BUILDING SINGLE FAMILY RESIDENTIAL',
      subType: 'ADDITION / REMODEL / DETACHED GARAGE',
    },
    'ELECTRICAL': {
      permitType: 'ELECTRICAL RESIDENTIAL',
      subType: 'ADD CIRCUITS / MISC FIX / REPLACE WIRING / SERVICE REPLACEMENT / SERVICE UPGRADE / TEMP POWER POLE / OTHER',
    },
    'PLUMBING': {
      permitType: 'PLUMBING RESIDENTIAL',
      subType: 'SEWER LATERAL / WATER LATERAL / BACKFLOW / IRRIGATION SYSTEM / SEWER CAP / WATER HEATER REPLACEMENT / SANITARY SEWER REPLUMB / DOMESTIC WATER REPIPE / SOLAR WATER HEATER / OTHER',
    },
    'MECHANICAL': {
      permitType: 'MECHANICAL RESIDENTIAL',
      subType: 'OTHER',
    },
    'GAS': {
      permitType: 'GAS RESIDENTIAL',
      subType: 'INSTANT WATER HEATER / METER INSTALL / POOL HEATER NATURAL GAS / POOL HEATER PROPANE / PROPANE TANK PIPING / OTHER',
    },
    'ROOF': {
      permitType: 'ROOF SINGLE FAMILY RESIDENTIAL',
      subType: 'METAL / MODIFIED BITUMEN / SHINGLE',
    },
    'FENCE': {
      permitType: 'FENCE COMMERCIAL',
      subType: 'OTHER',
    },
    'SWIMMING POOL': {
      permitType: 'SWIMMING POOL RESIDENTIAL',
      subType: 'BELOW GROUND',
    },
    'SIGN': {
      permitType: 'SIGN NEW',
      subType: 'AWNING / ELECTRONIC SIGN / MESSAGE CTR / GROUND NO ELECTRIC / WALL NO ELECTRIC / OTHER',
    },
    'MOBILE HOME': {
      permitType: 'MOBILE HOME',
      subType: 'NEW MOBILE HOME',
    },
    'CARPORT / SHED': {
      permitType: 'BUILDING SINGLE FAMILY RESIDENTIAL',
      subType: 'CARPORT / PATIO COVER / SHED',
    },
  },
  COMMERCIAL: {
    'NEW CONSTRUCTION': {
      permitType: 'BLDG COMMERCIAL',
      subType: 'NEW BUILDING / MULTI-FAMILY / ADDITION / ACCESSORY STRUCTURE',
    },
    'ADDITION / REMODEL': {
      permitType: 'BLDG COMMERCIAL',
      subType: 'REMODEL / INTERIOR BUILDOUT',
    },
    'ELECTRICAL': {
      permitType: 'ELECTRICAL COMMERCIAL',
      subType: 'OTHER',
    },
    'PLUMBING': {
      permitType: 'PLUMBING COMMERCIAL',
      subType: 'SEWER LATERAL / WATER LATERAL / BACKFLOW / IRRIGATION SYSTEM / SEWER CAP / WATER HEATER REPLACEMENT / OTHER',
    },
    'MECHANICAL': {
      permitType: 'MECHANICAL COMMERCIAL',
      subType: 'OTHER',
    },
    'GAS': {
      permitType: 'GAS COMMERCIAL',
      subType: 'INSTANT WATER HEATER / METER INSTALL / POOL HEATER NATURAL GAS / POOL HEATER PROPANE / PROPANE TANK PIPING / OTHER',
    },
    'ROOF': {
      permitType: 'ROOF COMMERCIAL',
      subType: 'METAL / MODIFIED BITUMEN / SHINGLE / TILE / TPO / URETHANE / OTHER',
    },
    'FENCE': {
      permitType: 'FENCE COMMERCIAL',
      subType: 'OTHER',
    },
    'SWIMMING POOL': {
      permitType: 'SWIMMING POOL COMM-MULTI',
      subType: 'BELOW GROUND / SPA / OTHER',
    },
    'SIGN': {
      permitType: 'SIGN NEW',
      subType: 'AWNING / ELECTRONIC SIGN / MESSAGE CTR / GROUND NO ELECTRIC / WALL NO ELECTRIC / OTHER',
    },
  },
};

/**
 * Look up the permit type + subType for a CRM Property Type + Work Type pair.
 * Both inputs are normalized (uppercased, trimmed) before lookup.
 * Returns null if the combination is not in the auto-trigger list.
 */
/**
 * Normalize a CRM work type value so minor formatting differences
 * (slash vs. space, extra spaces) don't break the lookup.
 * e.g. "Carport Shed" → "CARPORT / SHED", "Addition Remodel" → "ADDITION / REMODEL"
 */
function normalizeCRMWorkType(wt: string): string {
  const upper = wt.toUpperCase().trim();
  // Replace known slash-separated variants that users might type without the slash
  const SLASH_VARIANTS: [RegExp, string][] = [
    [/^CARPORT\s*\/?\s*SHED$/,                    'CARPORT / SHED'],
    [/^CARPORT\s*\/?\s*PATIO\s*COVER\s*\/?\s*SHED$/, 'CARPORT / SHED'],
    [/^ADDITION\s*\/?\s*REMODEL$/,                'ADDITION / REMODEL'],
    [/^NEW\s*CONSTRUCTION$/,                      'NEW CONSTRUCTION'],
    [/^MOBILE\s*HOME$/,                           'MOBILE HOME'],
    [/^SWIMMING\s*POOL$/,                         'SWIMMING POOL'],
  ];
  for (const [pattern, canonical] of SLASH_VARIANTS) {
    if (pattern.test(upper)) return canonical;
  }
  // Generic normalization: collapse multiple spaces
  return upper.replace(/\s+/g, ' ');
}

export function lookupInspectionsForCRM(
  propertyType: string | null | undefined,
  workType: string | null | undefined,
): PermitLookupResult | null {
  if (!propertyType || !workType) return null;
  const pt = propertyType.toUpperCase().trim();
  const wt = normalizeCRMWorkType(workType);
  return CRM_LOOKUP[pt]?.[wt] ?? null;
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


/**
 * Return only inspection requests that are awaiting GHL pickup and are not
 * already represented by one of the active GHL inspection slots. DB rows with
 * a historical "scheduled" status are intentionally excluded; the sheet is
 * the authoritative record for scheduled slots.
 */
export function getPendingInspectionRequests<T extends { status?: string | null; inspectionType?: string | null }>(
  inspections: readonly T[],
  scheduledInspectionTypes: Iterable<string | null | undefined>,
): T[] {
  const scheduledTypeSet = new Set(
    Array.from(scheduledInspectionTypes)
      .map((type) => normalizeInspectionType(type))
      .filter(Boolean),
  );

  return inspections.filter((inspection) => {
    if (inspection.status !== 'pending') return false;
    return !scheduledTypeSet.has(normalizeInspectionType(inspection.inspectionType));
  });
}


/** Fields shown on the Projects page that users can search. */
export type ProjectSearchRecord = {
  opportunityName?: string | null;
  company?: string | null;
  address?: string | null;
  contactName?: string | null;
  lotNumber?: string | null;
  subdivision?: string | null;
};

/**
 * Match a project against the Projects-page search. Lot number is included so
 * users can find a job even when they only know the lot reference.
 */
/** Normalize lot references so 196, Lot 196, and #196 refer to the same lot. */
function normalizeLotReference(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/\blot\b/g, '')
    .replace(/#/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function projectMatchesSearch(project: ProjectSearchRecord, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const generalFields = [
    project.opportunityName,
    project.company,
    project.address,
    project.contactName,
    project.subdivision,
  ];
  if (generalFields.some((value) => value?.toLowerCase().includes(query))) return true;

  const normalizedLotQuery = normalizeLotReference(query);
  return !!normalizedLotQuery && normalizeLotReference(project.lotNumber).includes(normalizedLotQuery);
}


/** The two dates used for invoice reporting. The closeout date is authoritative
 * and intentionally never falls back to Updated On, which changes after edits. */
export function getInvoiceProjectDates(project: {
  createdOn?: string | null;
  completionDate?: string | null;
}): { projectStartedDate: string | null; projectCompletedDate: string | null } {
  const normalize = (value: string | null | undefined) => value?.trim() || null;
  return {
    projectStartedDate: normalize(project.createdOn),
    projectCompletedDate: normalize(project.completionDate),
  };
}


/** Whether a selected portal role differs from the role currently saved in the database. */
export function hasPendingRoleChange(currentRole: string, selectedRole: string): boolean {
  return currentRole !== selectedRole;
}

/**
 * Return the newest report rows (highest sheet index first) for the current
 * progressive display count. Past Inspections is append-only, so a higher row
 * index represents a newer inspection.
 */
export function getVisibleInspectionReports<T extends { sheetRowIndex?: number | null }>(
  reports: readonly T[],
  displayCount: number,
): T[] {
  return [...reports]
    .sort((a, b) => (b.sheetRowIndex ?? -1) - (a.sheetRowIndex ?? -1))
    .slice(0, Math.max(0, displayCount));
}

/** Increase a progressive report list by a fixed amount without exceeding its total. */
export function showMoreReportCount(currentCount: number, totalCount: number, increment = 5): number {
  return Math.min(totalCount, currentCount + increment);
}


/** Whether a project assignment has been selected but has not yet been saved. */
export function hasPendingProjectAssignment(projectId: number | null | undefined): boolean {
  return typeof projectId === 'number' && projectId > 0;
}

/** Keep completed-project PDF downloads compact until an admin explicitly expands them. */
export function getVisibleCompletedProjectDownloads<T>(projects: readonly T[], showAll: boolean, initialCount = 4): T[] {
  return showAll ? [...projects] : projects.slice(0, Math.max(0, initialCount));
}


/**
 * Authentication sources can identify a person but must not overwrite a role
 * deliberately assigned by an administrator. Existing role wins on sign-in.
 */
export function resolvePersistedUserRole(existingRole: string | null | undefined, sourceRole: string | null | undefined): "user" | "admin" | "subcontractor" {
  if (existingRole === "admin" || existingRole === "subcontractor" || existingRole === "user") return existingRole;
  return sourceRole === "admin" ? "admin" : "user";
}


/** A subcontractor can access a project from their own company or an explicit assignment. */
export function subcontractorCanAccessProject(
  projectCompany: string | null | undefined,
  userCompany: string | null | undefined,
  hasExplicitAssignment: boolean,
): boolean {
  return hasExplicitAssignment || (!!userCompany && userCompany !== "ALL" && companiesMatch(projectCompany, userCompany));
}
