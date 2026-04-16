const SUPABASE_URL = 'https://ghcdhisbqjixzzvlmjxt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoY2RoaXNicWppeHp6dmxtanh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzkzMjAsImV4cCI6MjA5MTg1NTMyMH0.Xc4gWBRhcgY46HfLPnlqcu-ZUnQ5mPTsMtCyXKF2zSw';

async function cleanup() {
    console.log("Fetching records to delete...");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/attendease_sessions?status=eq.absent&time_in=is.null`, {
        method: 'DELETE',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
    });
    
    if (res.ok) {
        console.log("Successfully deleted all auto-generated 'absent' records.");
    } else {
        console.error("Failed to delete records:", await res.text());
    }
}

cleanup();
