// ============================================
// Router — Hash-based SPA routing
// ============================================

const routes = {};
let currentRoute = null;

export function registerRoute(path, handler) {
    routes[path] = handler;
}

export function navigate(path) {
    window.location.hash = path;
}

export function getCurrentRoute() {
    return currentRoute;
}

export function initRouter(defaultRoute = 'dashboard') {
    function handleRoute() {
        const hash = window.location.hash.slice(1) || defaultRoute;
        const [path, ...params] = hash.split('/');
        currentRoute = path;
        const handler = routes[path];
        if (handler) {
            handler(params.join('/'));
        } else if (routes[defaultRoute]) {
            navigate(defaultRoute);
        }
        // Update active nav
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.toggle('active', el.dataset.route === path);
        });
    }

    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}
