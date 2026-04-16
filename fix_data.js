const fs = require('fs');
let t = fs.readFileSync('teacherDashboard.html', 'utf8');

// 1. Fix loadAttendanceSession: replace teacherData.sessions[key] with DB.getSession_attendance
const oldPattern = /const key = `\$\{currentClassCode\}_\$\{currentDate\}`;[\r\n\s]*const savedRecords = teacherData\.sessions\[key\][\r\n\s]*\? JSON\.parse\(JSON\.stringify\(teacherData\.sessions\[key\]\)\)[\r\n\s]*: \[\];/;

const newCode = `const key = \`\${currentClassCode}_\${currentDate}\`;
            const dbRecords = await DB.getSession_attendance(session.id, currentClassCode, currentDate);
            const savedRecords = dbRecords.map(r => ({
                studentId: r.student_uid,
                name: r.student_name,
                status: r.status,
                timeIn: r.time_in,
                timeOut: r.time_out,
                remark: r.remark || '',
                excuse: r.excuse_url || null,
                excuseFileName: r.excuse_file_name || '',
                excuseSubmittedAt: r.excuse_submitted_at || '',
            }));`;

if (oldPattern.test(t)) {
    t = t.replace(oldPattern, newCode);
    console.log('1. Fixed loadAttendanceSession data source');
} else {
    console.log('1. Pattern not found — checking manually...');
    // Try simpler approach
    const lines = t.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('teacherData.sessions[key]') && lines[i+1] && lines[i+1].includes('JSON.parse')) {
            console.log('   Found at line ' + (i+1));
            break;
        }
    }
}

// 2. Fix dbRecord lookup inside the student-filling forEach
t = t.replace(
    /const dbRecord = \(teacherData\.sessions\[key\] \|\| \[\]\)\.find\(r => r\.studentId === student\.uid\);/g,
    'const dbRecord = savedRecords.find(r => r.studentId === student.uid);'
);
console.log('2. Fixed dbRecord lookup');

// 3. Fix saveSession to use DB.saveSession_attendance
// Find the saveSession function and ensure it calls the right method
const saveSessionPattern = /teacherData\.sessions\[key\]\s*=\s*currentSessionStudents/;
if (saveSessionPattern.test(t)) {
    console.log('3. Found stale teacherData.sessions assignment in saveSession');
} else {
    console.log('3. No stale teacherData.sessions assignment found');
}

// 4. Fix renderReportPreview — it reads teacherData.sessions which is always empty
// Need to replace with actual DB calls
const reportPattern = /Object\.entries\(teacherData\.sessions \|\| \{\}\)\.forEach/;
if (reportPattern.test(t)) {
    console.log('4. Found stale teacherData.sessions in renderReportPreview — needs fix');
} else {
    console.log('4. No stale teacherData.sessions in renderReportPreview');
}

fs.writeFileSync('teacherDashboard.html', t);
console.log('\nSaved');
