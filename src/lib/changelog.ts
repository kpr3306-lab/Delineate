/**
 * What changed since the last deployed version (shown in Customise → What's new).
 * When you ship: bump APP_VERSION, add a new release at the top, keep older ones below.
 */
export const APP_VERSION = '1.4.0';

export type Release = {
  version: string;
  date: string;
  title: string;
  areas: { name: string; items: string[] }[];
};

export const CHANGELOG: Release[] = [
  {
    version: '1.4.0',
    date: 'Nov 2026',
    title: 'Studio, frames and print',
    areas: [
      {
        name: 'Studio & print (new)',
        items: [
          'The Art Lab is now the Studio, with Art and Frames side by side.',
          'Frames is made for printing: pick a print size — wallet, 3.5×5, 4×6, 5×7, 6×8, 8×10, square, passport, A6, A5 — or type your own in inches or cm. The photo is cropped so the framed print comes out exactly that size.',
          'Print sheet: add prints of different photos and sizes, set copies, paper (A4, Letter, A3, 4×6 or 5×7 photo paper), margins, gaps and cut marks, and download one PDF that prints at true size.',
          '36 frames in five families — Film, Prints, Gallery, Scrapbook and Experimental — including Negative strip, Date imprint, Contact sheet, Scalloped edge, Linen mat, Torn paper, Photo corners, Embossed, Fine art, Caption strip, Hairline, Double line, Asymmetric, Soft corner, Washi tape and paper, Postcard, Photo booth, Passport, VHS overlay and Newspaper.',
          'Write your own caption, headline, message, title or name on the frames that have room for one.',
          'Adjust frame thickness and paper colour, star favourite frames, and save frame recipes to reuse.',
          'Edit opens the full Process editor right inside Frames; save or discard to come back to your print. The original photo is never changed.',
          'Frame a photo straight from the viewer (Frame), or a collage right after saving it (Frame it).',
          'Drag the photo in the print preview to choose what stays in the crop.',
          'Greeting cards, rebuilt: A5 or A6, five templates (Photo + words, Folded, Ornate, Postcard, Full photo), ten borders (doodle, floral, art deco, scallop, confetti, washi tape, postage stamp and more), your own heading, message and sign-off in five fonts, paper and ink colours, and stickers — emojis, decorations or your own image — that you drag into place; tap a sticker for its own menu (smaller, bigger, turn, duplicate, bring to front, delete). Drag the photo to position it in its slot, and zoom it. Live preview, undo, print-ready PDF, save or share the front.',
          'Photo calendar editor: four layouts (Classic, Full photo, Polaroid, Minimal), boxes, clean or circled dates, month names in serif, script or sans, an accent colour, A4, A5, Letter or A3, and a photo for every month that you drag and zoom into place — with a live preview, undo and an automatic fill from your favourites.',
          'More to print: a contact sheet of a whole roll, and a printer test page with numbered rulers that corrects your printer across and down so prints come out true to size.',
          'Your signature on the photo: a watermark with your own text, font, corner, size and strength (Process and Studio › Frames).',
          'Share any print or photo straight to WhatsApp, Instagram, AirDrop and more, on phones that support it.',
        ],
      },
      {
        name: 'Process',
        items: [
          'The same frames, thickness, paper colours, favourites and recipes as the Studio.',
          'Undo and redo (buttons under the photo, or Ctrl Z / Ctrl Shift Z) — here and in Studio › Frames.',
          'Crop: drag the corners or edges of the grid to resize the frame, drag the photo to line it up. New Free shape for any proportions.',
        ],
      },
      {
        name: 'Archive & viewer',
        items: [
          'Smaller thumbnails — three to a row on phones — so the roll is quick to scroll.',
          'Tap a photo to open it full screen: swipe or use the arrows, pinch, double-tap or scroll to zoom, rename it from its title, and Edit, Art, Frame, Album, Save or Delete from there.',
          'Details (ⓘ): date, time, camera, look, settings, size and location.',
          'Imported photos keep the date and place they were taken, read from the file itself (JPEG). Location tags for new camera shots are in Customise → Data (off by default).',
          'Select several frames at once to add them to an album, save them as a .zip or delete them — and Undo a delete for a few seconds afterwards.',
          'Tidy up: find near-duplicate photos and the largest files, and clear them out (with Undo).',
          'Very large photos (48–200 MP) are worked on through a 4096 px copy so phones never run out of memory; the full-resolution original is kept for downloads and backups.',
        ],
      },
      {
        name: 'Camera & app',
        items: [
          'Delineate camera controls, refined: the PRO dial has a chrome bezel with a warm glow, a turning tick scale and lit markers; the EV control is a ruler with a brushed-metal knob whose ticks glow around it; a zoom thumbwheel in the body between the screen and the shutter (roll it up or down; double-tap for 1×); the power switch centred between the selfie flip and the shutter; milled grooves on both right-hand corners; more room between the power switch and selfie flip.',
          'Delineate camera: once powered up, the selfie flip and the zoom wheel light in neon cyan; settings open as a sheet over a third of the screen on phones (a side panel on laptops) and the expert dials as a compact sheet, so the viewfinder stays in view.',
          'Digi cameras on laptops now sit just below the collection dial instead of touching it.',
          'Fix: the shutter ring and power lamp now always go back from green to their normal colour after a photo.',
          'Delineate camera: every control now sits in its own milled pocket with a real gap; a two-part rocker power switch that glows when on; a fluted sunburst shutter with the light ring in its gap; the Delineate signature engraved on the shoulder; deeper light and shadow on all three finishes. New full-view button (⤢) hides the app around the camera — tap it again or press back to leave.',
          'New default camera — Delineate ALLOY 01 in Silver, Graphite and Gold: brushed, machined body; a light ring round the shutter that flashes green with the power lamp at every shot; the Delineate mark opens your photos; an EV slider and aspect-ratio shortcut in the top ribbon; PRO expert dials for ISO, shutter and aperture; a settings panel that unfolds from the gear; and a start-up where the logo spins a full turn as the iris opens.',
          'Each Pocket Digital body wears its own finish: silver, cobalt, rose copper, crimson, ice teal, cream, piano black and sage.',
          'The camera description lives in a small ⓘ button; the Digi body wheel perches on the camera\'s top edge; the Digi shutter stays round on small phones.',
          'New Retro Future theme: indigo night, sunset magenta and neon cyan.',
          'On narrow phones the tab bar becomes two snapping pages of four, so labels stay readable; filter and tab pills wrap flush on small screens.',
          'Opens faster: each tab loads on its own, and the rest are fetched quietly in the background so everything still works offline.',
          'Backup reminders: a gentle nudge when photos have never been backed up or it has been a month — and Customise › Data shows your last backup.',
          'If something ever goes wrong inside a tab, it shows a calm message with Try again instead of a blank screen. Your photos are never affected.',
          'The ? guide now explains how to install Delineate on iPhone and Android.',
          'Fixes: 16:9 on iPhone no longer spills past the screen; the sideways (rotated) layout on Android no longer squeezes the buttons; app icons refresh after an update.',
        ],
      },
    ],
  },
  {
    version: '1.3.0',
    date: 'Nov 2026',
    title: 'Memories: passport, capsules, gallery, wall and yearbook',
    areas: [
      {
        name: 'Memories (new tab)',
        items: [
          'Camera Passport — a stamp for every camera you have shot with, your most-loved body and favourite look; tap a stamp to pick that camera up again.',
          'Rediscover — opt-in Forgotten Frames shows a random handful of five older, unfavourited photos each day, one at a time (keep close, add to an album, or not now); draw a few more whenever you like. Plus On This Day.',
          'Time Capsules — seal photos and a note until a date you choose; they stay hidden until then.',
          'Gallery — favourites, albums and each year hung as a lit gallery wall, with a slideshow and full screen.',
          'Memory Wall — pin photos, notes, dates and ticket stubs on cork, linen, slate or paper; drag, resize, rotate, and save the board as an image.',
          'Yearbook — a year of photos laid out by month with a cover and a year-in-numbers page, previewed and exported as a PDF.',
        ],
      },
      {
        name: 'Camera',
        items: [
          'The keypad phones are redrawn as detailed copies of the originals, cut off and faded just past the second keypad row so the screen can be bigger. Every key is a real button that presses in.',
          'On wide screens the phones lie on their side; the Options / Gallery labels now turn with the phone and sit beside the softkeys.',
          'The RAZR keypad is a darker gunmetal with soft blue backlighting; the 6600 joystick sits on its trapezium plateau.',
          'Collections are chosen with a knurled metal rotary dial instead of a drop-down.',
        ],
      },
      {
        name: 'Archive & data',
        items: [
          'Albums: create, rename and delete albums, and add any frame to one or more of them.',
          'Customise → Data: see what is stored and how much space it uses, protect storage from being cleared, download a full backup (.zip) and restore it on any device — restores are checked first and never delete anything.',
          'Fixes: archive card actions no longer cover the favourite heart on small phones; zoom ring and pixel-camera A/B buttons no longer touch.',
        ],
      },
    ],
  },
  {
    version: '1.2.0',
    date: 'Nov 2026',
    title: 'A camera collection and an advanced darkroom',
    areas: [
      {
        name: 'Camera',
        items: [
          'Five collections to pick from: Digi Cam (the original six), Retro Mobile, Pocket Digital, Film & Instant and Experimental — 30 bodies in all.',
          'Every body has its own button layout and its own sounds: keypad tones on the phones, AF beeps on the compacts, tape clunks on the camcorders, chiptune on the pixel camera.',
          'Each model shoots with its own look, live in the viewfinder: VGA phone sensors, VHS colour bleed and timestamps, four-shade pixel dithering, blocky webcam JPEGs, dreamy toy-camera edges.',
          'Instant cameras print a framed photo; film cameras with a lever or thumbwheel must be wound on before the next shot.',
          'Playback now browses your whole gallery: W/T, the arrow keys, ◀ ▶, tape rewind/fast-forward or a swipe on the screen.',
          'Realistic bodies: brushed metal, gloss plastic, leatherette and glass with real depth. Phones lie on their side on wide screens and stand upright on phones, cropped close to the keys you use; each compact arranges its keys like its namesake; instant cameras show the live view as the print.',
          'A settings menu on every body (flash, timer, frame, grid, white balance, multi exposure, date imprint) that also jumps to any tab.',
        ],
      },
      {
        name: 'Develop',
        items: [
          'New Advanced darkroom beside the standard one: exposure, highlights, shadows, whites, blacks, temperature, tint, vibrance, HSL, tone curves, split toning, bloom and halation.',
          'Undo/redo, a before/after split, hold-to-see-original, and copy/paste of chosen adjustment groups.',
          'Recipe Lab: starter looks, save your own, rename, duplicate, reorder, favourite, and import/export as a file.',
          'Edits are non-destructive: the original and the edit settings are stored, so you can reopen any print and keep editing.',
        ],
      },
      {
        name: 'Process',
        items: [
          'Strip cam effects: remove a camera body’s built-in look (colour, sensor resolution, pixel/tape effects, date imprint, print frame) and edit the clean capture instead. Tap again to bring the look back.',
        ],
      },
    ],
  },
  {
    version: '1.1.0',
    date: 'Nov 2026',
    title: 'Crop, stamps, cover photos and a much deeper Art Lab',
    areas: [
      {
        name: 'Process',
        items: [
          'Crop tab: rotate, flip, straighten and zoom, with Square, Portrait, 4:3, 16:9 and Letterbox shapes. Drag the photo to reposition it.',
          'Highlights, Shadows and Sharpen sliders, plus fine / medium / coarse grain.',
          'Save your own presets in the Mine tab: name them, star favourites, reuse them on any print.',
          'Dust and scratch overlays under Effects → Film damage.',
          '8 new frames: SX-70, slide mount, deckle print, floating print, black mat, modern black, postage stamp and airmail. Polaroid-style frames take a handwritten caption.',
          '8 new date stamps: 90s LED, digicam, label tape, handwritten, editorial and a REC viewfinder. Pick the corner, the colour and the date (one tap for ’98).',
          'Hold to compare now shows a Before tag and never gets stuck on phones.',
        ],
      },
      {
        name: 'Journal',
        items: [
          'Upload your own cover photo; it shows on the bookshelf too. Any page can have a background photo, faded into the page colour.',
          'Book style restyles every page at once without moving anything.',
          '10 new themes, 5 new papers (gingham, parchment, newsprint, linen, blueprint), film / stamp / shadow photo styles and two new layouts.',
        ],
      },
      {
        name: 'Collage',
        items: ['Add emoji, stickers, doodles and text boxes on top. Drag to move, scroll to resize, rotate and recolour.'],
      },
      {
        name: 'Art Lab',
        items: [
          'Geometric is much finer: shapes take the true colour of their area, split smaller where the photo is busy, and the export matches the preview.',
          '10 shapes: facets, blocks, mosaic, hexagons, diamonds, low-poly, stained glass, orbs, halftone and engraving.',
          'Use the photo’s own colours or 4 new palettes. Pixel study gets Game Boy, PICO-8, CGA, 1-bit and Riso palettes and dot / brick pixels. Abstract adds ripple, kaleidoscope and marble.',
        ],
      },
      {
        name: 'Customise',
        items: [
          'Settings are now organised into tabs.',
          'Button sound packs: classic, retro, modern, typewriter, bubble and wooden.',
          'Clicky detents for tactile faders and knobs, which you can turn off.',
          'New themes: Sage, Midnight and a high-contrast black & white. Paper grain can be switched off.',
        ],
      },
      {
        name: 'Fixes',
        items: [
          'Scrolling on a phone no longer nudges sliders by accident.',
          'Dark themes: messages, archive buttons and photo labels are readable again.',
          'Bookshelf books line up properly, and the Develop roll label no longer overlaps.',
          'The logo’s lens is centred.',
        ],
      },
    ],
  },
];
