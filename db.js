const SUPABASE_URL = 'https://ghcdhisbqjixzzvlmjxt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoY2RoaXNicWppeHp6dmxtanh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzkzMjAsImV4cCI6MjA5MTg1NTMyMH0.Xc4gWBRhcgY46HfLPnlqcu-ZUnQ5mPTsMtCyXKF2zSw';


const supabaseClient = (function() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return window.supabase; // It might already be the client
})();
window.supabase = supabaseClient;

/* ── Simple in-memory cache to avoid redundant network calls ── */
const _cache = {};
const CACHE_TTL = 3000; // 3 seconds
function cached(key, fetcher) {
    const now = Date.now();
    if (_cache[key] && (now - _cache[key].ts) < CACHE_TTL) return Promise.resolve(_cache[key].val);
    return fetcher().then(val => { _cache[key] = { val, ts: now }; return val; });
}
function bustCache(prefix) {
    Object.keys(_cache).forEach(k => { if (k.startsWith(prefix)) delete _cache[k]; });
}

const SIMULATED_TIME = null;
const LATE_GRACE_MINUTES = 15;
const CLASS_SCHEDULES = {
    ENG: { name: 'English', start: '09:00', end: '11:00', display: '9:00 AM – 11:00 AM' },
    AP: { name: 'Araling Panlipunan (AP)', start: '11:00', end: '13:00', display: '11:00 AM – 1:00 PM' },
    MATH: { name: 'Mathematics', start: '13:00', end: '15:00', display: '1:00 PM – 3:00 PM' },
    SCI: { name: 'Science', start: '15:00', end: '17:00', display: '3:00 PM – 5:00 PM' },
};
const SKEY = 'attendease_session';

/* ─── LEGACY LOCALSTORAGE PURGE ─────────────────────────────────────────────
   The old system stored attendance, sessions, and user data in localStorage.
   We now use Supabase exclusively. This runs once per browser tab on load
   to wipe any ghost data that could pollute the Supabase-based dashboard.
   sessionStorage (where the auth session lives) is NOT touched.
────────────────────────────────────────────────────────────────────────────── */
(function purgeLegacyLocalStorage() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('attendease_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        if (keysToRemove.length > 0) {
            console.info(`[AttendEase] Cleared ${keysToRemove.length} legacy localStorage key(s):`, keysToRemove);
        }
    } catch (e) {
        // Silently ignore if localStorage is unavailable (private mode, etc.)
    }
})();

window.initCloudDb = async function() {
    // We no longer need to pull state from legacy sync url since we use RDBMS directly!
};

