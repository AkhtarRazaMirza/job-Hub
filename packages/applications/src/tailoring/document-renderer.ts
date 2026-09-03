/**
 * Job Hub — Phase 7 / Step 7.2
 * Tailored Resume PDF Document Renderer
 *
 * Deterministic document rendering converting validated TailoredResumeData
 * into a professional, candidate-ready PDF.
 * PURE & DETERMINISTIC: Zero LLM calls.
 *
 * Grounded in:
 * - 01_build_the_system.md §4 Step 9 ("Collect required documents, never alter master resume")
 * - 02_how_to_build.md §11 ("Validation -> PDF/DOCX generation -> Version saved")
 * - 03_tech_stack.md §10 ("Cloudflare R2: Purpose: original resumes, tailored resumes, generated documents")
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { TailoredResumeData } from "./types";
import { tailoredResumeDataSchema } from "./validation";

export interface PdfRenderOptions {
  pageSize?: [number, number]; // Default [612, 792] (US Letter)
  margin?: number; // Default 40
}

/**
 * Wraps text into multiple lines fitting within maxWidth.
 */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

/**
 * Deterministically renders validated TailoredResumeData to a PDF Buffer.
 */
export async function renderResumePdf(
  data: TailoredResumeData,
  options?: PdfRenderOptions
): Promise<Buffer> {
  // 1. Validate structured input
  const validated = tailoredResumeDataSchema.parse(data);

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = options?.pageSize?.[0] ?? 612; // US Letter width
  const pageHeight = options?.pageSize?.[1] ?? 792; // US Letter height
  const margin = options?.margin ?? 40;
  const contentWidth = pageWidth - margin * 2;

  let currentPage: PDFPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function ensureSpace(requiredSpace: number) {
    if (y - requiredSpace < margin) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  function drawSectionHeader(title: string) {
    ensureSpace(28);
    y -= 10;
    currentPage.drawText(title.toUpperCase(), {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.12, 0.22, 0.38), // Deep navy
    });
    y -= 4;
    // Divider line
    currentPage.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.8,
      color: rgb(0.75, 0.78, 0.82),
    });
    y -= 10;
  }

  // ---------------------------------------------------------------------------
  // 1. Header (Name, Target Title, Contact Details)
  // ---------------------------------------------------------------------------
  currentPage.drawText(validated.contact.name, {
    x: margin,
    y,
    size: 20,
    font: fontBold,
    color: rgb(0.08, 0.12, 0.2),
  });
  y -= 16;

  currentPage.drawText(validated.targetTitle, {
    x: margin,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0.25, 0.35, 0.5),
  });
  y -= 14;

  const contactItems: string[] = [
    validated.contact.email,
    validated.contact.phone,
    validated.contact.location,
    validated.contact.linkedinUrl,
    validated.contact.githubUrl,
    validated.contact.portfolioUrl,
  ].filter((item): item is string => Boolean(item));

  const contactLine = contactItems.join("  |  ");
  const wrappedContact = wrapText(contactLine, fontRegular, 8.5, contentWidth);
  for (const line of wrappedContact) {
    currentPage.drawText(line, {
      x: margin,
      y,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.3, 0.35, 0.4),
    });
    y -= 11;
  }
  y -= 6;

  // ---------------------------------------------------------------------------
  // 2. Professional Summary
  // ---------------------------------------------------------------------------
  drawSectionHeader("Professional Summary");
  const summaryLines = wrapText(validated.summary.text, fontRegular, 9.5, contentWidth);
  for (const line of summaryLines) {
    ensureSpace(13);
    currentPage.drawText(line, {
      x: margin,
      y,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.15, 0.18, 0.22),
    });
    y -= 13;
  }
  y -= 4;

  // ---------------------------------------------------------------------------
  // 3. Technical Skills
  // ---------------------------------------------------------------------------
  if (validated.skills.length > 0) {
    drawSectionHeader("Technical Skills");
    for (const group of validated.skills) {
      ensureSpace(14);
      const groupTitle = `${group.category}: `;
      const skillsStr = group.skills.join(", ");
      const titleWidth = fontBold.widthOfTextAtSize(groupTitle, 9);
      const wrappedSkills = wrapText(skillsStr, fontRegular, 9, contentWidth - titleWidth);

      currentPage.drawText(groupTitle, {
        x: margin,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.12, 0.15, 0.2),
      });

      currentPage.drawText(wrappedSkills[0] ?? "", {
        x: margin + titleWidth,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.2, 0.22, 0.26),
      });
      y -= 12;

      for (let i = 1; i < wrappedSkills.length; i++) {
        ensureSpace(12);
        currentPage.drawText(wrappedSkills[i] ?? "", {
          x: margin + titleWidth,
          y,
          size: 9,
          font: fontRegular,
          color: rgb(0.2, 0.22, 0.26),
        });
        y -= 12;
      }
    }
    y -= 4;
  }

  // ---------------------------------------------------------------------------
  // 4. Professional Experience
  // ---------------------------------------------------------------------------
  if (validated.experiences.length > 0) {
    drawSectionHeader("Professional Experience");
    for (const exp of validated.experiences) {
      ensureSpace(32);
      const roleText = exp.role;
      const companyText = exp.company;
      const dateText = `${exp.startDate} – ${exp.endDate || (exp.isCurrent ? "Present" : "")}`;

      // Role (Bold) & Date (Right-aligned)
      currentPage.drawText(roleText, {
        x: margin,
        y,
        size: 10,
        font: fontBold,
        color: rgb(0.1, 0.12, 0.18),
      });

      const dateWidth = fontRegular.widthOfTextAtSize(dateText, 9);
      currentPage.drawText(dateText, {
        x: pageWidth - margin - dateWidth,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.4, 0.44, 0.5),
      });
      y -= 12;

      // Company (Oblique)
      currentPage.drawText(companyText + (exp.location ? ` | ${exp.location}` : ""), {
        x: margin,
        y,
        size: 9,
        font: fontOblique,
        color: rgb(0.3, 0.35, 0.45),
      });
      y -= 12;

      // Bullets
      for (const bullet of exp.bullets) {
        const bulletLines = wrapText(bullet.text, fontRegular, 9, contentWidth - 14);
        for (let i = 0; i < bulletLines.length; i++) {
          ensureSpace(12);
          if (i === 0) {
            currentPage.drawText("•", {
              x: margin + 4,
              y,
              size: 9,
              font: fontRegular,
              color: rgb(0.3, 0.35, 0.45),
            });
          }
          currentPage.drawText(bulletLines[i] ?? "", {
            x: margin + 14,
            y,
            size: 9,
            font: fontRegular,
            color: rgb(0.18, 0.2, 0.25),
          });
          y -= 12;
        }
      }
      y -= 4;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Selected Projects
  // ---------------------------------------------------------------------------
  if (validated.projects && validated.projects.length > 0) {
    drawSectionHeader("Key Projects");
    for (const proj of validated.projects) {
      ensureSpace(26);
      const projName = proj.name;
      const techText = proj.technologies.length > 0 ? `(${proj.technologies.join(", ")})` : "";

      currentPage.drawText(projName, {
        x: margin,
        y,
        size: 9.5,
        font: fontBold,
        color: rgb(0.1, 0.14, 0.22),
      });

      if (techText) {
        const nameWidth = fontBold.widthOfTextAtSize(projName, 9.5);
        currentPage.drawText(` ${techText}`, {
          x: margin + nameWidth,
          y,
          size: 8.5,
          font: fontOblique,
          color: rgb(0.4, 0.44, 0.5),
        });
      }
      y -= 11;

      const descLines = wrapText(proj.description, fontRegular, 9, contentWidth - 12);
      for (const line of descLines) {
        ensureSpace(11);
        currentPage.drawText(line, {
          x: margin + 10,
          y,
          size: 9,
          font: fontRegular,
          color: rgb(0.2, 0.22, 0.26),
        });
        y -= 11;
      }

      if (proj.highlight) {
        ensureSpace(11);
        currentPage.drawText(`Impact: ${proj.highlight}`, {
          x: margin + 10,
          y,
          size: 8.5,
          font: fontOblique,
          color: rgb(0.25, 0.35, 0.45),
        });
        y -= 11;
      }
      y -= 3;
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Education
  // ---------------------------------------------------------------------------
  if (validated.education && validated.education.length > 0) {
    drawSectionHeader("Education");
    for (const edu of validated.education) {
      ensureSpace(18);
      const degreeText = [edu.degree, edu.fieldOfStudy].filter(Boolean).join(" in ");
      const instText = edu.institution;
      const yearText = edu.graduationYear ? String(edu.graduationYear) : "";

      currentPage.drawText(degreeText ? `${degreeText} — ${instText}` : instText, {
        x: margin,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.12, 0.15, 0.2),
      });

      if (yearText) {
        const yearWidth = fontRegular.widthOfTextAtSize(yearText, 9);
        currentPage.drawText(yearText, {
          x: pageWidth - margin - yearWidth,
          y,
          size: 9,
          font: fontRegular,
          color: rgb(0.4, 0.44, 0.5),
        });
      }
      y -= 12;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
