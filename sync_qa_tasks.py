import csv
import io
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime

SHEET_ID = "1CiVJpYv00UzioljKZx9WTgYWPPEmNU3S8bR_dUxeoMg"
SHEETS = [
    "Pharmacy",
    "Daily Waybill Log",
    "Invalid Waybills",
    "Account Merging",
    "IT Schedule Monitoring",
    "Output QA",
    "Dispatch",
    "Report",
    "Waybill Report",
]


def fetch_sheet_rows(sheet_name):
    url = (
        f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet="
        + urllib.parse.quote(sheet_name)
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    return list(csv.reader(io.StringIO(text)))


def parse_duration_hours(start_str, end_str):
    if not start_str or not end_str:
        return 0.0
    for fmt in ("%I:%M:%S %p", "%I:%M %p", "%H:%M:%S", "%H:%M"):
        try:
            t1 = datetime.strptime(start_str.strip(), fmt)
            break
        except ValueError:
            t1 = None
    for fmt in ("%I:%M:%S %p", "%I:%M %p", "%H:%M:%S", "%H:%M"):
        try:
            t2 = datetime.strptime(end_str.strip(), fmt)
            break
        except ValueError:
            t2 = None
    if t1 and t2:
        diff = (t2 - t1).total_seconds() / 3600.0
        if diff < 0:
            diff += 12.0
        return round(max(0.1, min(diff, 16.0)), 2)
    return 1.5


def safe_int(val):
    if not val:
        return 0
    s = re.sub(r"[^0-9-]", "", str(val))
    try:
        return int(s) if s and s != "-" else 0
    except ValueError:
        return 0


def main():
    raw_sheets = {}
    for name in SHEETS:
        try:
            raw_sheets[name] = fetch_sheet_rows(name)
            print(f"Fetched {name}: {len(raw_sheets[name])} rows")
        except Exception as e:
            print(f"Error fetching {name}: {e}")
            raw_sheets[name] = []

    # 1. Parse Pharmacy
    pharmacy_records = []
    for row in raw_sheets.get("Pharmacy", [])[4:]:
        if len(row) < 4:
            continue
        mon_id = row[0].strip()
        if not mon_id or not mon_id.startswith("PHARMACY"):
            continue
        start_t = row[4].strip() if len(row) > 4 else ""
        end_t = row[5].strip() if len(row) > 5 else ""
        pharmacy_records.append({
            "monitoring_id": mon_id,
            "email": row[1].strip() if len(row) > 1 else "",
            "qa": row[2].strip() if len(row) > 2 else "",
            "date": row[3].strip() if len(row) > 3 else "",
            "time_started": start_t,
            "time_ended": end_t,
            "hours": parse_duration_hours(start_t, end_t),
            "scope": row[6].strip() if len(row) > 6 else "",
            "validated_count": safe_int(row[7]) if len(row) > 7 else 0,
            "status": row[8].strip() if len(row) > 8 else "",
            "issues": row[9].strip() if len(row) > 9 else "",
        })

    # 2. Parse Daily Waybill Log
    daily_waybill_log = []
    for row in raw_sheets.get("Daily Waybill Log", [])[1:]:
        if len(row) < 10:
            continue
        date_str = row[0].strip()
        if not date_str or "DAILY WAYBILL" in date_str.upper():
            continue
        total_wb = safe_int(row[1])
        total_val = safe_int(row[9])
        if total_wb == 0 and total_val == 0:
            continue
        daily_waybill_log.append({
            "date": date_str,
            "total_waybills": total_wb,
            "quota_pct": row[2].strip(),
            "target_per_qa": safe_int(row[3]),
            "arabella": safe_int(row[4]),
            "janryl": safe_int(row[5]),
            "john_michael": safe_int(row[6]),
            "julius": safe_int(row[7]),
            "yesha": safe_int(row[8]),
            "total_validated": total_val,
            "remaining": safe_int(row[10]) if len(row) > 10 else 0,
            "status": row[11].strip() if len(row) > 11 else "",
        })

    # 3. Parse Invalid Waybills
    invalid_waybills = []
    for row in raw_sheets.get("Invalid Waybills", [])[1:]:
        if len(row) < 6:
            continue
        entry_id = row[0].strip()
        if not entry_id or entry_id == "Entry ID":
            continue
        invalid_waybills.append({
            "entry_id": entry_id,
            "date_validated": row[1].strip(),
            "qa": row[2].strip(),
            "email": row[3].strip(),
            "waybill_no": row[4].strip(),
            "issue": row[5].strip(),
            "rider": row[6].strip() if len(row) > 6 else "",
            "pharmacy_id": row[7].strip() if len(row) > 7 else "",
            "logged_at": row[8].strip() if len(row) > 8 else "",
            "logged_by": row[9].strip() if len(row) > 9 else "",
        })

    # 4. Parse Account Merging
    account_merging = []
    for row in raw_sheets.get("Account Merging", [])[1:]:
        if len(row) < 6:
            continue
        mon_id = row[0].strip()
        qa_name = row[2].strip() if len(row) > 2 else ""
        if not mon_id and not qa_name:
            continue
        if "MonitoringID" in mon_id or "Input appropriate" in qa_name:
            continue
        start_t = row[4].strip() if len(row) > 4 else ""
        end_t = row[5].strip() if len(row) > 5 else ""
        locs_text = row[6].strip() if len(row) > 6 else ""
        locs_count = safe_int(row[10]) if len(row) > 10 else 0
        if locs_count == 0 and locs_text:
            locs_count = len([x for x in locs_text.splitlines() if x.strip()])
        merged_count = safe_int(row[11]) if len(row) > 11 else 0
        account_merging.append({
            "monitoring_id": mon_id or f"MERGING-{len(account_merging)+1}",
            "email": row[1].strip() if len(row) > 1 else "",
            "qa": qa_name,
            "date": row[3].strip() if len(row) > 3 else "",
            "time_started": start_t,
            "time_ended": end_t,
            "hours": parse_duration_hours(start_t, end_t),
            "locations_checked": locs_text,
            "locations_count": locs_count,
            "merged_accounts": merged_count,
            "modified_by": row[9].strip() if len(row) > 9 else "",
        })

    # 5. Parse Output QA
    output_qa = []
    for row in raw_sheets.get("Output QA", [])[1:]:
        if len(row) < 7:
            continue
        ticket = row[1].strip() if len(row) > 1 else ""
        report_name = row[3].strip() if len(row) > 3 else ""
        qa_checker = row[6].strip() if len(row) > 6 else ""
        if not ticket and not report_name and not qa_checker:
            continue
        if ticket == "TicketNumber" or report_name == "Report / Dashboard":
            continue
        start_t = row[7].strip() if len(row) > 7 else ""
        end_t = row[8].strip() if len(row) > 8 else ""
        output_qa.append({
            "monitoring_id": row[0].strip() or f"OUTQA-{len(output_qa)+1}",
            "ticket_no": ticket or "-",
            "date": row[2].strip() if len(row) > 2 else "",
            "report_name": report_name,
            "cutoff_date": row[4].strip() if len(row) > 4 else "",
            "data_analyst": row[5].strip() if len(row) > 5 else "",
            "qa_checker": qa_checker,
            "qa_start": start_t,
            "qa_end": end_t,
            "hours": parse_duration_hours(start_t, end_t),
            "accuracy": row[9].strip() if len(row) > 9 and row[9].strip() else "PASS",
            "completeness": row[10].strip() if len(row) > 10 and row[10].strip() else "PASS",
            "logic": row[11].strip() if len(row) > 11 and row[11].strip() else "PASS",
            "formatting": row[12].strip() if len(row) > 12 and row[12].strip() else "PASS",
            "error_count": safe_int(row[13]) if len(row) > 13 else 0,
            "critical_error": row[14].strip() if len(row) > 14 else "NO",
            "overall_result": row[15].strip() if len(row) > 15 and row[15].strip() else "PASSED",
            "remarks": row[16].strip() if len(row) > 16 else "",
            "corrective_action": row[17].strip() if len(row) > 17 else "",
            "resolution_status": row[18].strip() if len(row) > 18 and row[18].strip() else "RESOLVED",
        })

    # 6. Parse Dispatch QA
    dispatch_qa = []
    for row in raw_sheets.get("Dispatch", [])[1:]:
        if len(row) < 6:
            continue
        mon_id = row[0].strip()
        qa_name = row[2].strip() if len(row) > 2 else ""
        if not mon_id or "MonitoringID" in mon_id or "Input appropriate" in qa_name:
            continue
        start_t = row[4].strip() if len(row) > 4 else ""
        end_t = row[5].strip() if len(row) > 5 else ""
        dispatch_qa.append({
            "monitoring_id": mon_id,
            "email": row[1].strip() if len(row) > 1 else "",
            "qa": qa_name,
            "date": row[3].strip() if len(row) > 3 else "",
            "time_started": start_t,
            "time_ended": end_t,
            "hours": parse_duration_hours(start_t, end_t),
            "scope": row[6].strip() if len(row) > 6 else "",
            "overridden_count": safe_int(row[7]) if len(row) > 7 else 0,
            "status": row[8].strip() if len(row) > 8 else "",
            "issues": row[9].strip() if len(row) > 9 else "",
        })

    # 7. Parse IT Schedule Monitoring
    it_schedule = []
    for row in raw_sheets.get("IT Schedule Monitoring", [])[1:]:
        if len(row) < 6:
            continue
        mon_id = row[0].strip()
        qa_name = row[2].strip() if len(row) > 2 else ""
        if not mon_id or "MonitoringID" in mon_id or "Input appropriate" in qa_name:
            continue
        start_t = row[4].strip() if len(row) > 4 else ""
        end_t = row[5].strip() if len(row) > 5 else ""
        it_schedule.append({
            "monitoring_id": mon_id,
            "email": row[1].strip() if len(row) > 1 else "",
            "qa": qa_name,
            "date": row[3].strip() if len(row) > 3 else "",
            "time_started": start_t,
            "time_ended": end_t,
            "hours": parse_duration_hours(start_t, end_t),
            "scope": row[6].strip() if len(row) > 6 else "",
            "checked_count": safe_int(row[7]) if len(row) > 7 else 0,
            "linked_count": safe_int(row[8]) if len(row) > 8 else 0,
            "status": row[9].strip() if len(row) > 9 else "",
            "issues": row[10].strip() if len(row) > 10 else "",
        })

    bundle = {
        "sheet_id": SHEET_ID,
        "last_synced": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "pharmacy": pharmacy_records,
        "daily_waybill_log": daily_waybill_log,
        "invalid_waybills": invalid_waybills,
        "account_merging": account_merging,
        "output_qa": output_qa,
        "dispatch_qa": dispatch_qa,
        "it_schedule": it_schedule,
    }

    with open("qa_tasks_data.js", "w", encoding="utf-8") as f:
        f.write("// Auto-generated from 1Life QA Task Monitoring Google Sheet (1CiVJpYv00UzioljKZx9WTgYWPPEmNU3S8bR_dUxeoMg)\n")
        f.write("window.QA_MONITORING_DATA = ")
        json.dump(bundle, f, ensure_ascii=False)
        f.write(";\n")

    print("Saved qa_tasks_data.js:")
    for k in ["pharmacy", "daily_waybill_log", "invalid_waybills", "account_merging", "output_qa", "dispatch_qa", "it_schedule"]:
        print(f"  {k}: {len(bundle[k])} records")


if __name__ == "__main__":
    main()
