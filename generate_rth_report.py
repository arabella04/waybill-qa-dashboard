"""
Waybill QA & Dispatch Operational Dashboard
RTH (Return To Hub) Invalid Documents & Rider Defect Analysis Report Generator
Generates an executive Excel workbook with embedded openpyxl charts, document breakdown,
and rider defect rankings.
"""

import json
import os
import re
from datetime import datetime
from collections import Counter, defaultdict
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, PieChart, LineChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.data_source import AxDataSource, StrRef, StrData, StrVal

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, 'data.json')
OUTPUT_PATH = os.path.join(BASE_DIR, 'Waybill_RTH_Invalid_Documents_Report.xlsx')

def classify_document_involved(remarks):
    """
    Extracts the document involved from QA remarks:
    - MDC: contains 'mdc', 'diff sign', 'different sign', 'diff. sign'
    - RC: contains 'rc', 'received copy', 'receiving copy'
    - LOA: contains 'loa'
    - ID: contains 'id', 'valid id', 'ids', 'blurred if' (typo for id)
    """
    if not remarks:
        return 'Not Specified'
    txt = remarks.lower().strip()
    
    docs = []
    
    # Check MDC (explicit 'mdc' or 'diff sign' / 'different sign')
    if (
        'mdc' in txt or 
        'diff sign' in txt or 
        'different sign' in txt or 
        'diff. sign' in txt or 
        'diff sigin' in txt or
        'diff sig' in txt or
        'dif sign' in txt
    ):
        docs.append('MDC')
        
    # Check RC
    if re.search(r'\brc\b', txt) or 'received copy' in txt or 'receiving copy' in txt or 'rc copy' in txt:
        docs.append('RC')
        
    # Check LOA
    if 'loa' in txt:
        docs.append('LOA')
        
    # Check ID
    if (
        re.search(r'\bid\b', txt) or 
        'valid id' in txt or 
        'ids' in txt or 
        'blurred if' in txt or
        'no id' in txt or 
        'inverted id' in txt or
        'improper id' in txt
    ):
        docs.append('ID')
        
    if not docs:
        if 'cert' in txt:
            return 'Cert'
        return 'Other'
        
    return ', '.join(docs)

def classify_issue_category(remarks):
    """Categorizes the nature of the defect for executive insights."""
    if not remarks:
        return 'Not Specified'
    txt = remarks.lower().strip()
    if 'no ' in txt or 'without' in txt or 'no mdc' in txt or 'no id' in txt or 'no rc' in txt or 'no loa' in txt:
        return 'Missing Document'
    elif 'diff sign' in txt or 'different sign' in txt or 'dif sign' in txt or 'diff sig' in txt or 'signature' in txt:
        return 'Signature Discrepancy'
    elif 'blurred' in txt or 'unreadable' in txt or 'dark' in txt:
        return 'Blurred / Low Quality'
    elif 'improper' in txt or 'inverted' in txt or 'upside' in txt or 'crop' in txt:
        return 'Improper / Orientation'
    elif 'expired' in txt:
        return 'Expired Document'
    else:
        return 'Other Defect'

