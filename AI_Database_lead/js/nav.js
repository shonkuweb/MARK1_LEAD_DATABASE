// ─── Mobile Navigation Toggle ────────────────────────────────────────────────
(function() {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    if (!hamburger || !navLinks) return;

    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('open');
        document.body.classList.toggle('nav-open');
    });

    // Close nav when a link is tapped
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navLinks.classList.remove('open');
            document.body.classList.remove('nav-open');
        });
    });

    // Close nav on ESC key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && navLinks.classList.contains('open')) {
            hamburger.classList.remove('active');
            navLinks.classList.remove('open');
            document.body.classList.remove('nav-open');
        }
    });
})();
