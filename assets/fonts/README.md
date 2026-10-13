# Results card fonts

The results card (`app/api/sessions/[id]/card`) draws text with these files, because the image renderer can't use the app's web fonts. They are cut-down copies of the app's own faces, both under the SIL Open Font License (licence files alongside):

- `Barlow-SemiBold.ttf`, `Barlow-Bold.ttf`: Barlow 600 and 700.
- `BigShoulders-Black.ttf`: a static instance of the Big Shoulders variable font at `wght` 900 and `opsz` 72 (the renderer ignores variation axes and would draw the 100 default).

Made with fontTools 4.54.1 (2026-10-13):

```
fonttools varLib.instancer BigShoulders.ttf wght=900 opsz=72 -o bs900.ttf
pyftsubset <font> --unicodes="U+0020-007E,U+00A0-024F,U+2010-2027,U+2030-203A,U+2190-2193,U+2212,U+20B9" --layout-features='kern,liga,tnum,lnum' --no-hinting
```

Barlow has no arrow glyphs, so the card writes "to" rather than "→".
