// Train mode (A-BACK-054): the goalie training workspace in the left rail
// (A-Q-008 revised) with its own practice rink (A-Q-011).
//
// Entering Train (shell.js fires `shell:mode`) stashes the Plan doc, turns
// on the save sandbox (storage.js) so no edit reaches the user's projects or
// undo history, and shows a practice doc (train-session.js). Leaving
// restores the Plan doc exactly and its persisted undo history. A reload
// always starts in Plan, so a stash never needs to outlive the page.
//
// The Train panel (#trainPanel) holds the module's text in the app language;
// the zone card (A-BACK-048), KATA rows (A-BACK-046), lessons (A-BACK-049)
// and exercises (A-BACK-050) go into #trainSlots.

import { ensureDoc, acceptDoc } from './doc.js';
import { setSaveSandbox, adoptDocAsProject } from './storage.js';
import { showDoc, switchToProject, notifyProjectChanged } from './library-dialog.js';
import { initHistory, resetHistory } from './history.js';
import { practiceDoc, stashPlanDoc, restorePlanDoc } from './train-session.js';
import { stop as stopPlayback } from './playback.js';
import { isChoreoActive, cancelChoreo } from './choreograph.js';
import { finishAllWalks } from './walk-tween.js';
import { isTopDown, exitTopDown } from './topdown-camera.js';
import { deselectAll } from '../selection.js';
import { t } from '../lang-state.js';
import { GOALIE_MODULE_URL } from '../i18n.js';
import { markRenderDirty } from '../render-dirty.js';
import { setGoalieZonesShown, restorePlanGoalieZones } from '../goalie-zones-state.js';
import { setShotViewUnsaved, restoreStoredShotView } from '../shot-view-state.js';
import { trainShotView } from '../shot-view.js';
import './goalie-zone-card.js';   // zone card in #trainSlots (A-BACK-048)
import './kata-section.js';       // KATA card (A-BACK-046)
import { armLessonIntro } from './lesson-cards-ui.js';   // title and recap card of a lesson (A-BACK-049)
import { getCameraRig, isDefaultView, applyDefaultView, defaultRig } from '../scene.js';
import { blendCameraTo } from '../ui/camera-menu.js';
import { trainPose, lessonPose } from '../camera-presets.js';
import { buildLesson } from '../goalie-lessons.js';
import { state, getBallWorldCenter } from '../state.js';
import { rigToCamera } from '../orbit-math.js';
import { updateGoalieZones } from '../goalie-zones-layer.js';
import { updateKataReadout } from '../kata-readout.js';

// Throw when the DOM root is missing; see CLAUDE.md 'DOM-owning modules'.
const panel = document.getElementById('trainPanel');
const openAsPlay = document.getElementById('trainOpenAsPlay');
const sourceLink = document.getElementById('trainSourceLink');
if (!panel || !openAsPlay || !sourceLink) throw new Error('train-mode.js: #trainPanel, #trainOpenAsPlay or #trainSourceLink missing from index.html');

let stash = null;   // the Plan doc as JSON while Train is on
let planRig = null; // Plan's camera, given back on the way out
let planWasDefault = false;   // ...or its default view, which follows layout changes

// Leave whatever is running on the doc on screen before it is swapped.
function settle() {
  if (isChoreoActive()) cancelChoreo();
  stopPlayback();
  finishAllWalks();
  deselectAll();
}

function enterTrain() {
  if (stash) return;
  settle();
  if (isTopDown()) exitTopDown();
  stash = stashPlanDoc(ensureDoc());
  setSaveSandbox(true);
  showDoc(practiceDoc());
  resetHistory();
  setGoalieZonesShown(true, { remember: false });   // A-BACK-048: Train starts with the zones on
  setShotViewUnsaved(trainShotView(state.shotView));   // corner lines + shooting line, not stored
  // Zone card and KATA right away, not one frame later (no empty flash).
  updateGoalieZones(getBallWorldCenter());
  updateKataReadout();
  // Layout A: frame the defending goal end (the practice ball is at goal A).
  planRig = getCameraRig();
  planWasDefault = isDefaultView();
  blendCameraTo(trainPose(state.goalieZone?.goal ?? 'A'));
  markRenderDirty();
}

function leaveTrain() {
  if (!stash) return null;
  settle();
  const practice = JSON.parse(JSON.stringify(ensureDoc()));
  showDoc(restorePlanDoc(stash));
  stash = null;
  setSaveSandbox(false);
  restorePlanGoalieZones();
  restoreStoredShotView();   // Plan's own lines choice
  // Through the same blend, so it also replaces a blend still running from entering.
  if (planWasDefault) blendCameraTo(rigToCamera(defaultRig()), applyDefaultView);   // like Stand: still the default view after
  else if (planRig) blendCameraTo(rigToCamera(planRig));
  planRig = null;
  planWasDefault = false;
  initHistory();
  notifyProjectChanged();
  markRenderDirty();
  return practice;
}

window.addEventListener('shell:mode', (e) => {
  if (e.detail?.mode === 'train') enterTrain();
  else if (e.detail?.previous === 'train') leaveTrain();
});

// A-BACK-049: show a shipped lesson on the practice rink (entering Train
// first if needed). Like the practice doc it is never saved; "Open as
// play" copies it into the user's projects. Returns false for an unknown key.
export function openLesson(key) {
  const raw = buildLesson(key, state.lang);
  if (!raw) return false;
  if (!stash) document.querySelector('#appRail [data-mode="train"]')?.click();   // enters Train (shell:mode)
  if (!stash) throw new Error('train-mode.js: openLesson could not enter Train');
  settle();
  showDoc(acceptDoc(JSON.parse(JSON.stringify(raw))));
  resetHistory();
  updateGoalieZones(getBallWorldCenter());
  updateKataReadout();
  blendCameraTo(lessonPose(raw.autoGoalie));
  markRenderDirty();
  // showDoc() fires nothing: the recorder (frame strip, Hold switch) and
  // the caption re-read the doc on framesChanged.
  window.dispatchEvent(new Event('framesChanged'));
  armLessonIntro();   // the lesson's task card, until the first play
  return true;
}

// The Library's Lessons shelf (library-dialog.js) carries data-action="lesson".
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('[data-action="lesson"]');
  if (btn) openLesson(btn.dataset.lesson);
});

// "Open as play": the practice situation becomes a new project in Plan;
// the Plan play that was open stays as it was.
openAsPlay.addEventListener('click', () => {
  const practice = JSON.parse(JSON.stringify(ensureDoc()));
  document.querySelector('#appRail [data-mode="plan"]')?.click();   // leaves Train (shell:mode)
  const doc = adoptDocAsProject(practice, { name: t('goalie.title') });
  if (doc) switchToProject(doc.meta.id);
});

function relabel() {
  // Train's text lives in the overlay and in the top bar ([data-t]).
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  panel.lang = document.documentElement.lang;
}
sourceLink.href = GOALIE_MODULE_URL;
window.addEventListener('langChanged', relabel);
relabel();
