import './ui/style.css';
import { Game } from './core/game';

function showFatal(msg: string) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:100;background:#0b0c0f;color:#eee;padding:24px;font:14px/1.5 Inter,system-ui,sans-serif;white-space:pre-wrap;overflow:auto';
  el.textContent = `Case Files could not start.\n\n${msg}\n\nTry reloading. If this keeps happening, take a screenshot of this screen.`;
  document.body.appendChild(el);
}

window.addEventListener('error', (e) => console.error('Uncaught', e.error ?? e.message));

const canvas = document.getElementById('app') as HTMLCanvasElement;
const test = document.createElement('canvas').getContext('webgl2');
if (!test) {
  showFatal('This browser does not support WebGL 2, which the game requires.');
} else {
  new Game(canvas).init().catch((err) => {
    console.error(err);
    showFatal(String(err?.stack ?? err));
  });
}
