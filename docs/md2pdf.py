#!/usr/bin/env python3
"""Minimal Markdown -> PDF converter (reportlab) tailored for the analytics spec.

Handles: ATX headings, paragraphs, fenced code blocks, pipe tables, unordered
lists, blockquotes, horizontal rules, and inline **bold** / `code`.
"""
import re
import sys
import html

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Preformatted, HRFlowable
)

INK = colors.HexColor("#1a1a2e")
ACCENT = colors.HexColor("#3a3a8c")
CODE_BG = colors.HexColor("#f4f4f8")
BORDER = colors.HexColor("#d0d0dc")
HEADER_BG = colors.HexColor("#3a3a8c")
ROW_ALT = colors.HexColor("#f7f7fb")


def build_styles():
    ss = getSampleStyleSheet()
    styles = {}
    styles["title"] = ParagraphStyle("title", parent=ss["Title"], textColor=ACCENT,
                                     fontSize=22, leading=26, spaceAfter=14)
    styles["h1"] = ParagraphStyle("h1", parent=ss["Heading1"], textColor=ACCENT,
                                   fontSize=16, leading=20, spaceBefore=16, spaceAfter=8)
    styles["h2"] = ParagraphStyle("h2", parent=ss["Heading2"], textColor=INK,
                                   fontSize=13, leading=17, spaceBefore=12, spaceAfter=6)
    styles["h3"] = ParagraphStyle("h3", parent=ss["Heading3"], textColor=INK,
                                   fontSize=11.5, leading=15, spaceBefore=10, spaceAfter=4)
    styles["h4"] = ParagraphStyle("h4", parent=ss["Heading4"], textColor=ACCENT,
                                   fontSize=10.5, leading=14, spaceBefore=8, spaceAfter=3)
    styles["body"] = ParagraphStyle("body", parent=ss["BodyText"], textColor=INK,
                                     fontSize=9.5, leading=14, alignment=TA_LEFT, spaceAfter=6)
    styles["li"] = ParagraphStyle("li", parent=styles["body"], leftIndent=14,
                                   bulletIndent=4, spaceAfter=3)
    styles["quote"] = ParagraphStyle("quote", parent=styles["body"], leftIndent=12,
                                      textColor=colors.HexColor("#555"),
                                      borderColor=BORDER, fontName="Helvetica-Oblique")
    styles["code"] = ParagraphStyle("code", parent=ss["Code"], fontName="Courier",
                                     fontSize=8, leading=10.5, textColor=INK)
    styles["cell"] = ParagraphStyle("cell", parent=ss["BodyText"], fontSize=8.3,
                                     leading=11, textColor=INK)
    styles["cellh"] = ParagraphStyle("cellh", parent=styles["cell"], textColor=colors.white,
                                      fontName="Helvetica-Bold")
    return styles


# Glyphs the built-in Type-1 fonts (Helvetica/Courier) can't render -> ASCII.
GLYPHS = {
    "│": "|", "─": "-", "►": ">", "◄": "<", "┌": "+", "┐": "+", "└": "+",
    "┘": "+", "├": "+", "┤": "+", "┬": "+", "┴": "+", "┼": "+", "═": "=",
    "✅": "Si", "❌": "No", "✓": "Si", "✗": "No", "➖": "-", "🟡": "~",
    "⚠️": "!", "⚠": "!", "→": "->", "←": "<-", "•": "-", "×": "x",
}


def deglyph(text):
    for bad, good in GLYPHS.items():
        text = text.replace(bad, good)
    return text


def wrap_code(code, limit=92):
    """Soft-wrap lines longer than `limit` chars, preserving indentation.

    Breaks at the last space before the limit when possible, otherwise hard-
    breaks (for long unbroken tokens like embedded JSON strings). Continuation
    lines get the original indent + 2 spaces.
    """
    out = []
    for line in code.split("\n"):
        if len(line) <= limit:
            out.append(line)
            continue
        indent = line[:len(line) - len(line.lstrip(" "))]
        cont = indent + "  "
        cur = line
        while len(cur) > limit:
            seg = cur[:limit]
            brk = seg.rfind(" ", len(cont) + 1)
            if brk < int(limit * 0.55):  # no good space -> hard break
                brk = limit
            out.append(cur[:brk])
            cur = cont + cur[brk:].lstrip(" ")
        out.append(cur)
    return "\n".join(out)


