import axios from 'axios';

/**
 * GoHighLevel API Integration
 * 
 * To configure:
 * 1. Set GHL_API_KEY environment variable with your GHL API key
 * 2. Set GHL_LOCATION_ID environment variable with your GHL location ID
 * 3. Optionally set GHL_WEBHOOK_URL for webhook-based updates
 */

const GHL_API_KEY = process.env.GHL_API_KEY || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || '';
const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL || '';
const GHL_API_BASE_URL = 'https://rest.gohighlevel.com/v1';

interface GHLInspection {
  opportunityId?: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  assignedUserId?: string;
}

interface GHLContact {
  email: string;
  name?: string;
  opportunityId?: string;
}

/**
 * Check if GHL integration is configured
 */
export function isGHLConfigured(): boolean {
  return !!(GHL_API_KEY && GHL_LOCATION_ID);
}

/**
 * Sync inspection to GoHighLevel
 */
export async function syncInspectionToGHL(inspection: {
  projectId: number;
  projectName: string;
  projectAddress: string;
  inspectionType: string;
  notes?: string;
}): Promise<{ success: boolean; ghlId?: string; error?: string }> {
  if (!isGHLConfigured()) {
    console.warn('[GHL] Integration not configured. Skipping sync.');
    return { success: false, error: 'GHL integration not configured' };
  }

  try {
    // If webhook URL is provided, use webhook approach
    if (GHL_WEBHOOK_URL) {
      await axios.post(GHL_WEBHOOK_URL, {
        type: 'inspection_scheduled',
        data: {
          projectId: inspection.projectId,
          projectName: inspection.projectName,
          projectAddress: inspection.projectAddress,
          inspectionType: inspection.inspectionType,
          notes: inspection.notes,
        },
      });
      return { success: true };
    }

    // Otherwise use GHL API
    const response = await axios.post(
      `${GHL_API_BASE_URL}/appointments`,
      {
        locationId: GHL_LOCATION_ID,
        title: `${inspection.inspectionType} - ${inspection.projectName} (${inspection.projectAddress})`,
        notes: inspection.notes || '',
      },
      {
        headers: {
          'Authorization': `Bearer ${GHL_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      ghlId: response.data.id || response.data.appointment?.id,
    };
  } catch (error) {
    console.error('[GHL] Failed to sync inspection:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sync contact email to GoHighLevel
 */
export async function syncContactToGHL(contact: {
  projectId: number;
  opportunityName: string;
  email: string;
  name?: string;
}): Promise<{ success: boolean; ghlId?: string; error?: string }> {
  if (!isGHLConfigured()) {
    console.warn('[GHL] Integration not configured. Skipping sync.');
    return { success: false, error: 'GHL integration not configured' };
  }

  try {
    // If webhook URL is provided, use webhook approach
    if (GHL_WEBHOOK_URL) {
      await axios.post(GHL_WEBHOOK_URL, {
        type: 'contact_added',
        data: {
          projectId: contact.projectId,
          opportunityName: contact.opportunityName,
          email: contact.email,
          name: contact.name,
        },
      });
      return { success: true };
    }

    // Otherwise use GHL API to create/update contact
    const response = await axios.post(
      `${GHL_API_BASE_URL}/contacts`,
      {
        locationId: GHL_LOCATION_ID,
        email: contact.email,
        name: contact.name || contact.email,
        tags: [`project-${contact.projectId}`, contact.opportunityName],
      },
      {
        headers: {
          'Authorization': `Bearer ${GHL_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      ghlId: response.data.id || response.data.contact?.id,
    };
  } catch (error) {
    console.error('[GHL] Failed to sync contact:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test GHL connection
 */
export async function testGHLConnection(): Promise<{ success: boolean; error?: string }> {
  if (!isGHLConfigured()) {
    return { success: false, error: 'GHL integration not configured' };
  }

  try {
    await axios.get(`${GHL_API_BASE_URL}/locations/${GHL_LOCATION_ID}`, {
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
      },
    });
    return { success: true };
  } catch (error) {
    console.error('[GHL] Connection test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
