/**
 * Rover Island — Sticky Add to Cart button (mobile)
 * - Submits the real product form (button uses form="…"): cart logic is untouched.
 * - Teleports to <body> so transformed ancestors can't break position: fixed.
 * - Mirrors the original button (label / disabled / loading).
 * - Tracking: one interaction event; the real add_to_cart still comes from the theme flow.
 */
(() => {
  if (customElements.get('rover-sticky-atc')) return;

  const ROOT = document.documentElement;
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

  class RoverStickyATC extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;

      if (this.parentElement !== document.body) {
        document.querySelectorAll('rover-sticky-atc').forEach((el) => {
          if (el !== this && el.parentElement === document.body && el.dataset.section === this.dataset.section) {
            el.remove(); // stale copy from a previous Theme Editor render
          }
        });
        document.body.appendChild(this); // re-enters connectedCallback
        return;
      }
      this.init();
    }

    init() {
      try {
        this.cfg = JSON.parse(this.querySelector('[data-config]').textContent);
      } catch (e) {
        return;
      }
      this.form = document.getElementById(this.dataset.form);
      this.source = document.getElementById(this.dataset.target);
      if (!this.form || !this.source) return;

      this.ready = true;
      this.btn = this.querySelector('[data-btn]');
      this.label = this.querySelector('[data-label]');
      this.spinner = this.querySelector('.loading__spinner');
      this.variants = new Map(this.cfg.variants.map((v) => [String(v.id), v]));
      this.h = 0;
      this.visible = false;

      this.onClick = () => this.track();
      this.onMq = () => (this.mq.matches ? this.enable() : this.disable());
      this.btn.addEventListener('click', this.onClick);

      this.mo = new MutationObserver(() => this.syncButton());
      this.mo.observe(this.source, {
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled', 'class'],
        childList: true,
        subtree: true,
        characterData: true,
      });

      this.ro = new ResizeObserver(() => {
        if (this.updateHeight() && this.mq.matches) this.observeSource();
      });
      this.ro.observe(this);

      this.mq = window.matchMedia(`(max-width: ${parseInt(this.dataset.maxWidth, 10) || 749}px)`);
      this.mq.addEventListener('change', this.onMq);
      this.onMq();
    }

    disconnectedCallback() {
      if (!this.ready) return;
      this.ready = false;
      this.btn.removeEventListener('click', this.onClick);
      this.mq.removeEventListener('change', this.onMq);
      this.mo.disconnect();
      this.ro.disconnect();
      this.io?.disconnect();
      ROOT.classList.remove('rover-sticky-atc-visible');
      ROOT.style.removeProperty('--rover-sticky-atc-h');
    }

    enable() {
      this.classList.add('is-enabled');
      this.updateHeight();
      this.syncButton();
      this.observeSource();
    }

    disable() {
      this.classList.remove('is-enabled');
      this.io?.disconnect();
      this.setVisible(false);
    }

    updateHeight() {
      const h = Math.round(this.getBoundingClientRect().height);
      if (!h || h === this.h) return false;
      this.h = h;
      ROOT.style.setProperty('--rover-sticky-atc-h', `${h}px`);
      return true;
    }

    // Show whenever the real button is out of view (area under the sticky button counts as hidden)
    observeSource() {
      this.io?.disconnect();
      this.io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          const scrolledPast = entry.boundingClientRect.top < 0;
          this.setVisible(!entry.isIntersecting && (this.dataset.trigger !== 'scrolled_past' || scrolledPast));
        },
        { rootMargin: `0px 0px -${this.h}px 0px` }
      );
      this.io.observe(this.source);
    }

    setVisible(visible) {
      if (this.visible === visible) return;
      this.visible = visible;
      this.classList.toggle('is-visible', visible);
      ROOT.classList.toggle('rover-sticky-atc-visible', visible);
    }

    // The original button is the single source of truth
    syncButton() {
      const s = this.source;
      const busy = s.classList.contains('loading');
      const text = norm(s.querySelector('span')?.textContent);
      this.btn.disabled = s.hasAttribute('disabled');
      this.btn.classList.toggle('loading', busy); // reuses the theme's own loading styles
      this.spinner?.classList.toggle('hidden', !busy);
      if (text && this.label.textContent !== text) this.label.textContent = text;
    }

    // Interaction signal only. Do NOT map this to AddToCart in Meta/TikTok:
    // the real add_to_cart is produced once by the theme's own add-to-cart flow.
    track() {
      if (!this.cfg.track) return;
      try {
        const id = this.form.querySelector('[name="id"]')?.value;
        const v = this.variants.get(String(id)) || this.cfg.variants[0] || {};
        const qty = Math.max(1, parseInt(document.getElementById(`Quantity-${this.dataset.section}`)?.value, 10) || 1);
        const price = Number(v.price) || 0;
        const item = clean({
          item_id: v.sku || String(this.cfg.productId),
          item_name: this.cfg.name,
          item_brand: this.cfg.brand,
          item_category: this.cfg.category,
          item_variant: v.title && v.title !== 'Default Title' ? v.title : '',
          price,
          quantity: qty,
          product_id: String(this.cfg.productId),
          variant_id: String(v.id || ''),
          sku: v.sku,
          barcode: v.barcode,
        });
        const payload = {
          placement: 'mobile_sticky_button',
          ecommerce: { currency: this.cfg.currency, value: +(price * qty).toFixed(2), items: [item] },
        };

        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ ecommerce: null }); // GA4: clear previous ecommerce object
        window.dataLayer.push({ event: 'rover_sticky_atc_click', ...payload });
        window.Shopify?.analytics?.publish?.('rover_sticky_atc_click', payload);
        document.dispatchEvent(new CustomEvent('rover:sticky-atc-click', { detail: payload }));
      } catch (e) {
        /* tracking must never block add to cart */
      }
    }
  }

  customElements.define('rover-sticky-atc', RoverStickyATC);

  // Theme Editor: remove the teleported button when its section unloads
  document.addEventListener('shopify:section:unload', (e) => {
    document.querySelectorAll('rover-sticky-atc').forEach((el) => {
      if (el.dataset.section === e.detail.sectionId) el.remove();
    });
  });
})();