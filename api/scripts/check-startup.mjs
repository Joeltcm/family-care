import { spawn } from 'node:child_process';

const port = String(18_000 + Math.floor(Math.random() * 10_000));
const child = spawn(process.execPath, ['dist/server.js'], {
  env: { PATH: process.env.PATH || '', NODE_ENV: 'test', PORT: port },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
let finished = false;
const timer = setTimeout(() => finish(false, 'El servicio no arrancó dentro de 10 segundos.'), 10_000);

function finish(ok, message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  child.kill('SIGTERM');
  if (ok) {
    process.stdout.write('Arranque del servicio verificado.\n');
  } else {
    process.stderr.write(`${message}\n${output.slice(-4_000)}\n`);
    process.exitCode = 1;
  }
}

child.stdout.on('data', (chunk) => {
  output += chunk.toString();
  if (output.includes('Server listening at')) finish(true, '');
});
child.stderr.on('data', (chunk) => { output += chunk.toString(); });
child.on('error', (error) => finish(false, error.message));
child.on('exit', (code) => { if (!finished) finish(false, `El servicio terminó antes de iniciar (código ${code}).`); });
