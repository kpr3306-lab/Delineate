/**
 * What changed since the last deployed version (shown in Customise → What's new).
 * When you ship: bump APP_VERSION, add a new release at the top, keep older ones below.
 */
export const APP_VERSION = '1.3.0';

export type Release = {
  version: string;
  date: string;
  title: string;
  areas: { name: string; items: string[] }[];
};

export const CHANGELOG: Release[] = [
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
          'Opens faster: each tab now loads on its own, and the rest are fetched quietly in the background so everything still works offline.',
          'Ten new frames in Process and Art Lab: Negative strip, Date imprint, Photo corners, Scalloped edge, Linen mat, Torn paper, Caption strip, Fine art, Photo booth and Washi tape.',
          'Process → Crop: drag the corners or edges of the grid to resize the frame and drag the photo to line it up. A new Free shape allows any proportions.',
          'Each Pocket Digital body now wears its own finish: silver, cobalt, rose copper, crimson, ice teal, cream, piano black and sage.',
          'The camera description moved into a small ⓘ button, and the Digi body wheel perches on the camera\'s top edge.',
        ],
      },
      {
        name: 'Archive & data',
        items: [
          'Smaller thumbnails — three to a row on phones — so the roll is quick to scroll.',
          'Tap a photo to open it full screen: swipe or use the arrows to move through the roll, and Edit, Art, Album, Save or Delete from there. The ⓘ button shows its date, time, camera, look, size and location.',
          'Location tags (Customise → Data, off by default): new camera shots remember where they were taken.',
          'Imported photos keep the date and place they were taken, read from the file itself (JPEG).',
          'Pinch, double-tap or scroll to zoom into a photo in the viewer; drag to look around.',
          'Select several frames at once to add them to an album, download them as a .zip or delete them — and Undo a delete for a few seconds afterwards.',
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
