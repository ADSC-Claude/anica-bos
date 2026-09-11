'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { tokenFromLink } from '@/lib/guest-sheet';

/**
 * The coordinator's viewfinder.
 *
 * The desk already accepted a pasted link, which works and is slow: open the
 * phone's camera app, wait for the banner, tap it, copy the URL, come back,
 * paste. Five actions per guest with a queue behind you. This is one.
 *
 * `BarcodeDetector` would be free and is Chromium-only — every browser on an
 * iPhone is WebKit, and a coordinator holding an iPhone is not an edge case
 * here. So the decoder is jsQR, loaded only when somebody actually opens the
 * scanner: it is a quarter of a megabyte, and the rest of the desk should not
 * pay for it.
 */
export function Scanner({ onFound, onClose }: { onFound: (token: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);
  const [error, setError] = useState('');
  const [torch, setTorch] = useState<boolean | null>(null);

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    let live = true;
    let decode: ((d: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null;

    async function begin() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser will not open a camera. Scan with your phone’s camera app and paste a scanned link instead.');
        return;
      }
      try {
        // The back camera, and as much of it as the phone will give: a QR held
        // up on somebody else's screen is small in the frame.
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!live) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        const track = s.getVideoTracks()[0];
        const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
        if (caps?.torch) setTorch(false);

        decode = (await import('jsqr')).default as unknown as typeof decode;
      } catch (e) {
        const name = (e as { name?: string }).name ?? '';
        setError(
          name === 'NotAllowedError'
            ? 'The camera was blocked. Allow it for this site in your browser settings, or paste a scanned link instead.'
            : name === 'NotFoundError'
              ? 'No camera on this device. Paste a scanned link instead.'
              : 'The camera would not start here. Paste a scanned link instead.',
        );
        return;
      }

      const canvas = document.createElement('canvas');
      const cx = canvas.getContext('2d', { willReadFrequently: true });
      let seen = '';

      const tick = () => {
        raf.current = requestAnimationFrame(tick);
        const v = video.current;
        if (!v || !cx || !decode || v.readyState !== v.HAVE_ENOUGH_DATA) return;
        // Half resolution: a QR survives it, and it is the difference between a
        // scanner that keeps up on a five-year-old phone and one that does not.
        const w = Math.round(v.videoWidth / 2);
        const h = Math.round(v.videoHeight / 2);
        if (!w || !h) return;
        canvas.width = w;
        canvas.height = h;
        cx.drawImage(v, 0, 0, w, h);
        let found: { data: string } | null = null;
        try {
          found = decode(cx.getImageData(0, 0, w, h).data, w, h);
        } catch {
          return;
        }
        if (!found) return;
        const token = tokenFromLink(found.data);
        // The same code sits in front of the lens for a second or two; only the
        // first read of it counts.
        if (!token || token === seen) return;
        seen = token;
        stop();
        onFound(token);
      };
      tick();
    }

    begin();
    return () => { live = false; stop(); };
  }, [onFound, stop]);

  const flip = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch(next);
    } catch {
      setTorch(null);
    }
  };

  return (
    <div className="scan">
      <div className="scan-frame">
        <video ref={video} className="scan-video" playsInline muted autoPlay aria-label="Camera" />
        <span className="scan-reticle" aria-hidden="true" />
      </div>
      {error ? (
        <p className="scan-error" role="alert">{error}</p>
      ) : (
        <p className="scan-hint">Hold the guest’s QR inside the frame.</p>
      )}
      <span className="scan-actions">
        <button type="button" className="btn btn-secondary" onClick={() => { stop(); onClose(); }}>Close</button>
        {torch !== null && (
          <button type="button" className="btn btn-secondary" onClick={flip}>{torch ? 'Light off' : 'Light on'}</button>
        )}
      </span>
    </div>
  );
}
