/* =============================================================================
   AttendEase — Cloud Synchronization Interface
   Target Proxy: https://attendease-sync.onrender.com/sync

   Cross-device flow:
     Student scans QR (phone)  →  db.js saves to localStorage
       →  setItem intercepted  →  _triggerSync() pushes to Render server
     Teacher dashboard (PC)    →  polls Render every 2s
       →  deep-merges incoming sessions into localStorage
       →  calls window.renderDashboard() to refresh the attendance table
   ============================================================================= */

const SYNC_URL    = 'https://attendease-sync.onrender.com/sync';
const DEBOUNCE_MS = 1500;

// ── 0. Internal State ────────────────────────────────────────────────────────
const originalSetItem = Storage.prototype.setItem;
let   _pushTimeout  = null;
let   _isPushing    = false;   // push-only guard (does NOT block pulls)
let   _isPulling    = false;   // pull-only guard (prevents concurrent pulls)

// ── 1. Push — send local state to Render after debounce ──────────────────────
function _triggerSync() {
    if (_pushTimeout) clearTimeout(_pushTimeout);
    _pushTimeout = setTimeout(async () => {
        if (_isPushing) return;
        _isPushing = true;
        try {
            const state = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('attendease_')) {
                    state[k] = _stripHeavyFields(k, localStorage.getItem(k));
                }
            }
            const syncVer = Date.now().toString();
            state['__sync_version'] = syncVer;
            originalSetItem.call(localStorage, '__sync_version', syncVer);

            await fetch(SYNC_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state }),
            });
            console.log('[cloud-sync] Pushed at', new Date().toLocaleTimeString());
        } catch (err) {
            console.warn('[cloud-sync] Push failed:', err);
        } finally {
            _isPushing = false;
        }
    }, DEBOUNCE_MS);
}

/**
 * Strips heavy base64 blobs before sending to cloud (saves DB space).
 * Attendance session records are kept 100% intact — only profile pics
 * and announcement file attachments are stripped.
 */
function _stripHeavyFields(key, value) {
    if (!value) return value;
    try {
        const parsed = JSON.parse(value);

        if (parsed.profilePic) {
            const { profilePic, ...rest } = parsed;
            return JSON.stringify(rest);
        }

        if (key.startsWith('attendease_teacher_')) {
            const rest = { ...parsed };
            if (Array.isArray(rest.announcements)) {
                rest.announcements = rest.announcements.map(a => ({
                    ...a,
                    attachments: (a.attachments || []).map(att => ({
                        name: att.name,
                        type: att.type,
                        // dataUrl stripped — kept local only
                    })),
                }));
            }
            // ⚠ sessions (timeIn / timeOut / status) are NEVER stripped
            return JSON.stringify(rest);
        }

        return value;
    } catch {
        return value;
    }
}

// ── Intercept localStorage.setItem → auto-push on every attendance write ──────
Storage.prototype.setItem = function (key, value) {
    originalSetItem.apply(this, arguments);
    if (key && key.startsWith('attendease_') && key !== '__sync_version') {
        _triggerSync();
    }
};

