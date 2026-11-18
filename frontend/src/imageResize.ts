/**
 * Turn any picture the browser can open into a small square JPEG for a profile picture:
 * crop the middle square, scale it to `size` pixels, compress. A 5 MB phone photo comes out
 * at about 20-40 KB, so uploads are quick and the database stays small.
 */
export async function squareJpeg(file: File, size = 256): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file isn't a picture this browser can open."));
      img.src = url;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = (image.naturalWidth - side) / 2;
    const sy = (image.naturalHeight - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't resize pictures.");
    // White behind transparent PNGs, since JPEG has no transparency.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare the picture."))),
        "image/jpeg",
        0.88,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
