export interface VideoClip {
  id: string;
  assetId: string;
  in: number;
  out: number;
  purpose: string;
  speed?: number;
  note?: string;
  frame?: { scale: number; x: number; y: number };
}

export interface AudioLane {
  assetId: string;
  startSec?: number;
  out?: number;
  gainDb?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  duckUnderVoDb?: number;
}

export interface SfxLane extends AudioLane {
  purpose?: string;
}

export interface Overlay {
  at: string;
  text: string;
  startSec: number;
  endSec: number;
}

export interface Captions {
  enabled: boolean;
  source?: string;
  style?: string;
}

export interface EditPlan {
  version: number;
  status: string;
  target: { width: number; height: number; fps: number; maxDurationSec: number };
  lanes: {
    video: VideoClip[];
    voiceover?: AudioLane;
    music?: AudioLane;
    sfx?: SfxLane[];
  };
  transitions?: Array<{ at: string; type: string; durationSec: number }>;
  overlays?: Overlay[];
  captions?: Captions;
}

export interface MediaAsset {
  id: string;
  path: string;
  type: string;
  durationSec?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  tags?: string[];
  transcript?: string | null;
}

export interface ProjectState {
  id: string;
  plan: EditPlan;
  index: { assets: MediaAsset[] };
  outputUrl: string | null;
}

export interface AiEditSummary {
  clipCount: number;
  totalSec: number;
  overlayCount: number;
  transitionCount: number;
  hasMusic: boolean;
  hasVoiceover: boolean;
  captionsEnabled: boolean;
  summary: string;
}
