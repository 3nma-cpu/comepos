// ============================================
// Router — Path-based SPA routing (Clean URLs without '#')
// ============================================

const routes = {};
let currentRoute = null;
let currentDefaultRoute = 'dashboard';

export function registerRoute(path, handler) {
    routes[path] = handler;
}

export function getCurrentRoute() {
    return currentRoute;
}

function getPathFromUrl() {
    // Clean legacy hash if present (e.g., #dashboard -> /dashboard)
    if (window.location.hash) {
        const hashClean = window.location.hash.replace(/^#\/?/, '');
        if (hashClean) {
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', '/' + hashClean);
            }
            return hashClean;
        }
    }

    // Extract path from pathname: e.g. "/sales" -> "sales"
    const pathname = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!pathname || pathname === 'index.html') {
        return '';
    }
    return pathname;
}

export function navigate(path, { replace = false, trigger = true } = {}) {
    const cleanPath = (path || '').replace(/^#\/?/, '').replace(/^\/+/, '');
    const targetUrl = cleanPath ? '/' + cleanPath : '/';

    if (window.history) {
        if (replace) {
            window.history.replaceState(null, '', targetUrl);
        } else {
            window.history.pushState(null, '', targetUrl);
        }
    }

    if (trigger) {
        executeRoute(cleanPath || currentDefaultRoute);
    }
}

function executeRoute(rawPath) {
    const [path, ...params] = (rawPath || currentDefaultRoute).split('/');
    currentRoute = path;
    const handler = routes[path];

    if (handler) {
        handler(params.join('/'));
    } else if (routes[currentDefaultRoute]) {
        navigate(currentDefaultRoute, { replace: true, trigger: true });
        return;
    }

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.route === path);
    });
}

let routerInitialized = false;

export function initRouter(defaultRoute = 'dashboard') {
    currentDefaultRoute = defaultRoute;

    function handleRoute() {
        const rawPath = getPathFromUrl() || currentDefaultRoute;
        executeRoute(rawPath);
    }

    if (!routerInitialized) {
        window.addEventListener('popstate', handleRoute);
        routerInitialized = true;
    }

    handleRoute();
}

