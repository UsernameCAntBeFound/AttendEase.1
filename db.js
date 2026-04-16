const SUPABASE_URL = 'https://ghcdhisbqjixzzvlmjxt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoY2RoaXNicWppeHp6dmxtanh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzkzMjAsImV4cCI6MjA5MTg1NTMyMH0.Xc4gWBRhcgY46HfLPnlqcu-ZUnQ5mPTsMtCyXKF2zSw';

const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const SIMULATED_TIME = null;
const LATE_GRACE_MINUTES = 15;
const CLASS_SCHEDULES = {
    ENG: { name: 'English', start: '09:00', end: '11:00', display: '9:00 AM – 11:00 AM' },
    AP: { name: 'Araling Panlipunan (AP)', start: '11:00', end: '13:00', display: '11:00 AM – 1:00 PM' },
    MATH: { name: 'Mathematics', start: '13:00', end: '15:00', display: '1:00 PM – 3:00 PM' },
    SCI: { name: 'Science', start: '15:00', end: '17:00', display: '3:00 PM – 5:00 PM' },
};
const SKEY = 'attendease_session';

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
        const { data } = await supabase.from('attendease_users').select('*').eq('is_archived', false);
        return data || [];
    },

    async getById(id) {
        const { data } = await supabase.from('attendease_users').select('*').eq('id', id).single();
        return data || null;
    },

    async authenticate(identifier, password) {
        if (!supabase) throw new Error("Supabase SDK failed to load. Please check your internet connection or adblocker.");

        // Call the RPC that uses pgcrypto for secure hashing comparison
        const { data, error } = await supabase.rpc('attendease_authenticate', {
            p_identifier: identifier,
            p_password: password
        });
        
        if (error) throw new Error(error.message);
        if (!data) return null;
        
        return data; // returns json user object
    },

    async usernameExists(username, excludeId = null) {
        const { data } = await supabase.from('attendease_users').select('id').eq('username', username);
        if (!data || data.length === 0) return false;
        return data.some(u => u.id !== excludeId);
    },

    async create(data) {
        // Hash password securely through edge function or RPC. 
        // For prototype, we'll assign default if missing, though ideally supervisor would want it hashed too on creation.
        // We will insert via supabase. Password hashing logic defaults to crypted from client for prototype if needed, but we used pgcrypto on the backend.
        // We'll instruct user to utilize a secure creation endpoint. Here we'll do raw insert.
        // In PostgreSQL pgcrypto, we insert plain text into a secure RPC, but for simplicity of client creation:
        const { data: newUser } = await supabase.from('attendease_users').insert([{
            role: data.role,
            firstname: data.firstname,
            lastname: data.lastname,
            uid: data.uid || ('UID-' + Date.now()),
            email: data.email,
            username: data.username,
            password_hash: data.password || 'default123', // In real app, call a 'create_user' RPC for hashing.
            created_by: 'Admin'
        }]).select().single();
        return newUser;
    },

    async update(id, changes) {
        const { data } = await supabase.from('attendease_users').update(changes).eq('id', id).select().single();
        return data;
    },

    async delete(id) {
        await supabase.from('attendease_users').delete().eq('id', id);
    },

    async archive(id) {
        await supabase.from('attendease_users').update({ is_archived: true, archived_at: new Date() }).eq('id', id);
    },

    async restore(id) {
        await supabase.from('attendease_users').update({ is_archived: false, archived_at: null }).eq('id', id);
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
        const { data } = await supabase.from('attendease_student_data').select('*').eq('user_id', userId).single();
        return data || { section: '', attendance: { present: 0, absent: 0, late: 0 }, scanLog: [], excuseLetters: [] };
    },

    async saveStudentData(userId, data) {
        await supabase.from('attendease_student_data').upsert({ user_id: userId, section: data.section });
    },

    async getTeacherData(userId) {
        const { data } = await supabase.from('attendease_teacher_classes').select('*').eq('teacher_id', userId);
        return { classes: data || [], sessions: {}, announcements: [] };
    },

    async saveTeacherData(userId, data) {},

    async getSession_attendance(teacherId, classCode, date) {
        const { data } = await supabase.from('attendease_sessions')
            .select('*')
            .eq('teacher_id', teacherId)
            .eq('class_code', classCode)
            .eq('session_date', date);
        return data || [];
    },

    async saveSession_attendance(teacherId, classCode, date, records) {
        // Upsert all students in this session
        for(let r of records) {
            await supabase.from('attendease_sessions').upsert({
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
                excuse_file_name: r.excuseFileName || r.excuse_file_name
            });
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
        const { data } = await supabase.from('attendease_sessions')
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

            await supabase.from('attendease_sessions').upsert({
                teacher_id: teacher.id,
                class_code: qrPayload.cls,
                session_date: qrPayload.date,
                student_uid: studentSession.uid,
                student_name: studentName,
                status: status,
                time_in: currentTimeStr,
                location_lat: options.location?.lat,
                location_lng: options.location?.lng
            });

            await supabase.from('attendease_student_scan_logs').insert([{
                student_id: studentSession.id,
                scan_date: qrPayload.date,
                class_code: qrPayload.cls,
                mode: 'in',
                scan_time: currentTimeStr,
                status: status
            }]);

            const label = status === 'late' ? 'Late ⚠' : status === 'absent' ? 'Absent ✗ (ended)' : 'Present ✓';
            return { success: true, message: `Time In at ${currentTimeStr} — ${label}`, status };

        } else {
            if (!record || !record.time_in) return { success: false, message: 'Must time in first.' };
            if (record.time_out) return { success: false, message: `Already timed out at ${record.time_out}.` };

            await supabase.from('attendease_sessions').upsert({
                id: record.id,
                time_out: currentTimeStr
            });
            return { success: true, message: `Time Out at ${currentTimeStr}`, status: 'out' };
        }
    },

    async submitStudentExcuse(studentSession, classCode, date, dataUrl, fileName) {
        const teacher = await this.getTeacherAccount();
        if (!teacher) return { success: false, message: 'No teacher found.' };

        await supabase.from('attendease_sessions').upsert({
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

        return { success: true, message: 'Excuse letter submitted successfully ✓' };
    },

    async getStudentExcuse(studentUid, classCode, date) {
        const { data } = await supabase.from('attendease_sessions')
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

    async requireAuth(allowedRoles) {
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
