/* Dummy Sekolah Anton. Local prototype only. */
window.ANTON_SEED = {
  school: {
    id: 'sch-anton',
    name: 'Sekolah Anton',
    slug: 'sekolah-anton',
    kind: 'creator',
    slogan: 'Jualan TikTok Shop yang tahan lama',
    waGroup: 'https://chat.whatsapp.com/anton-batch-sep-demo',
    ownerId: 'u-anton'
  },
  staff: [
    { id: 'u-anton', name: 'Anton', role: 'owner', wa: '628111000001' },
    { id: 'u-lia', name: 'Lia', role: 'asisten', wa: '628111000002' }
  ],
  cohort: {
    id: 'coh-sep',
    name: 'Batch September',
    invite: 'ANTON-SEP26',
    calendarToken: '11111111-2222-3333-4444-555555555555'
  },
  product: {
    name: 'Jepit rambut satin isi 6',
    price: 89000,
    cogs: 32000,
    suggestedCommission: 18,
    niche: 'hair'
  },
  students: [
    { id: 's-kamu', name: 'Kamu (demo)', city: 'Bekasi', lastActive: '2026-09-15T10:00:00+07:00', tags: ['TTS'], wa: '628120000001' },
    { id: 's-dina', name: 'Dina Putri', city: 'Bandung', lastActive: '2026-09-14T21:00:00+07:00', tags: ['pemula'], wa: '628120000002' },
    { id: 's-budi', name: 'Budi Santoso', city: 'Solo', lastActive: '2026-09-10T08:00:00+07:00', tags: ['belum bayar'], wa: '628120000003' },
    { id: 's-sari', name: 'Sari Beasiswa', city: 'Yogyakarta', lastActive: '2026-09-15T07:30:00+07:00', tags: ['beasiswa'], wa: '628120000004' },
    { id: 's-eko', name: 'Eko Pras', city: 'Tangerang', lastActive: '2026-09-13T19:00:00+07:00', tags: ['live'], wa: '628120000005' },
    { id: 's-nina', name: 'Nina Ayu', city: 'Surabaya', lastActive: '2026-09-15T12:00:00+07:00', tags: ['TTS'], wa: '628120000006' },
    { id: 's-raka', name: 'Raka Aditya', city: 'Depok', lastActive: '2026-09-12T16:00:00+07:00', tags: ['cicilan'], wa: '628120000007' },
    { id: 's-maya', name: 'Maya Lestari', city: 'Semarang', lastActive: '2026-09-15T09:00:00+07:00', tags: ['hair'], wa: '628120000008' }
  ],
  billing: {
    's-kamu': { status: 'lunas', plan: 'Batch Sep', amount: 1500000, source: 'lynk', paidAt: '2026-09-01', note: '' },
    's-dina': { status: 'cicilan', plan: 'Batch Sep', amount: 750000, source: 'manual', paidAt: '2026-09-05', note: 'Sisa 750rb' },
    's-budi': { status: 'belum', plan: 'Batch Sep', amount: 0, source: 'manual', paidAt: null, note: 'Belum transfer' },
    's-sari': { status: 'gratis', plan: 'Beasiswa Anton', amount: 0, source: 'manual', paidAt: '2026-09-01', note: 'Beasiswa' },
    's-eko': { status: 'lunas', plan: 'Batch Sep', amount: 1500000, source: 'mayar', paidAt: '2026-08-30', note: '' },
    's-nina': { status: 'lunas', plan: 'Batch Sep', amount: 1500000, source: 'lynk', paidAt: '2026-09-02', note: '' },
    's-raka': { status: 'cicilan', plan: 'Batch Sep', amount: 500000, source: 'manual', paidAt: '2026-09-08', note: 'Sisa 1jt' },
    's-maya': { status: 'lunas', plan: 'Batch Sep', amount: 1500000, source: 'lynk', paidAt: '2026-09-01', note: '' }
  },
  weeks: [
    { id: 'w1', title: 'Minggu 1 · Fondasi toko', due: '2026-09-07' },
    { id: 'w2', title: 'Minggu 2 · Produk & harga', due: '2026-09-14' },
    { id: 'w3', title: 'Minggu 3 · Affiliate & kolab', due: '2026-09-21' },
    { id: 'w4', title: 'Minggu 4 · Live yang tahan', due: '2026-09-28' }
  ],
  lectures: [
    { id: 'l1', weekId: 'w1', type: 'video', title: 'Selamat datang di kelas', mins: 12, url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', requiredBefore: true, body: '', resources: [{ name: 'Slide sesi 1', url: 'https://example.com/sesi1.pdf' }] },
    { id: 'l2', weekId: 'w1', type: 'text', title: 'Checklist toko sebelum iklan', mins: 8, body: 'Isi: foto 5 sudut, SKU nama jelas, etalase 3 koleksi, WA bisnis nyala. Jangan iklan dulu kalau foto masih gelap.', resources: [] },
    { id: 'l3', weekId: 'w1', type: 'tool', title: 'Kalkulator modal', mins: 5, tool: 'modal', iframe: './tools/modal.html', job: 'Hitung stok + iklan sebelum order.', resources: [] },
    { id: 'l4', weekId: 'w2', type: 'video', title: 'Cara baca harga pasar', mins: 14, url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', requiredBefore: true, resources: [] },
    { id: 'l5', weekId: 'w2', type: 'document', title: 'Template harga jual', mins: 6, url: 'https://example.com/harga.xlsx', resources: [] },
    { id: 'l6', weekId: 'w2', type: 'tool', title: 'Kalkulator komisi', mins: 6, tool: 'komisi', iframe: './tools/komisi.html', job: 'Berapa % yang masih aman ditawarkan ke kreator.', resources: [] },
    { id: 'l7', weekId: 'w3', type: 'video', title: 'Kenapa blast itu makan kuota toko', mins: 11, url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', requiredBefore: true, resources: [] },
    { id: 'l8', weekId: 'w3', type: 'tool', title: 'Kolab — cari kreator', mins: 20, tool: 'kolab', job: 'Import Kalodata, antri undangan sesuai kuota toko.', resources: [] },
    { id: 'l9', weekId: 'w3', type: 'text', title: 'Template chat yang tidak spam', mins: 5, body: 'Sebut produk, komisi, kenapa mereka cocok (niche). Jangan “hai kak mau collab?” ke 500 orang.', resources: [] },
    { id: 'l10', weekId: 'w4', type: 'video', title: 'Live 45 menit yang tidak habis suara', mins: 16, url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', resources: [] },
    { id: 'l11', weekId: 'w4', type: 'text', title: 'Setelah live: sampel & follow-up', mins: 7, body: 'Kreator yang sudah connected tidak makan kuota mingguan. Kerjain mereka dulu sebelum undang orang baru.', resources: [] }
  ],
  sessions: [
    { id: 'ses-1', title: 'Sesi 1 · Buka toko', startsAt: '2026-09-07T19:30:00+07:00', meetUrl: 'https://meet.google.com/aaa-anton-one', location: 'Online', notes: 'Bawa screenshot etalase.', required: ['l1', 'l2'] },
    { id: 'ses-2', title: 'Sesi 2 · Harga & komisi', startsAt: '2026-09-14T19:30:00+07:00', meetUrl: 'https://meet.google.com/bbb-anton-two', location: 'Online', notes: 'Hitung 1 SKU pakai kalkulator komisi.', required: ['l4', 'l6'] },
    { id: 'ses-3', title: 'Sesi 3 · Kolab', startsAt: '2026-09-21T19:30:00+07:00', meetUrl: 'https://meet.google.com/ccc-anton-three', location: 'Online', notes: 'Bawa CSV Kalodata. Jangan login Seller Center di sini.', required: ['l7', 'l8'] }
  ],
  announcements: [
    { id: 'an-1', title: 'Sesi 3 pindah jam 19.30 WIB', body: 'Bukan 20.00. Link Meet ada di Home.', at: '2026-09-15T08:00:00+07:00' }
  ],
  threads: [
    { id: 't1', lectureId: 'l6', authorId: 's-dina', title: 'Komisi 25% masih aman?', body: 'Kalodata bilang kreator hair minta 25%. Modal saya 32rb, jual 89rb.', answered: false, createdAt: '2026-09-14T11:00:00+07:00' },
    { id: 't2', lectureId: 'l3', authorId: 's-eko', title: 'Iklan 14 hari atau 7?', body: 'Di kalkulator default 14 hari. Kalau modal pas, boleh 7?', answered: true, createdAt: '2026-09-08T09:00:00+07:00' }
  ],
  replies: [
    { id: 'r1', threadId: 't2', authorId: 'u-anton', body: 'Mulai 7 hari. Naikkan kalau CPA masih masuk.', isStaff: true, createdAt: '2026-09-08T10:00:00+07:00' }
  ],
  attendance: {
    'ses-1': { 's-kamu': 'hadir', 's-dina': 'hadir', 's-budi': 'absen', 's-sari': 'hadir', 's-eko': 'hadir', 's-nina': 'izin', 's-raka': 'hadir', 's-maya': 'hadir' },
    'ses-2': { 's-kamu': 'hadir', 's-dina': 'izin', 's-sari': 'hadir', 's-eko': 'hadir', 's-nina': 'hadir', 's-raka': 'absen', 's-maya': 'hadir' }
  },
  notes: {
    's-dina': [{ at: '2026-09-14', body: 'Cicilan sisa 750rb. Ingatkan WA.' }]
  },
  progressSeed: {
    's-kamu': ['l1', 'l2', 'l3', 'l4'],
    's-dina': ['l1', 'l2'],
    's-budi': [],
    's-sari': ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'],
    's-eko': ['l1', 'l2', 'l3', 'l4', 'l5'],
    's-nina': ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'],
    's-raka': ['l1'],
    's-maya': ['l1', 'l2', 'l3', 'l4', 'l5', 'l6']
  },
  kolabQuota: { weekly: 200, used: 47, dailyCap: 1000, batch: 50, starterPack: false }
};
