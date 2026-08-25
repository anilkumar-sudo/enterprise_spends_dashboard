import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const indexPath = new URL('../Final B2B Dashboard.html', import.meta.url);
const corporatesLogoPath = new URL('../assets/cult-for-corporates-logo-white.png', import.meta.url);
const sourceSnapshotPath = new URL('../assets/google-sheet-snapshot.js', import.meta.url);
const templatePath = new URL('./worker.template.js', import.meta.url);
const outPath = new URL('./worker.js', import.meta.url);

const rawIndexHtml = await fs.readFile(indexPath, 'utf8');
const corporatesLogoPng = await fs.readFile(corporatesLogoPath);
const sourceSnapshotScript = await fs.readFile(sourceSnapshotPath, 'utf8');
const template = await fs.readFile(templatePath, 'utf8');
const indexHtml = rawIndexHtml
  .replaceAll(
    'assets/cult-for-corporates-logo-white.png',
    `data:image/png;base64,${corporatesLogoPng.toString('base64')}`
  )
  .replace(
    '<script src="assets/google-sheet-snapshot.js"></script>',
    `<script>${sourceSnapshotScript}</script>`
  );

// Keep the source snapshot server-side only. The browser must receive data
// through the authenticated /api endpoint so unauthenticated users cannot
// inspect or export spend records from page source or localStorage.
const publicIndexHtml = indexHtml.replace(
  /<script>[\s\S]*?window\.CULT_SOURCE_SHEET_DATA\s*=\s*[\s\S]*?<\/script>/,
  '<script>window.CULT_SOURCE_SHEET_DATA = null;</script>'
).replace(
  /const SEED = \[[\s\S]*?\];/,
  'const SEED = [];'
);

const sourceWindow = {};
Function('window', sourceSnapshotScript)(sourceWindow);
const sourceData = sourceWindow.CULT_SOURCE_SHEET_DATA;
if (!sourceData || !Array.isArray(sourceData.expenses)) {
  throw new Error('Google Sheet snapshot is missing or invalid');
}

const expenses = sourceData.expenses;
const vendors = sourceData.vendors;
const budgets = sourceData.budgets;

const initialState = {
  expenses,
  payments: [],
  vendors,
  budgets,
  reallocations: sourceData.reallocations,
  sourceDataVersion: sourceData.version,
  source: sourceData.source,
  activityLog: [
    {
      type: 'System',
      title: 'Google Sheet data imported',
      detail: `${expenses.length} spend records loaded from the FY26-27 marketing spend tracker.`,
      timestamp: new Date().toISOString()
    }
  ],
  nextId: expenses.length
};

const worker = template
  .replace('__INITIAL_STATE__', JSON.stringify(initialState))
  .replace('__INDEX_HTML__', JSON.stringify(publicIndexHtml));

await fs.writeFile(outPath, worker, 'utf8');
console.log('Built worker.js');
