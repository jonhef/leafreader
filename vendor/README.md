# Pinned reading engines

- **Foliate JS**: https://github.com/johnfactotum/foliate-js/tree/78914aef4466eb960965702401634c2cb348e9b1 — MIT. Top-level JS modules are vendored. Leaf modifies view.js: its generic makeBook/file/URL loaders are removed; books must pass through src/engines/text.js validation. No upstream demo, images, or other book formats are packaged.
- **DjVu.js**: https://github.com/RussCoder/djvujs/tree/eca3e69c966f3b7fcf0453f39029bc1e409fea8a — library/src under GPL-2.0-or-later, original sources unmodified. LICENSE.md and GNU_GPL_v2 retain original notices. pngjs is resolved to the locked 7.0.0 release. Leaf's worker adapter is separate.
- The older npm djvujs-dist 0.5.4 has different license wording and is intentionally **not** a dependency.
- Sources were retrieved on 2026-11-16. Exact npm versions and integrity hashes are in package-lock.json.

Local modifications to vendor code must be listed here. Keep all license files when distributing source.
