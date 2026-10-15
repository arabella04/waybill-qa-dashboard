# Waybill QA & Dispatch Operational Dashboard

An interactive, responsive operational site dashboard built for monitoring waybill processing, initial QA validation, dispatch overrides, and final QA verification from the Google Spreadsheet:
**[Google Sheet Source](https://docs.google.com/spreadsheets/d/1l_WgHYJnoFJ4MrOpr6NtCwamwo-_cwdgoIb7tZ1Z-7A/edit?usp=sharing)**

---

## 🎨 Theme & Visual Styling
- **Color Palette**: Clean, modern Corporate Blue and Light Blue theme (Navy `#1e3a8a`, Royal Blue `#2563eb`, Sky Blue `#0284c7`, Ice Blue `#e0f2fe`, and Soft Slate `#f8fafc`).
- **Typography & Components**: High-contrast, clean executive layout with glassmorphic cards, colored status chips, interactive Chart.js visualizations, and responsive tables.

---

## 🚀 Quick Start Instructions

## 🌐 Web Domain Deployment (GitHub Pages, Netlify, Vercel, cPanel, etc.)

This dashboard is designed to run **100% client-side with zero backend dependencies**. It connects directly to Google Sheets from the user's web browser:

### Files to Upload to Your Web Server / Domain:
You only need to upload the following files to your web hosting root (e.g. `public_html/` or your GitHub repo):
- [`index.html`](file:///C:/Users/1%20Life/.gemini/antigravity/scratch/waybill-qa-dashboard/index.html)
- [`app.js`](file:///C:/Users/1%20Life/.gemini/antigravity/scratch/waybill-qa-dashboard/app.js)
- [`data.js`](file:///C:/Users/1%20Life/.gemini/antigravity/scratch/waybill-qa-dashboard/data.js) (cached starter dataset)
- [`Waybill_QA_Dispatch_Progress_Report.xlsx`](file:///C:/Users/1%20Life/.gemini/antigravity/scratch/waybill-qa-dashboard/Waybill_QA_Dispatch_Progress_Report.xlsx) (optional)

### Why It Now Works on Any Domain:
1. **Direct Browser Sync**: The browser connects directly to Google Sheets using Google Visualization API (JSONP) and CSV export, bypassing CORS. No Python backend or server endpoints needed.
2. **Auto-Fetch on Load**: Every time a team member visits your domain, the dashboard checks Google Sheets and updates immediately.
3. **Live "Sync Sheet" Button**: Clicking "Sync Sheet" pulls fresh data and updates all KPIs, charts, and tables in real-time.
4. **Auto-Sync Option**: Turn on the "Auto-Sync" checkbox in the header to automatically poll for new updates every 60 seconds.
5. **In-Browser Excel Generator**: Clicking "Download Excel Report" generates `.xlsx` files directly in the browser via SheetJS.

---

## 📊 Key Operational Metrics Summary

| Stage / Metric | Count | % of Pipeline | Notes |
| :--- | :---: | :---: | :--- |
| **Total Waybills Ingestion** | **2,797** | **100.0%** | Total logged across all dates |
| **Initial QA Evaluated** | **2,535** | **90.6%** | Processed by Initial QA Team |
| └ **Initial Valid (Passed)** | 1,725 | 61.7% | Cleared initial quality assurance |
| └ **Initial Invalid (Defects)** | 810 | 29.0% | Flagged with remarks, re-routed to Dispatch |
| └ **Pending Initial QA** | 262 | 9.4% | Still awaiting Initial QA validation |
| **Dispatch Override Review** | **810** | **100.0%** | Total invalid waybills subject to Dispatch review |
| └ **Dispatch Override Done** | 236 | 29.1% | Corrected and resolved by Dispatch agents |
| └ **Dispatch Review Pending** | 574 | 70.9% | In progress with Dispatch team |
| **Final QA Validated** | **462** | **100.0%** | Signed off in Final QA stage |
| └ **Final Valid (Approved)** | 427 | 92.4% | Fully cleared for delivery/completion |
| └ **Final Invalid (Rejected)** | 35 | 7.6% | Rejected upon secondary review |

---

## 👥 QA Specialist Performance Scorecard

| QA Specialist | Initial Handled | Initial Valid | Initial Invalid | Initial Pending | Initial Valid % | Final Handled | Final Valid | Final Invalid | Final Valid % | Combined Handled |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Arabella Morales** | 427 | 243 | 95 | 89 | 56.9% | 150 | 88 | 4 | 95.7% | **577** |
| **Janryl Jay Canaway** | 462 | 280 | 135 | 47 | 60.6% | 168 | 158 | 9 | 94.6% | **630** |
| **John Michael Francisco** | 409 | 214 | 117 | 78 | 52.3% | 202 | 180 | 22 | 89.1% | **611** |
| **Julius Rod Dayag** | 700 | 526 | 166 | 8 | 75.1% | 0 | 0 | 0 | - | **700** |
| **Yesha Nicholai Lao** | 799 | 462 | 297 | 40 | 57.8% | 0 | 0 | 0 | - | **799** |
| **TOTAL** | **2,797** | **1,725** | **810** | **262** | **61.7%** | **520** | **426** | **35** | **92.4%** | **3,317** |

---

## 🚚 Dispatch Team Override Scorecard

| Dispatch Specialist | Total Actions Logged | Override Done | Pending Review | No Action | Override Resolution % | Share of Total Overrides |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Danica Faye Quintos** | 90 | 84 | 4 | 2 | 93.3% | 35.6% |
| **Daniel Madarable** | 87 | 85 | 2 | 0 | 97.7% | 36.0% |
| **Kim Novero** | 66 | 65 | 1 | 0 | 98.5% | 27.5% |
| **TOTAL** | **243** | **234** | **7** | **2** | **96.3%** | **100.0%** |

---

## 📥 Progress Reports & Customizable Excel Builder (.xlsx)

The dashboard provides three ways to generate Excel reports:

1. **🎨 Customizable Excel Report Builder (New!)**:
   - Access via the **"Custom Report"** button in the header or the **"Custom Report Builder"** tab.
   - **One-Click Operational Presets**:
     - 🚨 **Invalid & Not Overridden Yet**: Selects `Initial QA = Invalid` and `Dispatch Status = Not Overridden Yet`, exporting Waybill No., Rider Name, Initial Validator, Remarks, Date, and Dispatch Status.
     - ⏳ **Pending Initial QA**: Filters to waybills awaiting first quality checks.
     - 🔄 **Overridden Awaiting Final QA**: Filters to dispatch overrides pending final QA signoff.
     - ❌ **Final QA Rejected**: Filters to waybills rejected in final quality check.
     - 👤 **Minimal ID + Rider + Validator**: Quickly outputs only the 3 essential identifiers.
   - **Custom Filter Matrix**: Filter by any combination of Validation Work Date, Initial QA Status, Dispatch Override Status, Final QA Status, QA Specialist, Dispatch Specialist, or free-text search (Rider, Waybill ID, Remarks).
   - **Pick Any Columns**: Interactive checkboxes let you choose exactly which columns to include in the exported file.
   - **Live Data Preview**: Displays matching count badge and the first 10 matching rows with active columns before downloading.
   - **Direct Downloads**: Generates formatted `.xlsx` (with optional Executive KPI tab and auto-fitted columns) or clean `.csv` entirely in the browser.

2. **Pre-Generated Formatted Workbook**:
   - File: `Waybill_QA_Dispatch_Progress_Report.xlsx`
   - Styled with corporate blue headers, alternating zebra rows, auto-adjust column widths, and summary formula cells across 5 tabs:
     1. `Executive Summary`
     2. `Daily Breakdown` (Grouped by QA Validation Date)
     3. `QA Performance`
     4. `Dispatch Team`
     5. `Waybill Records`

3. **Instant Filtered View Export**:
   - Click **"Download Full Report"** or **"Export Filtered"** in any tab to get an instant snapshot of the active dashboard view.

---

## 📅 Date Alignment & Operational Lifecycle
- **Validation Date (Primary Filter)**: Waybills are evaluated by QA the day after intake (or after weekends). The day pills and date selector filter by **Validation Date** (`initial_val_date`), allowing you to accurately see QA and Dispatch output for specific days, including **Today (`10/13/2026`)**.
- **Actual Waybill Date (Intake)**: Clearly displayed side-by-side in the Waybills Explorer table, Waybill Lifecycle Modal, and Excel exports so you always know the exact intake date (`date`) of each waybill.

---

## 🔄 Live Synchronization with Google Sheets
To update the dashboard with newly added waybills from Google Sheets:
1. Click the **"Sync Sheet"** button in the dashboard top navigation bar.
2. Toggle the **"Auto-Sync"** switch to automatically poll Google Sheets every 60 seconds.
3. The dashboard connects directly via the Google Visualization API, so syncing works seamlessly when deployed to any web domain without needing a backend server.
   This will download the latest spreadsheet data, update `data.csv` and `data.json`, and regenerate `Waybill_QA_Dispatch_Progress_Report.xlsx`.
