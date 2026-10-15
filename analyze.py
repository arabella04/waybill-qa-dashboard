import csv
from collections import defaultdict, Counter

with open(r'C:\Users\1 Life\.gemini\antigravity\scratch\waybill-qa-dashboard\data.csv', mode='r', encoding='utf-8', errors='replace') as f:
    reader = csv.reader(f)
    lines = list(reader)

headers = lines[8]
data = lines[9:]

print(f"Total rows in data: {len(data)}")

qa_initial = defaultdict(lambda: defaultdict(int))
qa_final = defaultdict(lambda: defaultdict(int))
dispatch_ops = defaultdict(lambda: defaultdict(int))

for r in data:
    i_qa = r[6].strip() or 'Unassigned'
    i_stat = r[3].strip() or 'Unassigned'
    qa_initial[i_qa][i_stat] += 1
    qa_initial[i_qa]['TOTAL'] += 1

    f_qa = r[14].strip()
    f_stat = r[11].strip()
    if f_qa or f_stat:
        qa_final[f_qa or 'Unassigned'][f_stat or 'Blank'] += 1
        qa_final[f_qa or 'Unassigned']['TOTAL'] += 1

    d_person = r[10].strip()
    d_stat = r[8].strip()
    if d_person or d_stat == 'Override Done':
        dispatch_ops[d_person or 'Unassigned'][d_stat or 'Blank'] += 1
        dispatch_ops[d_person or 'Unassigned']['TOTAL'] += 1

print("\n=== INITIAL QA BREAKDOWN ===")
for qa, stats in sorted(qa_initial.items()):
    print(f"{qa}: {dict(stats)}")

print("\n=== FINAL QA BREAKDOWN ===")
for qa, stats in sorted(qa_final.items()):
    print(f"{qa}: {dict(stats)}")

print("\n=== DISPATCH BREAKDOWN ===")
for dp, stats in sorted(dispatch_ops.items()):
    print(f"{dp}: {dict(stats)}")

print("\n=== BY WAYBILL DATE ===")
by_date = defaultdict(lambda: defaultdict(int))
for r in data:
    d = r[0].strip()
    by_date[d]['Total'] += 1
    by_date[d]['Init_Valid'] += 1 if r[3].strip() == 'Valid' else 0
    by_date[d]['Init_Invalid'] += 1 if r[3].strip() == 'Invalid' else 0
    by_date[d]['Init_ForVal'] += 1 if r[3].strip() == 'For Validation' else 0
    by_date[d]['Disp_OverrideDone'] += 1 if r[8].strip() == 'Override Done' else 0
    by_date[d]['Final_Valid'] += 1 if r[11].strip() == 'Valid' else 0
    by_date[d]['Final_Invalid'] += 1 if r[11].strip() == 'Invalid' else 0

for d in sorted(by_date.keys()):
    print(f"{d}: {dict(by_date[d])}")
