import json
import os
import re
import shutil
import zipfile
from datetime import datetime, date, timedelta
from collections import Counter, defaultdict
from xml.sax.saxutils import escape

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data.json")
OUTPUT_DOCX = os.path.join(BASE_DIR, "Waybill_QA_Dashboard_Comprehensive_Documentation.docx")
DOWNLOADS_DOCX = os.path.join(os.path.expanduser("~"), "Downloads", "Waybill_QA_Dashboard_Comprehensive_Documentation.docx")


def classify_document_involved(remarks):
    if not remarks:
        return "Not Specified"
    txt = remarks.lower().strip()
    docs = []
    if (
        "mdc" in txt
        or "diff sign" in txt
        or "different sign" in txt
        or "diff. sign" in txt
        or "diff sigin" in txt
        or "diff sig" in txt
        or "dif sign" in txt
    ):
        docs.append("MDC")
    if re.search(r"\brc\b", txt) or "received copy" in txt or "receiving copy" in txt or "rc copy" in txt:
        docs.append("RC")
    if "loa" in txt:
        docs.append("LOA")
    if (
        re.search(r"\bid\b", txt)
        or "valid id" in txt
        or "ids" in txt
        or "blurred if" in txt
        or "no id" in txt
        or "inverted id" in txt
        or "improper id" in txt
    ):
        docs.append("ID")
    if not docs:
        if "cert" in txt:
            return "Cert"
        return "Other"
    return ", ".join(docs)


def classify_defect_issue(issue_text):
    s = (issue_text or "").lower()
    if "no " in s or "missing" in s or "without" in s:
        return "Missing Document"
    if "diff sign" in s or "signature" in s or "sign" in s:
        return "Signature Discrepancy"
    if "improper" in s or "inverted" in s or "crop" in s or "orientation" in s:
        return "Improper / Orientation"
    if "blur" in s or "unreadable" in s or "not clear" in s or "dark" in s:
        return "Blurred / Low Quality"
    return "Other Defect"


def parse_record_date(r):
    s = r.get("initial_val_date") or r.get("date", "")
    if not s or "/" not in s:
        return None
    p = s.split("/")
    try:
        return date(int(p[2]), int(p[0]), int(p[1]))
    except Exception:
        return None


def get_sat_fri_range(d):
    days_since_sat = (d.weekday() - 5) % 7
    sat = d - timedelta(days=days_since_sat)
    fri = sat + timedelta(days=6)
    return sat, fri


