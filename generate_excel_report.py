import json
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

with open(r'C:\Users\1 Life\.gemini\antigravity\scratch\waybill-qa-dashboard\data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

wb = openpyxl.Workbook()

# Setup styles with Blue / Light Blue Theme
navy_header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")  # Dark blue
blue_header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")  # Primary blue
sky_header_fill = PatternFill(start_color="0284C7", end_color="0284C7", fill_type="solid")   # Sky blue
light_blue_fill = PatternFill(start_color="EFF6FF", end_color="EFF6FF", fill_type="solid")   # Very light blue
ice_blue_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")     # Ice blue accent
accent_fill = PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid")       # Light cyan-blue
zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

white_title_font = Font(name="Segoe UI", size=16, bold=True, color="FFFFFF")
subtitle_font = Font(name="Segoe UI", size=10, italic=True, color="E0E7FF")
white_header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
bold_font = Font(name="Segoe UI", size=11, bold=True, color="1E293B")
regular_font = Font(name="Segoe UI", size=10, color="334155")
small_font = Font(name="Segoe UI", size=9, color="64748B")

thin_border_side = Side(border_style="thin", color="CBD5E1")
thin_border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
thick_bottom_side = Side(border_style="medium", color="1E3A8A")
summary_border = Border(top=thin_border_side, bottom=thick_bottom_side)

align_center = Alignment(horizontal="center", vertical="center")
align_left = Alignment(horizontal="left", vertical="center")
align_right = Alignment(horizontal="right", vertical="center")

# ==========================================
# 1. EXECUTIVE SUMMARY SHEET
# ==========================================
ws_summary = wb.active
ws_summary.title = "Executive Summary"
ws_summary.views.sheetView[0].showGridLines = True

# Title block
ws_summary.merge_cells("A1:G2")
title_cell = ws_summary["A1"]
title_cell.value = "WAYBILL QA & DISPATCH PROGRESS REPORT"
title_cell.font = white_title_font
title_cell.fill = navy_header_fill
title_cell.alignment = Alignment(horizontal="center", vertical="center")

ws_summary.merge_cells("A3:G3")
sub_cell = ws_summary["A3"]
sub_cell.value = f"Generated on {datetime.now().strftime('%B %d, %Y')} | Theme: Corporate Light Blue"
sub_cell.font = subtitle_font
sub_cell.fill = blue_header_fill
sub_cell.alignment = Alignment(horizontal="center", vertical="center")

# KPI Summary Cards in Excel
kpis = [
    ("TOTAL WAYBILLS", len(data), "100.0% Logged", "A5:B5", "A6:B6", "A7:B7"),
    ("INITIAL QA VALIDATED", sum(1 for r in data if r['qa_initial_status'] in ('Valid', 'Invalid')), "90.3% Processed", "C5:C5", "C6:C6", "C7:C7"),
    ("INITIAL VALID", sum(1 for r in data if r['qa_initial_status'] == 'Valid'), "61.4% Quality Pass", "D5:D5", "D6:D6", "D7:D7"),
    ("INITIAL INVALID", sum(1 for r in data if r['qa_initial_status'] == 'Invalid'), "29.0% Re-routed to Disp.", "E5:E5", "E6:E6", "E7:E7"),
    ("DISPATCH OVERRIDES", sum(1 for r in data if r['dispatch_status'] == 'Override Done'), "28.9% Invalid Resolved", "F5:F5", "F6:F6", "F7:F7"),
    ("FINAL QA VALIDATED", sum(1 for r in data if r['final_val_status'] in ('Valid', 'Invalid')), "462 Final Signed", "G5:G5", "G6:G7", "G7:G7")
]

# Section 1: Executive KPI Table
ws_summary["A9"] = "OVERALL PIPELINE METRICS"
ws_summary["A9"].font = Font(name="Segoe UI", size=13, bold=True, color="1E3A8A")

headers_kpi = ["Stage / Metric", "Count", "% of Total", "Status / Notes"]
for col_idx, h in enumerate(headers_kpi, start=1):
    c = ws_summary.cell(row=10, column=col_idx, value=h)
    c.font = white_header_font
    c.fill = blue_header_fill
    c.alignment = align_center
    c.border = thin_border

total_wb = len(data)
init_valid = sum(1 for r in data if r['qa_initial_status'] == 'Valid')
init_invalid = sum(1 for r in data if r['qa_initial_status'] == 'Invalid')
init_pending = sum(1 for r in data if r['qa_initial_status'] == 'For Validation')
init_total_done = init_valid + init_invalid

disp_override = sum(1 for r in data if r['dispatch_status'] == 'Override Done')
disp_pending = sum(1 for r in data if r['dispatch_status'] == 'Pending')
disp_no_action = sum(1 for r in data if r['dispatch_status'] == 'No Action')

final_valid = sum(1 for r in data if r['final_val_status'] == 'Valid')
final_invalid = sum(1 for r in data if r['final_val_status'] == 'Invalid')
final_total_done = final_valid + final_invalid
final_pending = total_wb - final_total_done

pipeline_rows = [
    ("Total Waybills Ingestion", total_wb, "=B11/B11", "Total waybills registered in system"),
    ("Initial QA Validation (Completed)", init_total_done, "=B12/B11", "Waybills evaluated by Initial QA team"),
    ("  └ Valid (Initial QA)", init_valid, "=B13/B11", "Cleared first quality assurance check"),
    ("  └ Invalid (Initial QA)", init_invalid, "=B14/B11", "Flagged with defects/remarks, escalated to Dispatch"),
    ("  └ Pending Initial QA (For Validation)", init_pending, "=B15/B11", "Awaiting Initial QA assignment/action"),
    ("Dispatch Review of Invalid Waybills", init_invalid, "=B16/B11", "Total invalid waybills subject to Dispatch review"),
    ("  └ Dispatch Override Done", disp_override, "=B17/B16", "Corrected and overridden by Dispatch agents"),
    ("  └ Dispatch Review Pending", disp_pending, "=B18/B16", "Still pending Dispatch corrective action"),
    ("Final QA Validation (Completed)", final_total_done, "=B19/B11", "Waybills that reached and completed Final QA"),
    ("  └ Final QA Valid", final_valid, "=B20/B19", "Fully approved & finalized for delivery/billing"),
    ("  └ Final QA Invalid", final_invalid, "=B21/B19", "Final rejection post-dispatch review"),
    ("  └ Awaiting Final QA", final_pending, "=B22/B11", "In transit or pending batch final check")
]

for idx, (label, count, pct_formula, notes) in enumerate(pipeline_rows, start=11):
    c1 = ws_summary.cell(row=idx, column=1, value=label)
    c2 = ws_summary.cell(row=idx, column=2, value=count)
    c3 = ws_summary.cell(row=idx, column=3, value=pct_formula)
    c4 = ws_summary.cell(row=idx, column=4, value=notes)

    c1.font = bold_font if not label.startswith("  └") else regular_font
    c2.font = bold_font if not label.startswith("  └") else regular_font
    c3.font = bold_font if not label.startswith("  └") else regular_font
    c4.font = small_font

    c1.alignment = align_left
    c2.alignment = align_right
    c3.alignment = align_right
    c4.alignment = align_left

    c2.number_format = "#,##0"
    c3.number_format = "0.0%"

    fill_to_use = ice_blue_fill if not label.startswith("  └") else (zebra_fill if idx % 2 == 0 else light_blue_fill)
    for c in [c1, c2, c3, c4]:
        c.fill = fill_to_use
        c.border = thin_border

# ==========================================
# 2. DAILY BREAKDOWN SHEET
# ==========================================
ws_daily = wb.create_sheet("Daily Breakdown")
ws_daily.views.sheetView[0].showGridLines = True

ws_daily.merge_cells("A1:K2")
d_title = ws_daily["A1"]
d_title.value = "DAILY QA VALIDATION & WAYBILL PROGRESS REPORT"
d_title.font = white_title_font
d_title.fill = navy_header_fill
d_title.alignment = align_center

daily_headers = [
    "Validation Date (QA)", "Actual Waybill Date", "Total Waybills", "Initial Valid", "Initial Invalid", 
    "Initial Pending", "Initial Valid %", "Dispatch Override", 
    "Final Valid", "Final Invalid", "Total Final Validated"
]

for col_idx, h in enumerate(daily_headers, start=1):
    c = ws_daily.cell(row=4, column=col_idx, value=h)
    c.font = white_header_font
    c.fill = blue_header_fill
    c.alignment = align_center
    c.border = thin_border

# Group by Validation Date (QA Work Date)
from collections import defaultdict
by_val_date = defaultdict(lambda: {'total': 0, 'init_valid': 0, 'init_invalid': 0, 'init_pending': 0, 'disp_override': 0, 'final_valid': 0, 'final_invalid': 0, 'wb_dates': set()})
for r in data:
    vd = r.get('initial_val_date') or 'Pending'
    st = by_val_date[vd]
    st['total'] += 1
    if r.get('date'):
        st['wb_dates'].add(r['date'])
    if r['qa_initial_status'] == 'Valid':
        st['init_valid'] += 1
    elif r['qa_initial_status'] == 'Invalid':
        st['init_invalid'] += 1
    elif r['qa_initial_status'] == 'For Validation':
        st['init_pending'] += 1

    if r['dispatch_status'] == 'Override Done':
        st['disp_override'] += 1

    if r['final_val_status'] == 'Valid':
        st['final_valid'] += 1
    elif r['final_val_status'] == 'Invalid':
        st['final_invalid'] += 1

def is_valid_slash_date(val):
    if not val or val == 'Pending':
        return False
    parts = val.split('/')
    return len(parts) == 3 and all(p.isdigit() for p in parts)

dates_sorted = sorted([d for d in by_val_date.keys() if is_valid_slash_date(d)], key=lambda x: [int(p) for p in x.split('/')])
if 'Pending' in by_val_date:
    dates_sorted.append('Pending')

start_row = 5
for idx, d_str in enumerate(dates_sorted, start=start_row):
    st = by_val_date[d_str]
    wb_dates_str = ", ".join(sorted(list(st['wb_dates']), key=lambda x: [int(p) for p in x.split('/') if p.isdigit()] if '/' in x else [0])) if st['wb_dates'] else "-"
    
    c1 = ws_daily.cell(row=idx, column=1, value=d_str)
    c2 = ws_daily.cell(row=idx, column=2, value=wb_dates_str)
    c3 = ws_daily.cell(row=idx, column=3, value=st['total'])
    c4 = ws_daily.cell(row=idx, column=4, value=st['init_valid'])
    c5 = ws_daily.cell(row=idx, column=5, value=st['init_invalid'])
    c6 = ws_daily.cell(row=idx, column=6, value=st['init_pending'])
    c7 = ws_daily.cell(row=idx, column=7, value=f"=D{idx}/C{idx}")
    c8 = ws_daily.cell(row=idx, column=8, value=st['disp_override'])
    c9 = ws_daily.cell(row=idx, column=9, value=st['final_valid'])
    c10 = ws_daily.cell(row=idx, column=10, value=st['final_invalid'])
    c11 = ws_daily.cell(row=idx, column=11, value=f"=I{idx}+J{idx}")

    c1.alignment = align_center
    c2.alignment = align_center
    c1.font = bold_font
    c2.font = regular_font

    for c in [c3, c4, c5, c6, c8, c9, c10, c11]:
        c.alignment = align_right
        c.number_format = "#,##0"
        c.font = regular_font
    c7.alignment = align_right
    c7.number_format = "0.0%"
    c7.font = regular_font

    fill_row = zebra_fill if idx % 2 == 0 else PatternFill(fill_type=None)
    for c in [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11]:
        if fill_row.fill_type:
            c.fill = fill_row
        c.border = thin_border

total_daily_row = start_row + len(dates_sorted)
ws_daily.cell(row=total_daily_row, column=1, value="TOTAL")
ws_daily.cell(row=total_daily_row, column=2, value="-")
ws_daily.cell(row=total_daily_row, column=3, value=f"=SUM(C{start_row}:C{total_daily_row-1})")
ws_daily.cell(row=total_daily_row, column=4, value=f"=SUM(D{start_row}:D{total_daily_row-1})")
ws_daily.cell(row=total_daily_row, column=5, value=f"=SUM(E{start_row}:E{total_daily_row-1})")
ws_daily.cell(row=total_daily_row, column=6, value=f"=SUM(F{start_row}:F{total_daily_row-1})")
ws_daily.cell(row=total_daily_row, column=7, value=f"=D{total_daily_row}/C{total_daily_row}")
ws_daily.cell(row=total_daily_row, column=8, value=f"=SUM(H{start_row}:H{total_daily_row-1})")
ws_daily.cell(row=total_daily_row, column=9, value=f"=SUM(I{start_row}:I{total_daily_row-1})")
ws_daily.cell(row=total_daily_row, column=10, value=f"=SUM(J{start_row}:J{total_daily_row-1})")
ws_daily.cell(row=total_daily_row, column=11, value=f"=SUM(K{start_row}:K{total_daily_row-1})")

for col in range(1, 12):
    cell = ws_daily.cell(row=total_daily_row, column=col)
    cell.font = bold_font
    cell.fill = ice_blue_fill
    cell.border = summary_border
    if col in (1, 2):
        cell.alignment = align_center
    elif col == 7:
        cell.alignment = align_right
        cell.number_format = "0.0%"
    else:
        cell.alignment = align_right
        cell.number_format = "#,##0"


# ==========================================
# 3. QA PERFORMANCE REPORT SHEET
# ==========================================
ws_qa = wb.create_sheet("QA Performance")
ws_qa.views.sheetView[0].showGridLines = True

ws_qa.merge_cells("A1:K2")
qa_title = ws_qa["A1"]
qa_title.value = "QA TEAM VALIDATION REPORT (INITIAL & FINAL)"
qa_title.font = white_title_font
qa_title.fill = navy_header_fill
qa_title.alignment = align_center

qa_headers = [
    "QA Specialist", "Initial Handled", "Initial Valid", "Initial Invalid", 
    "Initial Pending", "Initial Valid %", "Final Handled", "Final Valid", 
    "Final Invalid", "Final Valid %", "Total All Validations"
]

for col_idx, h in enumerate(qa_headers, start=1):
    c = ws_qa.cell(row=4, column=col_idx, value=h)
    c.font = white_header_font
    c.fill = sky_header_fill
    c.alignment = align_center
    c.border = thin_border

qa_names = sorted(list(set([r['initial_validated_by'] for r in data if r['initial_validated_by']] + 
                           [r['final_validated_by'] for r in data if r['final_validated_by']])))

qa_start_row = 5
for idx, name in enumerate(qa_names, start=qa_start_row):
    init_h = sum(1 for r in data if r['initial_validated_by'] == name)
    init_v = sum(1 for r in data if r['initial_validated_by'] == name and r['qa_initial_status'] == 'Valid')
    init_i = sum(1 for r in data if r['initial_validated_by'] == name and r['qa_initial_status'] == 'Invalid')
    init_p = sum(1 for r in data if r['initial_validated_by'] == name and r['qa_initial_status'] == 'For Validation')

    final_h = sum(1 for r in data if r['final_validated_by'] == name)
    final_v = sum(1 for r in data if r['final_validated_by'] == name and r['final_val_status'] == 'Valid')
    final_i = sum(1 for r in data if r['final_validated_by'] == name and r['final_val_status'] == 'Invalid')

    c1 = ws_qa.cell(row=idx, column=1, value=name)
    c2 = ws_qa.cell(row=idx, column=2, value=init_h)
    c3 = ws_qa.cell(row=idx, column=3, value=init_v)
    c4 = ws_qa.cell(row=idx, column=4, value=init_i)
    c5 = ws_qa.cell(row=idx, column=5, value=init_p)
    c6 = ws_qa.cell(row=idx, column=6, value=f"=C{idx}/B{idx}")
    c7 = ws_qa.cell(row=idx, column=7, value=final_h)
    c8 = ws_qa.cell(row=idx, column=8, value=final_v)
    c9 = ws_qa.cell(row=idx, column=9, value=final_i)
    c10 = ws_qa.cell(row=idx, column=10, value=f'=IF(G{idx}>0, H{idx}/G{idx}, 0)')
    c11 = ws_qa.cell(row=idx, column=11, value=f'=B{idx}+G{idx}')

    c1.alignment = align_left
    c1.font = bold_font
    for c in [c2, c3, c4, c5, c7, c8, c9, c11]:
        c.alignment = align_right
        c.number_format = "#,##0"
        c.font = regular_font
    for c in [c6, c10]:
        c.alignment = align_right
        c.number_format = "0.0%"
        c.font = regular_font

    fill_row = zebra_fill if idx % 2 == 0 else PatternFill(fill_type=None)
    for c in [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11]:
        if fill_row.fill_type:
            c.fill = fill_row
        c.border = thin_border

total_qa_row = qa_start_row + len(qa_names)
ws_qa.cell(row=total_qa_row, column=1, value="TOTAL")
ws_qa.cell(row=total_qa_row, column=2, value=f"=SUM(B{qa_start_row}:B{total_qa_row-1})")
ws_qa.cell(row=total_qa_row, column=3, value=f"=SUM(C{qa_start_row}:C{total_qa_row-1})")
ws_qa.cell(row=total_qa_row, column=4, value=f"=SUM(D{qa_start_row}:D{total_qa_row-1})")
ws_qa.cell(row=total_qa_row, column=5, value=f"=SUM(E{qa_start_row}:E{total_qa_row-1})")
ws_qa.cell(row=total_qa_row, column=6, value=f"=C{total_qa_row}/B{total_qa_row}")
ws_qa.cell(row=total_qa_row, column=7, value=f"=SUM(G{qa_start_row}:G{total_qa_row-1})")
ws_qa.cell(row=total_qa_row, column=8, value=f"=SUM(H{qa_start_row}:H{total_qa_row-1})")
ws_qa.cell(row=total_qa_row, column=9, value=f"=SUM(I{qa_start_row}:I{total_qa_row-1})")
ws_qa.cell(row=total_qa_row, column=10, value=f"=H{total_qa_row}/G{total_qa_row}")
ws_qa.cell(row=total_qa_row, column=11, value=f"=SUM(K{qa_start_row}:K{total_qa_row-1})")

for col in range(1, 12):
    cell = ws_qa.cell(row=total_qa_row, column=col)
    cell.font = bold_font
    cell.fill = ice_blue_fill
    cell.border = summary_border
    if col == 1:
        cell.alignment = align_left
    elif col in (6, 10):
        cell.alignment = align_right
        cell.number_format = "0.0%"
    else:
        cell.alignment = align_right
        cell.number_format = "#,##0"


# ==========================================
# 4. DISPATCH PERFORMANCE REPORT SHEET
# ==========================================
ws_disp = wb.create_sheet("Dispatch Team")
ws_disp.views.sheetView[0].showGridLines = True

ws_disp.merge_cells("A1:G2")
disp_title = ws_disp["A1"]
disp_title.value = "DISPATCH TEAM OVERRIDE & RESOLUTION REPORT"
disp_title.font = white_title_font
disp_title.fill = navy_header_fill
disp_title.alignment = align_center

disp_headers = [
    "Dispatch Specialist", "Total Actions", "Override Done", "Pending Review", 
    "No Action", "Override Resolution %", "Share of All Overrides %"
]

for col_idx, h in enumerate(disp_headers, start=1):
    c = ws_disp.cell(row=4, column=col_idx, value=h)
    c.font = white_header_font
    c.fill = sky_header_fill
    c.alignment = align_center
    c.border = thin_border

disp_names = sorted(list(set([r['overridden_by'] for r in data if r['overridden_by']])))

disp_start_row = 5
for idx, name in enumerate(disp_names, start=disp_start_row):
    act_total = sum(1 for r in data if r['overridden_by'] == name)
    act_done = sum(1 for r in data if r['overridden_by'] == name and r['dispatch_status'] == 'Override Done')
    act_pend = sum(1 for r in data if r['overridden_by'] == name and r['dispatch_status'] == 'Pending')
    act_na = sum(1 for r in data if r['overridden_by'] == name and r['dispatch_status'] == 'No Action')

    c1 = ws_disp.cell(row=idx, column=1, value=name)
    c2 = ws_disp.cell(row=idx, column=2, value=act_total)
    c3 = ws_disp.cell(row=idx, column=3, value=act_done)
    c4 = ws_disp.cell(row=idx, column=4, value=act_pend)
    c5 = ws_disp.cell(row=idx, column=5, value=act_na)
    c6 = ws_disp.cell(row=idx, column=6, value=f"=C{idx}/B{idx}")
    c7 = ws_disp.cell(row=idx, column=7, value=f"=C{idx}/${disp_override}")

    c1.alignment = align_left
    c1.font = bold_font
    for c in [c2, c3, c4, c5]:
        c.alignment = align_right
        c.number_format = "#,##0"
        c.font = regular_font
    for c in [c6, c7]:
        c.alignment = align_right
        c.number_format = "0.0%"
        c.font = regular_font

    fill_row = zebra_fill if idx % 2 == 0 else PatternFill(fill_type=None)
    for c in [c1, c2, c3, c4, c5, c6, c7]:
        if fill_row.fill_type:
            c.fill = fill_row
        c.border = thin_border

total_disp_row = disp_start_row + len(disp_names)
ws_disp.cell(row=total_disp_row, column=1, value="TOTAL")
ws_disp.cell(row=total_disp_row, column=2, value=f"=SUM(B{disp_start_row}:B{total_disp_row-1})")
ws_disp.cell(row=total_disp_row, column=3, value=f"=SUM(C{disp_start_row}:C{total_disp_row-1})")
ws_disp.cell(row=total_disp_row, column=4, value=f"=SUM(D{disp_start_row}:D{total_disp_row-1})")
ws_disp.cell(row=total_disp_row, column=5, value=f"=SUM(E{disp_start_row}:E{total_disp_row-1})")
ws_disp.cell(row=total_disp_row, column=6, value=f"=C{total_disp_row}/B{total_disp_row}")
ws_disp.cell(row=total_disp_row, column=7, value=f"=C{total_disp_row}/{disp_override}")

for col in range(1, 8):
    cell = ws_disp.cell(row=total_disp_row, column=col)
    cell.font = bold_font
    cell.fill = ice_blue_fill
    cell.border = summary_border
    if col == 1:
        cell.alignment = align_left
    elif col in (6, 7):
        cell.alignment = align_right
        cell.number_format = "0.0%"
    else:
        cell.alignment = align_right
        cell.number_format = "#,##0"


# ==========================================
# 5. ALL WAYBILL RECORDS SHEET
# ==========================================
ws_records = wb.create_sheet("Waybill Records")
ws_records.views.sheetView[0].showGridLines = True

record_headers = [
    "Date", "Waybill No.", "Rider", "Initial QA Status", "Initial Val. Date", 
    "Initial QA Remarks", "Initial Validated By", "(Old MDC) Creation", 
    "Dispatch Status", "Dispatch Status Date", "Overridden By", 
    "Final Val. Status", "Final Val. Date", "Final QA Remarks", 
    "Final Validated By", "Pharma Remarks"
]

for col_idx, h in enumerate(record_headers, start=1):
    c = ws_records.cell(row=1, column=col_idx, value=h)
    c.font = white_header_font
    c.fill = blue_header_fill
    c.alignment = align_center
    c.border = thin_border

for row_idx, r in enumerate(data, start=2):
    ws_records.cell(row=row_idx, column=1, value=r['date'])
    ws_records.cell(row=row_idx, column=2, value=r['waybill_no'])
    ws_records.cell(row=row_idx, column=3, value=r['rider'])
    ws_records.cell(row=row_idx, column=4, value=r['qa_initial_status'])
    ws_records.cell(row=row_idx, column=5, value=r['initial_val_date'])
    ws_records.cell(row=row_idx, column=6, value=r['qa_initial_remarks'])
    ws_records.cell(row=row_idx, column=7, value=r['initial_validated_by'])
    ws_records.cell(row=row_idx, column=8, value=r['old_mdc_creation'])
    ws_records.cell(row=row_idx, column=9, value=r['dispatch_status'])
    ws_records.cell(row=row_idx, column=10, value=r['dispatch_date'])
    ws_records.cell(row=row_idx, column=11, value=r['overridden_by'])
    ws_records.cell(row=row_idx, column=12, value=r['final_val_status'])
    ws_records.cell(row=row_idx, column=13, value=r['final_val_date'])
    ws_records.cell(row=row_idx, column=14, value=r['final_qa_remarks'])
    ws_records.cell(row=row_idx, column=15, value=r['final_validated_by'])
    ws_records.cell(row=row_idx, column=16, value=r['pharma_remarks'])

    fill_r = zebra_fill if row_idx % 2 == 0 else PatternFill(fill_type=None)
    for col_idx in range(1, 17):
        c = ws_records.cell(row=row_idx, column=col_idx)
        c.font = regular_font
        if fill_r.fill_type:
            c.fill = fill_r
        c.border = thin_border

# Auto-adjust column widths for all sheets
for sheet in wb.worksheets:
    for col in sheet.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        # Sample first 100 rows for records sheet to be fast
        rows_to_sample = col[:100] if sheet.title == "Waybill Records" else col
        for cell in rows_to_sample:
            if cell.value:
                val_str = str(cell.value)
                if not val_str.startswith("="):
                    max_len = max(max_len, len(val_str))
                else:
                    max_len = max(max_len, 10)
        sheet.column_dimensions[col_letter].width = max(max_len + 4, 12)

out_path = r'C:\Users\1 Life\.gemini\antigravity\scratch\waybill-qa-dashboard\Waybill_QA_Dispatch_Progress_Report.xlsx'
wb.save(out_path)
print(f"Excel report successfully generated at {out_path}")
