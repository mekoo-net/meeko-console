import type { Router } from 'vue-router';

import { useAuthStore } from '@/stores/auth';

export function installGuards(router: Router): void {
  router.beforeEach((to) => {
    const auth = useAuthStore();

    if (to.meta.requiresAuth === false) {
      if (to.name === 'login' && auth.isAuthenticated) {
        return { path: '/accounts', replace: true };
      }
      return true;
    }

    if (!auth.isAuthenticated) {
      return { name: 'login', query: { redirect: to.fullPath }, replace: true };
    }

    const requiredPermissions = to.meta.permissions;
    if (requiredPermissions && requiredPermissions.length > 0) {
      if (!auth.hasPermission(...requiredPermissions)) {
        return { name: 'accounts', replace: true };
      }
    }

    const requiredRoles = to.meta.roles;
    if (requiredRoles && requiredRoles.length > 0) {
      if (!auth.hasRole(...requiredRoles)) {
        return { name: 'accounts', replace: true };
      }
    }
    return true;
  });

  router.afterEach((to) => {
    if (typeof document !== 'undefined') {
      document.title = to.meta.title ? `${to.meta.title} · Meeko Admin` : 'Meeko Admin';
    }
  });
}
