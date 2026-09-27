import "./style.css";
import { enter, finishMotion } from "./motion";

const pauseButton = document.querySelector("#pause-button");
const resumeButton = document.querySelector("#resume-button");
const note = document.querySelector("#next-step");
const pausedView = document.querySelector("#paused-view");
const liveParts = [
  ".example-page",
  "#resume-card",
  "#trip-task",
  "#page-list",
].map((selector) => document.querySelector(selector));

function setPaused(paused) {
  finishMotion();
  const outgoing = document.querySelector(paused ? "#trip-task" : "#later-trip");
  const origin = outgoing.getBoundingClientRect();
  for (const element of liveParts) element.hidden = paused;
  pausedView.hidden = !paused;
  document.querySelector("#later-trip").hidden = !paused;
  document.querySelector("#active-count").textContent = paused ? "1" : "2";
  document.querySelector("#later-count").textContent = paused ? "2" : "1";
  document.querySelector("#demo-status").textContent = paused
    ? "Task put aside with your note."
    : "Welcome back. Your note and pages are right here.";
  const incoming = document.querySelector(paused ? "#later-trip" : "#trip-task");
  const destination = incoming.getBoundingClientRect();
  enter(incoming, {
    x: [origin.left - destination.left, 0],
    y: [origin.top - destination.top, 0],
    duration: 360,
  });
  enter(paused ? pausedView : document.querySelector("#resume-card"), { y: [8, 0] });
  enter(document.querySelectorAll("#active-count, #later-count"), { y: [0, 0], scale: [1.15, 1], duration: 220 });
  if (paused) {
    document.querySelector("#saved-note").textContent =
      note.value.trim() || "Your pages are here whenever you are ready.";
    resumeButton.focus({ preventScroll: true });
  } else {
    pauseButton.focus({ preventScroll: true });
  }
}
pauseButton.addEventListener("click", () => setPaused(true));
resumeButton.addEventListener("click", () => setPaused(false));
