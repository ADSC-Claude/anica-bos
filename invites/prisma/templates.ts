import type { Occasion, Tier } from '@prisma/client';
import { PALETTE_PRESETS, FONT_PRESETS } from '../src/lib/theme';
import type { LookKey } from '../src/lib/looks';
import { builtinDesign, type DesignDoc, type DesignWords } from '../src/lib/design';
import { premiumOpeningsFor } from '../src/lib/premium-openings';

/**
 * Every design the shop sells, as data.
 *
 * The seed creates these on a fresh database and `scripts/sync-templates.ts`
 * upserts them into a database that already has customers — so a new design,
 * a renamed one or a re-pointed opening reaches production without the seed's
 * TRUNCATE anywhere near it. Editing a row here and running the sync is how a
 * design ships.
 *
 * A design marked `retired` stays in the catalogue so the invitations built on
 * it keep rendering, but it is unpublished: off the shop floor, out of the
 * checkout, gone from the gallery.
 *
 * **Nothing is on sale at the moment.** Both shipped designs are retired
 * while the new Canva-sourced ones are made, because two designs built the
 * old way, sitting in the gallery beside the new ones, are two designs to
 * keep explaining and to keep confusing ourselves with. Retired is not
 * deleted and is meant to be undone: the row stays, the document stays, the
 * artwork stays, the demo keeps rendering, and taking the word off this list
 * and running `scripts/sync-templates.ts` puts either of them back on the
 * shop floor exactly as it was.
 */
const pal = (key: string) => PALETTE_PRESETS.find((p) => p.key === key)!.palette;
const fonts = (key: string) => FONT_PRESETS.find((f) => f.key === key)!.fonts;

export type TemplateSeed = {
  slug: string;
  name: string;
  occasion: Occasion;
  minTier: Tier;
  premium?: boolean;
  layout: string;
  /** src/lib/collections.ts. Blank means the design is in no collection. */
  collection?: string;
  /** src/lib/openings.ts. Blank means the design opens with nothing. */
  opening?: string;
  /**
   * A cinematic opening's shared clip and its poster, for a design whose clip
   * is not in the premium catalogue. Both or neither: the poster is the whole
   * closed screen until the guest taps, so a clip without one leaves them on a
   * blank screen while it buffers. A design named in src/lib/premium-openings.ts
   * takes its clip from there instead — see templateData.
   */
  openingVideoUrl?: string;
  openingPosterUrl?: string;
  palette: ReturnType<typeof pal>;
  fonts: ReturnType<typeof fonts>;
  /** src/lib/looks.ts. Set, the look's fonts replace `fonts` and its lines appear under the headings. */
  look?: LookKey;
  /** The design's own words over its look's, per language. See src/lib/design.ts. */
  words?: DesignWords;
  featured: boolean;
  description: string;
  thumb: string;
  /**
   * The slug of the invitation that shows the design off. A visitor may scroll
   * it from the opening to Our Story before choosing (the peek). The gallery
   * offers the peek only where that invitation exists on this design.
   */
  demo?: string;
  /**
   * The document the design ships with, where it has one. Capiz carries its
   * storyline moments this way. The sync writes it only into a row whose
   * column is still empty: a document the studio has published is hers.
   */
  design?: DesignDoc;
  /** Kept for the invitations on it, but not on sale. */
  retired?: boolean;
};

