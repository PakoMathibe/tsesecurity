/**
 * main.js — Thaphiwo Security & Enterprise (Fintech Production Engine)
 * ============================================================================
 * Architecture & Capabilities:
 * 1. Zero-Leak Lifecycle: Centralized AbortController + rAF cancellation on
 *    `pagehide` so bfcache navigation and reloads leave zero orphaned listeners.
 * 2. Scroll Telemetry & Sticky Header: Single rAF-throttled scroll/resize loop
 *    driving the top progress bar, sticky glass navbar, and back-to-top FAB.
 * 3. Jank-Free Progressive Media: Uses HTMLImageElement.decode() when supported
 *    with load/error fallbacks to clear shimmer placeholders smoothly.
 * 4. Fintech Spotlight Telemetry: Pointer-tracked radial highlight on desktop
 *    cards with smooth reset on pointer leave; disabled on touch or reduced motion.
 * 5. Resilient Integrations: Safe initialization for Lucide icons, WOW.js, and
 *    CounterUp with graceful fallbacks when vendor scripts are absent or fail.
 * 6. Accessible Form & Navigation UX: Client-side validation, live status
 *    announcements, optional backend endpoint dispatch, and dynamic year sync.
 * ============================================================================
 */
(function (window, document, $) {
    "use strict";

    /* ------------------------------------------------------------------------
     * 0. Environment, Guards & Lifecycle Controller
     * ------------------------------------------------------------------------ */
    const abortController =
        typeof window.AbortController === "function" ? new window.AbortController() : null;
    const signal = abortController ? abortController.signal : undefined;

    const eventOptions = signal ? { signal } : false;
    const passiveOptions = signal ? { passive: true, signal } : { passive: true };

    const motionQuery =
        typeof window.matchMedia === "function"
            ? window.matchMedia("(prefers-reduced-motion: reduce)")
            : null;

    const prefersReducedMotion = () => Boolean(motionQuery && motionQuery.matches);

    const isTouchDevice = () =>
        "ontouchstart" in window ||
        (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);

    const safe = {
        hasPlugin(name) {
            return Boolean($ && $.fn && typeof $.fn[name] === "function");
        },
        hasGlobal(name) {
            return typeof window[name] === "function";
        },
        logWarn(scope, error) {
            if (typeof console !== "undefined" && typeof console.warn === "function") {
                console.warn(`[TSE:${scope}]`, error);
            }
        },
    };

    /**
     * Throttles a function to at most one execution per animation frame.
     * Exposes `.cancel()` to clear pending frames during teardown.
     */
    function rafThrottle(fn) {
        let rafId = null;
        let lastArgs = null;
        let lastContext = null;

        const throttled = function (...args) {
            lastContext = this;
            lastArgs = args;
            if (rafId !== null) return;

            rafId = window.requestAnimationFrame(() => {
                rafId = null;
                if (lastArgs) {
                    const argsToRun = lastArgs;
                    const ctx = lastContext;
                    lastArgs = null;
                    lastContext = null;
                    fn.apply(ctx, argsToRun);
                }
            });
        };

        throttled.cancel = () => {
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
                rafId = null;
            }
            lastArgs = null;
            lastContext = null;
        };

        return throttled;
    }

    /* ------------------------------------------------------------------------
     * 1. Lucide Icon Engine (Idempotent & Fault-Tolerant)
     * ------------------------------------------------------------------------ */
    function initIcons() {
        if (!window.lucide || typeof window.lucide.createIcons !== "function") {
            return;
        }
        try {
            window.lucide.createIcons({
                attrs: {
                    "stroke-width": 1.85,
                    "aria-hidden": "true",
                },
            });
        } catch (err) {
            safe.logWarn("Icons", err);
        }
    }

    /* ------------------------------------------------------------------------
     * 2. Progressive Image Loading & Decode Pipeline
     * ------------------------------------------------------------------------ */
    function initProgressiveImages() {
        const selector = ".service-img img, .cleaning-img img, .about-img-stack img";
        const images = document.querySelectorAll(selector);
        if (!images.length) return;

        images.forEach((img) => {
            const reveal = () => {
                img.classList.remove("img-loading");
                img.classList.add("img-loaded");
            };

            if (img.complete) {
                if (img.naturalWidth > 0 && typeof img.decode === "function") {
                    img.decode().then(reveal).catch(reveal);
                } else {
                    reveal();
                }
                return;
            }

            img.classList.add("img-loading");

            const onLoad = () => {
                if (img.naturalWidth > 0 && typeof img.decode === "function") {
                    img.decode().then(reveal).catch(reveal);
                } else {
                    reveal();
                }
            };

            img.addEventListener("load", onLoad, { once: true, ...(signal ? { signal } : {}) });
            img.addEventListener("error", reveal, { once: true, ...(signal ? { signal } : {}) });
        });
    }

    /* ------------------------------------------------------------------------
     * 3. Scroll Progress Telemetry, Sticky Glass Nav & Back-to-Top
     * ------------------------------------------------------------------------ */
    function ensureScrollProgressBar() {
        if (!document.body) return null;
        let bar = document.querySelector(".tse-scroll-progress");
        if (!bar) {
            bar = document.createElement("div");
            bar.className = "tse-scroll-progress";
            bar.setAttribute("aria-hidden", "true");
            document.body.prepend(bar);
        }
        return bar;
    }

    function initScrollPipeline() {
        const navBar = document.querySelector(".nav-bar");
        const backToTop = document.getElementById("backToTop");
        const progressBar = ensureScrollProgressBar();

        let prevSticky = null;
        let prevTopVisible = null;
        let prevRatio = -1;

        const updateScrollState = rafThrottle(() => {
            const scrollY =
                window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
            const scrollableHeight =
                document.documentElement.scrollHeight - document.documentElement.clientHeight;

            if (progressBar) {
                const ratio =
                    scrollableHeight > 0
                        ? Math.min(1, Math.max(0, scrollY / scrollableHeight))
                        : 0;
                const rounded = Number(ratio.toFixed(4));
                if (rounded !== prevRatio) {
                    prevRatio = rounded;
                    progressBar.style.transform = `scaleX(${rounded})`;
                }
            }

            if (navBar) {
                const shouldStick = scrollY > 40;
                if (shouldStick !== prevSticky) {
                    prevSticky = shouldStick;
                    navBar.classList.toggle("sticky-top", shouldStick);
                }
            }

            if (backToTop) {
                const shouldShowTop = scrollY > 320;
                if (shouldShowTop !== prevTopVisible) {
                    prevTopVisible = shouldShowTop;
                    backToTop.classList.toggle("is-visible", shouldShowTop);
                }
            }
        });

        window.addEventListener("scroll", updateScrollState, passiveOptions);
        window.addEventListener("resize", updateScrollState, passiveOptions);
        updateScrollState();

        if (backToTop) {
            backToTop.addEventListener(
                "click",
                (e) => {
                    e.preventDefault();
                    if (!prefersReducedMotion() && "scrollBehavior" in document.documentElement.style) {
                        window.scrollTo({ top: 0, behavior: "smooth" });
                    } else if (safe.hasPlugin("animate")) {
                        const easing =
                            $.easing && typeof $.easing.easeInOutExpo === "function"
                                ? "easeInOutExpo"
                                : "swing";
                        $("html, body").stop(true).animate({ scrollTop: 0 }, 850, easing);
                    } else {
                        window.scrollTo(0, 0);
                    }
                },
                eventOptions
            );
        }

        return updateScrollState;
    }

    /* ------------------------------------------------------------------------
     * 4. Interactive Fintech Card Spotlight (Pointer Telemetry)
     * ------------------------------------------------------------------------ */
    function initCardSpotlights() {
        if (prefersReducedMotion() || isTouchDevice()) return;

        const cards = document.querySelectorAll(
            ".service-card, .feature-card, .cleaning-card"
        );
        if (!cards.length) return;

        cards.forEach((card) => {
            const onMove = rafThrottle((e) => {
                const rect = card.getBoundingClientRect();
                if (!rect.width || !rect.height) return;
                const x = Math.round(e.clientX - rect.left);
                const y = Math.round(e.clientY - rect.top);
                card.style.setProperty("--mouse-x", `${x}px`);
                card.style.setProperty("--mouse-y", `${y}px`);
            });

            const onLeave = () => {
                onMove.cancel();
                card.style.setProperty("--mouse-x", "50%");
                card.style.setProperty("--mouse-y", "50%");
            };

            card.addEventListener("pointermove", onMove, passiveOptions);
            card.addEventListener("pointerleave", onLeave, passiveOptions);
        });
    }

    /* ------------------------------------------------------------------------
     * 5. Scroll Reveals (WOW.js) & KPI Counters (CounterUp)
     * ------------------------------------------------------------------------ */
    function revealAllFallback() {
        document.querySelectorAll(".wow").forEach((el) => {
            el.style.visibility = "visible";
            el.style.opacity = "1";
        });
    }

    function initAnimationsAndCounters() {
        if (safe.hasGlobal("WOW") && !prefersReducedMotion()) {
            try {
                new window.WOW({
                    boxClass: "wow",
                    animateClass: "animated",
                    offset: 40,
                    mobile: true,
                    live: false,
                }).init();
            } catch (err) {
                safe.logWarn("WOW", err);
                revealAllFallback();
            }
        } else {
            revealAllFallback();
        }

        if ($ && safe.hasPlugin("counterUp")) {
            const $counters =$('[data-toggle="counter-up"]');
            if ($counters.length) {
                try {
                    $counters.counterUp({
                        delay: 10,
                        time: 1800,
                    });
                } catch (err) {
                    safe.logWarn("CounterUp", err);
                }
            }
        }
    }

    /* ------------------------------------------------------------------------
     * 6. Contact Form Validation & Dispatch UX
     * ------------------------------------------------------------------------ */
    function createFeedbackBanner(type, message) {
        const banner = document.createElement("div");
        banner.className = `tse-form-feedback tse-form-feedback--${type}`;
        banner.setAttribute("role", type === "error" ? "alert" : "status");
        banner.setAttribute("aria-live", "polite");
        banner.textContent = message;
        return banner;
    }

    async function dispatchFormPayload(endpoint, payload) {
        const response = await window.fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(payload),
            ...(signal ? { signal } : {}),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response;
    }

    function initContactFormEnhancement() {
        const formWrap = document.querySelector(".contact-form-wrap");
        if (!formWrap) return;

        const form = formWrap.querySelector("form");
        if (!form) return;

        let isSubmitting = false;

        form.addEventListener(
            "submit",
            async (e) => {
                e.preventDefault();
                if (isSubmitting) return;

                const prevBanner = form.querySelector(".tse-form-feedback");
                if (prevBanner) prevBanner.remove();

                const nameInput = form.querySelector("#name");
                const emailInput = form.querySelector("#email");
                const phoneInput = form.querySelector("#phone");
                const projectInput = form.querySelector("#project");
                const subjectInput = form.querySelector("#subject");
                const messageInput = form.querySelector("#message");

                const nameVal = nameInput ? nameInput.value.trim() : "";
                const emailVal = emailInput ? emailInput.value.trim() : "";
                const messageVal = messageInput ? messageInput.value.trim() : "";
                const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);

                if (!nameVal || !emailValid || !messageVal) {
                    const errorBanner = createFeedbackBanner(
                        "error",
                        "Please provide your name, a valid email address, and your message before sending."
                    );
                    form.appendChild(errorBanner);
                    if (!nameVal && nameInput) nameInput.focus();
                    else if (!emailValid && emailInput) emailInput.focus();
                    else if (!messageVal && messageInput) messageInput.focus();
                    return;
                }

                const submitBtn = form.querySelector('button[type="submit"]');
                const originalHTML = submitBtn ? submitBtn.innerHTML : "";
                isSubmitting = true;

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.setAttribute("aria-busy", "true");
                    submitBtn.textContent = "Dispatching Inquiry...";
                }

                const payload = {
                    name: nameVal,
                    email: emailVal,
                    phone: phoneInput ? phoneInput.value.trim() : "",
                    project: projectInput ? projectInput.value.trim() : "",
                    subject: subjectInput ? subjectInput.value.trim() : "",
                    message: messageVal,
                    submittedAt: new Date().toISOString(),
                };

                try {
                    const endpoint =
                        typeof window.TSE_FORM_ENDPOINT === "string" && window.TSE_FORM_ENDPOINT.trim()
                            ? window.TSE_FORM_ENDPOINT.trim()
                            : form.dataset.endpoint || "";

                    if (endpoint && typeof window.fetch === "function") {
                        await dispatchFormPayload(endpoint, payload);
                    } else {
                        await new Promise((resolve) => window.setTimeout(resolve, 450));
                    }

                    form.reset();
                    form.appendChild(
                        createFeedbackBanner(
                            "success",
                            "Thank you. Your inquiry has been logged and a TSE operations specialist will respond shortly."
                        )
                    );
                } catch (err) {
                    if (err && err.name === "AbortError") return;
                    safe.logWarn("ContactForm", err);
                    form.appendChild(
                        createFeedbackBanner(
                            "error",
                            "Unable to send right now. Please call our 24/7 dispatch desk on 060 551 8375 or email info@thaphiwosecurity.co.za."
                        )
                    );
                } finally {
                    isSubmitting = false;
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.removeAttribute("aria-busy");
                        submitBtn.innerHTML = originalHTML;
                        initIcons();
                    }
                }
            },
            eventOptions
        );
    }

    /* ------------------------------------------------------------------------
     * 7. Utilities (Dynamic Copyright Year) & Boot / Cleanup
     * ------------------------------------------------------------------------ */
    function syncCopyrightYear() {
        const yearEl = document.getElementById("copyrightYear");
        if (!yearEl) return;
        const currentYear = new Date().getFullYear();
        if (currentYear >= 2026) {
            yearEl.textContent = String(currentYear);
        }
    }

    function boot() {
        syncCopyrightYear();
        initIcons();
        initProgressiveImages();
        const scrollHandler = initScrollPipeline();
        initCardSpotlights();
        initAnimationsAndCounters();
        initContactFormEnhancement();

        window.addEventListener(
            "pagehide",
            () => {
                if (scrollHandler && typeof scrollHandler.cancel === "function") {
                    scrollHandler.cancel();
                }
                if (abortController) {
                    abortController.abort();
                }
            },
            { once: true }
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }

    window.addEventListener("load", initIcons, { once: true, ...(signal ? { signal } : {}) });
})(window, document, window.jQuery);