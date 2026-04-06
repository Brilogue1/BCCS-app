import PDFDocument from 'pdfkit';
import path from 'path';

export interface InspectionRow {
  type: string;
  status: string;
}

export interface ReportData {
  permitNumber: string;
  address: string;
  date: string;
  inspectorName: string;
  inspections: InspectionRow[];
}

/**
 * Parse completedInspections text field into inspection rows.
 * Format: "YYYY-MM-DD — TYPE\nYYYY-MM-DD — TYPE\n..."
 * Skips blank lines and lines where type is "_" or just whitespace.
 */
export function parseCompletedInspections(text: string): InspectionRow[] {
  if (!text || text.trim() === '') return [];
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line !== '_' && line !== '—' && line.length > 2)
    .map(line => {
      // Format: "2026-02-13 — BLDG CEILING GRID"
      const dashIdx = line.indexOf('—');
      if (dashIdx !== -1) {
        const datePart = line.substring(0, dashIdx).trim();
        const typePart = line.substring(dashIdx + 1).trim();
        if (!typePart || typePart === '_') return null;
        // Format date as MM/DD/YY
        let formattedDate = '';
        try {
          const d = new Date(datePart);
          if (!isNaN(d.getTime())) {
            formattedDate = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
          }
        } catch {
          formattedDate = datePart;
        }
        return { type: typePart, status: formattedDate ? `Pass - ${formattedDate}` : 'Pass' };
      }
      // No date separator, treat whole line as type
      if (line === '_') return null;
      return { type: line, status: '' };
    })
    .filter((row): row is InspectionRow => row !== null && row.type !== '_' && row.type.trim() !== '');
}

/**
 * Build inspection rows from the Past Inspections sheet data only.
 * Skips entries where type is "_", blank, or null.
 */
export function buildInspectionRows(
  completedInspectionsText: string,
): InspectionRow[] {
  return parseCompletedInspections(completedInspectionsText);
}

/**
 * Generate a PDF Inspection Record matching the BCCS report format.
 * Returns a Buffer containing the PDF bytes.
 */
export function generateInspectionRecordPDF(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 60 });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 120; // account for margins

    // ── Header ──────────────────────────────────────────────────────────────
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('BUILDING CODE COMPLIANCE SOLUTIONS LLC', { align: 'center' });

    doc
      .font('Helvetica')
      .fontSize(10)
      .text('908 Christina Chase Lane Lakeland, FL 33813', { align: 'center' })
      .text('Phone: 765-212-8177     Email: bccsfla@gmail.com', { align: 'center' });

    doc.moveDown(0.8);

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('INSPECTION RECORD', { align: 'center', underline: false });

    doc.moveDown(1.2);

    // ── Project Info ─────────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(11);
    doc.text(`Permit Number: ${data.permitNumber || 'N/A'}`);
    doc.moveDown(0.4);
    doc.text(`Address: ${data.address || 'N/A'}`);
    doc.moveDown(0.4);
    doc.text(`Date: ${data.date || ''}`);

    doc.moveDown(1.2);

    // ── Table ─────────────────────────────────────────────────────────────────
    const tableTop = doc.y;
    const col1X = 60;
    const col2X = 60 + pageWidth * 0.72;
    const col2Width = pageWidth * 0.28;
    const rowHeight = 22;

    // Table header background
    doc.rect(col1X, tableTop, pageWidth, rowHeight).fillAndStroke('#f0f0f0', '#cccccc');

    // Header text
    doc
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Inspection', col1X + 8, tableTop + 6, { width: pageWidth * 0.70 })
      .text('STATUS', col2X + 4, tableTop + 6, { width: col2Width - 8 });

    // Vertical divider in header
    doc.moveTo(col2X, tableTop).lineTo(col2X, tableTop + rowHeight).strokeColor('#cccccc').stroke();

    let y = tableTop + rowHeight;

    doc.font('Helvetica').fontSize(10);

    for (const row of data.inspections) {
      // Row background (alternating subtle)
      doc.rect(col1X, y, pageWidth, rowHeight).fillAndStroke('#ffffff', '#e0e0e0');

      doc.fillColor('#000000');
      doc.text(row.type, col1X + 8, y + 6, { width: pageWidth * 0.68, ellipsis: true });
      doc.text(row.status, col2X + 4, y + 6, { width: col2Width - 8 });

      // Vertical divider
      doc.moveTo(col2X, y).lineTo(col2X, y + rowHeight).strokeColor('#e0e0e0').stroke();

      y += rowHeight;

      // Page break if needed
      if (y > doc.page.height - 120) {
        doc.addPage();
        y = 60;
      }
    }

    // Bottom border of table
    doc.moveTo(col1X, y).lineTo(col1X + pageWidth, y).strokeColor('#cccccc').stroke();

    doc.moveDown(2);

    // ── Footer with Signature ─────────────────────────────────────────────────
    doc.y = y + 24;
    doc.font('Helvetica').fontSize(11);
    doc.text(`Inspector Name: ${data.inspectorName || ''}`);
    doc.moveDown(0.4);
    doc.text('License Number');

    // Cursive signature
    if (data.inspectorName) {
      doc.moveDown(1.5);
      try {
        const fontPath = path.join(__dirname, 'fonts', 'DancingScript.ttf');
        doc.registerFont('Signature', fontPath);
        doc.font('Signature').fontSize(28).fillColor('#1a1a6e');
        doc.text(data.inspectorName, { align: 'left' });
        doc.font('Helvetica').fontSize(10).fillColor('#000000');
      } catch (e) {
        // Fallback: use Helvetica-Oblique if custom font fails
        doc.font('Helvetica-Oblique').fontSize(22).fillColor('#1a1a6e');
        doc.text(data.inspectorName, { align: 'left' });
        doc.font('Helvetica').fontSize(10).fillColor('#000000');
      }
    }

    doc.end();
  });
}


