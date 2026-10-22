/**
 * Rover Island — shared tracking helper
 *
 * One function every Rover component calls: window.roverTrack(eventName, params)
 * Sends the same payload to three places (same pattern as rover-bundle-save.js):
 *   1. document 'rover:track' CustomEvent  → for any on-page listener
 *   2. Shopify.analytics.publish('rover_<event>') → Customer Events / custom pixels
 *      (runs inside Shopify's sandbox, so Shopify's consent rules apply)
 *   3. window.dataLayer (only if GTM already created it) → GTM / GA4
 *
 * It never loads or fires Meta / TikTok / GA directly, so it can't bypass consent
 * or double-count. Map these events to platforms inside GTM or a custom pixel.
 *
 * Safe to include more than once: the guard below makes it a no-op the second time.
 */
(function () {
  if (typeof window.roverTrack === 'function') return;

  window.roverTrack = function roverTrack(eventName, params) {
    if (!eventName) return;
    const payload = Object.assign({}, params);

    Object.keys(payload).forEach((key) => {
      if (payload[key] === '' || payload[key] === undefined || payload[key] === null) delete payload[key];
    });

    try {
      document.dispatchEvent(new CustomEvent('rover:track', { detail: { event: eventName, params: payload } }));
    } catch (error) {
      /* tracking must never break the page */
    }

    try {
      const shopifyName = eventName.startsWith('rover_') ? eventName : `rover_${eventName}`;
      window.Shopify?.analytics?.publish?.(shopifyName, payload);
    } catch (error) {
      /* tracking must never break the page */
    }

    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push(Object.assign({ event: eventName }, payload));
    }
  };
})();
