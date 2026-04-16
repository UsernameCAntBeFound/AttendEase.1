/**
 * AttendEase – Shared Theme Utility
 * Saves dark/light mode preference per user in localStorage.
 * Key: "attendease_theme_<userId>"
 */
(function () {
    const THEME_PREFIX = 'attendease_theme_';

    function getKey(userId) {
        return THEME_PREFIX + (userId || 'default');
    }

    function applyTheme(dark) {
        if (dark) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        // Update any toggle button icons
        document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
            btn.setAttribute('title', dark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
            btn.setAttribute('aria-label', dark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
            const sunIcon = btn.querySelector('.icon-sun');
            const moonIcon = btn.querySelector('.icon-moon');
            if (sunIcon) sunIcon.style.display = dark ? 'block' : 'none';
            if (moonIcon) moonIcon.style.display = dark ? 'none' : 'block';
        });
    }

    window.ThemeManager = {
        /** Call once per page load with the current user's id (or null). */
        init(userId) {
            this._userId = userId || 'default';
            const saved = localStorage.getItem(getKey(this._userId));
            const isDark = saved === 'dark';
            applyTheme(isDark);
            return isDark;
        },

        toggle() {
            const isDark = !document.body.classList.contains('dark-mode');
            applyTheme(isDark);
            localStorage.setItem(getKey(this._userId), isDark ? 'dark' : 'light');
            return isDark;
        },

        isDark() {
            return document.body.classList.contains('dark-mode');
        }
    };
})();
