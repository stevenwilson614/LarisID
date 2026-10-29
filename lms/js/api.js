/* LMS data. Every call uses the LMS session. The database rejects a mentor
   reading another school, and a student reading a draft or another mentor. */
(function () {
  var MAX_BYTES = 52428800;
  var MIME = {
    'application/pdf': 1,
    'image/jpeg': 1,
    'image/png': 1,
    'image/webp': 1,
    'text/plain': 1,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 1,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 1,
    'video/mp4': 1,
    'application/octet-stream': 1
  };

  function sb() {
    if (!window.Lms || !window.Lms.sb) throw new Error('lms_auth');
    return window.Lms.sb;
  }
  function fail(error) {
    if (error) throw error;
  }
  function mimeOf(file) {
    var type = String((file && file.type) || '').toLowerCase();
    if (MIME[type]) return type;
    var name = String((file && file.name) || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.txt')) return 'text/plain';
    if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (name.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (name.endsWith('.mp4')) return 'video/mp4';
    return 'application/octet-stream';
  }

  async function me() {
    var res = await sb().rpc('lms_me');
    fail(res.error);
    return res.data || null;
  }
  async function registerMentor(name) {
    var res = await sb().rpc('lms_register_mentor', { p_name: name });
    fail(res.error);
    return res.data;
  }
  async function createInvite() {
    var res = await sb().rpc('lms_create_invite');
    fail(res.error);
    return res.data;
  }
  async function acceptInvite(token, name) {
    var res = await sb().rpc('lms_accept_invite', { p_token: token, p_name: name || null });
    fail(res.error);
    return res.data;
  }
  async function students() {
    var res = await sb().from('lms_accounts')
      .select('display_name, created_at')
      .eq('role', 'student')
      .order('created_at', { ascending: true });
    fail(res.error);
    return res.data || [];
  }
  async function curriculum() {
    var mods = await sb().from('lms_modules').select('id, title, sort_order, created_at').order('sort_order');
    var lessons = await sb().from('lms_lessons').select('id, module_id, title, body, published, sort_order, created_at').order('sort_order');
    var files = await sb().from('lms_materials').select('id, lesson_id, name, mime, byte_size, storage_path');
    fail(mods.error);
    fail(lessons.error);
    fail(files.error);
    return {
      modules: mods.data || [],
      lessons: lessons.data || [],
      files: files.data || []
    };
  }
  async function addModule(title, sortOrder) {
    var res = await sb().from('lms_modules').insert({ title: title, sort_order: sortOrder }).select('id, title, sort_order, created_at').single();
    fail(res.error);
    return res.data;
  }
  async function addLesson(moduleId, title, body, published, sortOrder) {
    var res = await sb().from('lms_lessons').insert({
      module_id: moduleId,
      title: title,
      body: body || '',
      published: !!published,
      sort_order: sortOrder
    }).select('id, module_id, title, body, published, sort_order, created_at').single();
    fail(res.error);
    return res.data;
  }
  async function saveLesson(id, title, body, published) {
    var res = await sb().from('lms_lessons').update({
      title: title,
      body: body || '',
      published: !!published
    }).eq('id', id).select('id').single();
    fail(res.error);
    return res.data;
  }
  async function deleteModule(id) {
    var res = await sb().from('lms_modules').delete().eq('id', id);
    fail(res.error);
  }
  async function deleteLesson(id) {
    var res = await sb().from('lms_lessons').delete().eq('id', id);
    fail(res.error);
  }
  async function deleteMaterial(id) {
    var res = await sb().from('lms_materials').delete().eq('id', id);
    fail(res.error);
  }
  async function uploadMaterial(lessonId, file) {
    if (!file) throw new Error('lms_name');
    if (file.size > MAX_BYTES) throw new Error('lms_size');
    var mime = mimeOf(file);
    if (!MIME[mime]) throw new Error('lms_mime');
    var session = await sb().auth.getSession();
    var user = session.data && session.data.session && session.data.session.user;
    if (!user) throw new Error('lms_auth');
    var id = crypto.randomUUID();
    var path = user.id + '/' + id;
    var up = await sb().storage.from('lms-materials').upload(path, file, {
      contentType: mime,
      upsert: false
    });
    fail(up.error);
    var row = await sb().from('lms_materials').insert({
      id: id,
      lesson_id: lessonId,
      name: String(file.name || 'berkas').slice(0, 180),
      storage_path: path,
      mime: mime,
      byte_size: file.size
    }).select('id, lesson_id, name, mime, byte_size, storage_path').single();
    if (row.error) {
      await sb().storage.from('lms-materials').remove([path]);
      throw row.error;
    }
    return row.data;
  }
  async function openMaterial(file) {
    var res = await sb().storage.from('lms-materials').download(file.storage_path);
    fail(res.error);
    var blob = new Blob([res.data], { type: file.mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = file.name || 'berkas';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  window.LmsApi = {
    me: me,
    registerMentor: registerMentor,
    createInvite: createInvite,
    acceptInvite: acceptInvite,
    students: students,
    curriculum: curriculum,
    addModule: addModule,
    addLesson: addLesson,
    saveLesson: saveLesson,
    deleteModule: deleteModule,
    deleteLesson: deleteLesson,
    deleteMaterial: deleteMaterial,
    uploadMaterial: uploadMaterial,
    openMaterial: openMaterial
  };
})();