export const TEMPLATES: TemplateSeed[] = [
  // The Filipiniana Collection. Capiz is the flagship: shell, bronze wax and
  // the seal opening, for a wedding that looks like home.
  // The Baby Blue Theme. A christening on the designer's ten grounds: sky and
  // clouds with a dove and the church bell for the cover, a drawn timeline for
  // the story, drawn frames for the baby photos, blue and cream organza for
  // the rest. Its words are a christening's, over the Romance look.
  {
    slug: 'baby-blue', name: 'Baby Blue', occasion: 'CHRISTENING', minTier: 'BASIC', premium: false, layout: 'babyblue', collection: 'babyblue', opening: 'universal',
    palette: pal('babyblue'), fonts: fonts('serif'), look: 'romance', featured: true, retired: true,
    description: 'Sky and clouds, a dove, baby’s breath and blue organza. Made for a christening, soft as a blanket.',
    thumb: '/covers/baby-blue.jpg', demo: 'lucas-andrei-christening',
    words: {
      en: {
        cover: 'The christening of',
        'title:story': 'Our Story', 'title:invitation': 'The Invitation', 'title:sponsors': 'Ninong & Ninang', 'title:gallery': 'Baby Photos', 'title:venue': 'The Venue', 'title:getting': 'Getting There', 'title:dressCode': 'Dress Code & Motif', 'title:gift': 'Gift Request', 'title:program': 'Program', 'title:social': 'Snap & Share', 'title:photos': 'Post Event Photos', 'title:rsvp': 'RSVP', 'title:contact': 'Need Assistance?',
        story: 'A little prayer, a big answer.', invitation: 'Join us as we welcome our little one into God’s family', sponsors: 'With love and guidance', gallery: 'Little moments, big love.', venue: 'Where the blessing happens.', program: 'A day of blessings.', social: 'Help us capture the joy!',
        verse: 'Children are a gift from the Lord; they are a reward from him.', verseRef: 'Psalm 127:3',
        galleryNote: 'small hands, big dreams', galleryClose: 'so much love in every photo',
        dressNote: 'Soft blues and whites would be lovely.', giftThanks: 'Thank you!',
        countdown: 'Counting down to the blessing...', contactNote: 'For any questions, feel free to reach out.',
        closing: 'See you there! ♡', closingMessage: 'Thank you for being part of this blessing. We cannot wait to celebrate with you.',
        photos: 'Share your snaps with us!', photosIntro: 'Upload your photos from the christening.',
      },
      tl: {
        cover: 'Ang binyag ni',
        'title:story': 'Ang Aming Kuwento', 'title:invitation': 'Ang Paanyaya', 'title:sponsors': 'Ninong at Ninang', 'title:gallery': 'Mga Larawan ni Baby', 'title:venue': 'Ang Venue', 'title:getting': 'Papunta Roon', 'title:dressCode': 'Dress Code at Motif', 'title:gift': 'Tungkol sa Regalo', 'title:program': 'Programa', 'title:social': 'Kuha at I-share', 'title:photos': 'Mga Larawan Pagkatapos', 'title:rsvp': 'RSVP', 'title:contact': 'May Tanong?',
        story: 'Isang munting dasal, isang malaking sagot.', invitation: 'Samahan kami sa pagtanggap ng aming anak sa pamilya ng Diyos', sponsors: 'Nang may pagmamahal at gabay', gallery: 'Maliliit na sandali, malaking pagmamahal.', venue: 'Kung saan magaganap ang biyaya.', program: 'Isang araw ng biyaya.', social: 'Tulungan kaming makuha ang saya!',
        verse: 'Ang mga anak ay pamana mula sa Panginoon; sila ay gantimpalang mula sa Kanya.', verseRef: 'Awit 127:3',
        galleryNote: 'maliliit na kamay, malalaking pangarap', galleryClose: 'puno ng pagmamahal ang bawat larawan',
        dressNote: 'Magaganda ang malalamlam na asul at puti.', giftThanks: 'Maraming salamat!',
        countdown: 'Bilang ng araw bago ang binyag...', contactNote: 'Para sa anumang tanong, huwag mag-atubiling magtanong.',
        closing: 'Kita-kits! ♡', closingMessage: 'Salamat sa pagiging bahagi ng biyayang ito. Hindi na kami makapaghintay na makipagdiwang sa inyo.',
        photos: 'I-share ang mga kuha mo!', photosIntro: 'I-upload ang inyong mga larawan mula sa binyag.',
      },
    },
  },
  /**
   * The christening on her own sixteen Canva pages: the first design drawn
   * as artwork first and wired second. Seven pages scroll; nine sit behind
   * the Highlights page in three booklets a guest opens by tapping the
   * envelope, the oval and the sealed RSVP.
   *
   * Not on sale yet. The grounds, the hub and the words are in; the two
   * pull-out gestures her brief asks for — the print out of the instant
   * camera, the card out of the envelope — are not, and a christening that
   * shows a CLICK HERE which does not move is worse than one that waits.
   */
  {
    slug: 'christening', name: 'Baby Blue Christening', occasion: 'CHRISTENING', minTier: 'STANDARD', premium: false,
    layout: 'christening', collection: 'babyblue', opening: 'universal',
    /*
     * No `look`. A look is a palette and a pairing, and `resolveTheme` ends
     * with `if (set) fonts = set.fonts` — so naming one here would throw the
     * christening's own faces away and set the whole design in the look's.
     * It did: every page came out in Lora. The design carries its own words
     * in `words` below, which is the other half of what a look would have
     * given it, so there is nothing left for one to do.
     */
    palette: pal('christening'), fonts: fonts('abhaya-parisienne'), featured: true, retired: true,
    description: 'Clouds, a paper bow and a desk of small things to open. Sixteen pages for a christening, seven to scroll and nine to find.',
    thumb: '/christening/cover.webp', demo: 'lucas-andrei-christening',
    design: builtinDesign('christening')!,
    words: {
      en: {
        cover: 'Christening',
        'title:story': 'Our Story', 'title:invitation': 'CEREMONY', 'title:sponsors': 'GODPARENTS',
        'title:gallery': 'Baby Photos', 'title:venue': 'RECEPTION', 'title:dressCode': 'DRESS CODE',
        'title:gift': 'GIFT NOTE', 'title:program': 'Program', 'title:social': 'SHARE THE JOY',
        'title:rsvp': 'RSVP', 'title:contact': 'QUESTIONS?',
        story: 'A little prayer, a big answer.',
        invitation: 'Join us as we welcome our little one into God’s family',
        galleryNote: 'Mom and Dad love you!', galleryClose: 'You are our greatest blessing!',
        countdown: 'before the big day',
        dressNote: 'Any shade of blue for our guests; cream to beige for the ninongs and ninangs.',
        contactNote: 'Or message us on Messenger.',
        closing: 'SEE YOU THERE!',
        closingMessage: 'Thank you for being part of this blessing. We cannot wait to celebrate with you.',
        giftThanks: 'Our little one is growing fast! If you’d like to bring a gift, clothes or shoes for a 1-year-old, or a monetary gift for their savings, would be greatly appreciated.',
      },
      tl: {
        cover: 'Binyag',
        'title:story': 'Ang Aming Kuwento', 'title:invitation': 'SEREMONYA', 'title:sponsors': 'NINONG AT NINANG',
        'title:gallery': 'Mga Larawan ni Baby', 'title:venue': 'SALU-SALO', 'title:dressCode': 'DRESS CODE',
        'title:gift': 'TUNGKOL SA REGALO', 'title:program': 'Programa', 'title:social': 'I-SHARE ANG SAYA',
        'title:rsvp': 'RSVP', 'title:contact': 'MAY TANONG?',
        story: 'Isang munting dasal, isang malaking sagot.',
        invitation: 'Samahan kami sa pagtanggap ng aming anak sa pamilya ng Diyos',
        galleryNote: 'Mahal ka nina Mama at Papa!', galleryClose: 'Ikaw ang aming pinakamalaking biyaya!',
        countdown: 'bago ang malaking araw',
        dressNote: 'Anumang kulay asul para sa mga bisita; cream hanggang beige para sa mga ninong at ninang.',
        contactNote: 'O mag-message sa amin sa Messenger.',
        closing: 'KITA-KITS!',
        closingMessage: 'Salamat sa pagiging bahagi ng biyayang ito. Hindi na kami makapaghintay na makipagdiwang sa inyo.',
        giftThanks: 'Mabilis lumaki ang aming munting anak! Kung nais ninyong magdala ng regalo, damit o sapatos para sa 1-taong-gulang, o salapi para sa kanyang ipon, labis naming ikagagalak.',
      },
    },
  },
  { slug: 'capiz', name: 'Capiz', occasion: 'WEDDING', minTier: 'STANDARD', premium: false, layout: 'capiz', collection: 'filipiniana', opening: 'universal', palette: pal('capiz'), fonts: fonts('capiz'), look: 'heritage', featured: true, retired: true, description: 'Capiz shell and bronze wax. Your guest taps the seal and it unfolds. Made for a wedding that looks like home.', thumb: '/covers/capiz.jpg', demo: 'juan-and-maria', design: builtinDesign('capiz')! },
];