def inline(text):
    """Convert inline markdown to reportlab mini-HTML markup."""
    text = deglyph(text)
    text = html.escape(text, quote=False)
    # inline code
    text = re.sub(r"`([^`]+)`",
                  lambda m: f'<font face="Courier" backColor="#f4f4f8">{m.group(1)}</font>',
                  text)
    # bold
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    # emoji/check normalization stays as-is (unicode handled by font fallback in escape)
    return text


def parse(md, styles):
    lines = md.split("\n")
    flow = []
    i = 0
    n = len(lines)
    first_heading = True

    while i < n:
        line = lines[i]

        # fenced code block
        if line.lstrip().startswith("```"):
            i += 1
            buf = []
            while i < n and not lines[i].lstrip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1  # skip closing fence
            # Soft-wrap long lines so they don't run off the page; keep the
            # monospace code look (Preformatted can't wrap on its own).
            code = wrap_code(deglyph("\n".join(buf)))
            tbl = Table([[Preformatted(code, styles["code"])]], colWidths=[170 * mm])
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            flow.append(tbl)
            flow.append(Spacer(1, 6))
            continue

        # table block
        if "|" in line and i + 1 < n and re.match(r"^\s*\|?[\s:\-|]+\|?\s*$", lines[i + 1]):
            tbl_lines = []
            while i < n and "|" in lines[i] and lines[i].strip():
                tbl_lines.append(lines[i])
                i += 1
            flow.append(make_table(tbl_lines, styles))
            flow.append(Spacer(1, 8))
            continue

        stripped = line.strip()

        # horizontal rule
        if re.match(r"^---+$", stripped):
            flow.append(Spacer(1, 4))
            flow.append(HRFlowable(width="100%", thickness=0.6, color=BORDER,
                                   spaceBefore=2, spaceAfter=6))
            i += 1
            continue

        # headings
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            txt = inline(m.group(2))
            if level == 1 and first_heading:
                flow.append(Paragraph(txt, styles["title"]))
                first_heading = False
            else:
                key = f"h{min(level, 4)}"
                flow.append(Paragraph(txt, styles[key]))
            i += 1
            continue

        # blockquote
        if stripped.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip()[1:].strip())
                i += 1
            flow.append(Paragraph(inline(" ".join(buf)), styles["quote"]))
            flow.append(Spacer(1, 4))
            continue

        # list
        if re.match(r"^[-*]\s+", stripped):
            while i < n and re.match(r"^[-*]\s+", lines[i].strip()):
                item = re.sub(r"^[-*]\s+", "", lines[i].strip())
                flow.append(Paragraph(inline(item), styles["li"], bulletText="•"))
                i += 1
            flow.append(Spacer(1, 4))
            continue

        # blank
        if not stripped:
            i += 1
            continue

        # paragraph (gather until blank / block boundary)
        buf = [stripped]
        i += 1
        while i < n and lines[i].strip() and not re.match(r"^(#{1,6}\s|```|>|[-*]\s|---+$)", lines[i].strip()) and "|" not in lines[i]:
            buf.append(lines[i].strip())
            i += 1
        flow.append(Paragraph(inline(" ".join(buf)), styles["body"]))

    return flow


def split_row(row):
    row = row.strip()
    if row.startswith("|"):
        row = row[1:]
    if row.endswith("|"):
        row = row[:-1]
    # split on unescaped pipes
    return [c.strip() for c in re.split(r"(?<!\\)\|", row)]


def make_table(tbl_lines, styles):
    header = split_row(tbl_lines[0])
    body = [split_row(r) for r in tbl_lines[2:]]
    ncol = len(header)

    data = [[Paragraph(inline(c), styles["cellh"]) for c in header]]
    for r in body:
        # pad/truncate to header width
        r = (r + [""] * ncol)[:ncol]
        data.append([Paragraph(inline(c), styles["cell"]) for c in r])

    total = 170 * mm
    col_w = [total / ncol] * ncol
    tbl = Table(data, colWidths=col_w, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for idx in range(1, len(data)):
        if idx % 2 == 0:
            style.append(("BACKGROUND", (0, idx), (-1, idx), ROW_ALT))
    tbl.setStyle(TableStyle(style))
    return tbl


def main():
    src, out = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f:
        md = f.read()
    styles = build_styles()
    flow = parse(md, styles)
    doc = SimpleDocTemplate(out, pagesize=A4,
                            leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm,
                            title="Analytics SDK — Especificación para backend")
    doc.build(flow)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
