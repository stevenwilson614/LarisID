/* Dual-view presenter. Localhost only. No live WhatsApp. */
(function () {
  if (/larisid\.com$/i.test(location.hostname) || location.hostname.endsWith('.pages.dev')) {
    document.getElementById('prod-block').hidden = false;
    document.querySelector('.bar').hidden = true;
    document.querySelector('.stage').hidden = true;
    document.querySelector('.captions').hidden = true;
    return;
  }

  const SCENES = [
    {
      id: 'a1-form',
      act: 1,
      title: 'Form dari grup WA',
      sayAnton: 'Tamu baru isi satu pertanyaan per layar: nama, WA, toko, kota, dari mana. Belum ada uang.',
      saySiswa: 'Tamu Demo kenalan dulu. Baru boleh lihat halaman bayar.',
      student: { personaId: 's-tamu', tab: 'daftar' },
      mentor: { tab: 'orang', personId: 's-tamu', hub: 'pipa' }
    },
    {
      id: 'a1-pay',
      act: 1,
      title: 'Pay 24 jam',
      sayAnton: 'Jam diskon mulai saat form tersimpan. Rekening kamu. LarisID tidak menahan uang.',
      saySiswa: 'Bayar sekarang (1 / 3 / 6 bulan atau kartu) atau bayar nanti lihat dulu. Alat −50%. Sisa waktu nyata, bukan “3 kursi”.',
      world: {
        applications: {
          's-tamu': {
            name: 'Tamu Demo',
            wa: '628120000099',
            city: 'Bekasi',
            hasShop: false,
            shopName: '',
            shopUrl: '',
            heard: 'Grup WA Anton',
            at: 'now'
          }
        },
        crm: { 's-tamu': { stage: 'form' } },
        billing: {
          's-tamu': { offerStartedAt: 'now', offerExpiresAt: '+24h', note: 'Form masuk · jam diskon jalan' }
        }
      },
      student: { personaId: 's-tamu', tab: 'daftar', payTerm: 'month' },
      mentor: { tab: 'orang', personId: 's-tamu', hub: 'pipa' }
    },
    {
      id: 'a1-later',
      act: 1,
      title: 'Bayar nanti',
      sayAnton: 'Ayu di Trial 24 jam. Home kelihatan utuh. Kamu tetap bisa buka filenya.',
      saySiswa: 'Ayu Rahma melihat sekolah yang sama. Live, Diskusi, Kolab masih kunci. Hanya video 1 yang janji kebuka.',
      student: { personaId: 's-ayu', tab: 'home' },
      mentor: { tab: 'orang', personId: 's-ayu', hub: 'pipa' }
    },
    {
      id: 'a1-video',
      act: 1,
      title: 'Video 1 + kunci',
      sayAnton: 'Lembar kerja video 1 ikut. Materi berikutnya tetap kunci sampai lunas.',
      saySiswa: 'Ayu di Belajar: Selamat datang kebuka. Video 2 tertutup + Lanjut mentoring. Kurikulum HP bisa diketuk.',
      student: { personaId: 's-ayu', tab: 'belajar', lectureId: 'v1', kurOpen: true },
      mentor: { tab: 'orang', personId: 's-ayu', hub: 'pipa' }
    },
    {
      id: 'a1-nonton',
      act: 1,
      title: 'Nonton belum bayar',
      sayAnton: 'Farah sudah nonton. Tugas: kamu yang buka WA, bukan sistem yang mengetik atas namamu.',
      saySiswa: 'Farah Nisa dapat prompt bayar setelah video 1. Affiliate tidak termasuk harga mentoring.',
      student: { personaId: 's-farah', tab: 'belajar', lectureId: 'v1', payPrompt: true },
      mentor: { tab: 'tugas', personId: 's-farah' }
    },
    {
      id: 'a1-12h',
      act: 1,
      title: '12 jam · tugas WA',
      sayAnton: 'Simulasi jam, bukan tunggu semalam. Tugas + antrian WA = wa.me. Tidak auto-send.',
      saySiswa: 'Farah masih di trial. Harga perkenalan masih jalan sampai jam form + 24 jam.',
      student: { personaId: 's-farah', tab: 'home', payPrompt: true },
      mentor: { tab: 'tugas', personId: 's-farah' }
    },
    {
      id: 'a1-lunas',
      act: 1,
      title: 'Lunas mentoring',
      sayAnton: 'Kamu (demo) di Mentee. Merchant = Anton. Cek transfer di baris siswa / profil.',
      saySiswa: 'Kelas penuh. Alat lynk ikut mentoring. Laris Affiliate tetap satuan / Contoh.',
      student: { personaId: 's-kamu', tab: 'alat' },
      mentor: { tab: 'orang', personId: 's-kamu', hub: 'pipa' }
    },
    {
      id: 'a2-renew',
      act: 2,
      title: 'Perpanjangan 5 hari',
      sayAnton: 'Hadi Kusuma akan keluar. Jeda 5 hari + copy WA di Otomasi, bukan hardcode.',
      saySiswa: 'Hadi masih masuk kelas. Akses sampai 23 Sep. Peringatan jujur, bukan ancaman palsu.',
      student: { personaId: 's-hadi', tab: 'home' },
      mentor: { tab: 'orang', personId: 's-hadi', hub: 'pipa' }
    },
    {
      id: 'a2-grace',
      act: 2,
      title: 'Grace 1 hari',
      sayAnton: 'Irma Sari: tugas WA pribadi Anton. Setelah tenggang, preview video 1 saja + Sudah keluar.',
      saySiswa: 'Irma masih lunas dalam masa tenggang. Bayar hari ini supaya kelas tidak mengunci.',
      student: { personaId: 's-irma', tab: 'home' },
      mentor: { tab: 'tugas', personId: 's-irma' }
    },
    {
      id: 'a2-cert',
      act: 2,
      title: 'Tes + sertifikat',
      sayAnton: 'Joko Santoso lulus 5/5. Satu tes di akhir, skor tidak dikarang. Sertifikat bisa dicetak.',
      saySiswa: 'Sertifikat serial ANT-JOKO-001. Pengakuan prestasi nyata — bukan kelangkaan palsu.',
      student: { personaId: 's-joko', tab: 'sertifikat' },
      mentor: { tab: 'orang', personId: 's-joko', hub: 'pipa' }
    },
    {
      id: 'a2-mentor',
      act: 2,
      title: 'Jadi mentor · 20%',
      sayAnton: 'Kamu tidak auto-enrol staf. Mereka terima dulu. 20% = licensing kurikulum/merek, satu tingkat.',
      saySiswa: 'Joko baca: tarik bayaran murid sendiri. Anton 20% dari mentoring + alat + Laris Affiliate. Bukan piramida rekrut.',
      student: { personaId: 's-joko', tab: 'progres' },
      mentor: { tab: 'orang', personId: 's-joko', hub: 'pipa' }
    },
    {
      id: 'a2-jaringan',
      act: 2,
      title: 'Jaringan Dewi',
      sayAnton: 'Dewi: 2 murid (Oki mentoring, Putri SKU+Affiliate). Setoran 20% expected vs received. Rekening mereka.',
      saySiswa: 'Oki Firmansyah murid Dewi, bukan downline tak terbatas. Satu tingkat di bawah Anton.',
      student: { personaId: 's-oki', tab: 'home' },
      mentor: { tab: 'jaringan' }
    }
  ];

  const ORIGIN = location.origin;
  const $ = (id) => document.getElementById(id);
  const mentorFrame = $('frame-mentor');
  const studentFrame = $('frame-student');
  const MENTOR_W = 1280;
  const MENTOR_H = 800;
  const PHONE_W = 390;
  const PHONE_H = 844;

  let act = 1;
  let index = 0;
  let live = false;

  function scenesInAct() { return SCENES.filter((s) => s.act === act); }
  function current() { return scenesInAct()[index] || scenesInAct()[0]; }

  function fillSelect() {
    const sel = $('scene-select');
    const list = scenesInAct();
    sel.innerHTML = list.map((s, i) =>
      '<option value="' + i + '"' + (i === index ? ' selected' : '') + '>' +
      (i + 1) + '. ' + s.title + '</option>'
    ).join('');
    $('scene-count').textContent = (index + 1) + ' / ' + list.length;
    $('btn-act-1').setAttribute('aria-selected', act === 1);
    $('btn-act-2').setAttribute('aria-selected', act === 2);
  }

  function setCaptions(scene) {
    $('say-anton').textContent = scene.sayAnton;
    $('say-siswa').textContent = scene.saySiswa;
    $('live-note').hidden = !live;
  }

  function postScene(win, scene) {
    if (!win) return;
    win.postMessage({ source: 'anton-present', cmd: 'scene', scene: scene }, ORIGIN);
  }

  function applyCurrent() {
    live = false;
    const scene = current();
    fillSelect();
    setCaptions(scene);
    postScene(mentorFrame.contentWindow, scene);
    postScene(studentFrame.contentWindow, scene);
  }

  function go(i) {
    const list = scenesInAct();
    index = Math.max(0, Math.min(list.length - 1, i));
    applyCurrent();
  }

  function setAct(n) {
    act = n === 2 ? 2 : 1;
    index = 0;
    applyCurrent();
  }

  function fitFrame(host, iframe, vw, vh) {
    if (!host || !iframe) return;
    const cw = host.clientWidth;
    const ch = host.clientHeight;
    if (cw < 8 || ch < 8) return;
    const s = Math.min(cw / vw, ch / vh);
    iframe.style.width = vw + 'px';
    iframe.style.height = vh + 'px';
    iframe.style.transform = 'scale(' + s + ')';
    const extraX = (cw - vw * s) / 2;
    const extraY = (ch - vh * s) / 2;
    iframe.style.left = extraX + 'px';
    iframe.style.top = extraY + 'px';
  }

  function fitAll() {
    fitFrame($('mentor-host'), mentorFrame, MENTOR_W, MENTOR_H);
    fitFrame($('student-host'), studentFrame, PHONE_W, PHONE_H);
  }

  function waitApi(iframe) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      function tick() {
        try {
          if (iframe.contentWindow && iframe.contentWindow.__antonSchool) {
            resolve();
            return;
          }
        } catch (err) { /* still loading */ }
        if (Date.now() - t0 > 15000) {
          resolve();
          return;
        }
        setTimeout(tick, 60);
      }
      iframe.addEventListener('load', tick);
      tick();
    });
  }

  $('btn-act-1').addEventListener('click', () => setAct(1));
  $('btn-act-2').addEventListener('click', () => setAct(2));
  $('scene-select').addEventListener('change', (e) => go(+e.target.value));
  $('btn-prev').addEventListener('click', () => go(index - 1));
  $('btn-next').addEventListener('click', () => go(index + 1));
  $('btn-reset').addEventListener('click', () => go(0));
  $('btn-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(index + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(index - 1); }
  });

  window.addEventListener('message', (e) => {
    if (e.origin !== ORIGIN) return;
    if (!e.data || e.data.source !== 'anton-school') return;
    if (e.data.type === 'live') {
      live = true;
      $('live-note').hidden = false;
    }
    if (e.data.type === 'key') {
      if (e.data.key === 'ArrowRight') go(index + 1);
      if (e.data.key === 'ArrowLeft') go(index - 1);
    }
  });

  window.addEventListener('resize', fitAll);
  new ResizeObserver(fitAll).observe(document.querySelector('.stage'));

  Promise.all([waitApi(mentorFrame), waitApi(studentFrame)]).then(() => {
    fitAll();
    applyCurrent();
  });
  fitAll();
})();
