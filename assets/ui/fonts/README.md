# Interface fonts

Inter and Big Shoulders Display are bundled locally, without requests to a font service. Both use the SIL Open Font License; their original license texts are adjacent.

Sources retrieved from the Google Fonts repository on 2026-11-02:

- https://github.com/google/fonts/tree/main/ofl/inter — `Inter[opsz,wght].ttf`
- https://github.com/google/fonts/tree/main/ofl/bigshouldersdisplay — `BigShouldersDisplay[wght].ttf`

The font bytes are unchanged; filenames omit brackets for build-tool portability. Inter carries body copy and tabular readings; Big Shoulders Display carries headings and instrument values.

Production builds include both copyright/license texts under `dist/licenses/`, alongside the distributed font assets.