// ── 2. Pull — fetch cloud state and deep-merge into localStorage ──────────────
window.initCloudDb = async function () {
    // IMPORTANT: push and pull use SEPARATE guards so they never block each other
    if (_isPulling) return;
    _isPulling = true;
    try {
        const res = await fetch(`${SYNC_URL}?t=${Date.now()}`);
        if (!res.ok) { _isPulling = false; return; }

        const data = await res.json();
        if (!data.ok || !data.state || Object.keys(data.state).length === 0) {
            _isPulling = false;
            return;
        }

        let changed = false;

        for (const [key, value] of Object.entries(data.state)) {
            if (!key.startsWith('attendease_')) continue;

            const localStr = localStorage.getItem(key);

            // Key doesn't exist locally at all → just write it
            if (!localStr) {
                originalSetItem.call(localStorage, key, value);
                changed = true;
                continue;
            }

            try {
                const local  = JSON.parse(localStr);
                const remote = JSON.parse(value);

                if (key.startsWith('attendease_teacher_')) {
                    // Deep-merge: never lose a timeIn/timeOut by overwriting with null
                    const mergedSessions = _mergeSessions(
                        local.sessions  || {},
                        remote.sessions || {}
                    );

                    const merged = {
                        ...remote,
                        sessions: mergedSessions,
                        profilePic: local.profilePic || remote.profilePic,
                        announcements: _mergeAnnouncements(
                            local.announcements  || [],
                            remote.announcements || []
                        ),
                    };

                    const mergedStr = JSON.stringify(merged);
                    if (localStr !== mergedStr) {
                        originalSetItem.call(localStorage, key, mergedStr);
                        changed = true;
                    }
                    continue;
                }

                // Default: remote wins, preserve local blob fields
                if (local.profilePic) remote.profilePic = local.profilePic;
                const mergedStr = JSON.stringify(remote);
                if (localStr !== mergedStr) {
                    originalSetItem.call(localStorage, key, mergedStr);
                    changed = true;
                }
            } catch {
                if (localStr !== value) {
                    originalSetItem.call(localStorage, key, value);
                    changed = true;
                }
            }
        }

        // Always call renderDashboard when pull completes — even if no change
        // detected locally, the UI may be stale due to in-memory vs storage drift.
        if (typeof window.renderDashboard === 'function') {
            window.renderDashboard();
        }

        if (changed) {
            console.log('[cloud-sync] Pulled new data at', new Date().toLocaleTimeString());
        }
    } catch (err) {
        console.warn('[cloud-sync] Pull failed:', err);
    } finally {
        _isPulling = false;
    }
};

// ── Session deep-merge ────────────────────────────────────────────────────────
/**
 * Merge two "sessions" objects (keyed by "CLASSCODE_YYYY-MM-DD").
 * For each session, merge per-student records so that:
 *   • A real timeIn/timeOut is NEVER overwritten with null
 *   • Remote status/remark wins otherwise
 */
function _mergeSessions(local, remote) {
    const merged = {};
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

    allKeys.forEach(sKey => {
        const localRecs  = local[sKey]  || [];
        const remoteRecs = remote[sKey] || [];

        const localMap  = {};
        localRecs.forEach(r  => { localMap[r.studentId]  = r; });
        const remoteMap = {};
        remoteRecs.forEach(r => { remoteMap[r.studentId] = r; });

        const allIds = new Set([
            ...localRecs.map(r  => r.studentId),
            ...remoteRecs.map(r => r.studentId),
        ]);

        merged[sKey] = [];
        allIds.forEach(sid => {
            const l = localMap[sid];
            const r = remoteMap[sid];

            if (!l)   { merged[sKey].push({ ...r }); return; }
            if (!r)   { merged[sKey].push({ ...l }); return; }

            merged[sKey].push({
                ...r,                                // remote wins for metadata
                timeIn:            r.timeIn            || l.timeIn            || null,
                timeOut:           r.timeOut           || l.timeOut           || null,
                excuse:            r.excuse            || l.excuse            || null,
                excuseFileName:    r.excuseFileName    || l.excuseFileName    || '',
                excuseSubmittedAt: r.excuseSubmittedAt || l.excuseSubmittedAt || '',
                remark:            r.remark            || l.remark            || '',
                location:          r.location          || l.location          || null,
            });
        });
    });

    return merged;
}

// ── Announcement merge ────────────────────────────────────────────────────────
function _mergeAnnouncements(local, remote) {
    const localMap = {};
    local.forEach(a => { localMap[a.id] = a; });

    return remote.map(remoteAnn => {
        const localAnn = localMap[remoteAnn.id];
        if (!localAnn) return remoteAnn;

        const mergedAttachments = (remoteAnn.attachments || []).map((att, i) => {
            const localAtt = localAnn.attachments && localAnn.attachments[i];
            return localAtt ? { ...att, dataUrl: localAtt.dataUrl } : att;
        });
        return { ...remoteAnn, attachments: mergedAttachments };
    });
}

// ── 3. Background Polling — 2s active tab / 10s hidden tab ───────────────────
const POLL_ACTIVE_MS = 2000;
const POLL_HIDDEN_MS = 10000;

function _schedulePoll() {
    const delay = document.hidden ? POLL_HIDDEN_MS : POLL_ACTIVE_MS;
    setTimeout(async () => {
        await window.initCloudDb();
        _schedulePoll();
    }, delay);
}

_schedulePoll();
