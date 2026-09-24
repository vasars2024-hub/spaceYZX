// Space YZ client entry.
import './styles.css';
import { App } from './app';

const app = new App(
  document.getElementById('game') as HTMLCanvasElement,
  document.getElementById('ui') as HTMLDivElement,
);

// Test/debug hook used by automated browser checks (harmless for players).
(window as unknown as { __spaceyz: unknown }).__spaceyz = { app };
