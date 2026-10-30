# Third-party code

This repository includes code I did not write. It is listed here with its licence.

| Item | Path | Used by | Source | Licence |
|---|---|---|---|---|
| three.js r186 core (`three.module.js`, `three.core.js`) | `public/vendor/three/` | `prototype3d.html` | [three.js](https://github.com/mrdoob/three.js), file header "Copyright 2010-2026 Three.js Authors" | MIT (`SPDX-License-Identifier: MIT` in the header) |
| three.js `OrbitControls.js` add-on | `public/vendor/three/` | `prototype3d.html` | three.js `examples/jsm` add-on (no licence header in the file) | MIT, under the three.js repository licence |

No third-party 3D models, avatars or animation clips are included. The private project used several character models whose
redistribution licence I could not confirm, so I left them out. The 3D page draws its characters, desks, room and product
hologram from simple three.js primitives instead.
