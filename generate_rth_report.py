import json
import os
import re
from datetime import datetime, date, timedelta
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
    if not remarks:
        return 'Not Specified'
    txt = remarks.lower().strip()
    docs = []
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
    if re.search(r'\brc\b', txt) or 'received copy' in txt or 'receiving copy' in txt or 'rc copy' in txt:
        docs.append('RC')
    if 'loa' in txt:
        docs.append('LOA')
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

def parse_record_date(r):
    s = r.get('initial_val_date') or r.get('date', '')
    if not s or '/' not in s:
        return None
    p = s.split('/')
    try:
        return date(int(p[2]), int(p[0]), int(p[1]))
    except:
        return None

def get_sat_fri_range(d):
    days_since_sat = (d.weekday() - 5) % 7
    sat = d - timedelta(days=days_since_sat)
    fri = sat + timedelta(days=6)
    return sat, fri

def generate_report(period_filter=None, output_path=None):
    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    valid_data = [r for r in data if re.match(r'^\d{8,}$', r.get('waybill_no', '').strip())]
    all_invalids = [r for r in valid_data if r.get('qa_initial_status') == 'Invalid']

    period_title_tag = "OVERALL MONITORING"
    period_subtitle_tag = "Full Master Dataset (All Dates)"

    if period_filter == 'latest_week' or (isinstance(period_filter, str) and period_filter.startswith('WEEK:')):
        weeks = {}
        for r in all_invalids:
            d = parse_record_date(r)
            if d:
                sat, fri = get_sat_fri_range(d)
                k = f"{sat.isoformat()}_{fri.isoformat()}"
                if k not in weeks:
                    weeks[k] = {'sat': sat, 'fri': fri, 'records': []}
                weeks[k]['records'].append(r)
        
        sorted_weeks = sorted(weeks.items(), key=lambda x: x[1]['sat'], reverse=True)
        if period_filter == 'latest_week' and sorted_weeks:
            target_key, target_week = sorted_weeks[0]
        elif period_filter.startswith('WEEK:') and period_filter.replace('WEEK:', '') in weeks:
            target_key = period_filter.replace('WEEK:', '')
            target_week = weeks[target_key]
        elif sorted_weeks:
            target_key, target_week = sorted_weeks[0]
        else:
            target_week = None

        if target_week:
            sat = target_week['sat']
            fri = target_week['fri']
            invalid_records = target_week['records']
            period_title_tag = f"LATEST WEEK ({sat.strftime('%b %d').upper()} - {fri.strftime('%b %d, %Y').upper()})"
            period_subtitle_tag = f"Weekly Cycle: {sat.strftime('%B %d')} to {fri.strftime('%B %d, %Y')} (Saturday to Friday Cycle)"
            if not output_path:
                output_path = os.path.join(BASE_DIR, 'Waybill_RTH_Report_Latest_Week.xlsx')
        else:
            invalid_records = all_invalids
            if not output_path:
                output_path = OUTPUT_PATH
    elif isinstance(period_filter, str) and period_filter.startswith('DATE:'):
        target_d = period_filter.replace('DATE:', '')
        invalid_records = [r for r in all_invalids if (r.get('initial_val_date') or r.get('date')) == target_d]
        period_title_tag = f"VALIDATION DATE: {target_d}"
        period_subtitle_tag = f"Specific Date: {target_d}"
        if not output_path:
            clean_d = target_d.replace('/', '-')
            output_path = os.path.join(BASE_DIR, f'Waybill_RTH_Report_{clean_d}.xlsx')
    else:
        invalid_records = all_invalids
        if not output_path:
            output_path = OUTPUT_PATH

    print(f"Generating RTH report for '{period_title_tag}': {len(invalid_records):,} invalids -> {output_path}")

    wb = openpyxl.Workbook()

    # Corporate Blue Theme Palette
    navy_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")     # Dark Navy
    blue_header = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")   # Primary Blue
    sky_fill = PatternFill(start_color="0284C7", end_color="0284C7", fill_type="solid")      # Sky Blue
    ice_fill = PatternFill(start_color="EFF6FF", end_color="EFF6FF", fill_type="solid")      # Very Light Blue
    accent_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")   # Ice Accent
    zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")    # Soft Gray
    rose_fill = PatternFill(start_color="FFE4E6", end_color="FFE4E6", fill_type="solid")     # Soft Rose
    amber_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")    # Soft Amber
    green_fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")    # Soft Green

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

    # Statistics
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
    ws_sum.merge_cells("A1:K2")
    ws_sum["A1"] = f"WAYBILL RTH INVALID DOCUMENTS & DEFECT ANALYSIS - {period_title_tag}"
    ws_sum["A1"].font = title_font
    ws_sum["A1"].fill = navy_fill
    ws_sum["A1"].alignment = align_center

    ws_sum.merge_cells("A3:K3")
    today_str = datetime.now().strftime("%B %d, %Y")
    ws_sum["A3"] = f"{period_subtitle_tag} | Generated: {today_str} | Data Source: Google Sheets Waybill Record"
    ws_sum["A3"].font = subtitle_font
    ws_sum["A3"].fill = blue_header
    ws_sum["A3"].alignment = align_center

    # Top KPI Cards
    top_doc_name = doc_single_counts.most_common(1)[0][0] if doc_single_counts else "None"
    top_doc_cnt = doc_single_counts.most_common(1)[0][1] if doc_single_counts else 0
    top_rider_name = rider_counts.most_common(1)[0][0] if rider_counts else "None"
    top_rider_cnt = rider_counts.most_common(1)[0][1] if rider_counts else 0

    kpis = [
        ("TOTAL INVALID WAYBILLS", f"{len(invalid_records):,}", "Flagged with Document Defects", "A5:B5", "A6:B6", "A7:B7"),
        ("UNIQUE RIDERS AFFECTED", f"{len(rider_counts):,}", "Riders with >=1 Invalid Waybill", "C5:D5", "C6:D6", "C7:D7"),
        ("PRIMARY DEFECT DOCUMENT", f"{top_doc_name} ({top_doc_cnt:,})", f"{(top_doc_cnt/max(len(invalid_records),1)*100):.1f}% of Invalids Involved", "E5:G5", "E6:G6", "E7:G7"),
        ("HIGHEST DEFECT RIDER", f"{top_rider_name[:22]}", f"{top_rider_cnt} Invalid Waybills", "H5:K5", "H6:K6", "H7:K7"),
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

    top_docs = [
        ("ID (Valid ID / Identification)", doc_single_counts.get('ID', 0), "Improper / Missing / Blurred ID"),
        ("MDC (Medical Doctors Certification)", doc_single_counts.get('MDC', 0), "Different Signature / Missing MDC"),
        ("RC (Received / Receiving Copy)", doc_single_counts.get('RC', 0), "Missing RC / Blurred RC / No Sign"),
        ("LOA (Letter of Authorization)", doc_single_counts.get('LOA', 0), "Missing LOA / Expired LOA"),
        ("Other / Unspecified", doc_single_counts.get('Other', 0), "System / Delivery issues"),
    ]

    doc_row_start = 11
    for idx, (doc_name, doc_cnt, doc_issue) in enumerate(top_docs):
        r_num = doc_row_start + idx
        c1 = ws_sum.cell(row=r_num, column=1, value=doc_name)
        c2 = ws_sum.cell(row=r_num, column=2, value=doc_cnt)
        c3 = ws_sum.cell(row=r_num, column=3, value=f"=B{r_num}/{max(len(invalid_records),1)}")
        c4 = ws_sum.cell(row=r_num, column=4, value=doc_issue)

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
        c4 = ws_sum.cell(row=r_num, column=9, value=f"=H{r_num}/{max(len(invalid_records),1)}")
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

    # Table 3: Issue Category Breakdown
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
        c3 = ws_sum.cell(row=r_num, column=3, value=f"=B{r_num}/{max(len(invalid_records),1)}")
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

    # Table 4: Fleet Defect Severity Tiers
    tier_row_start = 22
    ws_sum.cell(row=tier_row_start, column=6, value="4. FLEET DEFECT SEVERITY TIERS").font = section_font

    tier_headers = ["Severity Tier", "Riders", "Waybills", "% Share"]
    for col_i, h in enumerate(tier_headers, start=6):
        cell = ws_sum.cell(row=tier_row_start + 1, column=col_i, value=h)
        cell.font = white_header_font
        cell.fill = sky_fill
        cell.alignment = align_center
        cell.border = thin_border

    tot_inv = len(invalid_records)
    if tot_inv > 3000:
        tier_brackets = [
            ("Tier 1: Critical (>= 200)", 200, 999999, rose_fill),
            ("Tier 2: High (100 - 199)", 100, 199, amber_fill),
            ("Tier 3: Moderate (50 - 99)", 50, 99, accent_fill),
            ("Tier 4: Low (< 50)", 1, 49, green_fill),
        ]
    else:
        tier_brackets = [
            ("Tier 1: Critical (>= 40)", 40, 999999, rose_fill),
            ("Tier 2: High (20 - 39)", 20, 39, amber_fill),
            ("Tier 3: Moderate (10 - 19)", 10, 19, accent_fill),
            ("Tier 4: Low (< 10)", 1, 9, green_fill),
        ]

    for idx, (t_name, t_min, t_max, t_fill) in enumerate(tier_brackets):
        r_num = tier_row_start + 2 + idx
        t_riders = [cnt for cnt in rider_counts.values() if t_min <= cnt <= t_max]
        r_cnt = len(t_riders)
        w_cnt = sum(t_riders)

        c1 = ws_sum.cell(row=r_num, column=6, value=t_name)
        c2 = ws_sum.cell(row=r_num, column=7, value=r_cnt)
        c3 = ws_sum.cell(row=r_num, column=8, value=w_cnt)
        c4 = ws_sum.cell(row=r_num, column=9, value=f"=H{r_num}/{max(tot_inv, 1)}")

        c1.font = bold_font
        c2.font = bold_font
        c3.font = bold_font
        c4.font = regular_font

        c1.alignment = align_left
        c2.alignment = align_center
        c3.alignment = align_right
        c4.alignment = align_right

        c2.number_format = "#,##0"
        c3.number_format = "#,##0"
        c4.number_format = "0.0%"

        c1.fill = t_fill
        for c in [c2, c3, c4]:
            c.fill = zebra_fill if idx % 2 == 0 else ice_fill
        for c in [c1, c2, c3, c4]:
            c.border = thin_border

    # =========================================================================
    # SHEET 2: RTH INVALID WAYBILLS (The exact 4 columns requested + reference)
    # =========================================================================
    ws_data = wb.create_sheet("RTH Invalid Waybills")
    ws_data.views.sheetView[0].showGridLines = True

    ws_data.merge_cells("A1:H2")
    ws_data["A1"] = f"RTH INVALID WAYBILLS - MASTER RECORD LIST ({period_title_tag})"
    ws_data["A1"].font = title_font
    ws_data["A1"].fill = navy_fill
    ws_data["A1"].alignment = align_center

    ws_data.merge_cells("A3:H3")
    ws_data["A3"] = "Columns: Waybill No. | Document Involved | Document Issue (Remarks) | Rider Name (Plus Operational Audit Fields)"
    ws_data["A3"].font = subtitle_font
    ws_data["A3"].fill = blue_header
    ws_data["A3"].alignment = align_center

    master_headers = [
        "Waybill No.", "Document Involved", "Document Issue (Remarks)",
        "Rider Name", "Issue Category", "Actual Waybill Date",
        "Validation Date", "Initial Validated By"
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

        doc_str = r.get('document_involved', '')
        if 'MDC' in doc_str and 'ID' in doc_str:
            c2.fill = amber_fill
        elif 'MDC' in doc_str:
            c2.fill = accent_fill
        elif 'ID' in doc_str:
            c2.fill = PatternFill(start_color="FEF9C3", end_color="FEF9C3", fill_type="solid")
        elif 'RC' in doc_str:
            c2.fill = PatternFill(start_color="F3E8FF", end_color="F3E8FF", fill_type="solid")
        elif 'LOA' in doc_str:
            c2.fill = rose_fill

        fill_row = zebra_fill if idx % 2 == 0 else ice_fill
        for c in [c1, c3, c4, c5, c6, c7, c8]:
            c.fill = fill_row
            c.border = thin_border
        c2.border = thin_border

    ws_data.auto_filter.ref = f"A5:H{len(invalid_records) + 5}"

    # =========================================================================
    # SHEET 3: RIDER DEFECT RANKINGS (All riders with breakdown)
    # =========================================================================
    ws_rider = wb.create_sheet("Rider Defect Rankings")
    ws_rider.views.sheetView[0].showGridLines = True

    ws_rider.merge_cells("A1:H2")
    ws_rider["A1"] = f"COMPLETE RIDER DEFECT RANKINGS & DOCUMENT BREAKDOWN ({period_title_tag})"
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
        c4 = ws_rider.cell(row=r_num, column=4, value=f"=C{r_num}/{max(len(invalid_records),1)}")
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
    # EMBED OPENPYXL CHARTS IN SHEET 1 & SHEET 3
    # =========================================================================

    # Chart 1: Bar Chart of Document Involved (Column)
    chart_doc = BarChart()
    chart_doc.type = "col"
    chart_doc.style = 10
    chart_doc.title = "Document Invalids Distribution"
    chart_doc.y_axis.title = "Number of Invalid Waybills"
    chart_doc.x_axis.title = "Document Type"
    chart_doc.width = 16
    chart_doc.height = 12

    data_doc = Reference(ws_sum, min_col=2, min_row=10, max_row=doc_row_start + len(top_docs) - 1)
    cats_doc = Reference(ws_sum, min_col=1, min_row=11, max_row=doc_row_start + len(top_docs) - 1)
    chart_doc.add_data(data_doc, titles_from_data=True)

    doc_labels = [d[0] for d in top_docs]
    doc_pts = [StrVal(idx=i, v=str(lbl)) for i, lbl in enumerate(doc_labels)]
    doc_cache = StrData(ptCount=len(doc_labels), pt=doc_pts)
    chart_doc.series[0].cat = AxDataSource(strRef=StrRef(f=str(cats_doc), strCache=doc_cache))

    # CRITICAL: Configure tick labels on category axis
    chart_doc.x_axis.tickLblPos = "nextTo"
    chart_doc.y_axis.tickLblPos = "nextTo"

    # CRITICAL: Clean data labels showing ONLY count
    chart_doc.dataLabels = DataLabelList()
    chart_doc.dataLabels.showVal = True
    chart_doc.dataLabels.showCatName = False
    chart_doc.dataLabels.showSerName = False
    chart_doc.dataLabels.showLegendKey = False
    chart_doc.dataLabels.showPercent = False
    chart_doc.legend = None
    ws_sum.add_chart(chart_doc, "A28")

    # Chart 1B (NEW): Document Defects Market Share Donut Chart
    chart_donut = PieChart()
    chart_donut.holeSize = 50
    chart_donut.title = "Document Defects Share (%)"
    chart_donut.width = 14
    chart_donut.height = 12
    data_donut = Reference(ws_sum, min_col=2, min_row=10, max_row=doc_row_start + len(top_docs) - 1)
    chart_donut.add_data(data_donut, titles_from_data=True)
    chart_donut.series[0].cat = AxDataSource(strRef=StrRef(f=str(cats_doc), strCache=doc_cache))
    chart_donut.dataLabels = DataLabelList()
    chart_donut.dataLabels.showPercent = True
    chart_donut.dataLabels.showVal = False
    chart_donut.dataLabels.showCatName = False
    chart_donut.dataLabels.showLegendKey = False
    ws_sum.add_chart(chart_donut, "G28")

    # Chart 2: Top 10 Riders Horizontal Bar Chart
    chart_rider = BarChart()
    chart_rider.type = "bar"
    chart_rider.style = 13
    chart_rider.title = "Top 10 Riders by Invalid Waybill Count"
    chart_rider.x_axis.title = "Rider Name"
    chart_rider.y_axis.title = "Number of Invalid Waybills"
    chart_rider.width = 22
    chart_rider.height = 12

    data_rider = Reference(ws_sum, min_col=8, min_row=10, max_row=rider_row_start + len(top_riders) - 1)
    cats_rider = Reference(ws_sum, min_col=7, min_row=11, max_row=rider_row_start + len(top_riders) - 1)
    chart_rider.add_data(data_rider, titles_from_data=True)

    rider_labels = [r[0] for r in top_riders]
    rider_pts = [StrVal(idx=i, v=str(lbl)) for i, lbl in enumerate(rider_labels)]
    rider_cache = StrData(ptCount=len(rider_labels), pt=rider_pts)
    chart_rider.series[0].cat = AxDataSource(strRef=StrRef(f=str(cats_rider), strCache=rider_cache))

    chart_rider.x_axis.scaling.orientation = "maxMin"
    chart_rider.x_axis.tickLblPos = "nextTo"
    chart_rider.y_axis.tickLblPos = "nextTo"

    # Clean data labels: ONLY the count
    chart_rider.dataLabels = DataLabelList()
    chart_rider.dataLabels.showVal = True
    chart_rider.dataLabels.showCatName = False
    chart_rider.dataLabels.showSerName = False
    chart_rider.dataLabels.showLegendKey = False
    chart_rider.dataLabels.showPercent = False
    chart_rider.legend = None
    ws_sum.add_chart(chart_rider, "L28")

    # Chart 3 (NEW): Top 10 Riders Document Composition Stacked Bar Chart
    if len(top_riders) > 0:
        chart_stacked = BarChart()
        chart_stacked.type = "bar"
        chart_stacked.grouping = "stacked"
        chart_stacked.overlap = 100
        chart_stacked.title = "Top 10 Riders Defect Breakdown by Document"
        chart_stacked.x_axis.title = "Rider Name"
        chart_stacked.y_axis.title = "Number of Invalids by Document"
        chart_stacked.width = 24
        chart_stacked.height = 13

        # ID, MDC, RC, LOA are columns E to H in ws_rider (min_col=5, max_col=8)
        data_stacked = Reference(ws_rider, min_col=5, min_row=5, max_col=8, max_row=5 + len(top_riders))
        cats_stacked = Reference(ws_rider, min_col=2, min_row=6, max_row=5 + len(top_riders))
        chart_stacked.add_data(data_stacked, titles_from_data=True)

        st_pts = [StrVal(idx=i, v=str(lbl)) for i, lbl in enumerate(rider_labels)]
        st_cache = StrData(ptCount=len(rider_labels), pt=st_pts)
        for s in chart_stacked.series:
            s.cat = AxDataSource(strRef=StrRef(f=str(cats_stacked), strCache=st_cache))

        chart_stacked.x_axis.scaling.orientation = "maxMin"
        chart_stacked.x_axis.tickLblPos = "nextTo"
        chart_stacked.y_axis.tickLblPos = "nextTo"
        ws_sum.add_chart(chart_stacked, "A42")

    # Chart 4 (NEW): Fleet Defect Severity Tiers Donut Chart
    chart_tier_donut = PieChart()
    chart_tier_donut.holeSize = 50
    chart_tier_donut.title = "Fleet Defect Severity Tier Distribution"
    chart_tier_donut.width = 16
    chart_tier_donut.height = 13
    data_tiers = Reference(ws_sum, min_col=8, min_row=tier_row_start + 1, max_row=tier_row_start + 1 + len(tier_brackets))
    cats_tiers = Reference(ws_sum, min_col=6, min_row=tier_row_start + 2, max_row=tier_row_start + 1 + len(tier_brackets))
    chart_tier_donut.add_data(data_tiers, titles_from_data=True)
    tier_labels = [t[0] for t in tier_brackets]
    t_pts = [StrVal(idx=i, v=str(lbl)) for i, lbl in enumerate(tier_labels)]
    t_cache = StrData(ptCount=len(tier_labels), pt=t_pts)
    chart_tier_donut.series[0].cat = AxDataSource(strRef=StrRef(f=str(cats_tiers), strCache=t_cache))
    chart_tier_donut.dataLabels = DataLabelList()
    chart_tier_donut.dataLabels.showPercent = True
    chart_tier_donut.dataLabels.showVal = False
    chart_tier_donut.dataLabels.showCatName = False
    chart_tier_donut.dataLabels.showLegendKey = False
    ws_sum.add_chart(chart_tier_donut, "K42")

    # Chart 5: All Riders Invalid Waybills Distribution Line Graph
    chart_all_riders = LineChart()
    chart_all_riders.title = f"All Riders Invalid Waybills Distribution (All {len(all_riders_ranked)} Riders)"
    chart_all_riders.style = 13
    chart_all_riders.y_axis.title = "Number of Invalid Waybills"
    chart_all_riders.x_axis.title = f"Riders (Ranked #1 to #{len(all_riders_ranked)})"
    chart_all_riders.width = 34
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

    chart_all_riders.x_axis.tickLblPos = "nextTo"
    chart_all_riders.y_axis.tickLblPos = "nextTo"
    chart_all_riders.x_axis.tickLblSkip = 1
    ws_sum.add_chart(chart_all_riders, "A57")

    # Chart on Sheet 3 (Rider Defect Rankings) beside table
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
    chart_sheet3.x_axis.tickLblPos = "nextTo"
    chart_sheet3.y_axis.tickLblPos = "nextTo"
    ws_rider.add_chart(chart_sheet3, "J5")

    # Auto-fit Column Widths across all sheets
    for ws in [ws_sum, ws_data, ws_rider]:
        for col in ws.columns:
            col_letter = get_column_letter(col[0].column)
            max_len = 0
            sample_rows = col[:150]
            for cell in sample_rows:
                if cell.value is not None:
                    v_str = str(cell.value)
                    if not v_str.startswith("="):
                        max_len = max(max_len, len(v_str))
                    else:
                        max_len = max(max_len, 10)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    ws_sum.column_dimensions['A'].width = 32
    ws_sum.column_dimensions['B'].width = 16
    ws_sum.column_dimensions['C'].width = 14
    ws_sum.column_dimensions['D'].width = 30
    ws_sum.column_dimensions['E'].width = 5
    ws_sum.column_dimensions['F'].width = 8
    ws_sum.column_dimensions['G'].width = 32
    ws_sum.column_dimensions['H'].width = 16
    ws_sum.column_dimensions['I'].width = 14
    ws_sum.column_dimensions['J'].width = 18
    ws_sum.column_dimensions['K'].width = 16

    wb.save(output_path)
    print(f"RTH Invalid Documents Report successfully generated at: {output_path}")
    return output_path

if __name__ == '__main__':
    # 1. Generate Master Overall Report
    generate_report(period_filter=None)
    # 2. Generate Latest Week Report (Saturday to Friday Cycle)
    generate_report(period_filter='latest_week')
