function toCsvRow(values) {
  return values
    .map((v) => {
      const text = String(v ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replaceAll('"', '""')}"`;
      }
      return text;
    })
    .join(',');
}

function triggerDownload(content, fileName, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportRunCsv(report, stationSummary = []) {
  const header = ['metric', 'value'];
  const rows = [
    ['seed', report.seed],
    ['elapsedSec', report.elapsedSec],
    ['servedGroups', report.servedGroups],
    ['meanWaitSec', report.meanWaitSec],
    ['utilizationPct', report.utilizationPct],
    ['energyUnits', report.energyUnits],
    ['reliabilityPct', report.reliabilityPct],
    ['congestionIndex', report.congestionIndex],
    ['activeDisruptions', (report.activeDisruptions || []).join('|')],
  ];

  const stationHeader = ['stationId', 'servedGroups', 'waitingNow', 'meanWaitSec', 'under60Pct'];
  const stationRows = stationSummary.map((s) => [s.stationId, s.servedGroups, s.waitingNow, s.meanWaitSec, s.under60Pct]);

  const csv = [
    toCsvRow(header),
    ...rows.map(toCsvRow),
    '',
    toCsvRow(stationHeader),
    ...stationRows.map(toCsvRow),
  ].join('\n');

  triggerDownload(csv, `pod-run-report-${Date.now()}.csv`, 'text/csv');
}

export function exportBoardPdfLike(report, snapshots = []) {
  const doc = window.open('', '_blank', 'width=1100,height=800');
  if (!doc) return;

  const cards = snapshots
    .map((s, idx) => `<li><b>Card ${idx + 1}</b> - ${s.title} | Wait ${s.meanWaitSec}s | Util ${s.utilizationPct}% | Reliability ${s.reliabilityPct}%</li>`)
    .join('');

  doc.document.write(`
    <html>
      <head>
        <title>Pod Prototype Board Report</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; margin: 32px; color: #1e293b; }
          h1 { margin-bottom: 6px; }
          .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 16px 0; }
          .kpi { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; }
        </style>
      </head>
      <body>
        <h1>Pod Transit Prototype Report</h1>
        <p>Generated ${new Date().toLocaleString()}</p>
        <div class="kpis">
          <div class="kpi"><b>Served groups</b><div>${report.servedGroups}</div></div>
          <div class="kpi"><b>Mean wait</b><div>${report.meanWaitSec}s</div></div>
          <div class="kpi"><b>Utilization</b><div>${report.utilizationPct}%</div></div>
          <div class="kpi"><b>Reliability</b><div>${report.reliabilityPct}%</div></div>
          <div class="kpi"><b>Energy</b><div>${report.energyUnits}</div></div>
          <div class="kpi"><b>Congestion index</b><div>${report.congestionIndex}</div></div>
        </div>
        <h3>Snapshot cards</h3>
        <ul>${cards || '<li>No snapshot cards yet.</li>'}</ul>
        <p><i>Use browser Print and Save as PDF for investor pack.</i></p>
      </body>
    </html>
  `);
  doc.document.close();
  doc.focus();
}
