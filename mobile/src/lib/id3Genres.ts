/**
 * The ID3v1 genre table.
 *
 * v2.3 taggers frequently wrote `TCON` as a reference into this list — `(31)`
 * or a bare `31` — rather than as a name. Showing "31" in a details panel is
 * noise, so the reference is resolved here. Entries past 79 came from Winamp
 * and were adopted by every tagger that followed, so they are worth keeping
 * even though ID3v1 itself never defined them.
 */

const GENRES: readonly string[] = [
  "Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge",
  "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B",
  "Rap", "Reggae", "Rock", "Techno", "Industrial", "Alternative", "Ska",
  "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient",
  "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical",
  "Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise",
  "Alternative Rock", "Bass", "Soul", "Punk", "Space", "Meditative",
  "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave",
  "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream",
  "Southern Rock", "Comedy", "Cult", "Gangsta", "Top 40", "Christian Rap",
  "Pop/Funk", "Jungle", "Native American", "Cabaret", "New Wave",
  "Psychedelic", "Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal",
  "Acid Punk", "Acid Jazz", "Polka", "Retro", "Musical", "Rock & Roll",
  "Hard Rock", "Folk", "Folk-Rock", "National Folk", "Swing", "Fast Fusion",
  "Bebob", "Latin", "Revival", "Celtic", "Bluegrass", "Avantgarde",
  "Gothic Rock", "Progressive Rock", "Psychedelic Rock", "Symphonic Rock",
  "Slow Rock", "Big Band", "Chorus", "Easy Listening", "Acoustic", "Humour",
  "Speech", "Chanson", "Opera", "Chamber Music", "Sonata", "Symphony",
  "Booty Bass", "Primus", "Porn Groove", "Satire", "Slow Jam", "Club",
  "Tango", "Samba", "Folklore", "Ballad", "Power Ballad", "Rhythmic Soul",
  "Freestyle", "Duet", "Punk Rock", "Drum Solo", "A cappella", "Euro-House",
  "Dance Hall", "Goa", "Drum & Bass", "Club-House", "Hardcore", "Terror",
  "Indie", "BritPop", "Negerpunk", "Polsk Punk", "Beat",
  "Christian Gangsta Rap", "Heavy Metal", "Black Metal", "Crossover",
  "Contemporary Christian", "Christian Rock", "Merengue", "Salsa",
  "Thrash Metal", "Anime", "Jpop", "Synthpop", "Abstract", "Art Rock",
  "Baroque", "Bhangra", "Big Beat", "Breakbeat", "Chillout", "Downtempo",
  "Dub", "EBM", "Eclectic", "Electro", "Electroclash", "Emo",
  "Experimental", "Garage", "Global", "IDM", "Illbient", "Industro-Goth",
  "Jam Band", "Krautrock", "Leftfield", "Lounge", "Math Rock", "New Romantic",
  "Nu-Breakz", "Post-Punk", "Post-Rock", "Psytrance", "Shoegaze",
  "Space Rock", "Trop Rock", "World Music", "Neoclassical", "Audiobook",
  "Audio Theatre", "Neue Deutsche Welle", "Podcast", "Indie Rock",
  "G-Funk", "Dubstep", "Garage Rock", "Psybient",
];

export const ID3_GENRE_COUNT = GENRES.length;

/**
 * Turns a `TCON` value into something readable.
 *
 * Handles the three shapes taggers produce: a plain name (`Trance`), a numeric
 * reference (`31`, `(31)`), and a refinement that appends a free-text genre to
 * a reference (`(31)Goa Trance`, or `(RX)` / `(CR)` for "Remix" / "Cover").
 * Anything unresolvable is returned trimmed rather than dropped — a raw value
 * is still information, and inventing a name would not be.
 */
export function resolveGenre(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parts: string[] = [];
  let rest = trimmed;

  while (rest.startsWith("(")) {
    const close = rest.indexOf(")");
    if (close === -1) {
      break;
    }
    const token = rest.slice(1, close).trim();
    const named = genreName(token);
    if (named !== null) {
      parts.push(named);
    }
    rest = rest.slice(close + 1);
  }

  const tail = rest.trim();
  if (tail.length > 0) {
    parts.push(tail);
  }

  if (parts.length === 0) {
    // The whole value was a reference, and none of them resolved.
    const named = genreName(trimmed);
    return named;
  }

  return parts.join(" / ");
}

function genreName(token: string): string | null {
  if (token.toUpperCase() === "RX") {
    return "Remix";
  }
  if (token.toUpperCase() === "CR") {
    return "Cover";
  }
  if (!/^\d{1,3}$/.test(token)) {
    return token.length > 0 ? token : null;
  }
  return GENRES[Number.parseInt(token, 10)] ?? null;
}
