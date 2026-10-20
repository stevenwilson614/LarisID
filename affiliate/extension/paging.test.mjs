import { createRequire } from 'module';
import assert from 'assert';

const require = createRequire(import.meta.url);
const P = require('./js/paging.js');

var listBody = {
  query: '',
  pagination: { page: 0, size: 20, search_key: '' },
  filter_params: {
    follower_filter: { left_bound: 1000, right_bound: -1 },
    gmv_filter: { left_bound: 0 },
    category_list: [{ id: 1 }, { id: 2 }]
  }
};

var spec = P.describeSearch(listBody);
assert.deepEqual(spec.page.path, ['pagination', 'page']);
assert.equal(spec.page.value, 0);
assert.equal(spec.size.value, 20);
assert.deepEqual(spec.cursor.path, ['pagination', 'search_key']);
assert.equal(spec.handleLookup, false);
assert.equal(spec.filters.followers.value, 1000);
assert.deepEqual(spec.filters.followers.path, ['filter_params', 'follower_filter', 'left_bound']);
assert.equal(spec.filters.gmv.value, 0);
assert.ok(spec.filters.category);

var handleSpec = P.describeSearch({ query: '@bule_barat' });
assert.equal(handleSpec.handleLookup, true);
assert.equal(handleSpec.page, null);

var paged = P.applyPaging(listBody, spec, { pageIndex: 2, cursor: 'abc', followers: 5000 });
assert.equal(paged.pagination.page, 2);
assert.equal(paged.pagination.search_key, 'abc');
assert.equal(paged.filter_params.follower_filter.left_bound, 5000);
assert.equal(listBody.pagination.page, 0);

var creators = P.extractCreatorList({
  data: {
    creators: [
      { base_info: { creator_oec_id: '7495372765352463150', user_name: 'bule_barat', nick_name: 'Barat', follower_cnt: 1200 } },
      { creator_oec_id: '7495372765352463151', user_name: 'toko.lain', gmv: 50000 }
    ]
  }
});
assert.equal(creators.length, 2);
assert.equal(creators[0].handle, 'bule_barat');
assert.equal(creators[0].creatorOpenId, '7495372765352463150');
assert.equal(creators[0].followers, 1200);
assert.equal(creators[1].revenue, 50000);

assert.equal(P.nextCursor({ pagination: { next_cursor: 'n1', search_key: 'old' } }), 'n1');

var quota = P.parseLiveQuota([
  { at: 1, resBody: JSON.stringify({ data: { invitation_quota: { max_quota: 1000, used_num: 20 } } }) }
]);
assert.equal(quota.remaining, 980);
assert.equal(quota.total, 1000);

assert.equal(P.commissionRaw(1500, 20), 2000);
assert.equal(P.commissionRaw(15, 20), 20);
assert.equal(P.endRaw(1893456000, '2026-12-31'), Math.floor(Date.parse('2026-12-31T23:59:59+07:00') / 1000));

console.log('paging.test.mjs ok');
