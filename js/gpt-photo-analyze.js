(function (global) {
  'use strict';

  // ---- tiny camera icon (wire style, no emoji) ----
  function cameraIcon() {
    const doc = document;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z'
    );
    const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '13');
    circle.setAttribute('r', '4');

    svg.appendChild(path);
    svg.appendChild(circle);
    return svg;
  }

  // ---- mount ---- //

  function mount(container, { getContext, callAi, spendQuota }) {
    if (!container) return;
    if (container.dataset.mounted) return;
    container.dataset.mounted = '1';

    // clean slate
    while (container.firstChild) container.removeChild(container.firstChild);

    const doc = container.ownerDocument;

    // file input (hidden)
    const fileInput = doc.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.id = 'gpt-photo-input-' + Date.now();

    // upload label (acts as button / drop‑zone)
    const uploadLabel = doc.createElement('label');
    uploadLabel.htmlFor = fileInput.id;
    uploadLabel.style.display = 'block';
    uploadLabel.style.cursor = 'pointer';
    uploadLabel.style.padding = '12px 16px';
    uploadLabel.style.border = '2px dashed #cbd5e1';
    uploadLabel.style.borderRadius = '8px';
    uploadLabel.style.textAlign = 'center';
    uploadLabel.style.color = '#475569';
    uploadLabel.style.backgroundColor = '#f8fafc';
    uploadLabel.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    uploadLabel.style.fontSize = '14px';

    const iconSpan = doc.createElement('span');
    iconSpan.style.marginRight = '8px';
    iconSpan.style.display = 'inline-flex';
    iconSpan.style.alignItems = 'center';
    iconSpan.style.verticalAlign = 'middle';
    iconSpan.appendChild(cameraIcon());

    const labelText = doc.createTextNode('Upload foto produk');
    uploadLabel.appendChild(iconSpan);
    uploadLabel.appendChild(labelText);

    const wrapper = doc.createElement('div');
    wrapper.style.marginBottom = '12px';
    wrapper.appendChild(fileInput);
    wrapper.appendChild(uploadLabel);

    // status line
    const statusDiv = doc.createElement('div');
    statusDiv.style.fontSize = '13px';
    statusDiv.style.color = '#334155';
    statusDiv.style.marginBottom = '8px';
    statusDiv.style.minHeight = '1.2em';

    // result area (hidden by default)
    const resultDiv = doc.createElement('div');
    resultDiv.style.display = 'none';
    resultDiv.style.border = '1px solid #e2e8f0';
    resultDiv.style.borderRadius = '8px';
    resultDiv.style.padding = '12px';
    resultDiv.style.backgroundColor = '#ffffff';
    resultDiv.style.fontSize = '14px';

    container.appendChild(wrapper);
    container.appendChild(statusDiv);
    container.appendChild(resultDiv);

    /* ---------- helpers ---------- */

    function showStatus(msg) {
      statusDiv.textContent = msg;
    }

    function resetUI() {
      fileInput.value = '';
      resultDiv.style.display = 'none';
      resultDiv.innerHTML = '';
      showStatus('');
    }

    function showError(msg) {
      showStatus(msg);
      resultDiv.style.display = 'none';
    }

    // render parsed fields
    function renderParsed(judul, deskripsi, harga) {
      resultDiv.innerHTML = '';
      const fields = [
        ['Judul', judul],
        ['Deskripsi', deskripsi],
        ['Harga', harga],
      ];
      fields.forEach(([label, value]) => {
        const row = doc.createElement('div');
        row.style.marginBottom = '10px';

        const labelEl = doc.createElement('div');
        labelEl.style.fontWeight = '600';
        labelEl.style.marginBottom = '2px';
        labelEl.textContent = label + ':';

        const valueEl = doc.createElement('div');
        valueEl.style.color = '#1e293b';
        valueEl.style.whiteSpace = 'pre-wrap';
        valueEl.textContent = value;

        row.appendChild(labelEl);
        row.appendChild(valueEl);
        resultDiv.appendChild(row);
      });

      const clearBtn = doc.createElement('button');
      clearBtn.textContent = 'Unggah foto lain';
      clearBtn.style.marginTop = '8px';
      clearBtn.style.padding = '6px 12px';
      clearBtn.style.border = '1px solid #cbd5e1';
      clearBtn.style.borderRadius = '6px';
      clearBtn.style.backgroundColor = '#f1f5f9';
      clearBtn.style.cursor = 'pointer';
      clearBtn.style.fontSize = '13px';
      clearBtn.style.fontFamily = 'inherit';
      clearBtn.addEventListener('click', resetUI);
      resultDiv.appendChild(clearBtn);

      resultDiv.style.display = 'block';
      showStatus('');
    }

    // render raw AI reply (fallback)
    function renderRaw(text) {
      resultDiv.innerHTML = '';

      const pre = doc.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
      pre.style.margin = '0 0 10px 0';
      pre.textContent = text;
      resultDiv.appendChild(pre);

      const clearBtn = doc.createElement('button');
      clearBtn.textContent = 'Unggah foto lain';
      clearBtn.style.marginTop = '8px';
      clearBtn.style.padding = '6px 12px';
      clearBtn.style.border = '1px solid #cbd5e1';
      clearBtn.style.borderRadius = '6px';
      clearBtn.style.backgroundColor = '#f1f5f9';
      clearBtn.style.cursor = 'pointer';
      clearBtn.style.fontSize = '13px';
      clearBtn.style.fontFamily = 'inherit';
      clearBtn.addEventListener('click', resetUI);
      resultDiv.appendChild(clearBtn);

      resultDiv.style.display = 'block';
      showStatus('');
    }

    // try to extract Judul / Deskripsi / Harga from the AI reply
    function parseReply(reply) {
      const lines = reply.split('\n').map(l => l.trim()).filter(Boolean);
      let judul = null;
      let deskripsi = null;
      let harga = null;

      for (let l of lines) {
        let m;
        m = l.match(/^Judul\s*:\s*(.+)$/i);
        if (m) {
          judul = m[1].trim();
          continue;
        }
        m = l.match(/^Deskripsi\s*:\s*(.+)$/i);
        if (m) {
          deskripsi = m[1].trim();
          continue;
        }
        m = l.match(/^Harga\s*:\s*(.+)$/i);
        if (m) {
          harga = m[1].trim();
          continue;
        }
      }

      return { judul, deskripsi, harga };
    }

    function handleAnalyzeReply(reply) {
      const { judul, deskripsi, harga } = parseReply(reply);
      if (judul || deskripsi || harga) {
        renderParsed(judul || '', deskripsi || '', harga || '');
      } else {
        renderRaw(reply);
      }
    }

    /* ---------- core logic ---------- */

    function processFile(file) {
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        showError('Ukuran file terlalu besar. Maksimal 5 MB.');
        fileInput.value = '';
        return;
      }

      showStatus('Menganalisis foto...');

      const reader = new FileReader();
      reader.onload = function () {
        try {
          const dataUrl = reader.result;
          const parts = dataUrl.split(',');
          if (parts.length !== 2) {
            showError('Format gambar tidak dikenal.');
            fileInput.value = '';
            return;
          }
          const mimeMatch = parts[0].match(/^data:(image\/[^;]+);base64$/);
          if (!mimeMatch) {
            showError('Format gambar tidak didukung.');
            fileInput.value = '';
            return;
          }
          const mime = mimeMatch[1];
          const base64Data = parts[1];

          // spend quota BEFORE calling the AI
          spendQuota()
            .then(ok => {
              if (!ok) {
                showError('Jatah AI harian sudah habis.');
                fileInput.value = '';
                return;
              }

              // get optional market context
              let ctx;
              try {
                ctx = getContext();
              } catch (_) {
                ctx = { keyword: 'produk', medianPrice: null };
              }
              const keyword = ctx && ctx.keyword ? ctx.keyword : 'produk';
              const medianPrice =
                ctx && ctx.medianPrice ? ctx.medianPrice : null;

              // build system prompt
              const system = [
                'Kamu adalah asisten riset produk e-commerce Indonesia. Lihat foto produk ini dan berikan analisis untuk dijual di Shopee. Konteks pasar: kata kunci "',
                keyword,
                '"',
                medianPrice
                  ? `, median harga sekitar Rp${medianPrice}`
                  : '',
                '.\nBalas HANYA dalam format persis ini, tanpa teks lain:\n',
                'Judul: <judul produk yang SEO-friendly untuk Shopee, maks 100 karakter>\n',
                'Deskripsi: <2-3 kalimat deskripsi jual yang menarik>\n',
                'Harga: <perkiraan rentang harga jual yang wajar dalam Rupiah>',
              ].join('');

              const messages = [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image',
                      source: {
                        type: 'base64',
                        media_type: mime,
                        data: base64Data,
                      },
                    },
                    {
                      type: 'text',
                      text: 'Analisis foto produk ini untuk dijual di Shopee.',
                    },
                  ],
                },
              ];

              callAi(system, messages)
                .then(reply => {
                  handleAnalyzeReply(reply);
                  fileInput.value = '';
                })
                .catch(() => {
                  showError('Gagal menganalisis foto. Coba lagi.');
                  fileInput.value = '';
                });
            })
            .catch(() => {
              showError('Gagal menganalisis foto. Coba lagi.');
              fileInput.value = '';
            });
        } catch (_) {
          showError('Gagal menganalisis foto. Coba lagi.');
          fileInput.value = '';
        }
      };

      reader.onerror = function () {
        showError('Gagal membaca file.');
        fileInput.value = '';
      };

      reader.readAsDataURL(file);
    }

    // attach the file input change listener
    fileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      processFile(file);
    });

    // initial clean state
    showStatus('');
    resultDiv.style.display = 'none';
  }

  // expose
  global.GptPhotoAnalyze = { mount };
})(window);
