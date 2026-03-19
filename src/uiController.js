export class UIController {
  constructor(elements) {
    this.elements = elements;
    this.feedbackTimeout = null;
  }

  setScore(score) {
    this.elements.score.textContent = String(score).padStart(6, "0");
  }

  setProgress(text) {
    this.elements.progress.textContent = text;
  }

  setState(text) {
    this.elements.state.textContent = text;
  }

  showFeedback(text, tone = "neutral") {
    const colors = {
      neutral: "#f2f4f7",
      perfect: "#ffe16b",
      good: "#79e0b2",
      miss: "#ff6d7c",
      combo: "#ffb44c"
    };

    this.elements.feedback.textContent = text;
    this.elements.feedback.style.color = colors[tone] ?? colors.neutral;
    clearTimeout(this.feedbackTimeout);
    this.feedbackTimeout = window.setTimeout(() => {
      this.elements.feedback.textContent = "";
    }, 420);
  }

  setComboReady(visible) {
    this.elements.comboReady.classList.toggle("hidden", !visible);
  }

  setChaseVisible(visible) {
    this.elements.chaseShell.classList.toggle("hidden", !visible);
  }

  setChaseMeter(value) {
    this.elements.chaseFill.style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
  }

  hideOverlay() {
    this.elements.overlay.classList.add("hidden");
  }
}
