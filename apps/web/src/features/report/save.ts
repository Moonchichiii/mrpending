const SVG_NS = 'http://www.w3.org/2000/svg';
// The card's two self-hosted families; an SVG drawn as an image loads nothing, so they travel inside it.
const FONTS = [
  { family: 'Fredoka', url: '/fonts/Fredoka-400-700.woff2' },
  { family: 'Nunito', url: '/fonts/Nunito-400-700.woff2' },
] as const;

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('no data URL'));
    reader.onerror = () => reject(reader.error ?? new Error('the font could not be read'));
    reader.readAsDataURL(blob);
  });

// The fonts as data URLs; a font that cannot be fetched leaves the image on the system fallbacks named in the card.
async function fontFaces(): Promise<string> {
  const faces = await Promise.all(
    FONTS.map(async ({ family, url }) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return '';
        const src = await dataUrl(await response.blob());
        return `@font-face { font-family: ${family}; src: url('${src}') format('woff2'); font-weight: 400 700; }`;
      } catch {
        return '';
      }
    }),
  );
  return faces.join('\n');
}

const toPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('the canvas made no image'))),
      'image/png',
    ),
  );

// Rasterises the card in the browser at its own size and downloads it as a PNG; nothing leaves the machine.
export async function saveImage(
  card: SVGSVGElement,
  width: number,
  height: number,
  name: string,
): Promise<void> {
  const copy = card.cloneNode(true);
  if (!(copy instanceof SVGSVGElement)) throw new Error('the card is not an SVG');
  copy.setAttribute('xmlns', SVG_NS);
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = await fontFaces();
  copy.prepend(style);
  const source = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }),
  );
  try {
    const image = new Image(width, height);
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('this browser has no 2D canvas');
    context.drawImage(image, 0, 0, width, height);
    const png = URL.createObjectURL(await toPng(canvas));
    const link = document.createElement('a');
    link.href = png;
    link.download = `${name}.png`;
    link.click();
    // The download has taken its copy once the click has been handled.
    setTimeout(() => URL.revokeObjectURL(png), 0);
  } finally {
    URL.revokeObjectURL(source);
  }
}
