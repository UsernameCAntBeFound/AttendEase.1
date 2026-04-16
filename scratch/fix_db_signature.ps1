$file = "c:\Users\jcalv\Downloads\AttenEase Proto0.1\Resource\db.js"
$content = Get-Content $file -Raw

# 1. Fix signature of the FIRST (correct) submitStudentExcuse at line ~250
$content = $content -replace 'async submitStudentExcuse\(studentSession, classCode, date, dataUrl, fileName\) \{\r\n        try \{', "async submitStudentExcuse(studentSession, classCode, date, dataUrl, fileName, className, remarks) {`r`n        try {"

# 2. Remove the old duplicate submitStudentExcuse function (lines 469-506)
# It starts with the old signature and ends with }, right before getStudentExcuse
$oldDuplicate = @'
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

'@

$content = $content.Replace($oldDuplicate, '')

Set-Content $file $content -NoNewline
Write-Host "Done. db.js fixed."
