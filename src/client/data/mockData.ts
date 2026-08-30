export interface JournalPhoto {
  id: string;
  url: string;
  caption?: string;
  aspect?: string;
}

export interface JournalWeather {
  temp: string;
  condition: string;
  icon: "sun" | "cloud-sun" | "rain" | "wind" | "moon";
}

export interface JournalMood {
  label: string;
  emoji: string;
}

export interface JournalMessage {
  id: string;
  role: "user" | "model";
  content: string;
  createdAt: string;
}

export interface MemorySummary {
  title: string;
  summary: string;
  themes: string[];
  nextSteps: string[];
}

export interface JournalEntry {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  location?: string;
  weather?: JournalWeather;
  photos: JournalPhoto[];
  tags: string[];
  mood?: JournalMood;
  folder: "Journal" | "Notes" | "Travel" | "Work" | "Trash";
  messages: JournalMessage[];
  memorySummary?: MemorySummary;
  isFavorite?: boolean;
  isPinned?: boolean;
  wordCount?: number;
}

export const INITIAL_MOCK_ENTRIES: JournalEntry[] = [
  {
    id: "entry-1",
    title: "Loomings",
    createdAt: "2025-04-02T12:23:00-04:00",
    updatedAt: "2025-04-02T13:45:00-04:00",
    location: "Battery Park, Manhattan, NY",
    weather: {
      temp: "58°F",
      condition: "Crisp Breeze",
      icon: "wind",
    },
    photos: [
      {
        id: "photo-1",
        url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1200&q=80",
        caption: "Waves breaking against the Manhattan shoreline",
      },
    ],
    tags: ["Literature", "Ocean", "Reflections"],
    mood: {
      label: "Philosophical",
      emoji: "🌊",
    },
    folder: "Journal",
    isPinned: true,
    body: `Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation.

Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off—then, I account it high time to get to sea as soon as I can.

This is my substitute for pistol and ball. With a philosophical flourish Cato throws himself upon his sword; I quietly take to the ship. There is nothing surprising in this. If they but knew it, almost all men in their degree, some time or other, cherish very nearly the same feelings towards the ocean with me.

There now is your insular city of the Manhattoes, belted round by wharves as Indian isles by coral reefs—commerce surrounds it with her surf. Right and left, the streets take you waterward. Its extreme downtown is the battery, where that noble mole is washed by waves, and cooled by breezes, which a few hours previous were out of sight of land. Look at the crowds of water-gazers there.`,
    messages: [
      {
        id: "msg-1",
        role: "user",
        content:
          "I felt that deep pull towards the water today. When the noise of the city and routine builds up, stepping out toward the pier resets something primal.",
        createdAt: "2025-04-02T12:25:00-04:00",
      },
      {
        id: "msg-2",
        role: "model",
        content:
          "There is an enduring human instinct in using vast natural horizons as an antidote to claustrophobia and mental fatigue. Ishmael called it 'driving off the spleen'. You are tapping into a timeless practice: calibrating internal perspective against the unhurried scale of the sea.",
        createdAt: "2025-04-02T12:26:15-04:00",
      },
      {
        id: "msg-3",
        role: "user",
        content: "What question should I sit with during my walk along the battery?",
        createdAt: "2025-04-02T12:30:00-04:00",
      },
      {
        id: "msg-4",
        role: "model",
        content:
          "Sit with this: 'What artificial urgency on land am I carrying that dissolves the moment I look at the horizon?' Allow the wind to strip away what isn't essential.",
        createdAt: "2025-04-02T12:31:00-04:00",
      },
    ],
    memorySummary: {
      title: "Solitude & Oceanic Reset",
      summary:
        "The author reflects on the cyclical need to escape urban density and psychological friction by seeking the openness of the water, drawing deep parallels with classical contemplative literature.",
      themes: ["Horizon Perspective", "Urban Decompression", "Contemplative Walking"],
      nextSteps: [
        "Incorporate a 20-minute horizon or nature pause twice a week",
        "Notice physical tension triggers before they require drastic resets",
      ],
    },
  },
  {
    id: "entry-2",
    title: "I am so tired of whales",
    createdAt: "2025-04-03T09:24:00-07:00",
    updatedAt: "2025-04-03T10:15:00-07:00",
    location: "2057 Ottawa Beach Rd, Holland, MI",
    weather: {
      temp: "62°F",
      condition: "Partly Cloudy",
      icon: "cloud-sun",
    },
    photos: [
      {
        id: "photo-2",
        url: "https://images.unsplash.com/photo-1568430462989-44163eb1752f?auto=format&fit=crop&w=1200&q=80",
        caption: "Humpback breach off the northern strait",
      },
    ],
    tags: ["Nature", "Humor", "Coastal"],
    mood: {
      label: "Amused",
      emoji: "🐋",
    },
    folder: "Journal",
    body: `We went out on the boat early this morning expecting silence and cold spray. Instead, every tourist vessel within twenty nautical miles was converging on the same three pods. 

Don't get me wrong: an eight-ton creature leaping clean out of the water against the morning sun is majestic. But after the fourteenth breach and five consecutive hours of megaphone narration about blubber thickness, I found myself just staring at the ripples on the hull.

Sometimes the spectacle crowds out the actual presence. I enjoyed the warm coffee in my thermos more than the grand spectacle.`,
    messages: [
      {
        id: "msg-201",
        role: "user",
        content: "Why do we sometimes get overwhelmed even by things that are objectively wondrous?",
        createdAt: "2025-04-03T09:30:00-07:00",
      },
      {
        id: "msg-202",
        role: "model",
        content:
          "Awe can be commodified and over-stimulated. When an experience is performed or forced through narration and crowd excitement, the quiet intimacy required for genuine wonder disappears. Valuing the simple coffee on the boat was your mind choosing authenticity over forced spectacle.",
        createdAt: "2025-04-03T09:31:20-07:00",
      },
    ],
    memorySummary: {
      title: "Spectacle Fatigue & Subtle Presence",
      summary:
        "An honest examination of how forced grandeur can numb genuine appreciation, concluding with finding grounding in simple physical comforts.",
      themes: ["Authenticity over Spectacle", "Sensory Rest", "Everyday Grounding"],
      nextSteps: [
        "Seek unstructured quiet spaces rather than curated tourist excursions",
      ],
    },
  },
  {
    id: "entry-3",
    title: "i miss my cat",
    createdAt: "2025-04-01T09:29:00-07:00",
    updatedAt: "2025-04-01T09:45:00-07:00",
    location: "8638 NE Adlin Way, Seattle, WA",
    weather: {
      temp: "51°F",
      condition: "Light Rain",
      icon: "rain",
    },
    photos: [
      {
        id: "photo-3",
        url: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1200&q=80",
        caption: "Barnaby fitting perfectly into a small cardboard delivery box",
      },
    ],
    tags: ["Home", "Pets", "Cozy"],
    mood: {
      label: "Affectionate",
      emoji: "🐱",
    },
    folder: "Journal",
    body: `Looking at old photos while waiting for the morning train. Barnaby used to ignore the $60 plush orthopedic bed and instead squeeze himself into a shoebox half his volume.

He would sit there with his chin resting on the cardboard edge, purring like a gentle engine while rain drummed against the window pane.

Small companions teach us about contentment with minimal conditions. A dry box, a warm beam of sunlight, and someone who returns home reliably.`,
    messages: [
      {
        id: "msg-301",
        role: "user",
        content: "What is it about simple domestic routines that anchors us so deeply?",
        createdAt: "2025-04-01T09:35:00-07:00",
      },
      {
        id: "msg-302",
        role: "model",
        content:
          "Animals exist purely in the present tense. Their contentment is unconditional and unburdened by past regrets or future anxieties. When we witness that simple satisfaction, it creates an immediate emotional sanctuary within us.",
        createdAt: "2025-04-01T09:36:30-07:00",
      },
    ],
    memorySummary: {
      title: "Domestic Simplicity & Unconditional Contentment",
      summary:
        "Reflecting on pet companionship as a lens for contentment with simple circumstances and present-moment ease.",
      themes: ["Present-Moment Awareness", "Domestic Warmth", "Gratitude"],
      nextSteps: [
        "Create space for simple quiet rituals at home without digital interruption",
      ],
    },
  },
  {
    id: "entry-4",
    title: "Extracts & Meditations",
    createdAt: "2025-03-31T09:31:00-07:00",
    updatedAt: "2025-03-31T11:00:00-07:00",
    location: "San Francisco Public Library, CA",
    weather: {
      temp: "60°F",
      condition: "Sunny",
      icon: "sun",
    },
    photos: [],
    tags: ["Reading", "Philosophy", "Deep Work"],
    mood: {
      label: "Focused",
      emoji: "📖",
    },
    folder: "Journal",
    body: `“And God created great whales.” — Genesis.

“Leviathan maketh a path to shine after him; One would think the deep to be hoary.” — Job.

“The sovereignest thing on earth is parmacetti for an inward bruise.” — King Henry.

Collected these passages this morning under the high atrium light. Reading slowly across centuries reveals how human beings keep using the same metaphors to describe the sublime and the uncontainable. We build languages to map things that will forever exceed our maps.`,
    messages: [],
    memorySummary: undefined,
  },
  {
    id: "entry-5",
    title: "Sense of Gratitude",
    createdAt: "2025-01-24T08:15:00-05:00",
    updatedAt: "2025-01-24T09:20:00-05:00",
    location: "Highland Park, Austin, TX",
    weather: {
      temp: "65°F",
      condition: "Morning Golden Hour",
      icon: "sun",
    },
    photos: [
      {
        id: "photo-5",
        url: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=1200&q=80",
        caption: "Morning walk with coconut at sunrise",
      },
    ],
    tags: ["Gratitude", "Morning Routine", "Wellness"],
    mood: {
      label: "Grateful",
      emoji: "✨",
    },
    folder: "Journal",
    body: `Today, I feel a deep sense of gratitude. Life hasn't been perfect, but as I reflect, I see so many things to be thankful for. I'm grateful for my health, for being able to wake up and breathe easily. I'm grateful for my family, who support me in ways I sometimes take for granted.

Small things stood out today—like the way the morning sun warmed my face or how a stranger's smile made me feel seen in the chaos. There's beauty everywhere if we take a second to look.

Gratitude does not erase life's struggles, but it reframes them, allowing us to navigate challenges with a lighter heart and clearer vision.`,
    messages: [
      {
        id: "msg-501",
        role: "user",
        content: "How can I maintain this gratitude even on chaotic high-stress days?",
        createdAt: "2025-01-24T08:20:00-05:00",
      },
      {
        id: "msg-502",
        role: "model",
        content:
          "Micro-gratitudes work best when chaos strikes. Don't seek profound cosmic gratitude; anchor in physical sensations: the warmth of a mug, a steady breath, a quiet corner. Those micro-moments interrupt the stress feedback loop immediately.",
        createdAt: "2025-01-24T08:21:45-05:00",
      },
    ],
    memorySummary: {
      title: "Perspective Reframing Through Gratitude",
      summary:
        "A grounded gratitude practice focusing on physical micro-blessings and interpersonal support as stabilizing foundations for high-demand days.",
      themes: ["Micro-Gratitude", "Somatic Grounding", "Emotional Resilience"],
      nextSteps: [
        "Note three micro-blessings before opening work communications in the morning",
      ],
    },
  },
];