/** The Prisma payload for one row. `sortOrder` is its position in the list. */
export function templateData(t: TemplateSeed, sortOrder: number) {
  // The design's default premium opening: the first clip the catalogue lists
  // for it. It is what the gallery previews and what an invitation plays
  // before its owner picks another, so adding a clip there is enough.
  // A seed row has no opening columns of its own — those are filled in the
  // admin, for a design drawn in the studio — so only a catalogue clip can
  // be the default here, which is what the two seeded designs have.
  const clip = premiumOpeningsFor({ slug: t.slug, collection: t.collection ?? '', name: t.name, openingVideoUrl: '', openingPosterUrl: '' })[0];
  return {
    slug: t.slug,
    name: t.name,
    occasion: t.occasion,
    minTier: t.minTier,
    premium: t.premium ?? false,
    layout: t.layout,
    collection: t.collection ?? '',
    opening: t.opening ?? '',
    openingVideoUrl: clip ? clip.video : t.openingPosterUrl ? t.openingVideoUrl ?? '' : '',
    openingPosterUrl: clip ? clip.poster : t.openingPosterUrl ?? '',
    palette: t.palette as never,
    fonts: t.fonts as never,
    look: t.look ?? '',
    words: (t.words ?? {}) as never,
    sections: [] as string[],
    featured: t.featured,
    description: t.description,
    thumbnailUrl: t.thumb,
    demoSlug: t.demo ?? '',
    // only where the catalogue ships one: a row with no document of its own is left as the studio finds it
    ...(t.design ? { design: t.design } : {}),
    sortOrder,
    published: !t.retired,
  };
}
