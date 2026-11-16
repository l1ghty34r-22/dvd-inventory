import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

interface Props {
  onDetected: (code: string) => void;
  onCancel: () => void;
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") {
    return "Camera access was blocked. Allow it in your browser's site settings, or type the barcode instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device. Type the barcode instead.";
  }
  if (name === "NotReadableError") {
    return "The camera is being used by another app. Close it and try again.";
  }
  return "Could not start the camera. Type the barcode instead.";
}

/** Live camera view that reads DVD barcodes (EAN-13, EAN-8, UPC-A) and reports the first one. */
export function BarcodeScanner({ onDetected, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let cancelled = false;
    let done = false;

    async function start() {
      if (!window.isSecureContext) {
        setError("The camera only works when the site is opened over HTTPS. Type the barcode instead.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot use the camera. Type the barcode instead.");
        return;
      }
      try {
        // Loaded on demand so the scanner code is not in the main bundle.
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all(
          [import("@zxing/browser"), import("@zxing/library")],
        );
        if (cancelled || !videoRef.current) return;

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        const started = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current,
          (result, _error, scanner) => {
            if (!result || done) return;
            done = true;
            scanner.stop();
            onDetectedRef.current(result.getText());
          },
        );
        // The dialog may have closed while the camera was starting.
        if (cancelled) started.stop();
        else {
          controls = started;
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) setError(cameraErrorMessage(err));
      }
    }

    void start();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="scanner">
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <>
          <div className="scanner-view">
            <video ref={videoRef} muted playsInline aria-label="Camera view" />
            <span className="scanner-guide" aria-hidden="true" />
          </div>
          <p className="muted" aria-live="polite">
            {ready ? "Hold the barcode inside the box, about a hand's width away." : "Starting the camera…"}
          </p>
        </>
      )}
      <button type="button" className="text-button" onClick={onCancel}>
        {error ? "Close" : "Stop scanning"}
      </button>
    </div>
  );
}