class DocxBuilder:
    """Clean OpenXML Word (.docx) builder with full styling, tables, colors, and editable sections."""

    def __init__(self):
        self.body_elements = []

    def add_title_banner(self, badge_text, title_text, subtitle_text, meta_lines):
        # Single-cell shaded table for a modern corporate banner
        rows_xml = []
        cell_p = []
        cell_p.append(
            f'<w:p><w:pPr><w:spacing w:before="40" w:after="60"/></w:pPr>'
            f'<w:r><w:rPr><w:b/><w:color w:val="CCFBF1"/><w:sz w:val="18"/></w:rPr>'
            f'<w:t>{escape(badge_text)}</w:t></w:r></w:p>'
        )
        cell_p.append(
            f'<w:p><w:pPr><w:spacing w:before="20" w:after="60"/></w:pPr>'
            f'<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="34"/></w:rPr>'
            f'<w:t>{escape(title_text)}</w:t></w:r></w:p>'
        )
        cell_p.append(
            f'<w:p><w:pPr><w:spacing w:before="20" w:after="80"/></w:pPr>'
            f'<w:r><w:rPr><w:color w:val="E0F2FE"/><w:sz w:val="20"/></w:rPr>'
            f'<w:t>{escape(subtitle_text)}</w:t></w:r></w:p>'
        )
        for line in meta_lines:
            cell_p.append(
                f'<w:p><w:pPr><w:spacing w:before="10" w:after="20"/></w:pPr>'
                f'<w:r><w:rPr><w:color w:val="CCFBF1"/><w:sz w:val="18"/></w:rPr>'
                f'<w:t>{escape(line)}</w:t></w:r></w:p>'
            )

        tbl_xml = f"""
        <w:tbl>
            <w:tblPr>
                <w:tblW w:w="5000" w:type="pct"/>
                <w:tblBorders>
                    <w:top w:val="single" w:sz="8" w:space="0" w:color="0F766E"/>
                    <w:left w:val="single" w:sz="8" w:space="0" w:color="0F766E"/>
                    <w:bottom w:val="single" w:sz="8" w:space="0" w:color="0F766E"/>
                    <w:right w:val="single" w:sz="8" w:space="0" w:color="0F766E"/>
                </w:tblBorders>
                <w:tblCellMar>
                    <w:top w:w="180" w:type="dxa"/>
                    <w:left w:w="220" w:type="dxa"/>
                    <w:bottom w:w="180" w:type="dxa"/>
                    <w:right w:w="220" w:type="dxa"/>
                </w:tblCellMar>
            </w:tblPr>
            <w:tr>
                <w:tc>
                    <w:tcPr>
                        <w:tcW w:w="5000" w:type="pct"/>
                        <w:shd w:val="clear" w:color="auto" w:fill="0F766E"/>
                    </w:tcPr>
                    {''.join(cell_p)}
                </w:tc>
            </w:tr>
        </w:tbl>
        <w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr></w:p>
        """
        self.body_elements.append(tbl_xml)

    def add_heading(self, text, level=1):
        if level == 1:
            sz = "28"
            color = "0F766E"
            before = "240"
            after = "100"
            border = '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="0F766E"/></w:pBdr>'
        elif level == 2:
            sz = "23"
            color = "1E3A8A"
            before = "180"
            after = "80"
            border = ""
        else:
            sz = "20"
            color = "334155"
            before = "120"
            after = "60"
            border = ""

        p_xml = f"""
        <w:p>
            <w:pPr>
                <w:keepNext/>
                <w:spacing w:before="{before}" w:after="{after}"/>
                {border}
            </w:pPr>
            <w:r>
                <w:rPr>
                    <w:b/>
                    <w:color w:val="{color}"/>
                    <w:sz w:val="{sz}"/>
                </w:rPr>
                <w:t>{escape(text)}</w:t>
            </w:r>
        </w:p>
        """
        self.body_elements.append(p_xml)

    def add_paragraph(self, text, bold_prefix=None, italic=False, color="1E293B", sz="20"):
        runs = []
        if bold_prefix:
            runs.append(
                f'<w:r><w:rPr><w:b/><w:color w:val="0F172A"/><w:sz w:val="{sz}"/></w:rPr>'
                f'<w:t xml:space="preserve">{escape(bold_prefix)}</w:t></w:r>'
            )
        i_tag = "<w:i/>" if italic else ""
        runs.append(
            f'<w:r><w:rPr>{i_tag}<w:color w:val="{color}"/><w:sz w:val="{sz}"/></w:rPr>'
            f'<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'
        )
        p_xml = f"""
        <w:p>
            <w:pPr><w:spacing w:before="40" w:after="80" w:line="276" w:lineRule="auto"/></w:pPr>
            {''.join(runs)}
        </w:p>
        """
        self.body_elements.append(p_xml)

    def add_bullet(self, bold_label, text, sz="20"):
        p_xml = f"""
        <w:p>
            <w:pPr>
                <w:ind w:left="360" w:hanging="200"/>
                <w:spacing w:before="30" w:after="50" w:line="260" w:lineRule="auto"/>
            </w:pPr>
            <w:r><w:rPr><w:b/><w:color w:val="0F766E"/><w:sz w:val="{sz}"/></w:rPr><w:t xml:space="preserve">•  </w:t></w:r>
            <w:r><w:rPr><w:b/><w:color w:val="0F172A"/><w:sz w:val="{sz}"/></w:rPr><w:t xml:space="preserve">{escape(bold_label)} </w:t></w:r>
            <w:r><w:rPr><w:color w:val="334155"/><w:sz w:val="{sz}"/></w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r>
        </w:p>
        """
        self.body_elements.append(p_xml)

    def add_table(self, headers, rows, col_aligns=None, highlight_last_row=False, header_fill="0F766E"):
        num_cols = len(headers)
        if not col_aligns:
            col_aligns = ["left"] * num_cols

        # Build header row
        th_cells = []
        for idx, h in enumerate(headers):
            align = col_aligns[idx] if idx < len(col_aligns) else "left"
            th_cells.append(
                f"""
                <w:tc>
                    <w:tcPr>
                        <w:shd w:val="clear" w:color="auto" w:fill="{header_fill}"/>
                        <w:vAlign w:val="center"/>
                    </w:tcPr>
                    <w:p>
                        <w:pPr><w:jc w:val="{align}"/><w:spacing w:before="40" w:after="40"/></w:pPr>
                        <w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="18"/></w:rPr><w:t>{escape(str(h))}</w:t></w:r>
                    </w:p>
                </w:tc>
                """
            )
        tr_list = [f"<w:tr><w:trPr><w:tblHeader/></w:trPr>{''.join(th_cells)}</w:tr>"]

        # Build data rows
        for r_idx, row in enumerate(rows):
            is_last = highlight_last_row and (r_idx == len(rows) - 1)
            if is_last:
                bg_fill = "CCFBF1"
                txt_color = "0F766E"
            else:
                bg_fill = "F8FAFC" if (r_idx % 2 == 1) else "FFFFFF"
                txt_color = "1E293B"

            td_cells = []
            for c_idx, val in enumerate(row):
                align = col_aligns[c_idx] if c_idx < len(col_aligns) else "left"
                is_bold = is_last or (c_idx == 0)
                b_tag = "<w:b/>" if is_bold else ""
                td_cells.append(
                    f"""
                    <w:tc>
                        <w:tcPr>
                            <w:shd w:val="clear" w:color="auto" w:fill="{bg_fill}"/>
                            <w:vAlign w:val="center"/>
                        </w:tcPr>
                        <w:p>
                            <w:pPr><w:jc w:val="{align}"/><w:spacing w:before="30" w:after="30"/></w:pPr>
                            <w:r><w:rPr>{b_tag}<w:color w:val="{txt_color}"/><w:sz w:val="18"/></w:rPr><w:t>{escape(str(val))}</w:t></w:r>
                        </w:p>
                    </w:tc>
                    """
                )
            tr_list.append(f"<w:tr>{''.join(td_cells)}</w:tr>")

        tbl_xml = f"""
        <w:tbl>
            <w:tblPr>
                <w:tblW w:w="5000" w:type="pct"/>
                <w:tblBorders>
                    <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
                    <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
                    <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
                    <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
                    <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
                    <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
                </w:tblBorders>
                <w:tblCellMar>
                    <w:top w:w="70" w:type="dxa"/>
                    <w:left w:w="110" w:type="dxa"/>
                    <w:bottom w:w="70" w:type="dxa"/>
                    <w:right w:w="110" w:type="dxa"/>
                </w:tblCellMar>
            </w:tblPr>
            {''.join(tr_list)}
        </w:tbl>
        <w:p><w:pPr><w:spacing w:before="40" w:after="80"/></w:pPr></w:p>
        """
        self.body_elements.append(tbl_xml)

    def add_page_break(self):
        self.body_elements.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

    def save(self, filepath):
        content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"""

        rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

        doc_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

        styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:docDefaults>
        <w:rPrDefault>
            <w:rPr>
                <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
                <w:sz w:val="20"/>
                <w:color w:val="1E293B"/>
            </w:rPr>
        </w:rPrDefault>
    </w:docDefaults>
</w:styles>"""

        document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
        {''.join(self.body_elements)}
        <w:sectPr>
            <w:pgSz w:w="12240" w:h="15840"/>
            <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>
        </w:sectPr>
    </w:body>
