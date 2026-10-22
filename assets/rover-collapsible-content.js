/**
 * Rover Island — Collapsible content (Read more / Read less)
 *
 * - Full text is always rendered in the HTML (crawlable); CSS clips it to N lines.
 * - JS only: toggles the clip, animates height, hides the button if the text is short,
 *   auto-expands when keyboard focus lands on a hidden link, and sends one tracking event.
 */
if (!customElements.get('rover-collapsible-content')) {
  customElements.define(
    'rover-collapsible-content',
    class RoverCollapsibleContent extends HTMLElement {
      connectedCallback() {
        this.body = this.querySelector('[data-rcc-body]');
        this.button = this.querySelector('[data-rcc-toggle]');
        if (!this.body || !this.button) return;

        this.controller = new AbortController();
        const { signal } = this.controller;

        this.button.addEventListener('click', () => this.toggle(), { signal });

        // Keyboard users tabbing into a clipped link get the full text revealed.
        this.body.addEventListener(
          'focusin',
          () => {
            if (!this.isExpanded) this.expand();
          },
          { signal }
        );

        this.checkOverflow();
        if ('ResizeObserver' in window) {
          this.resizeObserver = new ResizeObserver(() => this.checkOverflow());
          this.resizeObserver.observe(this.body);
        }
      }

      disconnectedCallback() {
        this.controller?.abort();
        this.resizeObserver?.disconnect();
      }

      get isExpanded() {
        return this.button.getAttribute('aria-expanded') === 'true';
      }

      /* Hide the toggle when the text already fits in the collapsed height. */
      checkOverflow() {
        if (this.isExpanded) return;
        const fits = this.body.scrollHeight <= this.body.clientHeight + 2;
        this.classList.toggle('rover-cc--fits', fits);
      }

      toggle() {
        this.isExpanded ? this.collapse() : this.expand();
      }

      hasTransition() {
        return parseFloat(getComputedStyle(this.body).transitionDuration) > 0;
      }

      expand() {
        const body = this.body;
        this.setState(true);

        if (!this.hasTransition()) {
          body.style.maxHeight = 'none';
        } else {
          body.style.maxHeight = `${body.scrollHeight}px`;
          body.addEventListener(
            'transitionend',
            () => {
              if (this.isExpanded) body.style.maxHeight = 'none';
            },
            { once: true }
          );
        }

        if (!this.tracked && this.dataset.track === 'true') {
          this.tracked = true; // one event per page view keeps reports clean
          window.roverTrack?.('rover_content_expand', {
            content_type: 'collapsible_content',
            content_id: this.dataset.contentId,
            content_name: this.dataset.contentName,
            page_type: this.dataset.pageType,
          });
        }
      }

      collapse() {
        const body = this.body;

        if (this.hasTransition()) {
          body.style.maxHeight = `${body.scrollHeight}px`;
          body.getBoundingClientRect(); // commit the start height before animating down
        }
        body.style.maxHeight = '';
        this.setState(false);

        // If the reader is now far below the section, bring its heading back into view.
        const top = this.getBoundingClientRect().top;
        if (top < 0) {
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          this.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
        }
      }

      setState(expanded) {
        this.button.setAttribute('aria-expanded', String(expanded));
        this.classList.toggle('rover-cc--expanded', expanded);
      }
    }
  );
}
