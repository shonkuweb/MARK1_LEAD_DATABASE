// ─── Mobile Navigation (industry-standard drawer behavior) ───────────────────
(function () {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    if (!hamburger || !navLinks) return;

    const MOBILE_BREAKPOINT = 768;
    let isOpen = false;

    const backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);

    if (!navLinks.id) navLinks.id = 'navLinks';
    hamburger.setAttribute('aria-controls', navLinks.id);
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Open navigation menu');

    const lockBodyScroll = () => {
        document.body.classList.add('nav-open');
    };

    const unlockBodyScroll = () => {
        document.body.classList.remove('nav-open');
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

    const navigateFromLink = (event, link) => {
        const href = (link.getAttribute('href') || '').trim();
        if (!href) {
            closeMenu();
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (href.startsWith('#')) {
            closeMenu();
            window.location.hash = href;
            return;
        }

        window.location.assign(link.href);
    };

    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('pointerup', event => navigateFromLink(event, link));
        link.addEventListener('touchend', event => navigateFromLink(event, link), { passive: false });
        link.addEventListener('click', event => navigateFromLink(event, link));
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && isOpen) closeMenu();
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > MOBILE_BREAKPOINT && isOpen) closeMenu();
    });
})();
