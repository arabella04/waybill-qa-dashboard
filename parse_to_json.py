import csv
import json

with open(r'C:\Users\1 Life\.gemini\antigravity\scratch\waybill-qa-dashboard\data.csv', mode='r', encoding='utf-8', errors='replace') as f:
    reader = csv.reader(f)
    lines = list(reader)

headers = [
    "date",
    "waybill_no",
    "rider",
    "qa_initial_status",
    "initial_val_date",
    "qa_initial_remarks",
    "initial_validated_by",
    "old_mdc_creation",
    "dispatch_status",
    "dispatch_date",
    "overridden_by",
    "final_val_status",
    "final_val_date",
    "final_qa_remarks",
    "final_validated_by",
    "pharma_remarks"
]

records = []
for row in lines[9:]:
    if len(row) < 16:
        row = row + [''] * (16 - len(row))
    rec = {
        headers[i]: row[i].strip() for i in range(16)
    }
    # Only include valid non-header data rows
    if any(rec.values()):
        wb = rec.get('waybill_no', '').strip().lower()
        d_val = rec.get('date', '').strip().lower()
        init_d = rec.get('initial_val_date', '').strip().lower()
        if wb in ('waybill no.', 'waybill no', 'waybill', 'waybill_no', 'waybill number') and d_val in ('date', 'date:'):
            continue
        if init_d in ('initial validation date', 'initial val date', 'validation date'):
            continue
        records.append(rec)

print(f"Parsed {len(records)} records")

with open(r'C:\Users\1 Life\.gemini\antigravity\scratch\waybill-qa-dashboard\data.json', 'w', encoding='utf-8') as f:
    json.dump(records, f, indent=2)

print("Saved to data.json")
