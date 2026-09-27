import { animate, stagger } from "animejs";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const running = new Set();

export function finishMotion() {
  for (const animation of running) animation.revert();
  running.clear();
}

export function enter(targets, options = {}) {
  if (reduced.matches) return;
  const animation = animate(targets, {
    opacity: [0.65, 1],
    y: [10, 0],
    duration: 320,
    ease: "out(3)",
    ...options,
    onComplete: (self) => {
      running.delete(self);
      self.revert();
    },
  });
  running.add(animation);
}

function onPreferenceChange() {
  // Revealing content is never conditional on an animation finishing.
  finishMotion();
}
reduced.addEventListener("change", onPreferenceChange);

enter(document.querySelectorAll(".hero > *"), { delay: stagger(45), duration: 420 });

// Content stays visible before JavaScript runs and if observers are unavailable.
const observer = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    enter(entry.target, { y: [14, 0], duration: 420 });
  }
}, { threshold: 0.12 }) : null;
for (const section of document.querySelectorAll(".demo-section, .idea-section, .principles, .faq, .closing")) {
  observer?.observe(section);
}

const faqListeners = [];
for (const details of document.querySelectorAll(".faq details")) {
  const onToggle = () => {
    if (details.open) enter(details.querySelector("p"), { y: [4, 0], duration: 180 });
  };
  details.addEventListener("toggle", onToggle);
  faqListeners.push(() => details.removeEventListener("toggle", onToggle));
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  finishMotion();
  observer?.disconnect();
  reduced.removeEventListener("change", onPreferenceChange);
  faqListeners.forEach(remove => remove());
});
