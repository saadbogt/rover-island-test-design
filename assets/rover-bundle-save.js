/**
 * Rover Island — Bundle & Save
 *
 * - Re-renders itself when the customer picks another variant, using the HTML
 *   Dawn already fetched (PUB_SUB_EVENTS.variantChange). No extra requests,
 *   no edits to Dawn's product-info.js.
 * - Carousel: native scroll-snap; JS only syncs the dots and adds mouse drag.
 * - Tracking: view_item_list (once, when seen) and select_item (on tap),
 *   sent to a DOM event, Shopify custom events and GTM's dataLayer if present.
 */
if (!customElements.get('rover-bundle-save')) {
  customElements.define(
    'rover-bundle-save',
    class RoverBundleSave extends HTMLElement {
      connectedCallback() {
        if (this.closest('quick-add-modal')) return;

        this.controller = new AbortController();
        this.track = this.querySelector('[data-rbs-track]');
        this.slides = Array.from(this.querySelectorAll('[data-rbs-slide]'));
        this.dots = Array.from(this.querySelectorAll('[data-rbs-dot]'));
        this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

        this.listenForVariantChange();

        if (this.track && this.slides.length > 1) {
          this.initDots();
          this.initMouseDrag();
        }

        this.initTracking();
      }

      disconnectedCallback() {
        this.controller?.abort();
        this.unsubscribe?.();
        this.dotObserver?.disconnect();
        this.viewObserver?.disconnect();
      }

      /* Variant change ------------------------------------------------------ */

      listenForVariantChange() {
        if (typeof subscribe !== 'function' || typeof PUB_SUB_EVENTS === 'undefined') return;

        this.unsubscribe = subscribe(PUB_SUB_EVENTS.variantChange, (event) => {
          const html = event?.data?.html;
          if (!html || event.data.sectionId !== this.dataset.sectionId) return;

          const source = html.getElementById(this.id);
          // Ignore updates for another product (e.g. a quick-add modal on this page).
          if (!source || source.dataset.productId !== this.dataset.productId) return;
          if (source.dataset.renderKey === this.dataset.renderKey) return;

          this.replaceWith(document.importNode(source, true));
        });
      }

      /* Carousel ------------------------------------------------------------ */

      get scrollBehavior() {
        return this.reduceMotion.matches ? 'auto' : 'smooth';
      }

      trackPadding() {
        return parseFloat(getComputedStyle(this.track).scrollPaddingInlineStart) || 0;
      }

      scrollToSlide(index) {
        const slide = this.slides[index];
        if (!slide) return;
        this.track.scrollTo({ left: slide.offsetLeft - this.trackPadding(), behavior: this.scrollBehavior });
      }

      nearestSlideIndex() {
        const position = this.track.scrollLeft + this.trackPadding();
        let nearest = 0;
        let closest = Infinity;
        this.slides.forEach((slide, index) => {
          const distance = Math.abs(slide.offsetLeft - position);
          if (distance < closest) {
            closest = distance;
            nearest = index;
          }
        });
        return nearest;
      }

      setActiveDot(index) {
        this.dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
      }

      initDots() {
        if (!this.dots.length) return;
        const { signal } = this.controller;

        this.dots.forEach((dot, index) => {
          dot.addEventListener('click', () => this.scrollToSlide(index), { signal });
        });

        if ('IntersectionObserver' in window) {
          this.dotObserver = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) this.setActiveDot(this.slides.indexOf(entry.target));
              });
            },
            { root: this.track, threshold: 0.6 }
          );
          this.slides.forEach((slide) => this.dotObserver.observe(slide));
        }
      }

      initMouseDrag() {
        const { track } = this;
        const { signal } = this.controller;
        let pointerId = null;
        let startX = 0;
        let startScroll = 0;
        this.dragged = false;

        track.addEventListener(
          'pointerdown',
          (event) => {
            if (event.pointerType !== 'mouse' || event.button !== 0) return;
            if (track.scrollWidth <= track.clientWidth) return;
            pointerId = event.pointerId;
            startX = event.clientX;
            startScroll = track.scrollLeft;
            this.dragged = false;
          },
          { signal }
        );

        track.addEventListener(
          'pointermove',
          (event) => {
            if (event.pointerId !== pointerId) return;
            const delta = event.clientX - startX;
            if (!this.dragged) {
              if (Math.abs(delta) < 6) return;
              this.dragged = true;
              track.setPointerCapture(pointerId);
              track.classList.add('is-dragging');
            }
            track.scrollLeft = startScroll - delta;
          },
          { signal }
        );

        const endDrag = (event) => {
          if (event.pointerId !== pointerId) return;
          pointerId = null;
          if (!this.dragged) return;
          track.classList.remove('is-dragging');
          this.scrollToSlide(this.nearestSlideIndex());
          // The click that follows a drag is swallowed below; reset afterwards.
          window.setTimeout(() => {
            this.dragged = false;
          }, 0);
        };

        track.addEventListener('pointerup', endDrag, { signal });
        track.addEventListener('pointercancel', endDrag, { signal });

        track.addEventListener(
          'click',
          (event) => {
            if (!this.dragged) return;
            event.preventDefault();
            event.stopPropagation();
          },
          { capture: true, signal }
        );

        track.addEventListener('dragstart', (event) => event.preventDefault(), { signal });
      }

      /* Tracking ------------------------------------------------------------ */

      initTracking() {
        const cards = Array.from(this.querySelectorAll('[data-rbs-card]'));
        if (!cards.length) return;

        const list = { item_list_id: 'bundle_save', item_list_name: this.dataset.listName };
        const items = cards.map((card, index) => this.itemFromCard(card, index, list));

        cards.forEach((card, index) => {
          card.addEventListener('click', () => this.track('select_item', { ...list, items: [items[index]] }), {
            signal: this.controller.signal,
          });
        });

        if (!('IntersectionObserver' in window)) return;
        this.viewObserver = new IntersectionObserver(
          (entries, observer) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            this.track('view_item_list', { ...list, items });
          },
          { threshold: 0.5 }
        );
        this.viewObserver.observe(this);
      }

      itemFromCard(card, index, list) {
        const data = card.dataset;
        const item = {
          item_id: data.sku || data.productId,
          item_name: data.name,
          item_brand: data.brand,
          item_category: data.category,
          item_list_id: list.item_list_id,
          item_list_name: list.item_list_name,
          index,
          price: Number(data.price),
          discount: Number(data.discount),
          quantity: 1,
          product_id: data.productId,
          variant_id: data.variantId,
          sku: data.sku,
          barcode: data.barcode,
          bundle_quantity: Number(data.bundleQuantity),
        };
        if (data.variantTitle) item.item_variant = data.variantTitle;
        Object.keys(item).forEach((key) => {
          if (item[key] === '' || item[key] === undefined) delete item[key];
        });
        return item;
      }

      track(eventName, ecommerce) {
        const payload = { currency: this.dataset.currency, ...ecommerce };

        document.dispatchEvent(new CustomEvent('rover:track', { detail: { event: eventName, ecommerce: payload } }));

        try {
          window.Shopify?.analytics?.publish?.(`rover_${eventName}`, payload);
        } catch (error) {
          /* analytics must never break the page */
        }

        if (Array.isArray(window.dataLayer)) {
          window.dataLayer.push({ ecommerce: null });
          window.dataLayer.push({ event: eventName, ecommerce: payload });
        }
      }
    }
  );
}
