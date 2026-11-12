/**
 * Course access for one school: free, one-time (no expiry), or subscription.
 * Audience is everyone, named groups, or named students. A mentor grant or
 * deny on a student overrides the group. Loaded by the class page and required
 * by the school API so the two do not drift.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CourseAccess = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var MAIN = 'c-utama';

  function nowMs(now) {
    if (typeof now === 'number' && isFinite(now)) return now;
    if (now instanceof Date) return now.getTime();
    return Date.now();
  }

  function graceMs(state) {
    var days = Number(state && state.dunning && state.dunning.graceDays);
    if (!isFinite(days) || days < 0) days = 1;
    return days * 86400000;
  }

  function coursesOf(state) {
    return Array.isArray(state && state.courses) ? state.courses : [];
  }

  function courseById(state, id) {
    var want = String(id || '');
    var list = coursesOf(state);
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].id === want) return list[i];
    }
    return null;
  }

  function groupsOf(state) {
    return Array.isArray(state && state.groups) ? state.groups : [];
  }

  function defaultAccess() {
    return {
      mode: 'free',
      priceIdr: 0,
      packages: [],
      audience: 'all',
      groupIds: [],
      studentIds: [],
      alsoUnlocks: [],
      includesCommunity: false,
      freeGroupIds: [],
      lynkByPackage: {}
    };
  }

  function accessOf(course) {
    var raw = course && course.access;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultAccess();
    return raw;
  }

  function asList(value) {
    return Array.isArray(value) ? value : [];
  }

  function memberOfGroup(state, groupId, personId) {
    var groups = groupsOf(state);
    var want = String(personId || '');
    var gid = String(groupId || '');
    for (var i = 0; i < groups.length; i += 1) {
      var group = groups[i];
      if (!group || group.id !== gid) continue;
      var members = asList(group.memberIds).map(String);
      return members.indexOf(want) >= 0;
    }
    return false;
  }

  function inAudience(state, course, personId) {
    var access = accessOf(course);
    var aud = access.audience || 'all';
    if (aud === 'groups') {
      var groups = asList(access.groupIds);
      for (var i = 0; i < groups.length; i += 1) {
        if (memberOfGroup(state, groups[i], personId)) return true;
      }
      return false;
    }
    if (aud === 'students') {
      return asList(access.studentIds).map(String).indexOf(String(personId || '')) >= 0;
    }
    return true;
  }

  function grantRow(state, personId, courseId) {
    var map = state && state.courseGrants && state.courseGrants[personId];
    return map && map[courseId] ? map[courseId] : null;
  }

  function billRow(state, personId, courseId) {
    var map = state && state.courseBilling && state.courseBilling[personId];
    return map && map[courseId] ? map[courseId] : null;
  }

  function isDeny(grant) {
    return !!(grant && grant.kind === 'deny');
  }

  function untilActive(until, now, grace) {
    if (until == null || until === '') return true;
    var end = new Date(until).getTime();
    if (!isFinite(end)) return false;
    return now < end + grace;
  }

  function rowActive(row, now, grace) {
    if (!row || row.kind === 'deny') return false;
    if (row.status === 'expired' || row.status === 'trial' || row.status === 'belum' || row.status === 'pending') return false;
    if (row.kind === 'grant') return untilActive(row.until, now, grace);
    if (row.status === 'gratis') return untilActive(row.until, now, grace);
    if (row.status === 'lunas' || row.status === 'cicilan') return untilActive(row.until, now, grace);
    return false;
  }

  function snapshotIds(state, courseId) {
    var course = courseById(state, courseId);
    var ids = [courseId];
    asList(course && accessOf(course).alsoUnlocks).forEach(function (id) {
      if (id && id !== courseId && courseById(state, id) && ids.indexOf(id) < 0) ids.push(id);
    });
    return ids;
  }

  function paidCovers(state, personId, courseId, now) {
    var grace = graceMs(state);
    var own = billRow(state, personId, courseId);
    if (rowActive(own, now, grace)) return true;
    var all = (state.courseBilling && state.courseBilling[personId]) || {};
    var keys = Object.keys(all);
    for (var i = 0; i < keys.length; i += 1) {
      var row = all[keys[i]];
      if (!rowActive(row, now, grace)) continue;
      if (asList(row.includedCourseIds).indexOf(courseId) >= 0) return true;
    }
    return false;
  }

  function inFreeGroup(state, course, personId) {
    var ids = asList(accessOf(course).freeGroupIds);
    for (var i = 0; i < ids.length; i += 1) {
      if (memberOfGroup(state, ids[i], personId)) return true;
    }
    return false;
  }

  function canOpenCourse(state, personId, courseId, nowInput) {
    var course = courseById(state, courseId);
    if (!course || !personId) return false;
    var now = nowMs(nowInput);
    var grace = graceMs(state);
    var grant = grantRow(state, personId, courseId);
    if (isDeny(grant)) return false;
    if (grant && grant.kind === 'grant' && rowActive(grant, now, grace)) return true;
    if (!inAudience(state, course, personId)) return false;
    var mode = accessOf(course).mode || 'free';
    if (mode === 'free') return true;
    if (paidCovers(state, personId, courseId, now)) return true;
    if (inFreeGroup(state, course, personId)) return true;
    return false;
  }

  function legacyMentoringActive(state, personId, now) {
    var bill = (state.billing && state.billing[personId]) || {};
    if (bill.status === 'gratis') return true;
    if (bill.status === 'pending' || bill.status === 'belum' || bill.status === 'trial') return false;
    if (bill.plan !== 'mentoring') return false;
    if (bill.accessUntil) {
      var end = new Date(bill.accessUntil).getTime();
      if (isFinite(end) && now >= end + graceMs(state)) return false;
    }
    return bill.status === 'lunas' || bill.status === 'cicilan';
  }

  function communityGates(state) {
    return coursesOf(state).filter(function (course) {
      return course && accessOf(course).includesCommunity;
    });
  }

  function hasCommunity(state, personId, nowInput) {
    if (!state || !personId) return false;
    var now = nowMs(nowInput);
    var gates = communityGates(state);
    if (gates.length) {
      for (var i = 0; i < gates.length; i += 1) {
        if (canOpenCourse(state, personId, gates[i].id, now)) return true;
      }
      return false;
    }
    if (legacyMentoringActive(state, personId, now)) return true;
    if (state.paymentsEnabled !== true) {
      return !!(state.applications && state.applications[personId]);
    }
    return false;
  }

  function courseOfLecture(state, lec) {
    if (!lec) return null;
    var weeks = Array.isArray(state.weeks) ? state.weeks : [];
    var week = null;
    for (var i = 0; i < weeks.length; i += 1) {
      if (weeks[i] && weeks[i].id === lec.weekId) { week = weeks[i]; break; }
    }
    if (week && week.courseId) return courseById(state, week.courseId);
    var list = coursesOf(state);
    if (list.length === 1) return list[0];
    return null;
  }

  function orderedLectures(state, courseId) {
    var weeks = (state.weeks || []).filter(function (week) {
      if (!week) return false;
      if (week.courseId === courseId) return true;
      return !week.courseId && coursesOf(state).length === 1 && coursesOf(state)[0].id === courseId;
    });
    var out = [];
    weeks.forEach(function (week) {
      (state.lectures || []).forEach(function (lec) {
        if (lec && lec.weekId === week.id) out.push(lec);
      });
    });
    return out;
  }

  function canPreviewLecture(state, personId, lec, nowInput) {
    if (!lec || !personId) return false;
    var course = courseOfLecture(state, lec);
    if (!course || course.published === false) return false;
    var now = nowMs(nowInput);
    if (isDeny(grantRow(state, personId, course.id))) return false;
    if (!inAudience(state, course, personId)) return false;
    if (canOpenCourse(state, personId, course.id, now)) return false;
    var mode = accessOf(course).mode || 'free';
    if (mode === 'free') return false;
    var list = orderedLectures(state, course.id);
    return !!(list[0] && list[0].id === lec.id);
  }

  function courseShown(state, personId, course, nowInput) {
    if (!course || course.published === false) return false;
    var now = nowMs(nowInput);
    var grant = grantRow(state, personId, course.id);
    var granted = grant && grant.kind === 'grant' && rowActive(grant, now, graceMs(state));
    if (isDeny(grant)) return inAudience(state, course, personId);
    if (granted) return true;
    return inAudience(state, course, personId);
  }

  function kurikulumFilled(kur) {
    if (!kur || typeof kur !== 'object' || Array.isArray(kur)) return false;
    if (String(kur.name || '').trim()) return true;
    if (String(kur.description || '').trim()) return true;
    if (String(kur.coverUrl || '').trim() || String(kur.coverKey || '').trim()) return true;
    return false;
  }

  function publishedFlag(state) {
    var kur = state.kurikulum;
    if (kur && kur.published === false) return false;
    if (kur && kur.published === true) return true;
    return (Array.isArray(state.lectures) && state.lectures.length > 0) ||
      (Array.isArray(state.weeks) && state.weeks.length > 0);
  }

  function copyPackages(list) {
    return asList(list).map(function (row) {
      if (!row || !row.id) return null;
      var months = Math.max(1, Number(row.months) || 1);
      return {
        id: String(row.id),
        months: months,
        priceIdr: Math.max(0, Number(row.priceIdr) || 0),
        label: String(row.label || '').trim() || (months + ' bulan')
      };
    }).filter(Boolean);
  }

  function fillAccess(raw) {
    var base = defaultAccess();
    var src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    base.mode = src.mode === 'once' || src.mode === 'subscription' ? src.mode : 'free';
    base.priceIdr = Math.max(0, Number(src.priceIdr) || 0);
    base.packages = copyPackages(src.packages);
    base.audience = src.audience === 'groups' || src.audience === 'students' ? src.audience : 'all';
    base.groupIds = asList(src.groupIds).map(String);
    base.studentIds = asList(src.studentIds).map(String);
    base.alsoUnlocks = asList(src.alsoUnlocks).map(String);
    base.includesCommunity = src.includesCommunity === true;
    base.freeGroupIds = asList(src.freeGroupIds).map(String);
    base.lynkByPackage = src.lynkByPackage && typeof src.lynkByPackage === 'object' && !Array.isArray(src.lynkByPackage)
      ? src.lynkByPackage : {};
    return base;
  }

  function stampWeeks(state) {
    var list = coursesOf(state);
    if (!list.length || !Array.isArray(state.weeks)) return false;
    var changed = false;
    state.weeks.forEach(function (week) {
      if (!week || week.courseId) return;
      week.courseId = list[0].id;
      changed = true;
    });
    return changed;
  }

  function ensure(state) {
    if (!state || typeof state !== 'object') return false;
    var changed = false;
    if (!Array.isArray(state.groups)) { state.groups = []; changed = true; }
    if (!state.courseBilling || typeof state.courseBilling !== 'object' || Array.isArray(state.courseBilling)) {
      state.courseBilling = {};
      changed = true;
    }
    if (!state.courseGrants || typeof state.courseGrants !== 'object' || Array.isArray(state.courseGrants)) {
      state.courseGrants = {};
      changed = true;
    }
    if (Array.isArray(state.courses) && state.courses.length) {
      state.courses.forEach(function (course) {
        if (!course || typeof course !== 'object') return;
        var next = fillAccess(course.access);
        if (JSON.stringify(course.access || {}) !== JSON.stringify(next)) {
          course.access = next;
          changed = true;
        }
      });
      if (stampWeeks(state)) changed = true;
      return changed;
    }
    var kur = state.kurikulum && typeof state.kurikulum === 'object' ? state.kurikulum : {};
    var has = kurikulumFilled(kur) ||
      (Array.isArray(state.weeks) && state.weeks.length > 0) ||
      (Array.isArray(state.lectures) && state.lectures.length > 0);
    if (!has) {
      if (!Array.isArray(state.courses)) {
        state.courses = [];
        changed = true;
      }
      return changed;
    }
    var paymentsOn = state.paymentsEnabled === true;
    var pkgs = copyPackages(state.packages);
    state.courses = [{
      id: MAIN,
      title: String(kur.name || state.businessName || 'Kursus').slice(0, 120),
      description: String(kur.description || '').slice(0, 800),
      coverUrl: String(kur.coverUrl || ''),
      coverKey: String(kur.coverKey || ''),
      published: publishedFlag(state),
      access: {
        mode: paymentsOn ? 'subscription' : 'free',
        priceIdr: 0,
        packages: paymentsOn ? pkgs : [],
        audience: 'all',
        groupIds: [],
        studentIds: [],
        alsoUnlocks: [],
        includesCommunity: paymentsOn,
        freeGroupIds: [],
        lynkByPackage: paymentsOn && state.lynkByPackage && typeof state.lynkByPackage === 'object'
          ? state.lynkByPackage : {}
      }
    }];
    (state.weeks || []).forEach(function (week) {
      if (week && !week.courseId) week.courseId = MAIN;
    });
    var now = Date.now();
    Object.keys(state.billing || {}).forEach(function (personId) {
      if (!legacyMentoringActive(state, personId, now)) return;
      var bill = state.billing[personId] || {};
      var forever = bill.status === 'gratis' || !bill.accessUntil;
      state.courseBilling[personId] = state.courseBilling[personId] || {};
      state.courseBilling[personId][MAIN] = {
        status: bill.status === 'gratis' ? 'gratis' : (bill.status || 'lunas'),
        until: forever ? null : bill.accessUntil,
        source: bill.source || 'manual',
        packageId: bill.packageId || '',
        paidAt: bill.paidAt || '',
        amount: Number(bill.amount) || 0,
        includedCourseIds: [MAIN]
      };
    });
    return true;
  }

  function blankCourse() {
    var id = 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    return {
      id: id,
      title: '',
      description: '',
      coverUrl: '',
      coverKey: '',
      published: false,
      access: defaultAccess()
    };
  }

  function blankGroup(name) {
    return {
      id: 'g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: String(name || '').trim().slice(0, 60) || 'Grup',
      memberIds: []
    };
  }

  function extendUntil(existingIso, months, nowInput) {
    var now = new Date(nowMs(nowInput));
    var base = now;
    if (existingIso) {
      var cur = new Date(existingIso);
      if (isFinite(cur.getTime()) && cur.getTime() > now.getTime()) base = cur;
    }
    var until = new Date(base.getTime());
    until.setMonth(until.getMonth() + (Number(months) || 1));
    return until.toISOString();
  }

  function grantCoursePaid(state, personId, opts) {
    ensure(state);
    var options = opts || {};
    var courseId = String(options.courseId || MAIN);
    var course = courseById(state, courseId);
    if (!course || !personId) return null;
    var mode = accessOf(course).mode || 'free';
    var once = mode === 'once' || options.once === true;
    state.courseBilling[personId] = state.courseBilling[personId] || {};
    var prev = state.courseBilling[personId][courseId] || {};
    var months = Math.max(1, Number(options.months) || 1);
    state.courseBilling[personId][courseId] = {
      status: 'lunas',
      until: once ? null : extendUntil(prev.until, months, options.now),
      source: options.source || 'manual',
      packageId: options.packageId || '',
      paidAt: new Date(nowMs(options.now)).toISOString(),
      amount: Number(options.amount) || 0,
      includedCourseIds: once ? [courseId] : snapshotIds(state, courseId)
    };
    return {
      courseId: courseId,
      once: once,
      community: !once && accessOf(course).includesCommunity === true,
      until: state.courseBilling[personId][courseId].until
    };
  }

  function setGrant(state, personId, courseId, grant) {
    ensure(state);
    if (!personId || !courseId) return;
    state.courseGrants[personId] = state.courseGrants[personId] || {};
    if (!grant) {
      delete state.courseGrants[personId][courseId];
      return;
    }
    state.courseGrants[personId][courseId] = grant;
  }

  function expireCourseBilling(state, nowInput) {
    if (!state || !state.courseBilling) return false;
    var now = nowMs(nowInput);
    var grace = graceMs(state);
    var changed = false;
    Object.keys(state.courseBilling).forEach(function (personId) {
      var row = state.courseBilling[personId];
      if (!row || typeof row !== 'object') return;
      Object.keys(row).forEach(function (courseId) {
        var bill = row[courseId];
        if (!bill || bill.until == null || bill.until === '') return;
        if (bill.status === 'gratis' || bill.status === 'expired' || bill.status === 'trial') return;
        var end = new Date(bill.until).getTime();
        if (!isFinite(end) || now < end + grace) return;
        bill.status = 'expired';
        changed = true;
      });
    });
    return changed;
  }

  function lynkRows(state) {
    var rows = [];
    coursesOf(state).forEach(function (course) {
      var access = accessOf(course);
      var links = access.lynkByPackage || {};
      if (access.mode === 'once') {
        var onceLink = links.once || {};
        if (String(onceLink.title || '').trim()) {
          rows.push({
            id: 'once',
            courseId: course.id,
            once: true,
            months: 0,
            label: 'Sekali bayar',
            title: String(onceLink.title).trim(),
            url: String(onceLink.url || '').trim(),
            price: Number(onceLink.price) || Number(access.priceIdr) || 0
          });
        }
      }
      asList(access.packages).forEach(function (pkg) {
        var link = links[pkg.id] || {};
        if (!String(link.title || '').trim()) return;
        rows.push({
          id: pkg.id,
          courseId: course.id,
          once: false,
          months: pkg.months,
          label: pkg.label,
          title: String(link.title).trim(),
          url: String(link.url || '').trim(),
          price: Number(link.price) || pkg.priceIdr || 0
        });
      });
    });
    return rows;
  }

  function lectureOwnsKey(lec, key) {
    if (!lec || !key) return false;
    if (lec.videoKey === key || lec.coverKey === key) return true;
    var resources = asList(lec.resources);
    for (var i = 0; i < resources.length; i += 1) {
      var doc = resources[i];
      if (doc && (doc.fileKey === key || doc.key === key)) return true;
    }
    return false;
  }

  function studentMayReadKey(state, personId, key, nowInput) {
    if (!state || !personId || !key) return false;
    var now = nowMs(nowInput);
    var lectures = state.lectures || [];
    for (var i = 0; i < lectures.length; i += 1) {
      var lec = lectures[i];
      if (!lectureOwnsKey(lec, key)) continue;
      var course = courseOfLecture(state, lec);
      if (!course) continue;
      var open = canOpenCourse(state, personId, course.id, now);
      var preview = canPreviewLecture(state, personId, lec, now);
      if (lec.videoKey === key || asList(lec.resources).some(function (doc) {
        return doc && (doc.fileKey === key || doc.key === key);
      })) {
        if (open || preview) return true;
        continue;
      }
      if (lec.coverKey === key && (open || preview || courseShown(state, personId, course, now))) return true;
    }
    var courses = coursesOf(state);
    for (var c = 0; c < courses.length; c += 1) {
      if (courses[c] && courses[c].coverKey === key && courseShown(state, personId, courses[c], now)) return true;
    }
    return false;
  }

  function stripLecture(lec) {
    return {
      id: lec.id,
      weekId: lec.weekId,
      type: lec.type || 'text',
      title: lec.title || 'Materi',
      mins: lec.mins || 0,
      locked: true
    };
  }

  function cardFor(state, personId, course, now) {
    var access = accessOf(course);
    var studentIds = asList(access.studentIds).map(String);
    var mine = studentIds.indexOf(String(personId)) >= 0 ? [String(personId)] : [];
    var open = canOpenCourse(state, personId, course.id, now);
    var denied = isDeny(grantRow(state, personId, course.id));
    return {
      id: course.id,
      title: course.title || 'Kursus',
      description: course.description || '',
      coverUrl: open || courseShown(state, personId, course, now) ? (course.coverUrl || '') : '',
      coverKey: '',
      published: true,
      access: {
        mode: access.mode || 'free',
        priceIdr: Number(access.priceIdr) || 0,
        packages: copyPackages(access.packages),
        audience: access.audience || 'all',
        groupIds: asList(access.groupIds).map(String),
        studentIds: mine,
        alsoUnlocks: [],
        includesCommunity: access.includesCommunity === true,
        freeGroupIds: asList(access.freeGroupIds).map(String),
        lynkByPackage: {}
      },
      open: open,
      revoked: denied
    };
  }

  function projectForStudent(state, personId, nowInput) {
    var now = nowMs(nowInput);
    var shown = coursesOf(state).filter(function (course) {
      return courseShown(state, personId, course, now);
    });
    var shownIds = {};
    shown.forEach(function (course) { shownIds[course.id] = 1; });
    var openIds = {};
    var previewIds = {};
    shown.forEach(function (course) {
      if (canOpenCourse(state, personId, course.id, now)) openIds[course.id] = 1;
      else if ((orderedLectures(state, course.id)[0]) &&
        canPreviewLecture(state, personId, orderedLectures(state, course.id)[0], now)) previewIds[course.id] = 1;
    });
    var weeks = (state.weeks || []).filter(function (week) {
      return week && shownIds[week.courseId];
    });
    var weekIds = {};
    weeks.forEach(function (week) { weekIds[week.id] = 1; });
    var lectures = (state.lectures || []).filter(function (lec) {
      return lec && weekIds[lec.weekId];
    }).map(function (lec) {
      var course = courseOfLecture(state, lec);
      if (course && openIds[course.id]) return lec;
      var first = course ? orderedLectures(state, course.id)[0] : null;
      if (course && previewIds[course.id] && first && first.id === lec.id) return lec;
      return stripLecture(lec);
    });
    var myGroups = groupsOf(state).filter(function (group) {
      return memberOfGroup(state, group.id, personId);
    }).map(function (group) {
      return { id: group.id, name: group.name || 'Grup', memberIds: [String(personId)] };
    });
    var billing = {};
    var grants = {};
    if (state.courseBilling && state.courseBilling[personId]) billing[personId] = state.courseBilling[personId];
    if (state.courseGrants && state.courseGrants[personId]) grants[personId] = state.courseGrants[personId];
    return {
      courses: shown.map(function (course) { return cardFor(state, personId, course, now); }),
      weeks: weeks,
      lectures: lectures,
      groups: myGroups,
      courseBilling: billing,
      courseGrants: grants
    };
  }

  function modeLabel(mode) {
    if (mode === 'once') return 'Sekali bayar';
    if (mode === 'subscription') return 'Langganan';
    return 'Gratis';
  }

  return {
    MAIN: MAIN,
    coursesOf: coursesOf,
    courseById: courseById,
    groupsOf: groupsOf,
    accessOf: accessOf,
    defaultAccess: defaultAccess,
    inAudience: inAudience,
    memberOfGroup: memberOfGroup,
    canOpenCourse: canOpenCourse,
    canPreviewLecture: canPreviewLecture,
    courseOfLecture: courseOfLecture,
    hasCommunity: hasCommunity,
    courseShown: courseShown,
    ensure: ensure,
    blankCourse: blankCourse,
    blankGroup: blankGroup,
    grantCoursePaid: grantCoursePaid,
    setGrant: setGrant,
    expireCourseBilling: expireCourseBilling,
    lynkRows: lynkRows,
    studentMayReadKey: studentMayReadKey,
    projectForStudent: projectForStudent,
    snapshotIds: snapshotIds,
    billRow: billRow,
    grantRow: grantRow,
    modeLabel: modeLabel,
    orderedLectures: orderedLectures
  };
});
