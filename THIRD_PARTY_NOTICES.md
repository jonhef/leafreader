# Licenses and source distribution

The original Leaf Reader code and documentation remain under MIT (LICENSE). This does not license third-party code as MIT.

The combined application includes DjVu.js, used under the GPL-3.0 option granted by its GPL-2.0-or-later license. **The combined distribution is subject to GPL-3.0 (COPYING)**, with the original MIT/Apache/BSD notices retained. Do not describe the complete binary as MIT-only.

| Component | Exact source/version | License |
| --- | --- | --- |
| Capacitor core, iOS, Android | npm 8.6.2 | MIT |
| Foliate JS | commit 78914aef4466eb960965702401634c2cb348e9b1 | MIT |
| DjVu.js library | commit eca3e69c966f3b7fcf0453f39029bc1e409fea8a | GPL-2.0-or-later; GPL-3.0 selected |
| PDF.js | pdfjs-dist 6.5.438 | Apache-2.0; additional bundled font/codec notices retained |
| zip.js | 2.25.0 | BSD-3-Clause |
| pngjs | 7.0.0 | MIT |
| Source Serif 4 fixtures | Adobe release branch, TTF/OTF Regular | SIL OFL 1.1; tests only |
| AndroidX / Android build dependencies | versions in Gradle files | retain the licenses of each included component before public release |

Sources: [DjVu.js license at the pinned commit](https://github.com/RussCoder/djvujs/blob/eca3e69c966f3b7fcf0453f39029bc1e409fea8a/LICENSE.md), [Apache/GPLv3 compatibility](https://www.apache.org/licenses/GPL-compatibility).

The old npm DjVu package was removed after checking its license text. Do not silently substitute that package for the pinned sources.

scripts/vendor.mjs copies license texts into the application. Full reading-engine source retained in vendor/, dependency versions and integrity hashes retained in package-lock.json; upstream PDF.js source is at https://github.com/mozilla/pdf.js (match the pdfjs-dist version), Capacitor at https://github.com/ionic-team/capacitor.

Before public binary distribution, assemble and offer the complete corresponding source, build instructions and all required third-party notices, including native transitive dependencies. The development archive is for local evaluation; it is not a certification that store distribution requirements are met. App Store distribution remains a separate release check because of GPL and store terms. No automatic store publishing is configured.
