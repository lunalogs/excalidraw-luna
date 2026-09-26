import { pointFrom } from "@excalidraw/math";

import {
  CaptureUpdateAction,
  newElement,
  newElementWith,
  newLinearElement,
} from "@excalidraw/element";

import type { LocalPoint, Radians } from "@excalidraw/math";
import type { ShapeCandidate } from "@excalidraw/element/handwriting/shapeRecognition";
import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
} from "@excalidraw/element/types";

import { register } from "./register";

export type HandwritingCommitShapeData = {
  strokeId: ExcalidrawElement["id"];
  candidate: ShapeCandidate;
  /** Id to assign to the tidied shape so the caller can offer "restore". */
  shapeId: ExcalidrawElement["id"];
};

export type HandwritingRestoreHandDrawnData = {
  shapeId: ExcalidrawElement["id"];
  strokeId: ExcalidrawElement["id"];
};

const buildShapeElement = (
  stroke: ExcalidrawFreeDrawElement,
  candidate: ShapeCandidate,
  shapeId: ExcalidrawElement["id"],
): ExcalidrawElement => {
  const geometry = candidate.geometry;
  // The tidied shape inherits the stroke's color / opacity / width so the
  // visual weight stays close to the hand-drawn stroke (SH-07). Roughness 0
  // keeps the geometry clean; variable-width / flat-nib effects have no
  // native-geometry equivalent and are expressed as a constant stroke.
  const base = {
    backgroundColor: "transparent" as const,
    fillStyle: "solid" as const,
    strokeColor: stroke.strokeColor,
    strokeStyle: "solid" as const,
    strokeWidth: stroke.strokeWidth,
    roughness: 0,
    opacity: stroke.opacity,
    groupIds: [],
    frameId: stroke.frameId,
    roundness: null,
    locked: false,
    link: stroke.link,
  };

  let element;
  switch (geometry.kind) {
    case "line": {
      // normalize the bounding box like the rest of the app expects; the
      // user's direction is preserved in the point order (SH-10)
      const minX = Math.min(geometry.x1, geometry.x2);
      const minY = Math.min(geometry.y1, geometry.y2);
      element = newLinearElement({
        type: "line",
        x: minX,
        y: minY,
        width: Math.abs(geometry.x2 - geometry.x1),
        height: Math.abs(geometry.y2 - geometry.y1),
        points: [
          pointFrom<LocalPoint>(geometry.x1 - minX, geometry.y1 - minY),
          pointFrom<LocalPoint>(geometry.x2 - minX, geometry.y2 - minY),
        ],
        ...base,
      });
      break;
    }
    case "ellipse":
      element = newElement({
        type: "ellipse",
        x: geometry.cx - geometry.rx,
        y: geometry.cy - geometry.ry,
        width: geometry.rx * 2,
        height: geometry.ry * 2,
        angle: geometry.angle as Radians,
        ...base,
      });
      break;
    case "rectangle":
      element = newElement({
        type: "rectangle",
        x: geometry.cx - geometry.width / 2,
        y: geometry.cy - geometry.height / 2,
        width: geometry.width,
        height: geometry.height,
        angle: geometry.angle as Radians,
        ...base,
      });
      break;
  }
  return { ...element, id: shapeId };
};

/**
 * Atomic hold-to-shape commit (SH-05/SH-06): the freedraw stroke is marked
 * deleted and the tidied shape inserted in ONE history entry, so a single
 * undo restores the pre-stroke state and redo re-applies the shape.
 */
export const actionCommitHandwritingShape =
  register<HandwritingCommitShapeData>({
    name: "handwritingCommitShape",
    label: "",
    trackEvent: false,
    perform: (elements, appState, data) => {
      if (!data) {
        return { captureUpdate: CaptureUpdateAction.NEVER };
      }
      const stroke = elements.find((element) => element.id === data.strokeId);
      if (!stroke || stroke.isDeleted || stroke.type !== "freedraw") {
        return { captureUpdate: CaptureUpdateAction.NEVER };
      }
      const shape = buildShapeElement(
        stroke as ExcalidrawFreeDrawElement,
        data.candidate,
        data.shapeId,
      );
      return {
        elements: [
          ...elements.map((element) =>
            element.id === stroke.id
              ? newElementWith(element, { isDeleted: true })
              : element,
          ),
          shape,
        ],
        appState: {
          ...appState,
          cursorButton: "up",
          newElement: null,
          multiElement: null,
          selectionElement: null,
          suggestedBinding: null,
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    },
  });

/**
 * Restore the original hand-drawn stroke in place of the tidied shape
 * (SH-06). Also one history entry. The stroke element is still in the
 * scene (marked deleted by the commit), so it is restored in place rather
 * than re-inserted. No-ops if the shape is gone (e.g. the user already
 * undid the commit).
 */
export const actionRestoreHandDrawn = register<HandwritingRestoreHandDrawnData>(
  {
    name: "handwritingRestoreHandDrawn",
    label: "",
    trackEvent: false,
    perform: (elements, appState, data) => {
      if (!data) {
        return { captureUpdate: CaptureUpdateAction.NEVER };
      }
      const shape = elements.find((element) => element.id === data.shapeId);
      const stroke = elements.find((element) => element.id === data.strokeId);
      if (!shape || shape.isDeleted || !stroke || !stroke.isDeleted) {
        return { captureUpdate: CaptureUpdateAction.NEVER };
      }
      return {
        elements: elements.map((element) =>
          element.id === shape.id
            ? newElementWith(element, { isDeleted: true })
            : element.id === stroke.id
            ? newElementWith(element, { isDeleted: false })
            : element,
        ),
        appState,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    },
  },
);
