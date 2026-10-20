/**
 * The sample picture of a ticket: the server's image of one SAMPLE ticket (invalid QR, watermark),
 * laid on a soft background with a shadow and a slight tilt, the way a printed ticket looks on a
 * table. Drawn in the browser, so sharing it costs the API nothing more.
 */

/** Room around the ticket, as a share of its width. */
const MARGIN = 0.1;
/** Tilt of the ticket, in degrees. */
const TILT = -2.5;

/** A file name for the picture: "amostra-festa-junina.png". */
export function sampleFileName(eventName: string): string {
  const slug = eventName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `amostra${slug === "" ? "" : `-${slug}`}.png`;
}

/** The picture as a PNG: the ticket image on a light backdrop. */
export async function sampleMockup(ticket: Blob): Promise<Blob> {
  const image = await createImageBitmap(ticket);
  const margin = Math.round(image.width * MARGIN);
  const canvas = document.createElement("canvas");
  canvas.width = image.width + 2 * margin;
  canvas.height = image.height + 2 * margin;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("no canvas");
  }
  // A cool grey backdrop with a light from the top left (the same in both themes: it is a picture).
  const light = context.createRadialGradient(canvas.width * 0.25, 0, 0, canvas.width * 0.25, 0, canvas.width);
  light.addColorStop(0, "#f7f8fa");
  light.addColorStop(1, "#dcdfe6");
  context.fillStyle = light;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((TILT * Math.PI) / 180);
  const x = -image.width / 2;
  const y = -image.height / 2;
  // Paper lifting off the table: a wide soft shadow and a short dark one.
  context.shadowColor = "rgba(15, 23, 42, 0.22)";
  context.shadowBlur = image.width * 0.04;
  context.shadowOffsetY = image.width * 0.018;
  context.fillStyle = "#ffffff";
  context.fillRect(x, y, image.width, image.height);
  context.shadowColor = "rgba(15, 23, 42, 0.18)";
  context.shadowBlur = image.width * 0.004;
  context.shadowOffsetY = image.width * 0.002;
  context.fillRect(x, y, image.width, image.height);
  context.shadowColor = "transparent";
  context.drawImage(image, x, y);
  image.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("no picture"));
      } else {
        resolve(blob);
      }
    }, "image/png");
  });
}
