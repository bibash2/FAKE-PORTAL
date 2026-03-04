const API_BASE = '';

function handleLogin(e) {
  e.preventDefault();
  window.location.href = 'payments.html';
}

async function loadDashboardData() {
  try {
    const [statsRes, spendRes, modeRes] = await Promise.all([
      fetch(`${API_BASE}/api/dashboard/stats`),
      fetch(`${API_BASE}/api/dashboard/monthly-spend`),
      fetch(`${API_BASE}/api/dashboard/spend-by-mode`)
    ]);
    const stats = await statsRes.json();
    const spend = await spendRes.json();
    const modes = await modeRes.json();

    const statCards = document.querySelectorAll('.stat-value');
    if (statCards.length >= 4) {
      statCards[0].textContent = '$' + stats.totalSpend.toLocaleString();
      statCards[1].textContent = stats.billsProcessed.toLocaleString();
      statCards[2].textContent = stats.activeCarriers.toLocaleString();
      statCards[3].textContent = stats.pendingApprovals.toLocaleString();
    }

    generateSpendChart(spend);
    renderModeChart(modes);
    loadRecentInvoices();
  } catch (e) {
    console.error('Dashboard load failed:', e);
  }
}

function generateSpendChart(data) {
  const chart = document.getElementById('spendChart');
  if (!chart) return;

  if (!data || !data.length) {
    data = [
      { month: '2025-04', amount: 180000 }, { month: '2025-05', amount: 210000 },
      { month: '2025-06', amount: 195000 }, { month: '2025-07', amount: 225000 },
      { month: '2025-08', amount: 240000 }, { month: '2025-09', amount: 235000 },
      { month: '2025-10', amount: 260000 }, { month: '2025-11', amount: 248000 },
      { month: '2025-12', amount: 275000 }, { month: '2026-01', amount: 265000 },
      { month: '2026-02', amount: 290000 }, { month: '2026-03', amount: 285000 }
    ];
  }

  const amounts = data.map(d => d.amount);
  const max = Math.max(...amounts);

  chart.innerHTML = '';
  amounts.forEach((val, i) => {
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = (val / max * 260) + 'px';
    const colors = [['#3a7bd5', '#5a95e5'], ['#4a9af5', '#74b3f7']];
    const colorSet = colors[i % 2];
    bar.style.background = `linear-gradient(to top, ${colorSet[0]}, ${colorSet[1]})`;
    bar.title = '$' + val.toLocaleString();
    chart.appendChild(bar);
  });
}

function renderModeChart(modes) {
  if (!modes || !Object.keys(modes).length) return;
  const total = Object.values(modes).reduce((s, v) => s + v, 0);
  const donutCenter = document.querySelector('.donut-center .value');
  if (donutCenter) {
    donutCenter.textContent = '$' + (total / 1000000).toFixed(1) + 'M';
  }
}

async function loadRecentInvoices() {
  try {
    const res = await fetch(`${API_BASE}/api/invoices?limit=7`);
    const result = await res.json();
    const tbody = document.querySelector('.main-content table.data-table tbody');
    if (!tbody || !result.data) return;

    tbody.innerHTML = result.data.map(inv => `
      <tr>
        <td><a href="invoices.html?id=${inv.id}" style="color:#4a9af5">${inv.invoiceNumber}</a></td>
        <td>${inv.carrier}</td>
        <td>${inv.shipper}</td>
        <td>${inv.mode}</td>
        <td>$${(inv.approvedAmount || inv.carrierAmount).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        <td>${inv.shipDate ? new Date(inv.shipDate).toLocaleDateString() : '—'}</td>
        <td><span class="badge badge-${getStatusBadge(inv.status)}">${inv.status}</span></td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Failed to load invoices:', e);
  }
}

function getStatusBadge(status) {
  const map = { Paid: 'success', Pending: 'warning', Rejected: 'danger', Processing: 'info' };
  return map[status] || 'info';
}

function refreshDashboard() {
  const cards = document.querySelectorAll('.stat-card');
  cards.forEach(card => {
    card.style.opacity = '0.5';
    setTimeout(() => { card.style.opacity = '1'; }, 400);
  });
  loadDashboardData();
}

async function loadCarriersData() {
  try {
    const res = await fetch(`${API_BASE}/api/carriers`);
    const carriers = await res.json();
    const tbody = document.querySelector('#carrierTableBody') || document.querySelector('.main-content table.data-table tbody');
    if (!tbody || !carriers.length) return;

    tbody.innerHTML = carriers.map((c, i) => `
      <tr>
        <td><input type="checkbox"></td>
        <td>${i + 1}</td>
        <td><strong>${c.name}</strong></td>
        <td>${c.scac}</td>
        <td>${c.billCount.toLocaleString()}</td>
        <td>$${c.paidAmount.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        <td>${c.percentOfTotal}%</td>
        <td>$${c.avgBill.toFixed(2)}</td>
        <td><span class="badge badge-${c.rejectRate < 2 ? 'success' : c.rejectRate < 4 ? 'warning' : 'danger'}">${c.rejectRate}%</span></td>
        <td>
          <button class="btn btn-sm btn-secondary" title="Reject Reasons">&#127991;</button>
          <button class="btn btn-sm btn-secondary" title="Report Card">&#128230;</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Failed to load carriers:', e);
  }
}

async function loadRejectsData() {
  try {
    const res = await fetch(`${API_BASE}/api/rejects`);
    const rejects = await res.json();
    const tbody = document.querySelector('#rejectsTableBody') || document.querySelector('#tab-outstanding table.data-table tbody');
    if (!tbody) return;

    const outstanding = rejects.filter(r => r.status === 'outstanding');
    tbody.innerHTML = outstanding.map(r => `
      <tr>
        <td><input type="checkbox"></td>
        <td style="color:#4a9af5;cursor:pointer">${r.proNumber}</td>
        <td>${r.carrier}</td>
        <td>${r.shipper}</td>
        <td><span class="badge badge-danger">${r.rejectCode}</span></td>
        <td>${r.rejectReason}</td>
        <td>$${r.originalAmount.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        <td>$${r.carrierAmount.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        <td style="color:${r.difference > 0 ? '#e74c3c' : 'inherit'}">$${r.difference.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        <td>${r.rejectDate}</td>
        <td>
          <button class="btn btn-success btn-sm" onclick="resolveReject(${r.id}, 'approved')">Approve</button>
          <button class="btn btn-danger btn-sm" onclick="resolveReject(${r.id}, 'rejected')">Reject</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Failed to load rejects:', e);
  }
}

async function resolveReject(id, status) {
  const notes = prompt('Add notes (optional):') || '';
  try {
    await fetch(`${API_BASE}/api/rejects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, resolvedBy: 'FRANKLIN RODRIGUEZ', notes })
    });
    loadRejectsData();
  } catch (e) {
    alert('Failed to update reject');
  }
}

async function loadEvents() {
  try {
    const res = await fetch(`${API_BASE}/api/events?limit=50`);
    const result = await res.json();
    const tbody = document.getElementById('eventsTableBody');
    if (!tbody) return;

    if (!result.data || !result.data.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#777">No events recorded yet</td></tr>';
      return;
    }

    tbody.innerHTML = result.data.map(e => `
      <tr>
        <td>${new Date(e.timestamp).toLocaleString()}</td>
        <td><span class="badge badge-${e.type === 'approved' ? 'success' : e.type === 'rejected' ? 'danger' : 'info'}">${e.type}</span></td>
        <td>${e.action}</td>
        <td>${e.user}</td>
        <td>${e.notes || '—'}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Failed to load events:', e);
  }
}
