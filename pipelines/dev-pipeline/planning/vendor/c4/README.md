# Bundled C4 renderer dependencies

Runtime rendering is local and needs only Node.js 18+. It does not download
packages, fonts or images, launch a browser, or invoke an image-generation API.
Run `npm ci --ignore-scripts --no-audit --no-fund` and `npm run build:c4` in the
catalog to copy the exact npm versions locked in its package-lock.json.

- `elk.cjs`: unmodified `elkjs@0.12.0/lib/elk.bundled.js`, distributed under
  EPL-2.0 (`elk-LICENSE.txt`). Source: https://github.com/kieler/elkjs/tree/v0.12.0.
- `resvg.mjs`, `resvg.wasm`: unmodified `@resvg/resvg-wasm@2.6.2/index.mjs` and
  `index_bg.wasm`, distributed under MPL-2.0 (`resvg-LICENSE.txt`). Corresponding
  source and dependency manifests: https://github.com/yisibl/resvg-js/tree/v2.6.2.
- `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`: unmodified fonts under the SIL Open
  Font License (`NotoSans-LICENSE.txt`). Source:
  https://github.com/notofonts/noto-fonts/tree/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSans.
  The license comes from `LICENSE` at the same revision. SHA-256:
  - Regular: `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`
  - Bold: `c976e4b1b99edc88775377fcc21692ca4bfa46b6d6ca6522bfda505b28ff9d6a`

The installed package and each run freeze these files with the C4 helper.
