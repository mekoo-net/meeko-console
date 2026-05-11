import { createRouter, createWebHistory } from 'vue-router';

import { installGuards } from './guards';
import { routes } from './routes';

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 };
  },
});

installGuards(router);

export default router;
