// src/lib/generateBillOfSale.js
// Generates a Livestock Bill of Sale PDF using jsPDF + jspdf-autotable.
//
// Usage:
//   import { generateBillOfSale } from './generateBillOfSale';
//   const doc = generateBillOfSale({ seller, buyer, animals, saleDate, saleLocation, totalPrice, additionalAgreements, farmLogoBase64 });
//   doc.save('bill-of-sale.pdf');

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const GREEN = '#1B4332';
const BRASS = '#B8960C';
const ALT_ROW = '#F0F7F4';

const MARGIN = 0.75 * 72; // 0.75 in → points
const PAGE_W = 8.5 * 72;
const PAGE_H = 11 * 72;
const CONTENT_W = PAGE_W - MARGIN * 2;

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${Number(m)}/${Number(d)}/${y}`;
}

function fmtUSD(val) {
  if (val == null || val === '' || isNaN(Number(val))) return '—';
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * @param {object} opts
 * @param {{ farmName, address, city, state, zip, phone }} opts.seller
 * @param {{ name, address, city, state, zip, phone, email }} opts.buyer
 * @param {Array<{ name, tag, species, breed, dob, sex, weight, color, price }>} opts.animals
 * @param {string} opts.saleDate         ISO date
 * @param {string} opts.saleLocation
 * @param {number|string} opts.totalPrice
 * @param {string} opts.additionalAgreements
 * @param {string|null} opts.farmLogoBase64   data URI or raw base64 PNG/JPEG
 * @returns {jsPDF}
 */
export function generateBillOfSale({
  seller = {},
  buyer = {},
  animals = [],
  saleDate = '',
  saleLocation = '',
  totalPrice = '',
  additionalAgreements = '',
  farmLogoBase64 = null,
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });

  let y = MARGIN;

  // ── 1. HEADER ──────────────────────────────────────────────────────────────

  // Optional logo — top-left, max 1.2 in wide
  const MAX_LOGO_W = 1.2 * 72;
  const MAX_LOGO_H = 0.7 * 72;
  if (farmLogoBase64) {
    try {
      // Accept data URI or raw base64
      const src = farmLogoBase64.startsWith('data:') ? farmLogoBase64 : `data:image/png;base64,${farmLogoBase64}`;
      const img = new Image();
      img.src = src;
      // Compute aspect-correct dimensions
      let lw = MAX_LOGO_W;
      let lh = MAX_LOGO_H;
      if (img.naturalWidth && img.naturalHeight) {
        const ratio = img.naturalWidth / img.naturalHeight;
        if (ratio > MAX_LOGO_W / MAX_LOGO_H) {
          lh = lw / ratio;
        } else {
          lw = lh * ratio;
        }
      }
      doc.addImage(src, 'PNG', MARGIN, y, lw, lh);
    } catch (_) {
      // Logo failed silently
    }
  }

  // Title — centered
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(GREEN);
  doc.text('LIVESTOCK BILL OF SALE', PAGE_W / 2, y + 18, { align: 'center' });

  y += 30;

  // Brass rule
  doc.setDrawColor(BRASS);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 14;

  // ── 2. SELLER / BUYER TWO-COLUMN BLOCK ─────────────────────────────────────

  const colW = CONTENT_W / 2 - 8;
  const colRX = MARGIN + colW + 16;

  function drawParty(label, lines, startX) {
    let cy = y;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(GREEN);
    doc.text(label, startX, cy);
    cy += 13;

    lines.forEach((line, i) => {
      if (!line) return;
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
      doc.setFontSize(10);
      doc.setTextColor('#222222');
      doc.text(line, startX, cy);
      cy += 13;
    });
    return cy;
  }

  const sellerLines = [
    seller.farmName || '—',
    seller.address || '',
    [seller.city, seller.state].filter(Boolean).join(', ') + (seller.zip ? ` ${seller.zip}` : ''),
    seller.phone || '',
  ].filter(v => v !== '');

  const buyerLines = [
    buyer.name || '—',
    buyer.address || '',
    [buyer.city, buyer.state].filter(Boolean).join(', ') + (buyer.zip ? ` ${buyer.zip}` : ''),
    buyer.phone || '',
    buyer.email || '',
  ].filter(v => v !== '');

  const leftBottom = drawParty('SELLER', sellerLines, MARGIN);
  const rightBottom = drawParty('BUYER', buyerLines, colRX);
  y = Math.max(leftBottom, rightBottom) + 14;

  // ── 3. CERTIFICATION PARAGRAPH ─────────────────────────────────────────────

  const totalDisplay = totalPrice != null && totalPrice !== '' && !isNaN(Number(totalPrice))
    ? Number(totalPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';

  const certText =
    `This is to certify that on this ${fmtDate(saleDate)} the undersigned Seller, in consideration of the sum ` +
    `of $${totalDisplay}, sold to the undersigned Buyer the following described livestock, the title to ` +
    `which the Seller guarantees.`;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor('#333333');
  const certLines = doc.splitTextToSize(certText, CONTENT_W);
  doc.text(certLines, MARGIN, y);
  y += certLines.length * 13 + 12;

  // ── 4. ANIMALS TABLE ───────────────────────────────────────────────────────

  const tableRows = animals.map((a, i) => [
    String(i + 1),
    [a.name, a.tag ? `#${a.tag}` : ''].filter(Boolean).join(' ') || '—',
    [a.species, a.breed].filter(Boolean).join(' / ') || '—',
    a.dob ? fmtDate(a.dob) : '—',
    a.sex || '—',
    a.weight ? `${a.weight} lbs` : '—',
    a.color || '—',
    a.price != null && a.price !== '' ? fmtUSD(a.price) : '—',
  ]);

  const totalRow = [
    '', '', '', '', '', '', 'TOTAL',
    fmtUSD(totalPrice),
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['#', 'Animal Name/Tag', 'Species/Breed', 'DOB', 'Sex', 'Weight', 'Color/Desc', 'Price']],
    body: [...tableRows, totalRow],
    styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
    headStyles: {
      fillColor: GREEN,
      textColor: '#FFFFFF',
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: ALT_ROW },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 100 },
      2: { cellWidth: 95 },
      3: { cellWidth: 55 },
      4: { cellWidth: 30 },
      5: { cellWidth: 50 },
      6: { cellWidth: 90 },
      7: { cellWidth: 64, halign: 'right' },
    },
    didParseCell(data) {
      if (data.row.index === tableRows.length) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
    theme: 'grid',
  });

  y = doc.lastAutoTable.finalY + 14;

  // ── 5. SALE DETAILS ROW ────────────────────────────────────────────────────

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#222222');
  doc.text(`Sale Date: ${fmtDate(saleDate)}`, MARGIN, y);
  doc.text(`Sale Location: ${saleLocation || '—'}`, MARGIN + CONTENT_W / 2, y);
  y += 20;

  // ── 6. ADDITIONAL AGREEMENTS ───────────────────────────────────────────────

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(GREEN);
  doc.text('Additional Agreements:', MARGIN, y);
  y += 12;

  const boxH = 56;
  doc.setDrawColor('#CCCCCC');
  doc.setLineWidth(0.75);
  doc.rect(MARGIN, y, CONTENT_W, boxH);

  if (additionalAgreements?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor('#333333');
    const agLines = doc.splitTextToSize(additionalAgreements.trim(), CONTENT_W - 10);
    doc.text(agLines, MARGIN + 5, y + 12);
  } else {
    // Draw blank lines
    doc.setDrawColor('#DDDDDD');
    doc.setLineWidth(0.5);
    for (let li = 1; li <= 3; li++) {
      const ly = y + li * 14;
      doc.line(MARGIN + 8, ly, MARGIN + CONTENT_W - 8, ly);
    }
  }
  y += boxH + 18;

  // ── 7. SIGNATURE BLOCK ─────────────────────────────────────────────────────

  const sigColW = (CONTENT_W - 24) / 2;
  const sigDateW = 80;
  const sigLineW = sigColW - sigDateW - 12;

  function drawSigBlock(label, startX, startY) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#555555');
    doc.text(label, startX, startY);
    const lineY = startY + 20;
    doc.setDrawColor('#555555');
    doc.setLineWidth(0.75);
    doc.line(startX, lineY, startX + sigLineW, lineY);
    doc.line(startX + sigLineW + 12, lineY, startX + sigLineW + 12 + sigDateW, lineY);
    doc.setFontSize(8);
    doc.text('Signature', startX, lineY + 9);
    doc.text('Date', startX + sigLineW + 12, lineY + 9);
  }

  drawSigBlock('Seller Signature', MARGIN, y);
  drawSigBlock('Buyer Signature', MARGIN + sigColW + 24, y);
  y += 46;

  // ── 8. FOOTER ──────────────────────────────────────────────────────────────

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#999999');
  doc.text('Generated by Herd Ledger · herdledger.app', PAGE_W / 2, PAGE_H - 24, { align: 'center' });

  return doc;
}
