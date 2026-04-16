
        const RENDER_URL = 'https://attendease-messenger.onrender.com';

        async function pollAttendanceFromServer() {
            if (!session || !session.id) return;
            if (document.visibilityState !== 'visible') return;

            try {
                const res = await fetch(`${RENDER_URL}/api/sessions/${session.id}?t=${Date.now()}`);
                if (!res.ok) return;
                const data = await res.json();
                if (!data.ok || !data.sessions) return;

                // Get the key for the currently selected class + date
                const classCode = document.getElementById('classSelect')?.value;
                const date      = document.getElementById('sessionDate')?.value;
                if (!classCode || !date) return;

                const sessionKey = `${classCode}_${date}`;
                const serverRecs = data.sessions[sessionKey];
                if (!serverRecs || !serverRecs.length) return;

                // Merge server records into the in-memory student list
                let changed = false;
                if (typeof currentSessionStudents !== 'undefined' && currentSessionStudents.length) {
                    serverRecs.forEach(sr => {
                        const local = currentSessionStudents.find(r => r.studentId === sr.studentId);
                        if (local) {
                            // Only update if server has newer data (non-null times)
                            if (sr.timeIn  && sr.timeIn  !== local.timeIn)  { local.timeIn  = sr.timeIn;  changed = true; }
                            if (sr.timeOut && sr.timeOut !== local.timeOut) { local.timeOut = sr.timeOut; changed = true; }
                            if (sr.status  && sr.status  !== local.status)  { local.status  = sr.status;  changed = true; }
                        }
                    });
                }

                if (changed && typeof renderStudentTable === 'function') {
                    renderStudentTable(filterStudentsData());
                }
            } catch (err) {
                // Server may be waking up — silent fail, retry next interval
            }
        }

        setInterval(pollAttendanceFromServer, 3000);
    