import json

with open(r'C:\Users\1 Life\.gemini\antigravity\scratch\waybill-qa-dashboard\data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

with open(r'C:\Users\1 Life\.gemini\antigravity\scratch\waybill-qa-dashboard\data.js', 'w', encoding='utf-8') as f:
    f.write("// Waybill Raw Records Data\n")
    f.write("window.WAYBILL_RECORDS = ")
    json.dump(data, f)
    f.write(";\n")

print("Created data.js successfully.")
