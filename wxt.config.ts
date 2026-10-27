import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Job Application Autofill',
    description: 'Local-only autofill for job application forms',
    permissions: ['activeTab', 'scripting', 'storage'],
  },
});