window.DB = {
    schedules: CLASS_SCHEDULES,
    lateGrace: LATE_GRACE_MINUTES,

    seed: async function() {
        // Handled by our SQL migrations in Supabase directly!
    },

    async getAll() {
        return cached('users_all', async () => {
            const { data, error } = await supabaseClient.from('attendease_users').select('*').or('is_archived.eq.false,is_archived.is.null');
            if (error) console.error('getAllUsers Error:', error);
            return data || [];
        });
    },

    async getById(id) {
        const { data } = await supabaseClient.from('attendease_users').select('*').eq('id', id).single();
        return data || null;
    },

    async authenticate(identifier, password) {
        if (!supabaseClient) throw new Error("Supabase SDK failed to load. Please check your internet connection or adblocker.");

        // Call the RPC that uses pgcrypto for secure hashing comparison
        const { data, error } = await supabaseClient.rpc('attendease_authenticate', {
            p_identifier: identifier,
            p_password: password
        });
        
        if (error) throw new Error(error.message);
        if (!data) return null;
        
        return data; // returns json user object
    },

    async usernameExists(username, excludeId = null) {
        const { data } = await supabaseClient.from('attendease_users').select('id').eq('username', username);
        if (!data || data.length === 0) return false;
        return data.some(u => u.id !== excludeId);
    },

    async create(data) {
        const { data: newUser, error } = await supabaseClient.from('attendease_users').insert([{
            role: data.role,
            firstname: data.firstname,
            lastname: data.lastname,
            uid: data.uid || ('UID-' + Date.now()),
            email: data.email,
            username: data.username,
            password_hash: data.password || 'default123',
            created_by: data.createdBy || 'Admin'
        }]).select().single();
        
        if (error) {
            console.error('User creation error:', error);
            throw error;
        }

        if (data.role === 'student' && newUser) {
            await this.saveStudentData(newUser.id, {
                section: data.section || '',
                guardianFbLink: ''
            });
        }

        bustCache('users');
        return newUser;
    },

    async update(id, changes) {
        const { data } = await supabaseClient.from('attendease_users').update(changes).eq('id', id).select().single();
        bustCache('users');
        return data;
    },

    async delete(id) {
        await supabaseClient.from('attendease_users').delete().eq('id', id);
        bustCache('users');
    },

    async archive(id) {
        await supabaseClient.from('attendease_users').update({ is_archived: true, archived_at: new Date() }).eq('id', id);
    },

    async restore(id) {
        await supabaseClient.from('attendease_users').update({ is_archived: false, archived_at: null }).eq('id', id);
    },

    async generateUid(role) {
        const users = await this.getAll();
        const roleUsers = users.filter(u => u.role === role);
        const count = roleUsers.length > 0 ? roleUsers.length + 1 : 1;
        const year = new Date().getFullYear();
        if (role === 'student') return `${year}-${count.toString().padStart(5, '0')}`;
        if (role === 'teacher') return `EMP-${count.toString().padStart(3, '0')}`;
        return `ADMIN-${count.toString().padStart(3, '0')}`;
    },

    async getStudentData(userId) {
        return cached('student_data_' + userId, async () => {
            try {
                const { data } = await supabaseClient.from('attendease_student_data').select('*').eq('user_id', userId).single();
                if (data) data.guardianFbLink = data.guardian_fb_link || '';
                return data || { section: '', guardianFbLink: '', attendance: { present: 0, absent: 0, late: 0 } };
            } catch (e) {
                return { section: '', guardianFbLink: '', attendance: { present: 0, absent: 0, late: 0 } };
            }
        });
    },

    async saveStudentData(userId, data) {
        await supabaseClient.from('attendease_student_data').upsert({ 
            user_id: userId, 
            section: data.section,
            guardian_fb_link: data.guardianFbLink || ''
        });
        bustCache('student_data_' + userId);
    },

    async getTeacherData(userId) {
        return cached('teacher_' + userId, async () => {
            const { data } = await supabaseClient.from('attendease_teacher_classes').select('*').eq('teacher_id', userId);
            return { classes: data || [], sessions: {}, announcements: [] };
        });
    },

    async saveTeacherData(userId, data) {},

    async getSession_attendance(teacherId, classCode, date) {
        const { data } = await supabaseClient.from('attendease_sessions')
            .select('*')
            .eq('teacher_id', teacherId)
            .eq('class_code', classCode)
            .eq('session_date', date);
        return data || [];
    },

    async getAllSessionsReport(teacherId) {
        const { data } = await supabaseClient.from('attendease_sessions')
            .select('*')
            .eq('teacher_id', teacherId);
        return data || [];
    },

    async saveSession_attendance(teacherId, classCode, date, records) {
        // Filter out 'pending' — those students have no action yet, so don't persist them
        const activeRecords = records.filter(r => r.status !== 'pending');
        const rows = activeRecords.map(r => ({
            teacher_id: teacherId,
            class_code: classCode,
            session_date: date,
            student_uid: r.studentId || r.student_uid,
            student_name: r.name || r.student_name,
            status: r.status,
            time_in: r.timeIn || r.time_in,
            time_out: r.timeOut || r.time_out,
            remark: r.remark,
            excuse_url: r.excuse || r.excuse_url,
            excuse_file_name: r.excuseFileName || r.excuse_file_name,
            location_lat: r.location_lat || (r.location ? r.location.lat : null),
            location_lng: r.location_lng || (r.location ? r.location.lng : null)
        }));
        if (rows.length) {
            const { error } = await supabaseClient.from('attendease_sessions').upsert(rows, { onConflict: 'class_code,session_date,student_uid' });
            if (error) console.error('Save Session Upsert Error:', error);
        }
    },

    async getStudentExcuse(studentUid, classCode, date) {
        try {
            const { data, error } = await supabaseClient
                .from('attendease_sessions')
                .select('excuse_url, excuse_file_name, excuse_content, excuse_submitted_at')
                .eq('student_uid', studentUid)
                .eq('class_code', classCode)
                .eq('session_date', date)
                .maybeSingle();
            if (error || !data) return null;
            // Return in format the modal expects
            const dataUrl = data.excuse_url || data.excuse_content || null;
            return dataUrl ? { dataUrl, fileName: data.excuse_file_name, submittedAt: data.excuse_submitted_at } : null;
        } catch (e) {
            console.warn('getStudentExcuse error:', e);
            return null;
        }
    },

    async submitStudentExcuse(studentSession, classCode, date, dataUrl, fileName) {
        try {
            const now = new Date().toISOString();
            const { error } = await supabaseClient
                .from('attendease_sessions')
                .update({
                    excuse_url: dataUrl,
                    excuse_content: dataUrl,
                    excuse_file_name: fileName,
                    excuse_submitted_at: now
                })
                .eq('student_uid', studentSession.uid)
                .eq('class_code', classCode)
                .eq('session_date', date);
            if (error) {
                console.error('submitStudentExcuse error:', error);
                return { success: false, message: 'Failed to submit excuse letter.' };
            }
            return { success: true, message: 'Excuse letter submitted successfully!' };
        } catch (e) {
            console.error('submitStudentExcuse exception:', e);
            return { success: false, message: 'Error submitting excuse letter.' };
        }
    },

    async getTeacherAccount() {
        const users = await this.getAll();
        return users.find(u => u.role === 'teacher') || null;
    },

    async isStudentEnrolled(cls, studentUid) {
        return true;
    },

    async getStudentsBySection() {
        const users = await this.getAll();
        const students = users.filter(u => u.role === 'student');
        let groups = {};
        for(let s of students) {
            let sd = await this.getStudentData(s.id);
            let section = sd.section || 'No Section';
            if (!groups[section]) groups[section] = [];
            groups[section].push(s);
        }
        return groups;
    },

    getCurrentTime() {
        if (SIMULATED_TIME) {
            const parts = SIMULATED_TIME.split(':').map(Number);
            const d = new Date();
            d.setHours(parts[0], parts[1], 0, 0);
            return d;
        }
        return new Date();
    },

    formatTime12h(date) {
        const h = date.getHours();
        const m = date.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    },

    async recordStudentScan(qrPayload, studentSession, mode, options = {}) {
        const teacher = await this.getTeacherAccount();
        if (!teacher) return { success: false, message: 'No teacher account found.' };

        const now = this.getCurrentTime();
        const currentTimeStr = this.formatTime12h(now);
        
        let record;
        const { data } = await supabaseClient.from('attendease_sessions')
            .select('*')
            .eq('class_code', qrPayload.cls)
            .eq('session_date', qrPayload.date)
            .eq('student_uid', studentSession.uid)
            .single();
            
        record = data;

        if (mode === 'in') {
            if (record && record.time_in) {
                return { success: false, message: `Already timed in at ${record.time_in} for this class today.` };
            }

            const sched = CLASS_SCHEDULES[qrPayload.cls];
            let status = 'present';
            if (sched) {
                const [sh, sm] = sched.start.split(':').map(Number);
                const [eh, em] = sched.end.split(':').map(Number);

                const graceLimit = new Date(now);
                graceLimit.setHours(sh, sm + LATE_GRACE_MINUTES, 0, 0);

                const classEnd = new Date(now);
                classEnd.setHours(eh, em, 0, 0);

                if (now > classEnd) status = 'absent';
                else if (now > graceLimit) status = 'late';
            }

            const studentName = `${studentSession.firstname} ${studentSession.lastname}`.trim();

            const { error: upsertErr } = await supabaseClient.from('attendease_sessions').upsert({
                teacher_id: teacher.id,
                class_code: qrPayload.cls,
                session_date: qrPayload.date,
                student_uid: studentSession.uid,
                student_name: studentName,
                status: status,
                time_in: currentTimeStr,
                location_lat: options.location?.lat,
                location_lng: options.location?.lng
            }, { onConflict: 'class_code,session_date,student_uid' });

            if (upsertErr) console.error('Upsert Session Error:', upsertErr);

            // Mirror to attendease_scans for News feed and real-time tracking
            try {
                const studentData = await this.getStudentData(studentSession.id);
                const sched = CLASS_SCHEDULES[qrPayload.cls];
                await supabaseClient.from('attendease_scans').insert([{
                    student_id: studentSession.uid,
                    student_name: studentName,
                    id_number: studentSession.id_number || null,
                    section: studentData?.section || null,
                    class_code: qrPayload.cls,
                    class_name: sched?.name || qrPayload.cls,
                    session_date: qrPayload.date,
                    status: status,
                    location_lat: options.location?.lat || null,
                    location_lng: options.location?.lng || null,
                    created_at: new Date().toISOString()
                }]);
            } catch (err) {
                console.warn('Mirror to attendease_scans failed:', err);
            }

            const { error: logErr } = await supabaseClient.from('attendease_student_scan_logs').insert([{
                student_id: studentSession.id,
                scan_date: qrPayload.date,
                class_code: qrPayload.cls,
                mode: 'in',
                scan_time: currentTimeStr,
                status: status
            }]);
            
            if (logErr) console.error('Insert Log Error:', logErr);

            const label = status === 'late' ? 'Late ⚠' : status === 'absent' ? 'Absent ✖ (ended)' : 'Present ✓';
            return { success: true, message: `Time In at ${currentTimeStr} — ${label}`, status };

        } else {
            if (!record || !record.time_in) return { success: false, message: 'Must time in first.' };
            if (record.time_out) return { success: false, message: `Already timed out at ${record.time_out}.` };

            const { error: outErr } = await supabaseClient.from('attendease_sessions').update({
                time_out: currentTimeStr,
                location_lat: options.location?.lat !== undefined ? options.location.lat : record.location_lat,
                location_lng: options.location?.lng !== undefined ? options.location.lng : record.location_lng
            }).eq('id', record.id);
            if (outErr) console.error('Time Out Update Error:', outErr);

            // Mirror to attendease_scans
            try {
                const studentData = await this.getStudentData(studentSession.id);
                const sched = CLASS_SCHEDULES[qrPayload.cls];
                await supabaseClient.from('attendease_scans').insert([{
                    student_id: studentSession.uid,
                    student_name: `${studentSession.firstname} ${studentSession.lastname}`.trim(),
                    id_number: studentSession.id_number || null,
                    section: studentData?.section || null,
                    class_code: qrPayload.cls,
                    class_name: sched?.name || qrPayload.cls,
                    session_date: qrPayload.date,
                    status: 'out',
                    location_lat: options.location?.lat || null,
                    location_lng: options.location?.lng || null,
                    created_at: new Date().toISOString()
                }]);
            } catch (err) {
                console.warn('Mirror to attendease_scans (out) failed:', err);
            }

            return { success: true, message: `Time Out at ${currentTimeStr}`, status: 'out' };
        }
    },

    async submitStudentExcuse(studentSession, classCode, date, dataUrl, fileName) {
        const teacher = await this.getTeacherAccount();
        if (!teacher) return { success: false, message: 'No teacher found.' };

        // Record for the specific class session
        await supabaseClient.from('attendease_sessions').upsert({
            teacher_id: teacher.id,
            class_code: classCode,
            session_date: date,
            student_uid: studentSession.uid,
            student_name: `${studentSession.firstname} ${studentSession.lastname}`.trim(),
            status: 'excused',
            excuse_url: dataUrl,
            excuse_file_name: fileName,
            excuse_submitted_at: new Date()
        });

        // Record to attendease_scans for the News feed
        try {
            const studentData = await this.getStudentData(studentSession.id);
            await supabaseClient.from('attendease_scans').insert([{
                student_id: studentSession.uid,
                student_name: `${studentSession.firstname} ${studentSession.lastname}`.trim(),
                section: studentData.section || null,
                class_code: classCode,
                session_date: date,
                status: 'excused',
                excuse_content: dataUrl,
                excuse_type: fileName.split('.').pop(), // Simple type from extension
                remarks: `Excuse letter submitted for ${date}`,
                created_at: new Date().toISOString()
            }]);
        } catch (err) {
            console.warn('Could not mirror to attendease_scans:', err);
        }

        return { success: true, message: 'Excuse letter submitted successfully' };
    },

    async getStudentExcuse(studentUid, classCode, date) {
        const { data } = await supabaseClient.from('attendease_sessions')
            .select('excuse_url, excuse_file_name, excuse_submitted_at')
            .eq('class_code', classCode)
            .eq('session_date', date)
            .eq('student_uid', studentUid)
            .single();
        return data ? { dataUrl: data.excuse_url, fileName: data.excuse_file_name, submittedAt: data.excuse_submitted_at } : null;
    },

    setSession(user) {
        const { password_hash, ...safe } = user;
        sessionStorage.setItem(SKEY, JSON.stringify(safe));
    },

    getSession() {
        try { return JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch { return null; }
    },

    requireAuth(allowedRoles) {
        const user = this.getSession();
        if (!user || !allowedRoles.includes(user.role)) {
            window.location.replace('index.html');
            return null;
        }
        return user;
    },

    clearSession() {
        sessionStorage.removeItem(SKEY);
    }
};
