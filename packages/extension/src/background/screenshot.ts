import type { BoundingBoxType, ScreenshotCropType } from "@pinprompt/core";

import type { ViewportSnapshot } from "../messaging/protocol.js";

/** Longest side of a stored crop; larger crops are scaled down to keep session storage small. */
const MAX_CROP_SIDE = 1200;

export type ScreenshotCaptureResult = {
  crop: ScreenshotCropType | null;
  dataUrl: string | null;
  /**
   * "permission": Chrome refused the capture. It needs the activeTab grant, which only a click on
   * the toolbar button (or its keyboard shortcut) gives, and which a full page load takes away.
   */
  failure: "permission" | "other" | null;
};

export async function captureViewportCrop(
  windowId: number,
  bbox: BoundingBoxType,
  viewport: ViewportSnapshot,
): Promise<ScreenshotCaptureResult> {
  if (viewport.width <= 0 || viewport.height <= 0 || bbox.width <= 0 || bbox.height <= 0) {
    return { crop: null, dataUrl: null, failure: "other" };
  }

  try {
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: "png",
    });
    const croppedDataUrl = await cropScreenshotDataUrl(screenshotDataUrl, bbox, viewport);

    if (!croppedDataUrl) {
      return { crop: null, dataUrl: null, failure: "other" };
    }

    return {
      crop: {
        ref: `pinprompt-crop:${crypto.randomUUID()}`,
        mimeType: "image/png",
      },
      dataUrl: croppedDataUrl,
      failure: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = /activeTab|all_urls|permission/i.test(message) ? "permission" : "other";

    return { crop: null, dataUrl: null, failure };
  }
}

async function cropScreenshotDataUrl(
  dataUrl: string,
  bbox: BoundingBoxType,
  viewport: ViewportSnapshot,
): Promise<string | null> {
  const screenshotResponse = await fetch(dataUrl);
  const screenshotBlob = await screenshotResponse.blob();
  const bitmap = await createImageBitmap(screenshotBlob);

  try {
    const scaleX = bitmap.width / viewport.width;
    const scaleY = bitmap.height / viewport.height;
    const sourceX = Math.max(0, Math.floor(bbox.x * scaleX));
    const sourceY = Math.max(0, Math.floor(bbox.y * scaleY));
    const sourceWidth = Math.max(1, Math.floor(bbox.width * scaleX));
    const sourceHeight = Math.max(1, Math.floor(bbox.height * scaleY));
    const clampedWidth = Math.min(sourceWidth, bitmap.width - sourceX);
    const clampedHeight = Math.min(sourceHeight, bitmap.height - sourceY);

    if (clampedWidth <= 0 || clampedHeight <= 0) {
      return null;
    }

    const scale = Math.min(1, MAX_CROP_SIDE / Math.max(clampedWidth, clampedHeight));
    const outputWidth = Math.max(1, Math.round(clampedWidth * scale));
    const outputHeight = Math.max(1, Math.round(clampedHeight * scale));
    const canvas = new OffscreenCanvas(outputWidth, outputHeight);
    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      clampedWidth,
      clampedHeight,
      0,
      0,
      outputWidth,
      outputHeight,
    );

    const croppedBlob = await canvas.convertToBlob({
      type: "image/png",
    });

    return await blobToDataUrl(croppedBlob);
  } finally {
    bitmap.close();
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const base64 = encodeBase64(new Uint8Array(buffer));

  return `data:${blob.type};base64,${base64}`;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