</w:document>"""

        with zipfile.ZipFile(filepath, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", content_types)
            zf.writestr("_rels/.rels", rels)
            zf.writestr("word/_rels/document.xml.rels", doc_rels)
            zf.writestr("word/styles.xml", styles_xml)
            zf.writestr("word/document.xml", document_xml)


def generate_comprehensive_word_doc():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    data = [r for r in raw_data if re.match(r"^\d{8,}$", r.get("waybill_no", "").strip())]
    total_waybills = len(data)

    # Enrich records with RTH classifications
    for r in data:
        rem = r.get("qa_initial_remarks", "")
        r["document_involved"] = classify_document_involved(rem) if r.get("qa_initial_status") == "Invalid" else ""
        r["document_issue"] = rem.strip() if r.get("qa_initial_status") == "Invalid" else ""
        r["issue_category"] = classify_defect_issue(rem) if r.get("qa_initial_status") == "Invalid" else ""

    # Overall KPIs
    init_valid = sum(1 for r in data if r.get("qa_initial_status") == "Valid")
    init_invalid = sum(1 for r in data if r.get("qa_initial_status") == "Invalid")
    init_evaluated = init_valid + init_invalid
    init_pending = total_waybills - init_evaluated

    disp_done = sum(1 for r in data if r.get("dispatch_status") == "Override Done")
    disp_pending = sum(1 for r in data if r.get("dispatch_status") == "Pending")
    disp_no_action = sum(1 for r in data if r.get("dispatch_status") not in ("Override Done", "Pending"))

    final_valid = sum(1 for r in data if r.get("final_val_status") == "Valid")
    final_invalid = sum(1 for r in data if r.get("final_val_status") == "Invalid")
    final_evaluated = final_valid + final_invalid

    doc = DocxBuilder()

    gen_str = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    doc.add_title_banner(
        "1LIFE INC. PHILIPPINES • QA – DATA AND ANALYTICS TEAM",
        "WAYBILL QA & DISPATCH OPERATIONAL DASHBOARD",
        "Comprehensive System Documentation, Live Operational Metrics & RTH Defect Analysis Report",
        [
            f"Generated Date: {gen_str}  |  Live Dataset Scope: {total_waybills:,} Registered Waybills",
            "Live Website URL: https://waybillsdashboard.netlify.app",
            "Google Sheets Source ID: 1l_WgHYJnoFJ4MrOpr6NtCwamwo-_cwdgoIb7tZ1Z-7A (Tab: Waybill Record, GID: 1857013672)",
        ],
    )

    # =========================================================================
    # SECTION 1: EXECUTIVE SUMMARY & SYSTEM ARCHITECTURE
    # =========================================================================
    doc.add_heading("1. Executive Overview & Live System Architecture", level=1)
    doc.add_paragraph(
        "The Waybill QA & Dispatch Operational Dashboard is an end-to-end quality management, audit monitoring, "
        "and analytics platform built for 1Life Inc. Philippines (QA – Data and Analytics Team). It tracks the complete "
        "validation lifecycle of delivery waybills across Initial Quality Assurance (QA), Return-To-Hub (RTH) Document "
        "Defect Classification, Dispatch Override Resolution, and Final QA Re-validation."
    )

    doc.add_heading("1.1 Deployment & Data Synchronization Details", level=2)
    doc.add_bullet("Live Production Website:", "https://waybillsdashboard.netlify.app")
    doc.add_bullet("GitHub Repository:", "https://github.com/arabella04/waybill-qa-dashboard.git (main branch)")
    doc.add_bullet("Local Workspace Path:", r"C:\Users\1 Life\.gemini\antigravity\scratch\waybill-qa-dashboard")
    doc.add_bullet(
        "Live Google Spreadsheet Source:",
        "https://docs.google.com/spreadsheets/d/1l_WgHYJnoFJ4MrOpr6NtCwamwo-_cwdgoIb7tZ1Z-7A/edit?usp=sharing",
    )
    doc.add_bullet(
        "Hybrid Instant-Load + Live Auto-Sync Engine:",
        f"Renders the pre-bundled baseline snapshot ({total_waybills:,} records) in under 0.5 seconds on initial page open, "
        "then automatically connects in the background (150ms after paint and every 60 seconds via Auto-Sync) to Google Sheets' "
        "CORS CSV export using a custom RFC-4180 parser so new spreadsheet rows appear live without delay.",
    )

    # =========================================================================
    # SECTION 2: MASTER OPERATIONAL KPI SUMMARY & PIPELINE
    # =========================================================================
    doc.add_heading("2. Master Operational KPI Summary & Lifecycle Pipeline", level=1)
    doc.add_paragraph(
        f"Across all validation dates in the live Google Spreadsheet, a total of {total_waybills:,} valid waybills "
        f"(8+ digit waybill numbers) have been logged and monitored across the 5-stage operational workflow."
    )

    kpi_rows = [
        ["1. Total Registered Waybills (Intake)", f"{total_waybills:,}", "100.0%", "All logged waybill records across all dates"],
        [
            "2. Initial QA Validated (Total Evaluated)",
            f"{init_evaluated:,}",
            f"{(init_evaluated / total_waybills * 100):.1f}%",
            "Waybills completed in Stage 2 Initial QA evaluation",
        ],
        [
            "   • Initial QA Valid (Passed)",
            f"{init_valid:,}",
            f"{(init_valid / total_waybills * 100):.1f}%",
            f"{(init_valid / max(init_evaluated, 1) * 100):.1f}% of evaluated initial waybills",
        ],
        [
            "   • Initial QA Invalid (RTH Flagged Defects)",
            f"{init_invalid:,}",
            f"{(init_invalid / total_waybills * 100):.1f}%",
            f"{(init_invalid / max(init_evaluated, 1) * 100):.1f}% of evaluated initial waybills escalated to RTH/Dispatch",
        ],
        [
            "   • Awaiting Initial QA (For Validation)",
            f"{init_pending:,}",
            f"{(init_pending / total_waybills * 100):.1f}%",
            "Pending initial review by QA Specialists",
        ],
        [
            "3. Dispatch Overrides Completed (Override Done)",
            f"{disp_done:,}",
            f"{(disp_done / max(init_invalid, 1) * 100):.1f}% of Invalids",
            "Invalid waybills resolved and overridden by Dispatch Team",
        ],
        [
            "   • Dispatch Pending Review",
            f"{disp_pending:,}",
            f"{(disp_pending / max(init_invalid, 1) * 100):.1f}% of Invalids",
            "Flagged waybills currently in Dispatch resolution queue",
        ],
        [
            "4. Final QA Re-Validated (Total Final Signed)",
            f"{final_evaluated:,}",
            f"{(final_evaluated / total_waybills * 100):.1f}%",
            "Secondary verification after Dispatch intervention",
        ],
        [
            "   • Final QA Valid (Approved)",
            f"{final_valid:,}",
            f"{(final_valid / max(final_evaluated, 1) * 100):.1f}% of Final",
            "Confirmed compliant upon Final QA sign-off",
        ],
        [
            "   • Final QA Invalid (Rejected)",
            f"{final_invalid:,}",
            f"{(final_invalid / max(final_evaluated, 1) * 100):.1f}% of Final",
            "Requires secondary correction or re-upload",
        ],
    ]
    doc.add_table(
        ["Operational Metric / Lifecycle Stage", "Waybill Count", "% Share / Rate", "Operational Description"],
        kpi_rows,
        col_aligns=["left", "right", "right", "left"],
    )

    # =========================================================================
    # SECTION 3: QA SPECIALIST & DISPATCH TEAM ACCOMPLISHMENT
    # =========================================================================
    doc.add_heading("3. QA Specialist & Dispatch Team Performance Breakdown", level=1)
    doc.add_heading("3.1 QA Specialists Productivity & Accuracy Matrix", level=2)

    qas = sorted(
        set(r.get("initial_validated_by", "").strip() for r in data if r.get("initial_validated_by", "").strip())
        | set(r.get("final_validated_by", "").strip() for r in data if r.get("final_validated_by", "").strip())
    )
    qa_rows = []
    tot_i_eval = tot_i_val = tot_i_inv = tot_f_eval = tot_f_val = tot_f_inv = 0
    for name in qas:
        i_recs = [r for r in data if r.get("initial_validated_by", "").strip() == name]
        i_val = sum(1 for r in i_recs if r.get("qa_initial_status") == "Valid")
        i_inv = sum(1 for r in i_recs if r.get("qa_initial_status") == "Invalid")
        i_eval = i_val + i_inv

        f_recs = [r for r in data if r.get("final_validated_by", "").strip() == name]
        f_val = sum(1 for r in f_recs if r.get("final_val_status") == "Valid")
        f_inv = sum(1 for r in f_recs if r.get("final_val_status") == "Invalid")
        f_eval = f_val + f_inv

        combined = i_eval + f_eval
        pass_rate = f"{(i_val / max(i_eval, 1) * 100):.1f}%"

        tot_i_eval += i_eval
        tot_i_val += i_val
        tot_i_inv += i_inv
        tot_f_eval += f_eval
        tot_f_val += f_val
        tot_f_inv += f_inv

        qa_rows.append([
            name,
            f"{i_eval:,}",
            f"{i_val:,}",
            f"{i_inv:,}",
            pass_rate,
            f"{f_eval:,}",
            f"{f_val:,}",
            f"{f_inv:,}",
            f"{combined:,}",
        ])

    qa_rows.append([
        "TOTAL (All QA Specialists)",
        f"{tot_i_eval:,}",
        f"{tot_i_val:,}",
        f"{tot_i_inv:,}",
        f"{(tot_i_val / max(tot_i_eval, 1) * 100):.1f}%",
        f"{tot_f_eval:,}",
        f"{tot_f_val:,}",
        f"{tot_f_inv:,}",
        f"{(tot_i_eval + tot_f_eval):,}",
    ])

    doc.add_table(
        [
            "QA Specialist",
            "Initial Evaluated",
            "Initial Valid",
            "Initial Invalid",
            "Initial Valid %",
            "Final Evaluated",
            "Final Valid",
            "Final Invalid",
            "Combined Output",
        ],
        qa_rows,
        col_aligns=["left", "right", "right", "right", "right", "right", "right", "right", "right"],
        highlight_last_row=True,
        header_fill="1E3A8A",
    )

    doc.add_heading("3.2 Dispatch Specialists Override & Resolution Matrix", level=2)
    disps = sorted(set(r.get("overridden_by", "").strip() for r in data if r.get("overridden_by", "").strip()))
    disp_rows = []
    tot_d_act = tot_d_done = tot_d_pend = tot_d_na = 0
    for name in disps:
        d_recs = [r for r in data if r.get("overridden_by", "").strip() == name]
        act = len(d_recs)
        done = sum(1 for r in d_recs if r.get("dispatch_status") == "Override Done")
        pend = sum(1 for r in d_recs if r.get("dispatch_status") == "Pending")
        na = act - done - pend
        tot_d_act += act
        tot_d_done += done
        tot_d_pend += pend
        tot_d_na += na
        disp_rows.append([
            name,
            f"{act:,}",
            f"{done:,}",
            f"{pend:,}",
            f"{na:,}",
            f"{(done / max(act, 1) * 100):.1f}%",
        ])
    disp_rows.append([
        "TOTAL (Dispatch Team Assigned)",
        f"{tot_d_act:,}",
        f"{tot_d_done:,}",
        f"{tot_d_pend:,}",
        f"{tot_d_na:,}",
        f"{(tot_d_done / max(tot_d_act, 1) * 100):.1f}%",
    ])
    doc.add_table(
        ["Dispatch Specialist", "Total Assigned", "Override Done", "Pending Review", "No Action", "Resolution Rate %"],
        disp_rows,
        col_aligns=["left", "right", "right", "right", "right", "right"],
        highlight_last_row=True,
        header_fill="1E3A8A",
    )

    # =========================================================================
    # SECTION 4: RTH (RETURN TO HUB) INVALID DOCUMENTS & RIDER DEFECT ANALYSIS
    # =========================================================================
    doc.add_page_break()
    doc.add_heading("4. RTH (Return-To-Hub) Invalid Documents & Rider Defect Analysis", level=1)
    invalid_records = [r for r in data if r.get("qa_initial_status") == "Invalid"]
    total_invalids = len(invalid_records)

    doc.add_paragraph(
        f"The RTH Defect Report module tracks all {total_invalids:,} flagged invalid waybills "
        f"({(total_invalids / total_waybills * 100):.1f}% of all {total_waybills:,} waybills). "
        "It classifies every QA remark into specific documents involved (ID, MDC = Medicine Consent Form, "
        "RC = Received Copy, LOA = Letter of Authorization) and defect categories, and ranks all 58 active riders."
    )

    # 4.1 Invalid Documents Distribution
    doc.add_heading("4.1 Invalid Documents Distribution (ID, MDC, RC, LOA)", level=2)
    doc_counts = {"ID": 0, "MDC": 0, "RC": 0, "LOA": 0, "Other": 0}
    for r in invalid_records:
        d = r.get("document_involved", "")
        matched = False
        for k in ("ID", "MDC", "RC", "LOA"):
            if k in d:
                doc_counts[k] += 1
                matched = True
        if not matched:
            doc_counts["Other"] += 1

    doc_meta = [
        ("ID", "ID (Valid ID / Identification)", "Improper ID, missing ID, blurred ID, inverted orientation"),
        ("MDC", "MDC (Medicine Consent Form)", "Different signature in MDC ('diff sign'), missing MDC, unverified consent"),
        ("RC", "RC (Received / Receiving Copy)", "Missing RC copy, blurred RC, missing recipient signature on RC"),
        ("LOA", "LOA (Letter of Authorization)", "Missing LOA for representative, expired LOA, blurred LOA"),
        ("Other", "Other / Unspecified Defects", "System/delivery discrepancies, unclassified QA remarks"),
    ]
    doc_rows = []
    tot_doc_mentions = sum(doc_counts.values())
    for code, label, desc in doc_meta:
        cnt = doc_counts[code]
        doc_rows.append([
            label,
            f"{cnt:,}",
            f"{(cnt / max(total_invalids, 1) * 100):.1f}%",
            desc,
        ])
    doc_rows.append([
        "Total Document Mentions (Includes Multi-Document Waybills)",
        f"{tot_doc_mentions:,}",
        f"{(tot_doc_mentions / max(total_invalids, 1) * 100):.1f}%",
        f"Across {total_invalids:,} unique invalid waybills",
    ])
    doc.add_table(
        ["Document Involved", "Invalid Count", "% of Invalids", "Primary Issues Detected"],
        doc_rows,
        col_aligns=["left", "right", "right", "left"],
        highlight_last_row=True,
    )

    # 4.2 Defect Issue Category Breakdown
    doc.add_heading("4.2 Defect Issue Category Breakdown", level=2)
    cat_counter = Counter(r.get("issue_category", "Other Defect") for r in invalid_records)
    cat_actions = {
        "Missing Document": "Mandatory rider pre-departure document upload checklist",
        "Improper / Orientation": "Camera framing, orientation, and full-page capture training",
        "Signature Discrepancy": "Strict patient/representative signature verification on MDC & RC",
        "Other Defect": "Dispatch supervisor review and exception handling",
        "Blurred / Low Quality": "Retake photo under proper lighting before leaving delivery point",
    }
    cat_rows = []
    for cat, cnt in cat_counter.most_common():
        cat_rows.append([
            cat,
            f"{cnt:,}",
            f"{(cnt / max(total_invalids, 1) * 100):.1f}%",
            cat_actions.get(cat, "Standard QA & Dispatch review"),
        ])
    cat_rows.append([
        "TOTAL FLAGGED DEFECT WAYBILLS",
        f"{total_invalids:,}",
        "100.0%",
        "All invalid waybills across master dataset",
    ])
    doc.add_table(
        ["Defect Issue Category", "Waybill Count", "% Share", "Recommended Operational Action"],
        cat_rows,
        col_aligns=["left", "right", "right", "left"],
        highlight_last_row=True,
    )

    # 4.3 Weekly Monitoring Cycles (Saturday - Friday)
    doc.add_heading("4.3 Weekly Monitoring Cycles (Saturday-to-Friday Schedule)", level=2)
    week_assigned = Counter()
    week_invalids = Counter()
    week_labels = {}
    for r in data:
        d = parse_record_date(r)
        if d:
            sat, fri = get_sat_fri_range(d)
            key = (sat, fri)
            week_assigned[key] += 1
            if r.get("qa_initial_status") == "Invalid":
                week_invalids[key] += 1
            week_labels[key] = f"{sat.strftime('%b %d, %Y')} – {fri.strftime('%b %d, %Y')}"

    week_rows = []
    for idx, key in enumerate(sorted(week_assigned.keys(), reverse=True)):
        asgn = week_assigned[key]
        inv = week_invalids[key]
        tag = " (Latest Cycle)" if idx == 0 else ""
        week_rows.append([
            f"{week_labels[key]}{tag}",
            f"{asgn:,}",
            f"{inv:,}",
            f"{(inv / max(asgn, 1) * 100):.1f}%",
            f"{(inv / max(total_invalids, 1) * 100):.1f}%",
        ])
    week_rows.append([
        "TOTAL (All Weekly Cycles)",
        f"{total_waybills:,}",
        f"{total_invalids:,}",
        f"{(total_invalids / max(total_waybills, 1) * 100):.1f}%",
        "100.0%",
    ])
    doc.add_table(
        ["Weekly Cycle (Saturday – Friday)", "Assigned Waybills", "Invalid Waybills", "Cycle Defect Rate %", "% of All Invalids"],
        week_rows,
        col_aligns=["left", "right", "right", "right", "right"],
        highlight_last_row=True,
    )

    # 4.4 Top 10 Riders & Complete 58 Riders Ranking Table
    doc.add_heading("4.4 Top 10 Riders with Highest Invalid Waybills", level=2)
    assigned_by_rider = Counter((r.get("rider") or "Unknown Rider").strip() for r in data)
    invalid_by_rider = Counter((r.get("rider") or "Unknown Rider").strip() for r in invalid_records)
    rider_docs = defaultdict(lambda: {"ID": 0, "MDC": 0, "RC": 0, "LOA": 0})

    for r in invalid_records:
        rname = (r.get("rider") or "Unknown Rider").strip()
        d = r.get("document_involved", "")
        for k in ("ID", "MDC", "RC", "LOA"):
            if k in d:
                rider_docs[rname][k] += 1

    all_riders_ranked = invalid_by_rider.most_common()
    top10_rows = []
    for idx, (rname, inv_cnt) in enumerate(all_riders_ranked[:10], 1):
        asgn = assigned_by_rider.get(rname, inv_cnt)
        rd = rider_docs[rname]
        top10_rows.append([
            f"#{idx}",
            rname,
            f"{asgn:,}",
            f"{inv_cnt:,}",
            f"{(inv_cnt / max(asgn, 1) * 100):.1f}%",
            f"{(inv_cnt / max(total_invalids, 1) * 100):.1f}%",
            f"ID: {rd['ID']} | MDC: {rd['MDC']} | RC: {rd['RC']} | LOA: {rd['LOA']}",
        ])
    doc.add_table(
        [
            "Rank",
            "Rider Name",
            "# Assigned",
            "Total Invalids",
            "Rider Defect %",
            "% Share of All Invalids",
            "Document Breakdown (ID / MDC / RC / LOA)",
        ],
        top10_rows,
        col_aligns=["center", "left", "right", "right", "right", "right", "left"],
    )

    doc.add_page_break()
    doc.add_heading(f"4.5 Complete All {len(all_riders_ranked)} Active Riders Defect Summary & Rankings", level=2)
    doc.add_paragraph(
        f"Complete ranking of all {len(all_riders_ranked)} riders with assigned waybills, invalid counts, "
        "percentage share, and individual document defect counts (ID, MDC, RC, LOA), concluding with the master TOTAL row."
    )

    all_rider_rows = []
    sum_id = sum_mdc = sum_rc = sum_loa = 0
    for idx, (rname, inv_cnt) in enumerate(all_riders_ranked, 1):
        asgn = assigned_by_rider.get(rname, inv_cnt)
        rd = rider_docs[rname]
        sum_id += rd["ID"]
        sum_mdc += rd["MDC"]
        sum_rc += rd["RC"]
        sum_loa += rd["LOA"]
        all_rider_rows.append([
            str(idx),
            rname,
            f"{asgn:,}",
            f"{inv_cnt:,}",
            f"{(inv_cnt / max(total_invalids, 1) * 100):.1f}%",
            f"{rd['ID']:,}",
            f"{rd['MDC']:,}",
            f"{rd['RC']:,}",
            f"{rd['LOA']:,}",
        ])

    all_rider_rows.append([
        "-",
        f"TOTAL (All {len(all_riders_ranked)} Riders)",
        f"{total_waybills:,}",
        f"{total_invalids:,}",
        "100.0%",
        f"{sum_id:,}",
        f"{sum_mdc:,}",
        f"{sum_rc:,}",
        f"{sum_loa:,}",
    ])

    doc.add_table(
        [
            "Rank",
            "Rider Name",
            "# Assigned",
            "Total Invalids",
            "% Share",
            "ID Defects",
            "MDC Defects",
            "RC Defects",
            "LOA Defects",
        ],
        all_rider_rows,
        col_aligns=["center", "left", "right", "right", "right", "right", "right", "right", "right"],
        highlight_last_row=True,
    )

    # =========================================================================
    # SECTION 5: DASHBOARD MODULES & EXPORT ENGINES GUIDE
    # =========================================================================
    doc.add_page_break()
    doc.add_heading("5. Complete Guide to Dashboard Modules & Export Engines", level=1)
    doc.add_paragraph(
        "The web application is organized into 7 interactive operational modules plus 4 specialized export engines:"
    )

    modules_rows = [
        [
            "1. Overview & Trends (#overview)",
            "Executive KPI cards, 5-stage operational lifecycle funnel, daily volume bar/line chart, Initial vs. Final QA status breakdown, Dispatch override resolution chart, and top invalidation reasons.",
        ],
        [
            "2. QA Performance Report (#qa-report)",
            "Interactive multi-line specialist trend graph (Daily / Weekly / Monthly grouping; Total / Initial / Final metrics) and individual QA Specialist accomplishment cards and tables.",
        ],
        [
            "3. Dispatch Team Report (#dispatch-report)",
            "Dispatch specialist multi-line resolution trend graph, Override Done vs. Pending tracking, and per-dispatcher productivity breakdown.",
        ],
        [
            "4. Waybills Explorer (#waybills)",
            f"Searchable, sortable, paginated master table covering all {total_waybills:,} waybills. Clicking any row opens a Full Waybill Audit Modal with complete history.",
        ],
        [
            "5. Executive Progress Report (#progress-report)",
            "Formal 1Life Task Monitoring narrative report featuring Pipeline Architecture, Document Compliance Findings, Rider Accomplishment, Operational Challenges, Recommended Action Plan, and Daily Progress Table.",
        ],
        [
            "6. RTH Defect Report (#rth-report)",
            "Dedicated Return-To-Hub invalid documents & rider defect analytics with Saturday–Friday cycle filters, multi-date tick boxes, Figure 1.1 (Documents), Figure 1.2 (Top 10 Riders Stacked Bar), and Figure 2.1 (All 58 Riders A–Z Bar/Line Chart).",
        ],
        [
            "7. Custom Report Builder (#custom-report)",
            "Flexible custom Excel generator with 1-click presets, multi-date checkboxes, QA/Dispatch specialist filters, status filters, and customizable column checkboxes.",
        ],
    ]
    doc.add_table(
        ["Dashboard Tab / Module", "Key Features & Operational Capabilities"],
        modules_rows,
        col_aligns=["left", "left"],
        header_fill="1E3A8A",
    )

    doc.add_heading("5.1 Export & Printable Reporting Options", level=2)
    export_rows = [
        [
            "Export as PDF (.pdf) [RTH Report]",
            "Native multi-page A4 Landscape vector PDF (exportRTHPDF) with 2x High-DPI uncongested charts (Figures 1.1, 1.2, 2.1), all 58 riders summary table + TOTAL row, and paginated waybill audit records.",
        ],
        [
            "Export as Excel (.xlsx) [RTH Report]",
            "Multi-sheet 1Life styled Excel workbook (Waybill_RTH_Invalid_Documents_Report.xlsx) with embedded native openpyxl bar/line charts and filtered invalid waybill records.",
        ],
        [
            "Print / Vector PDF Preview",
            "Opens a dedicated print-optimized HTML view in a new browser tab for direct printing (Ctrl + P) or saving to PDF.",
        ],
        [
            "Download Full Progress Report (.xlsx)",
            "Complete 5-sheet operational workbook (Executive Summary, Daily Breakdown, QA Performance, Dispatch Performance, Raw Waybills).",
        ],
    ]
    doc.add_table(
        ["Export Action / Button", "Output Format & Contents"],
        export_rows,
        col_aligns=["left", "left"],
    )

    # =========================================================================
    # SECTION 6: EDITABLE MANAGEMENT NOTES & ACTION PLAN TEMPLATE
    # =========================================================================
    doc.add_heading("6. Operational Challenges & Recommended Action Plan (Editable Section)", level=1)
    doc.add_paragraph(
        "Use the editable table and notes section below to customize management observations, target KPIs, "
        "and action items for your weekly or monthly presentation."
    )

    action_rows = [
        [
            "1. High ID & MDC Defect Volume",
            f"ID ({doc_counts['ID']:,} cases) and MDC ({doc_counts['MDC']:,} cases) account for the majority of invalidations.",
            "Enforce mandatory rider photo verification and signature matching on Medicine Consent Forms (MDC) prior to hub departure.",
            "QA & Fleet Operations",
            "Ongoing / Weekly",
        ],
        [
            "2. Missing Document Submissions",
            f"Missing documents represent {cat_counter.get('Missing Document', 0):,} flagged waybills.",
            "Require complete attachment checklist (ID, MDC, RC, LOA) in rider mobile workflow before marking delivery complete.",
            "Dispatch & Rider Leads",
            "Immediate",
        ],
        [
            "3. Dispatch Override Backlog",
            f"{disp_pending:,} invalid waybills currently awaiting Dispatch override resolution.",
            "Prioritize oldest pending invalid waybills by validation date and assign daily clearance quotas per Dispatch Specialist.",
            "Dispatch Team Leads",
            "Daily Cycle",
        ],
        [
            "4. [Add Custom Challenge Here]",
            "[Enter observation or metric here]",
            "[Enter recommended corrective action here]",
            "[Owner / Team]",
            "[Target Date]",
        ],
    ]
    doc.add_table(
        ["Challenge Area", "Current Observation / Metric", "Recommended Action Plan", "Responsible Owner", "Target Timeline"],
        action_rows,
        col_aligns=["left", "left", "left", "left", "left"],
    )

    doc.add_paragraph("Additional Management Notes / Remarks:", bold_prefix="Notes: ")
    doc.add_paragraph("• [Click here to type additional executive notes, weekly highlights, or policy updates...]", italic=True, color="64748B")

    doc.save(OUTPUT_DOCX)
    print(f"Saved Word document to: {OUTPUT_DOCX}")

    try:
        os.makedirs(os.path.dirname(DOWNLOADS_DOCX), exist_ok=True)
        shutil.copyfile(OUTPUT_DOCX, DOWNLOADS_DOCX)
        print(f"Copied Word document to Downloads: {DOWNLOADS_DOCX}")
    except Exception as e:
        print(f"Could not copy to Downloads folder: {e}")


if __name__ == "__main__":
    generate_comprehensive_word_doc()
