/* =============================================================================
   AttendEase — Cloud Synchronization Interface
   Target Proxy: https://attendease-sync.onrender.com/sync

   Behavior:
   This engine hijacks localStorage.setItem to detect changes.
   It debounces updates to batch rapid writes (like profile pic uploads).
   It pulls global state periodically and DEEP-MERGES to ensure
   cross-device consistency without losing local attendance scan data.
   ============================================================================= */

const SYNC_URL    = 'https://attendease-sync.onrender.com/sync';
const DEBOUNCE_MS = 1500;   // 1.5s debounce for rapid writes

// ── 0. Internal State ────────────────────────────────────────────────────────
const originalSetItem = Storage.prototype.setItem;
let syncTimeout = null;
let _isSyncing  = false;   // guard to prevent re-entrant syncs

// ── 1. Push — send local state to cloud ──────────────────────────────────────
function _triggerSync() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
        if (_isSyncing) return;
        _isSyncing = true;
        try {
            const state = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('attendease_')) {
                    state[k] = _stripHeavyFields(k, localStorage.getItem(k));
                }
            }
            const newVersion = Date.now().toString();
            state['__sync_version'] = newVersion;
            originalSetItem.call(localStorage, '__sync_version', newVersion);

            await fetch(SYNC_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state })
            });
        } catch (err) {
            console.warn('[cloud-sync] Push failed:', err);
        } finally {
            _isSyncing = false;
        }
    }, DEBOUNCE_MS);
}

/**
 * Strips heavy base64 blobs before sending to cloud (saves DB space).
 * Profile pictures and announcement file attachments stay LOCAL only.
 */
function _stripHeavyFields(key, value) {
    if (!value) return value;
    try {
        const parsed = JSON.parse(value);

        // Strip profile pictures
        if (parsed.profilePic) {
            const { profilePic, ...rest } = parsed;
            return JSON.stringify(rest);
        }

        // Strip announcement file blobs but keep session attendance intact
        if (key.startsWith('attendease_teacher_')) {
            const rest = { ...parsed };
            if (Array.isArray(rest.announcements)) {
                rest.announcements = rest.announcements.map(a => ({
                    ...a,
                    attachments: (a.attachments || []).map(att => ({
                        name: att.name,
                        type: att.type,
                        // dataUrl intentionally omitted — kept local only
                    })),
                }));
            }
            // NOTE: sessions (attendance data) are kept fully intact here
            return JSON.stringify(rest);
        }

        return value;
    } catch {
        return value;
    }
}

// ── Intercept localStorage.setItem to auto-push on every write ───────────────
Storage.prototype.setItem = function (key, value) {
    originalSetItem.apply(this, arguments);
    // Only push for app-managed keys, skip internal sync markers
    if (key && key.startsWith('attendease_') && key !== '__sync_version') {
        _triggerSync();
    }
};

// ── 2. Pull — fetch cloud state and SMART-MERGE into local storage ────────────
window.initCloudDb = async function () {
    if (_isSyncing) return;
    try {
        const res = await fetch(`${SYNC_URL}?t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();

        if (!data.ok || !data.state || Object.keys(data.state).length === 0) return;

        let changed = false;

        for (const [key, value] of Object.entries(data.state)) {
            if (!key.startsWith('attendease_')) continue;

            const localStr = localStorage.getItem(key);

            // No local entry at all — just write remote
            if (!localStr) {
                originalSetItem.call(localStorage, key, value);
                changed = true;
                continue;
            }

            try {
                const local  = JSON.parse(localStr);
                const remote = JSON.parse(value);

                // ── Special handling for teacher data ────────────────────────
                if (key.startsWith('attendease_teacher_')) {
                    // DEEP MERGE sessions: remote takes precedence per student
                    // record, but we NEVER lose data that only exists locally
                    const mergedSessions = _mergeSessions(
                        local.sessions  || {},
                        remote.sessions || {}
                    );

                    // Build merged object: start from remote, overlay merged sessions
                    const merged = {
                        ...remote,
                        sessions: mergedSessions,
                        // Preserve local-only heavy fields
                        profilePic: local.profilePic || remote.profilePic,
                        // Preserve local announcement attachments (blobs)
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

                // ── Default: remote wins, but preserve local heavy fields ────
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

        // Notify the teacher dashboard to re-render if data changed
        if (changed && typeof window.renderDashboard === 'function') {
            window.renderDashboard();
        }
    } catch (err) {
        console.warn('[cloud-sync] Pull failed:', err);
    }
};

/**
 * Deep-merge two session maps.
 * Key format: "CLASSCODE_YYYY-MM-DD"  →  array of student attendance records
 *
 * Strategy:
 *   • For each session key present in EITHER local or remote, merge the arrays.
 *   • A student record in REMOTE always wins (teacher scan, cloud write) —
 *     EXCEPT we never overwrite a real timeIn/timeOut with null.
 */
function _mergeSessions(local, remote) {
    const merged = {};
    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

    allKeys.forEach(key => {
        const localRecs  = local[key]  || [];
        const remoteRecs = remote[key] || [];

        // Index by studentId for O(1) lookup
        const localMap = {};
        localRecs.forEach(r => { localMap[r.studentId] = r; });

        const remoteMap = {};
        remoteRecs.forEach(r => { remoteMap[r.studentId] = r; });

        const allStudentIds = new Set([
            ...localRecs.map(r => r.studentId),
            ...remoteRecs.map(r => r.studentId),
        ]);

        const mergedRecs = [];
        allStudentIds.forEach(sid => {
            const l = localMap[sid];
            const r = remoteMap[sid];

            if (!l) { mergedRecs.push({ ...r }); return; }
            if (!r) { mergedRecs.push({ ...l }); return; }

            // Both exist — take remote as base but preserve non-null local times
            mergedRecs.push({
                ...r,
                timeIn:  r.timeIn  || l.timeIn  || null,
                timeOut: r.timeOut || l.timeOut  || null,
                excuse:  r.excuse  || l.excuse   || null,
                excuseFileName:   r.excuseFileName   || l.excuseFileName   || '',
                excuseSubmittedAt: r.excuseSubmittedAt || l.excuseSubmittedAt || '',
                remark:  r.remark  || l.remark   || '',
                location: r.location || l.location || null,
            });
        });

        merged[key] = mergedRecs;
    });

    return merged;
}

/**
 * Merge announcement arrays by id.
 * Remote announcement metadata wins, but local dataUrl blobs are preserved.
 */
function _mergeAnnouncements(local, remote) {
    const localMap = {};
    local.forEach(a => { localMap[a.id] = a; });

    return remote.map(remoteAnn => {
        const localAnn = localMap[remoteAnn.id];
        if (!localAnn) return remoteAnn;

        // Restore local attachment blobs stripped during push
        const mergedAttachments = (remoteAnn.attachments || []).map((att, i) => {
            const localAtt = localAnn.attachments && localAnn.attachments[i];
            return localAtt ? { ...att, dataUrl: localAtt.dataUrl } : att;
        });
        return { ...remoteAnn, attachments: mergedAttachments };
    });
}

// ── 3. Background Polling — every 2s active / 10s hidden tab ─────────────────
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
