// The Director switch (A-BACK-049): whether a lesson's director camera
// (director.js) drives the 3D view. state.director is on by default and is
// turned off by the viewer taking the camera (director-ui.js) or picking a
// shot or view from the camera menu; it comes back with the pill, the
// switch, a new lesson or a restart. Fires `directorChanged` on window.

import { state } from '../state.js';
import { playbackState } from './playback.js';

export function setDirector(on) {
  const v = !!on;
  if (v === state.director) return;
  state.director = v;
  state.directorResume = null;
  // A camera the viewer took must not be put back by stop(): that snapshot
  // is the pre-play pose, the director's opening shot.
  if (!v) playbackState().savedCamera = null;
  window.dispatchEvent(new Event('directorChanged'));
}
