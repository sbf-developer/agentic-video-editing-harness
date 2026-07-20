export interface VideoClip {
  id: string;
  assetId: string;
  in: number;
  out: number;
  purpose: string;
  speed?: number;
  note?: string;
}

export interface AudioLane {
  assetId: string;
  startSec?: number;
  gainDb?: number;
  fadeOutSec?: number;
}

export interface EditPlan {
  version: number;
  status: string;
  target: { width: number; height: number; fps: number; maxDurationSec: number };
  lanes: {
    video: VideoClip[];
    voiceover?: AudioLane;
    music?: AudioLane;
  };
  transitions?: Array<{ at: string; type: string; durationSec: number }>;
}

export interface MediaAsset {
  id: string;
  path: string;
  type: string;
  durationSec?: number;
  thumbnail?: string;
}

export interface ProjectState {
  id: string;
  plan: EditPlan;
  index: { assets: MediaAsset[] };
  outputUrl: string | null;
}
