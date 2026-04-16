const fs = require('fs');
let t = fs.readFileSync('teacherDashboard.html', 'utf8');

// 1. Fixing exportCSV
t = t.replace(
    /Object\.entries\(teacherData\.sessions \|\| \{\}\)\.forEach\(\(\[key, records\]\) => \{([\s\S]*?)const \[cls, date\] = key\.split\('_'\);/,
    `const allSessions = await DB.getAllSessionsReport(session.id);
            allSessions.forEach(r => {
                const cls = r.class_code;
                const date = r.session_date;
                const records = [ { studentId: r.student_uid, name: r.student_name, status: r.status } ];`
);

// 2. Fixing exportPDF 
t = t.replace(
    /Object\.entries\(teacherData\.sessions \|\| \{\}\)\.forEach\(function \(\[key, records\]\) \{([\s\S]*?)var parts = key\.split\('_'\);\s*var cls = parts\[0\]; var date = parts\[1\];/,
    `const allSessions = await DB.getAllSessionsReport(session.id);
            allSessions.forEach(function(r) {
                var cls = r.class_code;
                var date = r.session_date;
                var records = [ { studentId: r.student_uid, name: r.student_name, status: r.status } ];`
);

// 3. Fixing renderClasses
let rcPart = `const WEEK_DATES = ['2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17', '2026-04-18'];
            const WEEK_LABELS = ['Apr 12', 'Apr 13', 'Apr 14', 'Apr 15', 'Apr 16', 'Apr 17', 'Apr 18'];

            const allSessions = await DB.getAllSessionsReport(session.id);
            const sessionMap = {};
            allSessions.forEach(r => {
                const k = r.class_code + '_' + r.session_date;
                if (!sessionMap[k]) sessionMap[k] = [];
                sessionMap[k].push({ status: r.status });
            });`;

t = t.replace(
    /const WEEK_DATES = \['2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17', '2026-04-18'\];\s*const WEEK_LABELS = \['Apr 12', 'Apr 13', 'Apr 14', 'Apr 15', 'Apr 16', 'Apr 17', 'Apr 18'\];/,
    rcPart
);

t = t.replace(
    /const records = \(teacherData\.sessions \|\| \{\}\)\[key\];/g,
    'const records = sessionMap[key];'
);

// 4. Fixing openClassDetail
let ocdPart = `const WEEK_DATES = ['2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17', '2026-04-18'];
            let totalPresent = 0, totalAbsent = 0, totalLate = 0, totalExcused = 0;
            const studentAttMap = {}; // studentId  { name, present, absent, late, excused }
            
            const allSessionsDetail = await DB.getAllSessionsReport(session.id);
            const sessionMapDetail = {};
            allSessionsDetail.forEach(r => {
                const k = r.class_code + '_' + r.session_date;
                if (!sessionMapDetail[k]) sessionMapDetail[k] = [];
                sessionMapDetail[k].push({ studentId: r.student_uid, name: r.student_name, status: r.status });
            });`;

t = t.replace(
    /const WEEK_DATES = \['2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17', '2026-04-18'\];\s*let totalPresent = 0, totalAbsent = 0, totalLate = 0, totalExcused = 0;\s*const studentAttMap = \{\}; \/\/ studentId  \{ name, present, absent, late, excused \}/,
    ocdPart
);

t = t.replace(
    /const records = \(teacherData\.sessions \|\| \{\}\)\[key\] \|\| \[\];/g,
    'const records = sessionMapDetail[key] || [];'
);

fs.writeFileSync('teacherDashboard.html', t);
console.log('Fixed exportCSV, exportPDF, renderClasses, openClassDetail data flow.');
