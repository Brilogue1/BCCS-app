# Inspection Results Columns (Z-AB)

## Column Locations (CONFIRMED)
- **Column Z**: "1st Inspection Results" - Contains values like "Approved", "Denied", "Partial"
- **Column AA**: "2nd Inspection Results" - Contains values like "Approved", "Partial"
- **Column AB**: "3rd Inspection Results" - Contains values like "Approved"

## Sample Data from Column Z (1st Inspection Results)
- Row 2: (empty) - GRANT ROWLAND
- Row 3: Partial
- Row 4: (empty)
- Row 5: NOTIFICATION Approved
- Row 6: (empty)
- Row 7: BLDG INSULAT INSPECTOR NC Approved
- Row 8: CLIENT NOTIFICATION FOR INS
- Row 9: (empty)
- Row 10: Denied
- Row 13: MECH FINAL 22 TIM MILLER Approved
- Row 14: GRANT ROWLAND
- Row 15: TIM MILLER Approved
- Row 17: GRANT ROWLAND

## Values to Count
- Approved
- Denied
- Partial

## Implementation Notes
- Need to parse the text to find "Approved", "Denied", or "Partial" keywords
- Some cells contain additional text with the result (e.g., "NOTIFICATION Approved")
- Will need case-insensitive matching
