# Proposal Tracking Columns (AZ and BA)

## Column Locations (CONFIRMED from Google Sheets)
- **Column AZ**: "Proposals Sent" - Contains "Yes" or empty
- **Column BA**: "Proposal Signed" - Contains "Yes", "No", or empty

## Sample Data from Spreadsheet:
| Project | Stage | Proposals Sent (AZ) | Proposal Signed (BA) |
|---------|-------|---------------------|----------------------|
| KB Home (657 Royal Palm) | Inspections | Yes | Yes |
| Kb Home | Inspections | Yes | No |
| Kb Home | Inspections | (empty) | (empty) |
| Kb Home - Project 1 | Inspections | (empty) | (empty) |
| Bri Logue | Plans Examining | (empty) | (empty) |
| Bri's HOP - Lot 451 | Proposal | (empty) | (empty) |
| KINSLEY - 102 | Permitting | (empty) | (empty) |
| Liberte - Lot 105 | Closeout | (empty) | (empty) |

## Logic for "Stuck in Proposal":
- Projects in "Proposal" stage where:
  - Proposals Sent = "Yes" AND Proposal Signed = "No" (sent but not signed - stuck)
  - OR Proposals Sent is empty (proposal not even sent yet)

## Metrics to Display:
1. Total projects in Proposal stage
2. Proposals Sent (count of "Yes" in AZ)
3. Proposals Signed (count of "Yes" in BA)
4. Stuck (Sent but not signed, or in Proposal stage without progress)
