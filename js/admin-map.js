/* Indonesia outline + city pins for the admin dashboard map.
   Ported from js/laris-app.js (Natural Earth 50m, equirectangular
   lon 94.5→141.5 / lat 6.5→-11.5 onto an 800×306 viewBox). */
(function (w) {
  w.LarisAdminMap = {
    OUTLINE: 'M51 86 58 94 57 101 54 100 53 96 49 95 44 86 47 86 49 84ZM79 141 74 138 70 131 71 127 75 127 81 138 81 140ZM377 257 375 261 376 262 370 262 364 260 367 259 367 254 373 250 378 253ZM357 249 361 254 355 257 351 261 350 257 342 253 340 250 348 250 352 248ZM197 139 202 153 210 154 206 160 207 163 196 159 192 148 181 145 185 142 185 139 187 137 189 137 191 140 191 137 194 136ZM488 188 488 193 487 191 486 191 485 198 489 200 488 201 485 203 482 207 479 207 478 204 481 199 483 189 484 186 486 185ZM479 200 478 202 473 202 473 201 475 197 474 192 480 189 481 195 479 198ZM235 48 231 48 234 46 231 45 230 43 234 39 236 43ZM233 162 231 166 227 163 223 165 222 160 224 154 227 154 233 157 235 159ZM696 122 705 123 713 129 709 131 705 131 702 125 700 126 697 124ZM697 138 722 141 710 143 698 139ZM618 111 626 113 627 116 625 117 621 117 615 112 617 116 620 117 619 118 617 118 616 116 614 117 613 115 608 114 610 112ZM578 76 575 76 574 72 576 69 580 66 582 69 581 73ZM573 139 563 140 560 139 561 135 564 133ZM537 141 542 142 527 144 526 142ZM519 140 522 140 525 143 509 145 508 142 509 139ZM627 247 623 247 624 241 632 232 634 233 632 234 633 237ZM550 241 550 242 546 244 544 246 537 245 533 247 536 241 540 242 547 240ZM512 249 512 250 520 250 521 250 521 252 509 254 509 250ZM621 133 618 132 616 127 622 126ZM34 22 40 21 52 22 58 28 60 31 64 35 65 41 89 56 103 73 109 77 108 72 111 72 119 82 124 83 129 88 132 94 134 96 142 98 145 101 145 104 137 107 143 106 150 102 156 106 158 110 152 114 152 117 153 119 152 120 157 126 168 129 170 142 176 146 176 149 173 152 173 155 178 151 185 151 189 153 197 164 197 165 193 172 195 176 193 181 194 196 191 210 189 209 185 205 180 208 173 205 173 211 172 211 159 197 137 181 130 172 120 165 109 149 108 144 99 125 91 116 88 110 79 105 73 85 70 79 54 71 53 62 49 60 42 50 33 46 18 31 12 21 12 16 19 15 28 21ZM481 257 462 262 458 261 457 262 452 263 443 260 436 260 432 261 431 259 432 254 444 251 459 257 468 255 474 258 483 252 484 251 481 250 484 249 485 252 482 255ZM434 270 438 272 439 275 444 276 447 280 448 283 441 286 438 285 427 277 418 276 416 273 422 270 431 270 433 269ZM404 252 410 252 412 254 413 252 416 252 419 258 417 260 413 259 414 261 408 261 406 258 403 261 384 266 379 264 380 256 386 253 393 254 397 259 399 259 404 257 397 253 396 249 402 249ZM517 94 509 103 498 105 490 105 485 102 451 103 444 102 440 103 437 106 434 114 435 120 438 125 443 128 445 134 452 135 454 133 461 125 468 127 473 124 483 123 482 122 488 120 492 122 492 124 492 128 489 128 486 125 483 126 472 137 466 139 462 143 457 143 461 147 464 149 469 157 473 160 475 165 473 166 472 172 478 177 480 180 483 180 483 185 480 185 480 186 470 188 469 193 461 192 459 189 462 180 456 177 449 171 452 165 452 157 449 156 445 156 438 161 441 174 440 180 441 189 439 198 441 206 433 206 429 208 427 206 423 201 427 188 428 179 425 170 416 170 413 157 419 153 420 147 422 143 422 135 426 126 429 122 431 125 429 112 431 111 431 107 439 94 441 96 444 96 449 89 452 88 458 89 461 92 475 93 482 96 486 95 500 96 507 93 518 82 521 82 523 85ZM219 213 224 216 235 218 241 226 252 228 255 227 271 229 278 220 280 220 284 224 290 224 299 228 307 229 309 234 311 235 311 239 315 241 323 242 333 241 339 243 338 254 342 260 319 252 309 254 290 252 274 249 261 244 252 242 242 241 237 243 228 242 218 238 203 236 203 234 205 231 199 229 183 227 185 224 187 226 190 221 192 221 193 215 197 211 210 214 213 213 214 211ZM258 76 256 78 258 83 272 96 283 93 295 93 299 91 301 86 306 84 314 84 315 86 325 90 330 86 341 86 346 77 345 72 352 68 350 66 351 61 353 59 357 59 359 52 359 44 360 39 364 37 366 38 370 36 385 37 393 40 391 41 396 48 394 49 392 47 391 49 384 49 389 52 389 56 393 58 394 60 393 61 395 61 394 63 396 64 401 71 401 73 396 76 401 82 417 94 415 96 409 97 403 96 398 92 399 95 396 98 392 107 391 116 393 124 387 126 381 131 380 131 379 128 379 133 371 141 373 141 374 143 371 147 375 148 376 150 375 153 371 154 372 155 372 160 369 161 370 164 365 172 344 182 343 181 341 168 340 170 338 169 338 166 336 168 333 166 327 169 326 169 325 165 321 166 316 161 314 165 311 167 308 169 303 167 295 171 295 163 293 160 291 161 287 161 280 163 278 162 279 160 276 162 274 160 268 161 265 145 263 142 264 137 264 132 260 128 251 124 253 122 249 117 251 110 246 105 245 95 246 91 249 89 247 90 248 85 253 78ZM566 96 568 96 570 93 573 91 574 87 582 84 582 92 575 96 575 98 581 101 582 105 586 107 570 103 568 106 570 115 577 126 571 123 565 115 565 106 562 100 564 96 560 91 564 79 571 73 568 79 570 82 570 88 564 93ZM600 159 604 161 611 162 614 164 616 168 619 171 618 176 602 167 596 167 595 169 585 166 579 169 572 164 569 170 568 165 574 159 587 159 590 161 595 158ZM551 163 557 168 557 172 548 176 540 172 537 169 537 165 538 163ZM518 263 518 265 522 265 521 267 518 267 520 273 519 275 509 283 500 287 496 286 496 285 497 282 495 280 497 274 503 270 504 271 508 271 510 267ZM685 208 685 218 683 219 680 218 675 214 677 213 678 210 676 208 678 208 682 203ZM681 220 678 227 676 228 674 227 674 221 676 221 674 220 674 216ZM750 251 745 254 734 253 742 239 745 237 754 236 757 242 754 248ZM791 155 791 219 789 225 791 228 791 266 774 250 776 246 773 249 764 250 762 247 756 251 755 249 759 240 753 234 760 233 755 232 751 229 755 227 748 219 745 212 747 210 744 209 746 207 742 208 741 204 728 195 727 196 717 193 706 188 693 186 684 180 684 178 687 178 677 178 675 175 672 176 667 170 667 166 670 163 667 163 666 168 664 169 662 177 660 180 654 180 651 174 653 171 651 167 644 161 639 160 638 158 642 156 651 158 656 153 659 152 667 155 668 152 671 151 671 150 669 150 671 146 655 149 644 149 639 145 637 137 621 134 625 130 626 125 635 123 645 117 653 118 663 123 672 123 674 125 674 128 677 134 674 140 676 150 680 159 681 155 682 153 684 161 687 160 688 166 694 168 698 168 704 162 707 157 710 155 713 149 725 146 726 145 726 142 737 136 751 141 771 151 785 152 787 155ZM756 253 751 253 750 252 754 250ZM123 75 124 78 123 80 119 81 118 76 122 74ZM135 94 132 92 132 87 135 90ZM136 86 136 88 129 85 128 83ZM145 98 136 96 136 92 137 91 145 96ZM148 96 140 93 140 91 145 92ZM172 90 173 93 172 96 169 94 169 93 166 93 168 91ZM175 114 176 113 179 115 177 116 169 114 171 110ZM170 116 172 119 168 122 166 119ZM259 131 255 132 255 127 259 128ZM329 232 317 234 310 231 313 228 316 228 331 228 333 229ZM563 116 565 119 563 121 567 123 568 125 566 126 564 124 561 124 561 122 558 119 559 116 561 118ZM575 173 570 175 569 174 576 170ZM550 42 548 41 550 38 548 37 549 33 552 38ZM610 139 611 144 608 145 602 144 600 142ZM101 165 102 167 97 161 97 158 101 162ZM67 120 65 120 67 114 65 111 67 111 69 115ZM33 70 22 65 21 63 22 61 24 61 33 68ZM469 203 468 204 465 200 467 197 469 198ZM489 131 489 134 493 132 494 133 494 135 491 136 490 135 488 138 488 133 483 138 482 135 484 131ZM371 176 368 180 366 172 368 167 371 166ZM484 296 482 296 482 294 491 289 492 292ZM507 252 505 256 501 254 506 250ZM501 251 498 252 494 256 489 256 493 252 492 252 495 252 498 250ZM489 181 486 183 485 179 489 179Z',
    CITY_COORDS: {
  'Jakarta': [-6.2088, 106.8456], 'Bekasi': [-6.2383, 106.9756], 'Depok': [-6.4025, 106.7942],
  'Tangerang': [-6.1783, 106.6319], 'Tangerang Selatan': [-6.2886, 106.7179], 'Bogor': [-6.5971, 106.8060],
  'Bandung': [-6.9175, 107.6191], 'Cimahi': [-6.8723, 107.5425], 'Sukabumi': [-6.9277, 106.9300],
  'Karawang': [-6.3227, 107.3376], 'Serang': [-6.1104, 106.1640], 'Cirebon': [-6.7320, 108.5523],
  'Tasikmalaya': [-7.3506, 108.2170], 'Tegal': [-6.8797, 109.1256], 'Pekalongan': [-6.8898, 109.6746],
  'Semarang': [-6.9667, 110.4167], 'Magelang': [-7.4797, 110.2177], 'Yogyakarta': [-7.7956, 110.3695],
  'Surakarta': [-7.5755, 110.8243], 'Purwokerto': [-7.4218, 109.2342], 'Purbalingga': [-7.3886, 109.3639],
  'Cilacap': [-7.7267, 109.0093], 'Kediri': [-7.8480, 112.0178], 'Malang': [-7.9666, 112.6326],
  'Surabaya': [-7.2575, 112.7521], 'Sidoarjo': [-7.4478, 112.7183], 'Gresik': [-7.1539, 112.6561],
  'Jember': [-8.1845, 113.6681], 'Denpasar': [-8.6500, 115.2167], 'Mataram': [-8.5833, 116.1167],
  'Kupang': [-10.1772, 123.6070], 'Medan': [3.5952, 98.6722], 'Banda Aceh': [5.5483, 95.3238],
  'Padang': [-0.9471, 100.4172], 'Pekanbaru': [0.5071, 101.4478], 'Batam': [1.0456, 104.0305],
  'Jambi': [-1.6101, 103.6131], 'Palembang': [-2.9761, 104.7754], 'Bengkulu': [-3.8004, 102.2655],
  'Bandar Lampung': [-5.3971, 105.2668], 'Pangkalpinang': [-2.1316, 106.1169],
  'Pontianak': [-0.0263, 109.3425], 'Banjarmasin': [-3.3186, 114.5944], 'Samarinda': [-0.5022, 117.1536],
  'Balikpapan': [-1.2379, 116.8529], 'Makassar': [-5.1477, 119.4327], 'Bau Bau': [-5.4667, 122.6167],
  'Kendari': [-3.9985, 122.5129], 'Manado': [1.4748, 124.8421],
  'Ambon': [-3.6954, 128.1814], 'Jayapura': [-2.5337, 140.7181],
},
    CITY_ALIASES: {
  'jakarta timur': 'Jakarta', 'jakarta barat': 'Jakarta', 'jakarta selatan': 'Jakarta',
  'jakarta utara': 'Jakarta', 'jakarta pusat': 'Jakarta', 'dki jakarta': 'Jakarta',
  'jogja': 'Yogyakarta', 'jogjakarta': 'Yogyakarta', 'yogya': 'Yogyakarta',
  'solo': 'Surakarta', 'tangsel': 'Tangerang Selatan', 'serpong': 'Tangerang Selatan',
  'bandung barat': 'Bandung', 'ujung pandang': 'Makassar', 'batu': 'Malang',
  'bau-bau': 'Bau Bau', 'baubau': 'Bau Bau', 'kota bau-bau': 'Bau Bau', 'kota bau bau': 'Bau Bau',
  'duriangkang': 'Batam', 'mujur lor': 'Cilacap', 'kroya': 'Cilacap',
},
    project: function (lat, lon) {
      const s = 800 / 47;
      return [(lon - 94.5) * s, (6.5 - lat) * s];
    },
    canonical: function (raw) {
      let k = String(raw || '').trim().toLowerCase();
      if (!k) return null;
      k = k.replace(/^(kota|kab\.?|kabupaten)\s+/, '').replace(/\s+/g, ' ');
      const aliases = w.LarisAdminMap.CITY_ALIASES;
      if (aliases[k]) return aliases[k];
      const coords = w.LarisAdminMap.CITY_COORDS;
      return Object.keys(coords).find(function (c) { return c.toLowerCase() === k; }) || null;
    },

    // ── Province layer ──────────────────────────────────────────────────────
    // CITY_ALIASES above deliberately folds all five Jakarta kota onto
    // 'Jakarta'. The province map needs the opposite, so it never goes through
    // canonical() — it keys on the province names user_map_distribution()
    // returns and looks them up here directly.
    //
    // `side` places the label relative to the bubble: l/r/t/b. dx/dy nudge it
    // where neighbours would collide, which on Java they always do.
    PROVINCES: {
      'Aceh':                      { lat:  4.7,  lon:  96.7, side: 't' },
      'Sumatera Utara':            { lat:  2.5,  lon:  99.0, side: 'l' },
      'Sumatera Barat':            { lat: -0.8,  lon: 100.6, side: 'l' },
      'Riau':                      { lat:  0.5,  lon: 101.7, side: 'r' },
      'Kepulauan Riau':            { lat:  0.9,  lon: 104.5, side: 't', short: 'Kep. Riau' },
      'Jambi':                     { lat: -1.7,  lon: 102.8, side: 'r', dy: -4 },
      'Sumatera Selatan':          { lat: -3.2,  lon: 104.0, side: 'r', dy: 4 },
      'Bengkulu':                  { lat: -3.6,  lon: 102.3, side: 'l' },
      'Lampung':                   { lat: -4.8,  lon: 105.2, side: 'l', dy: 10 },
      'Kepulauan Bangka Belitung': { lat: -2.5,  lon: 106.5, side: 't', dy: -4, short: 'Kep. Bangka Belitung' },
      'DKI Jakarta':               { lat: -6.2,  lon: 106.85, inset: true },
      'Banten':                    { lat: -6.4,  lon: 106.05, side: 'l', dy: 22 },
      'Jawa Barat':                { lat: -6.95, lon: 107.5, side: 'b', dy: 16 },
      'Jawa Tengah':               { lat: -7.2,  lon: 110.1, side: 't', dy: -4 },
      'DI Yogyakarta':             { lat: -7.9,  lon: 110.4, side: 'b', dy: 34 },
      'Jawa Timur':                { lat: -7.7,  lon: 112.6, side: 'r', dy: 18 },
      'Bali':                      { lat: -8.4,  lon: 115.1, side: 't', dy: -2 },
      'Nusa Tenggara Barat':       { lat: -8.6,  lon: 117.4, side: 'b', dy: 14 },
      'Nusa Tenggara Timur':       { lat: -8.9,  lon: 121.0, side: 'b', dy: 32 },
      'Kalimantan Barat':          { lat:  0.0,  lon: 110.5, side: 'l' },
      'Kalimantan Tengah':         { lat: -1.7,  lon: 113.5, side: 'l', dy: 10 },
      'Kalimantan Selatan':        { lat: -3.1,  lon: 115.3, side: 'l', dy: 22 },
      'Kalimantan Timur':          { lat:  0.5,  lon: 116.5, side: 't' },
      'Kalimantan Utara':          { lat:  3.1,  lon: 116.5, side: 'r' },
      'Sulawesi Barat':            { lat: -2.7,  lon: 119.2, side: 'l', dy: -8 },
      'Sulawesi Tengah':           { lat: -1.4,  lon: 121.0, side: 't' },
      'Gorontalo':                 { lat:  0.7,  lon: 122.5, side: 't', dy: -10 },
      'Sulawesi Utara':            { lat:  1.0,  lon: 124.5, side: 'r', dy: -6 },
      'Sulawesi Selatan':          { lat: -4.3,  lon: 120.0, side: 'b', dy: 6 },
      'Sulawesi Tenggara':         { lat: -4.2,  lon: 122.2, side: 'r', dy: 12 },
      'Maluku Utara':              { lat:  0.8,  lon: 127.8, side: 't' },
      'Maluku':                    { lat: -3.4,  lon: 129.5, side: 'b' },
      'Papua Barat':               { lat: -1.5,  lon: 133.0, side: 't' },
      'Papua':                     { lat: -4.2,  lon: 138.5, side: 'b' }
    },

    // The five kota sit inside 2.4 map units of each other at national scale —
    // unreadable, which is the whole reason for the inset. Coordinates here are
    // inset-local (0..100 square), not lat/lon.
    DKI_KOTA: {
      'Jakarta Utara':   { x: 52, y: 22, side: 'r' },
      'Jakarta Barat':   { x: 28, y: 45, side: 'l' },
      'Jakarta Pusat':   { x: 54, y: 46, side: 'r' },
      'Jakarta Timur':   { x: 76, y: 56, side: 'r' },
      'Jakarta Selatan': { x: 47, y: 74, side: 'l' }
    },

    // Simplified DKI kota outlines in the same inset-local 0..100 square.
    // Traced to read as Jakarta at a glance, not to survey it.
    DKI_SHAPES: {
      'Jakarta Utara':   'M14 34 L30 26 44 12 62 10 78 18 86 30 74 36 60 32 44 38 28 40Z',
      'Jakarta Barat':   'M14 34 L28 40 44 38 42 58 36 70 22 66 12 52Z',
      'Jakarta Pusat':   'M44 38 L60 32 66 40 64 54 52 58 42 58Z',
      'Jakarta Timur':   'M60 32 L74 36 86 30 92 46 88 66 74 78 62 72 64 54 66 40Z',
      'Jakarta Selatan': 'M36 70 L42 58 52 58 64 54 62 72 74 78 62 90 44 92 34 84Z'
    },

    // Six bands, matching the legend exactly — fillFor is the only definition
    // of the ramp, and the legend is generated from BANDS below.
    BANDS: [
      { max: 5,    fill: '#FBBFC3', label: '1–5' },
      { max: 10,   fill: '#F79AA0', label: '6–10' },
      { max: 50,   fill: '#F26C76', label: '11–50' },
      { max: 200,  fill: '#E8434F', label: '51–200' },
      { max: 500,  fill: '#C62835', label: '201–500' },
      { max: Infinity, fill: '#8E1620', label: '501+' }
    ],

    fillFor: function (n) {
      const bands = w.LarisAdminMap.BANDS;
      for (let i = 0; i < bands.length; i++) if (n <= bands[i].max) return bands[i].fill;
      return bands[bands.length - 1].fill;
    },

    radiusFor: function (n) {
      return Math.max(3.5, 3 + 0.75 * Math.sqrt(Math.max(n, 0)));
    },

    // ── renderUserMap ───────────────────────────────────────────────────────
    // Draws the whole thing into `svg` from a user_map_distribution() payload.
    // Takes its element and holds no module state, because the komunitas page
    // and the admin page render one each and would otherwise fight over the
    // same globals.
    //
    // opts.compact drops the labels and the inset for narrow screens — 34
    // leader-line labels are illegible at 375px, so the caller pairs compact
    // mode with a ranked list underneath.
    renderUserMap: function (svg, data, opts) {
      if (!svg) return;
      const M = w.LarisAdminMap;
      const o = opts || {};
      const compact = !!o.compact;
      const esc = function (t) {
        return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
      };
      const provinces = (data && data.provinces) || [];
      const dki = (data && data.dki) || [];
      const FONT = 'Plus Jakarta Sans, system-ui, sans-serif';

      const pins = provinces.map(function (row) {
        const meta = M.PROVINCES[row.province];
        if (!meta) return null;
        const xy = M.project(meta.lat, meta.lon);
        return { name: row.province, label: meta.short || row.province,
                 n: row.n || 0, x: xy[0], y: xy[1], meta: meta };
      }).filter(Boolean);

      // Label placement is solved at render time, not baked into PROVINCES as
      // fixed offsets. Counts move, radii move with them, and a static offset
      // that reads well at 759 collides with its neighbour at 2,400. The solver
      // walks the provinces largest-first so the ones that matter keep their
      // preferred side, and each later label takes the first candidate slot
      // that hits nothing already placed.
      const TEXT_W = function (name, n) {
        return Math.max(String(name).length * 5.6, String(n.toLocaleString('id-ID')).length * 8.2);
      };
      const SIDES = ['r', 'l', 't', 'b'];
      // Slide along the side, and push away from the bubble. Crowded seas —
      // Bangka Belitung wedged between Sumatra and Borneo — need the push;
      // sliding alone cannot find room there.
      const NUDGES = [0, 14, -14, 28, -28, 44, -44, 62, -62];
      const PUSHES = [0, 16, 34, 56];

      function slotFor(p, side, extra, push) {
        const r = M.radiusFor(p.n);
        const gap = r + 9 + (push || 0);
        const dx = p.meta.dx || 0;
        const dy = (p.meta.dy || 0) + (side === 'r' || side === 'l' ? extra : 0);
        let lx = p.x + dx, ly = p.y + dy, anchor = 'middle';
        if (side === 'r') { lx = p.x + gap + dx; ly = p.y + dy - 3; anchor = 'start'; }
        else if (side === 'l') { lx = p.x - gap + dx; ly = p.y + dy - 3; anchor = 'end'; }
        else if (side === 't') { lx = p.x + dx + extra; ly = p.y - gap + dy - 10; }
        else { lx = p.x + dx + extra; ly = p.y + gap + dy + 4; }
        const wpx = TEXT_W(p.label, p.n);
        const x1 = anchor === 'start' ? lx : anchor === 'end' ? lx - wpx : lx - wpx / 2;
        return { lx: lx, ly: ly, anchor: anchor, r: r,
                 x1: x1 - 2, x2: x1 + wpx + 2, y1: ly - 10, y2: ly + 19 };
      }

      const overlaps = function (a, b) {
        return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
      };
      const overlapArea = function (a, b) {
        const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        return ox > 0 && oy > 0 ? ox * oy : 0;
      };

      // Bubbles are obstacles too — a number sitting on a dark circle is
      // unreadable, which no amount of label-vs-label tidying would fix.
      const obstacles = pins.map(function (p) {
        const r = M.radiusFor(p.n);
        return { x1: p.x - r, x2: p.x + r, y1: p.y - r, y2: p.y + r };
      });
      // The inset panel is drawn later but has to be an obstacle now, or
      // Kalimantan Utara's label lands underneath it.
      const INSET = { x1: 136, y1: -108, x2: 400, y2: 68 };
      if (!compact && dki.length) obstacles.push(INSET);

      const placed = [];
      const order = pins.slice().sort(function (a, b) { return b.n - a.n; });
      order.forEach(function (p) {
        if (p.meta.inset) return;
        const pref = p.meta.side || 'r';
        const sides = [pref].concat(SIDES.filter(function (x) { return x !== pref; }));
        let best = null, bestCost = Infinity;
        search: for (let i = 0; i < sides.length; i++) {
          for (let q = 0; q < PUSHES.length; q++) {
            for (let j = 0; j < NUDGES.length; j++) {
              const slot = slotFor(p, sides[i], NUDGES[j], PUSHES[q]);
              // Preferring the configured side and the smallest move is what
              // keeps the map looking hand-placed rather than merely
              // non-overlapping.
              const preference = i * 40 + Math.abs(NUDGES[j]) + PUSHES[q] * 3;
              let cost = preference;
              for (let k = 0; k < placed.length; k++) cost += overlapArea(slot, placed[k].box) * 12;
              for (let k = 0; k < obstacles.length; k++) cost += overlapArea(slot, obstacles[k]) * 12;
              if (cost < bestCost) { bestCost = cost; best = slot; }
              if (cost === preference) break search;   // clean slot, stop looking
            }
          }
        }
        p.slot = best;
        placed.push({ name: p.name, box: best });
      });

      // A two-line label (name over count) plus the hairline that ties it to
      // its bubble.
      function labelFor(p) {
        if (compact || p.meta.inset || !p.slot) return '';
        const sl = p.slot;
        // Anchor the leader on the bubble rim, not its centre, so the line
        // never shows through a light fill.
        const tx = sl.anchor === 'start' ? sl.lx : sl.anchor === 'end' ? sl.lx : sl.lx;
        const ty = sl.ly + 4;
        const vx = tx - p.x, vy = ty - p.y;
        const len = Math.sqrt(vx * vx + vy * vy) || 1;
        const line = len > sl.r + 6
          ? '<line x1="' + (p.x + (vx / len) * sl.r).toFixed(1) + '" y1="' + (p.y + (vy / len) * sl.r).toFixed(1) +
            '" x2="' + (p.x + (vx / len) * (len - 4)).toFixed(1) + '" y2="' + (p.y + (vy / len) * (len - 4)).toFixed(1) +
            '" stroke="#E8434F" stroke-width="0.9" opacity=".7"/>'
          : '';
        return line +
               '<text x="' + sl.lx.toFixed(1) + '" y="' + sl.ly.toFixed(1) + '" text-anchor="' + sl.anchor +
               '" font-size="10.5" font-family="' + FONT + '" fill="#5B6371">' + esc(p.label) + '</text>' +
               '<text x="' + sl.lx.toFixed(1) + '" y="' + (sl.ly + 14).toFixed(1) + '" text-anchor="' + sl.anchor +
               '" font-size="13.5" font-weight="800" font-family="' + FONT + '" fill="#D62430">' +
               p.n.toLocaleString('id-ID') + '</text>';
      }

      const bubbles = pins.map(function (p) {
        // DKI's own bubble stays on the map as the anchor the inset points at,
        // but its number lives in the inset where the five kota are readable.
        const r = M.radiusFor(p.n);
        // Absolute cx/cy, and deliberately not the old .adm-map-pin class: that
        // class means "circle sits at the origin, translate me into place", and
        // the admin pan/zoom rig would move these a second time.
        return '<g>' +
               '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r.toFixed(1) +
               '" fill="' + M.fillFor(p.n) + '" fill-opacity=".9" stroke="#fff" stroke-width="1">' +
               '<title>' + esc(p.name) + ': ' + p.n.toLocaleString('id-ID') + ' pengguna</title>' +
               '</circle></g>';
      }).join('');

      const labels = pins.map(labelFor).join('');

      // ── DKI inset ──
      let inset = '';
      let insetBox = null;
      if (!compact && dki.length) {
        // Parked in the empty sea north-west of Java. The five kota sit within
        // 2.4 map units of each other at national scale, which is the whole
        // reason this panel exists.
        const IX = INSET.x1, IY = INSET.y1, IW = INSET.x2 - INSET.x1, IH = INSET.y2 - INSET.y1;
        const SX = IX + 78, SY = IY + 44, SS = 1.0;   // where the 0..100 shape square lands
        insetBox = { x1: IX, y1: IY, x2: IX + IW, y2: IY + IH };
        const jak = M.project(M.PROVINCES['DKI Jakarta'].lat, M.PROVINCES['DKI Jakarta'].lon);
        const byKota = {};
        dki.forEach(function (d) { byKota[d.kota] = d.n || 0; });

        // Fixed label rows, not positions derived from the dots: the dots are
        // only ~20px apart here and any dot-relative placement collides.
        const ROWS = {
          'Jakarta Utara':   { lx: IX + 192, ly: SY + 10, side: 'r' },
          'Jakarta Pusat':   { lx: IX + 192, ly: SY + 46, side: 'r' },
          'Jakarta Timur':   { lx: IX + 192, ly: SY + 82, side: 'r' },
          'Jakarta Barat':   { lx: IX + 70,  ly: SY + 26, side: 'l' },
          'Jakarta Selatan': { lx: IX + 70,  ly: SY + 68, side: 'l' }
        };

        const shapes = Object.keys(M.DKI_SHAPES).map(function (k) {
          const n = byKota[k] || 0;
          return '<path d="' + M.DKI_SHAPES[k] + '" fill="' + M.fillFor(n) +
                 '" fill-opacity=".9" stroke="#fff" stroke-width="1.6" vector-effect="non-scaling-stroke">' +
                 '<title>' + esc(k) + ': ' + n.toLocaleString('id-ID') + ' pengguna</title></path>';
        }).join('');

        const kotaPins = Object.keys(M.DKI_KOTA).map(function (k) {
          const d = M.DKI_KOTA[k];
          const row = ROWS[k];
          const n = byKota[k] || 0;
          const cx = SX + d.x * SS, cy = SY + d.y * SS;
          const right = row.side === 'r';
          const anchor = right ? 'start' : 'end';
          const ex = right ? row.lx - 4 : row.lx + 4;
          return '<line x1="' + cx.toFixed(1) + '" y1="' + cy.toFixed(1) +
                 '" x2="' + ex.toFixed(1) + '" y2="' + (row.ly - 1).toFixed(1) +
                 '" stroke="#E8434F" stroke-width="0.8" opacity=".6"/>' +
                 '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
                 '" r="3" fill="#B5202A" stroke="#fff" stroke-width="1.2"/>' +
                 '<text x="' + row.lx.toFixed(1) + '" y="' + row.ly.toFixed(1) + '" text-anchor="' + anchor +
                 '" font-size="9.5" font-family="' + FONT + '" fill="#5B6371">' + esc(k) + '</text>' +
                 '<text x="' + row.lx.toFixed(1) + '" y="' + (row.ly + 13).toFixed(1) + '" text-anchor="' + anchor +
                 '" font-size="12.5" font-weight="800" font-family="' + FONT + '" fill="#D62430">' +
                 n.toLocaleString('id-ID') + '</text>';
        }).join('');

        inset =
          '<g class="adm-map-inset">' +
          '<path d="M' + (IX + 76) + ' ' + (IY + IH) + ' L' + jak[0].toFixed(0) + ' ' + (jak[1] - 12).toFixed(0) +
            '" stroke="#E8434F" stroke-width="0.9" stroke-dasharray="3 3" fill="none" opacity=".6"/>' +
          '<rect x="' + (jak[0] - 10).toFixed(0) + '" y="' + (jak[1] - 10).toFixed(0) +
            '" width="20" height="20" rx="4" fill="none" stroke="#E8434F" stroke-width="0.9" stroke-dasharray="2.5 2.5"/>' +
          '<rect x="' + IX + '" y="' + IY + '" width="' + IW + '" height="' + IH +
            '" rx="14" fill="#FFF7F7" stroke="#F2D6D9" stroke-width="1"/>' +
          '<text x="' + (IX + 16) + '" y="' + (IY + 26) + '" font-size="12.5" font-weight="800" font-family="' +
            FONT + '" fill="#12141A">DKI Jakarta</text>' +
          '<g transform="translate(' + SX + ' ' + SY + ') scale(' + SS + ')">' + shapes + '</g>' +
          kotaPins +
          '</g>';
      }

      // Fit the viewBox to what was actually drawn rather than to fixed
      // margins: label positions move with the counts, and a fixed box either
      // clips them or leaves dead space around the map.
      const pad = compact ? 6 : 14;
      let bx1 = 0, by1 = 0, bx2 = 800, by2 = 306;
      pins.forEach(function (p) {
        if (!p.slot) return;
        bx1 = Math.min(bx1, p.slot.x1); bx2 = Math.max(bx2, p.slot.x2);
        by1 = Math.min(by1, p.slot.y1); by2 = Math.max(by2, p.slot.y2);
      });
      if (insetBox) {
        bx1 = Math.min(bx1, insetBox.x1); bx2 = Math.max(bx2, insetBox.x2);
        by1 = Math.min(by1, insetBox.y1); by2 = Math.max(by2, insetBox.y2);
      }
      svg.setAttribute('viewBox',
        (bx1 - pad).toFixed(0) + ' ' + (by1 - pad).toFixed(0) + ' ' +
        (bx2 - bx1 + pad * 2).toFixed(0) + ' ' + (by2 - by1 + pad * 2).toFixed(0));

      svg.innerHTML =
        '<g id="' + (o.groupId || 'adm-map-world') + '">' +
        '<path d="' + M.OUTLINE + '" fill="#E3E6EC" stroke="none"/>' +
        bubbles + labels + inset +
        '</g>';
    },

    // The legend is generated from BANDS so the ramp has exactly one
    // definition — it used to live in three places and drift.
    legendHtml: function () {
      const bands = w.LarisAdminMap.BANDS;
      const dots = bands.map(function (b, i) {
        const d = 8 + i * 3.4;
        return '<span class="adm-map-key"><i style="width:' + d.toFixed(0) + 'px;height:' + d.toFixed(0) +
               'px;background:' + b.fill + '"></i><em>' + b.label + '</em></span>';
      }).join('');
      return '<span class="adm-map-key-title">Jumlah pengguna</span><span class="adm-map-keys">' + dots + '</span>';
    }
  };
})(window);
