# Test corpus

Run npm run fixtures to regenerate small synthetic EPUB, PDF and DjVu documents.
All prose, page patterns and synthetic documents in generated/ were created for this project and are under MIT. The DjVu encoder is a build-time tool from the pinned upstream library; resulting page art is original.

Fonts in fonts/ are Source Serif 4 Regular from Adobe's source-serif release branch:
- https://github.com/adobe-fonts/source-serif/tree/release/TTF
- https://github.com/adobe-fonts/source-serif/tree/release/OTF

The SIL OFL license is retained next to the fonts. Font fixtures are not shipped in the app.
This small corpus proves basic behavior; it is not a compatibility corpus of arbitrary real-world books.
