#!/usr/bin/env node
/**
 * Unit tests for Ask Laris follow-up routing helpers (js/gpt-chat-memory.js).
 * No network. Run: node scripts/test-ask-laris-followup.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const mem = require(join(dirname(fileURLToPath(import.meta.url)), '../js/gpt-chat-memory.js'));

let failed = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    console.log(`ok  ${name}`);
    return;
  }
  failed++;
  console.error(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
}
function ok(name, cond) {
  if (cond) console.log(`ok  ${name}`);
  else { failed++; console.error(`FAIL ${name}`); }
}

// Affirmatives — the Tati "mau" bug
ok('mau is affirmative', mem.isAffirmativeReply('mau'));
ok('iya is affirmative', mem.isAffirmativeReply('iya'));
ok('lanjut is affirmative', mem.isAffirmativeReply('lanjut'));
ok('Mau! is affirmative', mem.isAffirmativeReply('Mau!'));
ok('oke dong is affirmative', mem.isAffirmativeReply('oke dong'));
ok('celana kulot linen is NOT affirmative', !mem.isAffirmativeReply('celana kulot linen'));

// Refinements — keep 300jt / 3 bulan when she says fashion
ok('untuk pashion is refinement', mem.isConstraintRefinement('untuk pashion seperti celana kulot'));
ok('tapi fashion is refinement', mem.isConstraintRefinement('tapi fashion'));
ok('pashion alone is refinement', mem.isConstraintRefinement('pashion'));
ok('celana kulot linen is NOT refinement', !mem.isConstraintRefinement('celana kulot linen'));
ok('mau is not also a refinement', !mem.isConstraintRefinement('mau'));

ok('tidak is decline', mem.isDeclineReply('tidak'));
ok('nggak is decline', mem.isDeclineReply('nggak'));

// Conversational thread
const agentChat = {
  context: { kind: 'market_agent', q: 'omset 300jt' },
  messages: [
    { role: 'user', content: { text: 'cari produk 3 bulan omset 300 jta' } },
    { role: 'assistant', content: { text: 'Aku temukan treadmill. Mau aku lanjut ke penilaian produknya?' } },
  ],
};
ok('market_agent is conversational', mem.chatIsConversationalThread(agentChat));
ok('empty chat is not', !mem.chatIsConversationalThread({ messages: [] }));
ok('clarify dead-end is not conversational', !mem.chatIsConversationalThread({
  messages: [{ role: 'assistant', content: { text: 'Klarifikasi pencarian' } }],
}));
ok('card result is conversational via types', mem.chatIsConversationalThread({
  messages: [{ role: 'assistant', content: { text: 'Hasil pasar', types: ['kulot batik'] } }],
}));

// Pending offer from the screenshot compare question
const offer = mem.extractPendingOffer(
  'Kalau kamu mau tahu mana yang paling menjanjikan di antara **kulot batik vs kulot wanita** untuk modal 5 juta, aku bisa bandingin skor dan kompetisinya lebih detail. Mau?'
);
ok('extracts compare offer', !!(offer && /Bandingkan kulot batik vs kulot wanita/i.test(offer.prompt)));
eq('mau expands to compare prompt', mem.resolveAffirmativePrompt('mau', offer), offer.prompt);
ok('no offer still expands', mem.resolveAffirmativePrompt('mau', null).includes('lanjutkan'));

const lanjutOffer = mem.extractPendingOffer('Mau aku lanjut ke penilaian produknya?');
ok('lanjut offer', !!(lanjutOffer && /penilaian/i.test(lanjutOffer.prompt)));

ok('plain answer is not an offer', !mem.extractPendingOffer('Skor pasar kulot 72. Kompetisi sedang.'));

// Research constraints from Tati's first ask
const first = mem.parseResearchConstraints(
  'caraikan produk yg 3 bulan lamanya tapi penjualanperbulannya mencapai omset 300 jta minimal'
);
eq('omset_min 300jt', first.omset_min, 300000000);
eq('max_age_days 90', first.max_age_days, 90);
ok('first ask has no category', !first.category);

const refine = mem.parseResearchConstraints('untuk pashion seperti celana kulot');
eq('pashion → Fashion', refine.category, 'Fashion');

const merged = mem.mergeResearchConstraints(first, refine);
eq('merge keeps omset', merged.omset_min, 300000000);
eq('merge keeps age', merged.max_age_days, 90);
eq('merge adds Fashion', merged.category, 'Fashion');

const block = mem.researchPromptBlock(merged);
ok('prompt block has kategori', /kategori: Fashion/.test(block));
ok('prompt block has omset', /300/.test(block));
ok('prompt block has umur', /90 hari/.test(block));

// History serializer — cards must name the pasar, not "Hasil pasar"
eq(
  'serialize card turn',
  mem.serializeMessageForAi({ text: 'Hasil pasar', q: 'kulot', types: ['kulot batik', 'kulot wanita'] }),
  'Hasil pasar untuk "kulot": kulot batik, kulot wanita'
);
eq('serialize prose', mem.serializeMessageForAi({ text: 'Skor 72' }), 'Skor 72');
eq('serialize string', mem.serializeMessageForAi('halo'), 'halo');

// Tool-result pasar keys (so agent replies can grow cards)
eq(
  'keys from cari_pasar',
  mem.extractPasarKeysFromToolOut({ n: 2, pasar: [{ pasar: 'kulot batik' }, { pasar: 'kulot wanita' }] }),
  ['kulot batik', 'kulot wanita']
);
eq(
  'keys from listing lift',
  mem.extractPasarKeysFromToolOut({ listing: [{ pasar: 'treadmill elektrik' }], pasar_terkait: [{ pasar: 'treadmill elektrik' }] }),
  ['treadmill elektrik']
);

// Listing pack — listing_date + omset honesty
const packed = mem.packListingFields({
  listing_date: '2026-05-20T00:00:00.000Z',
  nowcast_omset_monthly: 312000000,
  nowcast_method: 'measured',
}, Date.parse('2026-08-18T00:00:00.000Z'));
ok('has listing_date', packed.listing_date === '2026-05-20T00:00:00.000Z');
eq('umur_hari ~90', packed.umur_hari, 90);
eq('omset_bln', packed.omset_bln, 312000000);
eq('measured → terukur', packed.omset_label, 'terukur');
eq('peer → perkiraan', mem.omsetLabel({ nowcast_method: 'peer' }), 'perkiraan');

// Tati thread routing sketch (helpers only — gpt-app.js wires them)
ok('after agent, mau would stay in thread', mem.chatIsConversationalThread(agentChat) && mem.isAffirmativeReply('mau'));
ok('after agent, fashion refine stays in thread', mem.chatIsConversationalThread(agentChat) && mem.isConstraintRefinement('untuk pashion seperti celana kulot'));
ok('new noun search still not a follow-up', !mem.isConstraintRefinement('celana kulot linen') && !mem.isAffirmativeReply('celana kulot linen'));

ok('ya, lanjut is affirmative', mem.isAffirmativeReply('ya, lanjut'));
ok('oke lanjut is affirmative', mem.isAffirmativeReply('oke lanjut'));
ok('boleh dong is affirmative', mem.isAffirmativeReply('boleh dong'));
ok('lanjutkan jawaban is continue', mem.isContinueReply('Lanjutkan jawaban'));
ok('ya boleh is affirmative', mem.isAffirmativeReply('ya boleh'));

const shownChat = {
  context: {
    kind: 'market_agent',
    lastShown: {
      query: 'crocs',
      types: ['crocs original'],
      listings: [{ item_id: 1, shop_id: 2, location: 'Kota Bandung', product_name: 'Crocs Classic' }],
    },
  },
  messages: [
    { role: 'user', content: { text: 'Crocs' } },
    { role: 'assistant', content: { text: 'Pasar Crocs', types: ['crocs original'] } },
  ],
};
eq('Crocs is lookup', mem.detectResponseMode('Crocs', { messages: [] }), 'lookup');
eq('terlaris minggu is weekly', mem.detectResponseMode('Apa yang terlaris minggu ini?', shownChat), 'weekly');
eq('Bandung follow-up is filter', mem.detectResponseMode('are any of those sellers in bandung', shownChat), 'filter');
eq('ada yang dari Bandung is filter', mem.detectResponseMode('ada yang dari Bandung?', shownChat), 'filter');
eq('Crocs Bandung is lookup not filter', mem.detectResponseMode('Crocs Bandung', shownChat), 'lookup');
eq('affiliate is refer', mem.detectResponseMode('untuk affiliate produk mana yang bagus', shownChat), 'refer');
eq('affiliator is refer', mem.detectResponseMode('produk bagus untuk affiliator', { messages: [] }), 'refer');
eq('lanjutkan jawaban is continue not filter', mem.detectResponseMode('Lanjutkan jawaban', shownChat), 'continue');
eq('supplier ask is public', mem.detectResponseMode('supplier Crocs di mana', { messages: [] }), 'public');
eq('judgment compare', mem.detectResponseMode('sebaiknya jual Crocs atau sandal?', { messages: [] }), 'judgment');

const lanjut = mem.extractLanjutBlock('Ringkas.\n<lanjut>\n1. Ada seller dari Bandung?\n2. Bandingkan harga\n</lanjut>');
eq('lanjut lines', lanjut.lines, ['Ada seller dari Bandung?', 'Bandingkan harga']);
ok('lanjut rest drops tags', lanjut.rest === 'Ringkas.' && !/<lanjut>/.test(lanjut.rest));

const packedShown = mem.packLastShown(
  [{ item_id: 9, shop_id: 8, product_name: 'Crocs', location: 'Kota Bandung', price: 120000 }],
  [{ keyword: 'crocs original' }],
  'crocs'
);
eq('packLastShown query', packedShown.query, 'crocs');
eq('packLastShown type', packedShown.types, ['crocs original']);
ok('packLastShown listing', packedShown.listings[0].item_id === 9 && packedShown.listings[0].location === 'Kota Bandung');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
