// Check for the cls.name containing a quote that could break the inline onclick attribute
const fs = require('fs');
const content = fs.readFileSync('Resource/studentDashboard.html', 'utf8');
const dbContent = fs.readFileSync('Resource/db.js', 'utf8');

// Check where supabaseClient is initialized
const initLines = dbContent.split('\n');
initLines.forEach((line, i) => {
    if (line.includes('supabaseClient') && line.includes('=')) {
        console.log('supabaseClient assign line ' + (i+1) + ':', line.trim().substring(0, 120));
    }
});

// Check the purgeLegacyLocalStorage function - it could be deleting the session/notif keys
// but critically check if it deletes things needed for the modals
const purgeMatch = content.match(/purgeLegacyLocalStorage[\s\S]{0,500}/);
if (purgeMatch) {
    console.log('\npurgeLegacyLocalStorage block:\n', purgeMatch[0].substring(0, 300));
}

// Find where window.supabase is set
console.log('\nWindow supabase references in studentDashboard:');
const stdLines = content.split('\n');
stdLines.forEach((line, i) => {
    if (line.includes('window.supabase') || line.includes('supabaseClient')) {
        console.log('  Line ' + (i+1) + ':', line.trim().substring(0, 100));
    }
});