/**
 * Data for a single inspection report
 */
export interface SingleInspectionReportData {
  permitNumber: string;
  address: string;
  projectName: string;
  inspectionType: string;
  dateApproved: string;
  approvedStatus: string;
  inspectorName: string;
  company: string;
}

/**
 * Generate a PDF report for a single inspection.
 * Includes BCCS header, project info, single inspection details, and cursive signature.
 * Returns a Buffer containing the PDF bytes.
 */
export function generateSingleInspectionPDF(data: SingleInspectionReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 60 });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 120;

    // ── Header ──────────────────────────────────────────────────────────────
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('BUILDING CODE COMPLIANCE SOLUTIONS LLC', { align: 'center' });

    doc
      .font('Helvetica')
      .fontSize(10)
      .text('908 Christina Chase Lane Lakeland, FL 33813', { align: 'center' })
      .text('Phone: 765-212-8177     Email: bccsfla@gmail.com', { align: 'center' });

    doc.moveDown(0.8);

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('INSPECTION REPORT', { align: 'center' });

    doc.moveDown(1.5);

    // ── Project Info ─────────────────────────────────────────────────────────
    const labelX = 60;
    const valueX = 200;

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Project Name:', labelX, doc.y);
    doc.font('Helvetica').fontSize(11);
    doc.text(data.projectName || 'N/A', valueX, doc.y - doc.currentLineHeight());
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Address:', labelX, doc.y);
    doc.font('Helvetica').fontSize(11);
    doc.text(data.address || 'N/A', valueX, doc.y - doc.currentLineHeight());
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Permit Number:', labelX, doc.y);
    doc.font('Helvetica').fontSize(11);
    doc.text(data.permitNumber || 'N/A', valueX, doc.y - doc.currentLineHeight());
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Company:', labelX, doc.y);
    doc.font('Helvetica').fontSize(11);
    doc.text(data.company || 'N/A', valueX, doc.y - doc.currentLineHeight());
    doc.moveDown(1.5);

    // ── Inspection Details ───────────────────────────────────────────────────
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Inspection Details', { underline: true });
    doc.moveDown(0.8);

    // Table with single inspection
    const tableTop = doc.y;
    const col1X = 60;
    const col2X = 60 + pageWidth * 0.45;
    const col3X = 60 + pageWidth * 0.72;
    const rowHeight = 28;

    // Table header background
    doc.rect(col1X, tableTop, pageWidth, rowHeight).fillAndStroke('#f0f0f0', '#cccccc');

    doc
      .fillColor('#000000')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Inspection Type', col1X + 8, tableTop + 8, { width: pageWidth * 0.43 })
      .text('Status', col2X + 4, tableTop + 8, { width: pageWidth * 0.25 })
      .text('Date', col3X + 4, tableTop + 8, { width: pageWidth * 0.26 });

    // Vertical dividers in header
    doc.moveTo(col2X, tableTop).lineTo(col2X, tableTop + rowHeight).strokeColor('#cccccc').stroke();
    doc.moveTo(col3X, tableTop).lineTo(col3X, tableTop + rowHeight).strokeColor('#cccccc').stroke();

    let y = tableTop + rowHeight;

    // Data row
    doc.rect(col1X, y, pageWidth, rowHeight).fillAndStroke('#ffffff', '#e0e0e0');
    doc.fillColor('#000000').font('Helvetica').fontSize(10);
    doc.text(data.inspectionType || '', col1X + 8, y + 8, { width: pageWidth * 0.43, ellipsis: true });
    doc.text(data.approvedStatus || '', col2X + 4, y + 8, { width: pageWidth * 0.25 });
    doc.text(data.dateApproved || '', col3X + 4, y + 8, { width: pageWidth * 0.26 });

    // Vertical dividers
    doc.moveTo(col2X, y).lineTo(col2X, y + rowHeight).strokeColor('#e0e0e0').stroke();
    doc.moveTo(col3X, y).lineTo(col3X, y + rowHeight).strokeColor('#e0e0e0').stroke();

    y += rowHeight;

    // Bottom border
    doc.moveTo(col1X, y).lineTo(col1X + pageWidth, y).strokeColor('#cccccc').stroke();

    doc.moveDown(3);

    // ── Footer with Signature ────────────────────────────────────────────────
    doc.y = y + 40;
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('Inspector:', { continued: true });
    doc.font('Helvetica').fontSize(11);
    doc.text(` ${data.inspectorName || ''}`);

    // Cursive signature
    if (data.inspectorName) {
      doc.moveDown(1);
      try {
        const fontPath = path.join(__dirname, 'fonts', 'DancingScript.ttf');
        doc.registerFont('SignatureFont', fontPath);
        doc.font('SignatureFont').fontSize(28).fillColor('#1a1a6e');
        doc.text(data.inspectorName, { align: 'left' });
        doc.font('Helvetica').fontSize(10).fillColor('#000000');
      } catch (e) {
        // Fallback: use Helvetica-Oblique if custom font fails
        doc.font('Helvetica-Oblique').fontSize(22).fillColor('#1a1a6e');
        doc.text(data.inspectorName, { align: 'left' });
        doc.font('Helvetica').fontSize(10).fillColor('#000000');
      }
    }

    // Blank license number line below signature
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
    doc.text('License Number:', { continued: true });
    doc.font('Helvetica').fontSize(11);
    doc.text(' ___________________________');

    doc.end();
  });
}
