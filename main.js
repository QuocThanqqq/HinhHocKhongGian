import { PortraitScene } from "./src/portraitScene.js";
import { OverlayFlow } from "./src/overlayFlow.js";
import scoreIconUrl from "./mnt/data/ChatGPT Image Mar 15, 2026, 12_35_39 PM 1.png";
import tutorialHandUrl from "./mnt/data/Layer 2 1.png";
import tutorialRingUrl from "./mnt/data/Group 1000002938.png";

const canvas = document.getElementById("game-canvas");
const scoreIcon = document.getElementById("score-icon");
const tutorialHand = document.getElementById("tutorial-hand");
const tutorialRing = document.getElementById("tutorial-ring");
const introRing = document.getElementById("intro-ring");
const scoreValue = document.getElementById("score-value");
const feedbackText = document.getElementById("feedback-text");
const resultRankIcon = document.getElementById("result-rank-icon");

if (scoreIcon) {
  scoreIcon.src = scoreIconUrl;
}

if (resultRankIcon) {
  resultRankIcon.src = scoreIconUrl;
}

if (tutorialHand) {
  tutorialHand.src = tutorialHandUrl;
}

if (tutorialRing) {
  tutorialRing.src = tutorialRingUrl;
}

if (introRing) {
  introRing.src = tutorialRingUrl;
}

if (scoreValue) {
  scoreValue.textContent = "000000";
}

const portraitScene = new PortraitScene({
  canvas,
  scoreElement: scoreValue,
  feedbackElement: feedbackText,
  onRoundComplete: ({ score }) => overlayFlow.showResult(score)
});
portraitScene.mount();

const overlayFlow = new OverlayFlow({
  uiLayer: document.getElementById("ui-layer"),
  gameplayHud: document.getElementById("gameplay-hud"),
  introButton: document.getElementById("intro-button"),
  tutorialOverlay: document.getElementById("tutorial-overlay"),
  resultExitButton: document.getElementById("result-exit"),
  resultReplayButton: document.getElementById("result-replay"),
  resultCloseButton: document.getElementById("result-close"),
  resultScoreElement: document.getElementById("result-score"),
  onGameplayStart: () => portraitScene.startGameplay()
});

overlayFlow.mount();
