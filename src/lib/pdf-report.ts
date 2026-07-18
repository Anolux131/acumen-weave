// Client-side PDF generation for research reports.
// Uses jsPDF + marked to render clean, structured, branded PDFs directly in the
// browser — no server dependency, works with any long-form markdown report.

import { jsPDF } from "jspdf";
import { marked, type Tokens } from "marked";

type Style = {
  primary: [number, number, number];
  text: [number, number, number];
  muted: [number, number, number];
  rule: [number, number, number];
  accent: [number, number, number];
};

const STYLE: Style = {
  primary: [16, 24, 40],
  text: [30, 38, 52],
  muted: [110, 118, 130],
  rule: [220, 224, 232],
  accent: [56, 120, 255],
};

export function downloadReportAsPdf(opts: {
  markdown: string;
  title: string;
  subtitle?: string;
  filename: string;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  const contentW = pageW - margin * 2;
  let y = margin;
  let pageNum = 1;

  const setColor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

  const drawFooter = () => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    setColor(STYLE.muted);
    doc.text("ANOLUX Intelligence Engine", margin, pageH - 24);
    doc.text(`Page ${pageNum}`, pageW - margin, pageH - 24, { align: "right" });
  };

  const newPage = () => {
    drawFooter();
    doc.addPage();
    pageNum++;
    y = margin;
  };

  const ensureSpace = (h: number) => {
    if (y + h > pageH - margin - 20) newPage();
  };

  // ---------- Cover page ----------
  setFill(STYLE.primary);
  doc.rect(0, 0, pageW, 180, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 255);
  doc.text("ANOLUX  ·  INTELLIGENCE DOSSIER", margin, 60);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(opts.title, contentW);
  doc.text(titleLines, margin, 100);

  if (opts.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(210, 220, 240);
    doc.text(opts.subtitle, margin, 100 + titleLines.length * 26 + 6);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(200, 210, 230);
  doc.text(`Generated ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`, margin, 160);

  y = 220;

  // ---------- Body via marked tokens ----------
  const tokens = marked.lexer(opts.markdown);

  const writeText = (text: string, opts2: { font: "helvetica"; style: "normal" | "bold" | "italic"; size: number; color: [number, number, number]; leading?: number; indent?: number }) => {
    doc.setFont(opts2.font, opts2.style);
    doc.setFontSize(opts2.size);
    setColor(opts2.color);
    const indent = opts2.indent ?? 0;
    const wrapped = doc.splitTextToSize(text, contentW - indent);
    const leading = opts2.leading ?? opts2.size * 1.35;
    for (const line of wrapped) {
      ensureSpace(leading);
      doc.text(line, margin + indent, y);
      y += leading;
    }
  };

  const drawHeading = (text: string, level: number) => {
    const map: Record<number, { size: number; gap: number; rule: boolean }> = {
      1: { size: 20, gap: 20, rule: true },
      2: { size: 15, gap: 14, rule: true },
      3: { size: 12, gap: 10, rule: false },
      4: { size: 11, gap: 8, rule: false },
      5: { size: 10, gap: 6, rule: false },
      6: { size: 10, gap: 6, rule: false },
    };
    const cfg = map[level] ?? map[3];
    ensureSpace(cfg.size + cfg.gap + 20);
    y += cfg.gap;
    writeText(text, { font: "helvetica", style: "bold", size: cfg.size, color: STYLE.primary, leading: cfg.size * 1.2 });
    if (cfg.rule) {
      y += 2;
      setDraw(STYLE.rule);
      doc.setLineWidth(0.5);
      doc.line(margin, y, margin + contentW, y);
      y += 8;
    } else {
      y += 4;
    }
  };

  const stripInline = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  const drawList = (items: Tokens.ListItem[], ordered: boolean, depth = 0) => {
    items.forEach((item, i) => {
      const bullet = ordered ? `${i + 1}.` : "•";
      const indent = 14 + depth * 14;
      ensureSpace(14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setColor(STYLE.accent);
      doc.text(bullet, margin + depth * 14, y);
      const text = stripInline(item.text ?? "");
      writeText(text, { font: "helvetica", style: "normal", size: 10, color: STYLE.text, leading: 14, indent });
      // nested list
      const nested = (item.tokens ?? []).find((t) => t.type === "list") as Tokens.List | undefined;
      if (nested) drawList(nested.items as Tokens.ListItem[], nested.ordered, depth + 1);
      y += 2;
    });
  };

  const drawTable = (t: Tokens.Table) => {
    const cols = t.header.length;
    const colW = contentW / cols;
    const rowH = 20;
    ensureSpace(rowH * 2);
    // Header
    setFill(STYLE.primary);
    doc.rect(margin, y - 13, contentW, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    t.header.forEach((cell, i) => {
      const txt = stripInline(cell.text ?? "");
      doc.text(doc.splitTextToSize(txt, colW - 8)[0] ?? "", margin + i * colW + 6, y + 1);
    });
    y += rowH;

    // Rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(STYLE.text);
    t.rows.forEach((row, ri) => {
      ensureSpace(rowH);
      if (ri % 2 === 0) {
        setFill([248, 249, 251]);
        doc.rect(margin, y - 13, contentW, rowH, "F");
      }
      row.forEach((cell, i) => {
        const txt = stripInline(cell.text ?? "");
        doc.text(doc.splitTextToSize(txt, colW - 8)[0] ?? "", margin + i * colW + 6, y + 1);
      });
      y += rowH;
    });
    y += 6;
  };

  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        drawHeading((token as Tokens.Heading).text, (token as Tokens.Heading).depth);
        break;
      case "paragraph": {
        const text = stripInline((token as Tokens.Paragraph).text);
        writeText(text, { font: "helvetica", style: "normal", size: 10.5, color: STYLE.text, leading: 15 });
        y += 6;
        break;
      }
      case "list": {
        const l = token as Tokens.List;
        drawList(l.items as Tokens.ListItem[], l.ordered);
        y += 4;
        break;
      }
      case "blockquote": {
        const text = stripInline((token as Tokens.Blockquote).text);
        ensureSpace(30);
        setFill([245, 247, 251]);
        setDraw(STYLE.accent);
        const startY = y - 12;
        const wrapped = doc.splitTextToSize(text, contentW - 24);
        const h = wrapped.length * 14 + 12;
        doc.rect(margin, startY, contentW, h, "F");
        doc.setLineWidth(2);
        doc.line(margin, startY, margin, startY + h);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        setColor(STYLE.text);
        wrapped.forEach((line: string, i: number) => {
          doc.text(line, margin + 14, y + i * 14);
        });
        y += h + 4;
        break;
      }
      case "hr":
        ensureSpace(20);
        setDraw(STYLE.rule);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + contentW, y);
        y += 14;
        break;
      case "table":
        drawTable(token as Tokens.Table);
        break;
      case "code": {
        const code = (token as Tokens.Code).text;
        const lines = code.split("\n");
        ensureSpace(lines.length * 12 + 12);
        setFill([246, 248, 251]);
        doc.rect(margin, y - 10, contentW, lines.length * 12 + 12, "F");
        doc.setFont("courier", "normal");
        doc.setFontSize(9);
        setColor(STYLE.text);
        lines.forEach((line, i) => doc.text(line, margin + 8, y + i * 12));
        y += lines.length * 12 + 10;
        break;
      }
      case "space":
        y += 6;
        break;
      default:
        // Skip other token types silently
        break;
    }
  }

  drawFooter();
  doc.save(opts.filename);
}
