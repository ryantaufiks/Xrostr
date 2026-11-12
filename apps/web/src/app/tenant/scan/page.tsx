'use client';

import jsQR from 'jsqr';
import { CameraOff, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { buttonStyles, iconButtonStyles } from '@/components/ui';
import { scanTarget } from '@/lib/checkin';
import { useT } from '@/lib/i18n';

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/** The browser's own QR reader when it has one (Chrome on Android), else jsQR on a canvas. */
function nativeDetector(): Detector | null {
  const Ctor = (
    window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }
  ).BarcodeDetector;
  return Ctor ? new Ctor({ formats: ['qr_code'] }) : null;
}

export default function ScanPage() {
  const t = useT();
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const detector = nativeDetector();

    async function read(): Promise<string | null> {
      const v = video.current;
      if (!v || v.readyState < 2) return null;
      if (detector) return (await detector.detect(v))[0]?.rawValue ?? null;
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      context!.drawImage(v, 0, 0);
      const image = context!.getImageData(0, 0, canvas.width, canvas.height);
      return (
        jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ??
        null
      );
    }

    async function loop() {
      if (stopped) return;
      try {
        const text = await read();
        if (text) {
          const target = scanTarget(text);
          if (target) {
            stopped = true;
            router.replace(target);
            return;
          }
          setHint(t.attendance.notXrostrQr);
        }
      } catch {
        // A single unreadable frame is normal; keep scanning.
      }
      frame = window.setTimeout(() => requestAnimationFrame(loop), 150);
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (s) => {
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        void loop();
      })
      .catch(() => setError(t.attendance.cameraDenied));
    if (!navigator.mediaDevices) setError(t.attendance.noCamera);

    return () => {
      stopped = true;
      window.clearTimeout(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [router]);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">{t.attendance.scanTitle}</h1>
        <Link href="/tenant" aria-label={t.attendance.close} className={iconButtonStyles('md')}>
          <X className="size-6" aria-hidden />
        </Link>
      </div>
      <p className="text-lg text-muted">{t.attendance.scanHint}</p>
      {error ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-line px-6 py-12 text-center">
          <CameraOff className="size-12 text-accent" aria-hidden />
          <p className="text-lg text-fg">{error}</p>
          <Link href="/tenant" className={buttonStyles('secondary')}>
            {t.common.back}
          </Link>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
          <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
          {/* Aiming frame */}
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80" />
        </div>
      )}
      {hint && <p className="text-base text-accent">{hint}</p>}
    </div>
  );
}
