import * as pc from 'playcanvas';

function canvasTexture(device: pc.GraphicsDevice, canvas: HTMLCanvasElement, name: string) {
  const tex = new pc.Texture(device, {
    name, width: canvas.width, height: canvas.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  (tex as any).srgb = true;
  tex.setSource(canvas);
  tex.anisotropy = 4;
  return tex;
}

export interface SignStyle {
  bg: string; fg: string; font?: string; sub?: string; border?: string; width?: number; height?: number; weight?: string;
}

export function signTexture(device: pc.GraphicsDevice, text: string, s: SignStyle): pc.Texture {
  const c = document.createElement('canvas');
  c.width = s.width ?? 1024; c.height = s.height ?? 256;
  const g = c.getContext('2d')!;
  g.fillStyle = s.bg; g.fillRect(0, 0, c.width, c.height);
  if (s.border) {
    g.strokeStyle = s.border; g.lineWidth = c.height * 0.05;
    g.strokeRect(g.lineWidth, g.lineWidth, c.width - g.lineWidth * 2, c.height - g.lineWidth * 2);
  }
  g.fillStyle = s.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const font = s.font ?? 'Georgia, serif';
  const main = s.sub ? c.height * 0.42 : c.height * 0.52;
  g.font = `${s.weight ?? '700'} ${main}px ${font}`;
  let size = main;
  while (g.measureText(text).width > c.width * 0.88 && size > 10) { size -= 4; g.font = `${s.weight ?? '700'} ${size}px ${font}`; }
  g.fillText(text, c.width / 2, s.sub ? c.height * 0.42 : c.height / 2);
  if (s.sub) {
    g.font = `500 ${c.height * 0.16}px Inter, Helvetica, sans-serif`;
    g.globalAlpha = 0.85;
    g.fillText(s.sub, c.width / 2, c.height * 0.78);
  }
  return canvasTexture(device, c, `sign:${text}`);
}

/** Striped awning fabric. */
export function stripeTexture(device: pc.GraphicsDevice, a: string, b: string): pc.Texture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 32, 0, 32, 64); }
  const t = canvasTexture(device, c, 'stripes');
  t.addressU = pc.ADDRESS_REPEAT; t.addressV = pc.ADDRESS_REPEAT;
  return t;
}

/** Police tape: yellow with black text, repeating. */
export function tapeTexture(device: pc.GraphicsDevice): pc.Texture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2c516'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#111'; g.font = '700 30px Inter, Helvetica, sans-serif'; g.textBaseline = 'middle';
  g.fillText('POLICE LINE  DO NOT CROSS', 18, 33);
  const t = canvasTexture(device, c, 'tape');
  t.addressU = pc.ADDRESS_REPEAT;
  return t;
}

/** Road markings: dashed centre line on transparent. */
export function laneTexture(device: pc.GraphicsDevice): pc.Texture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 256);
  g.fillStyle = 'rgba(240,236,220,0.92)'; g.fillRect(22, 0, 20, 140);
  const t = canvasTexture(device, c, 'lane');
  t.addressU = pc.ADDRESS_CLAMP_TO_EDGE; t.addressV = pc.ADDRESS_REPEAT;
  return t;
}

/** Window with a warm lit interior impression (used on upper floors). */
export function windowTexture(device: pc.GraphicsDevice): pc.Texture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 192;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 192);
  grd.addColorStop(0, '#3b4a57'); grd.addColorStop(0.55, '#24303a'); grd.addColorStop(1, '#4a3a2c');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 192);
  // sky reflection streak
  g.fillStyle = 'rgba(200,220,240,0.18)';
  g.beginPath(); g.moveTo(0, 40); g.lineTo(128, 0); g.lineTo(128, 30); g.lineTo(0, 80); g.fill();
  // curtains
  g.fillStyle = 'rgba(210,190,160,0.55)'; g.fillRect(6, 6, 22, 180); g.fillRect(100, 6, 22, 180);
  // frame
  g.strokeStyle = '#e8e4da'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 184);
  g.lineWidth = 5; g.beginPath(); g.moveTo(64, 4); g.lineTo(64, 188); g.moveTo(4, 96); g.lineTo(124, 96); g.stroke();
  return canvasTexture(device, c, 'window');
}

/** Evidence-board / notice paper. */
export function paperTexture(device: pc.GraphicsDevice, lines: string[]): pc.Texture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 384;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5b4632'; g.fillRect(0, 0, 512, 384);
  g.fillStyle = '#efe7d2'; g.fillRect(24, 24, 464, 336);
  g.fillStyle = '#2a241a'; g.font = '28px "Special Elite", Courier, monospace';
  lines.forEach((l, i) => g.fillText(l, 48, 80 + i * 44));
  return canvasTexture(device, c, 'paper');
}
