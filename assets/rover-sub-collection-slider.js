/**
 * Rover Island — Sub-collection slider
 *
 * Links are plain server-rendered <a href> tags (crawlable, work without JS).
 * JS only adds: arrow buttons when the row overflows, and a select_content event on click.
 * Scrolling itself is native (swipe / trackpad / shift+wheel / keyboard focus).
 */
if (!customElements.get('rover-sub-collection-slider')) {
  customElements.define(
    'rover-sub-collection-slider',
    class RoverSubCollectionSlider extends HTMLElement {
      connectedCallback() {
        this.track = this.querySelector('[data-scs-track]');
        if (!this.track) return;

        this.prev = this.querySelector('[data-scs-prev]');
        this.next = this.querySelector('[data-scs-next]');
        this.controller = new AbortController();
        const { signal } = this.controller;

        if (this.prev && this.next) {
          this.prev.addEventListener('click', () => this.scrollByPage(-1), { signal });
          this.next.addEventListener('click', () => this.scrollByPage(1), { signal });
          this.track.addEventListener('scroll', () => this.queueUpdate(), { passive: true, signal });

          if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(() => this.queueUpdate());
            this.resizeObserver.observe(this.track);
          }
          this.updateArrows();
        }

        if (this.dataset.track === 'true') {
          this.track.addEventListener('click', (event) => this.onLinkClick(event), { signal });
        }
      }

      disconnectedCallback() {
        this.controller?.abort();
        this.resizeObserver?.disconnect();
        if (this.frame) cancelAnimationFrame(this.frame);
      }

      get isRtl() {
        return getComputedStyle(this.track).direction === 'rtl';
      }

      scrollByPage(direction) {
        const distance = this.track.clientWidth * 0.8 * direction * (this.isRtl ? -1 : 1);
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.track.scrollBy({ left: distance, behavior: reduce ? 'auto' : 'smooth' });
      }

      queueUpdate() {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
          this.frame = null;
          this.updateArrows();
        });
      }

      updateArrows() {
        const { scrollWidth, clientWidth } = this.track;
        const overflowing = scrollWidth > clientWidth + 2;
        const position = Math.abs(this.track.scrollLeft); // RTL browsers report negative values
        const atStart = position <= 2;
        const atEnd = position + clientWidth >= scrollWidth - 2;

        this.classList.toggle('rover-scs--overflowing', overflowing);
        this.classList.toggle('rover-scs--at-start', atStart);
        this.classList.toggle('rover-scs--at-end', atEnd);

        // Buttons stay in the DOM; hidden ones are removed from the tab order.
        const startButton = this.isRtl ? this.next : this.prev;
        const endButton = this.isRtl ? this.prev : this.next;
        startButton.hidden = !overflowing || atStart;
        endButton.hidden = !overflowing || atEnd;
      }

      onLinkClick(event) {
        const link = event.target.closest('a[data-scs-link]');
        if (!link) return;

        window.roverTrack?.('select_content', {
          content_type: 'sub_collection',
          content_id: link.dataset.handle,
          link_text: link.dataset.title,
          link_url: link.getAttribute('href'),
          index: Number(link.dataset.index),
          item_list_id: this.dataset.listId,
          item_list_name: this.dataset.listName,
          page_type: this.dataset.pageType,
        });
      }
    }
  );
}
