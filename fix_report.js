const fs = require('fs');
let t = fs.readFileSync('teacherDashboard.html', 'utf8');

const regex = /const clsMap = \{\};\s*Object\.entries\(teacherData\.sessions \|\| \{\}\)\.forEach\(\(\[key, records\]\) => \{\s*const \[cls, date\] = key\.split\('_'\);\s*if \(selectedCls !== 'ALL' && cls !== selectedCls\) return;\s*if \(fromDate && date < fromDate\) return;\s*if \(toDate && date > toDate\) return;\s*if \(\!clsMap\[cls\]\) clsMap\[cls\] = \{\};\s*records\.forEach\(r => \{\s*if \(\!clsMap\[cls\]\[r\.studentId\]\)\s*clsMap\[cls\]\[r\.studentId\] = \{ name: r\.name, id: r\.studentId, present: 0, absent: 0, late: 0, excused: 0 \};\s*const st = clsMap\[cls\]\[r\.studentId\];\s*if \(r\.status === 'present'\) st\.present\+\+;\s*else if \(r\.status === 'absent'\) st\.absent\+\+;\s*else if \(r\.status === 'late'\) st\.late\+\+;\s*else if \(r\.status === 'excused'\) st\.excused\+\+;\s*\}\);\s*\}\);/m;

const replacement = `const clsMap = {};
            const allSessions = await DB.getAllSessionsReport(session.id);
            allSessions.forEach(r => {
                const cls = r.class_code;
                const date = r.session_date;

                if (selectedCls !== 'ALL' && cls !== selectedCls) return;
                if (fromDate && date < fromDate) return;
                if (toDate && date > toDate) return;

                if (!clsMap[cls]) clsMap[cls] = {};
                
                if (!clsMap[cls][r.student_uid]) {
                    clsMap[cls][r.student_uid] = { 
                        name: r.student_name, 
                        id: r.student_uid, 
                        present: 0, 
                        absent: 0, 
                        late: 0, 
                        excused: 0 
                    };
                }
                
                const st = clsMap[cls][r.student_uid];
                if (r.status === 'present') st.present++;
                else if (r.status === 'absent') st.absent++;
                else if (r.status === 'late') st.late++;
                else if (r.status === 'excused') st.excused++;
            });`;

if (regex.test(t)) {
    t = t.replace(regex, replacement);
    fs.writeFileSync('teacherDashboard.html', t);
    console.log('Successfully updated teacherDashboard.html reports');
} else {
    console.log('Regex did NOT match!');
}
