# Showcase phone clips

Drop the per-step phone videos here. The scroll-pinned showcase on the landing
plays one clip per feature; until a file exists, the HTML mockup is shown as a
fallback (nothing looks broken).

Expected files (filename = step key):

| Step        | Video             | Poster (optional)  |
| ----------- | ----------------- | ------------------ |
| Meniu       | `meniu.mp4`       | `meniu.jpg`        |
| Facturare   | `facturare.mp4`   | `facturare.jpg`    |
| Cheltuieli  | `cheltuieli.mp4`  | `cheltuieli.jpg`   |
| Rapoarte    | `rapoarte.mp4`    | `rapoarte.jpg`     |

Recommendations
- Aspect ratio ~ **286 × 590** (the phone screen). The video is `object-fit: cover`.
- Keep them short, **muted, looping** screen recordings; H.264 MP4, a few MB each.
- Only the **active** clip is fetched + played (lazy), and all clips pause when
  the section scrolls off-screen — so adding 4 short clips is cheap.
- A `.jpg` poster (first frame) makes the swap look instant before the clip loads.
