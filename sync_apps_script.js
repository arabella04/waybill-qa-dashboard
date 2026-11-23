const fs = require('fs');
const path = require('path');

const indexHtml = fs.readFileSync('index.html', 'utf8');

// The local scripts to replace
const localScriptsRegex = /<script src="data\.js[\s\S]*?<script src="app\.js[^>]*><\/script>/;

if (!localScriptsRegex.test(indexHtml)) {
    console.error('Could not find local scripts section in index.html');
    process.exit(1);
}

// Read all dashboard modular scripts to inline directly into apps_script/Index.html
const dashboardFiles = [
    'dashboards/auth.js',
    'dashboards/waybill.js',
    'dashboards/rth.js',
    'dashboards/account_merging.js',
    'dashboards/dispatch.js',
    'dashboards/output_qa.js',
    'dashboards/it_schedule.js',
    'dashboards/qa_report.js'
];

let inlinedDashboards = dashboardFiles.map(f => {
    const code = fs.readFileSync(f, 'utf8');
    return `    <!-- Inlined ${f} -->\n    <script>\n${code}\n    </script>`;
}).join('\n\n');

// Also load data.js, qa_tasks_data.js, and app.js from github @main
const scriptReplacement = `    <!-- Google Apps Script Active User Injection -->
    <script>
        window.APPS_SCRIPT_USER = <?!= appsScriptUserJson ?>;
    </script>
    <script src="https://cdn.jsdelivr.net/gh/arabella04/waybill-qa-dashboard@main/data.js"></script>
    <script src="https://cdn.jsdelivr.net/gh/arabella04/waybill-qa-dashboard@main/qa_tasks_data.js"></script>
${inlinedDashboards}
    <script src="https://cdn.jsdelivr.net/gh/arabella04/waybill-qa-dashboard@main/app.js"></script>`;

const updatedIndex = indexHtml.replace(localScriptsRegex, scriptReplacement);

fs.writeFileSync('apps_script/Index.html', updatedIndex, 'utf8');
console.log('Successfully synced index.html to apps_script/Index.html (' + updatedIndex.length + ' bytes)');
