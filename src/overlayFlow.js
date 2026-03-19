export class OverlayFlow {
  constructor({
    uiLayer,
    gameplayHud,
    introButton,
    tutorialOverlay,
    resultExitButton,
    resultReplayButton,
    resultCloseButton,
    resultScoreElement,
    onGameplayStart
  }) {
    this.uiLayer = uiLayer;
    this.gameplayHud = gameplayHud;
    this.introButton = introButton;
    this.tutorialOverlay = tutorialOverlay;
    this.resultExitButton = resultExitButton;
    this.resultReplayButton = resultReplayButton;
    this.resultCloseButton = resultCloseButton;
    this.resultScoreElement = resultScoreElement;
    this.onGameplayStart = onGameplayStart;
    this.state = "intro";

    this.handleIntro = this.handleIntro.bind(this);
    this.handleTutorial = this.handleTutorial.bind(this);
    this.handleReplay = this.handleReplay.bind(this);
    this.handleExit = this.handleExit.bind(this);
  }

  mount() {
    this.gameplayHud.classList.add("hidden");
    this.uiLayer.dataset.screen = this.state;

    this.introButton.addEventListener("click", this.handleIntro);
    this.tutorialOverlay.addEventListener("click", this.handleTutorial);
    this.resultReplayButton.addEventListener("click", this.handleReplay);
    this.resultExitButton.addEventListener("click", this.handleExit);
    this.resultCloseButton.addEventListener("click", this.handleExit);
  }

  handleIntro() {
    if (this.state !== "intro") {
      return;
    }

    this.state = "tutorial";
    this.uiLayer.dataset.screen = this.state;
  }

  handleTutorial() {
    if (this.state !== "tutorial") {
      return;
    }

    this.enterGameplay();
  }

  showResult(score) {
    this.state = "result";
    this.uiLayer.dataset.screen = this.state;
    this.gameplayHud.classList.add("hidden");
    if (this.resultScoreElement) {
      this.resultScoreElement.textContent = String(score).padStart(6, "0");
    }
  }

  handleReplay() {
    if (this.state !== "result") {
      return;
    }

    this.enterGameplay();
  }

  handleExit() {
    this.state = "intro";
    this.uiLayer.dataset.screen = this.state;
    this.gameplayHud.classList.add("hidden");
  }

  enterGameplay() {
    this.state = "gameplay";
    this.uiLayer.dataset.screen = this.state;
    this.gameplayHud.classList.remove("hidden");
    this.onGameplayStart?.();
  }
}
