import urllib.request
import csv
import json
import os
import subprocess
import sys

SHEET_URL = "https://docs.google.com/spreadsheets/d/1l_WgHYJnoFJ4MrOpr6NtCwamwo-_cwdgoIb7tZ1Z-7A/export?format=csv"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "data.csv")
JSON_PATH = os.path.join(BASE_DIR, "data.json")

def sync():
    print("Fetching latest data from Google Sheets...")
    req = urllib.request.Request(
        SHEET_URL, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        content = response.read().decode('utf-8', errors='replace')
    
    with open(CSV_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Updated {CSV_PATH}")

    # Parse to JSON
    lines = list(csv.reader(content.splitlines()))
    headers = [
        "date", "waybill_no", "rider", "qa_initial_status", "initial_val_date",
        "qa_initial_remarks", "initial_validated_by", "old_mdc_creation",
        "dispatch_status", "dispatch_date", "overridden_by", "final_val_status",
        "final_val_date", "final_qa_remarks", "final_validated_by", "pharma_remarks"
    ]
    records = []
    for row in lines[9:]:
        if len(row) < 16:
            row = row + [''] * (16 - len(row))
        rec = {headers[i]: row[i].strip() for i in range(16)}
        if any(rec.values()):
            wb = rec.get('waybill_no', '').strip().lower()
            d_val = rec.get('date', '').strip().lower()
            init_d = rec.get('initial_val_date', '').strip().lower()
            if wb in ('waybill no.', 'waybill no', 'waybill', 'waybill_no', 'waybill number') and d_val in ('date', 'date:'):
                continue
            if init_d in ('initial validation date', 'initial val date', 'validation date'):
                continue
            records.append(rec)
    
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(records, f, indent=2)
    print(f"Parsed and updated {len(records)} records in {JSON_PATH}")

    # Regenerate data.js
    data_js_path = os.path.join(BASE_DIR, "data.js")
    with open(data_js_path, 'w', encoding='utf-8') as f:
        f.write("// Waybill Raw Records Data\n")
        f.write("window.WAYBILL_RECORDS = ")
        json.dump(records, f)
        f.write(";\n")
    print(f"Updated {data_js_path}")

    # Run Excel generator
    gen_script = os.path.join(BASE_DIR, "generate_excel_report.py")
    if os.path.exists(gen_script):
        subprocess.run([sys.executable, gen_script], check=True)
        print("Regenerated Excel report.")

    return len(records)

if __name__ == "__main__":
    sync()
