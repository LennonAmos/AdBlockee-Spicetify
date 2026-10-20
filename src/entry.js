import { createController } from "./controller.js";

async function launch() {
  // A second load replaces the previous instance instead of stacking listeners.
  await window.AdBlockee?.dispose?.({ restore: false });
  window.AdBlockee = createController(window);
  await window.AdBlockee.start();
}

launch().catch(error => console.warn("AdBlockee could not initialize:", error));
