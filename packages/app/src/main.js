import { bootstrapApplication } from './app/bootstrapApplication.js';

await bootstrapApplication({
  mountNode: document.getElementById('sceneRoot'),
  document,
  window,
  environment: import.meta.env,
});
