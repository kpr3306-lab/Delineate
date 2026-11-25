// The phone's own share sheet (WhatsApp, Instagram, AirDrop…). Nothing is uploaded by the app itself.

/** True where the browser can hand image files to the share sheet. */
export function canShareImages() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File([new Uint8Array(1)], 'x.jpg', { type: 'image/jpeg' })] }));
  } catch {
    return false;
  }
}

/** Share one image. Resolves false when the user just closed the sheet. */
export async function shareImage(blob: Blob, fileName: string, title: string) {
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}
