/**
 * Narrow topics for each category. Asked for "Geography" with a list of what to
 * avoid, the small writer models keep returning to the same famous facts; asked
 * for "rivers of Africa", they write something new. Each generate call gets a
 * few of these, least-covered first (`pickTopics` in `questionMemory.ts`).
 *
 * Add topics freely: the app never sees these names. Keep them specific enough
 * that a model can't answer with the category's most famous facts.
 */
import "server-only";

export const TOPICS: Record<string, string[]> = {
  general_knowledge: [
    "national symbols of countries", "world currencies", "famous books and their authors", "Indian authors and novels",
    "international organizations and their headquarters", "important national and international days", "Bharat Ratna and Padma awards",
    "Nobel Prize winners", "famous landmarks of the world", "monuments of India", "national animals and birds",
    "flags of the world", "official languages of countries", "inventors and their inventions", "famous nicknames of cities",
    "Indian postal and railway facts", "Indian rupee and banking", "food and spices of the world", "world religions and their festivals",
    "famous paintings and painters", "musical instruments", "units and measures", "newspapers and magazines",
    "famous bridges, dams and tunnels", "Olympic Games history", "traditional sports of India", "human languages and scripts",
    "mythological characters", "Indian government institutions", "world record holders in nature",
  ],
  bollywood: [
    "film dialogues", "film directors of the 1950s to 1970s", "directors of the 2000s onward", "lead actors of the 1970s and 1980s",
    "actresses of Hindi cinema", "playback singers", "lyricists", "music directors", "classic black and white films",
    "songs and the films they are from", "biopics", "film history and firsts", "Filmfare Awards", "National Film Awards",
    "actor debuts", "famous film roles and character names", "film remakes", "film sequels and franchises", "sports films",
    "patriotic films", "comedy films", "villains of Hindi cinema", "dance sequences and choreographers", "film studios and banners",
    "star family relationships", "films based on novels", "Indian entries to the Oscars", "item songs and title tracks",
    "parallel cinema", "films set outside India",
  ],
  cricket: [
    "World Cup finals", "T20 World Cup", "rules and laws of cricket", "player nicknames", "IPL teams and titles", "IPL records",
    "historic matches", "cricket terminology", "cricket firsts", "cricket stadiums of the world", "fielding positions",
    "Test cricket history", "Ranji Trophy and Indian domestic cricket", "women's cricket", "wicketkeepers", "fast bowlers",
    "spin bowlers", "all-rounders", "India team captains", "Australian cricketers", "English cricketers",
    "Pakistani and Sri Lankan cricketers", "West Indian cricketers", "South African and New Zealand cricketers", "the Ashes",
    "bilateral trophies and their names", "Under-19 World Cup", "umpires and technology such as DRS", "batting records", "bowling records",
  ],
  science: [
    "mechanics and motion", "electricity and magnetism", "optics and light", "heat and thermodynamics", "sound and waves",
    "atoms and nuclear physics", "the periodic table", "acids, bases and salts", "metals and alloys", "organic chemistry",
    "chemical formulas of everyday substances", "cell biology", "genetics and DNA", "plants and photosynthesis", "animal kingdom classification",
    "human digestive and circulatory systems", "human nervous system and senses", "vitamins and nutrition", "diseases and their causes",
    "vaccines and medicine discoveries", "ecology and food chains", "weather and atmosphere", "rocks and minerals", "scientific instruments",
    "units of measurement", "famous scientists of Europe", "women in science", "Indian scientists", "mathematics and famous theorems",
    "materials used in daily life",
  ],
  history: [
    "the Indus Valley Civilization", "the Vedic period", "the Maurya Empire", "the Gupta Empire", "South Indian dynasties",
    "the Delhi Sultanate", "the Mughal Empire", "the Marathas", "the Sikh Empire", "the East India Company", "the 1857 uprising",
    "the Indian freedom struggle", "Indian freedom fighters", "the Constitution of India", "independent India since 1947",
    "ancient Egypt", "ancient Greece", "ancient Rome", "ancient China", "the Persian Empire", "medieval Europe", "the Crusades",
    "the Renaissance", "the French Revolution", "the American Revolution", "World War I", "World War II", "the Cold War",
    "world leaders of the 20th century", "explorers and voyages", "colonial Africa and Asia",
  ],
  geography: [
    "rivers of Africa", "rivers of Asia", "rivers of Europe and the Americas", "lakes of the world", "European capitals",
    "Asian capitals", "African capitals", "capitals of the Americas and Oceania", "oceans and seas", "straits and canals",
    "deserts of the world", "mountain ranges of the world", "highest peaks", "volcanoes", "islands and archipelagos",
    "continents and their extremes", "countries and their borders", "latitudes, longitudes and time zones", "climate zones and winds",
    "soil types and crops of India", "minerals and mines of India", "Indian states and capitals", "Indian rivers and their tributaries",
    "Indian passes and hill stations", "Indian coastline and ports", "Indian dams and multipurpose projects", "national parks of India",
    "national parks of the world", "famous waterfalls", "world population and cities", "major world ports and airports",
  ],
  technology: [
    "computer abbreviations", "inventions and inventors", "internet history", "web protocols", "tech company founders",
    "tech company acquisitions", "Indian technology companies", "Indian digital services such as UPI and Aadhaar", "digital security terms",
    "computing history", "programming languages and their creators", "mobile phones and telecom", "generations of mobile networks",
    "operating systems", "computer hardware and memory", "processors and chip makers", "databases", "networking devices",
    "artificial intelligence milestones", "robotics", "video games and consoles", "social media platforms", "open source software",
    "file formats", "data storage units", "search engines and browsers", "e-commerce companies", "electric vehicles and batteries",
    "satellites and GPS", "cameras and displays",
  ],
  indian_culture: [
    "classical dance forms", "folk dances of states", "festivals of North India", "festivals of South India", "festivals of East and Northeast India",
    "tribal art forms", "painting styles such as Madhubani and Warli", "the Ramayana", "the Mahabharata", "Sanskrit literature",
    "regional language literature", "Hindustani classical music", "Carnatic classical music", "musical instruments and their maestros",
    "regional cuisine", "sweets and street food", "languages and scripts of India", "martial arts of India", "temples of South India",
    "temples of North and East India", "forts and palaces", "stepwells and cave architecture", "textiles and sarees", "handicrafts and GI tags",
    "UNESCO heritage sites in India", "pilgrimage sites", "fairs and melas", "traditional attire and jewellery", "puppetry and folk theatre",
    "saints and spiritual teachers",
  ],
  space: [
    "the inner planets", "the outer planets", "moons of the solar system", "the Sun and solar activity", "astronauts and cosmonauts",
    "women in space", "galaxies", "stars and stellar evolution", "black holes", "Apollo missions", "Mars rovers and missions",
    "Voyager and deep space probes", "space shuttles", "the International Space Station", "ISRO launch vehicles", "Chandrayaan and Mangalyaan",
    "Indian satellites", "Indian astronauts and Gaganyaan", "dwarf planets", "space physics and orbits", "constellations",
    "comets and meteor showers", "space telescopes", "observatories on Earth", "asteroids", "exoplanets", "the history of astronomy",
    "famous astronomers", "cosmology and the Big Bang", "private spaceflight companies",
  ],
};
