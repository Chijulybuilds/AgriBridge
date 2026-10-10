import { Composition, registerRoot, staticFile } from "remotion";

import { Demo, FPS, sceneFrames } from "./Demo";
import { SCENES } from "./scenes";
import type { Timings } from "./timing";

/** The video's length follows the recorded voice (public/vo/timing.json), or an estimate until it exists. */
function Root() {
  return (
    <Composition
      id="AgriBridgeDemo"
      component={Demo}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={1}
      defaultProps={{ timings: {} as Timings }}
      calculateMetadata={async ({ props }) => {
        let timings: Timings = props.timings;
        try {
          const response = await fetch(staticFile("vo/timing.json"));
          if (response.ok) timings = await response.json();
        } catch {
          // No voice yet: scene lengths are estimated from the narration.
        }
        return { durationInFrames: SCENES.reduce((sum, scene) => sum + sceneFrames(scene, timings), 0), props: { timings } };
      }}
    />
  );
}

registerRoot(Root);