def generate_report():
    print(f"Loading data from {DATA_PATH}...")
    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Filter to valid waybills with standard numeric format (digits >= 8), matching dashboard exactly
    valid_data = [r for r in data if re.match(r'^\d{8,}$', r.get('waybill_no', '').strip())]
    invalid_records = [r for r in valid_data if r.get('qa_initial_status') == 'Invalid']
    print(f"Found {len(invalid_records):,} invalid waybills out of {len(valid_data):,} total records.")

    wb = openpyxl.Workbook()

    # Corporate Blue Theme Palette
    navy_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")     # Dark Navy
    blue_header = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")   # Primary Blue
    sky_fill = PatternFill(start_color="0284C7", end_color="0284C7", fill_type="solid")      # Sky Blue
    ice_fill = PatternFill(start_color="EFF6FF", end_color="EFF6FF", fill_type="solid")      # Very Light Blue
    accent_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")   # Ice Accent
    zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")    # Soft Gray
    rose_fill = PatternFill(start_color="FFE4E6", end_color="FFE4E6", fill_type="solid")     # Soft Rose

    title_font = Font(name="Segoe UI", size=16, bold=True, color="FFFFFF")
    subtitle_font = Font(name="Segoe UI", size=10, italic=True, color="E0E7FF")
    section_font = Font(name="Segoe UI", size=12, bold=True, color="1E3A8A")
    white_header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    bold_font = Font(name="Segoe UI", size=10, bold=True, color="1E293B")
    regular_font = Font(name="Segoe UI", size=10, color="334155")
    small_font = Font(name="Segoe UI", size=9, color="64748B")
    kpi_num_font = Font(name="Segoe UI", size=18, bold=True, color="1E3A8A")

    thin_side = Side(border_style="thin", color="CBD5E1")
    thin_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    thick_bottom = Side(border_style="medium", color="1E3A8A")
    summary_border = Border(top=thin_side, bottom=thick_bottom)

    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")
    align_wrap = Alignment(horizontal="left", vertical="center", wrap_text=True)

    # Pre-calculate statistics
    doc_single_counts = Counter()
    doc_exact_counts = Counter()
    rider_counts = Counter()
    rider_docs = defaultdict(lambda: Counter())
    category_counts = Counter()

    for r in invalid_records:
        rem = r.get('qa_initial_remarks', '').strip()
        doc = classify_document_involved(rem)
        cat = classify_issue_category(rem)
        rider = r.get('rider', '').strip() or 'Unknown Rider'

        r['document_involved'] = doc
        r['document_issue'] = rem
        r['issue_category'] = cat

        doc_exact_counts[doc] += 1
        for d in doc.split(', '):
            doc_single_counts[d] += 1
            rider_docs[rider][d] += 1

        rider_counts[rider] += 1
        category_counts[cat] += 1

    # =========================================================================
    # SHEET 1: EXECUTIVE SUMMARY & CHARTS
    # =========================================================================
    ws_sum = wb.active
    ws_sum.title = "Executive Summary & Charts"
    ws_sum.views.sheetView[0].showGridLines = True

    # Title Banner
    ws_sum.merge_cells("A1:I2")
    ws_sum["A1"] = "WAYBILL RTH (RETURN TO HUB) INVALID DOCUMENTS & DEFECT ANALYSIS"
    ws_sum["A1"].font = title_font
    ws_sum["A1"].fill = navy_fill
    ws_sum["A1"].alignment = align_center

    ws_sum.merge_cells("A3:I3")
    today_str = datetime.now().strftime("%B %d, %Y")
    ws_sum["A3"] = f"Generated: {today_str} | Weekly Monitoring (Saturday to Friday Cycle) | Data Source: Google Sheets Waybill Record"
    ws_sum["A3"].font = subtitle_font
    ws_sum["A3"].fill = blue_header
    ws_sum["A3"].alignment = align_center

    # Top KPI Cards
    kpis = [
        ("TOTAL INVALID WAYBILLS", f"{len(invalid_records):,}", "Flagged with Document Defects", "A5:B5", "A6:B6", "A7:B7"),
        ("UNIQUE RIDERS AFFECTED", f"{len(rider_counts):,}", "Riders with >=1 Invalid Waybill", "C5:D5", "C6:D6", "C7:D7"),
        ("PRIMARY DEFECT DOCUMENT", f"{doc_single_counts.most_common(1)[0][0]} ({doc_single_counts.most_common(1)[0][1]:,})", f"{(doc_single_counts.most_common(1)[0][1]/len(invalid_records)*100):.1f}% of Invalids Involved", "E5:F5", "E6:F6", "E7:F7"),
        ("HIGHEST DEFECT RIDER", f"{rider_counts.most_common(1)[0][0][:20]}", f"{rider_counts.most_common(1)[0][1]} Invalid Waybills", "G5:I5", "G6:I6", "G7:I7"),
    ]

    for title, val, sub, r1, r2, r3 in kpis:
        ws_sum.merge_cells(r1)
        ws_sum.merge_cells(r2)
        ws_sum.merge_cells(r3)
        c1 = ws_sum[r1.split(':')[0]]
        c2 = ws_sum[r2.split(':')[0]]
        c3 = ws_sum[r3.split(':')[0]]

        c1.value = title
        c1.font = Font(name="Segoe UI", size=9, bold=True, color="1E3A8A")
        c1.fill = accent_fill
        c1.alignment = align_center

        c2.value = val
        c2.font = kpi_num_font
        c2.fill = ice_fill
        c2.alignment = align_center

        c3.value = sub
        c3.font = small_font
        c3.fill = ice_fill
        c3.alignment = align_center

        for rng in [r1, r2, r3]:
            for row in ws_sum[rng]:
                for cell in row:
                    cell.border = thin_border

    # Table 1: Document Involved Summary
    ws_sum["A9"] = "1. DOCUMENTS INVOLVED SUMMARY (Which documents had many invalids)"
    ws_sum["A9"].font = section_font

    doc_headers = ["Document Involved", "Invalid Count", "% of Invalids", "Primary Issue Detected"]
    for col_i, h in enumerate(doc_headers, start=1):
        cell = ws_sum.cell(row=10, column=col_i, value=h)
        cell.font = white_header_font
        cell.fill = blue_header
        cell.alignment = align_center
        cell.border = thin_border

    # Top single document impacts
    top_docs = [
        ("ID (Valid ID / Identification)", doc_single_counts.get('ID', 0), "Improper / Missing / Blurred ID"),
        ("MDC (Medical Doctors Certification)", doc_single_counts.get('MDC', 0), "Different Signature / Missing MDC"),
        ("RC (Received / Receiving Copy)", doc_single_counts.get('RC', 0), "Missing RC / Blurred RC / No Sign"),
        ("LOA (Letter of Authorization)", doc_single_counts.get('LOA', 0), "Missing LOA / Expired LOA"),
        ("Other / Unspecified", doc_single_counts.get('Other', 0) + doc_single_counts.get('Not Specified', 0) + doc_single_counts.get('Cert', 0), "System / Delivery Issues")
    ]

    doc_row_start = 11
    for idx, (doc_name, count, main_issue) in enumerate(top_docs):
        r_num = doc_row_start + idx
        c1 = ws_sum.cell(row=r_num, column=1, value=doc_name)
        c2 = ws_sum.cell(row=r_num, column=2, value=count)
        c3 = ws_sum.cell(row=r_num, column=3, value=f"=B{r_num}/{len(invalid_records)}")
        c4 = ws_sum.cell(row=r_num, column=4, value=main_issue)

        c1.font = bold_font
        c2.font = bold_font
        c3.font = regular_font
        c4.font = small_font

        c1.alignment = align_left
        c2.alignment = align_right
        c3.alignment = align_right
        c4.alignment = align_left

        c2.number_format = "#,##0"
        c3.number_format = "0.0%"

        fill_row = zebra_fill if idx % 2 == 0 else ice_fill
        for c in [c1, c2, c3, c4]:
            c.fill = fill_row
            c.border = thin_border

    # Total Row for Document Summary
    tot_r = doc_row_start + len(top_docs)
    ws_sum.cell(row=tot_r, column=1, value="Total Document Mentions").font = bold_font
    c_tot = ws_sum.cell(row=tot_r, column=2, value=f"=SUM(B{doc_row_start}:B{tot_r-1})")
    c_tot.font = bold_font
    c_tot.alignment = align_right
    c_tot.number_format = "#,##0"
    ws_sum.cell(row=tot_r, column=3, value="").border = summary_border
    ws_sum.cell(row=tot_r, column=4, value="Includes multi-document waybills").font = small_font
    for col in range(1, 5):
        ws_sum.cell(row=tot_r, column=col).border = summary_border
        ws_sum.cell(row=tot_r, column=col).fill = accent_fill

    # Table 2: Top 10 Riders with Invalids
    ws_sum["F9"] = "2. TOP 10 RIDERS WITH HIGHEST INVALIDS"
    ws_sum["F9"].font = section_font

    rider_headers = ["Rank", "Rider Name", "Total Invalids", "% Share", "Top Doc Involved"]
    for col_i, h in enumerate(rider_headers, start=6):
        cell = ws_sum.cell(row=10, column=col_i, value=h)
        cell.font = white_header_font
        cell.fill = blue_header
        cell.alignment = align_center
        cell.border = thin_border

    top_riders = rider_counts.most_common(10)
    rider_row_start = 11
    for idx, (r_name, r_cnt) in enumerate(top_riders):
        r_num = rider_row_start + idx
        top_doc_for_rider = rider_docs[r_name].most_common(1)[0][0] if rider_docs[r_name] else "N/A"

        c1 = ws_sum.cell(row=r_num, column=6, value=idx + 1)
        c2 = ws_sum.cell(row=r_num, column=7, value=r_name)
        c3 = ws_sum.cell(row=r_num, column=8, value=r_cnt)
        c4 = ws_sum.cell(row=r_num, column=9, value=f"=H{r_num}/{len(invalid_records)}")
        c5 = ws_sum.cell(row=r_num, column=10, value=top_doc_for_rider)

        c1.alignment = align_center
        c2.alignment = align_left
        c3.alignment = align_right
        c4.alignment = align_right
        c5.alignment = align_center

        c1.font = small_font
        c2.font = bold_font
        c3.font = bold_font
        c4.font = regular_font
        c5.font = small_font

        c3.number_format = "#,##0"
        c4.number_format = "0.0%"

        fill_row = zebra_fill if idx % 2 == 0 else ice_fill
        for c in [c1, c2, c3, c4, c5]:
            c.fill = fill_row
            c.border = thin_border

    # Table 3: Issue Category Breakdown (Per Category as requested in note)
    cat_row_start = 18
    ws_sum.cell(row=cat_row_start, column=1, value="3. DEFECT CATEGORY BREAKDOWN").font = section_font

    cat_headers = ["Defect Category", "Waybills", "% Share", "Recommended Action"]
    for col_i, h in enumerate(cat_headers, start=1):
        cell = ws_sum.cell(row=cat_row_start + 1, column=col_i, value=h)
        cell.font = white_header_font
        cell.fill = sky_fill
        cell.alignment = align_center
        cell.border = thin_border

    cat_recommendations = {
        'Missing Document': 'Mandatory rider upload check before departure',
        'Improper / Orientation': 'Camera orientation & clarity training',
        'Signature Discrepancy': 'Patient / receiver signature verification',
        'Blurred / Low Quality': 'Retake photo under good lighting',
        'Expired Document': 'Check document validity dates prior to release',
        'Other Defect': 'Dispatch investigation and review'
    }

    for idx, (cat_name, cat_cnt) in enumerate(category_counts.most_common(5)):
        r_num = cat_row_start + 2 + idx
        c1 = ws_sum.cell(row=r_num, column=1, value=cat_name)
        c2 = ws_sum.cell(row=r_num, column=2, value=cat_cnt)
        c3 = ws_sum.cell(row=r_num, column=3, value=f"=B{r_num}/{len(invalid_records)}")
        c4 = ws_sum.cell(row=r_num, column=4, value=cat_recommendations.get(cat_name, 'QA Re-evaluation'))

        c1.font = bold_font
        c2.font = bold_font
        c3.font = regular_font
        c4.font = small_font

        c1.alignment = align_left
        c2.alignment = align_right
        c3.alignment = align_right
        c4.alignment = align_left

        c2.number_format = "#,##0"
        c3.number_format = "0.0%"

        fill_row = zebra_fill if idx % 2 == 0 else ice_fill
        for c in [c1, c2, c3, c4]:
            c.fill = fill_row
            c.border = thin_border

    # =========================================================================
    # EMBED OPENPYXL CHARTS IN SHEET 1
    # =========================================================================
    
    # Chart 1: Bar Chart of Document Involved
    chart_doc = BarChart()
    chart_doc.type = "col"
    chart_doc.style = 10
    chart_doc.title = "Document Invalids Distribution"
    chart_doc.y_axis.title = "Number of Invalid Waybills"
    chart_doc.x_axis.title = "Document Type"
    chart_doc.width = 17
    chart_doc.height = 12

    data_doc = Reference(ws_sum, min_col=2, min_row=10, max_row=doc_row_start + len(top_docs) - 1)
    cats_doc = Reference(ws_sum, min_col=1, min_row=11, max_row=doc_row_start + len(top_docs) - 1)
    chart_doc.add_data(data_doc, titles_from_data=True)
    
    # Explicitly configure categories with cached string labels so Excel displays category names
    doc_labels = [d[0] for d in top_docs]
    doc_pts = [StrVal(idx=i, v=str(lbl)) for i, lbl in enumerate(doc_labels)]
    doc_cache = StrData(ptCount=len(doc_labels), pt=doc_pts)
    chart_doc.series[0].cat = AxDataSource(strRef=StrRef(f=str(cats_doc), strCache=doc_cache))
    
    # Show values directly on bars
    chart_doc.dataLabels = DataLabelList()
    chart_doc.dataLabels.showVal = True
    chart_doc.legend = None  # No legend needed for single series
    ws_sum.add_chart(chart_doc, "A26")

    # Chart 2: Horizontal Bar Chart of Top 10 Riders with Invalids
    chart_rider = BarChart()
    chart_rider.type = "bar" # horizontal bar
    chart_rider.style = 13
    chart_rider.title = "Top 10 Riders by Invalid Waybill Count"
    chart_rider.x_axis.title = "Rider Name" # Category Axis (vertical in horizontal bar)
    chart_rider.y_axis.title = "Number of Invalid Waybills" # Value Axis (horizontal in horizontal bar)
    chart_rider.width = 24
    chart_rider.height = 14

    data_rider = Reference(ws_sum, min_col=8, min_row=10, max_row=rider_row_start + len(top_riders) - 1)
    cats_rider = Reference(ws_sum, min_col=7, min_row=11, max_row=rider_row_start + len(top_riders) - 1)
    chart_rider.add_data(data_rider, titles_from_data=True)
    
    # Explicitly configure categories with cached string labels for full rider names
    rider_labels = [r[0] for r in top_riders]
    rider_pts = [StrVal(idx=i, v=str(lbl)) for i, lbl in enumerate(rider_labels)]
    rider_cache = StrData(ptCount=len(rider_labels), pt=rider_pts)
    chart_rider.series[0].cat = AxDataSource(strRef=StrRef(f=str(cats_rider), strCache=rider_cache))
    
    # Reverse category orientation so Rank 1 rider appears at the top
    chart_rider.x_axis.scaling.orientation = "maxMin"
    
    # Show values directly on bars
    chart_rider.dataLabels = DataLabelList()
    chart_rider.dataLabels.showVal = True
    chart_rider.legend = None
    ws_sum.add_chart(chart_rider, "F26")

    # =========================================================================
    # SHEET 2: RTH INVALID WAYBILLS (The exact 4 columns requested + reference)
    # =========================================================================
    ws_data = wb.create_sheet("RTH Invalid Waybills")
    ws_data.views.sheetView[0].showGridLines = True

    # Title Banner
    ws_data.merge_cells("A1:H2")
    ws_data["A1"] = "RTH INVALID WAYBILLS - MASTER RECORD LIST"
    ws_data["A1"].font = title_font
    ws_data["A1"].fill = navy_fill
    ws_data["A1"].alignment = align_center

    ws_data.merge_cells("A3:H3")
    ws_data["A3"] = "Columns: Waybill No. | Document Involved | Document Issue (Remarks) | Rider Name (Plus Operational Audit Fields)"
    ws_data["A3"].font = subtitle_font
    ws_data["A3"].fill = blue_header
    ws_data["A3"].alignment = align_center

    master_headers = [
        "Waybill No.",
        "Document Involved",
        "Document Issue (Remarks)",
        "Rider Name",
        "Issue Category",
        "Actual Waybill Date",
        "Validation Date",
        "Initial Validated By"
    ]

    for col_i, h in enumerate(master_headers, start=1):
        cell = ws_data.cell(row=5, column=col_i, value=h)
        cell.font = white_header_font
        cell.fill = blue_header
        cell.alignment = align_center
        cell.border = thin_border

    for idx, r in enumerate(invalid_records, start=6):
        c1 = ws_data.cell(row=idx, column=1, value=str(r.get('waybill_no', '')))
        c2 = ws_data.cell(row=idx, column=2, value=r.get('document_involved', ''))
        c3 = ws_data.cell(row=idx, column=3, value=r.get('document_issue', ''))
        c4 = ws_data.cell(row=idx, column=4, value=r.get('rider', ''))
        c5 = ws_data.cell(row=idx, column=5, value=r.get('issue_category', ''))
        c6 = ws_data.cell(row=idx, column=6, value=r.get('date', ''))
        c7 = ws_data.cell(row=idx, column=7, value=r.get('initial_val_date', ''))
        c8 = ws_data.cell(row=idx, column=8, value=r.get('initial_validated_by', ''))

        c1.alignment = align_center
        c2.alignment = align_center
        c3.alignment = align_left
        c4.alignment = align_left
        c5.alignment = align_center
        c6.alignment = align_center
        c7.alignment = align_center
        c8.alignment = align_left

        c1.font = Font(name="Segoe UI", size=10, bold=True, color="1E3A8A")
        c2.font = bold_font
        c3.font = regular_font
        c4.font = bold_font
        c5.font = small_font
        c6.font = regular_font
        c7.font = regular_font
        c8.font = small_font

        # Color badges for document involved
        doc_str = r.get('document_involved', '')
        if 'MDC' in doc_str and 'ID' in doc_str:
            c2.fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid") # Amber
        elif 'MDC' in doc_str:
            c2.fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid") # Blue
        elif 'ID' in doc_str:
            c2.fill = PatternFill(start_color="FEF9C3", end_color="FEF9C3", fill_type="solid") # Yellow
        elif 'RC' in doc_str:
            c2.fill = PatternFill(start_color="F3E8FF", end_color="F3E8FF", fill_type="solid") # Purple
        elif 'LOA' in doc_str:
            c2.fill = PatternFill(start_color="FFE4E6", end_color="FFE4E6", fill_type="solid") # Rose

        fill_row = zebra_fill if idx % 2 == 0 else ice_fill
        for c in [c1, c3, c4, c5, c6, c7, c8]:
            c.fill = fill_row
            c.border = thin_border
        c2.border = thin_border

    # Enable Excel Auto-Filter on master sheet
    ws_data.auto_filter.ref = f"A5:H{len(invalid_records) + 5}"

    # =========================================================================
    # SHEET 3: RIDER DEFECT RANKINGS (All riders with breakdown)
    # =========================================================================
    ws_rider = wb.create_sheet("Rider Defect Rankings")
    ws_rider.views.sheetView[0].showGridLines = True

    ws_rider.merge_cells("A1:H2")
    ws_rider["A1"] = "COMPLETE RIDER DEFECT RANKINGS & DOCUMENT BREAKDOWN"
    ws_rider["A1"].font = title_font
    ws_rider["A1"].fill = navy_fill
    ws_rider["A1"].alignment = align_center

    ws_rider.merge_cells("A3:H3")
    ws_rider["A3"] = "Riders sorted by highest invalid waybill count with individual document defects (ID, MDC, RC, LOA)"
    ws_rider["A3"].font = subtitle_font
    ws_rider["A3"].fill = blue_header
    ws_rider["A3"].alignment = align_center

    r_rank_headers = [
        "Rank", "Rider Name", "Total Invalids", "% Share", "ID Defects", "MDC Defects", "RC Defects", "LOA Defects"
    ]
    for col_i, h in enumerate(r_rank_headers, start=1):
        cell = ws_rider.cell(row=5, column=col_i, value=h)
        cell.font = white_header_font
        cell.fill = blue_header
        cell.alignment = align_center
        cell.border = thin_border

    all_riders_ranked = rider_counts.most_common()
    for idx, (r_name, tot_cnt) in enumerate(all_riders_ranked, start=1):
        r_num = 5 + idx
        d_map = rider_docs[r_name]

        c1 = ws_rider.cell(row=r_num, column=1, value=idx)
        c2 = ws_rider.cell(row=r_num, column=2, value=r_name)
        c3 = ws_rider.cell(row=r_num, column=3, value=tot_cnt)
        c4 = ws_rider.cell(row=r_num, column=4, value=f"=C{r_num}/{len(invalid_records)}")
        c5 = ws_rider.cell(row=r_num, column=5, value=d_map.get('ID', 0))
        c6 = ws_rider.cell(row=r_num, column=6, value=d_map.get('MDC', 0))
        c7 = ws_rider.cell(row=r_num, column=7, value=d_map.get('RC', 0))
        c8 = ws_rider.cell(row=r_num, column=8, value=d_map.get('LOA', 0))

        c1.alignment = align_center
        c2.alignment = align_left
        for c in [c3, c4, c5, c6, c7, c8]:
            c.alignment = align_right

        c1.font = small_font
        c2.font = bold_font
        c3.font = bold_font
        c4.font = regular_font
        for c in [c5, c6, c7, c8]:
            c.font = regular_font

        c3.number_format = "#,##0"
        c4.number_format = "0.0%"
        c5.number_format = "#,##0"
        c6.number_format = "#,##0"
        c7.number_format = "#,##0"
        c8.number_format = "#,##0"

        fill_row = zebra_fill if idx % 2 == 0 else ice_fill
        for c in [c1, c2, c3, c4, c5, c6, c7, c8]:
            c.fill = fill_row
            c.border = thin_border

    ws_rider.auto_filter.ref = f"A5:H{len(all_riders_ranked) + 5}"

    # =========================================================================
    # Chart 3: Line Chart of ALL Riders' Invalids Distribution (Sheet 1)
    # =========================================================================
    chart_all_riders = LineChart()
    chart_all_riders.title = f"All Riders Invalid Waybills Distribution (All {len(all_riders_ranked)} Riders)"
    chart_all_riders.style = 13
    chart_all_riders.y_axis.title = "Number of Invalid Waybills"
    chart_all_riders.x_axis.title = f"Riders (Ranked #1 to #{len(all_riders_ranked)})"
    chart_all_riders.width = 33
    chart_all_riders.height = 14

    data_all_riders = Reference(ws_rider, min_col=3, min_row=5, max_row=5 + len(all_riders_ranked))
    cats_all_riders = Reference(ws_rider, min_col=2, min_row=6, max_row=5 + len(all_riders_ranked))
    chart_all_riders.add_data(data_all_riders, titles_from_data=True)

    all_rider_names = [r[0] for r in all_riders_ranked]
    ar_pts = [StrVal(idx=i, v=str(lbl)) for i, lbl in enumerate(all_rider_names)]
    ar_cache = StrData(ptCount=len(all_rider_names), pt=ar_pts)
    chart_all_riders.series[0].cat = AxDataSource(strRef=StrRef(f=str(cats_all_riders), strCache=ar_cache))
    chart_all_riders.series[0].smooth = True
    chart_all_riders.legend = None
    ws_sum.add_chart(chart_all_riders, "A43")

    # =========================================================================
    # Chart 4: Line Chart on Sheet 3 (Rider Defect Rankings) beside the table
    # =========================================================================
    chart_sheet3 = LineChart()
    chart_sheet3.title = f"Rider Defect Volume Curve (All {len(all_riders_ranked)} Riders)"
    chart_sheet3.style = 13
    chart_sheet3.y_axis.title = "Number of Invalid Waybills"
    chart_sheet3.x_axis.title = "Rider"
    chart_sheet3.width = 24
    chart_sheet3.height = 18
    chart_sheet3.add_data(data_all_riders, titles_from_data=True)
    chart_sheet3.series[0].cat = AxDataSource(strRef=StrRef(f=str(cats_all_riders), strCache=ar_cache))
    chart_sheet3.series[0].smooth = True
    chart_sheet3.legend = None
    ws_rider.add_chart(chart_sheet3, "J5")

    # Auto-fit Column Widths across all sheets
    for ws in [ws_sum, ws_data, ws_rider]:
        for col in ws.columns:
            col_letter = get_column_letter(col[0].column)
            max_len = 0
            # Sample up to 150 rows
            sample_rows = col[:150]
            for cell in sample_rows:
                if cell.value is not None:
                    v_str = str(cell.value)
                    if not v_str.startswith("="):
                        max_len = max(max_len, len(v_str))
                    else:
                        max_len = max(max_len, 10)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    # Specific custom column widths for Executive Summary
    ws_sum.column_dimensions['A'].width = 32
    ws_sum.column_dimensions['B'].width = 16
    ws_sum.column_dimensions['C'].width = 14
    ws_sum.column_dimensions['D'].width = 30
    ws_sum.column_dimensions['E'].width = 5
    ws_sum.column_dimensions['F'].width = 8
    ws_sum.column_dimensions['G'].width = 28
    ws_sum.column_dimensions['H'].width = 16
    ws_sum.column_dimensions['I'].width = 14
    ws_sum.column_dimensions['J'].width = 18

    # Specific custom column widths for RTH Invalid Waybills
    ws_data.column_dimensions['A'].width = 18 # Waybill
    ws_data.column_dimensions['B'].width = 22 # Document Involved
    ws_data.column_dimensions['C'].width = 35 # Document Issue
    ws_data.column_dimensions['D'].width = 28 # Rider Name
    ws_data.column_dimensions['E'].width = 22 # Issue Category
    ws_data.column_dimensions['F'].width = 18 # Waybill Date
    ws_data.column_dimensions['G'].width = 18 # Validation Date
    ws_data.column_dimensions['H'].width = 25 # Initial Validated By

    wb.save(OUTPUT_PATH)
    print(f"RTH Invalid Documents Report successfully generated at: {OUTPUT_PATH}")
    return OUTPUT_PATH, len(invalid_records)

if __name__ == '__main__':
    generate_report()
