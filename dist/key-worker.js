import { keyPixels } from './core.js';
self.onmessage = ({ data }) => {
  try {
    const pixels = new Uint8ClampedArray(data.buffer);
    const result = keyPixels(pixels, data.width, data.height, data.settings);
    self.postMessage({ id: data.id, buffer: pixels.buffer, ...result }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
