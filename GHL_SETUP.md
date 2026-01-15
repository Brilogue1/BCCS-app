# GoHighLevel Integration Setup

The BCCS Client Portal includes built-in integration with GoHighLevel (GHL) to automatically sync inspection bookings and contact emails.

## Configuration Options

You have two options for integrating with GoHighLevel:

### Option 1: API Integration (Recommended)

This option uses the GoHighLevel REST API to directly create appointments and contacts.

**Steps:**
1. Log in to your GoHighLevel account
2. Navigate to Settings → API Keys
3. Create a new API key with the following permissions:
   - Appointments: Read & Write
   - Contacts: Read & Write
4. Copy your API key and Location ID
5. Add these environment variables to your project:
   - `GHL_API_KEY`: Your GoHighLevel API key
   - `GHL_LOCATION_ID`: Your GoHighLevel location ID

### Option 2: Webhook Integration

This option sends data to a webhook URL that you configure in GoHighLevel.

**Steps:**
1. Log in to your GoHighLevel account
2. Navigate to Settings → Workflows
3. Create a new workflow triggered by "Custom Webhook"
4. Copy the webhook URL
5. Add this environment variable to your project:
   - `GHL_WEBHOOK_URL`: Your webhook URL

## What Gets Synced

### Inspection Bookings
When a client schedules an inspection, the following data is sent to GHL:
- Project ID
- Opportunity Name
- Inspection Type (e.g., Foundation, Framing, Final)
- Inspection Date and Time
- Notes

### Contact Emails
When a client adds an additional email to a project, the following data is sent to GHL:
- Project ID
- Opportunity Name
- Email Address
- Contact Name (if provided)

## Testing the Integration

After configuration, the portal will automatically attempt to sync data to GHL when:
- A new inspection is scheduled
- A new contact email is added

If the integration is not configured, the portal will continue to work normally but data will only be stored locally in the database.

## Troubleshooting

- Check the server logs for any GHL sync errors
- Verify your API key has the correct permissions
- Ensure your webhook URL is accessible and properly configured
- Test the connection using the GHL API documentation: https://highlevel.stoplight.io/

## Manual Sync

If you need to manually sync existing data to GHL, you can:
1. Export the data from the database
2. Use the GHL API directly
3. Or contact support for assistance with bulk sync operations
