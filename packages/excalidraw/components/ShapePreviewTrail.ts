import { SVG_NS, sceneCoordsToViewportCoords } from "@excalidraw/common";

import type { ShapeCandidate } from "@excalidraw/element/handwriting/shapeRecognition";

import { t } from "../i18n";

import type { Trail } from "../animated-trail";
import type App from "./App";

type PreviewPayload = {
  candidate: ShapeCandidate;
  strokeColor: string;
  strokeWidth: number;
};

const KIND_LABEL_KEY = {
  line: "handwriting.shapePreviewLine",
  circle: "handwriting.shapePreviewCircle",
  ellipse: "handwriting.shapePreviewEllipse",
  rectangle: "handwriting.shapePreviewRectangle",
  square: "handwriting.shapePreviewSquare",
} as const;

/**
 * Low-interference ghost overlay shown while the user holds the pen on a
 * recognized shape (SH-04). Renders into the shared SVGLayer on top of the
 * canvas without touching the scene. The "lift to confirm" label is shown
 * next to the shape.
 */
export class ShapePreviewTrail implements Trail {
  private container: SVGSVGElement | null = null;
  private group: SVGGElement;
  private payload: PreviewPayload | null = null;

  constructor(private app: App) {
    this.group = document.createElementNS(SVG_NS, "g");
    this.group.setAttribute("class", "shape-preview-trail");
  }

  setCandidate(payload: PreviewPayload | null) {
    this.payload = payload;
    this.render();
  }

  start(container?: SVGSVGElement) {
    if (container) {
      this.container = container;
    }
    if (this.container && this.group.parentNode !== this.container) {
      this.container.appendChild(this.group);
    }
    this.render();
  }

  stop() {
    if (this.container && this.group.parentNode === this.container) {
      this.container.removeChild(this.group);
    }
    this.payload = null;
  }

  // Trail interface no-ops — the preview is driven by hold-to-shape state.
  startPath() {}
  addPointToPath() {}
  endPath() {}

  private render() {
    if (!this.container) {
      return;
    }
    while (this.group.firstChild) {
      this.group.removeChild(this.group.firstChild);
    }
    const payload = this.payload;
    if (!payload) {
      return;
    }
    const state = this.app.state;
    const zoom = state.zoom.value;
    const toViewport = (sceneX: number, sceneY: number) =>
      sceneCoordsToViewportCoords({ sceneX, sceneY }, state);
    const { candidate, strokeColor, strokeWidth } = payload;

    const shapeNode = document.createElementNS(SVG_NS, "g");
    shapeNode.setAttribute("stroke", strokeColor);
    shapeNode.setAttribute(
      "stroke-width",
      `${Math.max(1.5, strokeWidth * zoom)}`,
    );
    shapeNode.setAttribute("fill", "none");
    shapeNode.setAttribute("stroke-dasharray", "7 5");
    shapeNode.setAttribute("stroke-linecap", "round");

    const geometry = candidate.geometry;
    let labelX = 0;
    let labelY = 0;

    if (geometry.kind === "line") {
      const p1 = toViewport(geometry.x1, geometry.y1);
      const p2 = toViewport(geometry.x2, geometry.y2);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", `${p1.x}`);
      line.setAttribute("y1", `${p1.y}`);
      line.setAttribute("x2", `${p2.x}`);
      line.setAttribute("y2", `${p2.y}`);
      shapeNode.appendChild(line);
      labelX = (p1.x + p2.x) / 2;
      labelY = Math.min(p1.y, p2.y);
    } else {
      const center = toViewport(geometry.cx, geometry.cy);
      const group = document.createElementNS(SVG_NS, "g");
      // SVG rotate is clockwise degrees, canvas angle is radians (y-down):
      // they align, so convert directly.
      group.setAttribute(
        "transform",
        `translate(${center.x} ${center.y}) rotate(${
          (geometry.angle * 180) / Math.PI
        })`,
      );
      let node: SVGElement;
      if (geometry.kind === "ellipse") {
        node = document.createElementNS(SVG_NS, "ellipse");
        node.setAttribute("rx", `${geometry.rx * zoom}`);
        node.setAttribute("ry", `${geometry.ry * zoom}`);
        labelY = center.y - geometry.ry * zoom;
      } else {
        node = document.createElementNS(SVG_NS, "rect");
        node.setAttribute("x", `${(-geometry.width / 2) * zoom}`);
        node.setAttribute("y", `${(-geometry.height / 2) * zoom}`);
        node.setAttribute("width", `${geometry.width * zoom}`);
        node.setAttribute("height", `${geometry.height * zoom}`);
        labelY = center.y - (geometry.height / 2) * zoom;
      }
      labelX = center.x;
      group.appendChild(node);
      shapeNode.appendChild(group);
    }

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", `${labelX}`);
    label.setAttribute("y", `${labelY - 10}`);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "shape-preview-trail__label");
    label.textContent = `${t(
      KIND_LABEL_KEY[(candidate.kind as keyof typeof KIND_LABEL_KEY) ?? "line"],
    )} · ${t("handwriting.shapePreview")}`;
    shapeNode.appendChild(label);

    this.group.appendChild(shapeNode);
  }
}
