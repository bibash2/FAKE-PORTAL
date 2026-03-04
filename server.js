const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

function readData(file) {
  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) return [];
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function writeData(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

function nextId(items) {
  if (!items.length) return 1;
  return Math.max(...items.map(i => i.id || 0)) + 1;
}

// ─── File upload config ───
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = req.query.type || 'general';
    const dir = path.join(UPLOAD_DIR, subDir);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${ts}-${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ═══════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════
app.get('/api/invoices', (req, res) => {
  const invoices = readData('invoices.json');
  const { status, carrier, shipper, search, page = 1, limit = 20 } = req.query;
  let filtered = invoices;
  if (status) filtered = filtered.filter(i => i.status === status);
  if (carrier) filtered = filtered.filter(i => i.carrier.toLowerCase().includes(carrier.toLowerCase()));
  if (shipper) filtered = filtered.filter(i => i.shipper.toLowerCase().includes(shipper.toLowerCase()));
  if (search) filtered = filtered.filter(i =>
    i.proNumber.includes(search) || i.invoiceNumber.includes(search) ||
    i.carrier.toLowerCase().includes(search.toLowerCase())
  );
  const total = filtered.length;
  const start = (page - 1) * limit;
  const paged = filtered.slice(start, start + parseInt(limit));
  res.json({ data: paged, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

app.get('/api/invoices/:id', (req, res) => {
  const invoices = readData('invoices.json');
  const inv = invoices.find(i => i.id === parseInt(req.params.id));
  if (!inv) return res.status(404).json({ error: 'Not found' });
  res.json(inv);
});

app.post('/api/invoices', (req, res) => {
  const invoices = readData('invoices.json');
  const inv = { id: nextId(invoices), ...req.body, createdAt: new Date().toISOString() };
  invoices.unshift(inv);
  writeData('invoices.json', invoices);
  res.status(201).json(inv);
});

app.put('/api/invoices/:id', (req, res) => {
  const invoices = readData('invoices.json');
  const idx = invoices.findIndex(i => i.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  invoices[idx] = { ...invoices[idx], ...req.body, updatedAt: new Date().toISOString() };
  writeData('invoices.json', invoices);
  res.json(invoices[idx]);
});

app.delete('/api/invoices/:id', (req, res) => {
  let invoices = readData('invoices.json');
  invoices = invoices.filter(i => i.id !== parseInt(req.params.id));
  writeData('invoices.json', invoices);
  res.json({ success: true });
});

// ═══════════════════════════════════════
// CARRIERS
// ═══════════════════════════════════════
app.get('/api/carriers', (req, res) => {
  res.json(readData('carriers.json'));
});

app.post('/api/carriers', (req, res) => {
  const carriers = readData('carriers.json');
  const c = { id: nextId(carriers), ...req.body };
  carriers.push(c);
  writeData('carriers.json', carriers);
  res.status(201).json(c);
});

app.put('/api/carriers/:id', (req, res) => {
  const carriers = readData('carriers.json');
  const idx = carriers.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  carriers[idx] = { ...carriers[idx], ...req.body };
  writeData('carriers.json', carriers);
  res.json(carriers[idx]);
});

// ═══════════════════════════════════════
// CHARGES
// ═══════════════════════════════════════
app.get('/api/charges', (req, res) => {
  const charges = readData('charges.json');
  const { invoiceId } = req.query;
  if (invoiceId) return res.json(charges.filter(c => c.invoiceId === parseInt(invoiceId)));
  res.json(charges);
});

app.post('/api/charges', (req, res) => {
  const charges = readData('charges.json');
  const c = { id: nextId(charges), ...req.body, createdAt: new Date().toISOString() };
  charges.push(c);
  writeData('charges.json', charges);
  res.json(c);
});

app.put('/api/charges/:id', (req, res) => {
  const charges = readData('charges.json');
  const idx = charges.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  charges[idx] = { ...charges[idx], ...req.body };
  writeData('charges.json', charges);
  res.json(charges[idx]);
});

app.delete('/api/charges/:id', (req, res) => {
  let charges = readData('charges.json');
  charges = charges.filter(c => c.id !== parseInt(req.params.id));
  writeData('charges.json', charges);
  res.json({ success: true });
});

// ═══════════════════════════════════════
// DOCUMENTS (upload + list)
// ═══════════════════════════════════════
app.get('/api/documents', (req, res) => {
  const docs = readData('documents.json');
  const { invoiceId, type } = req.query;
  let filtered = docs;
  if (invoiceId) filtered = filtered.filter(d => d.invoiceId === parseInt(invoiceId));
  if (type) filtered = filtered.filter(d => d.docType === type);
  res.json(filtered);
});

app.post('/api/documents/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const docs = readData('documents.json');
  const doc = {
    id: nextId(docs),
    invoiceId: req.body.invoiceId ? parseInt(req.body.invoiceId) : null,
    docType: req.body.docType || 'general',
    name: req.body.name || req.file.originalname,
    originalName: req.file.originalname,
    filename: req.file.filename,
    path: `/uploads/${req.query.type || 'general'}/${req.file.filename}`,
    size: req.file.size,
    mimeType: req.file.mimetype,
    uploadedBy: req.body.uploadedBy || 'PortPro User',
    uploadedAt: new Date().toISOString(),
    notes: req.body.notes || ''
  };
  docs.unshift(doc);
  writeData('documents.json', docs);
  res.status(201).json(doc);
});

app.delete('/api/documents/:id', (req, res) => {
  let docs = readData('documents.json');
  const doc = docs.find(d => d.id === parseInt(req.params.id));
  if (doc) {
    const fp = path.join(__dirname, doc.path);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  docs = docs.filter(d => d.id !== parseInt(req.params.id));
  writeData('documents.json', docs);
  res.json({ success: true });
});

// ═══════════════════════════════════════
// EVENTS / AUDIT LOG
// ═══════════════════════════════════════
app.get('/api/events', (req, res) => {
  const events = readData('events.json');
  const { invoiceId, type, page = 1, limit = 50 } = req.query;
  let filtered = events;
  if (invoiceId) filtered = filtered.filter(e => e.invoiceId === parseInt(invoiceId));
  if (type) filtered = filtered.filter(e => e.type === type);
  const total = filtered.length;
  const start = (page - 1) * limit;
  res.json({ data: filtered.slice(start, start + parseInt(limit)), total });
});

app.post('/api/events', (req, res) => {
  const events = readData('events.json');
  const evt = { id: nextId(events), ...req.body, timestamp: new Date().toISOString() };
  events.unshift(evt);
  writeData('events.json', events);
  res.status(201).json(evt);
});

// ═══════════════════════════════════════
// REJECTS (freight bill authorization)
// ═══════════════════════════════════════
app.get('/api/rejects', (req, res) => {
  const rejects = readData('rejects.json');
  const { status } = req.query;
  if (status) return res.json(rejects.filter(r => r.status === status));
  res.json(rejects);
});

app.put('/api/rejects/:id', (req, res) => {
  const rejects = readData('rejects.json');
  const idx = rejects.findIndex(r => r.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  rejects[idx] = { ...rejects[idx], ...req.body, updatedAt: new Date().toISOString() };
  writeData('rejects.json', rejects);

  const events = readData('events.json');
  events.unshift({
    id: nextId(events),
    invoiceId: rejects[idx].invoiceId,
    type: req.body.status === 'approved' ? 'approved' : 'rejected',
    action: req.body.status === 'approved' ? 'Reject Approved' : 'Rejected to Carrier',
    user: req.body.resolvedBy || 'PortPro User',
    notes: req.body.notes || '',
    timestamp: new Date().toISOString()
  });
  writeData('events.json', events);

  res.json(rejects[idx]);
});

// ═══════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════
app.get('/api/dashboard/stats', (req, res) => {
  const invoices = readData('invoices.json');
  const carriers = readData('carriers.json');
  const rejects = readData('rejects.json');

  const totalSpend = invoices.reduce((s, i) => s + (i.approvedAmount || i.carrierAmount || 0), 0);
  const pending = rejects.filter(r => r.status === 'outstanding').length;

  res.json({
    totalSpend,
    billsProcessed: invoices.length,
    activeCarriers: carriers.length,
    pendingApprovals: pending
  });
});

app.get('/api/dashboard/spend-by-mode', (req, res) => {
  const invoices = readData('invoices.json');
  const modes = {};
  invoices.forEach(i => {
    const m = i.mode || 'Other';
    modes[m] = (modes[m] || 0) + (i.approvedAmount || i.carrierAmount || 0);
  });
  res.json(modes);
});

app.get('/api/dashboard/monthly-spend', (req, res) => {
  const invoices = readData('invoices.json');
  const months = {};
  invoices.forEach(i => {
    const d = i.shipDate || i.createdAt || '';
    const m = d.substring(0, 7);
    if (m) months[m] = (months[m] || 0) + (i.approvedAmount || i.carrierAmount || 0);
  });
  const sorted = Object.entries(months).sort(([a], [b]) => a.localeCompare(b));
  res.json(sorted.map(([month, amount]) => ({ month, amount })));
});

// ═══════════════════════════════════════
// SHIPPERS
// ═══════════════════════════════════════
app.get('/api/shippers', (req, res) => {
  res.json(readData('shippers.json'));
});

// ═══════════════════════════════════════
// UPCOMING PAYMENTS
// ═══════════════════════════════════════
app.get('/api/payments/upcoming', (req, res) => {
  const invoices = readData('invoices.json');
  const { days = 90, shipper, currency, dateType = 'paidDate' } = req.query;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - parseInt(days));

  let paid = invoices.filter(i => i.status === 'Paid' && i.payDate);
  if (shipper) paid = paid.filter(i => i.shipper.toLowerCase().includes(shipper.toLowerCase()));

  paid.sort((a, b) => new Date(b.payDate) - new Date(a.payDate));

  const totalAmt = paid.reduce((s, i) => s + (i.approvedAmount || 0), 0);

  const byShipper = {};
  paid.forEach(i => {
    byShipper[i.shipper] = (byShipper[i.shipper] || 0) + (i.approvedAmount || 0);
  });
  const topShippersPaid = Object.entries(byShipper)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, amount]) => ({ name, amount }));

  const byShipperCount = {};
  paid.forEach(i => {
    byShipperCount[i.shipper] = (byShipperCount[i.shipper] || 0) + 1;
  });
  const topShippersVolume = Object.entries(byShipperCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const byDate = {};
  paid.forEach(i => {
    byDate[i.payDate] = (byDate[i.payDate] || 0) + (i.approvedAmount || 0);
  });
  const dateData = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount, cumulative: 0 }));
  let cum = 0;
  dateData.forEach(d => { cum += d.amount; d.cumulative = cum; });

  res.json({ totalAmt, totalCount: paid.length, payments: dateData, topShippersPaid, topShippersVolume });
});

// ═══════════════════════════════════════
// INVOICE UPLOAD HISTORY
// ═══════════════════════════════════════
app.get('/api/uploads/history', (req, res) => {
  const docs = readData('documents.json');
  const uploads = docs.filter(d => d.docType === 'invoice');

  const byAccount = {};
  uploads.forEach(d => {
    const key = d.account || d.uploadedBy || 'Unknown';
    if (!byAccount[key]) byAccount[key] = { account: key, imageCount: 0, uploadDate: d.uploadedAt };
    byAccount[key].imageCount++;
    if (d.uploadedAt > byAccount[key].uploadDate) byAccount[key].uploadDate = d.uploadedAt;
  });

  res.json({
    history: Object.values(byAccount),
    files: uploads.map(d => ({
      id: d.id,
      fileName: d.originalName || d.name,
      fileSize: d.size ? Math.round(d.size / 1024) : 0,
      barcode: d.barcode || '',
      uploadDate: d.uploadedAt,
      path: d.path
    }))
  });
});

app.post('/api/uploads/invoice', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const docs = readData('documents.json');
  const doc = {
    id: nextId(docs),
    invoiceId: req.body.invoiceId ? parseInt(req.body.invoiceId) : null,
    docType: 'invoice',
    account: req.body.account || '210800 AHLSTROM MOVERS',
    name: req.body.name || req.file.originalname,
    originalName: req.file.originalname,
    filename: req.file.filename,
    path: `/uploads/${req.query.type || 'general'}/${req.file.filename}`,
    size: req.file.size,
    mimeType: req.file.mimetype,
    barcode: req.body.barcode || '',
    uploadedBy: req.body.uploadedBy || 'FRANKLIN RODRIGUEZ',
    uploadedAt: new Date().toISOString(),
    notes: req.body.notes || ''
  };
  docs.unshift(doc);
  writeData('documents.json', docs);
  res.status(201).json(doc);
});

// Seed data on first run
function seedIfEmpty() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(path.join(DATA_DIR, 'invoices.json'))) {
    writeData('invoices.json', require('./data/seed-invoices'));
  }
  if (!fs.existsSync(path.join(DATA_DIR, 'carriers.json'))) {
    writeData('carriers.json', require('./data/seed-carriers'));
  }
  if (!fs.existsSync(path.join(DATA_DIR, 'shippers.json'))) {
    writeData('shippers.json', [
      { id: 1, name: "AHLSTROM MOVERS", account: "210800" },
      { id: 2, name: "GLOBAL INDUSTRIES", account: "210801" },
      { id: 3, name: "SUMMIT LLC", account: "210802" }
    ]);
  }
  if (!fs.existsSync(path.join(DATA_DIR, 'rejects.json'))) {
    writeData('rejects.json', [
      { id: 1, invoiceId: 4, proNumber: "784521372", carrier: "Schneider National", shipper: "AHLSTROM MOVERS", rejectCode: "RC-04", rejectReason: "Rate Discrepancy", originalAmount: 4750.00, carrierAmount: 5120.00, difference: 370.00, rejectDate: "2026-03-02", status: "outstanding" },
      { id: 2, invoiceId: 12, proNumber: "784521380", carrier: "ABF Freight", shipper: "AHLSTROM MOVERS", rejectCode: "RC-02", rejectReason: "Duplicate Invoice", originalAmount: 1240.00, carrierAmount: 1240.00, difference: 0, rejectDate: "2026-03-01", status: "outstanding" },
      { id: 3, invoiceId: 5, proNumber: "784521385", carrier: "UPS Freight", shipper: "AHLSTROM MOVERS", rejectCode: "RC-07", rejectReason: "Missing BOL", originalAmount: 2890.50, carrierAmount: 2890.50, difference: 0, rejectDate: "2026-02-28", status: "outstanding" },
      { id: 4, invoiceId: 11, proNumber: "784521389", carrier: "FedEx Freight", shipper: "AHLSTROM MOVERS", rejectCode: "RC-01", rejectReason: "Weight Discrepancy", originalAmount: 1580.00, carrierAmount: 1820.00, difference: 240.00, rejectDate: "2026-02-27", status: "outstanding" },
      { id: 5, invoiceId: 13, proNumber: "784521392", carrier: "XPO Logistics", shipper: "AHLSTROM MOVERS", rejectCode: "RC-04", rejectReason: "Rate Discrepancy", originalAmount: 3200.00, carrierAmount: 3450.00, difference: 250.00, rejectDate: "2026-02-26", status: "outstanding" }
    ]);
  }
  ['charges.json', 'documents.json', 'events.json'].forEach(f => {
    if (!fs.existsSync(path.join(DATA_DIR, f))) writeData(f, []);
  });
}

app.listen(PORT, () => {
  console.log(`CassPort server running on http://localhost:${PORT}`);
  seedIfEmpty();
});
