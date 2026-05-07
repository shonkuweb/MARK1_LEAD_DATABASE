// ─── Mobile Navigation (industry-standard drawer behavior) ───────────────────
(function () {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    if (!hamburger || !navLinks) return;

    const MOBILE_BREAKPOINT = 768;
    let isOpen = false;
    let scrollY = 0;

    const backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);

    if (!navLinks.id) navLinks.id = 'navLinks';
    hamburger.setAttribute('aria-controls', navLinks.id);
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Open navigation menu');

    const lockBodyScroll = () => {
        scrollY = window.scrollY || window.pageYOffset || 0;
        document.body.classList.add('nav-open');
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
    };

    const unlockBodyScroll = () => {
        document.body.classList.remove('nav-open');
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
    };

    const openMenu = () => {
        isOpen = true;
        hamburger.classList.add('active');
        navLinks.classList.add('open');
        backdrop.classList.add('open');
        hamburger.setAttribute('aria-expanded', 'true');
        hamburger.setAttribute('aria-label', 'Close navigation menu');
        lockBodyScroll();
    };

    const closeMenu = () => {
        isOpen = false;
        hamburger.classList.remove('active');
        navLinks.classList.remove('open');
        backdrop.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'Open navigation menu');
        unlockBodyScroll();
    };

    hamburger.addEventListener('click', () => {
        if (isOpen) closeMenu();
        else openMenu();
    });

    backdrop.addEventListener('click', closeMenu);

    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && isOpen) closeMenu();
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > MOBILE_BREAKPOINT && isOpen) closeMenu();
    });
})();
