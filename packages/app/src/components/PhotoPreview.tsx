import { useEffect, useRef } from 'react';
import { maskLabel, type MaskBox } from '@envoy/core';

export interface SessionPhoto {
  blob: Blob;
  width: number;
  height: number;
  boxes: MaskBox[];
}

/**
 * The person's photo with every private detail found on the device boxed. Read-only: in the web
 * app the photo never leaves; its masked text does, after review. Drawn on a canvas (no blob: URL,
 * which the extension's page policy would refuse).
 */
export function PhotoPreview({ photo }: { photo: SessionPhoto }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    createImageBitmap(photo.blob)
      .then((bmp) => {
        const c = canvas.current;
        if (live && c) {
          c.width = bmp.width;
          c.height = bmp.height;
          c.getContext('2d')?.drawImage(bmp, 0, 0);
        }
        bmp.close?.();
      })
      // A photo the browser can't draw still shows its masks and its text.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [photo.blob]);
  const pct = (v: number, of: number) => `${(100 * v) / of}%`;
  const n = photo.boxes.length;
  return (
    <div
      role="img"
      aria-label={`Your photo, with ${n} private ${n === 1 ? 'detail' : 'details'} boxed on this device`}
      className="relative overflow-clip rounded-[10px] border border-line/70"
      style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
    >
      <canvas ref={canvas} className="block h-full w-full" />
      {photo.boxes.map((b, i) => (
        <span
          key={i}
          data-mask=""
          aria-hidden="true"
          className="absolute flex items-center overflow-hidden rounded-[2px] border border-device/80 bg-[#04050b] px-[2px] text-[8.5px] leading-none font-semibold whitespace-nowrap text-device-on-tint"
          style={{
            left: pct(b.x, photo.width),
            top: pct(b.y, photo.height),
            width: pct(b.w, photo.width),
            height: pct(b.h, photo.height),
          }}
        >
          {maskLabel(b)}
        </span>
      ))}
    </div>
  );
}
