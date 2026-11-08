import json
import os
import re
from datetime import datetime, date, timedelta
from collections import Counter, defaultdict
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, LineChart, Reference
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
    # MDC: Medicine Consent Form (User rule: if u see remarks like diff sign that is MDC)
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
    # RC: Received / Receiving copy
    if re.search(r'\brc\b', txt) or 'received copy' in txt or 'receiving copy' in txt or 'rc copy' in txt:
        docs.append('RC')
    # LOA: Letter of authorization
    if 'loa' in txt:
        docs.append('LOA')
    # ID: Valid ID / Identification
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

def get_rider_surname(name):
    if not name:
        return 'Unknown'
    clean = name.strip()
    if ',' in clean:
        return clean.split(',')[0].strip().title()
    return clean.split()[0].strip().title()

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

    # Valid waybills: 8+ digit waybills
    valid_data = [r for r in data if re.match(r'^\d{8,}$', r.get('waybill_no', '').strip())]

    period_title_tag = "OVERALL MONITORING"
    period_subtitle_tag = "Full Master Dataset (All Dates)"

    # Filter scope records (all waybills in selected date range)
    if period_filter == 'latest_week' or (isinstance(period_filter, str) and period_filter.startswith('WEEK:')):
        weeks = {}
        for r in valid_data:
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
            scope_records = target_week['records']
            period_title_tag = f"LATEST WEEK ({sat.strftime('%b %d').upper()} - {fri.strftime('%b %d, %Y').upper()})"
            period_subtitle_tag = f"Weekly Cycle: {sat.strftime('%B %d')} to {fri.strftime('%B %d, %Y')} (Saturday to Friday Cycle)"
            if not output_path:
                output_path = os.path.join(BASE_DIR, 'Waybill_RTH_Report_Latest_Week.xlsx')
        else:
            scope_records = valid_data
            if not output_path:
                output_path = OUTPUT_PATH

    elif isinstance(period_filter, str) and period_filter.startswith('DATES:'):
        raw_dates = period_filter.replace('DATES:', '').split(',')
        target_dates = set(d.strip() for d in raw_dates if d.strip())
        scope_records = [r for r in valid_data if (r.get('initial_val_date') or r.get('date')) in target_dates]
        period_title_tag = f"SELECTED DATES ({len(target_dates)} Dates)"
        period_subtitle_tag = f"Custom Multi-Date Scope: {', '.join(sorted(target_dates)[:4])}{'...' if len(target_dates)>4 else ''}"
        if not output_path:
            output_path = os.path.join(BASE_DIR, 'Waybill_RTH_Report_Custom_Dates.xlsx')

    elif isinstance(period_filter, str) and period_filter.startswith('DATE:'):
        target_d = period_filter.replace('DATE:', '')
        scope_records = [r for r in valid_data if (r.get('initial_val_date') or r.get('date')) == target_d]
        period_title_tag = f"VALIDATION DATE: {target_d}"
        period_subtitle_tag = f"Specific Date: {target_d}"
        if not output_path:
            clean_d = target_d.replace('/', '-')
            output_path = os.path.join(BASE_DIR, f'Waybill_RTH_Report_{clean_d}.xlsx')
    else:
        scope_records = valid_data
        if not output_path:
            output_path = OUTPUT_PATH

    # Assigned waybills count per rider in this date scope (Page 7 item 3)
    assigned_counts = Counter(r.get('rider', '').strip() for r in scope_records if r.get('rider'))
    
    # Invalids in this date scope
    invalid_records = [r for r in scope_records if r.get('qa_initial_status') == 'Invalid']

    print(f"Generating 1Life RTH report for '{period_title_tag}': {len(invalid_records):,} invalids / {len(scope_records):,} assigned -> {output_path}")

    wb = openpyxl.Workbook()

    # =========================================================================
    # 1LIFE BRAND TEAL COLOR PALETTE (Page 8)
    # =========================================================================
    teal_dark = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")     # Dark Teal (Main Banner)
    teal_primary = PatternFill(start_color="0D9488", end_color="0D9488", fill_type="solid")  # Teal (Table Headers)
    teal_accent = PatternFill(start_color="14B8A6", end_color="14B8A6", fill_type="solid")   # Vibrant Mint Teal
    mint_ice = PatternFill(start_color="CCFBF1", end_color="CCFBF1", fill_type="solid")      # Mint Ice (Totals / KPI)
    mint_soft = PatternFill(start_color="E6FFFA", end_color="E6FFFA", fill_type="solid")     # Very Soft Mint
    mint_zebra = PatternFill(start_color="F0FDFA", end_color="F0FDFA", fill_type="solid")    # Soft Ice Mint Alternating
    white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
    
    # Document Badge Colors
    id_badge_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")  # Amber for ID
    mdc_badge_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid") # Soft Blue for MDC
    rc_badge_fill = PatternFill(start_color="F3E8FF", end_color="F3E8FF", fill_type="solid")  # Soft Purple for RC
    loa_badge_fill = PatternFill(start_color="FFE4E6", end_color="FFE4E6", fill_type="solid") # Soft Rose for LOA

    title_font = Font(name="Segoe UI", size=15, bold=True, color="FFFFFF")
    subtitle_font = Font(name="Segoe UI", size=9, italic=True, color="CCFBF1")
    section_font = Font(name="Segoe UI", size=11, bold=True, color="0F766E")
    white_header_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    bold_font = Font(name="Segoe UI", size=10, bold=True, color="0F172A")
    regular_font = Font(name="Segoe UI", size=10, color="1E293B")
    small_font = Font(name="Segoe UI", size=9, color="475569")
    kpi_num_font = Font(name="Segoe UI", size=18, bold=True, color="0F766E")
    kpi_title_font = Font(name="Segoe UI", size=9, bold=True, color="0F766E")

    thin_teal = Side(border_style="thin", color="99F6E4")
    thin_border = Border(left=thin_teal, right=thin_teal, top=thin_teal, bottom=thin_teal)
    double_bottom = Side(border_style="double", color="0F766E")
    total_border = Border(top=thin_teal, bottom=double_bottom, left=thin_teal, right=thin_teal)

    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")

    # Aggregate Defect Statistics
    doc_single_counts = Counter()
    rider_counts = Counter()
    rider_docs = defaultdict(lambda: Counter())

    for r in invalid_records:
        rem = r.get('qa_initial_remarks', '').strip()
        doc = classify_document_involved(rem)
        rider = r.get('rider', '').strip() or 'Unknown Rider'

        r['document_involved'] = doc
        r['document_issue'] = rem

        for d in doc.split(', '):
            doc_single_counts[d] += 1
            rider_docs[rider][d] += 1

        rider_counts[rider] += 1

    # =========================================================================
    # TAB 1: EXECUTIVE SUMMARY & CHARTS (Pages 2, 3, 4)
    # =========================================================================
    ws_sum = wb.active
    ws_sum.title = "Executive Summary & Charts"
    ws_sum.views.sheetView[0].showGridLines = True

    # Page 4 item 8: Freeze rows 1-7
    ws_sum.freeze_panes = "A8"

    # Title Banner (1Life Task Monitoring | Data Quality Management)
    ws_sum.merge_cells("A1:K2")
    ws_sum["A1"] = f"1Life TASK MONITORING - WAYBILL RTH DEFECT & DOCUMENT ANALYSIS ({period_title_tag})"
    ws_sum["A1"].font = title_font
    ws_sum["A1"].fill = teal_dark
    ws_sum["A1"].alignment = align_center

    ws_sum.merge_cells("A3:K3")
    today_str = datetime.now().strftime("%B %d, %Y")
    # Page 8 item 4: Highlight report is generated by QA – Data and Analytics Team
    ws_sum["A3"] = f"{period_subtitle_tag} | Generated by: QA – Data and Analytics Team | 1Life Inc. Philippines (hello@1life.ph) | {today_str}"
    ws_sum["A3"].font = subtitle_font
    ws_sum["A3"].fill = teal_primary
    ws_sum["A3"].alignment = align_center

    # Top KPI Cards (Rows 5-7)
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
        c1.font = kpi_title_font
        c1.fill = mint_ice
        c1.alignment = align_center

        c2.value = val
        c2.font = kpi_num_font
        c2.fill = mint_soft
        c2.alignment = align_center

        c3.value = sub
        c3.font = small_font
        c3.fill = mint_soft
        c3.alignment = align_center

        for rng in [r1, r2, r3]:
            for row in ws_sum[rng]:
                for cell in row:
                    cell.border = thin_border

    # Table 1: Invalid Documents Distribution (Page 2 item 3: MDC = Medicine Consent Form)
    ws_sum["A9"] = "1. INVALID DOCUMENTS DISTRIBUTION (Which documents had many invalids)"
    ws_sum["A9"].font = section_font

    doc_headers = ["Document Involved", "Invalid Count", "% of Invalids", "Document Details & Primary Remarks"]
    for col_i, h in enumerate(doc_headers, start=1):
        cell = ws_sum.cell(row=10, column=col_i, value=h)
        cell.font = white_header_font
        cell.fill = teal_primary
        cell.alignment = align_center
        cell.border = thin_border

    top_docs = [
        ("ID (Valid ID / Identification)", doc_single_counts.get('ID', 0), "Improper / Missing / Blurred ID"),
        ("MDC (Medicine Consent Form)", doc_single_counts.get('MDC', 0), "Different Signature / Missing MDC / Blurred MDC"),
        ("RC (Received / Receiving Copy)", doc_single_counts.get('RC', 0), "Missing RC / Blurred RC / No Sign in RC"),
        ("LOA (Letter of Authorization)", doc_single_counts.get('LOA', 0), "Missing LOA / Expired LOA / Unclear LOA"),
        ("Other / Unspecified", doc_single_counts.get('Other', 0), "System / Delivery / Other document issues"),
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

        fill_row = mint_zebra if idx % 2 == 0 else white_fill
        for c in [c1, c2, c3, c4]:
            c.fill = fill_row
            c.border = thin_border

    tot_r = doc_row_start + len(top_docs)
    ws_sum.cell(row=tot_r, column=1, value="Total Document Mentions").font = bold_font
    c_tot = ws_sum.cell(row=tot_r, column=2, value=f"=SUM(B{doc_row_start}:B{tot_r-1})")
    c_tot.font = bold_font
    c_tot.alignment = align_right
    c_tot.number_format = "#,##0"
    ws_sum.cell(row=tot_r, column=3, value="").border = total_border
    ws_sum.cell(row=tot_r, column=4, value="Includes multi-document waybills").font = small_font
    for col in range(1, 5):
        ws_sum.cell(row=tot_r, column=col).border = total_border
        ws_sum.cell(row=tot_r, column=col).fill = mint_ice

    # Table 2: Top 10 Riders with Invalids (with # Assigned)
    ws_sum["F9"] = "2. TOP 10 RIDERS WITH HIGHEST INVALIDS"
    ws_sum["F9"].font = section_font

    rider_headers = ["Rank", "Rider Name", "# Assigned", "Total Invalids", "% Share"]
    for col_i, h in enumerate(rider_headers, start=6):
        cell = ws_sum.cell(row=10, column=col_i, value=h)
        cell.font = white_header_font
        cell.fill = teal_primary
        cell.alignment = align_center
        cell.border = thin_border

    top_riders = rider_counts.most_common(10)
    rider_row_start = 11
    for idx, (r_name, r_cnt) in enumerate(top_riders):
        r_num = rider_row_start + idx
        r_assigned = assigned_counts.get(r_name, r_cnt)

        c1 = ws_sum.cell(row=r_num, column=6, value=idx + 1)
        c2 = ws_sum.cell(row=r_num, column=7, value=r_name)
        c3 = ws_sum.cell(row=r_num, column=8, value=r_assigned)
        c4 = ws_sum.cell(row=r_num, column=9, value=r_cnt)
        c5 = ws_sum.cell(row=r_num, column=10, value=f"=I{r_num}/{max(len(invalid_records),1)}")

        c1.alignment = align_center
        c2.alignment = align_left
        c3.alignment = align_right
        c4.alignment = align_right
        c5.alignment = align_right

        c1.font = small_font
        c2.font = bold_font
        c3.font = regular_font
        c4.font = bold_font
        c5.font = regular_font

        c3.number_format = "#,##0"
        c4.number_format = "#,##0"
        c5.number_format = "0.0%"

        fill_row = mint_zebra if idx % 2 == 0 else white_fill
        for c in [c1, c2, c3, c4, c5]:
            c.fill = fill_row
            c.border = thin_border

    # NOTE: Table 4 (Fleet Defect Severity Tiers) is REMOVED per Page 2 item 1!

    # =========================================================================
    # CHARTS ON TAB 1 (EXECUTIVE SUMMARY & CHARTS)
    # Page 2 item 2: Fix layout of visuals/charts. They are congested.
    # Page 3 item 4: Remove "Document Defects Share" chart.
    # Page 3 item 5: Remove "Top 10 Riders by Invalid Waybill Count" chart.
    # Page 4 item 6: "Top 10 Riders Defect Breakdown by Document" (Spacious & Readable)
    # Page 4 item 7: "Rider Invalid Waybill Distribution Count" (Vertical Column, sorted by surname)
    # =========================================================================

    # Chart 1: Invalid Documents Distribution (Column Chart)
    # Page 2 item 3: "Chart name: Document Invalids Distribution, but make it 'Invalid Documents Distribution'. Add legend/label for what the column visualizes e.g. ID, MDC, LOA, RC. Moreover, MDC stands for Medicine Consent Form."
    chart_doc = BarChart()
    chart_doc.type = "col"
    chart_doc.style = 10
    chart_doc.title = "Invalid Documents Distribution"
    chart_doc.y_axis.title = "Number of Invalid Waybills"
    chart_doc.x_axis.title = "Document Type (ID, MDC, RC, LOA)"
    chart_doc.width = 17
    chart_doc.height = 14

    data_doc = Reference(ws_sum, min_col=2, min_row=10, max_row=doc_row_start + len(top_docs) - 1)
    cats_doc = Reference(ws_sum, min_col=1, min_row=11, max_row=doc_row_start + len(top_docs) - 1)
    chart_doc.add_data(data_doc, titles_from_data=True)

    doc_short_names = ["ID", "MDC (Medicine Consent)", "RC", "LOA", "Other"]
    doc_pts = [StrVal(idx=i, v=str(lbl)) for i, lbl in enumerate(doc_short_names)]
    doc_cache = StrData(ptCount=len(doc_short_names), pt=doc_pts)
    chart_doc.series[0].cat = AxDataSource(strRef=StrRef(f=str(cats_doc), strCache=doc_cache))

    chart_doc.x_axis.tickLblPos = "nextTo"
    chart_doc.y_axis.tickLblPos = "nextTo"
    chart_doc.dataLabels = DataLabelList()
    chart_doc.dataLabels.showVal = True
    chart_doc.dataLabels.showCatName = False
    chart_doc.dataLabels.showSerName = False
    chart_doc.dataLabels.showLegendKey = False
    chart_doc.dataLabels.showPercent = False
    chart_doc.legend = None

    # Place Chart 1 starting at A18
    ws_sum.add_chart(chart_doc, "A18")

    # =========================================================================
    # TAB 3: RIDER DEFECT RANKINGS (Pages 6 & 7)
    # We populate ws_rider first so Chart 2 & Chart 3 can reference it cleanly!
    # =========================================================================
    ws_rider = wb.create_sheet("Rider Defect Rankings")
    ws_rider.views.sheetView[0].showGridLines = True

    # Page 7 item 4: Freeze rows 1-5
    ws_rider.freeze_panes = "A6"

    ws_rider.merge_cells("A1:I2")
    ws_rider["A1"] = f"1Life TASK MONITORING - COMPLETE RIDER DEFECT RANKINGS ({period_title_tag})"
    ws_rider["A1"].font = title_font
    ws_rider["A1"].fill = teal_dark
    ws_rider["A1"].alignment = align_center

    ws_rider.merge_cells("A3:I3")
    ws_rider["A3"] = f"Riders ranked by highest invalid waybill count with assigned waybill volume and document breakdown | Generated by: QA – Data and Analytics Team"
    ws_rider["A3"].font = subtitle_font
    ws_rider["A3"].fill = teal_primary
    ws_rider["A3"].alignment = align_center

    # Page 7 item 3: Add new column after Rider's name: "# of Waybills Assigned"
    # Headers: Rank | Rider Name | # of Waybills Assigned | Total Invalids | % Share | ID Defects | MDC Defects | RC Defects | LOA Defects
    r_rank_headers = [
        "Rank", "Rider Name", "# of Waybills Assigned", "Total Invalids", "% Share", 
        "ID Defects", "MDC Defects", "RC Defects", "LOA Defects"
    ]
    for col_i, h in enumerate(r_rank_headers, start=1):
        cell = ws_rider.cell(row=5, column=col_i, value=h)
        cell.font = white_header_font
        cell.fill = teal_primary
        cell.alignment = align_center
        cell.border = thin_border

    all_riders_ranked = rider_counts.most_common()
    last_rider_row = 5 + len(all_riders_ranked)

    for idx, (r_name, tot_cnt) in enumerate(all_riders_ranked, start=1):
        r_num = 5 + idx
        d_map = rider_docs[r_name]
        assigned_cnt = assigned_counts.get(r_name, tot_cnt)

        c1 = ws_rider.cell(row=r_num, column=1, value=idx)
        c2 = ws_rider.cell(row=r_num, column=2, value=r_name)
        c3 = ws_rider.cell(row=r_num, column=3, value=assigned_cnt)
        c4 = ws_rider.cell(row=r_num, column=4, value=tot_cnt)
        c5 = ws_rider.cell(row=r_num, column=5, value=f"=D{r_num}/${len(invalid_records) or 1}")
        c6 = ws_rider.cell(row=r_num, column=6, value=d_map.get('ID', 0))
        c7 = ws_rider.cell(row=r_num, column=7, value=d_map.get('MDC', 0))
        c8 = ws_rider.cell(row=r_num, column=8, value=d_map.get('RC', 0))
        c9 = ws_rider.cell(row=r_num, column=9, value=d_map.get('LOA', 0))

        c1.alignment = align_center
        c2.alignment = align_left
        for c in [c3, c4, c5, c6, c7, c8, c9]:
            c.alignment = align_right

        c1.font = small_font
        c2.font = bold_font
        c3.font = regular_font
        c4.font = bold_font
        c5.font = regular_font
        for c in [c6, c7, c8, c9]:
            c.font = regular_font

        c3.number_format = "#,##0"
        c4.number_format = "#,##0"
        c5.number_format = "0.0%"
        c6.number_format = "#,##0"
        c7.number_format = "#,##0"
        c8.number_format = "#,##0"
        c9.number_format = "#,##0"

        fill_row = mint_zebra if idx % 2 == 0 else white_fill
        for c in [c1, c2, c3, c4, c5, c6, c7, c8, c9]:
            c.fill = fill_row
            c.border = thin_border

    # Page 7 item 3: "Then at the end of each column, add a total count here"
    tot_row_rider = last_rider_row + 1
    ws_rider.cell(row=tot_row_rider, column=1, value="")
    c_tot_label = ws_rider.cell(row=tot_row_rider, column=2, value="TOTAL")
    c_tot_label.font = Font(name="Segoe UI", size=10, bold=True, color="0F766E")
    c_tot_label.alignment = align_left

    c_tot_assigned = ws_rider.cell(row=tot_row_rider, column=3, value=f"=SUM(C6:C{last_rider_row})")
    c_tot_inv = ws_rider.cell(row=tot_row_rider, column=4, value=f"=SUM(D6:D{last_rider_row})")
    c_tot_share = ws_rider.cell(row=tot_row_rider, column=5, value="100.0%")
    c_tot_id = ws_rider.cell(row=tot_row_rider, column=6, value=f"=SUM(F6:F{last_rider_row})")
    c_tot_mdc = ws_rider.cell(row=tot_row_rider, column=7, value=f"=SUM(G6:G{last_rider_row})")
    c_tot_rc = ws_rider.cell(row=tot_row_rider, column=8, value=f"=SUM(H6:H{last_rider_row})")
    c_tot_loa = ws_rider.cell(row=tot_row_rider, column=9, value=f"=SUM(I6:I{last_rider_row})")

    for c in [c_tot_assigned, c_tot_inv, c_tot_id, c_tot_mdc, c_tot_rc, c_tot_loa]:
        c.font = bold_font
        c.alignment = align_right
        c.number_format = "#,##0"

    c_tot_share.font = bold_font
    c_tot_share.alignment = align_right

    for col in range(1, 10):
        cell = ws_rider.cell(row=tot_row_rider, column=col)
        cell.fill = mint_ice
        cell.border = total_border

    ws_rider.auto_filter.ref = f"A5:I{last_rider_row}"

    # Auto-fit Column Dimensions for Tab 3 (Page 6 item 1: Rank column just enough!)
    ws_rider.column_dimensions['A'].width = 8   # Page 6 item 1: Rank column just enough
    ws_rider.column_dimensions['B'].width = 30  # Rider Name
    ws_rider.column_dimensions['C'].width = 22  # # of Waybills Assigned
    ws_rider.column_dimensions['D'].width = 16  # Total Invalids
    ws_rider.column_dimensions['E'].width = 13  # % Share
    ws_rider.column_dimensions['F'].width = 14  # ID Defects
    ws_rider.column_dimensions['G'].width = 15  # MDC Defects
    ws_rider.column_dimensions['H'].width = 14  # RC Defects
    ws_rider.column_dimensions['I'].width = 14  # LOA Defects

    # =========================================================================
    # CHART 2 ON TAB 1: Top 10 Riders Defect Breakdown by Document
    # Page 4 item 6: Include rider's name, make texts readable, NOT CONGESTED
    # =========================================================================
    if len(top_riders) > 0:
        chart_stacked = BarChart()
        chart_stacked.type = "bar"
        chart_stacked.grouping = "stacked"
        chart_stacked.overlap = 100
        chart_stacked.title = "Top 10 Riders Defect Breakdown by Document"
        chart_stacked.x_axis.title = "Rider Name"
        chart_stacked.y_axis.title = "Number of Invalids by Document"
        chart_stacked.width = 24
        chart_stacked.height = 14

        # Columns F to I in ws_rider (ID, MDC, RC, LOA) for top 10
        data_stacked = Reference(ws_rider, min_col=6, min_row=5, max_col=9, max_row=5 + len(top_riders))
        cats_stacked = Reference(ws_rider, min_col=2, min_row=6, max_row=5 + len(top_riders))
        chart_stacked.add_data(data_stacked, titles_from_data=True)

        top10_rider_names = [r[0] for r in top_riders]
        st_pts = [StrVal(idx=i, v=str(lbl)) for i, lbl in enumerate(top10_rider_names)]
        st_cache = StrData(ptCount=len(top10_rider_names), pt=st_pts)
        for s in chart_stacked.series:
            s.cat = AxDataSource(strRef=StrRef(f=str(cats_stacked), strCache=st_cache))

        chart_stacked.x_axis.scaling.orientation = "maxMin"
        chart_stacked.x_axis.tickLblPos = "nextTo"
        chart_stacked.y_axis.tickLblPos = "nextTo"
        chart_stacked.legend.legendPos = "t"

        # Place Chart 2 side-by-side with Chart 1 starting at H18
        ws_sum.add_chart(chart_stacked, "H18")

    # =========================================================================
    # CHART 3 ON TAB 1 & TAB 3: Rider Invalid Waybill Distribution Count
    # Page 4 item 7: Vertical bar graph/chart with riders' name below it.
    # Sort them by rider's surname, not by ranking.
    # Remove "Riders (Ranked #1 to #58)" below and change with their names instead.
    # =========================================================================
    # We create a dedicated surname-sorted table in ws_rider starting at column L
    riders_sorted_by_surname = sorted(
        all_riders_ranked, 
        key=lambda item: get_rider_surname(item[0]).lower()
    )

    ws_rider.cell(row=5, column=12, value="Surname").font = white_header_font
    ws_rider.cell(row=5, column=12).fill = teal_primary
    ws_rider.cell(row=5, column=13, value="Rider Name (Alphabetical)").font = white_header_font
    ws_rider.cell(row=5, column=13).fill = teal_primary
    ws_rider.cell(row=5, column=14, value="Invalid Count").font = white_header_font
    ws_rider.cell(row=5, column=14).fill = teal_primary

    for idx, (r_name, tot_cnt) in enumerate(riders_sorted_by_surname, start=1):
        r_num = 5 + idx
        s_name = get_rider_surname(r_name)
        c1 = ws_rider.cell(row=r_num, column=12, value=s_name)
        c2 = ws_rider.cell(row=r_num, column=13, value=r_name)
        c3 = ws_rider.cell(row=r_num, column=14, value=tot_cnt)

        c1.alignment = align_left
        c2.alignment = align_left
        c3.alignment = align_right

        c1.font = bold_font
        c2.font = regular_font
        c3.font = bold_font
        c3.number_format = "#,##0"

        fill_row = mint_zebra if idx % 2 == 0 else white_fill
        for c in [c1, c2, c3]:
            c.fill = fill_row
            c.border = thin_border

    ws_rider.column_dimensions['L'].width = 16
    ws_rider.column_dimensions['M'].width = 28
    ws_rider.column_dimensions['N'].width = 15

    # Build Vertical Bar Graph (Column Chart) sorted by surname
    chart_rider_surname = BarChart()
    chart_rider_surname.type = "col"
    chart_rider_surname.style = 10
    chart_rider_surname.title = "Rider Invalid Waybill Distribution Count"
    chart_rider_surname.y_axis.title = "Number of Invalid Waybills"
    chart_rider_surname.x_axis.title = "Rider Name (Alphabetical by Surname)"
    chart_rider_surname.width = 38
    chart_rider_surname.height = 15

    data_surname = Reference(ws_rider, min_col=14, min_row=5, max_row=5 + len(riders_sorted_by_surname))
    cats_surname = Reference(ws_rider, min_col=12, min_row=6, max_row=5 + len(riders_sorted_by_surname))
    chart_rider_surname.add_data(data_surname, titles_from_data=True)

    surname_labels = [get_rider_surname(r[0]) for r in riders_sorted_by_surname]
    sn_pts = [StrVal(idx=i, v=str(lbl)) for i, lbl in enumerate(surname_labels)]
    sn_cache = StrData(ptCount=len(surname_labels), pt=sn_pts)
    chart_rider_surname.series[0].cat = AxDataSource(strRef=StrRef(f=str(cats_surname), strCache=sn_cache))

    chart_rider_surname.x_axis.tickLblPos = "nextTo"
    chart_rider_surname.y_axis.tickLblPos = "nextTo"
    chart_rider_surname.x_axis.tickLblSkip = 1
    chart_rider_surname.legend = None

    # Clean data labels
    chart_rider_surname.dataLabels = DataLabelList()
    chart_rider_surname.dataLabels.showVal = True
    chart_rider_surname.dataLabels.showCatName = False
    chart_rider_surname.dataLabels.showSerName = False
    chart_rider_surname.dataLabels.showLegendKey = False

    # Place Chart 3 below Chart 1 & 2 on Tab 1 starting at A34
    ws_sum.add_chart(chart_rider_surname, "A34")

    # Also place Chart 3 on Tab 3 (Rider Defect Rankings) starting at P5 (Page 6 item 2)
    chart_rider_surname_tab3 = BarChart()
    chart_rider_surname_tab3.type = "col"
    chart_rider_surname_tab3.style = 10
    chart_rider_surname_tab3.title = "Rider Invalid Waybill Distribution Count (Alphabetical by Surname)"
    chart_rider_surname_tab3.y_axis.title = "Number of Invalid Waybills"
    chart_rider_surname_tab3.x_axis.title = "Rider Surname"
    chart_rider_surname_tab3.width = 32
    chart_rider_surname_tab3.height = 16
    chart_rider_surname_tab3.add_data(data_surname, titles_from_data=True)
    chart_rider_surname_tab3.series[0].cat = AxDataSource(strRef=StrRef(f=str(cats_surname), strCache=sn_cache))
    chart_rider_surname_tab3.x_axis.tickLblPos = "nextTo"
    chart_rider_surname_tab3.y_axis.tickLblPos = "nextTo"
    chart_rider_surname_tab3.x_axis.tickLblSkip = 1
    chart_rider_surname_tab3.legend = None
    ws_rider.add_chart(chart_rider_surname_tab3, "P5")

    # Auto-fit Column Dimensions for Tab 1
    ws_sum.column_dimensions['A'].width = 30
    ws_sum.column_dimensions['B'].width = 15
    ws_sum.column_dimensions['C'].width = 14
    ws_sum.column_dimensions['D'].width = 34
    ws_sum.column_dimensions['E'].width = 6
    ws_sum.column_dimensions['F'].width = 8
    ws_sum.column_dimensions['G'].width = 28
    ws_sum.column_dimensions['H'].width = 16
    ws_sum.column_dimensions['I'].width = 15
    ws_sum.column_dimensions['J'].width = 13
    ws_sum.column_dimensions['K'].width = 14

    # =========================================================================
    # TAB 2: RTH INVALID WAYBILLS (Page 5)
    # Page 5 item 1: The Waybill column (column A) is too long. Make it just enough.
    # Page 5 item 2: Remove the "Issue Category" column.
    # Page 5 item 3: Freeze rows 1-5.
    # =========================================================================
    ws_data = wb.create_sheet("RTH Invalid Waybills")
    ws_data.views.sheetView[0].showGridLines = True

    # Page 5 item 3: Freeze rows 1-5
    ws_data.freeze_panes = "A6"

    ws_data.merge_cells("A1:G2")
    ws_data["A1"] = f"1Life TASK MONITORING - RTH INVALID WAYBILLS MASTER RECORD LIST ({period_title_tag})"
    ws_data["A1"].font = title_font
    ws_data["A1"].fill = teal_dark
    ws_data["A1"].alignment = align_center

    ws_data.merge_cells("A3:G3")
    ws_data["A3"] = "Columns: Waybill No. | Document Involved | Document Issue (Remarks) | Rider Name | Actual Waybill Date | Validation Date | Initial Validated By"
    ws_data["A3"].font = subtitle_font
    ws_data["A3"].fill = teal_primary
    ws_data["A3"].alignment = align_center

    ws_data.merge_cells("A4:G4")
    ws_data["A4"] = f"Generated by: QA – Data and Analytics Team | 1Life Inc. Philippines | Scope: {period_subtitle_tag}"
    ws_data["A4"].font = Font(name="Segoe UI", size=9, italic=True, color="CCFBF1")
    ws_data["A4"].fill = teal_dark
    ws_data["A4"].alignment = align_center

    # Exact required columns (NO Issue Category per Page 5 item 2)
    master_headers = [
        "Waybill No.", "Document Involved", "Document Issue (Remarks)",
        "Rider Name", "Actual Waybill Date", "Validation Date", "Initial Validated By"
    ]

    for col_i, h in enumerate(master_headers, start=1):
        cell = ws_data.cell(row=5, column=col_i, value=h)
        cell.font = white_header_font
        cell.fill = teal_primary
        cell.alignment = align_center
        cell.border = thin_border

    for idx, r in enumerate(invalid_records, start=6):
        c1 = ws_data.cell(row=idx, column=1, value=str(r.get('waybill_no', '')))
        c2 = ws_data.cell(row=idx, column=2, value=r.get('document_involved', ''))
        c3 = ws_data.cell(row=idx, column=3, value=r.get('document_issue', ''))
        c4 = ws_data.cell(row=idx, column=4, value=r.get('rider', ''))
        c5 = ws_data.cell(row=idx, column=5, value=r.get('date', ''))
        c6 = ws_data.cell(row=idx, column=6, value=r.get('initial_val_date', ''))
        c7 = ws_data.cell(row=idx, column=7, value=r.get('initial_validated_by', ''))

        c1.alignment = align_center
        c2.alignment = align_center
        c3.alignment = align_left
        c4.alignment = align_left
        c5.alignment = align_center
        c6.alignment = align_center
        c7.alignment = align_left

        c1.font = Font(name="Segoe UI", size=10, bold=True, color="0F766E")
        c2.font = bold_font
        c3.font = regular_font
        c4.font = bold_font
        c5.font = regular_font
        c6.font = regular_font
        c7.font = small_font

        # Document Involved Badge Fill
        doc_str = r.get('document_involved', '')
        if 'MDC' in doc_str and 'ID' in doc_str:
            c2.fill = id_badge_fill
        elif 'MDC' in doc_str:
            c2.fill = mdc_badge_fill
        elif 'ID' in doc_str:
            c2.fill = id_badge_fill
        elif 'RC' in doc_str:
            c2.fill = rc_badge_fill
        elif 'LOA' in doc_str:
            c2.fill = loa_badge_fill

        fill_row = mint_zebra if idx % 2 == 0 else white_fill
        for c in [c1, c3, c4, c5, c6, c7]:
            c.fill = fill_row
            c.border = thin_border
        c2.border = thin_border

    ws_data.auto_filter.ref = f"A5:G{len(invalid_records) + 5}"

    # Page 5 item 1: The Waybill column (column A) is too long. Make it just enough.
    ws_data.column_dimensions['A'].width = 16  # Waybill No. (exact length for 12 digits + padding)
    ws_data.column_dimensions['B'].width = 20  # Document Involved
    ws_data.column_dimensions['C'].width = 42  # Document Issue (Remarks)
    ws_data.column_dimensions['D'].width = 30  # Rider Name
    ws_data.column_dimensions['E'].width = 15  # Actual Waybill Date
    ws_data.column_dimensions['F'].width = 15  # Validation Date
    ws_data.column_dimensions['G'].width = 24  # Initial Validated By

    # Ensure sheets are in standard order: 1. Executive Summary & Charts, 2. RTH Invalid Waybills, 3. Rider Defect Rankings
    try:
        wb.move_sheet(ws_data, offset=-1)
    except Exception:
        wb._sheets = [ws_sum, ws_data, ws_rider]

    wb.save(output_path)
    print(f"RTH Invalid Documents Report successfully generated at: {output_path}")
    return output_path

if __name__ == '__main__':
    # 1. Generate Master Overall Report
    generate_report(period_filter=None)
    # 2. Generate Latest Week Report (Saturday to Friday Cycle)
    generate_report(period_filter='latest_week')
